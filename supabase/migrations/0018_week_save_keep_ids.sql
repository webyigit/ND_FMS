-- 주간 저장을 '통째로 교체'에서 '바뀐 것만 반영'으로 (2026-10-07)
-- 이유: 다시 저장할 때 행 id가 바뀌면 지출신청 연결(expense_request.expense_id), 송금처·수수료 같은
-- 화면에 없는 칸, 사용내역 추적이 끊긴다. 화면이 보낸 id가 있으면 그 행을 고치고, 없으면 새로 넣고,
-- 화면에서 지운 행만 지운다. 은행거래에서 들어온 행(bank_tx_id 있음)은 그대로 둔다.

create or replace function public.save_week_income(p_sunday date, p_rows jsonb) returns int
language plpgsql set search_path = public as $$
declare wid int; n int; keep bigint[];
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  wid := public.week_for(p_sunday);
  select coalesce(array_agg((r->>'id')::bigint), '{}') into keep
  from jsonb_array_elements(p_rows) r where nullif(r->>'id', '') is not null;

  delete from income where week_id = wid and bank_tx_id is null and not (id = any(keep));

  update income i set offering_type_id = (r->>'offering_type_id')::int,
         member_id = nullif(r->>'member_id', '')::bigint, payer_label = r->>'payer_label',
         channel = coalesce(r->>'channel', 'cash')::pay_channel, amount = (r->>'amount')::bigint,
         memo = nullif(r->>'memo', ''), sort_order = x.ord::int, updated_at = now()
  from jsonb_array_elements(p_rows) with ordinality as x(r, ord)
  where i.id = nullif(r->>'id', '')::bigint and i.week_id = wid and i.bank_tx_id is null
    and (i.offering_type_id, i.member_id, i.payer_label, i.channel, i.amount, i.memo, i.sort_order)
        is distinct from ((r->>'offering_type_id')::int, nullif(r->>'member_id', '')::bigint, r->>'payer_label',
        coalesce(r->>'channel', 'cash')::pay_channel, (r->>'amount')::bigint, nullif(r->>'memo', ''), x.ord::int);

  insert into income (week_id, offering_type_id, member_id, payer_label, channel, amount, memo, sort_order, created_by)
  select wid, (r->>'offering_type_id')::int, nullif(r->>'member_id', '')::bigint, r->>'payer_label',
         coalesce(r->>'channel', 'cash')::pay_channel, (r->>'amount')::bigint, nullif(r->>'memo', ''),
         ord::int, auth.uid()
  from jsonb_array_elements(p_rows) with ordinality as x(r, ord)
  where nullif(r->>'id', '') is null
     or not exists (select 1 from income i where i.id = (r->>'id')::bigint and i.week_id = wid);

  select count(*) into n from income where week_id = wid and bank_tx_id is null;
  return n;
end $$;

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
  delete from expense where week_id = wid and bank_tx_id is null and not (id = any(keep));

  -- 화면에 있는 칸만 고친다(송금처·수수료·방법 등은 유지)
  update expense e set expense_item_id = ei.id, content = coalesce(nullif(r->>'content', ''), ei.name),
         amount = (r->>'amount')::bigint, requester_label = nullif(r->>'requester', ''),
         requester_member_id = (select m.id from member m where m.name = r->>'requester' and m.active order by m.id limit 1),
         memo = nullif(r->>'memo', ''), source = coalesce(r->>'source', e.source),
         receipt_file_id = coalesce((select rf.id from receipt_file rf where rf.drive_file_id = r->>'drive_file_id'), e.receipt_file_id),
         sort_order = x.ord::int, updated_at = now()
  from jsonb_array_elements(p_rows) with ordinality as x(r, ord)
  join department d on d.name = r->>'dept'
  join expense_item ei on ei.department_id = d.id and ei.name = r->>'item'
  where e.id = nullif(r->>'id', '')::bigint and e.week_id = wid and e.bank_tx_id is null;

  insert into expense (week_id, expense_item_id, content, amount, requester_member_id, requester_label,
                       memo, source, receipt_file_id, sort_order, created_by)
  select wid, ei.id, coalesce(nullif(r->>'content', ''), ei.name), (r->>'amount')::bigint,
         (select m.id from member m where m.name = r->>'requester' and m.active order by m.id limit 1),
         nullif(r->>'requester', ''), nullif(r->>'memo', ''), r->>'source',
         (select rf.id from receipt_file rf where rf.drive_file_id = r->>'drive_file_id'),
         ord::int, auth.uid()
  from jsonb_array_elements(p_rows) with ordinality as x(r, ord)
  join department d on d.name = r->>'dept'
  join expense_item ei on ei.department_id = d.id and ei.name = r->>'item'
  where nullif(r->>'id', '') is null
     or not exists (select 1 from expense e where e.id = (r->>'id')::bigint and e.week_id = wid);

  select count(*) into n from expense where week_id = wid and bank_tx_id is null;
  return n;
end $$;

revoke execute on function public.save_week_income(date, jsonb) from public, anon;
revoke execute on function public.save_week_expense(date, jsonb) from public, anon;
