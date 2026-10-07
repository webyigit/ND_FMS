# ND_FMS (NDFMS2)

재정관리시스템. 기존 Namdcch_FMS를 대체하는 새 버전.

- 구축계획: [docs/구축계획_261007_v1.md](docs/구축계획_261007_v1.md)
- 작업 방식: Claude 클라우드 세션 (PC·모바일), 작업마다 커밋·푸시

## 보안 원칙
- 실데이터(교인명단, 헌금내역, 주민번호, 계좌번호), 키·비밀번호는 커밋하지 않는다.
- 로컬 데이터는 `data/` 에 두며 git에서 제외된다.

## 개발
```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 핵심 로직 단위 테스트
```
- DB 스키마: `supabase/migrations/0001_init.sql`
- 원본 엑셀 구조: [docs/원본구조분석_261007_v1.md](docs/원본구조분석_261007_v1.md)
- Supabase 연결 전에는 수입입력 화면이 가상 데이터로 동작한다.

## DB 연결 (Supabase 무료 플랜)
연결값이 없으면 로그인 없이 가상 데이터로 도는 **데모 모드**다.

1. supabase.com 에서 새 프로젝트 생성 (Free, 지역 Seoul)
2. SQL Editor 에서 `supabase/migrations/0001~` 파일을 번호 순서대로 실행, 이어서 `supabase/seed.sql` (헌금구분·부서·항목 기본값)
3. Project Settings > API 의 URL·publishable(anon) 키를 배포 환경 변수 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 에 넣는다 (`.env.example` 참고, 커밋 금지)
4. Authentication > URL Configuration 의 Site URL·Redirect URL 에 배포 주소와 `/auth/callback` 추가
5. 앱에서 **처음 가입한 사람이 관리자**가 된다. 이후 가입자는 설정 > 회원설정에서 승인

권한: 승인된 관리자·재정부만 재정 화면과 데이터에 접근한다(DB 행 단위 보안, `0009_auth_rls.sql`).

로컬 검증: `PGHOST=… PGPORT=… PGUSER=… supabase/tests/run.sh` (Postgres 16에서 마이그레이션·seed·권한 테스트)
