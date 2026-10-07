-- 기부금영수증 검증: 발행번호·분할·수정·취소·재발행·주민번호 마스킹·공개 신청 (가상 데이터, 10_rls_test 다음)
\set ON_ERROR_STOP 1
reset role;
update app_user set role = 'viewer', status = 'approved' where id = '00000000-0000-0000-0000-00000000000b';
truncate request_rate_limit;

-- ===== 재정부원(관리자) =====
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ declare hh bigint; ma bigint; mb bigint; r donation_receipt; r2 donation_receipt; n int; g uuid; base int; begin
  -- 교회 정보: 작은 data URL만
  update church_info set name = '가나다교회', pastor = '가목사', reg_no = '000-00-00000', seal_image = 'data:image/png;base64,AAAA' where id = 1;
  assert (select seal_image from church_info) like 'data:image/png%', '직인 저장';
  begin
    update church_info set stamp_image = 'http://example.test/x.png' where id = 1;
    raise exception 'should fail';
  exception when check_violation then null; end;
  begin
    update church_info set stamp_image = 'data:image/png;base64,' || repeat('A', 300000) where id = 1;
    raise exception 'should fail';
  exception when check_violation then null; end;
  assert (select count(*) from receipt_form where is_default) = 1, '기본 양식 1개';

  insert into household (label) values ('가나다 가정') returning id into hh;
  insert into member (name, household_id, is_household_head, phone, address, rrn_enc)
    values ('가나다', hh, true, '010-1111-2222', '서울시 가상로 1', public.enc('900101-1234567')) returning id into ma;
  insert into member (name, household_id, phone) values ('가나라', hh, '010-3333-4444') returning id into mb;

  assert (select rrn_masked from receipt_donor_search('가나') where member_id = ma) = '900101-1******', '검색: 마스킹';
  assert (select family from receipt_donor_search('가나다') where member_id = ma) = array['가나라'], '검색: 가족';

  -- 발행번호: 기부 연도 2019(다른 테스트와 겹치지 않게) 기준 일련
  select coalesce(max(substring(serial_no from '^2019-PN(\d+)-')::int), 0) into base from donation_receipt where year = 2019;
  select * into r from issue_donation_receipts(jsonb_build_array(jsonb_build_object(
    'donation_year', 2019, 'donor_kind', 'PN', 'member_id', ma, 'donor_name', '가나다', 'donor_address', '서울시 가상로 1',
    'total_amount', 1200000, 'issued_amount', 1250000, 'adjustment_amount', 50000, 'adjustment_reason', '누락분',
    'detail', '{"types":{"십일조":1000000,"범사감사":200000}}'::jsonb,
    'sources', '[{"payer_label":"가나다","amount":1000000},{"payer_label":"가나다,가나라","amount":200000}]'::jsonb)), '2026-01-15');
  assert r.serial_no = format('2019-PN%s-0115', lpad((base + 1)::text, 3, '0')), r.serial_no;
  assert r.year = 2019 and r.donation_year = 2019 and r.status = 'issued', '연도·상태';
  assert (select donor_rrn_masked from v_donation_receipt where id = r.id) = '900101-1******', '교인 주민번호 사용·마스킹';
  assert (select rrn_front from v_donation_receipt where id = r.id) = '900101', '앞 6자리 검색';
  assert receipt_rrn(r.id) = '900101-1234567', '출력용 전체';
  assert (select count(*) from donation_receipt_source where receipt_id = r.id) = 2, '헌금 표기 묶음';
  assert position('900101' in encode(r.donor_rrn_enc, 'escape')) = 0, '평문 없음';

  -- 다음 번호, 법인 번호는 따로
  select * into r2 from issue_donation_receipts(jsonb_build_array(jsonb_build_object(
    'donation_year', 2019, 'donor_name', '라마바', 'donor_rrn', '850505-2345678', 'issued_amount', 10000)), '2026-01-16');
  assert r2.serial_no = format('2019-PN%s-0116', lpad((base + 2)::text, 3, '0')), r2.serial_no;
  assert (select donor_rrn_masked from v_donation_receipt where id = r2.id) = '850505-2******', '새 주민번호 암호화';
  begin
    perform issue_donation_receipts('[{"donation_year":2019,"donor_kind":"CP","donor_name":"가상상사","issued_amount":1}]', '2026-01-16');
    raise exception 'should fail';
  exception when others then assert sqlerrm = '사업자번호 형식을 확인해 주세요', sqlerrm; end;
  select * into r2 from issue_donation_receipts('[{"donation_year":2019,"donor_kind":"CP","donor_name":"가상상사","donor_brn":"123-45-67890","donor_rep_name":"가대표","issued_amount":30000}]', '2026-01-16');
  assert r2.serial_no like '2019-CP%-0116' and r2.donor_rrn_enc is null, r2.serial_no;
  begin
    perform issue_donation_receipts('[{"donation_year":2019,"donor_name":"x","donor_rrn":"9001011234567","issued_amount":1}]');
    raise exception 'should fail';
  exception when others then assert sqlerrm = '주민번호 형식을 확인해 주세요', sqlerrm; end;
  begin
    perform issue_donation_receipts('[{"donation_year":2099,"donor_name":"x","issued_amount":1}]');
    raise exception 'should fail';
  exception when others then assert sqlerrm = '기부 연도를 확인해 주세요', sqlerrm; end;

  -- 부부 비율 분할: 같은 묶음, 번호 각각
  select count(*), count(distinct split_group), min(split_group::text)::uuid into n, base, g from issue_donation_receipts(jsonb_build_array(
    jsonb_build_object('donation_year', 2019, 'member_id', ma, 'donor_name', '가나다', 'issued_amount', 600000, 'split_ratio', 60),
    jsonb_build_object('donation_year', 2019, 'member_id', mb, 'donor_name', '가나라', 'donor_rrn', '920202-2345678', 'issued_amount', 400000, 'split_ratio', 40)), '2026-01-17');
  assert n = 2 and base = 1 and g is not null, '분할 2건 같은 묶음';
  assert (select count(distinct serial_no) from donation_receipt where split_group = g) = 2, '분할 번호 각각';

  -- 수정: 번호 유지, 주민번호는 비우면 그대로
  r2 := update_donation_receipt(r.id, '{"donor_name":"가나다","donor_address":"서울시 가상로 2","issued_amount":1300000,"sources":[{"payer_label":"가나다","amount":1300000}]}');
  assert r2.serial_no = r.serial_no and r2.issued_amount = 1300000 and r2.donor_address = '서울시 가상로 2', '수정';
  assert public.dec(r2.donor_rrn_enc) = '900101-1234567', '주민번호 유지';
  assert (select count(*) from donation_receipt_source where receipt_id = r.id) = 1, '표기 교체';

  -- 재발행: 원본 reissued, 새 번호, 주민번호 이어받기
  select * into r2 from issue_donation_receipts(jsonb_build_array(jsonb_build_object(
    'donation_year', 2019, 'donor_name', '가나다', 'issued_amount', 1300000, 'reissue_of_id', r.id)), '2026-02-01');
  assert (select status from donation_receipt where id = r.id) = 'reissued', '원본 재발행됨';
  assert r2.reissue_of_id = r.id and r2.serial_no like '2019-PN%-0201' and public.dec(r2.donor_rrn_enc) = '900101-1234567', '재발행';
  begin
    perform update_donation_receipt(r.id, '{"donor_name":"x","issued_amount":1}');
    raise exception 'should fail';
  exception when others then assert sqlerrm = '발행 상태인 영수증만 고칠 수 있습니다', sqlerrm; end;

  -- 취소: 사유 필수
  begin
    perform cancel_donation_receipt(r2.id, ' ');
    raise exception 'should fail';
  exception when others then assert sqlerrm = '취소 사유를 넣어 주세요', sqlerrm; end;
  perform cancel_donation_receipt(r2.id, '중복 발행');
  assert (select status from donation_receipt where id = r2.id) = 'canceled', '취소';
  assert (select count(*) from audit_log where target_table = 'donation_receipt') >= 5, '사용내역';
end $$;

-- ===== 공개 신청 (로그인 없음) =====
reset role;
set role anon;
set request.jwt.claim.sub = '';
do $$ declare res jsonb; begin
  res := submit_donation_request('{"name":"가나다","rrn":"900101-1234567","phone":"010-1111-2222","address":"서울시 가상로 1","note":"가족 합산","family_names":["가나라"],"consent":true,"year":2025,"fp":"abc123"}');
  assert (res->>'ok')::boolean and res->>'request_no' like 'D______-____', res::text;
  assert res::text not like '%900101%', '응답에 주민번호 없음';
  -- 이전 신청자: 성명+휴대폰만, 지난 정보는 돌려주지 않는다
  res := submit_donation_request('{"name":"가나다","phone":"01011112222","consent":true,"returning":true,"year":2025}');
  assert (res->>'ok')::boolean and res::text not like '%가상로%', res::text;
  res := submit_donation_request('{"name":"없는사람","phone":"01099998888","consent":true,"returning":true}');
  assert not (res->>'ok')::boolean and res->>'error' like '일치하는 지난 신청이 없어요%', res::text;
  res := submit_donation_request('{"name":"가나다","rrn":"900101-1234567","phone":"010-5555-6666","address":"x","consent":false}');
  assert res->>'error' = '개인정보 수집·이용에 동의해 주세요', res::text;
  res := submit_donation_request('{"name":"가나다","rrn":"123","phone":"010-5555-6666","address":"x","consent":true}');
  assert res->>'error' = '주민등록번호 13자리를 확인해 주세요', res::text;
  res := submit_donation_request('{"name":"가나다","phone":"010-5555-6666","consent":"이상한값"}');
  assert res->>'error' = '입력을 확인해 주세요', res::text;
  -- 숨김 칸(봇)
  res := submit_donation_request('{"name":"봇","rrn":"900101-1234567","phone":"010-7777-8888","address":"x","consent":true,"website":"spam"}');
  assert not (res->>'ok')::boolean, '봇 거절';
  -- 같은 전화 1시간 5회 넘으면 거절(실패한 시도도 센다)
  res := submit_donation_request('{"name":"가나다","phone":"010-5555-6666","consent":true,"returning":true}');
  res := submit_donation_request('{"name":"가나다","phone":"010-5555-6666","consent":true,"returning":true}');
  res := submit_donation_request('{"name":"가나다","phone":"010-5555-6666","consent":true,"returning":true}');
  assert res->>'error' like '요청이 너무 많아요%', res::text;
  -- 테이블 직접 접근 불가
  assert (select count(*) from donation_request) = 0, '익명은 신청 목록을 못 본다';
  assert (select count(*) from request_rate_limit) = 0, '익명은 제한 기록을 못 본다';
  begin
    insert into donation_request (year, name, consent_at) values (2025, 'x', now());
    raise exception 'should fail';
  exception when insufficient_privilege then null; end;
  begin
    perform public.enc('x');
    raise exception 'should fail';
  exception when insufficient_privilege then null; end;
  begin
    perform issue_donation_receipts('[]');
    raise exception 'should fail';
  exception when insufficient_privilege then null; end;
end $$;

-- ===== 조회 권한 회원: 신청·영수증 못 봄 =====
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select count(*) from v_donation_request) = 0, '조회 회원은 신청 못 봄';
  assert (select count(*) from v_donation_receipt) = 0, '조회 회원은 영수증 못 봄';
  begin
    perform issue_donation_receipts('[{"donation_year":2019,"donor_name":"x","issued_amount":1}]');
    raise exception 'should fail';
  exception when others then assert sqlerrm = '권한이 없습니다', sqlerrm; end;
end $$;

-- ===== 재정부원: 신청 검토 → 발행 =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ declare q record; r donation_receipt; begin
  select * into q from v_donation_request where name = '가나다' and not is_returning order by id desc limit 1;
  assert q.rrn_masked = '900101-1******' and q.phone = '010-1111-2222', '신청: 마스킹·전화 정리';
  assert q.member_name = '가나다', '성명+휴대폰으로 교인 연결';
  assert (select has_rrn and address = '서울시 가상로 1' from v_donation_request where name = '가나다' and is_returning order by id desc limit 1), '이전 신청 정보 이어쓰기';
  select * into r from issue_donation_receipts(jsonb_build_array(jsonb_build_object(
    'donation_year', 2019, 'donor_name', q.name, 'issued_amount', 5000, 'request_id', q.id)), '2026-03-01');
  assert public.dec(r.donor_rrn_enc) = '900101-1234567' and r.request_id = q.id, '신청서 주민번호로 발행';
  assert (select status = 'done' and donation_receipt_id = r.id from donation_request where id = q.id), '신청 완료 처리';
  update donation_request set status = 'rejected', review_note = '중복 신청' where name = '가나다' and is_returning;
  assert (select count(*) from donation_request where status = 'rejected') >= 1, '반려';
end $$;
reset role;
select '기부금영수증 테스트 통과';
