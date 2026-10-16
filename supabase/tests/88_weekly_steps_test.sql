-- 매주 업무 순서: 단계 완료 기록, 은행 출금 → 지출 연결 저장 (가상 데이터)
\set ON_ERROR_STOP 1
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ declare t bigint; n int; first_at timestamptz; begin
  perform public.set_week_step('2024-12-01', 'income');
  perform public.set_week_step('2024-12-01', 'income_report');
  select done_at into first_at from week_step where sunday = '2024-12-01' and step = 'income';
  perform pg_sleep(0.01);
  perform public.set_week_step('2024-12-01', 'income');  -- 다시 완료해도 처음 시각 유지
  assert (select done_at from week_step where sunday = '2024-12-01' and step = 'income') = first_at, '완료 시각 유지';
  assert (select count(*) from week_step where sunday = '2024-12-01') = 2, '2단계 완료';
  perform public.set_week_step('2024-12-01', 'verify');  -- 0025 검증 단계
  assert (select count(*) from week_step where sunday = '2024-12-01') = 3, '검증 단계 완료';
  perform public.set_week_step('2024-12-01', 'verify', false);
  perform public.set_week_step('2024-12-01', 'income_report', false);
  assert (select count(*) from week_step where sunday = '2024-12-01') = 1, '완료 취소';
  begin
    perform public.set_week_step('2024-12-02', 'income');
    raise exception 'should fail';
  exception when others then assert sqlerrm like '주일 날짜가 아닙니다%', sqlerrm; end;
  begin
    perform public.set_week_step('2024-12-01', 'nope');
    raise exception 'should fail';
  exception when check_violation then null; end;

  -- 은행 출금 거래를 지출입력으로 보내 저장하면 bank_tx_id 가 붙고, 조회 뷰에 지출 연결이 보인다
  perform public.import_bank_tx(null, '농협_출금.xlsx', '[{"tx_at":"2024-11-27T10:00:00+09:00","withdraw":33000,"deposit":0,"description":"전기요금"}]');
  select id into t from bank_tx where description = '전기요금' and withdraw = 33000;
  n := public.save_week_expense('2024-12-01', format('[{"dept":"관리부","item":"공공요금","content":"전기요금","amount":33000,"source":"은행","bank_tx_id":%s}]', t)::jsonb);
  assert n = 1, '지출 1건';
  assert (select expense_content from v_bank_tx where id = t) = '전기요금', '뷰에 지출 연결';
  assert (select expense_sunday from v_bank_tx where id = t) = '2024-12-01', '지출 주일';
  -- 같은 행을 다시 저장(id 유지)해도 연결 유지, 화면에서 지우면 지출도 지워진다
  n := public.save_week_expense('2024-12-01', format('[{"id":%s,"dept":"관리부","item":"공공요금","content":"전기요금(수정)","amount":33000,"source":"은행"}]',
                                (select id from expense where bank_tx_id = t))::jsonb);
  assert (select bank_tx_id from expense where content = '전기요금(수정)') = t, '연결 유지';
  n := public.save_week_expense('2024-12-01', '[]');
  assert n = 0 and (select expense_id from v_bank_tx where id = t) is null, '지출 지우면 연결 해제';

  insert into offering_carryover (year, offering_type_id, amount) select 2024, id, 1000 from offering_type where name = '이웃사랑';
  assert (select amount from offering_carryover where year = 2024) = 1000, '구분별 이월';
end $$;
reset role;
