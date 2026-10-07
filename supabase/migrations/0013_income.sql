-- 수입관리: 은행거래 업로드 → 수입 반영, 조회용 집계 뷰 (2026-10-07)
-- 원칙: 재정부원(is_finance)만 실행. 여러 행을 바꾸는 쓰기는 함수 하나(트랜잭션)로.

-- ===== 1. 인덱스·연결 =====
create index if not exists income_week_type_idx on income (week_id, offering_type_id);
create index if not exists income_bank_tx_idx on income (bank_tx_id) where bank_tx_id is not null;
create index if not exists bank_tx_tx_at_idx on bank_tx (tx_at);
create index if not exists bank_tx_import_idx on bank_tx (import_id);
alter table income add constraint income_bank_tx_fk foreign key (bank_tx_id) references bank_tx(id);
create trigger bank_import_audit after insert or delete on bank_import for each row execute function public.write_audit();

-- ===== 2. 거래일 → 반영 주일 =====
-- 거래일(한국 시각)이 주일이면 그날, 아니면 직전 주일. [확인 필요] 평일 입금을 다음 주일로 보낼지
create or replace function public.bank_tx_sunday(p_tx_at timestamptz) returns date
language sql stable set search_path = public as $$
  select (p_tx_at at time zone 'Asia/Seoul')::date - extract(dow from (p_tx_at at time zone 'Asia/Seoul'))::int
$$;

-- ===== 3. 은행 엑셀 올리기 =====
-- rows: [{tx_at, withdraw, deposit, balance, tx_type, description, branch, transfer_memo, tx_memo,
--         suggested_offering_type_id, suggested_member_id}]
-- 같은 계좌·일시·금액·잔액 거래는 이미 있으면 건너뛴다(계좌 없이 올린 것도 포함).
create or replace function public.import_bank_tx(p_account_id int, p_file_name text, p_rows jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare iid bigint; total int; n int;
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception '올릴 거래가 없습니다';
  end if;
  total := jsonb_array_length(p_rows);

  insert into bank_import (bank_account_id, file_name, period_from, period_to, imported_by)
  select p_account_id, left(p_file_name, 200),
         min(((r->>'tx_at')::timestamptz at time zone 'Asia/Seoul')::date),
         max(((r->>'tx_at')::timestamptz at time zone 'Asia/Seoul')::date), auth.uid()
  from jsonb_array_elements(p_rows) r
  returning id into iid;

  with src as (
    select distinct on (x.tx_at, coalesce(x.withdraw, 0), coalesce(x.deposit, 0), x.balance) x.*
    from jsonb_to_recordset(p_rows) as x(tx_at timestamptz, withdraw bigint, deposit bigint, balance bigint,
      tx_type text, description text, branch text, transfer_memo text, tx_memo text,
      suggested_offering_type_id int, suggested_member_id bigint)
    where x.tx_at is not null and coalesce(x.withdraw, 0) >= 0 and coalesce(x.deposit, 0) >= 0
  )
  insert into bank_tx (import_id, bank_account_id, tx_at, withdraw, deposit, balance, tx_type, description,
                       branch, transfer_memo, tx_memo, suggested_offering_type_id, suggested_member_id)
  select iid, p_account_id, s.tx_at, coalesce(s.withdraw, 0), coalesce(s.deposit, 0), s.balance,
         s.tx_type, s.description, s.branch, s.transfer_memo, s.tx_memo,
         s.suggested_offering_type_id, s.suggested_member_id
  from src s
  where not exists (
    select 1 from bank_tx t
    where t.bank_account_id is not distinct from p_account_id and t.tx_at = s.tx_at
      and t.withdraw = coalesce(s.withdraw, 0) and t.deposit = coalesce(s.deposit, 0)
      and t.balance is not distinct from s.balance)
  on conflict do nothing;
  get diagnostics n = row_count;

  if n = 0 then delete from bank_import where id = iid; iid := null; end if;
  return jsonb_build_object('import_id', iid, 'inserted', n, 'skipped', total - n);
end $$;

-- ===== 4. 입금 거래 → 수입(이체) 반영 / 되돌리기 =====
-- rows: [{bank_tx_id, offering_type_id, member_id, payer_label, memo, sunday(선택)}]
-- 금액은 입금액 그대로. 주일을 비우면 bank_tx_sunday. 마감된 주는 week_for 에서 막힌다.
create or replace function public.link_bank_tx_to_income(p_rows jsonb) returns int
language plpgsql set search_path = public as $$
declare r jsonb; t bank_tx; d date; wid int; n int := 0;
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    select * into t from bank_tx where id = (r->>'bank_tx_id')::bigint for update;
    if not found then raise exception '거래를 찾을 수 없습니다: %', r->>'bank_tx_id'; end if;
    if t.linked or exists (select 1 from income where bank_tx_id = t.id) then
      raise exception '이미 수입으로 반영된 거래입니다: % %', (t.tx_at at time zone 'Asia/Seoul')::date, t.description;
    end if;
    if coalesce(t.deposit, 0) <= 0 then raise exception '입금 거래만 수입으로 반영할 수 있습니다'; end if;
    if nullif(r->>'offering_type_id', '') is null then
      raise exception '헌금구분이 비어 있습니다: %', t.description;
    end if;
    d := coalesce(nullif(r->>'sunday', '')::date, public.bank_tx_sunday(t.tx_at));
    wid := public.week_for(d);
    insert into income (week_id, offering_type_id, member_id, payer_label, channel, amount, memo, bank_tx_id, created_by)
    values (wid, (r->>'offering_type_id')::int, nullif(r->>'member_id', '')::bigint,
            coalesce(nullif(trim(r->>'payer_label'), ''), t.description), 'online', t.deposit,
            nullif(trim(r->>'memo'), ''), t.id, auth.uid());
    -- 확정값을 제안값으로 남겨 다음 분류(과거 이력)에 쓴다
    update bank_tx set linked = true,
      suggested_offering_type_id = (r->>'offering_type_id')::int,
      suggested_member_id = nullif(r->>'member_id', '')::bigint
    where id = t.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.unlink_bank_tx(p_tx_ids bigint[]) returns int
language plpgsql set search_path = public as $$
declare n int; bad date;
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  select min(w.sunday) into bad from income i join week w on w.id = i.week_id
  where i.bank_tx_id = any(p_tx_ids) and w.closed;
  if bad is not null then raise exception '마감된 주입니다: %', bad; end if;
  delete from income where bank_tx_id = any(p_tx_ids);
  get diagnostics n = row_count;
  update bank_tx set linked = false where id = any(p_tx_ids) and linked;
  return n;
end $$;

revoke execute on function public.bank_tx_sunday(timestamptz) from public, anon;
revoke execute on function public.import_bank_tx(int, text, jsonb) from public, anon;
revoke execute on function public.link_bank_tx_to_income(jsonb) from public, anon;
revoke execute on function public.unlink_bank_tx(bigint[]) from public, anon;

-- ===== 5. 조회용 뷰 (호출자 권한 = RLS 적용) =====
-- 계좌 목록은 0012의 v_bank_account(account_mask) 를 쓴다

-- 은행거래 + 반영된 수입
create or replace view public.v_bank_tx with (security_invoker = true) as
select t.id, t.import_id, t.bank_account_id, t.tx_at, (t.tx_at at time zone 'Asia/Seoul')::date as tx_date,
       t.withdraw, t.deposit, t.balance, t.tx_type, t.description, t.branch, t.transfer_memo, t.tx_memo,
       t.suggested_offering_type_id, t.suggested_member_id, t.linked,
       public.bank_tx_sunday(t.tx_at) as default_sunday,
       i.id as income_id, w.sunday as income_sunday, w.closed as income_closed,
       i.offering_type_id as income_offering_type_id, ot.name as income_offering_type,
       i.member_id as income_member_id, i.payer_label as income_payer_label, i.memo as income_memo
from bank_tx t
left join lateral (select * from income x where x.bank_tx_id = t.id order by x.id limit 1) i on true
left join week w on w.id = i.week_id
left join offering_type ot on ot.id = i.offering_type_id;

-- 개인별(교인 또는 원문 표기) × 헌금구분 × 월 합계. 총액만 입력하는 헌금(주일헌금)은 뺀다
create or replace view public.v_income_person with (security_invoker = true) as
select w.year, extract(month from w.sunday)::int as month,
       i.member_id, m.name || coalesce(m.name_suffix, '') as member_name, m.household_id, h.label as household_label,
       case when i.member_id is null then trim(i.payer_label) end as payer_label,
       i.offering_type_id, ot.name as offering_type, ot.sort_order as type_order, f.kind::text as fund_kind,
       sum(i.amount)::bigint as amount, count(*)::int as n
from income i
join week w on w.id = i.week_id
join offering_type ot on ot.id = i.offering_type_id
left join fund f on f.id = ot.fund_id
left join member m on m.id = i.member_id
left join household h on h.id = m.household_id
where not coalesce(ot.total_only, false)
  and (i.member_id is not null or coalesce(trim(i.payer_label), '') not in ('', '(총액)'))
group by w.year, extract(month from w.sunday), i.member_id, m.name, m.name_suffix, m.household_id, h.label,
         case when i.member_id is null then trim(i.payer_label) end,
         i.offering_type_id, ot.name, ot.sort_order, f.kind;

-- 헌금구분 × 월 × 현금/이체 합계 (리포트)
create or replace view public.v_income_type_month with (security_invoker = true) as
select w.year, extract(month from w.sunday)::int as month,
       i.offering_type_id, ot.name as offering_type, ot.sort_order as type_order, f.kind::text as fund_kind,
       i.channel::text as channel, sum(i.amount)::bigint as amount, count(*)::int as n
from income i
join week w on w.id = i.week_id
join offering_type ot on ot.id = i.offering_type_id
left join fund f on f.id = ot.fund_id
group by w.year, extract(month from w.sunday), i.offering_type_id, ot.name, ot.sort_order, f.kind, i.channel;
