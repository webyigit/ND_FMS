-- 명단순서 검증: 직분 순서 저장, 교인 직분·순서 지정/해제, 권한 (가상 데이터)
\set ON_ERROR_STOP 1
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ declare a bigint; b bigint; c bigint; begin
  assert (select value from app_setting where key = 'list_title_order') = '["원로목사", "담임목사", "은퇴장로", "원로장로", "시무장로"]'::jsonb, '요구사항 기본 순서';
  insert into member (name) values ('순서가') returning id into a;
  insert into member (name, title) values ('순서나', '권사') returning id into b;
  insert into member (name, title, display_rank) values ('순서다', '시무장로', 3) returning id into c;

  assert public.save_list_order(array['담임목사', '원로목사', '시무장로'], jsonb_build_array(
    jsonb_build_object('id', a, 'title', '담임목사', 'rank', 1),
    jsonb_build_object('id', b, 'title', '', 'rank', 2),
    jsonb_build_object('id', c, 'title', '시무장로', 'rank', null))) = 3, '3명 반영';
  assert (select value from app_setting where key = 'list_title_order') = '["담임목사", "원로목사", "시무장로"]'::jsonb, '순서 저장';
  assert (select title || display_rank from member where id = a) = '담임목사1', '직분·순서';
  assert (select title is null and display_rank = 2 from member where id = b), '빈 직분은 null';
  assert (select title = '시무장로' and display_rank is null from member where id = c), '순서 해제';
  -- 교인 목록 없이 직분 순서만
  assert public.save_list_order(array['원로목사'], '[]') = 0, '직분만';
  begin
    perform public.save_list_order(array['원로목사', ' '], '[]');
    raise exception 'should fail';
  exception when others then assert sqlerrm = '빈 직분이 있어요', sqlerrm; end;
  perform public.save_list_order(array['원로목사', '담임목사', '은퇴장로', '원로장로', '시무장로'], '[]');
end $$;

-- 조회 권한만 있으면 바꿀 수 없다
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  perform public.save_list_order(array['원로목사'], '[]');
  raise exception 'should fail';
exception when others then assert sqlerrm = '권한이 없습니다', sqlerrm; end $$;
reset role;
