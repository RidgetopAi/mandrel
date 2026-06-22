#!/usr/bin/env bash
# =============================================================================
# provision-test-db.sh — ONE command for a CORRECT throwaway test Postgres.
#
# THE FOOTGUN THIS FIXES
#   Agents spinning up a throwaway DB for tests typically do `createdb` + run
#   migrate.ts and STOP — silently skipping the extensions step. Then any test
#   that touches similarity() (pg_trgm) or a uuid_*() function (uuid-ossp) fails
#   with a confusing "function does not exist" error. This has bitten multiple
#   Foremen. This script makes the CORRECT full sequence the easy default:
#
#       create role (if needed) -> create db (if needed)
#         -> run the extensions SQL (00-extensions.sql: vector, pg_trgm,
#            pgcrypto, uuid-ossp)
#         -> run the real migrate.ts
#
#   scripts/ci.sh calls THIS helper (single source — no duplicated steps that
#   can drift). Use it any time you need a disposable migrated DB for tests.
#
# USAGE
#   bash scripts/provision-test-db.sh <dbname>
#   bash scripts/provision-test-db.sh <dbname> --no-migrate   # ext only, skip migrate
#   bash scripts/provision-test-db.sh <dbname> --print-env    # ensure creds + print (no migrate)
#   bash scripts/provision-test-db.sh <dbname> --drop         # teardown (drop db+role)
#
#   On success it prints the DB env you can source/eval to point tests at it:
#       eval "$(bash scripts/provision-test-db.sh ci_mytest_$$ --print-env)"
#       psql "host=$DATABASE_HOST port=$DATABASE_PORT dbname=$DATABASE_NAME user=$DATABASE_USER" ...
#
# DETERMINISTIC, ALWAYS-VALID CREDS (Mandrel task e3395ce8 — the --print-env footgun)
#   A role's stored password is a one-way scram hash, so an existing role's password
#   can NEVER be read back. The OLD --print-env minted a FRESH random password every
#   call and ALTERed the role to it as a side effect — so creds captured from an
#   EARLIER call (or another shell) silently stopped authenticating, failing tests
#   with confusing auth errors. Fix: the throwaway password is DERIVED DETERMINISTICALLY
#   from the dbname (same name -> same password, every call), and --print-env ENSURES
#   the role exists + is set to exactly that password (idempotent). So the emitted
#   DATABASE_PASSWORD ALWAYS authenticates against the role as it exists after the call,
#   and repeated calls are coherent. Pass TEST_DB_PASS to pin an explicit password
#   instead (what ci.sh does). --print-env does NOT run migrate (a provision concern;
#   it only guarantees a usable, authenticating role/db/extensions for env capture).
#
# SAFETY
#   The dbname MUST be ci_*-prefixed (throwaway convention). This script REFUSES
#   to ever create/drop `mandrel` or any non-ci_*-prefixed DB/role. Idempotent:
#   re-running on the same name is safe (role/db/ext/migrate all if-not-exists).
#
# CONFIG (configs-not-hardcoded) — host/port/super-user from env, sane defaults:
#   TEST_DB_HOST   (default: localhost)
#   TEST_DB_PORT   (default: 5432)
#   TEST_DB_PASS   (default: a per-dbname DETERMINISTIC throwaway password)
#   PG_SUPERCMD    (default: "sudo -u postgres") — how to run psql/createdb as super
# =============================================================================
set -euo pipefail

# --- Paths -------------------------------------------------------------------
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MCP_DIR="$REPO_DIR/mcp-server"
EXT_SQL="$MCP_DIR/database/init/00-extensions.sql"

# --- Config (env w/ sane defaults) ------------------------------------------
DBHOST="${TEST_DB_HOST:-localhost}"
DBPORT="${TEST_DB_PORT:-5432}"
PGSUPER="${PG_SUPERCMD:-sudo -u postgres}"

# --- Pretty output -----------------------------------------------------------
RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; BLD=$'\033[1m'; RST=$'\033[0m'
say()  { printf '%s%s%s\n' "$BLD" "$*" "$RST"; }
ok()   { printf '%s%s%s\n' "$GRN" "$*" "$RST"; }
warn() { printf '%s%s%s\n' "$YLW" "$*" "$RST"; }
die()  { printf '%s%s%s\n' "$RED" "$*" "$RST" >&2; exit 1; }

# --- Args --------------------------------------------------------------------
DBNAME="${1:-}"
MODE="provision"   # provision | drop | print-env
DO_MIGRATE=1
shift || true
for arg in "$@"; do
  case "$arg" in
    --drop)       MODE="drop" ;;
    --print-env)  MODE="print-env" ;;
    --no-migrate) DO_MIGRATE=0 ;;
    *) die "Unknown flag: $arg" ;;
  esac
done

[[ -n "$DBNAME" ]] || die "Usage: $0 <dbname> [--no-migrate|--drop|--print-env]"

# --- Guardrail: throwaway names only — NEVER touch a real DB -----------------
case "$DBNAME" in
  ci_*) : ;;
  *) die "REFUSING: '$DBNAME' is not ci_*-prefixed. Throwaway test DBs must be ci_* (NEVER 'mandrel' or any real DB)." ;;
esac
DBUSER="ci_role_${DBNAME#ci_}"   # derived, deterministic, also ci_role_*-prefixed
case "$DBUSER" in
  ci_role_*) : ;;
  *) die "REFUSING: derived role '$DBUSER' is not ci_role_*-prefixed." ;;
esac

# --- Sanity: the extensions SQL must exist (the whole point) -----------------
[[ -f "$EXT_SQL" ]] || die "Extensions SQL not found at $EXT_SQL — cannot guarantee a correct test DB."

# =============================================================================
# TEARDOWN
# =============================================================================
if [[ "$MODE" == "drop" ]]; then
  say "Dropping throwaway test DB '$DBNAME' and role '$DBUSER' ..."
  $PGSUPER dropdb --if-exists "$DBNAME" >/dev/null 2>&1 || true
  $PGSUPER psql -q -c "DROP ROLE IF EXISTS \"$DBUSER\";" >/dev/null 2>&1 || true
  left=$($PGSUPER psql -tAc "SELECT count(*) FROM pg_database WHERE datname='${DBNAME}';" 2>/dev/null || echo "?")
  role=$($PGSUPER psql -tAc "SELECT count(*) FROM pg_roles    WHERE rolname='${DBUSER}';" 2>/dev/null || echo "?")
  ok "Dropped. Leftover -> db:${left} role:${role} (expect 0/0)."
  exit 0
fi

# =============================================================================
# PROVISION (idempotent: role -> db -> extensions -> migrate)
# =============================================================================
# Throwaway password. A role's stored password is a one-way scram hash and can
# never be read back, so to make the emitted creds ALWAYS valid (and coherent
# across separate calls — including a later bare --print-env) we DERIVE it
# DETERMINISTICALLY from the dbname: same name -> same password, every invocation.
# Pass TEST_DB_PASS to pin an explicit password instead (what ci.sh does). The
# role is then ALTERed to exactly this value below, so what we print authenticates.
DBPASS="${TEST_DB_PASS:-throwaway_$(printf '%s' "$DBNAME" | sha1sum | cut -c1-16)}"

# Role: create if missing, else (re-run) RESET its password to the one we'll use.
# WHY the reset: on a re-run the role already exists, but since the password is a
# one-way hash we can't read it back — and a prior run may have used a different
# value (e.g. someone passed TEST_DB_PASS once and not the next time). ALTER ROLE
# pins the password to the deterministic/explicit value we are about to EMIT, so the
# printed DATABASE_PASSWORD always authenticates and the helper is truly idempotent
# (safe for ci.sh, which passes a fixed TEST_DB_PASS per run).
if [[ "$($PGSUPER psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DBUSER}';" 2>/dev/null)" == "1" ]]; then
  $PGSUPER psql -q -c "ALTER ROLE \"$DBUSER\" LOGIN PASSWORD '$DBPASS';" >/dev/null
else
  $PGSUPER psql -q -c "CREATE ROLE \"$DBUSER\" LOGIN PASSWORD '$DBPASS';" >/dev/null
fi

# DB: create if missing (idempotent), owned by the throwaway role.
if [[ "$($PGSUPER psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DBNAME}';" 2>/dev/null)" == "1" ]]; then
  : # db exists
else
  $PGSUPER createdb -O "$DBUSER" "$DBNAME" >/dev/null
fi

# Extensions: THE step ad-hoc DBs skip. Idempotent (CREATE EXTENSION IF NOT EXISTS).
$PGSUPER psql -d "$DBNAME" -q -f "$EXT_SQL" >/dev/null

if [[ "$MODE" != "print-env" ]]; then
  ok "Provisioned '$DBNAME' (role '$DBUSER') + extensions installed (vector, pg_trgm, pgcrypto, uuid-ossp)."
fi

# Migrate with the real migrate.ts (the same one ci.sh + prod use).
# --print-env is a CRED/ENV-capture path, NOT a provisioner: it guarantees an
# authenticating role/db/extensions but deliberately does NOT migrate (migrate is
# a provision concern, is a surprising side effect for a "print" flag, and needs
# node_modules that may be absent). Run a full provision first if you need schema.
if [[ "$DO_MIGRATE" == "1" && "$MODE" != "print-env" ]]; then
  say "Migrating '$DBNAME' with real migrate.ts ..."
  if ( cd "$MCP_DIR" && env \
        DATABASE_NAME="$DBNAME" \
        DATABASE_USER="$DBUSER" \
        DATABASE_PASSWORD="$DBPASS" \
        DATABASE_HOST="$DBHOST" \
        DATABASE_PORT="$DBPORT" \
        NODE_ENV="development" \
        npx tsx scripts/migrate.ts ) >"/tmp/provision_test_db_${DBNAME}.log" 2>&1; then
    ok "Migration OK."
  else
    warn "Migration FAILED — log tail:"; tail -25 "/tmp/provision_test_db_${DBNAME}.log" >&2
    die "Could not migrate '$DBNAME'."
  fi
fi

# --- Emit the DB env so callers can point tests at this DB -------------------
# Always print to stdout (eval-able); human messages above go to the same stream
# only in non print-env mode, so --print-env yields clean shell assignments.
cat <<EOF
DATABASE_NAME=$DBNAME
DATABASE_USER=$DBUSER
DATABASE_PASSWORD=$DBPASS
DATABASE_HOST=$DBHOST
DATABASE_PORT=$DBPORT
EOF
