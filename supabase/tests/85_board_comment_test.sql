-- 재정부게시판 댓글 검증 (가상 데이터). 80_work_test 의 '인수인계' 글과 관리자(...0a), 부서장(...80c1)을 쓴다.
\set ON_ERROR_STOP 1
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000085d1', 'treasurer@example.test', '{"name":"재정부원"}');
update app_user set status = 'approved', role = 'treasurer' where id = '00000000-0000-0000-0000-0000000085d1';
select set_config('test.post', id::text, false) from board_post where title = '인수인계';
set role authenticated;

-- 재정부원: 댓글 쓰기, 작성자는 본인으로 고정
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000085d1';
do $$ declare cid bigint; begin
  insert into board_comment (post_id, body, author_id, author_name)
  values (current_setting('test.post')::bigint, '확인했습니다', '00000000-0000-0000-0000-00000000000a', '가짜') returning id into cid;
  assert (select author_name from board_comment where id = cid) = '재정부원', '작성자 이름은 본인';
  assert (select author_id from board_comment where id = cid) = '00000000-0000-0000-0000-0000000085d1', '작성자 id는 본인';
  update board_comment set body = '확인했습니다(수정)', author_name = '바꿈' where id = cid;
  assert (select body = '확인했습니다(수정)' and author_name = '재정부원' and updated_at is not null from board_comment where id = cid), '본인 수정·작성자 고정';
  begin
    insert into board_comment (post_id, body) values (current_setting('test.post')::bigint, '   ');
    raise exception 'should fail';
  exception when check_violation then null; end;
end $$;

-- 관리자: 남의 댓글은 못 고치지만 지울 수 있다
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ declare n int; begin
  insert into board_comment (post_id, body) values (current_setting('test.post')::bigint, '관리자 댓글');
  assert (select count(*) from board_comment) = 2, '재정부원은 모든 댓글을 본다';
  update board_comment set body = '관리자가 바꿈' where author_name = '재정부원';
  get diagnostics n = row_count;
  assert n = 0, '남의 댓글 수정 불가';
  delete from board_comment where author_name = '재정부원';
  get diagnostics n = row_count;
  assert n = 1, '관리자는 남의 댓글 삭제 가능';
end $$;

-- 재정부원: 남(관리자)의 댓글은 지울 수 없다
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000085d1';
do $$ declare n int; begin
  delete from board_comment where author_name = '관리자';
  get diagnostics n = row_count;
  assert n = 0, '남의 댓글 삭제 불가';
end $$;

-- 부서장·비로그인: 못 봄, 못 씀
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000080c1';
do $$ begin
  assert (select count(*) from board_comment) = 0, '부서장은 댓글 못 봄';
  begin
    insert into board_comment (post_id, body) values (current_setting('test.post')::bigint, 'x');
    raise exception 'should fail';
  exception when insufficient_privilege then null; end;
end $$;
reset request.jwt.claim.sub;
set role anon;
do $$ begin assert (select count(*) from board_comment) = 0, '비로그인 차단'; end $$;
reset role;

-- 글을 지우면 댓글도 지워진다
delete from board_post where title = '인수인계';
do $$ begin assert (select count(*) from board_comment) = 0, '글 삭제 시 댓글 삭제'; end $$;
