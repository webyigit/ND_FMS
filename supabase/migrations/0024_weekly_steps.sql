-- 매주 업무 순서(2026-10-14): 주일 단위 단계 완료 기록, 은행 출금거래 → 지출입력 연결, 특별헌금 구분별 전년이월
-- 단계: income(수입입력) → income_report(금주 수입내역 출력) → bank(은행거래내역 → 지출입력) → expense(지출입력)
--       → report(금주 수입/지출 내역 출력) → ledger(총계원장 출력)

-- ===== 1. 주 단위 단계 완료 (기기 간 공유) =====
create table if not exists week_step (
  sunday date not null,
  step text not null check (step in ('income', 'income_report', 'bank', 'expense', 'report', 'ledger')),
  done_at timestamptz not null default now(),
  done_by uuid default auth.uid(),
  primary key (sunday, step),
  check (extract(dow from sunday) = 0)
);
alter table week_step enable row level security;
drop policy if exists week_step_finance on week_step;
create policy week_step_finance on week_step for all using (public.is_finance()) with check (public.is_finance());

-- p_done=true 면 완료(다시 눌러도 처음 완료 시각 유지), false 면 완료 취소
create or replace function public.set_week_step(p_sunday date, p_step text, p_done boolean default true) returns void
language plpgsql set search_path = public as $$
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  if extract(dow from p_sunday) <> 0 then raise exception '주일 날짜가 아닙니다: %', p_sunday; end if;
  if p_done then
    insert into week_step (sunday, step) values (p_sunday, p_step) on conflict (sunday, step) do nothing;
  else
    delete from week_step where sunday = p_sunday and step = p_step;
  end if;
end $$;
revoke execute on function public.set_week_step(date, text, boolean) from public, anon;

-- ===== 2. 은행 출금거래 → 지출입력: 지출 행이 거래 id(bank_tx_id)를 들고 저장된다 =====
-- 지출의 은행 연결 행도 지출입력 화면에서 똑같이 고치고 지울 수 있다(수입과 달리 따로 다루는 화면이 없다).
create or replace function public.save_week_expense(p_sunday date, p_rows jsonb) returns int
language plpgsql set search_path = public as $$
declare wid int; n int; bad text; keep bigint[];
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

  select coalesce(array_agg((r->>'id')::bigint), '{}') into keep
  from jsonb_array_elements(p_rows) r where nullif(r->>'id', '') is not null;
  delete from expense where week_id = wid and not (id = any(keep));

  update expense e set expense_item_id = ei.id, content = coalesce(nullif(r->>'content', ''), ei.name),
         amount = (r->>'amount')::bigint, requester_label = nullif(r->>'requester', ''),
         requester_member_id = (select m.id from member m where m.name = r->>'requester' and m.active order by m.id limit 1),
         memo = nullif(r->>'memo', ''), source = coalesce(r->>'source', e.source),
         receipt_file_id = coalesce((select rf.id from receipt_file rf where rf.drive_file_id = r->>'drive_file_id'), e.receipt_file_id),
         bank_tx_id = coalesce(nullif(r->>'bank_tx_id', '')::bigint, e.bank_tx_id),
         sort_order = x.ord::int, updated_at = now()
  from jsonb_array_elements(p_rows) with ordinality as x(r, ord)
  join department d on d.name = r->>'dept'
  join expense_item ei on ei.department_id = d.id and ei.name = r->>'item'
  where e.id = nullif(r->>'id', '')::bigint and e.week_id = wid;

  insert into expense (week_id, expense_item_id, content, amount, requester_member_id, requester_label,
                       memo, source, receipt_file_id, bank_tx_id, sort_order, created_by)
  select wid, ei.id, coalesce(nullif(r->>'content', ''), ei.name), (r->>'amount')::bigint,
         (select m.id from member m where m.name = r->>'requester' and m.active order by m.id limit 1),
         nullif(r->>'requester', ''), nullif(r->>'memo', ''), r->>'source',
         (select rf.id from receipt_file rf where rf.drive_file_id = r->>'drive_file_id'),
         nullif(r->>'bank_tx_id', '')::bigint,
         ord::int, auth.uid()
  from jsonb_array_elements(p_rows) with ordinality as x(r, ord)
  join department d on d.name = r->>'dept'
  join expense_item ei on ei.department_id = d.id and ei.name = r->>'item'
  where nullif(r->>'id', '') is null
     or not exists (select 1 from expense e where e.id = (r->>'id')::bigint and e.week_id = wid);

  select count(*) into n from expense where week_id = wid;
  return n;
end $$;
revoke execute on function public.save_week_expense(date, jsonb) from public, anon;

-- 은행거래 조회에 지출 연결 정보를 덧붙인다(출금 → 지출입력 반영 여부)
create or replace view public.v_bank_tx with (security_invoker = true) as
select t.id, t.import_id, t.bank_account_id, t.tx_at, (t.tx_at at time zone 'Asia/Seoul')::date as tx_date,
       t.withdraw, t.deposit, t.balance, t.tx_type, t.description, t.branch, t.transfer_memo, t.tx_memo,
       t.suggested_offering_type_id, t.suggested_member_id, t.linked,
       public.bank_tx_sunday(t.tx_at) as default_sunday,
       i.id as income_id, w.sunday as income_sunday, w.closed as income_closed,
       i.offering_type_id as income_offering_type_id, ot.name as income_offering_type,
       i.member_id as income_member_id, i.payer_label as income_payer_label, i.memo as income_memo,
       e.id as expense_id, ew.sunday as expense_sunday, e.content as expense_content
from bank_tx t
left join lateral (select * from income x where x.bank_tx_id = t.id order by x.id limit 1) i on true
left join week w on w.id = i.week_id
left join lateral (select * from expense x where x.bank_tx_id = t.id order by x.id limit 1) e on true
left join week ew on ew.id = e.week_id
left join offering_type ot on ot.id = i.offering_type_id;

-- ===== 3. 특별헌금 구분별 전년이월 (총계원장 '■ 특별헌금' 표, 이월금은 기금 단위라 구분별 값이 따로 필요) =====
create table if not exists offering_carryover (
  year int not null,
  offering_type_id int not null references offering_type(id),
  amount bigint not null default 0,
  primary key (year, offering_type_id)
);
alter table offering_carryover enable row level security;
drop policy if exists offering_carryover_finance on offering_carryover;
create policy offering_carryover_finance on offering_carryover for all using (public.is_finance()) with check (public.is_finance());
drop trigger if exists offering_carryover_audit on offering_carryover;
create trigger offering_carryover_audit after insert or update or delete on offering_carryover for each row execute function public.write_audit();
