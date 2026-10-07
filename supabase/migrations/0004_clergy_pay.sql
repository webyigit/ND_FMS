-- 교역자급여내역 (2026-10-07)
-- 원로목사·담임목사·부목사·전도사에게 지급된 지출을 월별로 모은다.
-- 지급 대상은 expense.payee → payee.member 의 직분(member.title)으로 판별한다.
create table clergy_title (title text primary key, sort_order int not null);
insert into clergy_title values ('원로목사',1),('담임목사',2),('부목사',3),('전도사',4);

create view clergy_pay_monthly as
select w.year,
       extract(month from w.sunday)::int as month,
       m.id as member_id, m.name, m.title,
       ei.name as item,
       sum(e.amount) as amount
from expense e
join week w on w.id = e.week_id
join payee p on p.id = e.payee_id
join member m on m.id = p.member_id
join clergy_title ct on ct.title = m.title
join expense_item ei on ei.id = e.expense_item_id
group by 1, 2, 3, 4, 5, 6;
-- 조회 권한: admin·treasurer만 (급여 정보)
