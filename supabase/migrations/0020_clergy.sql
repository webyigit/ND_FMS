-- 교역자급여내역: 교역자 목록 (2026-10-08)
-- 실데이터의 지출에는 지급처(payee)가 연결돼 있지 않아, 교역자마다 "어떤 지출 항목의 지출인지"
-- (+ 필요하면 내용에 들어간 말)로 급여 지출을 찾는다. 실명은 이 테이블(DB)에만 둔다.
create table public.clergy (
  id serial primary key,
  name text not null,                                    -- 이름 또는 자리(예: 중고등부 전도사)
  title text not null,                                   -- 직분(원로목사·담임목사·부목사·전도사 등)
  expense_item_id int not null references expense_item(id),
  keyword text,                                          -- 비우면 그 항목의 지출 전부, 넣으면 내용에 그 말이 든 지출만
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);
alter table public.clergy enable row level security;
create policy clergy_finance on public.clergy for all using (public.is_finance()) with check (public.is_finance());

-- 지급 상세: 교역자 목록 기준 (같은 이름의 여러 줄은 화면에서 한 사람으로 합친다)
-- 예전 v_clergy_pay(지급처→교인 직분 기준)는 남겨 두되 화면은 이 뷰를 쓴다.
create view public.v_clergy_salary with (security_invoker = true) as
select e.id, w.sunday, w.year, extract(month from w.sunday)::int as month,
       c.id as clergy_id, c.name, c.title, c.sort_order,
       ei.name as item, e.content, e.amount
from public.clergy c
join expense e on e.expense_item_id = c.expense_item_id
             and (coalesce(c.keyword, '') = '' or e.content like '%' || c.keyword || '%')
join week w on w.id = e.week_id
join expense_item ei on ei.id = e.expense_item_id;
