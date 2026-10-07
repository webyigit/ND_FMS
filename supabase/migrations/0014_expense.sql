-- 지출 모듈: 기금별 잔액(금주 보고서·검증시트), 검증시트 저장, 주 마감, 교역자급여 상세 (2026-10-07)
-- 전제: 0001~0011. 재정부원(admin·treasurer)만 읽고 쓴다(RLS + 함수 첫 줄 권한 확인).

-- ===== 1. 기금별 잔액 =====
-- 기준 주일(p_sunday)이 속한 연도의 이월금(carryover) + 그 해 그 주까지의 수입 − 지출 ± 회계 간 대체.
-- prev_net: 지난주까지 순증감(이월금 제외), week_*: 이번 주. 지난주 잔액 A = carry + prev_net.
-- 지출에는 송금 수수료(fee)를 더한다(통장 출금액과 맞추기 위해) [확인 필요]
-- 기금이 비어 있는 헌금구분·항목은 일반 기금으로 본다 [확인 필요]
create or replace function public.fund_balances(p_sunday date)
returns table (fund_id int, code text, name text, kind text, carry bigint, prev_net bigint,
               week_in bigint, week_out bigint, week_transfer bigint, balance bigint)
language sql stable set search_path = public as $$
  with g as (select id from fund where kind = 'general' order by id limit 1),
  wk as (select w.id, w.sunday = p_sunday as this_week from week w
         where w.year = extract(year from p_sunday)::int and w.sunday <= p_sunday),
  mv as (
    select coalesce(ot.fund_id, (select id from g)) as fid, wk.this_week, i.amount as inc, 0::bigint as outg, 0::bigint as tr
    from income i join wk on wk.id = i.week_id join offering_type ot on ot.id = i.offering_type_id
    union all
    select coalesce(ei.fund_id, (select id from g)), wk.this_week, 0, e.amount + coalesce(e.fee, 0), 0
    from expense e join wk on wk.id = e.week_id join expense_item ei on ei.id = e.expense_item_id
    union all
    select t.to_fund, wk.this_week, 0, 0, t.amount from fund_transfer t join wk on wk.id = t.week_id
    union all
    select t.from_fund, wk.this_week, 0, 0, -t.amount from fund_transfer t join wk on wk.id = t.week_id
  ),
  s as (
    select fid,
           sum(case when not this_week then inc - outg + tr else 0 end) as prev_net,
           sum(case when this_week then inc else 0 end) as week_in,
           sum(case when this_week then outg else 0 end) as week_out,
           sum(case when this_week then tr else 0 end) as week_transfer
    from mv group by fid
  )
  select f.id, f.code, f.name, f.kind::text,
         coalesce(c.amount, 0)::bigint, coalesce(s.prev_net, 0)::bigint,
         coalesce(s.week_in, 0)::bigint, coalesce(s.week_out, 0)::bigint, coalesce(s.week_transfer, 0)::bigint,
         (coalesce(c.amount, 0) + coalesce(s.prev_net, 0) + coalesce(s.week_in, 0) - coalesce(s.week_out, 0) + coalesce(s.week_transfer, 0))::bigint
  from fund f
  left join carryover c on c.fund_id = f.id and c.year = extract(year from p_sunday)::int
  left join s on s.fid = f.id
  where public.is_finance()
  order by case f.kind when 'general' then 1 when 'special' then 2 else 3 end, f.id
$$;

-- 검증시트 F 장부잔액 누계: 일반+특별 기금(별도 기금 제외).
-- p_with_carry=false 면 이월금을 빼고 그 해 순증감만 [확인 필요: H 기준잉여금과 중복 여부]
create or replace function public.ledger_balance(p_sunday date, p_with_carry boolean default true)
returns bigint
language sql stable set search_path = public as $$
  select coalesce(sum(case when p_with_carry then b.balance else b.balance - b.carry end), 0)::bigint
  from public.fund_balances(p_sunday) b
  where b.kind in ('general', 'special') and public.is_finance()
$$;

-- ===== 2. 검증시트 저장 (A·B·D·H 입력값) =====
create or replace function public.save_reconciliation(p_sunday date, p_bank_balance bigint, p_pending_deposit bigint,
                                                      p_mission_unremitted bigint, p_base_surplus bigint, p_note text default null)
returns void
language plpgsql set search_path = public as $$
declare wid int;
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  wid := public.week_for(p_sunday);  -- 주일 아님·마감된 주는 여기서 막힌다
  insert into reconciliation (week_id, bank_balance, pending_deposit, mission_unremitted, base_surplus, note)
  values (wid, p_bank_balance, p_pending_deposit, p_mission_unremitted, p_base_surplus, nullif(p_note, ''))
  on conflict (week_id) do update set bank_balance = excluded.bank_balance, pending_deposit = excluded.pending_deposit,
    mission_unremitted = excluded.mission_unremitted, base_surplus = excluded.base_surplus, note = excluded.note;
end $$;

-- 검증시트 목록: 입력값 + 장부잔액(F). C·E·G·차이는 화면(src/lib/reconcile.ts)에서 계산
create or replace view public.v_reconciliation with (security_invoker = true) as
select w.sunday, w.year, w.closed, r.week_id, r.bank_balance, r.pending_deposit, r.mission_unremitted, r.base_surplus, r.note,
       public.ledger_balance(w.sunday) as ledger_balance
from reconciliation r join week w on w.id = r.week_id;

-- ===== 3. 주 마감 (관리자만, 되돌리기 가능) =====
create or replace function public.week_close_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  -- API로 들어온 요청(authenticated/anon)만 검사. 마이그레이션·관리 작업은 통과
  if current_user in ('authenticated', 'anon') and not public.is_admin()
     and (tg_op = 'INSERT' and new.closed or tg_op = 'UPDATE' and new.closed is distinct from old.closed) then
    raise exception '관리자만 주 마감·마감 해제를 할 수 있습니다';
  end if;
  return new;
end $$;
create trigger week_close_guard before insert or update on week for each row execute function public.week_close_guard();
create trigger week_audit after update of closed on week for each row execute function public.write_audit();
revoke execute on function public.week_close_guard() from public, anon, authenticated;

create or replace function public.set_week_closed(p_sunday date, p_closed boolean) returns boolean
language plpgsql set search_path = public as $$
begin
  if not public.is_admin() then raise exception '관리자만 주 마감·마감 해제를 할 수 있습니다'; end if;
  if extract(dow from p_sunday) <> 0 then raise exception '주일 날짜가 아닙니다: %', p_sunday; end if;
  insert into week (sunday, closed) values (p_sunday, p_closed)
  on conflict (sunday) do update set closed = excluded.closed;
  return p_closed;
end $$;

-- ===== 4. 고정지출 변경 이력 =====
create trigger fixed_expense_audit after insert or update or delete on fixed_expense for each row execute function public.write_audit();

-- ===== 5. 교역자급여 지급 상세 (clergy_pay_monthly 의 건별 버전) =====
create or replace view public.v_clergy_pay with (security_invoker = true) as
select e.id, w.sunday, w.year, extract(month from w.sunday)::int as month,
       m.id as member_id, m.name || coalesce(m.name_suffix, '') as name, m.title, ct.sort_order as title_order,
       ei.name as item, e.content, e.amount
from expense e
join week w on w.id = e.week_id
join payee p on p.id = e.payee_id
join member m on m.id = p.member_id
join clergy_title ct on ct.title = m.title
join expense_item ei on ei.id = e.expense_item_id;

revoke execute on function public.fund_balances(date) from public, anon;
revoke execute on function public.ledger_balance(date, boolean) from public, anon;
revoke execute on function public.save_reconciliation(date, bigint, bigint, bigint, bigint, text) from public, anon;
revoke execute on function public.set_week_closed(date, boolean) from public, anon;
