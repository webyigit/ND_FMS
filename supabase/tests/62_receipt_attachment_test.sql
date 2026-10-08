-- 기부금영수증 첨부 양식: 재정부원만 목록·파일 접근 (가상 데이터, 10_rls_test 다음)
\set ON_ERROR_STOP 1
reset role;
update app_user set role = 'viewer', status = 'approved' where id = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select public = false and file_size_limit = 52428800 from storage.buckets where id = 'receipt-attachments'), '비공개 버킷 50MB';
end $$;

-- ===== 재정부원 =====
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  insert into storage.objects (bucket_id, name) values ('receipt-attachments', 'test-a.pdf');
  insert into receipt_attachment (name, file_name, storage_path, mime_type, size_bytes)
    values ('개인정보 동의서', '동의서.pdf', 'test-a.pdf', 'application/pdf', 1234);
  assert (select count(*) from receipt_attachment where storage_path = 'test-a.pdf') = 1, '재정부원 목록 추가';
  assert (select created_by from receipt_attachment where storage_path = 'test-a.pdf') = '00000000-0000-0000-0000-00000000000a', '올린 사람';
  begin
    insert into receipt_attachment (name, file_name, storage_path) values ('  ', 'x.pdf', 'test-b.pdf');
    raise exception 'should fail';
  exception when check_violation then null; end;
  begin
    insert into receipt_attachment (name, file_name, storage_path) values ('중복', 'x.pdf', 'test-a.pdf');
    raise exception 'should fail';
  exception when unique_violation then null; end;
  -- 다른 버킷에는 이 정책으로 못 올린다
  begin
    insert into storage.objects (bucket_id, name) values ('other', 'x.pdf');
    raise exception 'should fail';
  exception when insufficient_privilege or foreign_key_violation then null; end;
end $$;

-- ===== 일반 회원(viewer): 목록·파일 모두 안 보임, 올리기 불가 =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select count(*) from receipt_attachment) = 0, 'viewer 목록 안 보임';
  assert (select count(*) from storage.objects where bucket_id = 'receipt-attachments') = 0, 'viewer 파일 안 보임';
  begin
    insert into storage.objects (bucket_id, name) values ('receipt-attachments', 'evil.pdf');
    raise exception 'should fail';
  exception when insufficient_privilege then null; end;
end $$;

-- ===== 정리 =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
delete from receipt_attachment where storage_path = 'test-a.pdf';
delete from storage.objects where bucket_id = 'receipt-attachments' and name = 'test-a.pdf';
reset role;
