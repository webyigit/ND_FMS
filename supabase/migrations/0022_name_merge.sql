-- 이름합치기: 오기입으로 따로 등록된 같은 사람(예: 홍길동 ↔ 홍길돈)을 대표 교인 하나로 합친다.
-- 수입 원본(income.member_id)은 바꾸지 않는다. member.merged_into 로 대표를 가리키고, 조회 뷰가 대표로 풀어서 합산한다.
-- 되돌리면 merged_into 만 지우면 원래대로 따로 계산된다. 가족 합치기(다른 사람끼리 household)와 다르다.

-- ===== 1. 합친 상태·기록 =====
alter table member add column if not exists merged_into bigint references member(id);
create index if not exists member_merged_into on member (merged_into);

create table if not exists name_merge (
  id bigserial primary key,
  member_id bigint not null references member(id),   -- 합쳐진(오기입) 교인
  into_id bigint not null references member(id),     -- 대표 교인
  prev_active boolean not null,
  prev_household_id bigint,                           -- 되돌릴 때 같은 가족이 남아 있으면 다시 넣는다
  prev_is_head boolean not null default false,
  merged_by uuid default auth.uid(), merged_at timestamptz not null default now(),
  undone_by uuid, undone_at timestamptz
);
create index if not exists name_merge_open on name_merge (member_id) where undone_at is null;

-- 자동 후보에서 "다른 사람이에요"로 뺀 쌍 (a < b)
create table if not exists member_not_same (
  a bigint not null references member(id) on delete cascade,
  b bigint not null references member(id) on delete cascade,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  primary key (a, b), check (a < b)
);

alter table name_merge enable row level security;
alter table member_not_same enable row level security;
create policy name_merge_finance on name_merge for all using (public.is_finance()) with check (public.is_finance());
create policy member_not_same_finance on member_not_same for all using (public.is_finance()) with check (public.is_finance());
-- 사용내역: 합치기·되돌리기·후보 제외를 남긴다(교인 변경은 member_audit 가 따로 남긴다)
create trigger name_merge_audit after insert or update on name_merge for each row execute function public.write_audit_safe();
create trigger member_not_same_audit after insert or delete on member_not_same for each row execute function public.write_audit_safe();

-- ===== 2. 조회 뷰: 합쳐진 교인의 헌금은 대표 교인으로 =====
-- v_income: member_id·이름·가족은 대표 기준, 원래 연결은 raw_member_id 로 남긴다
create or replace view public.v_income with (security_invoker = true) as
select i.id, w.sunday, w.year, extract(month from w.sunday)::int as month, w.closed,
       i.offering_type_id, ot.name as offering_type, ot.sort_order as type_order,
       f.kind::text as fund_kind, f.name as fund_name,
       m.id as member_id, m.name || coalesce(m.name_suffix, '') as member_name, m.household_id,
       i.payer_label, i.channel::text as channel, i.amount, i.memo, i.bank_tx_id,
       i.member_id as raw_member_id
from income i
join week w on w.id = i.week_id
join offering_type ot on ot.id = i.offering_type_id
left join fund f on f.id = ot.fund_id
left join member m0 on m0.id = i.member_id
left join member m on m.id = coalesce(m0.merged_into, i.member_id);

create or replace view public.v_income_person with (security_invoker = true) as
select w.year, extract(month from w.sunday)::int as month,
       m.id as member_id, m.name || coalesce(m.name_suffix, '') as member_name, m.household_id, h.label as household_label,
       case when i.member_id is null then trim(i.payer_label) end as payer_label,
       i.offering_type_id, ot.name as offering_type, ot.sort_order as type_order, f.kind::text as fund_kind,
       sum(i.amount)::bigint as amount, count(*)::int as n
from income i
join week w on w.id = i.week_id
join offering_type ot on ot.id = i.offering_type_id
left join fund f on f.id = ot.fund_id
left join member m0 on m0.id = i.member_id
left join member m on m.id = coalesce(m0.merged_into, i.member_id)
left join household h on h.id = m.household_id
where not coalesce(ot.total_only, false)
  and (i.member_id is not null or coalesce(trim(i.payer_label), '') not in ('', '(총액)'))
group by w.year, extract(month from w.sunday), m.id, m.name, m.name_suffix, m.household_id, h.label,
         case when i.member_id is null then trim(i.payer_label) end,
         i.offering_type_id, ot.name, ot.sort_order, f.kind;

create or replace view public.v_member with (security_invoker = true) as
select m.id, m.name, m.name_suffix, m.name || coalesce(m.name_suffix, '') as full_name,
       m.title, m.display_rank, m.district, m.zone, m.service_dept, m.service_role,
       m.phone, m.address, m.is_group, m.is_anonymous, m.exclude_from_receipt, m.active,
       m.household_id, h.label as household_label, m.is_household_head,
       m.rrn_enc is not null as has_rrn, public.mask(m.rrn_enc, 'rrn') as rrn_mask, m.created_at,
       m.merged_into, t.name || coalesce(t.name_suffix, '') as merged_into_name
from member m
left join household h on h.id = m.household_id
left join member t on t.id = m.merged_into;

-- 이름합치기 후보 판단용: 교인별 헌금 건수·합계·처음/마지막 주일(원래 연결 기준, 전 기간)
create or replace view public.v_member_income_stat with (security_invoker = true) as
select i.member_id, count(*)::int as n, sum(i.amount)::bigint as total, min(w.sunday) as first_sunday, max(w.sunday) as last_sunday
from income i join week w on w.id = i.week_id
where i.member_id is not null
group by i.member_id;

-- 합친 기록(되돌리기 전)
create or replace view public.v_name_merge with (security_invoker = true) as
select g.id, g.member_id, s.name || coalesce(s.name_suffix, '') as member_name, s.title as member_title,
       g.into_id, t.name || coalesce(t.name_suffix, '') as into_name, g.merged_at, u.name as merged_by_name
from name_merge g
join member s on s.id = g.member_id
join member t on t.id = g.into_id
left join app_user u on u.id = g.merged_by
where g.undone_at is null;

-- 기부금영수증 발행 대상 찾기: 합쳐진 교인은 빼고 대표로만
create or replace function public.receipt_donor_search(p_q text)
returns table (member_id bigint, name text, title text, household_id bigint, household_label text,
               is_household_head boolean, address text, phone text, rrn_masked text, family text[])
language sql stable set search_path = public as $$
  select m.id, m.name || coalesce(m.name_suffix, ''), m.title, m.household_id, h.label,
         coalesce(m.is_household_head, false), m.address, m.phone, public.mask(m.rrn_enc),
         array(select f.name || coalesce(f.name_suffix, '') from member f
               where f.household_id = m.household_id and f.id <> m.id order by f.is_household_head desc, f.id)
  from member m left join household h on h.id = m.household_id
  where public.is_finance() and length(trim(p_q)) >= 1 and m.name like '%' || trim(p_q) || '%'
    and not coalesce(m.exclude_from_receipt, false) and m.merged_into is null
  order by m.name, m.id limit 30
$$;
revoke execute on function public.receipt_donor_search(text) from public, anon;

-- ===== 3. 합치기·되돌리기 =====
-- p_ids 를 p_into 로 합친다. 합쳐진 교인은 숨기고(active=false) 가족에서 뺀다. 그 교인에게 이미 합쳐져 있던 이름도 대표로 옮긴다.
create or replace function public.merge_members(p_into bigint, p_ids bigint[]) returns int
language plpgsql set search_path = public as $$
declare t member; s member; sid bigint; cnt int := 0;
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  select * into t from member where id = p_into for update;
  if not found then raise exception '대표 교인을 찾을 수 없습니다'; end if;
  if t.merged_into is not null then raise exception '대표(%)는 이미 다른 이름에 합쳐져 있어요', t.name || coalesce(t.name_suffix, ''); end if;
  foreach sid in array coalesce(p_ids, '{}') loop
    continue when sid = p_into;
    select * into s from member where id = sid for update;
    if not found then raise exception '교인을 찾을 수 없습니다 (%)', sid; end if;
    continue when s.merged_into = p_into;
    if s.merged_into is not null then raise exception '%은(는) 이미 다른 이름에 합쳐져 있어요. 먼저 되돌려 주세요', s.name || coalesce(s.name_suffix, ''); end if;
    -- 이 교인에게 합쳐져 있던 이름들도 새 대표로
    update member set merged_into = p_into where merged_into = sid;
    update name_merge set into_id = p_into where into_id = sid and undone_at is null;
    insert into name_merge (member_id, into_id, prev_active, prev_household_id, prev_is_head)
    values (sid, p_into, coalesce(s.active, true), s.household_id, coalesce(s.is_household_head, false));
    update member set merged_into = p_into, active = false, household_id = null, is_household_head = false where id = sid;
    if s.household_id is not null and not exists (select 1 from member where household_id = s.household_id) then
      delete from household where id = s.household_id;
    end if;
    cnt := cnt + 1;
  end loop;
  return cnt;
end $$;

-- 되돌리기: 따로 계산되던 원래 상태로. 예전 가족이 남아 있으면 다시 넣는다(세대주는 비어 있을 때만).
create or replace function public.unmerge_member(p_member bigint) returns void
language plpgsql set search_path = public as $$
declare g name_merge; hid bigint;
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  select * into g from name_merge where member_id = p_member and undone_at is null order by id desc limit 1 for update;
  if not found then raise exception '합친 기록이 없습니다'; end if;
  hid := g.prev_household_id;
  if hid is not null and not exists (select 1 from household where id = hid) then hid := null; end if;
  update member set merged_into = null, active = g.prev_active, household_id = hid,
         is_household_head = hid is not null and g.prev_is_head
                             and not exists (select 1 from member x where x.household_id = hid and x.is_household_head)
  where id = p_member;
  update name_merge set undone_at = now(), undone_by = auth.uid() where id = g.id;
end $$;

-- 자동 후보에서 빼기("다른 사람이에요") / 다시 보이기
create or replace function public.mark_not_same(p_a bigint, p_b bigint, p_on boolean default true) returns void
language plpgsql set search_path = public as $$
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  if p_a = p_b then raise exception '같은 교인입니다'; end if;
  if p_on then
    insert into member_not_same (a, b) values (least(p_a, p_b), greatest(p_a, p_b)) on conflict do nothing;
  else
    delete from member_not_same where a = least(p_a, p_b) and b = greatest(p_a, p_b);
  end if;
end $$;

revoke execute on function public.merge_members(bigint, bigint[]) from public, anon;
revoke execute on function public.unmerge_member(bigint) from public, anon;
revoke execute on function public.mark_not_same(bigint, bigint, boolean) from public, anon;
