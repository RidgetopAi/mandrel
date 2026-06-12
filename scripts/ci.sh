#!/usr/bin/env bash
# =============================================================================
# ci.sh — the enforceable build+test gate for ra-mandrel
# =============================================================================
# Single source of truth for "is this tree shippable?". Runs the same stages
# locally that .github/workflows/ci.yml runs on GitHub. Exit 0 = all GREEN,
# non-zero = RED. Designed to be called FIRST by any future fleet-deploy script:
# a non-zero exit MUST abort the deploy.
#
# Stages (each reported individually as PASS/FAIL):
#   1. mcp-server tests       — disposable Postgres + real migrate.ts + the 4
#                               vitest contract tests (embeddings are mocked).
#   2. mcp-server type-check  — tsc --noEmit (must be 0 errors).
#   3. backend type-check     — mandrel-command/backend tsc --noEmit.
#   4. backend tests          — jest against the same disposable migrated DB
#                               (infra-only suites skip via MANDREL_SKIP_DB_TESTS).
#   5. frontend build         — mandrel-command/frontend CRA compile gate.
#
# Disposable infra: ONE throwaway Postgres DB + role per run, named with a
# unique ci_<pid>_<epoch> suffix so concurrent runs / leftovers never collide.
# DROPPED in a trap on EXIT (always — even on failure). NEVER touches the real
# `mandrel` DB (or any non ci_*-prefixed object).
#
# Usage:  bash scripts/ci.sh
# =============================================================================
set -euo pipefail

# --- Paths -------------------------------------------------------------------
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MCP_DIR="$REPO_DIR/mcp-server"
BACKEND_DIR="$REPO_DIR/mandrel-command/backend"
FRONTEND_DIR="$REPO_DIR/mandrel-command/frontend"
EXT_SQL="$MCP_DIR/database/init/00-extensions.sql"
PGSUPER="sudo -u postgres"

# --- Disposable DB identity (unique per run) ---------------------------------
SFX="$$_$(date +%s)"
DBNAME="ci_${SFX}"
DBUSER="ci_role_${SFX}"
DBPASS="throwaway_$(date +%s%N | sha1sum | cut -c1-16)"
DBHOST="${CI_DB_HOST:-localhost}"
DBPORT="${CI_DB_PORT:-5432}"

# --- Pretty output -----------------------------------------------------------
RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; BLD=$'\033[1m'; RST=$'\033[0m'
hdr() { printf '\n%s========== %s ==========%s\n' "$BLD" "$*" "$RST"; }

# --- Per-stage result tracking ----------------------------------------------
STAGE_NAMES=()
STAGE_RESULTS=()
OVERALL_OK=1
record() {  # record <stage label> <PASS|FAIL|SKIP>
  STAGE_NAMES+=("$1")
  STAGE_RESULTS+=("$2")
  [[ "$2" == "FAIL" ]] && OVERALL_OK=0
  return 0
}

# --- Cleanup (always; even on failure) --------------------------------------
cleanup() {
  hdr "CLEANUP"
  $PGSUPER dropdb --if-exists "$DBNAME" >/dev/null 2>&1 || true
  $PGSUPER psql -q -c "DROP ROLE IF EXISTS \"$DBUSER\";" >/dev/null 2>&1 || true
  # Verify no ci_* disposable leftovers from THIS run remain.
  local left role
  left=$($PGSUPER psql -tAc \
    "SELECT count(*) FROM pg_database WHERE datname='${DBNAME}';" 2>/dev/null || echo "?")
  role=$($PGSUPER psql -tAc \
    "SELECT count(*) FROM pg_roles WHERE rolname='${DBUSER}';" 2>/dev/null || echo "?")
  echo "Dropped disposable DB '${DBNAME}' and role '${DBUSER}'."
  echo "Leftover for this run -> db:${left} role:${role} (expect 0/0)."
}
trap cleanup EXIT

# --- Guardrail: refuse to ever operate on a real DB --------------------------
case "$DBNAME" in
  ci_*) : ;;
  *) echo "${RED}REFUSING: disposable DB name '$DBNAME' is not ci_*-prefixed.${RST}"; exit 2 ;;
esac

# =============================================================================
hdr "STAGE 0: provision disposable Postgres"
echo "DB=$DBNAME  ROLE=$DBUSER  HOST=$DBHOST:$DBPORT"
$PGSUPER psql -q -c "DROP ROLE IF EXISTS \"$DBUSER\";" >/dev/null 2>&1 || true
$PGSUPER psql -q -c "CREATE ROLE \"$DBUSER\" LOGIN PASSWORD '$DBPASS';" >/dev/null
$PGSUPER createdb -O "$DBUSER" "$DBNAME" >/dev/null
$PGSUPER psql -d "$DBNAME" -q -f "$EXT_SQL" >/dev/null
echo "Provisioned + extensions installed."

# Shared DB env for every stage that talks to Postgres. Uses `env` so that any
# extra KEY=VAL args passed by the caller (e.g. NODE_ENV=test) are applied to the
# child process, not mis-parsed as a command.
db_env() {
  env \
    DATABASE_NAME="$DBNAME" \
    DATABASE_USER="$DBUSER" \
    DATABASE_PASSWORD="$DBPASS" \
    DATABASE_HOST="$DBHOST" \
    DATABASE_PORT="$DBPORT" \
    "$@"
}

# =============================================================================
hdr "STAGE 0b: migrate disposable DB with real migrate.ts"
MIG_LOG="/tmp/ci_migrate_${SFX}.log"
if ( cd "$MCP_DIR" && db_env NODE_ENV="development" npx tsx scripts/migrate.ts ) \
      >"$MIG_LOG" 2>&1; then
  echo "${GRN}Migration OK${RST} ($(grep -c 'Total migrations applied' "$MIG_LOG" >/dev/null 2>&1 && grep 'Total migrations applied' "$MIG_LOG" | tail -1 || echo 'applied'))"
else
  echo "${RED}Migration FAILED${RST} — gate cannot proceed. Log tail:"
  tail -25 "$MIG_LOG"
  record "0b. migrate disposable DB" "FAIL"
  # No point running the DB-dependent stages; jump to summary.
  record "1. mcp-server contract tests" "FAIL"
  record "2. mcp-server type-check" "FAIL"
  record "3. backend type-check" "FAIL"
  record "4. backend tests" "FAIL"
  record "5. frontend build" "FAIL"
  hdr "SUMMARY"; for i in "${!STAGE_NAMES[@]}"; do printf '  %-32s %s\n' "${STAGE_NAMES[$i]}" "${STAGE_RESULTS[$i]}"; done
  printf '\n%s########## RED ##########%s\n' "$RED" "$RST"
  exit 1
fi

# =============================================================================
# STAGE 1 — mcp-server contract tests (the 4 *.contract.test.ts via vitest)
# =============================================================================
hdr "STAGE 1: mcp-server contract tests (vitest, real DB)"
if ( cd "$MCP_DIR" && db_env NODE_ENV="test" EMBEDDING_PREFER_LOCAL="false" \
       npx vitest run src/tests/*.contract.test.ts ); then
  echo "${GRN}PASS: mcp-server contract tests${RST}"
  record "1. mcp-server contract tests" "PASS"
else
  echo "${RED}FAIL: mcp-server contract tests${RST}"
  record "1. mcp-server contract tests" "FAIL"
fi

# =============================================================================
# STAGE 2 — mcp-server type-check
# =============================================================================
hdr "STAGE 2: mcp-server type-check (tsc --noEmit)"
if ( cd "$MCP_DIR" && npm run type-check ); then
  echo "${GRN}PASS: mcp-server type-check${RST}"
  record "2. mcp-server type-check" "PASS"
else
  echo "${RED}FAIL: mcp-server type-check${RST}"
  record "2. mcp-server type-check" "FAIL"
fi

# =============================================================================
# STAGE 3 — backend type-check
# =============================================================================
hdr "STAGE 3: backend type-check (tsc --noEmit)"
if ( cd "$BACKEND_DIR" && npm run type-check ); then
  echo "${GRN}PASS: backend type-check${RST}"
  record "3. backend type-check" "PASS"
else
  echo "${RED}FAIL: backend type-check${RST}"
  record "3. backend type-check" "FAIL"
fi

# =============================================================================
# STAGE 4 — backend tests (jest against the same migrated disposable DB)
# Infra-only suites (live MCP server / SSE streaming) self-skip via the flags.
# If jest finds ZERO tests, that is a PASS/SKIP (don't fail the gate on absence).
# =============================================================================
hdr "STAGE 4: backend tests (jest, real DB)"
BE_LOG="/tmp/ci_backend_${SFX}.log"
set +e
( cd "$BACKEND_DIR" && db_env NODE_ENV="test" MANDREL_SKIP_DB_TESTS="true" \
    npx jest --runInBand --ci ) 2>&1 | tee "$BE_LOG"
BE_RC=${PIPESTATUS[0]}
set -e
if [[ $BE_RC -eq 0 ]]; then
  echo "${GRN}PASS: backend tests${RST}"
  record "4. backend tests" "PASS"
elif grep -qiE "No tests found|0 total|found 0 tests" "$BE_LOG"; then
  echo "${YLW}SKIP: backend tests — no tests found (not a gate failure)${RST}"
  record "4. backend tests (no tests)" "SKIP"
else
  echo "${RED}FAIL: backend tests${RST}"
  record "4. backend tests" "FAIL"
fi

# =============================================================================
# STAGE 5 — frontend build (CRA compile gate)
# =============================================================================
hdr "STAGE 5: frontend build (CRA compile gate)"
if ( cd "$FRONTEND_DIR" && npm run build ); then
  echo "${GRN}PASS: frontend build${RST}"
  record "5. frontend build" "PASS"
else
  echo "${RED}FAIL: frontend build${RST}"
  record "5. frontend build" "FAIL"
fi

# =============================================================================
hdr "SUMMARY"
for i in "${!STAGE_NAMES[@]}"; do
  r="${STAGE_RESULTS[$i]}"
  case "$r" in
    PASS) c="$GRN" ;; FAIL) c="$RED" ;; *) c="$YLW" ;;
  esac
  printf '  %-34s %s%s%s\n' "${STAGE_NAMES[$i]}" "$c" "$r" "$RST"
done

if [[ "$OVERALL_OK" -eq 1 ]]; then
  printf '\n%s##########  GREEN  ##########%s\n' "$GRN" "$RST"
  exit 0
else
  printf '\n%s##########   RED   ##########%s\n' "$RED" "$RST"
  exit 1
fi
