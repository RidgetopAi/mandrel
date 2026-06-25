#!/usr/bin/env bash
# reset-tenant-password.sh — one-command Command-UI dashboard password reset for a tenant.
#
# WHY THIS EXISTS
#   Resetting a tenant's Command-UI dashboard login (the bcrypt-hashed user row in the
#   tenant's own Postgres) was hand-rolled by hand twice in one day. This is the single,
#   safe, repeatable command for it. It is NOT for the nginx Basic-Auth and NOT for the
#   MCP bearer token — only the dashboard login that `POST /api/auth/login` verifies.
#
# WHAT IT RESETS (grounded in the live system, 2026-06-24)
#   - command-backend authenticates by USERNAME:
#       SELECT * FROM admin_users WHERE username = $1 AND is_active = true
#     then bcrypt.compare(password, password_hash)  (services/auth.ts).
#   - Table `admin_users`, column `password_hash` (bcrypt $2b$, varchar(255)),
#     plus is_active (must be true to log in) and must_change_password.
#   - Hash is produced with the BACKEND'S OWN bcrypt + the SAME rounds resolution
#     (MANDREL_BCRYPT_ROUNDS -> AIDIS_BCRYPT_ROUNDS -> 12) by running node INSIDE the
#     tenant's command-backend container. This makes it impossible for the hash format
#     to drift from how login verifies — same module, same code path.
#
# DESIGN (mirrors scripts/mandrel-tenant.sh conventions verbatim)
#   - Registry /root/mandrel-registry.json is SOURCE OF TRUTH for which handles exist.
#   - Handle regex + require_tenant + logs-to-STDERR + secrets-never-printed, same as
#     the tenant CLI. No magic literals: container name template, registry path, default
#     user, and the bcrypt env-key chain are all config-overridable (configs-not-hardcoded).
#   - Idempotent + safe to re-run; fails CLOSED on unknown handle / missing user /
#     ambiguous input; the password is generated client-side or supplied, never logged.
#
# USAGE
#   reset-tenant-password.sh <handle> [--user <email|username>] [options]
#
#   --user <id>        Target user by username OR email (default: $DEFAULT_USER = "admin").
#   --password <pw>    Use this exact password instead of generating one.
#   --no-force-change  Do NOT set must_change_password (default: it IS set so the
#                      customer is forced to rotate the delivered temp password).
#   --telegram         Also deliver the new credential to Brian via the shared
#                      ridge-notify (Telegram). The password is NEVER written to a log.
#   --yes              Skip the interactive confirmation prompt.
#   -h | --help        Show this help.
#
# DELIVERY (Lesson 017 — a reset MUST be delivered, never silent)
#   The new credential is PRINTED to STDOUT for the operator to relay, and optionally
#   pushed to Telegram with --telegram. It is never echoed into any committed file or log.
#
# EXIT CODES
#   0 success · 1 usage/validation · 2 unknown handle · 3 user not found · 4 db/hash error
set -euo pipefail

# ---- Config (env-overridable; no magic literals) -----------------------------
REGISTRY="${MANDREL_REGISTRY:-/root/mandrel-registry.json}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NOTIFY_LIB="${RIDGE_NOTIFY_LIB:-${REPO_DIR}/scripts/lib/ridge-notify.sh}"

# Container name templates: the token %H% is replaced with the handle.
# (A brace token like {h} can't be used here — a literal '}' inside a ${var:-default}
#  default closes the parameter expansion early and corrupts the value.)
PG_CONTAINER_TMPL="${MANDREL_PG_CONTAINER_TMPL:-mandrel-%H%-postgres}"
BACKEND_CONTAINER_TMPL="${MANDREL_BACKEND_CONTAINER_TMPL:-mandrel-%H%-command-backend}"

DEFAULT_USER="${MANDREL_DEFAULT_ADMIN_USER:-admin}"

# Generated-password length (when not supplied with --password).
PW_LENGTH="${MANDREL_RESET_PW_LENGTH:-24}"

# Defaults for flags.
FORCE_CHANGE=1     # set must_change_password=true after reset
USE_TELEGRAM=0
ASSUME_YES=0
TARGET_USER="$DEFAULT_USER"
SUPPLIED_PW=""

# ---- Logging / fail (logs to STDERR; STDOUT carries deliverables only) --------
log()  { echo "[$(date +%H:%M:%S)] $*" >&2; }
fail() { echo "[$(date +%H:%M:%S)] ERROR: $1" >&2; exit "${2:-1}"; }
need() { command -v "$1" >/dev/null || fail "$1 is required but not found"; }

usage() { sed -n '2,55p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit "${1:-1}"; }

# ---- Arg parsing -------------------------------------------------------------
HANDLE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)        usage 0 ;;
    --user)           TARGET_USER="${2:-}"; [[ -n "$TARGET_USER" ]] || fail "--user needs a value"; shift 2 ;;
    --password)       SUPPLIED_PW="${2:-}"; [[ -n "$SUPPLIED_PW" ]] || fail "--password needs a value"; shift 2 ;;
    --no-force-change) FORCE_CHANGE=0; shift ;;
    --telegram)       USE_TELEGRAM=1; shift ;;
    --yes|-y)         ASSUME_YES=1; shift ;;
    --)               shift; break ;;
    -*)               fail "unknown option: $1" ;;
    *)                [[ -z "$HANDLE" ]] || fail "unexpected extra argument: '$1' (handle already = '$HANDLE')"; HANDLE="$1"; shift ;;
  esac
done

[[ -n "$HANDLE" ]] || usage 1

# ---- Preconditions -----------------------------------------------------------
need jq; need docker
[[ -f "$REGISTRY" ]]                || fail "registry not found: $REGISTRY"
jq -e . "$REGISTRY" >/dev/null 2>&1 || fail "registry is not valid JSON: $REGISTRY"

# Handle hygiene (mirror provisioner/tenant-CLI regex).
[[ "$HANDLE" =~ ^[a-z0-9][a-z0-9-]*$ ]] \
  || fail "handle must match ^[a-z0-9][a-z0-9-]*\$ (lowercase, digits, dashes): '$HANDLE'" 1

# Registry is the source of truth for which handles exist.
jq -e ".tenants[\"$HANDLE\"]" "$REGISTRY" >/dev/null 2>&1 \
  || fail "unknown handle '$HANDLE' — not in registry $REGISTRY. Refusing to operate." 2

PG_CONTAINER="${PG_CONTAINER_TMPL/'%H%'/$HANDLE}"
BACKEND_CONTAINER="${BACKEND_CONTAINER_TMPL/'%H%'/$HANDLE}"

# The stack must actually be running (suspended/torn-down tenants can't be reset).
docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2>/dev/null | grep -q true \
  || fail "postgres container '$PG_CONTAINER' is not running. Is tenant '$HANDLE' up?" 2
docker inspect -f '{{.State.Running}}' "$BACKEND_CONTAINER" 2>/dev/null | grep -q true \
  || fail "backend container '$BACKEND_CONTAINER' is not running. Is tenant '$HANDLE' up?" 2

log "Tenant '$HANDLE' resolved -> pg=$PG_CONTAINER backend=$BACKEND_CONTAINER"

# ---- DB helper: run psql inside the tenant's postgres container ---------------
# Creds come from the container's own POSTGRES_USER/POSTGRES_DB env — never printed.
pg() {  # pg <sql>  -> tuples-only, no aligned formatting
  docker exec -i "$PG_CONTAINER" sh -c \
    'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAq -f -' <<<"$1"
}

# ---- Resolve target user (username OR email) to a single, existing username ----
# admin_users.username is the login identifier. Accept an email and resolve it.
# Fail CLOSED on no-match (exit 3) and on ambiguity.
resolve_username() {
  local id="$1" rows
  # Match on username OR email, only active users (login requires is_active=true).
  rows="$(pg "SELECT username FROM admin_users
              WHERE (username = '$(sql_escape "$id")' OR email = '$(sql_escape "$id")')
                AND is_active = true;")" || fail "DB query failed resolving user '$id'" 4
  local n; n="$(printf '%s\n' "$rows" | grep -c . || true)"
  if [[ "$n" -eq 0 ]]; then
    fail "no ACTIVE admin_users row matches '$id' (username or email) in tenant '$HANDLE'. Nothing changed." 3
  elif [[ "$n" -gt 1 ]]; then
    fail "ambiguous: '$id' matches $n active users. Refusing. Specify the exact username." 1
  fi
  printf '%s' "$rows"
}

# Minimal SQL single-quote escaper (we only build literals, always single-quoted).
sql_escape() { printf '%s' "${1//\'/\'\'}"; }

RESOLVED_USER="$(resolve_username "$TARGET_USER")"
log "Target user resolved: '$TARGET_USER' -> username='$RESOLVED_USER'"

# ---- Generate (or accept) the new password -----------------------------------
gen_password() {
  # Strong, alnum-only (no shell/URL-hostile chars). Read a BOUNDED chunk of random
  # bytes first, THEN filter — never pipe an unbounded reader into `head` (that gives
  # `tr` a SIGPIPE which, under `set -o pipefail`, fails the whole script: exit 141).
  local n="${1:-24}" out=""
  while [[ ${#out} -lt "$n" ]]; do
    # 4*n random bytes is plenty of alnum yield per pass; loop guards the rare shortfall.
    out+="$(head -c "$((n * 4))" /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' || true)"
  done
  printf '%s' "${out:0:n}"
}

if [[ -n "$SUPPLIED_PW" ]]; then
  NEW_PW="$SUPPLIED_PW"
  log "Using operator-supplied password (length ${#NEW_PW})."
else
  NEW_PW="$(gen_password "$PW_LENGTH")"
  log "Generated a strong ${#NEW_PW}-char password."
fi

# ---- Confirm before mutating -------------------------------------------------
if [[ "$ASSUME_YES" -ne 1 ]]; then
  echo "About to reset Command-UI password for user '$RESOLVED_USER' on tenant '$HANDLE'." >&2
  echo "force-change-on-next-login=$([[ $FORCE_CHANGE -eq 1 ]] && echo yes || echo no)" >&2
  read -r -p "Proceed? [y/N] " ans </dev/tty || ans=""
  [[ "$ans" =~ ^[Yy]$ ]] || fail "aborted by operator. Nothing changed." 1
fi

# ---- Hash with the BACKEND'S OWN bcrypt (no drift possible) -------------------
# Run node INSIDE the command-backend container, using its bcrypt module and the
# SAME rounds-resolution as services/auth.ts (MANDREL_ -> AIDIS_ -> 12). The
# password is passed via env (RESET_PW), never on argv (so it can't leak via ps),
# and the hash is the only thing written to STDOUT.
hash_password() {
  local pw="$1" hash
  hash="$(RESET_PW="$pw" docker exec -i \
            -e RESET_PW \
            "$BACKEND_CONTAINER" node -e '
      const bcrypt = require("bcrypt");
      // Mirror services/auth.ts getEnvVarInt("MANDREL_BCRYPT_ROUNDS","AIDIS_BCRYPT_ROUNDS","12")
      const r = parseInt(process.env.MANDREL_BCRYPT_ROUNDS
                      || process.env.AIDIS_BCRYPT_ROUNDS
                      || "12", 10);
      const pw = process.env.RESET_PW;
      if (!pw) { console.error("no RESET_PW"); process.exit(1); }
      process.stdout.write(bcrypt.hashSync(pw, r));
    ')" || fail "bcrypt hashing inside '$BACKEND_CONTAINER' failed" 4
  # Sanity: must look like a bcrypt hash.
  [[ "$hash" =~ ^\$2[aby]\$[0-9]{2}\$ ]] || fail "produced hash does not look like bcrypt: refusing to write" 4
  printf '%s' "$hash"
}

NEW_HASH="$(hash_password "$NEW_PW")"
log "Hashed with backend's own bcrypt (format $(printf '%s' "$NEW_HASH" | cut -c1-7)…)."

# ---- Write the new hash (parameterized literal, RETURNING to confirm) ---------
FORCE_CHANGE_CLAUSE=""
[[ "$FORCE_CHANGE" -eq 1 ]] && FORCE_CHANGE_CLAUSE=", must_change_password = true"

UPDATED="$(pg "UPDATE admin_users
                 SET password_hash = '$(sql_escape "$NEW_HASH")'${FORCE_CHANGE_CLAUSE},
                     updated_at = CURRENT_TIMESTAMP
                 WHERE username = '$(sql_escape "$RESOLVED_USER")'
                   AND is_active = true
                 RETURNING username;")" \
  || fail "UPDATE failed for user '$RESOLVED_USER' on '$HANDLE'. Nothing changed." 4

[[ "$UPDATED" == "$RESOLVED_USER" ]] \
  || fail "UPDATE affected 0 rows (user '$RESOLVED_USER' vanished/deactivated mid-run). Verify manually." 4

log "✅ password_hash updated for '$RESOLVED_USER' on tenant '$HANDLE'."

# ---- Deliver the credential (Lesson 017) -------------------------------------
DOMAIN="$(jq -r ".tenants[\"$HANDLE\"].domain // empty" "$REGISTRY")"
LOGIN_URL="${DOMAIN:+https://$DOMAIN/login}"

# STDOUT: the deliverable, for the operator to relay. Marked so it's obvious.
cat <<EOF
==================== TENANT PASSWORD RESET (deliver this) ====================
 tenant   : $HANDLE
 login URL: ${LOGIN_URL:-<no domain in registry>}
 username : $RESOLVED_USER
 password : $NEW_PW
 note     : $([[ $FORCE_CHANGE -eq 1 ]] && echo "user must change password on next login" || echo "permanent (no forced change)")
=============================================================================
EOF

if [[ "$USE_TELEGRAM" -eq 1 ]]; then
  [[ -r "$NOTIFY_LIB" ]] || fail "--telegram requested but notify lib not readable: $NOTIFY_LIB" 1
  # shellcheck disable=SC1090
  . "$NOTIFY_LIB"
  body="tenant: ${HANDLE}
login: ${LOGIN_URL:-n/a}
user: ${RESOLVED_USER}
temp password: ${NEW_PW}
$([[ $FORCE_CHANGE -eq 1 ]] && echo 'must change on next login')"
  if notify "Tenant password reset" "$body" "high" "🔑"; then
    log "Delivered credential to Telegram (loud)."
  else
    log "WARNING: Telegram delivery FAILED (HTTP ${NOTIFY_LAST_HTTP:-?}). Password IS reset; relay it manually from STDOUT above."
  fi
fi

log "Done."
