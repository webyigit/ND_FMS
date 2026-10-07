-- 대시보드·해외선교·예결산 검증 (가상 데이터, 2023년 주일 사용: 다른 테스트와 겹치지 않게)
\set ON_ERROR_STOP 1
update app_user set role = 'treasurer', status = 'approved' where id = '00000000-0000-0000-0000-00000000000b';

do $$ begin
  assert (select count(*) from expense_item ei join department d on d.id = ei.department_id join fund f on f.id = ei.fund_id
          where d.name = '해외선교' and f.kind = 'separate') >= 4, '해외선교 항목은 별도 기금';
end $$;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ declare n int; pid bigint; s record; begin
  perform public.save_week_income('2023-03-05', jsonb_build_array(
    jsonb_build_object('offering_type_id', (select id from offering_type where name = '십일조'), 'payer_label', '가나다', 'amount', 100000),
    jsonb_build_object('offering_type_id', (select id from offering_type where name = '십일조'), 'payer_label', '라마바', 'amount', 50000),
    jsonb_build_object('offering_type_id', (select id from offering_type where name = '해외선교'), 'payer_label', '가나다', 'amount', 30000)));
  perform public.save_week_expense('2023-03-05', jsonb_build_array(
    jsonb_build_object('dept', '관리부', 'item', '공공요금', 'content', '전기요금', 'amount', 40000),
    jsonb_build_object('dept', '해외선교', 'item', '선교사 후원', 'content', '가 선교사', 'amount', 20000)));
  insert into carryover (year, fund_id, amount) select 2023, id, 1000 from fund where code = 'general';

  -- 주 단위 집계 뷰
  assert (select amount from v_income_week where sunday = '2023-03-05' and offering_type = '십일조') = 150000, '헌금구분별 주 합계';
  assert (select cnt from v_income_week where sunday = '2023-03-05' and offering_type = '십일조') = 2, '건수';
  assert (select fund_kind from v_expense_week where sunday = '2023-03-05' and item = '선교사 후원') = 'separate', '선교 지출은 별도 기금';

  -- 송금 계좌 이력(계좌번호는 가린 값)
  insert into payee (name, account_no_enc) values ('가상상회', public.enc('301-1234-5678-91')) returning id into pid;
  update expense set payee_id = pid where content = '전기요금' and week_id = (select id from week where sunday = '2023-03-05');
  assert (select account_mask from v_payee_activity where payee_id = pid) = '***-****-***8-91', '계좌 가림';
  assert (select first_sunday from v_payee_activity where payee_id = pid) = '2023-03-05', '처음 이체일';

  -- 기금별 결산
  select * into s from public.fund_settlement(2023) where fund_code = 'general';
  assert s.carry = 1000 and s.income = 150000 and s.expense = 40000 and s.next_carry = 111000, format('일반 결산 %s', to_jsonb(s));
  select * into s from public.fund_settlement(2023) where fund_code = 'separate';
  assert s.income = 30000 and s.expense = 20000 and s.next_carry = 10000, format('별도 결산 %s', to_jsonb(s));

  -- 결산 확정 → 다음 연도 이월
  n := public.close_settlement(2023);
  assert n >= 3, '기금 수만큼 이월';
  assert (select amount from carryover c join fund f on f.id = c.fund_id where c.year = 2024 and f.code = 'general') = 111000, '차기 이월 저장';
  assert (select value ? 'closed_at' from app_setting where key = 'settlement_2023'), '확정 기록';
  n := public.close_settlement(2023); -- 다시 확정해도 중복 없음
  assert (select count(*) from carryover where year = 2024) = n, '덮어쓰기';
end $$;

-- 재정부(관리자 아님): 결산 확정 불가, 예산 저장 가능
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ declare n int; begin
  begin
    perform public.close_settlement(2023);
    raise exception 'should fail';
  exception when others then
    assert sqlerrm = '관리자만 결산을 확정할 수 있습니다', sqlerrm;
  end;

  n := public.save_budget(2024, jsonb_build_array(
    jsonb_build_object('offering_type_id', (select id from offering_type where name = '십일조'), 'amount', 5000000),
    jsonb_build_object('expense_item_id', (select ei.id from expense_item ei join department d on d.id = ei.department_id where d.name = '관리부' and ei.name = '공공요금'), 'amount', 1200000),
    jsonb_build_object('expense_item_id', (select ei.id from expense_item ei join department d on d.id = ei.department_id where d.name = '관리부' and ei.name = '인쇄비'), 'amount', 0)));
  assert n = 2, '0원 행 제외';
  n := public.save_budget(2024, jsonb_build_array(
    jsonb_build_object('offering_type_id', (select id from offering_type where name = '십일조'), 'amount', 6000000)));
  assert (select count(*) from budget where year = 2024) = 1 and (select amount from budget where year = 2024) = 6000000, '교체 저장';

  begin
    perform public.save_budget(2024, '[{"amount": 1}]');
    raise exception 'should fail';
  exception when others then
    assert sqlerrm like '예산 행이 올바르지 않습니다%', sqlerrm;
  end;
  begin
    perform public.save_budget(2024, jsonb_build_array(jsonb_build_object('offering_type_id', (select id from offering_type where name = '십일조'), 'amount', -1)));
    raise exception 'should fail';
  exception when others then
    assert sqlerrm like '예산 행이 올바르지 않습니다%', sqlerrm;
  end;
  assert (select amount from budget where year = 2024) = 6000000, '실패 시 기존 예산 유지';
end $$;

-- 조회 권한·비로그인: 집계도 못 본다
reset role;
update app_user set role = 'viewer' where id = '00000000-0000-0000-0000-00000000000b';
set role authenticated;
do $$ begin
  assert (select count(*) from v_income_week) = 0 and (select count(*) from v_expense_week) = 0, '조회 권한은 집계 못 봄';
  assert (select count(*) from v_payee_activity) = 0, '계좌 이력 못 봄';
  assert (select coalesce(sum(income), 0) from public.fund_settlement(2023)) = 0, '결산도 RLS 적용';
  begin
    perform public.save_budget(2024, '[]');
    raise exception 'should fail';
  exception when others then
    assert sqlerrm = '권한이 없습니다', sqlerrm;
  end;
end $$;
reset request.jwt.claim.sub;
set role anon;
do $$ begin
  begin
    perform public.close_settlement(2023);
    raise exception 'should fail';
  exception when others then
    assert sqlerrm like 'permission denied%', sqlerrm;
  end;
end $$;
reset role;
select '예결산 테스트 통과';
