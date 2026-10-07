-- 모듈 연결 검증: 주간 재저장 시 행 id·지출신청 연결 유지
\set ON_ERROR_STOP 1
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ declare a bigint; b bigint; n int; begin
  n := public.save_week_expense('2022-01-02', jsonb_build_array(
    jsonb_build_object('dept', '관리부', 'item', '공공요금', 'content', '전기', 'amount', 1000),
    jsonb_build_object('dept', '관리부', 'item', '공공요금', 'content', '수도', 'amount', 2000)));
  select id into a from v_expense where sunday = '2022-01-02' and content = '전기';
  select id into b from v_expense where sunday = '2022-01-02' and content = '수도';
  update expense set fee = 500 where id = a;               -- 화면에 없는 칸
  -- 첫 행 고치고, 둘째 행 지우고, 새 행 추가
  n := public.save_week_expense('2022-01-02', jsonb_build_array(
    jsonb_build_object('id', a, 'dept', '관리부', 'item', '공공요금', 'content', '전기(수정)', 'amount', 1500),
    jsonb_build_object('dept', '관리부', 'item', '인쇄비', 'content', '주보', 'amount', 3000)));
  assert n = 2, n::text;
  assert (select content || '/' || amount || '/' || fee from expense where id = a) = '전기(수정)/1500/500', '같은 id·숨은 칸 유지';
  assert not exists (select 1 from expense where id = b), '지운 행 삭제';

  n := public.save_week_income('2022-01-02', jsonb_build_array(
    jsonb_build_object('offering_type_id', (select id from offering_type where name = '십일조'), 'payer_label', '가', 'amount', 10000)));
  select id into a from v_income where sunday = '2022-01-02';
  n := public.save_week_income('2022-01-02', jsonb_build_array(
    jsonb_build_object('id', a, 'offering_type_id', (select id from offering_type where name = '십일조'), 'payer_label', '가', 'amount', 20000)));
  assert (select amount from income where id = a) = 20000 and n = 1, '수입도 같은 id로 수정';
  -- 다른 주의 id를 보내도 그 행을 건드리지 않는다
  n := public.save_week_income('2022-01-09', jsonb_build_array(
    jsonb_build_object('id', a, 'offering_type_id', (select id from offering_type where name = '십일조'), 'payer_label', '나', 'amount', 1)));
  assert (select payer_label from income where id = a) = '가', '다른 주 행 보호';
end $$;
reset role;
select '연결 테스트 통과';
