-- 재정부게시판: 재정부원(admin/treasurer)만 읽고 쓰는 일반 게시판
create table board_post (
  id bigserial primary key,
  title text not null,
  body text not null default '',
  author_id uuid references app_user(id),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index on board_post (pinned desc, created_at desc);
alter table board_post enable row level security;
create policy board_post_finance on board_post for all
  using (exists (select 1 from app_user u where u.id = auth.uid() and u.status = 'approved' and u.role in ('admin','treasurer')))
  with check (exists (select 1 from app_user u where u.id = auth.uid() and u.status = 'approved' and u.role in ('admin','treasurer')));
