-- 지출증빙 파일은 Google 드라이브(지출증빙/연/월)에 저장하고 DB에는 파일 ID만 둔다
alter table receipt_file add column if not exists drive_file_id text unique;
alter table receipt_file add column if not exists mime_type text;
alter table receipt_file add column if not exists size_bytes bigint;          -- 압축 후 크기
alter table receipt_file add column if not exists original_size_bytes bigint; -- 원본 크기
comment on column receipt_file.storage_path is '드라이브 저장 시 지출증빙/YYYY/MM/파일명 (표시용)';
