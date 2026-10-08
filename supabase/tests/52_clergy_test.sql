-- 교역자급여내역 검증: 교역자 목록(항목+내용 말)으로 지출을 찾는다 (가상 이름·금액)
\set ON_ERROR_STOP 1
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  perform public.save_week_expense('2024-12-01',
    '[{"dept":"전도부","item":"부교역자사례비","content":"가부목 목사 사례비","amount":2000000},
      {"dept":"교회학교부","item":"중고등부 전도사 사례비","content":"나전도 전도사","amount":800000},
      {"dept":"재정부","item":"담임목사사례비","content":"담임목사 사례비","amount":3000000}]');
  perform public.save_week_expense('2024-12-08',
    '[{"dept":"교회학교부","item":"중고등부 전도사 사례비","content":"다전도 전도사","amount":700000}]');
  insert into clergy (name, title, expense_item_id, keyword, sort_order) values
    ('가부목', '부목사', (select id from expense_item where name = '부교역자사례비'), '가부목', 3),
    ('없는사람', '부목사', (select id from expense_item where name = '부교역자사례비'), '없는사람', 4),
    ('중고등부 전도사', '전도사', (select id from expense_item where name = '중고등부 전도사 사례비'), null, 5);
  assert (select sum(amount) from v_clergy_salary where name = '가부목') = 2000000, '내용 말로 찾기';
  assert (select count(*) from v_clergy_salary where name = '없는사람') = 0, '말이 없으면 0';
  assert (select sum(amount) from v_clergy_salary where name = '중고등부 전도사') = 1500000, '말 비우면 항목 전부';
  assert (select count(*) from v_clergy_salary where item = '담임목사사례비') = 0, '목록에 없는 항목은 안 나옴';
end $$;
reset request.jwt.claim.sub;
set role anon;
do $$ begin
  assert (select count(*) from clergy) = 0, '교역자 목록 막힘';
  assert (select count(*) from v_clergy_salary) = 0, '급여 상세 막힘';
end $$;
reset role;
select '교역자급여 테스트 통과';
