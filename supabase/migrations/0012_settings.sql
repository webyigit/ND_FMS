-- 설정: 교인명단·가족·별칭, 헌금구분, 재직명단, 은행계좌·송금계좌, 사용내역 (2026-10-07)
-- 원칙: 재정부원(admin·treasurer)만 읽고 쓴다(0009 RLS). 주민번호·계좌번호는 enc()로만 저장, 화면엔 mask().

-- ===== 1. 컬럼·제약·인덱스 =====
alter table bank_account add column if not exists active boolean not null default true;
alter table bank_account add column if not exists memo text;
alter table bank_account add constraint bank_account_kind_check check (kind is null or kind in ('일반','대출','외화','적금'));
create unique index if not exists bank_account_one_primary on bank_account (is_primary) where is_primary;
alter table payee add column if not exists active boolean not null default true;
create index if not exists payee_name_idx on payee (name);
create index if not exists payee_member_idx on payee (member_id);

create index if not exists member_household_idx on member (household_id);
create unique index if not exists member_one_head on member (household_id) where is_household_head;
create index if not exists member_alias_member_idx on member_alias (member_id);
create unique index if not exists member_alias_uniq on member_alias (member_id, alias);
create index if not exists member_alias_alias_idx on member_alias (alias);
create index if not exists officer_roster_member_idx on officer_roster (member_id);

create index if not exists audit_log_at_idx on audit_log (at desc);
create index if not exists audit_log_user_idx on audit_log (user_id, at desc);
create index if not exists audit_log_table_idx on audit_log (target_table, at desc);

-- 헌금구분 상위는 한 단계만(감사헌금 > 범사/기타/일천번제)
create or replace function public.offering_type_parent_check() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then raise exception '자기 자신을 상위 구분으로 둘 수 없습니다'; end if;
    if exists (select 1 from offering_type where id = new.parent_id and parent_id is not null) then
      raise exception '상위 구분은 한 단계만 둘 수 있습니다';
    end if;
    if tg_op = 'UPDATE' and exists (select 1 from offering_type where parent_id = new.id) then
      raise exception '하위 구분이 있는 구분은 다른 구분 아래로 넣을 수 없습니다';
    end if;
  end if;
  if new.amount_unit is null or new.amount_unit not in (1, 1000, 10000) then
    raise exception '입력 단위는 1·1000·10000 중 하나입니다';
  end if;
  return new;
end $$;
create trigger offering_type_parent_check before insert or update on offering_type
  for each row execute function public.offering_type_parent_check();
revoke execute on function public.offering_type_parent_check() from public, anon, authenticated;

-- ===== 2. 사용내역: 설정 테이블 변경 기록 (암호문 컬럼은 남기지 않는다) =====
create or replace function public.write_audit_safe() returns trigger
language plpgsql security definer set search_path = public as $$
declare ob jsonb; nb jsonb; b jsonb; a jsonb; k text;
begin
  ob := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  nb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  b := ob; a := nb;
  for k in select key from jsonb_each(coalesce(nb, ob)) where key like '%\_enc' loop
    -- 암호문 대신 '있음/새로 입력됨' 표시만 남긴다
    if b is not null then b := jsonb_set(b, array[k], case when ob->>k is null then 'null'::jsonb else '"(암호화됨)"'::jsonb end); end if;
    if a is not null then
      a := jsonb_set(a, array[k], case when nb->>k is null then 'null'::jsonb
                                       when ob is not null and ob->k is distinct from nb->k then '"(새로 입력됨)"'::jsonb
                                       else '"(암호화됨)"'::jsonb end);
    end if;
  end loop;
  insert into audit_log (user_id, action, target_table, target_id, before, after)
  values (auth.uid(), lower(tg_op), tg_table_name,
          coalesce(coalesce(a, b)->>'id', (coalesce(a, b)->>'year') || '/' || (coalesce(a, b)->>'member_id'), ''),
          b, a);
  return null;
end $$;
revoke execute on function public.write_audit_safe() from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['member','household','member_alias','officer_roster','offering_type','bank_account','payee'] loop
    execute format('create trigger %I after insert or update or delete on %I for each row execute function public.write_audit_safe()', t || '_audit', t);
  end loop;
end $$;

-- ===== 3. 조회용 뷰 (호출자 권한 = RLS 적용, 암호문 대신 마스킹) =====
create or replace view public.v_member with (security_invoker = true) as
select m.id, m.name, m.name_suffix, m.name || coalesce(m.name_suffix, '') as full_name,
       m.title, m.display_rank, m.district, m.zone, m.service_dept, m.service_role,
       m.phone, m.address, m.is_group, m.is_anonymous, m.exclude_from_receipt, m.active,
       m.household_id, h.label as household_label, m.is_household_head,
       m.rrn_enc is not null as has_rrn, public.mask(m.rrn_enc, 'rrn') as rrn_mask, m.created_at
from member m
left join household h on h.id = m.household_id;

create or replace view public.v_bank_account with (security_invoker = true) as
select id, bank, holder, kind, is_primary, active, memo,
       account_no_enc is not null as has_account_no, public.mask(account_no_enc, 'account') as account_mask
from bank_account;

create or replace view public.v_payee with (security_invoker = true) as
select p.id, p.member_id, m.name || coalesce(m.name_suffix, '') as member_name,
       p.name, p.bank, p.holder, p.memo, p.active,
       p.account_no_enc is not null as has_account_no, public.mask(p.account_no_enc, 'account') as account_mask
from payee p
left join member m on m.id = p.member_id;

-- ===== 4. 암호화 저장 =====
-- 주민번호: 숫자 13자리만 받아 900101-1234567 형식으로 암호화. 빈 값이면 지운다.
create or replace function public.set_member_rrn(p_member_id bigint, p_rrn text) returns void
language plpgsql set search_path = public as $$
declare d text := regexp_replace(coalesce(p_rrn, ''), '\D', '', 'g');
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  if d <> '' and length(d) <> 13 then raise exception '주민번호 13자리를 확인해 주세요'; end if;
  update member set rrn_enc = case when d = '' then null else public.enc(substr(d, 1, 6) || '-' || substr(d, 7)) end
  where id = p_member_id;
  if not found then raise exception '교인을 찾을 수 없습니다'; end if;
end $$;

-- 계좌번호: 숫자·하이픈만 남겨 암호화. p_kind = bank_account | payee
create or replace function public.set_account_no(p_kind text, p_id bigint, p_no text) returns void
language plpgsql set search_path = public as $$
declare v text := regexp_replace(trim(coalesce(p_no, '')), '[^0-9-]', '', 'g');
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  if v <> '' and length(regexp_replace(v, '\D', '', 'g')) < 6 then raise exception '계좌번호를 확인해 주세요'; end if;
  if p_kind = 'bank_account' then
    update bank_account set account_no_enc = case when v = '' then null else public.enc(v) end where id = p_id;
  elsif p_kind = 'payee' then
    update payee set account_no_enc = case when v = '' then null else public.enc(v) end where id = p_id;
  else
    raise exception '알 수 없는 계좌 종류: %', p_kind;
  end if;
  if not found then raise exception '계좌를 찾을 수 없습니다'; end if;
end $$;

-- 계좌번호 전체 보기: 재정부원만, 본 기록을 남긴다
create or replace function public.reveal_account_no(p_kind text, p_id bigint) returns text
language plpgsql set search_path = public as $$
declare b bytea;
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  if p_kind = 'bank_account' then select account_no_enc into b from bank_account where id = p_id;
  elsif p_kind = 'payee' then select account_no_enc into b from payee where id = p_id;
  else raise exception '알 수 없는 계좌 종류: %', p_kind; end if;
  perform public.log_event('reveal', p_kind || ':' || p_id);
  return public.dec(b);
end $$;

-- ===== 5. 교인 저장·가족·일괄 등록 =====
-- p: {id?, name, name_suffix, title, district, zone, service_dept, service_role, phone, address,
--     display_rank, is_group, is_anonymous, exclude_from_receipt, active, rrn?, rrn_clear?}
-- rrn 은 새로 입력했을 때만 보낸다(비어 있으면 기존 값 유지).
create or replace function public.save_member(p jsonb) returns bigint
language plpgsql set search_path = public as $$
declare mid bigint := nullif(p->>'id', '')::bigint;
        nm text := trim(coalesce(p->>'name', ''));
        sfx text := nullif(upper(trim(coalesce(p->>'name_suffix', ''))), '');
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  if nm = '' then raise exception '이름을 입력해 주세요'; end if;
  if exists (select 1 from member where name = nm and coalesce(name_suffix, '') = coalesce(sfx, '')
             and active and id is distinct from mid) then
    raise exception '같은 이름(%)이 이미 있어요. 동명이인이면 접미사(A/B)를 넣어 주세요', nm || coalesce(sfx, '');
  end if;
  if mid is null then
    insert into member (name, name_suffix) values (nm, sfx) returning id into mid;
  end if;
  update member set
    name = nm, name_suffix = sfx,
    title = nullif(trim(p->>'title'), ''), district = nullif(trim(p->>'district'), ''), zone = nullif(trim(p->>'zone'), ''),
    service_dept = nullif(trim(p->>'service_dept'), ''), service_role = nullif(trim(p->>'service_role'), ''),
    phone = nullif(trim(p->>'phone'), ''), address = nullif(trim(p->>'address'), ''),
    display_rank = nullif(p->>'display_rank', '')::int,
    is_group = coalesce((p->>'is_group')::boolean, false),
    is_anonymous = coalesce((p->>'is_anonymous')::boolean, false),
    exclude_from_receipt = coalesce((p->>'exclude_from_receipt')::boolean, false),
    active = coalesce((p->>'active')::boolean, true)
  where id = mid;
  if not found then raise exception '교인을 찾을 수 없습니다'; end if;
  if coalesce(p->>'rrn', '') <> '' then perform public.set_member_rrn(mid, p->>'rrn');
  elsif coalesce((p->>'rrn_clear')::boolean, false) then update member set rrn_enc = null where id = mid;
  end if;
  return mid;
end $$;

-- 가족 묶기: p_member 를 p_with 의 가족에 넣는다. p_with 에 가족이 없으면 새로 만들고 p_with 를 세대주로(기본값 [확인 필요], 화면에서 바꿀 수 있음).
create or replace function public.join_family(p_member bigint, p_with bigint) returns bigint
language plpgsql set search_path = public as $$
declare hid bigint; old_hid bigint;
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  if p_member = p_with then raise exception '같은 교인입니다'; end if;
  select household_id into hid from member where id = p_with;
  if not found then raise exception '교인을 찾을 수 없습니다'; end if;
  if hid is null then
    insert into household (label) select name || coalesce(name_suffix, '') || ' 가정' from member where id = p_with returning id into hid;
    update member set household_id = hid, is_household_head = true where id = p_with;
  end if;
  select household_id into old_hid from member where id = p_member;
  if not found then raise exception '교인을 찾을 수 없습니다'; end if;
  update member set household_id = hid, is_household_head = false where id = p_member;
  if old_hid is not null and old_hid <> hid and not exists (select 1 from member where household_id = old_hid) then
    delete from household where id = old_hid;
  end if;
  return hid;
end $$;

-- 가족에서 빼기: 남은 가족이 없으면 가족 묶음을 지운다(세대주가 빠지면 다시 지정해야 한다)
create or replace function public.leave_family(p_member bigint) returns void
language plpgsql set search_path = public as $$
declare hid bigint;
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  select household_id into hid from member where id = p_member;
  update member set household_id = null, is_household_head = false where id = p_member;
  if hid is not null and not exists (select 1 from member where household_id = hid) then
    delete from household where id = hid;
  end if;
end $$;

-- 세대주(기부금영수증 발행 당사자) 지정: 가족 안에서 한 명
create or replace function public.set_household_head(p_member bigint) returns void
language plpgsql set search_path = public as $$
declare hid bigint;
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  select household_id into hid from member where id = p_member;
  if hid is null then raise exception '가족으로 묶인 교인만 세대주로 정할 수 있습니다'; end if;
  update member set is_household_head = false where household_id = hid and id <> p_member and is_household_head;
  update member set is_household_head = true where id = p_member;
end $$;

-- 엑셀 일괄 등록: rows [{name, name_suffix?, title, district, zone, phone}]. 같은 이름(+접미사)이 있으면 건너뛴다.
create or replace function public.import_members(p_rows jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare r jsonb; nm text; sfx text; added int := 0; skipped text[] := '{}';
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    nm := trim(coalesce(r->>'name', ''));
    sfx := nullif(upper(trim(coalesce(r->>'name_suffix', ''))), '');
    continue when nm = '';
    if exists (select 1 from member where name = nm and coalesce(name_suffix, '') = coalesce(sfx, '')) then
      skipped := skipped || (nm || coalesce(sfx, ''));
      continue;
    end if;
    insert into member (name, name_suffix, title, district, zone, phone)
    values (nm, sfx, nullif(trim(r->>'title'), ''), nullif(trim(r->>'district'), ''),
            nullif(trim(r->>'zone'), ''), nullif(trim(r->>'phone'), ''));
    added := added + 1;
  end loop;
  return jsonb_build_object('added', added, 'skipped', to_jsonb(skipped));
end $$;

-- ===== 6. 헌금구분: 순서 변경, 삭제(수입이 있으면 비활성) =====
create or replace function public.reorder_offering_types(p_ids int[]) returns void
language plpgsql set search_path = public as $$
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  update offering_type t set sort_order = x.ord
  from unnest(p_ids) with ordinality as x(id, ord) where t.id = x.id;
end $$;

create or replace function public.remove_offering_type(p_id int) returns text
language plpgsql set search_path = public as $$
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  if exists (select 1 from income where offering_type_id = p_id)
     or exists (select 1 from budget where offering_type_id = p_id)
     or exists (select 1 from bank_tx where suggested_offering_type_id = p_id)
     or exists (select 1 from offering_type where parent_id = p_id) then
    update offering_type set active = false where id = p_id;
    return 'deactivated';
  end if;
  delete from offering_type where id = p_id;
  if not found then raise exception '헌금구분을 찾을 수 없습니다'; end if;
  return 'deleted';
end $$;

-- ===== 7. 재직명단: 전년도 명단 복사 (이미 있는 교인은 그대로) =====
create or replace function public.copy_officer_roster(p_from int, p_to int) returns int
language plpgsql set search_path = public as $$
declare n int;
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  if p_from = p_to then raise exception '같은 연도입니다'; end if;
  insert into officer_roster (year, member_id, position)
  select p_to, r.member_id, r.position
  from officer_roster r join member m on m.id = r.member_id and m.active
  where r.year = p_from
  on conflict (year, member_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ===== 8. 은행계좌·송금계좌 저장 =====
-- p: {id?, bank, holder, kind, is_primary, active, memo, account_no?}
create or replace function public.save_bank_account(p jsonb) returns int
language plpgsql set search_path = public as $$
declare aid int := nullif(p->>'id', '')::int; prim boolean := coalesce((p->>'is_primary')::boolean, false);
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  if coalesce(trim(p->>'bank'), '') = '' then raise exception '은행을 입력해 주세요'; end if;
  if prim then update bank_account set is_primary = false where is_primary and id is distinct from aid; end if;
  if aid is null then insert into bank_account default values returning id into aid; end if;
  update bank_account set bank = trim(p->>'bank'), holder = nullif(trim(p->>'holder'), ''),
         kind = nullif(p->>'kind', ''), is_primary = prim, active = coalesce((p->>'active')::boolean, true),
         memo = nullif(trim(p->>'memo'), '')
  where id = aid;
  if not found then raise exception '계좌를 찾을 수 없습니다'; end if;
  if coalesce(p->>'account_no', '') <> '' then perform public.set_account_no('bank_account', aid, p->>'account_no'); end if;
  return aid;
end $$;

-- p: {id?, member_id?, name, bank, holder, memo, active, account_no?}
create or replace function public.save_payee(p jsonb) returns bigint
language plpgsql set search_path = public as $$
declare pid bigint := nullif(p->>'id', '')::bigint;
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  if coalesce(trim(p->>'name'), '') = '' then raise exception '이름을 입력해 주세요'; end if;
  if pid is null then insert into payee default values returning id into pid; end if;
  update payee set member_id = nullif(p->>'member_id', '')::bigint, name = trim(p->>'name'),
         bank = nullif(trim(p->>'bank'), ''), holder = nullif(trim(p->>'holder'), ''),
         memo = nullif(trim(p->>'memo'), ''), active = coalesce((p->>'active')::boolean, true)
  where id = pid;
  if not found then raise exception '송금 계좌를 찾을 수 없습니다'; end if;
  if coalesce(p->>'account_no', '') <> '' then perform public.set_account_no('payee', pid, p->>'account_no'); end if;
  return pid;
end $$;

-- 송금파일용: 이름(송금 이름·연결 교인·예금주)으로 사용 중인 송금 계좌 찾기, 계좌번호는 복호화해서 준다
create or replace function public.payee_accounts(p_names text[]) returns table (
  id bigint, name text, member_name text, bank text, holder text, account_no text)
language plpgsql set search_path = public as $$
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  return query
  select p.id, p.name, m.name || coalesce(m.name_suffix, ''), p.bank, p.holder, public.dec(p.account_no_enc)
  from payee p left join member m on m.id = p.member_id
  where p.active and p.account_no_enc is not null
    and exists (select 1 from unnest(p_names) n
                where replace(n, ' ', '') in (replace(p.name, ' ', ''), replace(coalesce(p.holder, ''), ' ', ''),
                                              m.name || coalesce(m.name_suffix, ''), m.name))
  order by p.id;
end $$;

revoke execute on function public.set_member_rrn(bigint, text) from public, anon;
revoke execute on function public.set_account_no(text, bigint, text) from public, anon;
revoke execute on function public.reveal_account_no(text, bigint) from public, anon;
revoke execute on function public.save_member(jsonb) from public, anon;
revoke execute on function public.join_family(bigint, bigint) from public, anon;
revoke execute on function public.leave_family(bigint) from public, anon;
revoke execute on function public.set_household_head(bigint) from public, anon;
revoke execute on function public.import_members(jsonb) from public, anon;
revoke execute on function public.reorder_offering_types(int[]) from public, anon;
revoke execute on function public.remove_offering_type(int) from public, anon;
revoke execute on function public.copy_officer_roster(int, int) from public, anon;
revoke execute on function public.save_bank_account(jsonb) from public, anon;
revoke execute on function public.save_payee(jsonb) from public, anon;
revoke execute on function public.payee_accounts(text[]) from public, anon;
