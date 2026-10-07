-- TODO LIST (2026-10-07)
create table todo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_user(id) on delete cascade not null, -- 본인 것만 조회(RLS)
  due_date date not null,
  content text not null,
  done boolean not null default false,
  done_at timestamptz,
  naver_synced_at timestamptz,               -- 네이버 캘린더에 등록한 시각(등록 API 연동 시)
  created_at timestamptz default now()
);
create index on todo (user_id, done, due_date);
alter table todo enable row level security;
create policy todo_owner on todo using (user_id = auth.uid()) with check (user_id = auth.uid());
