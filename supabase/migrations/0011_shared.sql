-- 공통 기반: 개인정보 암호화, 조회용 뷰, 설정값, 사용내역 기록 (2026-10-07)

-- ===== 1. 암호화 (주민번호·계좌번호) =====
-- 키는 API로 노출되지 않는 private 스키마에 둔다(마이그레이션 때 무작위 생성). 평문은 저장하지 않는다.
create schema if not exists private;
revoke all on schema private from public;
create table if not exists private.app_key (id int primary key default 1 check (id = 1), k text not null);
insert into private.app_key (k) values (encode(gen_random_bytes(32), 'hex')) on conflict do nothing;

create or replace function public.enc(p text) returns bytea
language sql stable security definer set search_path = public, private, extensions as $$
  select case when p is null or p = '' then null
              when not public.is_finance() then null
              else pgp_sym_encrypt(p, (select k from private.app_key)) end
$$;
-- 복호화는 재정부원만. 화면에는 가급적 mask()를 쓴다.
create or replace function public.dec(b bytea) returns text
language sql stable security definer set search_path = public, private, extensions as $$
  select case when b is null or not public.is_finance() then null
              else pgp_sym_decrypt(b, (select k from private.app_key)) end
$$;
-- 뒤 4자리만 보이게: 900101-1234567 → 900101-1******, 계좌 → ****-**-1234
create or replace function public.mask(b bytea, kind text default 'rrn') returns text
language sql stable security definer set search_path = public as $$
  select case when b is null then null
              when kind = 'rrn' then regexp_replace(public.dec(b), '^(\d{6})-?(\d)\d{6}$', '\1-\2******')
              else regexp_replace(public.dec(b), '\d(?=[\d-]{4})', '*', 'g') end
$$;
revoke execute on function public.enc(text) from public, anon;
revoke execute on function public.dec(bytea) from public, anon;
revoke execute on function public.mask(bytea, text) from public, anon;

-- ===== 2. 조회용 뷰 (호출자 권한 = RLS 적용) =====
create or replace view public.v_income with (security_invoker = true) as
select i.id, w.sunday, w.year, extract(month from w.sunday)::int as month, w.closed,
       i.offering_type_id, ot.name as offering_type, ot.sort_order as type_order,
       f.kind::text as fund_kind, f.name as fund_name,
       i.member_id, m.name || coalesce(m.name_suffix, '') as member_name, m.household_id,
       i.payer_label, i.channel::text as channel, i.amount, i.memo, i.bank_tx_id
from income i
join week w on w.id = i.week_id
join offering_type ot on ot.id = i.offering_type_id
left join fund f on f.id = ot.fund_id
left join member m on m.id = i.member_id;

create or replace view public.v_expense with (security_invoker = true) as
select e.id, w.sunday, w.year, extract(month from w.sunday)::int as month, w.closed,
       d.id as department_id, d.name as department, d.sort_order as dept_order,
       ei.id as expense_item_id, ei.name as item, ei.sort_order as item_order,
       f.kind::text as fund_kind, f.name as fund_name,
       e.content, e.amount, e.fee, e.requester_label, e.memo, e.source, e.method,
       e.payee_id, e.bank_tx_id, rf.drive_file_id
from expense e
join week w on w.id = e.week_id
join expense_item ei on ei.id = e.expense_item_id
left join department d on d.id = ei.department_id
left join fund f on f.id = ei.fund_id
left join receipt_file rf on rf.id = e.receipt_file_id;

-- ===== 3. 설정값 (결재란 직함 등, 키-값) =====
create table if not exists app_setting (
  key text primary key,
  value jsonb not null,
  updated_by uuid default auth.uid(), updated_at timestamptz default now()
);
alter table app_setting enable row level security;
create policy app_setting_finance on app_setting for all using (public.is_finance()) with check (public.is_finance());
insert into app_setting (key, value) values
  ('approval_titles', '["담당", "기장회계", "출납회계", "재정부장"]'::jsonb) -- [확인 필요] 결재란 직함
on conflict (key) do nothing;

-- ===== 4. 사용내역: 화면 접속·출력 등 =====
create or replace function public.log_event(p_action text, p_target text default null) returns void
language sql security definer set search_path = public as $$
  insert into audit_log (user_id, action, target_table, target_id)
  select auth.uid(), left(p_action, 40), 'ui', left(p_target, 200)
  where public.my_role() is not null
$$;
revoke execute on function public.log_event(text, text) from public, anon;
