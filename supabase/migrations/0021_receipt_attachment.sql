-- 기부금영수증 첨부 양식: 영수증과 함께 출력·제출하는 양식 파일 (2026-10-08)
-- 파일은 Supabase Storage 비공개 버킷 receipt-attachments(무료 플랜, 파일당 50MB까지)에 두고 DB에는 목록만 둔다.
-- 저장소 파일 이름은 영문 키(uuid.확장자)로 하고, 한글 원래 이름은 file_name에 남겨 내려받을 때 쓴다.
create table public.receipt_attachment (
  id serial primary key,
  name text not null check (length(btrim(name)) > 0),  -- 양식 이름(화면 표시)
  memo text,
  file_name text not null,                             -- 올린 파일의 원래 이름
  storage_path text not null unique,                   -- 버킷 안 경로
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  active boolean not null default true,                -- 영수증 출력 화면에 보이기
  sort_order int not null default 100,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.receipt_attachment enable row level security;
create policy receipt_attachment_finance on public.receipt_attachment for all
  using (public.is_finance()) with check (public.is_finance());

insert into storage.buckets (id, name, public, file_size_limit)
values ('receipt-attachments', 'receipt-attachments', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- 버킷 파일: 재정부원만 올리기·읽기·지우기
create policy receipt_attachments_finance on storage.objects for all to authenticated
  using (bucket_id = 'receipt-attachments' and public.is_finance())
  with check (bucket_id = 'receipt-attachments' and public.is_finance());
