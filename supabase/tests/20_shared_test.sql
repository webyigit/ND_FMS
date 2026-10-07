-- 공통 기반 검증: 암호화·마스킹·뷰 (10_rls_test 다음에 실행)
\set ON_ERROR_STOP 1
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ declare b bytea; begin
  b := public.enc('900101-1234567');
  assert b is not null and position('900101' in encode(b, 'escape')) = 0, '암호문에 평문 없음';
  assert public.dec(b) = '900101-1234567', '복호화';
  assert public.mask(b) = '900101-1******', public.mask(b);
  assert public.mask(public.enc('301-1234-5678-91'), 'account') = '***-****-***8-91', public.mask(public.enc('301-1234-5678-91'), 'account');
  assert (select count(*) from v_income) >= 1, '수입 뷰';
  assert (select count(*) from v_expense) >= 1, '지출 뷰';
  perform public.log_event('view', '/dashboard');
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
update app_user set status = 'pending' where false; -- no-op
reset role;
update app_user set role = 'viewer' where name = '신규';
set role authenticated;
do $$ begin
  assert public.dec(public.enc('x')) is null, '재정부원이 아니면 암호화·복호화 불가';
  assert (select count(*) from v_income) = 0, '뷰도 RLS 적용';
end $$;
reset role;
select '공통 기반 테스트 통과';
