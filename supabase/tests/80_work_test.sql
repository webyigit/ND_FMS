-- 업무·신청관리·부서장 모바일 검증 (가상 데이터). 10_rls_test 의 관리자(...0a)를 쓴다.
\set ON_ERROR_STOP 1
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000080c1', 'head@example.test', '{"name":"가나부서장"}'),
  ('00000000-0000-0000-0000-0000000080c2', 'pastor@example.test', '{"name":"다라목사"}'),
  ('00000000-0000-0000-0000-0000000080c3', 'other@example.test', '{"name":"마바부서장"}');
update app_user set status = 'approved', role = 'dept_head' where id in ('00000000-0000-0000-0000-0000000080c1', '00000000-0000-0000-0000-0000000080c3');
update app_user set status = 'approved', role = 'pastor' where id = '00000000-0000-0000-0000-0000000080c2';
insert into user_department values
  ('00000000-0000-0000-0000-0000000080c1', (select id from department where name = '관리부')),
  ('00000000-0000-0000-0000-0000000080c3', (select id from department where name = '음악부'));
insert into budget (year, expense_item_id, amount)
select 2026, ei.id, 1000000 from expense_item ei join department d on d.id = ei.department_id where d.name = '관리부' and ei.name = '인쇄비';

select set_config('test.music', id::text, false) from department where name = '음악부';
set role authenticated;

-- 부서장: 자기 부서만 보고, 자기 부서로만 신청
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000080c1';
do $$ declare rid bigint; n int; begin
  assert (select count(*) from department) = 1 and (select name from department) = '관리부', '연결된 부서만';
  assert (select count(*) from expense_item) > 0 and not exists (select 1 from expense_item ei where ei.department_id <> (select id from department)), '자기 부서 항목만';
  assert (select count(*) from budget) = 1, '자기 부서 예산만';
  assert (select count(*) from expense) = 0, '지출 표는 직접 못 본다';
  assert (select count(*) from payee) = 0, '계좌 표는 못 본다';
  assert (select count(distinct department_id) from public.dept_budget_status(2026)) = 1, '집계는 자기 부서만';
  assert (select sum(budget) from public.dept_budget_status(2026)) = 1000000, '예산 합계';
  assert (select count(*) from public.dept_expenses(2026, (select id from department d where d.name = '관리부'))) >= 0;

  rid := public.save_expense_request(null, (select id from department), '복사지 구입', 45000, '2026-10-06',
                                      'drive-file-0001', '가나은행', '123-456-789012', '가나부서장');
  assert (select status from expense_request where id = rid) = 'requested', '신청됨';
  assert (select requester_name from expense_request where id = rid) = '가나부서장', '신청자 이름';
  assert (select account from public.my_payee()) = '***-***-**9012', (select account from public.my_payee());
  -- 수정(계좌 비우면 그대로)
  perform public.save_expense_request(rid, (select id from department), '복사지 구입(A4)', 46000, '2026-10-06', 'drive-file-0001', null, null, null);
  assert (select amount from expense_request where id = rid) = 46000 and (select payee_id from expense_request where id = rid) is not null, '수정';

  begin
    perform public.save_expense_request(null, current_setting('test.music')::int, 'x', 1, null);
    raise exception 'should fail';
  exception when others then assert sqlerrm = '내 부서로만 신청할 수 있어요', sqlerrm; end;
  begin
    perform public.save_expense_request(null, null, 'x', 1, null);
    raise exception 'should fail';
  exception when others then assert sqlerrm = '부서를 골라 주세요', sqlerrm; end;
  begin
    update expense_request set status = 'approved' where id = rid;
    raise exception 'should fail';
  exception when others then assert sqlerrm = '신청 상태는 재정부만 바꿀 수 있어요', sqlerrm; end;
  begin
    perform public.approve_expense_request(rid, (select id from expense_item limit 1));
    raise exception 'should fail';
  exception when others then assert sqlerrm = '권한이 없습니다', sqlerrm; end;

  begin
    insert into expense_request (department_id, content, amount, payee_id) values ((select id from department), 'x', 1, (select min(id) from expense_request) * 0 + 999999);
    raise exception 'should fail';
  exception when others then assert sqlerrm = '내 계좌만 쓸 수 있어요', sqlerrm; end;
  -- 예산신청: 직접 입력, 다른 부서는 거절
  insert into budget_request (year, department_id, expense_item_id, amount, reason)
  values (2027, (select id from department), (select id from expense_item where name = '인쇄비'), 1200000, '주보 증면');
  assert (select requester_name from budget_request where reason = '주보 증면') = '가나부서장', '예산신청 이름';
  begin
    insert into budget_request (year, department_id, amount) values (2027, current_setting('test.music')::int, 1);
    raise exception 'should fail';
  exception when others then assert sqlerrm like '%신청할 수 있어요%' or sqlerrm like '%row-level security%', sqlerrm; end;

  -- TODO: 본인 것만
  insert into todo (due_date, content) values ('2026-10-09', '영수증 정리');
  assert (select count(*) from todo) = 1, '내 TODO';
  -- 게시판: 재정부원 아님
  assert (select count(*) from board_post) = 0, '부서장은 게시판 못 봄';
end $$;

-- 다른 부서장: 남의 신청을 못 본다
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000080c3';
do $$ begin
  assert (select count(*) from expense_request) = 0, '남의 신청 안 보임';
  assert (select count(*) from todo) = 0, '남의 TODO 안 보임';
  assert (select count(*) from public.dept_expenses(2026, (select ud.department_id from user_department ud
          join department d on d.id = ud.department_id where false))) = 0;
  assert (select count(*) from public.my_payee()) = 0, '내 계좌 없음';
end $$;

-- 목회자: 부서 없이 신청
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000080c2';
do $$ begin
  perform public.save_expense_request(null, null, '심방 다과', 30000, '2026-10-05');
  assert (select count(*) from expense_request) = 1, '목회자 본인 신청';
  begin
    perform public.save_expense_request(null, 1, 'x', 1, null);
    raise exception 'should fail';
  exception when others then assert sqlerrm = '내 부서로만 신청할 수 있어요', sqlerrm; end;
  begin
    insert into budget_request (year, department_id, amount) values (2027, 1, 1);
    raise exception 'should fail';
  exception when others then assert sqlerrm like '%row-level security%' or sqlerrm like '%신청할 수 있어요%', sqlerrm; end;
end $$;

-- 관리자: 목록·승인·반려, 공지·게시판
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ declare rid bigint; pid bigint; eid bigint; e record; begin
  rid := (select id from v_expense_request where requester_name = '가나부서장');
  assert (select account_masked from v_expense_request where id = rid) = '***-***-**9012', '목록은 가린 계좌';
  assert public.expense_request_account(rid) = '123-456-789012', '송금용 전체 계좌';
  assert (select drive_file_id from v_expense_request where id = rid) = 'drive-file-0001', '영수증 연결';
  assert position('789012' in encode((select account_no_enc from payee p join expense_request r on r.payee_id = p.id where r.id = rid), 'escape')) = 0, '계좌 평문 없음';

  eid := public.approve_expense_request(rid, (select ei.id from expense_item ei join department d on d.id = ei.department_id where d.name = '관리부' and ei.name = '사무용품비'), '2026-11-01');
  select * into e from v_expense where id = eid;
  assert e.sunday = '2026-11-01' and e.source = '신청' and e.requester_label = '가나부서장' and e.amount = 46000 and e.item = '사무용품비', '지출 생성';
  assert e.drive_file_id = 'drive-file-0001' and e.payee_id is not null, '영수증·계좌 이어받기';
  assert (select status::text || '/' || expense_id from expense_request where id = rid) = 'approved/' || eid, '승인·연결';
  begin
    perform public.approve_expense_request(rid, 1);
    raise exception 'should fail';
  exception when others then assert sqlerrm = '이미 처리된 신청이에요', sqlerrm; end;

  pid := (select id from expense_request where requester_name = '다라목사');
  begin
    perform public.reject_expense_request(pid, ' ');
    raise exception 'should fail';
  exception when others then assert sqlerrm = '반려 사유를 입력해 주세요', sqlerrm; end;
  perform public.reject_expense_request(pid, '영수증 필요');
  assert (select status from expense_request where id = pid) = 'rejected', '반려';

  perform public.review_budget_request((select id from budget_request where reason = '주보 증면'), true);
  assert (select status from budget_request where reason = '주보 증면') = 'approved', '예산 승인';
  assert (select count(*) from public.dept_budget_status(2026)) > 20, '재정부원은 전체 부서';
  assert (select sum(amount) from public.dept_expenses(2026, (select id from department where name = '관리부')) where content like '복사지%') = 46000, '부서 지출 내역';

  insert into notice (title, body, channel) values ('성도 공지', '본문', 'member'), ('부서장 공지', '본문', 'dept_head');
  assert (select count(*) from notice where published_at is not null and created_by = auth.uid()) >= 2, '공지 게시';
  insert into board_post (title, body, author_id, author_name) values ('인수인계', '내용', '00000000-0000-0000-0000-0000000080c1', '가짜');
  assert (select author_name from board_post where title = '인수인계') = '관리자', '작성자 이름은 본인';
  update board_post set author_name = '바꿈' where title = '인수인계';
  assert (select author_name || coalesce(updated_at::text, '') <> '관리자' and author_name = '관리자' from board_post where title = '인수인계'), '작성자 고정·수정일';
  assert (select count(*) from todo) = 0, '관리자도 남의 TODO 못 봄';
end $$;

-- 부서장: 승인 후 잠금, 공지는 부서장·전체 채널을 본다
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000080c1';
do $$ begin
  begin
    delete from expense_request where requester_name = '가나부서장';
    raise exception 'should fail';
  exception when others then assert sqlerrm = '검토가 끝난 신청은 바꿀 수 없어요', sqlerrm; end;
  assert (select status from v_expense_request) = 'approved', '승인 상태 보임';
  assert (select account_masked from v_expense_request) is null, '신청자 목록엔 계좌 칸 없음';
  assert (select drive_file_id from v_expense_request) = 'drive-file-0001', '내가 올린 영수증은 보임';
  assert exists (select 1 from notice where title = '부서장 공지'), '부서장 공지';
end $$;

-- 비로그인: 성도 공지만, 신청 함수 못 씀
reset request.jwt.claim.sub;
set role anon;
do $$ begin
  assert (select count(*) from notice where title in ('성도 공지', '부서장 공지')) = 1, '성도 공지만';
  assert (select count(*) from expense_request) = 0 and (select count(*) from todo) = 0 and (select count(*) from board_post) = 0, '비로그인 차단';
  begin
    perform public.save_expense_request(null, null, 'x', 1, null);
    raise exception 'should fail';
  exception when others then assert sqlerrm like 'permission denied%', sqlerrm; end;
end $$;
reset role;
-- 주간 지출 저장(지웠다 다시 넣기)이 신청 연결 때문에 막히지 않는다
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  perform public.save_week_expense('2026-11-01', '[]');
  assert (select expense_id from expense_request where requester_name = '가나부서장') is null, '연결만 끊김';
end $$;
reset role;
select '업무·신청관리 테스트 통과';
