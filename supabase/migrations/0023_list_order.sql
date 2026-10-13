-- 헌금명단 노출 순서(요구사항 2.1): 직분 순서(원로목사, 담임목사, 은퇴장로, 원로장로, 시무장로...) 먼저,
-- 같은 직분 안에서는 교인별 순서(member.display_rank, 임직순 등), 나머지 일반 성도는 가나다순. 관리자가 수정.
insert into app_setting (key, value) values
  ('list_title_order', '["원로목사", "담임목사", "은퇴장로", "원로장로", "시무장로"]'::jsonb)
on conflict (key) do nothing;

-- p_titles: 직분 순서. p_members: [{id, title, rank}] 바뀐 교인만(rank 비우면 지정 해제)
create or replace function public.save_list_order(p_titles text[], p_members jsonb default '[]') returns int
language plpgsql set search_path = public as $$
declare n int;
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  if exists (select 1 from unnest(coalesce(p_titles, '{}')) t where coalesce(trim(t), '') = '') then
    raise exception '빈 직분이 있어요';
  end if;
  insert into app_setting (key, value, updated_at) values ('list_title_order', to_jsonb(coalesce(p_titles, '{}')), now())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  update member m set
    title = nullif(trim(x->>'title'), ''),
    display_rank = nullif(x->>'rank', '')::int
  from jsonb_array_elements(coalesce(p_members, '[]')) x
  where m.id = (x->>'id')::bigint;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.save_list_order(text[], jsonb) from public, anon;
