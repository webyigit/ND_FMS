-- 공지사항 채널: 부서장 / 성도 / 전체 (2026-10-07)
alter table notice rename column audience to channel;
alter table notice alter column channel set default 'all';
alter table notice add constraint notice_channel_check check (channel in ('dept_head','member','all'));
-- 성도(공개) 화면은 channel in ('member','all') 이고 게시된 공지만 읽기 허용
alter table notice enable row level security;
create policy notice_public_read on notice for select
  using (published_at is not null and channel in ('member','all'));
