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
