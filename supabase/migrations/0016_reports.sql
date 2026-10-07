-- 대시보드·해외선교·예결산·보고서 (2026-10-07)
-- 집계 뷰는 호출자 권한(security_invoker) = RLS 그대로. 쓰기는 RPC 함수(권한 확인 후 트랜잭션).

-- ===== 1. 해외선교 지출용 부서·항목 (별도 기금) =====
-- 수입은 헌금구분(해외선교·네팔선교, 별도 기금)으로 들어온다. 지출은 지출입력 화면에서 이 부서·항목으로 입력한다.
insert into fund (code, name, kind) values ('separate', '별도', 'separate') on conflict (code) do nothing;
insert into department (name, sort_order)
select '해외선교', 13 where not exists (select 1 from department where name = '해외선교');
insert into expense_item (department_id, name, fund_id, sort_order)
select d.id, v.item, (select id from fund where code = 'separate'), v.ord
from (values
  ('선교사 후원', 1),   -- [확인 필요] 항목 이름(원본 '해외선교' 시트 기준으로 확정)
  ('선교회 후원', 2),   -- [확인 필요]
  ('노회 선교', 3),     -- [확인 필요]
  ('네팔 구호', 4)      -- [확인 필요] 네팔(긴급)구호
) as v(item, ord)
join department d on d.name = '해외선교'
where not exists (select 1 from expense_item e where e.department_id = d.id and e.name = v.item);

-- ===== 2. 주 단위 집계 뷰 (화면은 이걸 읽는다. 1행 = 주일 × 헌금구분 / 주일 × 항목) =====
create or replace view public.v_income_week with (security_invoker = true) as
select w.sunday, w.year, extract(month from w.sunday)::int as month,
       ot.id as offering_type_id, ot.name as offering_type, ot.sort_order as type_order,
       coalesce(f.kind::text, 'general') as fund_kind,
       sum(i.amount)::bigint as amount, count(*)::int as cnt
from income i
join week w on w.id = i.week_id
join offering_type ot on ot.id = i.offering_type_id
left join fund f on f.id = ot.fund_id
group by w.sunday, w.year, ot.id, ot.name, ot.sort_order, f.kind;

create or replace view public.v_expense_week with (security_invoker = true) as
select w.sunday, w.year, extract(month from w.sunday)::int as month,
       d.id as department_id, d.name as department, d.sort_order as dept_order,
       ei.id as expense_item_id, ei.name as item, ei.sort_order as item_order,
       coalesce(f.kind::text, 'general') as fund_kind,
       sum(e.amount)::bigint as amount, sum(coalesce(e.fee, 0))::bigint as fee, count(*)::int as cnt
from expense e
join week w on w.id = e.week_id
join expense_item ei on ei.id = e.expense_item_id
left join department d on d.id = ei.department_id
left join fund f on f.id = ei.fund_id
group by w.sunday, w.year, d.id, d.name, d.sort_order, ei.id, ei.name, ei.sort_order, f.kind;

-- 송금 계좌(payee)별 이체 이력: 처음 이체·장기 미이체 알림용. 계좌번호는 가린 값만.
create or replace view public.v_payee_activity with (security_invoker = true) as
select p.id as payee_id, coalesce(p.name, p.holder, '이름없음') as payee_name, p.bank,
       public.mask(p.account_no_enc, 'account') as account_mask,
       min(w.sunday) as first_sunday, max(w.sunday) as last_sunday,
       count(*)::int as cnt, sum(e.amount)::bigint as total
from payee p
join expense e on e.payee_id = p.id
join week w on w.id = e.week_id
group by p.id, p.name, p.holder, p.bank, p.account_no_enc;

-- ===== 3. 기금별 결산: 이월금 + 수입 − 지출 ± 회계 간 대체 = 차기 이월 =====
-- 헌금구분·항목에 기금이 없으면 일반 기금으로 본다. 지출 수수료(fee)는 넣지 않는다 [확인 필요].
create or replace function public.fund_settlement(p_year int)
returns table (fund_id int, fund_code text, fund_name text, fund_kind text,
               carry bigint, income bigint, expense bigint, transfer_in bigint, transfer_out bigint, next_carry bigint)
language sql stable set search_path = public as $$
  with g as (select id from fund where code = 'general'),
  inc as (
    select coalesce(ot.fund_id, (select id from g)) as fid, sum(i.amount) as amt
    from income i join week w on w.id = i.week_id join offering_type ot on ot.id = i.offering_type_id
    where w.year = p_year group by 1),
  exp as (
    select coalesce(ei.fund_id, (select id from g)) as fid, sum(e.amount) as amt
    from expense e join week w on w.id = e.week_id join expense_item ei on ei.id = e.expense_item_id
    where w.year = p_year group by 1),
  tin as (select t.to_fund as fid, sum(t.amount) as amt from fund_transfer t join week w on w.id = t.week_id where w.year = p_year group by 1),
  tout as (select t.from_fund as fid, sum(t.amount) as amt from fund_transfer t join week w on w.id = t.week_id where w.year = p_year group by 1),
  r as (
    select f.id, f.code, f.name, f.kind::text as kind,
           coalesce(c.amount, 0)::bigint as carry, coalesce(inc.amt, 0)::bigint as income, coalesce(exp.amt, 0)::bigint as expense,
           coalesce(tin.amt, 0)::bigint as tin, coalesce(tout.amt, 0)::bigint as tout
    from fund f
    left join carryover c on c.fund_id = f.id and c.year = p_year
    left join inc on inc.fid = f.id left join exp on exp.fid = f.id
    left join tin on tin.fid = f.id left join tout on tout.fid = f.id)
  select id, code, name, kind, carry, income, expense, tin, tout, carry + income - expense + tin - tout
  from r order by case kind when 'general' then 1 when 'special' then 2 else 3 end, id
$$;
revoke execute on function public.fund_settlement(int) from public, anon;

-- 결산 확정: 다음 연도 이월금 저장(관리자만). 다시 확정하면 덮어쓴다.
create or replace function public.close_settlement(p_year int) returns int
language plpgsql set search_path = public as $$
declare n int; snap jsonb;
begin
  if not public.is_admin() then raise exception '관리자만 결산을 확정할 수 있습니다'; end if;
  if p_year is null or p_year < 2000 or p_year > 2100 then raise exception '연도가 올바르지 않습니다'; end if;
  select jsonb_agg(to_jsonb(s)) into snap from public.fund_settlement(p_year) s;
  insert into carryover (year, fund_id, amount)
  select p_year + 1, s.fund_id, s.next_carry from public.fund_settlement(p_year) s
  on conflict (year, fund_id) do update set amount = excluded.amount;
  get diagnostics n = row_count;
  insert into app_setting (key, value, updated_by, updated_at)
  values ('settlement_' || p_year, jsonb_build_object('closed_at', now(), 'closed_by', auth.uid(), 'funds', coalesce(snap, '[]'::jsonb)), auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  perform public.log_event('settle', format('%s년 결산 확정', p_year));
  return n;
end $$;
revoke execute on function public.close_settlement(int) from public, anon;

-- ===== 4. 예산 저장: 한 해 예산을 통째로 교체 (재정부원) =====
-- rows: [{offering_type_id, amount}] 또는 [{expense_item_id, amount}] (둘 중 하나만). 0원 행은 저장하지 않는다.
create or replace function public.save_budget(p_year int, p_rows jsonb) returns int
language plpgsql set search_path = public as $$
declare n int; bad text;
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  if p_year is null or p_year < 2000 or p_year > 2100 then raise exception '연도가 올바르지 않습니다'; end if;
  select string_agg(ord::text, ', ') into bad
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) with ordinality as x(r, ord)
  where (nullif(r->>'offering_type_id', '') is null) = (nullif(r->>'expense_item_id', '') is null)
     or coalesce((r->>'amount')::bigint, 0) < 0;
  if bad is not null then raise exception '예산 행이 올바르지 않습니다(헌금구분·항목 중 하나, 금액 0 이상): %행', bad; end if;
  delete from budget where year = p_year;
  insert into budget (year, offering_type_id, expense_item_id, amount)
  select p_year, nullif(r->>'offering_type_id', '')::int, nullif(r->>'expense_item_id', '')::int, sum((r->>'amount')::bigint)
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  where coalesce((r->>'amount')::bigint, 0) > 0
  group by 2, 3;
  get diagnostics n = row_count;
  perform public.log_event('budget', format('%s년 예산 저장 %s행', p_year, n));
  return n;
end $$;
revoke execute on function public.save_budget(int, jsonb) from public, anon;

-- 이월금 변경 이력
create trigger carryover_audit after insert or update or delete on carryover for each row execute function public.write_audit();
