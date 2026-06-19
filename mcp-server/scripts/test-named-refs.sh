#!/usr/bin/env bash
# test-named-refs.sh — proof harness for named refs (`ref:<slug>`) becoming
# first-class: ref-grammar validation at the write boundary + newest-first
# resolution of a moving ref. Spins up a DISPOSABLE postgres DB, migrates it with
# the REAL migrate.ts, runs the named-refs contract test via vitest, and drops
# everything on exit (even on failure). Never touches the production `mandrel` DB.
#
# Usage:  bash scripts/test-named-refs.sh
set -uo pipefail

MCP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_SQL="$MCP_DIR/database/init/00-extensions.sql"
PGSUPER="sudo -u postgres"

SFX="$$_$(date +%s)"
DBNAME="th_refs_${SFX}"
DBUSER="th_refs_role_${SFX}"
DBPASS="throwaway_$(date +%s%N | sha1sum | cut -c1-16)"

cleanup() {
  $PGSUPER dropdb --if-exists "$DBNAME" >/dev/null 2>&1
  $PGSUPER psql -q -c "DROP ROLE IF EXISTS \"$DBUSER\";" >/dev/null 2>&1
  echo "🧹 Dropped disposable DB $DBNAME and role $DBUSER"
}
trap cleanup EXIT

echo "🧱 Creating disposable DB: $DBNAME (role: $DBUSER)"
$PGSUPER psql -q -c "DROP ROLE IF EXISTS \"$DBUSER\";" >/dev/null 2>&1
$PGSUPER psql -q -c "CREATE ROLE \"$DBUSER\" LOGIN PASSWORD '$DBPASS';" >/dev/null
$PGSUPER createdb -O "$DBUSER" "$DBNAME" >/dev/null
$PGSUPER psql -d "$DBNAME" -q -f "$EXT_SQL" >/dev/null

echo "🔄 Migrating disposable DB with real migrate.ts ..."
( cd "$MCP_DIR" && \
  DATABASE_NAME="$DBNAME" DATABASE_USER="$DBUSER" DATABASE_PASSWORD="$DBPASS" \
  DATABASE_HOST="localhost" DATABASE_PORT="5432" NODE_ENV="development" \
  npx tsx scripts/migrate.ts ) >/tmp/refs_migrate_${SFX}.log 2>&1
MRC=$?
if [ $MRC -ne 0 ]; then
  echo "❌ Migration failed (exit $MRC). Log tail:"
  tail -20 /tmp/refs_migrate_${SFX}.log
  exit 1
fi
echo "✅ Migration complete"

echo "🧪 Running named-refs contract test ..."
( cd "$MCP_DIR" && \
  DATABASE_NAME="$DBNAME" DATABASE_USER="$DBUSER" DATABASE_PASSWORD="$DBPASS" \
  DATABASE_HOST="localhost" DATABASE_PORT="5432" NODE_ENV="test" \
  EMBEDDING_PREFER_LOCAL="false" \
  npx vitest run src/tests/namedRefs.contract.test.ts )
TRC=$?

echo ""
if [ $TRC -eq 0 ]; then
  echo "✅ CONTRACT TEST PASSED"
else
  echo "❌ CONTRACT TEST FAILED (exit $TRC)"
fi
exit $TRC
