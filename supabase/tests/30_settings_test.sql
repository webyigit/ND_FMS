-- 설정 모듈 검증: 교인·가족·주민번호, 헌금구분, 재직명단, 계좌 (가상 데이터, 10_rls_test 다음)
\set ON_ERROR_STOP 1
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ declare a bigint; b bigint; c bigint; hid bigint; r jsonb; n int; ot int; child int; acc int; pid bigint; t text; begin
  -- 교인 저장 + 주민번호 암호화(평문 없음), 목록은 마스킹
  a := public.save_member(jsonb_build_object('name', '설정가', 'title', '집사', 'district', '1교구', 'rrn', '9001011234567'));
  assert (select rrn_mask from v_member where id = a) = '900101-1******', '목록은 마스킹';
  assert (select position('900101' in encode(rrn_enc, 'escape')) from member where id = a) = 0, '평문 저장 금지';
  assert public.dec((select rrn_enc from member where id = a)) = '900101-1234567', '형식 맞춰 저장';
  -- 수정 때 주민번호를 비우면 기존 값 유지
  perform public.save_member(jsonb_build_object('id', a, 'name', '설정가', 'title', '권사'));
  assert (select title || '/' || has_rrn::text from v_member where id = a) = '권사/true', '주민번호 유지';
  begin
    perform public.set_member_rrn(a, '12345');
    raise exception 'should fail';
  exception when others then assert sqlerrm = '주민번호 13자리를 확인해 주세요', sqlerrm; end;
  -- 동명이인은 접미사 필요
  begin
    perform public.save_member(jsonb_build_object('name', '설정가'));
    raise exception 'should fail';
  exception when others then assert sqlerrm like '같은 이름%', sqlerrm; end;
  b := public.save_member(jsonb_build_object('name', '설정가', 'name_suffix', 'b'));
  assert (select full_name from v_member where id = b) = '설정가B', '접미사 대문자';

  -- 사용내역에는 암호문이 남지 않는다
  assert not exists (select 1 from audit_log where target_table = 'member' and (after::text like '%\\x%' or before::text like '%\\x%')), '사용내역에 암호문 없음';
  assert exists (select 1 from audit_log where target_table = 'member' and after->>'rrn_enc' = '(새로 입력됨)'), '주민번호 변경 표시';

  -- 가족: 묶기·세대주·빼기
  c := public.save_member(jsonb_build_object('name', '설정나'));
  hid := public.join_family(c, a);
  assert (select is_household_head from member where id = a) and not (select is_household_head from member where id = c), '기존 사람이 세대주';
  perform public.set_household_head(c);
  assert (select count(*) from member where household_id = hid and is_household_head) = 1, '세대주 한 명';
  assert (select is_household_head from member where id = c), '세대주 변경';
  perform public.leave_family(c);
  perform public.leave_family(a);
  assert not exists (select 1 from household where id = hid), '빈 가족 정리';

  -- 일괄 등록: 이미 있는 이름은 건너뜀
  r := public.import_members('[{"name":"설정다","title":"성도","district":"2교구","zone":"3구역","phone":"010-0000-0000"},{"name":"설정가"},{"name":""}]');
  assert (r->>'added')::int = 1 and r->'skipped' = '["설정가"]'::jsonb, r::text;

  -- 헌금구분: 상위 한 단계, 순서, 수입 있으면 비활성
  insert into offering_type (fund_id, name, amount_unit, sort_order) values ((select id from fund where code = 'general'), '감사헌금(테스트)', 1000, 90) returning id into ot;
  insert into offering_type (fund_id, parent_id, name, amount_unit, sort_order) values ((select id from fund where code = 'general'), ot, '범사(테스트)', 1000, 91) returning id into child;
  begin
    insert into offering_type (name, parent_id, amount_unit) values ('손자', child, 1);
    raise exception 'should fail';
  exception when others then assert sqlerrm = '상위 구분은 한 단계만 둘 수 있습니다', sqlerrm; end;
  begin
    update offering_type set amount_unit = 100 where id = ot;
    raise exception 'should fail';
  exception when others then assert sqlerrm like '입력 단위%', sqlerrm; end;
  perform public.reorder_offering_types(array[child, ot]);
  assert (select sort_order from offering_type where id = child) = 1, '순서 변경';
  assert public.remove_offering_type(ot) = 'deactivated', '하위가 있으면 비활성';
  assert public.remove_offering_type(child) = 'deleted', '쓰인 적 없으면 삭제';
  t := public.remove_offering_type((select id from offering_type where name = '십일조'));
  assert t = 'deactivated' and not (select active from offering_type where name = '십일조'), '수입이 있으면 비활성';
  update offering_type set active = true where name = '십일조';

  -- 재직명단 복사: 비활성 교인 제외, 중복 없음
  insert into officer_roster values (2025, a, '권사'), (2025, b, '집사');
  update member set active = false where id = b;
  n := public.copy_officer_roster(2025, 2026);
  assert n = 1, '활성 교인만 복사';
  n := public.copy_officer_roster(2025, 2026);
  assert n = 0, '다시 복사해도 중복 없음';

  -- 은행계좌: 주계좌 하나, 계좌번호 암호화·마스킹·전체보기 기록
  acc := public.save_bank_account('{"bank":"가상은행","holder":"교회","kind":"일반","is_primary":true,"account_no":"301-1234-5678-91"}');
  perform public.save_bank_account('{"bank":"나상은행","kind":"적금","is_primary":true}');
  assert (select count(*) from bank_account where is_primary) = 1, '주계좌 하나';
  assert (select account_mask from v_bank_account where id = acc) = '***-****-***8-91', '계좌 마스킹';
  assert public.reveal_account_no('bank_account', acc) = '301-1234-5678-91', '전체 보기';
  assert exists (select 1 from audit_log where action = 'reveal' and target_id = 'bank_account:' || acc), '전체 보기 기록';
  begin
    perform public.save_bank_account('{"bank":"x","kind":"기타"}');
    raise exception 'should fail';
  exception when others then assert sqlerrm like '%bank_account_kind_check%', sqlerrm; end;

  -- 송금계좌: 이름·교인·예금주로 찾기
  pid := public.save_payee(jsonb_build_object('name', '설정 가', 'member_id', a, 'bank', '가상은행', 'holder', '설정가', 'account_no', '123-456-789012'));
  perform public.save_payee('{"name":"업체가","bank":"나상은행","account_no":"999-888-777666","active":false}');
  assert (select count(*) from public.payee_accounts(array['설정가'])) = 1, '이름으로 찾기';
  assert (select account_no from public.payee_accounts(array['설정 가'])) = '123-456-789012', '복호화된 계좌';
  assert (select count(*) from public.payee_accounts(array['업체가'])) = 0, '비활성 제외';
end $$;

-- 재정부원이 아니면 읽기·저장·복호화 불가
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
reset role;
update app_user set role = 'viewer' where id = '00000000-0000-0000-0000-00000000000b';
set role authenticated;
do $$ begin
  assert (select count(*) from v_member) = 0, '교인 뷰 RLS';
  assert (select count(*) from v_payee) = 0, '송금계좌 뷰 RLS';
  assert (select count(*) from audit_log) = 0, '사용내역은 관리자만';
  begin
    perform public.save_member('{"name":"침입"}');
    raise exception 'should fail';
  exception when others then assert sqlerrm = '권한이 없습니다', sqlerrm; end;
  begin
    perform public.payee_accounts(array['설정가']);
    raise exception 'should fail';
  exception when others then assert sqlerrm = '권한이 없습니다', sqlerrm; end;
  begin
    perform public.copy_officer_roster(2025, 2027);
    raise exception 'should fail';
  exception when others then assert sqlerrm = '권한이 없습니다', sqlerrm; end;
end $$;
reset role;
reset request.jwt.claim.sub;
select '설정 테스트 통과';
