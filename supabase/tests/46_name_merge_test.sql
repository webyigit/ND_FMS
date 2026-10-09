-- 이름합치기 검증: 오기입 교인을 대표로 합치기 → 조회 뷰·영수증 대상 반영 → 되돌리기 (가상 데이터)
\set ON_ERROR_STOP 1
update app_user set role = 'viewer', status = 'approved' where id = '00000000-0000-0000-0000-00000000000b';

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$
declare ma bigint; mb bigint; mc bigint; md bigint; sp bigint; hh bigint; wk int;
  tithe int := (select id from offering_type where name = '십일조');
  raw_before bigint;
begin
  wk := public.week_for('2026-09-06');
  insert into member (name) values ('가상대표') returning id into ma;
  insert into member (name) values ('가상대포') returning id into mb;  -- 오기입 1
  insert into member (name) values ('가상데표') returning id into mc;  -- 오기입 2
  insert into member (name) values ('가상다른') returning id into md;
  insert into member (name) values ('가상배우') returning id into sp;
  hh := public.join_family(mb, sp);   -- 오기입 교인이 가족에 묶여 있던 경우
  insert into income (week_id, offering_type_id, member_id, payer_label, amount) values
    (wk, tithe, ma, '가상대표', 100000), (wk, tithe, mb, '가상대포', 20000), (wk, tithe, mc, '가상데표', 3000), (wk, tithe, md, '가상다른', 7);
  select sum(amount) into raw_before from income where member_id in (ma, mb, mc, md);

  -- mc 를 mb 에 먼저 합쳤다가, mb 를 ma 에 합치면 mc 도 ma 로 따라간다
  assert public.merge_members(mb, array[mc]) = 1, 'c→b';
  assert public.merge_members(ma, array[mb, ma]) = 1, 'b→ma (자기 자신은 건너뜀)';
  assert (select merged_into from member where id = mc) = ma and (select merged_into from member where id = mb) = ma, '한 단계로 펼침';
  assert (select into_id from name_merge where member_id = mc and undone_at is null) = ma, '기록도 새 대표로';
  assert not (select active from member where id = mb) and (select household_id from member where id = mb) is null, '숨기고 가족에서 뺌';

  -- 원본 수입은 그대로, 뷰는 대표로 합산
  assert (select count(*) from income where member_id = mb) = 1 and (select sum(amount) from income where member_id in (ma, mb, mc, md)) = raw_before, '원본 유지';
  assert (select sum(amount) from v_income_person where year = 2026 and member_id = ma) = 123000, '개인별 합산';
  assert not exists (select 1 from v_income_person where member_id in (mb, mc)), '합쳐진 이름은 따로 안 나옴';
  assert (select sum(amount) from v_income where year = 2026 and member_id = ma) = 123000, '영수증 계산용 v_income 도 대표로';
  assert (select member_name from v_income where raw_member_id = mb) = '가상대표', '이름도 대표';
  assert (select payer_label from v_income where raw_member_id = mb) = '가상대포', '원문 표기는 그대로';
  assert (select merged_into_name from v_member where id = mb) = '가상대표', 'v_member 표시';
  assert not exists (select 1 from public.receipt_donor_search('가상대') where member_id in (mb)), '영수증 대상 검색에서 빠짐';
  assert (select count(*) from v_name_merge where into_id = ma) = 2, '합친 기록 2건';
  assert (select n from v_member_income_stat where member_id = mb) = 1, '원래 연결 기준 통계';

  -- 막히는 경우
  begin perform public.merge_members(mb, array[md]);
    raise exception 'should fail';
  exception when others then assert sqlerrm like '대표(가상대포)는 이미%', sqlerrm; end;
  begin perform public.merge_members(md, array[mc]);
    raise exception 'should fail';
  exception when others then assert sqlerrm like '%이미 다른 이름에 합쳐져 있어요%', sqlerrm; end;

  -- 되돌리기: 따로 계산, 예전 가족으로 복귀(세대주 sp 가 있으니 세대주는 아님)
  perform public.unmerge_member(mb);
  assert (select merged_into from member where id = mb) is null and (select active from member where id = mb), '원래대로';
  assert (select household_id from member where id = mb) = hh and not (select is_household_head from member where id = mb), '가족 복귀';
  assert (select sum(amount) from v_income_person where year = 2026 and member_id = mb) = 20000, '따로 계산';
  assert (select sum(amount) from v_income_person where year = 2026 and member_id = ma) = 103000, 'c 는 여전히 ma 에';
  begin perform public.unmerge_member(mb);
    raise exception 'should fail';
  exception when others then assert sqlerrm = '합친 기록이 없습니다', sqlerrm; end;

  -- 후보 제외
  perform public.mark_not_same(md, ma);
  assert (select count(*) from member_not_same where a = least(ma, md)) = 1, '제외 저장(작은 id 먼저)';
  perform public.mark_not_same(ma, md, false);
  assert not exists (select 1 from member_not_same), '제외 취소';

  assert (select count(*) from audit_log where target_table = 'name_merge') >= 3, '사용내역';
end $$;

-- 조회 권한 회원: 실행 불가
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  begin perform public.merge_members(1, array[2::bigint]);
    raise exception 'should fail';
  exception when others then assert sqlerrm = '권한이 없습니다', sqlerrm; end;
  begin perform public.unmerge_member(1);
    raise exception 'should fail';
  exception when others then assert sqlerrm = '권한이 없습니다', sqlerrm; end;
  begin perform public.mark_not_same(1, 2);
    raise exception 'should fail';
  exception when others then assert sqlerrm = '권한이 없습니다', sqlerrm; end;
  assert (select count(*) from v_name_merge) = 0 and (select count(*) from v_member_income_stat) = 0, '뷰도 RLS';
end $$;
reset role;
select '이름합치기 테스트 통과';
