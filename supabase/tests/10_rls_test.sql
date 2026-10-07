-- 로컬 검증: 가입 승인·권한·주간 저장 (가상 데이터). 실패 시 예외로 중단된다.
\set ON_ERROR_STOP 1
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@example.test', '{"name":"관리자"}'),
  ('00000000-0000-0000-0000-00000000000b', 'new@example.test', '{"name":"신규"}');

do $$ begin
  assert (select role::text || '/' || status from app_user where name = '관리자') = 'admin/approved', '첫 가입자는 관리자';
  assert (select role::text || '/' || status from app_user where name = '신규') = 'viewer/pending', '이후 가입자는 승인 대기';
end $$;

-- 승인 대기 회원: 재정 데이터·저장 불가
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select count(*) from offering_type) = 0, '대기 회원은 헌금구분을 못 본다';
  assert (select count(*) from app_user) = 1, '대기 회원은 자기 것만 본다';
  begin
    perform public.save_week_income('2026-10-04', '[]');
    raise exception 'should fail';
  exception when others then
    assert sqlerrm = '권한이 없습니다', sqlerrm;
  end;
  update app_user set role = 'admin', status = 'approved';  -- 스스로 승격 시도
  assert (select status::text from app_user) = 'pending', '스스로 승격 불가';
end $$;

-- 관리자: 승인, 수입·지출 저장
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ declare n int; begin
  update app_user set status = 'approved', role = 'treasurer' where name = '신규';
  assert (select approved_by from app_user where name = '신규') = '00000000-0000-0000-0000-00000000000a', '승인자 기록';

  n := public.save_week_income('2026-10-04', jsonb_build_array(
    jsonb_build_object('offering_type_id', (select id from offering_type where name = '십일조'), 'payer_label', '가나다', 'channel', 'cash', 'amount', 100000),
    jsonb_build_object('offering_type_id', (select id from offering_type where name = '주일헌금'), 'payer_label', '(총액)', 'channel', 'cash', 'amount', 500000)));
  assert n = 2, '수입 2건';
  -- 다시 저장하면 교체(중복 없음)
  n := public.save_week_income('2026-10-04', jsonb_build_array(
    jsonb_build_object('offering_type_id', (select id from offering_type where name = '십일조'), 'payer_label', '가나다', 'channel', 'online', 'amount', 200000)));
  assert (select count(*) from income) = 1 and (select amount from income) = 200000, '교체 저장';

  n := public.save_week_expense('2026-10-04', jsonb_build_array(
    jsonb_build_object('dept', '관리부', 'item', '공공요금', 'content', '전기요금', 'amount', 300000, 'source', '고정', 'drive_file_id', 'f1'),
    jsonb_build_object('dept', '음악부', 'item', '찬양대', 'content', '', 'amount', 50000, 'requester', '미등록')));
  assert n = 2, '지출 2건';
  assert (select count(*) from receipt_file) = 1, '증빙 파일 연결';
  assert (select content from expense where amount = 50000) = '찬양대', '내용 비면 항목명';

  begin
    perform public.save_week_expense('2026-10-04', '[{"dept":"없는부","item":"x","amount":1}]');
    raise exception 'should fail';
  exception when others then
    assert sqlerrm like '부서·항목을 찾을 수 없습니다%', sqlerrm;
  end;
  assert (select count(*) from expense) = 2, '실패 시 기존 지출 유지';

  begin
    perform public.save_week_income('2026-10-05', '[]');
    raise exception 'should fail';
  exception when others then
    assert sqlerrm like '주일 날짜가 아닙니다%', sqlerrm;
  end;

  update week set closed = true;
  begin
    perform public.save_week_income('2026-10-04', '[]');
    raise exception 'should fail';
  exception when others then
    assert sqlerrm like '마감된 주입니다%', sqlerrm;
  end;

  begin
    update app_user set role = 'viewer' where name = '관리자';
    raise exception 'should fail';
  exception when others then
    assert sqlerrm = '관리자가 최소 1명은 있어야 합니다', sqlerrm;
  end;
  assert (select count(*) from audit_log) >= 5, '사용내역 기록';
end $$;

-- 비로그인: 아무것도 못 본다
reset request.jwt.claim.sub;
set role anon;
do $$ begin
  assert (select count(*) from income) = 0, '비로그인은 수입을 못 본다';
  assert (select count(*) from clergy_pay_monthly) = 0, '급여 뷰도 막힘';
end $$;
reset role;
select 'RLS 테스트 통과' as result;
