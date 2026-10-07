-- 지출 모듈 검증: 기금별 잔액·장부잔액·검증시트 저장·주 마감·고정지출 이력 (가상 데이터, 2024년 주일만 사용)
\set ON_ERROR_STOP 1
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000050c1', 'exp-treasurer@example.test', '{"name":"지출재정"}');
update app_user set status = 'approved', role = 'treasurer' where id = '00000000-0000-0000-0000-0000000050c1';
insert into expense_item (department_id, name, fund_id, sort_order)
select d.id, '네팔선교후원(테스트)', (select id from fund where kind = 'separate'), 99 from department d where d.name = '이웃사랑선교부';
insert into carryover (year, fund_id, amount)
select 2024, id, case kind when 'general' then 1000000 when 'special' then 500000 else 300000 end from fund;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ declare b record; begin
  perform public.save_week_income('2024-11-03', jsonb_build_array(
    jsonb_build_object('offering_type_id', (select id from offering_type where name = '십일조'), 'payer_label', '가나다', 'amount', 100000),
    jsonb_build_object('offering_type_id', (select id from offering_type where name = '이웃사랑'), 'payer_label', '가나다', 'amount', 50000),
    jsonb_build_object('offering_type_id', (select id from offering_type where name = '해외선교'), 'payer_label', '가나다', 'amount', 30000)));
  perform public.save_week_expense('2024-11-03', '[{"dept":"관리부","item":"공공요금","content":"전기요금","amount":40000}]');
  perform public.save_week_income('2024-11-10', jsonb_build_array(
    jsonb_build_object('offering_type_id', (select id from offering_type where name = '십일조'), 'payer_label', '라마바', 'amount', 200000)));
  perform public.save_week_expense('2024-11-10',
    '[{"dept":"음악부","item":"찬양대","amount":10000},{"dept":"이웃사랑선교부","item":"네팔선교후원(테스트)","amount":20000}]');
  insert into fund_transfer (week_id, from_fund, to_fund, amount)
  select (select id from week where sunday = '2024-11-10'), (select id from fund where kind = 'general'), (select id from fund where kind = 'special'), 5000;

  select * into b from public.fund_balances('2024-11-10') where kind = 'general';
  assert (b.carry, b.prev_net, b.week_in, b.week_out, b.week_transfer, b.balance) = (1000000::bigint, 60000::bigint, 200000::bigint, 10000::bigint, -5000::bigint, 1245000::bigint), b::text;
  assert (select balance from public.fund_balances('2024-11-10') where kind = 'special') = 555000, '특별 잔액';
  assert (select balance from public.fund_balances('2024-11-10') where kind = 'separate') = 310000, '별도 잔액';
  assert (select balance from public.fund_balances('2024-11-03') where kind = 'general') = 1060000, '지난주 기준 잔액';
  assert public.ledger_balance('2024-11-10') = 1800000, '장부잔액(일반+특별, 별도 제외)';
  assert public.ledger_balance('2024-11-10', false) = 300000, '이월금 제외 장부잔액';

  perform public.save_reconciliation('2024-11-10', 2100000, 10000, 310000, 0, '테스트');
  perform public.save_reconciliation('2024-11-10', 2110000, 0, 310000, 0, null);  -- 다시 저장하면 교체
  assert (select bank_balance || '/' || ledger_balance from v_reconciliation where sunday = '2024-11-10') = '2110000/1800000', '검증시트 목록';
  begin
    perform public.save_reconciliation('2024-11-11', 0, 0, 0, 0);
    raise exception 'should fail';
  exception when others then assert sqlerrm like '주일 날짜가 아닙니다%', sqlerrm; end;

  insert into fixed_expense (week_of_month, content, amount, expense_item_id)
  select 2, '테스트 고정지출', 1000, id from expense_item where name = '공공요금' limit 1;
  assert exists (select 1 from audit_log where target_table = 'fixed_expense' and action = 'insert'), '고정지출 이력';
end $$;

-- 재정부(관리자 아님): 마감 불가
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000050c1';
do $$ begin
  assert public.ledger_balance('2024-11-10') = 1800000, '재정부도 장부잔액 조회';
  begin
    perform public.set_week_closed('2024-11-10', true);
    raise exception 'should fail';
  exception when others then assert sqlerrm like '관리자만%', sqlerrm; end;
  begin
    update week set closed = true where sunday = '2024-11-10';
    raise exception 'should fail';
  exception when others then assert sqlerrm like '관리자만%', sqlerrm; end;
  assert not (select closed from week where sunday = '2024-11-10'), '마감 안 됨';
end $$;

-- 관리자: 마감 → 저장 막힘 → 마감 해제
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert public.set_week_closed('2024-11-10', true);
  begin
    perform public.save_reconciliation('2024-11-10', 1, 0, 0, 0);
    raise exception 'should fail';
  exception when others then assert sqlerrm like '마감된 주입니다%', sqlerrm; end;
  assert exists (select 1 from audit_log where target_table = 'week' and action = 'update'), '마감 이력';
  perform public.set_week_closed('2024-11-10', false);
  perform public.save_reconciliation('2024-11-10', 2110000, 0, 310000, 0);
  assert public.set_week_closed('2024-11-17', true), '없는 주도 마감 가능';
end $$;

-- 조회 권한·비로그인: 잔액을 못 본다
reset role;
update app_user set role = 'viewer' where id = '00000000-0000-0000-0000-0000000050c1';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000050c1';
do $$ begin
  assert (select count(*) from public.fund_balances('2024-11-10')) = 0, '조회 권한은 잔액 못 봄';
  assert public.ledger_balance('2024-11-10') = 0, '조회 권한은 장부잔액 0';
  assert (select count(*) from v_reconciliation) = 0, '검증시트 못 봄';
  begin
    perform public.save_reconciliation('2024-11-03', 1, 0, 0, 0);
    raise exception 'should fail';
  exception when others then assert sqlerrm = '권한이 없습니다', sqlerrm; end;
end $$;
reset request.jwt.claim.sub;
set role anon;
do $$ begin
  assert (select count(*) from v_clergy_pay) = 0, '급여 상세 막힘';
  begin
    perform public.fund_balances('2024-11-10');
    raise exception 'should fail';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select '지출 모듈 테스트 통과';
