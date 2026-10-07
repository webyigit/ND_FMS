-- Supabase 보안 점검(advisors) 반영 (2026-10-07)
-- 트리거 전용 함수는 API(rpc)로 직접 호출하지 못하게 한다. 트리거 실행에는 EXECUTE 권한이 필요 없다.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.write_audit() from public, anon, authenticated;
alter function public.keep_one_admin() set search_path = public;
-- my_role·is_finance·is_admin 은 RLS 정책 안에서 호출되므로 실행 권한을 유지한다(미승인·비로그인은 null/false).
