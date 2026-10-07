-- 수입관리 검증: 은행거래 올리기·중복 건너뛰기·수입 반영/되돌리기·집계 뷰 (가상 데이터, 10_rls_test 다음)
\set ON_ERROR_STOP 1
-- 신규 회원은 조회 권한으로 둔다(다른 테스트 순서와 무관하게)
update app_user set role = 'viewer', status = 'approved' where id = '00000000-0000-0000-0000-00000000000b';

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$
declare acc int; r jsonb; m1 bigint; m2 bigint; hh bigint; t_dep bigint; t_sun bigint; t_old bigint; t_out bigint;
  tithe int := (select id from offering_type where name = '십일조');
  thanks int := (select id from offering_type where name = '범사감사');
  rows jsonb;
begin
  -- 반영 주일: 평일은 직전 주일, 주일은 그날 (한국 시각)
  assert public.bank_tx_sunday('2026-10-14 10:00+09') = '2026-10-11', '수요일 → 직전 주일';
  assert public.bank_tx_sunday('2026-10-11 23:30+09') = '2026-10-11', '주일 당일';
  assert public.bank_tx_sunday('2026-10-10 16:00+00') = '2026-10-11', 'UTC 토요일 밤 = 한국 주일 새벽';

  insert into household (label) values ('가나다 가정') returning id into hh;
  insert into member (name, household_id, is_household_head) values ('가나다', hh, true) returning id into m1;
  insert into member (name, household_id) values ('라마바', hh) returning id into m2;
  insert into bank_account (bank, account_no_enc, holder, kind, is_primary)
  values ('농협', public.enc('301-1234-5678-91'), '재정부', '일반', false) returning id into acc;
  assert (select account_mask from v_bank_account where id = acc) = '***-****-***8-91', '계좌번호는 가려서';

  rows := jsonb_build_array(
    jsonb_build_object('tx_at', '2026-10-14T10:00:00+09:00', 'deposit', 100000, 'balance', 1100000, 'tx_type', '인터넷당행', 'description', '가나다십일조', 'suggested_offering_type_id', tithe, 'suggested_member_id', m1),
    jsonb_build_object('tx_at', '2026-10-18T09:00:00+09:00', 'deposit', 30000, 'balance', 1130000, 'description', '라마바범사'),
    jsonb_build_object('tx_at', '2026-10-06T09:00:00+09:00', 'deposit', 50000, 'balance', 1000000, 'description', '가나다감사'),
    jsonb_build_object('tx_at', '2026-10-15T11:00:00+09:00', 'withdraw', 20500, 'balance', 1109500, 'description', '전기요금'));
  r := public.import_bank_tx(acc, '농협_거래내역_가상.xlsx', rows);
  assert (r->>'inserted')::int = 4 and (r->>'skipped')::int = 0, r::text;
  assert (select period_from || '~' || period_to from bank_import where id = (r->>'import_id')::bigint) = '2026-10-06~2026-10-18', '기간';

  -- 같은 파일 다시: 모두 건너뜀, 빈 업로드 기록은 남기지 않음
  r := public.import_bank_tx(acc, '농협_거래내역_가상.xlsx', rows);
  assert (r->>'inserted')::int = 0 and (r->>'skipped')::int = 4 and r->'import_id' = 'null'::jsonb, r::text;
  -- 계좌 없이: 처음엔 저장, 다시 올리면 건너뜀(잔액 없는 거래 포함)
  r := public.import_bank_tx(null, 'x.xlsx', '[{"tx_at":"2026-10-14T12:00:00+09:00","deposit":7000,"description":"무명"}]');
  assert (r->>'inserted')::int = 1, r::text;
  r := public.import_bank_tx(null, 'x.xlsx', '[{"tx_at":"2026-10-14T12:00:00+09:00","deposit":7000,"description":"무명"},{"tx_at":"2026-10-14T12:00:00+09:00","deposit":7000,"description":"무명"}]');
  assert (r->>'inserted')::int = 0 and (r->>'skipped')::int = 2, r::text;

  select id into t_dep from bank_tx where description = '가나다십일조';
  select id into t_sun from bank_tx where description = '라마바범사';
  select id into t_old from bank_tx where description = '가나다감사';
  select id into t_out from bank_tx where description = '전기요금';
  assert (select suggested_member_id from bank_tx where id = t_dep) = m1, '제안값 저장';
  assert (select default_sunday from v_bank_tx where id = t_dep) = '2026-10-11', '뷰의 기본 주일';

  -- 반영: 수요일 입금 → 10-11 주, 주일 입금 → 그날, 주일 직접 지정
  assert public.link_bank_tx_to_income(jsonb_build_array(
    jsonb_build_object('bank_tx_id', t_dep, 'offering_type_id', tithe, 'member_id', m1, 'payer_label', '가나다'),
    jsonb_build_object('bank_tx_id', t_sun, 'offering_type_id', thanks, 'member_id', m2, 'payer_label', '라마바', 'memo', '가상'))) = 2, '2건 반영';
  assert (select w.sunday::text || '/' || i.channel || '/' || i.amount from income i join week w on w.id = i.week_id where i.bank_tx_id = t_dep) = '2026-10-11/online/100000', '직전 주일·이체·입금액';
  assert (select w.sunday from income i join week w on w.id = i.week_id where i.bank_tx_id = t_sun) = '2026-10-18', '주일 당일';
  assert (select linked from bank_tx where id = t_dep), '연결 표시';
  assert (select income_sunday || '/' || income_offering_type from v_bank_tx where id = t_dep) = '2026-10-11/십일조', '뷰에 반영 정보';

  -- 주간 입력 저장(save_week_income)은 은행 반영 행을 지우지 않는다
  perform public.save_week_income('2026-10-11', jsonb_build_array(
    jsonb_build_object('offering_type_id', (select id from offering_type where name = '주일헌금'), 'payer_label', '(총액)', 'channel', 'cash', 'amount', 400000)));
  assert (select count(*) from income where bank_tx_id = t_dep) = 1, '은행 반영 행 유지';

  -- 막히는 경우
  begin perform public.link_bank_tx_to_income(jsonb_build_array(jsonb_build_object('bank_tx_id', t_dep, 'offering_type_id', tithe)));
    raise exception 'should fail';
  exception when others then assert sqlerrm like '이미 수입으로 반영된 거래입니다%', sqlerrm; end;
  begin perform public.link_bank_tx_to_income(jsonb_build_array(jsonb_build_object('bank_tx_id', t_out, 'offering_type_id', tithe)));
    raise exception 'should fail';
  exception when others then assert sqlerrm = '입금 거래만 수입으로 반영할 수 있습니다', sqlerrm; end;
  begin perform public.link_bank_tx_to_income(jsonb_build_array(jsonb_build_object('bank_tx_id', t_old)));
    raise exception 'should fail';
  exception when others then assert sqlerrm like '헌금구분이 비어 있습니다%', sqlerrm; end;
  -- 10-06 거래 → 10-04 주(10_rls_test 에서 마감)
  begin perform public.link_bank_tx_to_income(jsonb_build_array(jsonb_build_object('bank_tx_id', t_old, 'offering_type_id', thanks)));
    raise exception 'should fail';
  exception when others then assert sqlerrm like '마감된 주입니다%', sqlerrm; end;
  assert not (select linked from bank_tx where id = t_old), '실패하면 그대로';
  begin perform public.link_bank_tx_to_income(jsonb_build_array(jsonb_build_object('bank_tx_id', t_old, 'offering_type_id', thanks, 'sunday', '2026-10-13')));
    raise exception 'should fail';
  exception when others then assert sqlerrm like '주일 날짜가 아닙니다%', sqlerrm; end;

  -- 집계 뷰
  assert (select sum(amount) from v_income_person where year = 2026 and household_id = hh) = 130000, '가족 합산';
  assert not exists (select 1 from v_income_person where offering_type = '주일헌금'), '주일헌금(총액)은 개인별에서 제외';
  assert (select sum(amount) from v_income_type_month where year = 2026 and month = 10 and channel = 'online') >= 130000, '월별 이체 합계';

  -- 되돌리기
  assert public.unlink_bank_tx(array[t_sun]) = 1, '1건 되돌림';
  assert not exists (select 1 from income where bank_tx_id = t_sun) and not (select linked from bank_tx where id = t_sun), '연결 해제';
  update week set closed = true where sunday = '2026-10-11';
  begin perform public.unlink_bank_tx(array[t_dep]);
    raise exception 'should fail';
  exception when others then assert sqlerrm like '마감된 주입니다%', sqlerrm; end;
  update week set closed = false where sunday = '2026-10-11';
  assert (select count(*) from audit_log where target_table = 'bank_import') >= 2, '업로드 기록';
end $$;

-- 조회 권한 회원: 실행·조회 불가
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  begin perform public.import_bank_tx(null, 'x', '[{"tx_at":"2026-10-14T12:00:00+09:00","deposit":1}]');
    raise exception 'should fail';
  exception when others then assert sqlerrm = '권한이 없습니다', sqlerrm; end;
  begin perform public.link_bank_tx_to_income('[]');
    raise exception 'should fail';
  exception when others then assert sqlerrm = '권한이 없습니다', sqlerrm; end;
  begin perform public.unlink_bank_tx(array[1::bigint]);
    raise exception 'should fail';
  exception when others then assert sqlerrm = '권한이 없습니다', sqlerrm; end;
  assert (select count(*) from v_bank_tx) = 0 and (select count(*) from v_income_person) = 0
     and (select count(*) from v_income_type_month) = 0 and (select count(*) from v_bank_account) = 0, '뷰도 RLS';
end $$;
reset role;
select '수입관리 테스트 통과';
