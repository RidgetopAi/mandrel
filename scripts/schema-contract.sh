#!/usr/bin/env bash
# =============================================================================
# schema-contract.sh — the CI schema-contract gate (anti-drift, Lesson 008)
# =============================================================================
# Proves the committed migrations DETERMINISTICALLY reproduce the expected
# schema. Spins a throwaway Postgres DB, runs the REAL migrate.ts against it,
# extracts a canonical version-agnostic schema fingerprint, and compares it to
# the committed reference (scripts/schema-reference.sql.txt).
#
#   * verify    (default) — FAIL if the freshly-migrated schema differs from the
#                           committed reference; print the diff. This is the gate.
#   * regenerate          — overwrite the committed reference from a fresh migrate
#                           (use this when a migration LEGITIMATELY changes schema).
#
# This catches the class of bug where committed migrations no longer reproduce
# the real/expected schema (e.g. golden-image drift: sessions 31 cols in-app vs
# 42 in prod; phantom user_sessions references) — at the gate, not in prod.
#
# Disposable infra: ONE throwaway DB + role per run, ci_*-prefixed, dropped on
# EXIT (always). NEVER touches the real `mandrel` DB or any tenant DB.
#
# Usage:
#   bash scripts/schema-contract.sh            # verify (gate) — exit 0 GREEN / 1 RED
#   bash scripts/schema-contract.sh verify
#   bash scripts/schema-contract.sh regenerate # update the committed reference
# =============================================================================
set -euo pipefail

MODE="${1:-verify}"

# --- Paths -------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MCP_DIR="$REPO_DIR/mcp-server"
EXT_SQL="$MCP_DIR/database/init/00-extensions.sql"
FINGERPRINT_SQL="$SCRIPT_DIR/schema-fingerprint.sql"
REFERENCE_FILE="$SCRIPT_DIR/schema-reference.sql.txt"
PGSUPER="sudo -u postgres"

# --- Disposable DB identity (unique per run; mirrors ci.sh) ------------------
SFX="$$_$(date +%s)"
DBNAME="ci_schema_${SFX}"
DBUSER="ci_role_schema_${SFX}"
DBPASS="throwaway_$(date +%s%N | sha1sum | cut -c1-16)"
DBHOST="${CI_DB_HOST:-localhost}"
DBPORT="${CI_DB_PORT:-5432}"

# --- Pretty output -----------------------------------------------------------
RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; BLD=$'\033[1m'; RST=$'\033[0m'
hdr() { printf '\n%s========== %s ==========%s\n' "$BLD" "$*" "$RST"; }

# --- Cleanup (always; even on failure) --------------------------------------
cleanup() {
  $PGSUPER dropdb --if-exists "$DBNAME" >/dev/null 2>&1 || true
  $PGSUPER psql -q -c "DROP ROLE IF EXISTS \"$DBUSER\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# --- Guardrail: refuse to ever operate on a real DB --------------------------
case "$DBNAME" in
  ci_*) : ;;
  *) echo "${RED}REFUSING: disposable DB name '$DBNAME' is not ci_*-prefixed.${RST}"; exit 2 ;;
esac

[[ -f "$FINGERPRINT_SQL" ]] || { echo "${RED}Missing $FINGERPRINT_SQL${RST}"; exit 2; }

# --- Build a fresh, fully-migrated disposable DB -----------------------------
hdr "schema-contract: provision + migrate disposable DB ($MODE)"
echo "DB=$DBNAME  ROLE=$DBUSER  HOST=$DBHOST:$DBPORT"
$PGSUPER psql -q -c "DROP ROLE IF EXISTS \"$DBUSER\";" >/dev/null 2>&1 || true
$PGSUPER psql -q -c "CREATE ROLE \"$DBUSER\" LOGIN PASSWORD '$DBPASS';" >/dev/null
$PGSUPER createdb -O "$DBUSER" "$DBNAME" >/dev/null
$PGSUPER psql -d "$DBNAME" -q -f "$EXT_SQL" >/dev/null
echo "Provisioned + extensions installed."

MIG_LOG="/tmp/schema_contract_migrate_${SFX}.log"
if ( cd "$MCP_DIR" && env \
      DATABASE_NAME="$DBNAME" DATABASE_USER="$DBUSER" DATABASE_PASSWORD="$DBPASS" \
      DATABASE_HOST="$DBHOST" DATABASE_PORT="$DBPORT" NODE_ENV="development" \
      npx tsx scripts/migrate.ts ) >"$MIG_LOG" 2>&1; then
  echo "${GRN}Migration OK${RST}"
else
  echo "${RED}Migration FAILED — cannot establish schema contract. Log tail:${RST}"
  tail -25 "$MIG_LOG"
  exit 1
fi

# --- Extract canonical fingerprint (sorted, version-agnostic) ----------------
FRESH="/tmp/schema_contract_fresh_${SFX}.txt"
# Keep ONLY real fingerprint rows (drop any psql \pset confirmation echoes / blanks).
$PGSUPER psql -d "$DBNAME" -f "$FINGERPRINT_SQL" 2>/dev/null \
  | grep -E '^(COLUMN|CONSTRAINT|INDEX|VIEW|SEQUENCE|ENUM) ' \
  | LC_ALL=C sort > "$FRESH"
LINES=$(wc -l < "$FRESH")
echo "Canonical fingerprint extracted: ${LINES} schema objects."
if [[ "$LINES" -lt 50 ]]; then
  echo "${RED}Refusing: fingerprint has only ${LINES} lines — extraction likely broke.${RST}"
  exit 2
fi

# =============================================================================
# REGENERATE — overwrite the committed reference
# =============================================================================
if [[ "$MODE" == "regenerate" ]]; then
  {
    echo "# Mandrel CANONICAL SCHEMA REFERENCE — committed contract for the CI drift gate."
    echo "# DO NOT EDIT BY HAND. Regenerate with:  bash scripts/schema-contract.sh regenerate"
    echo "# Generated from a fresh disposable DB migrated by mcp-server/scripts/migrate.ts."
    echo "# Format: one sorted line per schema object (see scripts/schema-fingerprint.sql)."
    echo "# Version-agnostic (catalog-derived), so pg15 tenants compare clean vs a pg16 ref."
    echo "#"
    cat "$FRESH"
  } > "$REFERENCE_FILE"
  echo "${GRN}Reference regenerated:${RST} $REFERENCE_FILE (${LINES} objects)."
  echo "Review the diff (git diff) and commit it WITH the migration that caused it."
  exit 0
fi

# =============================================================================
# VERIFY — the gate
# =============================================================================
hdr "schema-contract: VERIFY fresh schema == committed reference"
if [[ ! -f "$REFERENCE_FILE" ]]; then
  echo "${RED}No committed reference at $REFERENCE_FILE.${RST}"
  echo "Generate it once with:  bash scripts/schema-contract.sh regenerate"
  exit 1
fi

# Strip the leading comment header from the committed reference before diffing.
REF_BODY="/tmp/schema_contract_ref_${SFX}.txt"
grep -v '^#' "$REFERENCE_FILE" | sed '/^[[:space:]]*$/d' | LC_ALL=C sort > "$REF_BODY"

if diff -u "$REF_BODY" "$FRESH" > "/tmp/schema_contract_diff_${SFX}.txt" 2>&1; then
  echo "${GRN}PASS: migrations reproduce the committed reference schema EXACTLY (${LINES} objects).${RST}"
  echo "${GRN}##########  SCHEMA CONTRACT GREEN  ##########${RST}"
  exit 0
else
  echo "${RED}FAIL: SCHEMA DRIFT — committed migrations do NOT reproduce the reference.${RST}"
  echo "${YLW}--- < reference (committed)   --- > fresh migrate (actual) ---${RST}"
  # Show only the meaningful +/- lines, not the whole file, for readability.
  grep -E '^[+-][^+-]' "/tmp/schema_contract_diff_${SFX}.txt" || cat "/tmp/schema_contract_diff_${SFX}.txt"
  echo ""
  echo "${YLW}If this change is INTENTIONAL (a migration legitimately changed the schema),${RST}"
  echo "${YLW}regenerate the reference and commit it with the migration:${RST}"
  echo "    bash scripts/schema-contract.sh regenerate"
  echo "${RED}##########   SCHEMA CONTRACT RED   ##########${RST}"
  exit 1
fi
