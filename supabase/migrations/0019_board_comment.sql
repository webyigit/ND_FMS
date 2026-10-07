-- 재정부게시판 댓글 (2026-10-07)
-- 재정부원(admin·treasurer)만 읽고 쓴다. 수정은 본인 댓글만, 삭제는 본인 또는 관리자.
create table board_comment (
  id bigserial primary key,
  post_id bigint not null references board_post(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  author_id uuid references app_user(id),
  author_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index on board_comment (post_id, created_at);

-- 작성자·작성일은 DB가 채우고 바꿀 수 없다
create or replace function public.board_comment_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.author_name := (select name from app_user where id = auth.uid());
    new.created_at := now();
    new.updated_at := null;
  else
    new.post_id := old.post_id;
    new.author_id := old.author_id;
    new.author_name := old.author_name;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end $$;
revoke execute on function public.board_comment_stamp() from public, anon, authenticated;
create trigger board_comment_stamp before insert or update on board_comment for each row execute function public.board_comment_stamp();

alter table board_comment enable row level security;
create policy board_comment_read on board_comment for select using (public.is_finance());
create policy board_comment_insert on board_comment for insert with check (public.is_finance());
create policy board_comment_update on board_comment for update
  using (public.is_finance() and author_id = auth.uid()) with check (public.is_finance());
create policy board_comment_delete on board_comment for delete
  using (public.is_finance() and (author_id = auth.uid() or public.is_admin()));
