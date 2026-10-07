-- 로그인·가입 승인·권한(RLS)·주간 저장 함수 (2026-10-07)
-- 원칙: 승인된 재정부원(admin·treasurer)만 재정 데이터를 읽고 쓴다. 가입 직후는 pending.

-- ===== 1. 가입 → app_user 자동 생성 =====
-- 첫 가입자는 관리자(승인 완료)로, 이후 가입자는 승인 대기로 만든다.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  perform pg_advisory_xact_lock(hashtext('app_user_bootstrap'));
  select not exists (select 1 from app_user) into first_user;
  insert into app_user (id, name, phone, status, role, approved_at)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), nullif(new.raw_user_meta_data->>'full_name', ''),
             nullif(new.raw_user_meta_data->>'nickname', ''), split_part(coalesce(new.email, ''), '@', 1), '이름없음'),
    nullif(new.raw_user_meta_data->>'phone', ''),
    case when first_user then 'approved'::user_status else 'pending'::user_status end,
    case when first_user then 'admin'::user_role else 'viewer'::user_role end,
    case when first_user then now() end
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== 2. 권한 확인 함수 (RLS 재귀 방지용 security definer) =====
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role::text from app_user where id = auth.uid() and status = 'approved'
$$;
create or replace function public.is_finance() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin','treasurer'), false)
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

-- ===== 3. 회원(app_user): 본인은 자기 것만 읽기, 관리자는 승인·권한·차단 =====
alter table app_user enable row level security;
create policy app_user_self_read on app_user for select using (id = auth.uid() or public.is_admin());
create policy app_user_admin_update on app_user for update using (public.is_admin()) with check (public.is_admin());
-- 관리자가 자기 자신을 강등·차단해 관리자가 0명이 되는 것을 막는다
create or replace function public.keep_one_admin() returns trigger language plpgsql as $$
begin
  if old.role = 'admin' and old.status = 'approved' and (new.role <> 'admin' or new.status <> 'approved')
     and not exists (select 1 from app_user where id <> old.id and role = 'admin' and status = 'approved') then
    raise exception '관리자가 최소 1명은 있어야 합니다';
  end if;
  if new.status = 'approved' and old.status <> 'approved' then
    new.approved_by := auth.uid(); new.approved_at := now();
  end if;
  return new;
end $$;
create trigger app_user_keep_admin before update on app_user for each row execute function public.keep_one_admin();
alter table social_identity enable row level security;
create policy social_identity_self on social_identity for select using (user_id = auth.uid() or public.is_admin());

-- ===== 4. 재정 데이터: 재정부원만 =====
do $$
declare t text;
begin
  foreach t in array array[
    'household','member','member_alias','officer_roster',
    'fund','offering_type','department','expense_item','budget','carryover',
    'week','income','bank_account','payee','bank_import','bank_tx',
    'expense','fixed_expense','receipt_file','fund_transfer','loan','reconciliation',
    'church_info','receipt_form','donation_receipt','donation_receipt_source',
    'clergy_title','user_department','budget_request','expense_request'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all using (public.is_finance()) with check (public.is_finance())', t || '_finance', t);
  end loop;
end $$;
-- 부서장: 자기 부서 신청만 (화면은 다음 단계)
create policy budget_request_dept_head on budget_request for all
  using (requested_by = auth.uid()) with check (requested_by = auth.uid() and public.my_role() = 'dept_head');
create policy expense_request_dept_head on expense_request for all
  using (requested_by = auth.uid()) with check (requested_by = auth.uid() and public.my_role() in ('dept_head','pastor'));
-- 공지: 재정부원이 쓰고, 승인된 회원은 모두 읽는다(공개 읽기 정책은 0006)
create policy notice_finance on notice for all using (public.is_finance()) with check (public.is_finance());
create policy notice_members_read on notice for select using (public.my_role() is not null);
-- 사용내역: 기록은 트리거로만, 조회는 관리자
alter table audit_log enable row level security;
create policy audit_log_admin_read on audit_log for select using (public.is_admin());
-- 뷰는 호출자 권한으로 (급여 정보)
alter view clergy_pay_monthly set (security_invoker = true);
-- 공개 신청 테이블은 서비스 키 전용 유지(0002)

-- ===== 5. 증빙 연결: 지출·영수증 파일 FK, 출처·청구자 원문 =====
alter table expense add constraint expense_receipt_file_fk foreign key (receipt_file_id) references receipt_file(id);
alter table expense add column if not exists source text;          -- 직접/고정/은행/증빙/엑셀
alter table expense add column if not exists requester_label text; -- 청구자 원문(교인 미등록 포함)
alter table expense add column if not exists sort_order int;
alter table income add column if not exists sort_order int;

-- ===== 6. 사용내역 기록 (수입·지출 입력/수정/삭제) =====
create or replace function public.write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (user_id, action, target_table, target_id, before, after)
  values (auth.uid(), lower(tg_op), tg_table_name,
          coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', ''),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;
create trigger income_audit after insert or update or delete on income for each row execute function public.write_audit();
create trigger expense_audit after insert or update or delete on expense for each row execute function public.write_audit();
create trigger app_user_audit after update on app_user for each row execute function public.write_audit();

-- ===== 7. 주 단위 저장 (한 주를 통째로 교체, 트랜잭션 1회) =====
create or replace function public.week_for(p_sunday date) returns int
language plpgsql as $$
declare w week;
begin
  if extract(dow from p_sunday) <> 0 then raise exception '주일 날짜가 아닙니다: %', p_sunday; end if;
  insert into week (sunday) values (p_sunday) on conflict (sunday) do nothing;
  select * into w from week where sunday = p_sunday;
  if w.closed then raise exception '마감된 주입니다: %', p_sunday; end if;
  return w.id;
end $$;

-- rows: [{offering_type_id, member_id, payer_label, channel, amount, memo}]
-- 은행거래에서 들어온 행(bank_tx_id 있음)은 건드리지 않는다.
create or replace function public.save_week_income(p_sunday date, p_rows jsonb) returns int
language plpgsql as $$
declare wid int; n int;
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  wid := public.week_for(p_sunday);
  delete from income where week_id = wid and bank_tx_id is null;
  insert into income (week_id, offering_type_id, member_id, payer_label, channel, amount, memo, sort_order, created_by)
  select wid, (r->>'offering_type_id')::int, nullif(r->>'member_id', '')::bigint, r->>'payer_label',
         coalesce(r->>'channel', 'cash')::pay_channel, (r->>'amount')::bigint, nullif(r->>'memo', ''),
         ord::int, auth.uid()
  from jsonb_array_elements(p_rows) with ordinality as x(r, ord);
  get diagnostics n = row_count;
  return n;
end $$;

-- rows: [{dept, item, content, amount, requester, memo, source, drive_file_id}]
create or replace function public.save_week_expense(p_sunday date, p_rows jsonb) returns int
language plpgsql as $$
declare wid int; n int; bad text;
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  select string_agg(format('%s행(%s/%s)', ord, r->>'dept', r->>'item'), ', ') into bad
  from jsonb_array_elements(p_rows) with ordinality as x(r, ord)
  where not exists (select 1 from expense_item ei join department d on d.id = ei.department_id
                    where d.name = r->>'dept' and ei.name = r->>'item');
  if bad is not null then raise exception '부서·항목을 찾을 수 없습니다: %', bad; end if;

  wid := public.week_for(p_sunday);
  insert into receipt_file (drive_file_id)
  select distinct r->>'drive_file_id' from jsonb_array_elements(p_rows) r
  where coalesce(r->>'drive_file_id', '') <> ''
  on conflict (drive_file_id) do nothing;

  delete from expense where week_id = wid and bank_tx_id is null;
  insert into expense (week_id, expense_item_id, content, amount, requester_member_id, requester_label,
                       memo, source, receipt_file_id, sort_order, created_by)
  select wid, ei.id, coalesce(nullif(r->>'content', ''), ei.name), (r->>'amount')::bigint,
         (select m.id from member m where m.name = r->>'requester' and m.active order by m.id limit 1),
         nullif(r->>'requester', ''), nullif(r->>'memo', ''), r->>'source',
         (select rf.id from receipt_file rf where rf.drive_file_id = r->>'drive_file_id'),
         ord::int, auth.uid()
  from jsonb_array_elements(p_rows) with ordinality as x(r, ord)
  join department d on d.name = r->>'dept'
  join expense_item ei on ei.department_id = d.id and ei.name = r->>'item';
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.save_week_income(date, jsonb) from public, anon;
revoke execute on function public.save_week_expense(date, jsonb) from public, anon;
