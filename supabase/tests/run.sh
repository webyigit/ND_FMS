#!/usr/bin/env bash
# 로컬 Postgres로 마이그레이션·seed·권한 검증: PGHOST/PGPORT/PGUSER 를 맞추고 실행
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-ndfms_test}
dropdb --if-exists "$DB" && createdb "$DB"
for f in tests/00_supabase_stub.sql migrations/*.sql seed.sql seed.sql tests/[1-9]*_test.sql; do
  psql -q -X -v ON_ERROR_STOP=1 -d "$DB" -f "$f" > /dev/null
done
psql -X -At -d "$DB" -c "select 'ok: ' || (select count(*) from offering_type) || ' offering types, ' || (select count(*) from expense_item) || ' items'"
echo "RLS 테스트 통과"
