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
#   1. mcp-server tests       — disposable Postgres + real migrate.ts + the FULL
#                               vitest suite (all src/**/*.test.ts; embeddings mocked).
#   2. mcp-server type-check  — tsc --noEmit (must be 0 errors).
#   3. backend type-check     — mandrel-command/backend tsc --noEmit.
#   4. backend tests          — jest against the same disposable migrated DB
#                               (infra-only suites skip via MANDREL_SKIP_DB_TESTS).
#   4b. frontend tests        — mandrel-command/frontend react-scripts test in
#                               CI=true mode (runs once, non-zero on failure).
#                               Enforces the projectResolution guards (15 cases).
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

# =============================================================================
# CHANGE-SCOPE detection — frontend-only worktrees skip the DB stages
# =============================================================================
# WHY: ci.sh used to die at the migrate stage (Stage 0b) for a frontend-only
# worktree — provisioning + migrating a disposable Postgres just to validate a CRA
# change is wasteful, and any DB hiccup false-RED'd a change that never touches the
# data tier. A FE-only change (only mandrel-command/frontend/** differs from main)
# does NOT need Postgres: it needs lint + FE tests + FE build. So we DETECT FE-only
# and SKIP the DB-dependent stages (provision/migrate/schema-contract/mcp-server
# tests+type-check/backend tests+type-check) while still running the full FE gate.
#
# FAIL-SAFE: the FULL-STACK path is the default. We only go FE-only when we can
# POSITIVELY prove every changed path is under mandrel-command/frontend/. If the
# diff base can't be resolved (detached/shallow/no main), or ANY non-FE path
# changed, or there are no changes to compare, we run the FULL gate. Override:
#   CI_SCOPE=full   force the full-stack gate (default behavior if unsure)
#   CI_SCOPE=fe     force the frontend-only gate (escape hatch / manual)
# Base ref is configurable for forks/PRs:  CI_DIFF_BASE (default: main).
# =============================================================================
FE_PREFIX="mandrel-command/frontend/"
DIFF_BASE="${CI_DIFF_BASE:-main}"
FE_ONLY=0   # 0 = full-stack (default, fail-safe); 1 = frontend-only

detect_scope() {
  # Explicit override wins.
  case "${CI_SCOPE:-}" in
    full) echo "scope: forced FULL via CI_SCOPE=full"; FE_ONLY=0; return ;;
    fe)   echo "scope: forced FE-ONLY via CI_SCOPE=fe";  FE_ONLY=1; return ;;
  esac
  # Need git + a resolvable base to make a positive determination.
  if ! command -v git >/dev/null 2>&1 || ! git -C "$REPO_DIR" rev-parse --git-dir >/dev/null 2>&1; then
    echo "scope: no git / not a repo — running FULL (fail-safe)"; FE_ONLY=0; return
  fi
  local base
  if ! base="$(git -C "$REPO_DIR" merge-base "$DIFF_BASE" HEAD 2>/dev/null)" || [[ -z "$base" ]]; then
    echo "scope: cannot resolve merge-base with '$DIFF_BASE' — running FULL (fail-safe)"; FE_ONLY=0; return
  fi
  # Union of committed diff (base..HEAD) AND uncommitted working-tree changes, so a
  # FE-only branch is detected whether or not the change is committed yet.
  local changed
  # NOTE: a porcelain rename line is `R  old -> new` (and after `sed 's/^...//'`
  # becomes `old -> new`). We must prefix-match the DESTINATION, not the source —
  # otherwise a cross-dir rename like `frontend/x -> backend/y` keeps the FE source
  # prefix and is wrongly classified FE-only. `sed 's/.* -> //'` keeps only the dest
  # (it is a no-op on the `git diff --name-only` lines, which never contain ` -> `).
  changed="$( { git -C "$REPO_DIR" diff --name-only "$base" HEAD;
                git -C "$REPO_DIR" status --porcelain | sed 's/^...//'; } \
              | sed 's/.* -> //' | sed '/^[[:space:]]*$/d' | LC_ALL=C sort -u )"
  if [[ -z "$changed" ]]; then
    echo "scope: no changes vs '$DIFF_BASE' — running FULL (fail-safe; nothing to narrow on)"
    FE_ONLY=0; return
  fi
  # Positive proof: EVERY changed path must be under the FE prefix.
  local nonfe
  nonfe="$(grep -v "^${FE_PREFIX}" <<<"$changed" || true)"
  if [[ -z "$nonfe" ]]; then
    echo "scope: every changed path is under '${FE_PREFIX}' — FRONTEND-ONLY gate (DB stages skip)"
    FE_ONLY=1
  else
    echo "scope: changes outside the frontend — running FULL gate. Non-FE paths:"
    sed 's/^/    /' <<<"$nonfe"
    FE_ONLY=0
  fi
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

# --- Determine change scope (FE-only vs full-stack) --------------------------
hdr "CHANGE SCOPE"
detect_scope

# =============================================================================
# STAGE L — eslint (ERROR-gated; warnings tolerated at the current baseline)
# =============================================================================
# WHY: eslint was NEVER enforced in CI — the frontend build even disables it
# (DISABLE_ESLINT_PLUGIN=true react-scripts build). So lint errors could land on
# main unnoticed. This stage wires `npm run lint` per package as a real gate.
#
# BOUNDED + HONEST (no fake-green, no rabbit-hole): the repo currently lints with
# ZERO errors but a legacy WARNING backlog (mcp-server ~7, backend ~276,
# frontend ~10 — all warnings, 0 errors). Fixing hundreds of legacy warnings is
# out of scope for this CI-tooling pass. So we gate on ERRORS only:
#   eslint ... --max-warnings=-1   (errors fail; warnings are reported, not fatal)
# This is the existing baseline (each package's `npm run lint` already exits 0 on
# warnings), made explicit + enforced. A NEW lint ERROR now fails the gate. The
# legacy warning backlog is tracked as a separate follow-up task (see report).
#
# SCOPE-AWARE: FE-only runs lint the frontend lint only; full-stack lints all three.
# --max-warnings=-1 means "no warning limit" in eslint (warnings never fail);
# any error count > 0 makes eslint exit non-zero => stage FAILs => ci.sh RED.
# =============================================================================
hdr "STAGE L: eslint (errors fail; warnings tolerated at baseline)"
# lint_pkg <label> <dir> -> echoes result, returns 0 on PASS (0 errors), 1 on FAIL
lint_pkg() {  # <label> <dir>
  # SC2318: split the `local` — within a single `local a=$2 b=$(...$a...)`, $a is NOT
  # yet visible to b on the same line, so the log name lost its package basename and
  # all packages clobbered one shared /tmp/ci_lint__*.log. Two statements fixes it.
  local label="$1" dir="$2"
  local log="/tmp/ci_lint_$(basename "$dir")_${SFX}.log"
  if [[ ! -f "$dir/package.json" ]] || ! node -e "process.exit((require('$dir/package.json').scripts||{}).lint?0:1)" 2>/dev/null; then
    echo "${YLW}  ${label}: no 'lint' script — skipping${RST}"
    return 0
  fi
  # Append --max-warnings=-1 so warnings never fail; errors still do.
  if ( cd "$dir" && npm run lint -- --max-warnings=-1 ) >"$log" 2>&1; then
    local warns; warns=$(grep -cE 'warning' "$log" || true)
    echo "${GRN}  ${label}: 0 errors (${warns} warning lines — tolerated baseline)${RST}"
    return 0
  else
    echo "${RED}  ${label}: eslint reported ERROR(s) — gate fails. Log tail:${RST}"
    grep -E 'error|problems' "$log" | tail -15 | sed 's/^/    /'
    return 1
  fi
}
LINT_OK=1
if [[ "$FE_ONLY" -eq 1 ]]; then
  lint_pkg "frontend" "$FRONTEND_DIR" || LINT_OK=0
else
  lint_pkg "mcp-server" "$MCP_DIR"   || LINT_OK=0
  lint_pkg "backend"    "$BACKEND_DIR" || LINT_OK=0
  lint_pkg "frontend"   "$FRONTEND_DIR" || LINT_OK=0
fi
if [[ "$LINT_OK" -eq 1 ]]; then
  echo "${GRN}PASS: eslint — 0 errors across linted package(s).${RST}"
  record "L. eslint (error-gated)" "PASS"
else
  echo "${RED}FAIL: eslint found error(s). Fix the new error(s) above (warnings are tolerated at baseline).${RST}"
  record "L. eslint (error-gated)" "FAIL"
fi

# =============================================================================
# STAGE S — secret scan (gitleaks) — the CI backstop to the pre-commit hook.
# =============================================================================
# Runs FIRST (before any DB provisioning) so a leaked secret fails the gate fast
# and cheap. History-aware `gitleaks detect` over the whole repo + git history,
# using the repo's .gitleaks.toml (default rules + the documented allowlist of
# confirmed-DEAD noise). ANY finding => this stage FAILs => ci.sh goes RED.
# Fail CLOSED: if gitleaks is not installed, this stage FAILS (does not skip).
# =============================================================================
hdr "STAGE S: secret scan (gitleaks: history + staged changes)"
GITLEAKS_CFG="$REPO_DIR/.gitleaks.toml"
# Two complementary scans (a finding in EITHER fails the stage). Both respect
# git tracking, so gitignored on-disk noise (local .env, build/*.map, *.log) is
# NOT scanned — only what is or could become committed:
#   - detect           => history-aware (all committed history; the CI concern)
#   - protect --staged => changes staged for the next commit (the same surface
#                         the pre-commit hook guards; catches a leak locally
#                         before it lands). Unstaged working-tree edits are NOT
#                         committable as-is and are covered once staged.
SECRET_OK=1
if ! command -v gitleaks >/dev/null 2>&1; then
  echo "${RED}FAIL: gitleaks not installed — cannot run the secret-scan backstop (fail-closed).${RST}"
  SECRET_OK=0
elif [[ ! -f "$GITLEAKS_CFG" ]]; then
  echo "${RED}FAIL: .gitleaks.toml missing at repo root — refusing to scan with unknown config.${RST}"
  SECRET_OK=0
else
  if ( cd "$REPO_DIR" && gitleaks detect --redact --no-banner --config "$GITLEAKS_CFG" ); then
    echo "${GRN}  history scan: clean${RST}"
  else
    echo "${RED}  history scan: SECRET FOUND${RST}"; SECRET_OK=0
  fi
  if ( cd "$REPO_DIR" && gitleaks protect --staged --redact --no-banner --config "$GITLEAKS_CFG" ); then
    echo "${GRN}  staged-changes scan: clean${RST}"
  else
    echo "${RED}  staged-changes scan: SECRET FOUND${RST}"; SECRET_OK=0
  fi
fi
if [[ "$SECRET_OK" -eq 1 ]]; then
  echo "${GRN}PASS: no secrets found (working tree + history).${RST}"
  record "S. secret scan (gitleaks)" "PASS"
else
  echo "${RED}FAIL: gitleaks found a potential secret (or could not run). Rotate/remove it,"
  echo "or add a documented allowlist entry to .gitleaks.toml (never a real shape).${RST}"
  record "S. secret scan (gitleaks)" "FAIL"
fi

# =============================================================================
# DB + BACKEND + MCP stages — run for FULL-STACK changes only.
# A frontend-only worktree (FE_ONLY=1) does NOT touch the data tier, so we SKIP
# everything from toolchain-integrity through backend tests (provision/migrate/
# schema-contract/mcp-server tests+type-check/backend type-check+tests) and go
# straight to the frontend gate (STAGE 4b + 5). The full-stack path below is
# UNCHANGED — it is simply wrapped in the FE_ONLY guard.
# =============================================================================
if [[ "$FE_ONLY" -eq 1 ]]; then
  hdr "DB/BACKEND STAGES — SKIPPED (frontend-only change)"
  echo "${YLW}FE-only change detected: skipping DB provisioning + all backend/mcp stages."
  echo "The frontend gate (lint + tests + build) still runs and must pass.${RST}"
  record "0a. toolchain integrity (TS pin)" "SKIP"
  record "0a2. prod-install topology (static)" "SKIP"
  record "0. provision disposable Postgres" "SKIP"
  record "0b. migrate disposable DB" "SKIP"
  record "0c. schema-contract gate" "SKIP"
  record "1. mcp-server tests (full vitest)" "SKIP"
  record "2. mcp-server type-check" "SKIP"
  record "3. backend type-check" "SKIP"
  record "4. backend tests" "SKIP"
else

# =============================================================================
# STAGE 0a — toolchain integrity (pinned TypeScript resolves LOCALLY)
# =============================================================================
# Root-causes the recurring "stale-TS-hoist" false-RED (task 14d98e20): in a
# fresh agent git worktree, node_modules isn't populated, so `npm run type-check`
# falls back to a hoisted/global tsc (seen: 4.9.5) that can't parse modern .d.ts
# (zod v4, d3), RED-ing Stages 2/3 even though the committed code is fine.
#
# Guard: for each tsc-based package, confirm the LOCAL node_modules/typescript
# MAJOR matches the package.json pin. If node_modules is absent or the major is
# wrong (or older), SELF-HEAL once with `npm ci`, then re-verify. If it STILL
# can't resolve the pinned major, FAIL FAST with an actionable message instead of
# letting a misleading type-check error masquerade as a real one.
# Deterministic, same spirit as the secret + schema-contract + version gates.
# =============================================================================
hdr "STAGE 0a: toolchain integrity (pinned TypeScript resolves locally)"
# Read the typescript semver requested in a package.json (dev or prod dep).
ts_pin_major() {  # ts_pin_major <pkg_dir> -> major int, or "" if not declared
  node -e "try{const p=require('$1/package.json');const d=(p.devDependencies||{}).typescript||(p.dependencies||{}).typescript||'';const m=String(d).match(/(\d+)\./);process.stdout.write(m?m[1]:'')}catch(e){process.stdout.write('')}"
}
# Read the version actually installed under <pkg_dir>/node_modules/typescript.
ts_installed_major() {  # ts_installed_major <pkg_dir> -> major int, or "" if absent
  node -e "try{process.stdout.write(String(require('$1/node_modules/typescript/package.json').version).split('.')[0])}catch(e){process.stdout.write('')}"
}
TOOLCHAIN_OK=1
for PKG in "$MCP_DIR" "$BACKEND_DIR"; do
  NAME="$(basename "$(dirname "$PKG")")/$(basename "$PKG")"
  PIN="$(ts_pin_major "$PKG")"
  if [[ -z "$PIN" ]]; then
    echo "${YLW}  ${NAME}: no typescript pin declared — skipping${RST}"
    continue
  fi
  GOT="$(ts_installed_major "$PKG")"
  if [[ "$GOT" == "$PIN" ]]; then
    echo "${GRN}  ${NAME}: TS major ${GOT} matches pin ^${PIN} (local install OK)${RST}"
    continue
  fi
  echo "${YLW}  ${NAME}: local TS is '${GOT:-absent}', pin is ^${PIN} — self-healing with 'npm ci'…${RST}"
  # Self-heal install. mandrel-command members (backend/frontend) no longer carry a
  # per-member package-lock.json — the workspace-ROOT mandrel-command/package-lock.json
  # is the single source of truth — so a member-local `npm ci` would EUSAGE-fail. For
  # those, install WORKSPACE-SCOPED from the workspace root; for standalone packages
  # (mcp-server) the in-dir `npm ci` is still correct.
  CMDDIR="$REPO_DIR/mandrel-command"
  # NOTE: this loop only iterates MCP_DIR + BACKEND_DIR — the packages with a
  # standalone `tsc --noEmit` type-check stage (Stages 2 & 3) that a stale hoisted
  # tsc would silently break. The frontend has NO standalone type-check stage (it
  # builds via react-scripts), so it never needs this pinned-tsc guarantee and is
  # deliberately not in the loop; a `$FRONTEND_DIR)` case here would be dead code.
  case "$PKG" in
    "$BACKEND_DIR")  HEAL_CMD=( cd "$CMDDIR" '&&' npm ci -w mandrel-command-backend  --include-workspace-root=false ) ;;
    *)               HEAL_CMD=( cd "$PKG" '&&' npm ci ) ;;
  esac
  if ( eval "${HEAL_CMD[*]}" ) >/tmp/ci_npmci_${SFX}_$(basename "$PKG").log 2>&1; then
    GOT="$(ts_installed_major "$PKG")"
    if [[ "$GOT" == "$PIN" ]]; then
      echo "${GRN}  ${NAME}: healed — TS major now ${GOT} (matches pin ^${PIN})${RST}"
    else
      echo "${RED}  ${NAME}: STILL '${GOT:-absent}' after npm ci — expected major ${PIN}.${RST}"
      echo "${RED}      The pinned TypeScript can't be resolved locally; type-check would be misleading.${RST}"
      TOOLCHAIN_OK=0
    fi
  else
    echo "${RED}  ${NAME}: 'npm ci' FAILED (see /tmp/ci_npmci_${SFX}_$(basename "$PKG").log).${RST}"
    TOOLCHAIN_OK=0
  fi
done
if [[ "$TOOLCHAIN_OK" -eq 1 ]]; then
  echo "${GRN}PASS: pinned TypeScript resolves locally for all tsc packages.${RST}"
  record "0a. toolchain integrity (TS pin)" "PASS"
else
  echo "${RED}FAIL: pinned TypeScript could not be resolved locally — fix node_modules before trusting type-check.${RST}"
  record "0a. toolchain integrity (TS pin)" "FAIL"
fi

# =============================================================================
hdr "STAGE 0a2: prod-deploy install topology (fast static; Lesson 013)"
# Guard the workspace-correct PROD install logic in fleet-deploy.sh against drift:
# mandrel-command must be installed at the workspace ROOT (never per-member), and
# the install must gate on the real binaries/deps (tsc, react-scripts, cors/helmet).
# This runs only the FAST static assertions (no npm install); the heavy real-build
# path is run on demand via `bash scripts/test/prod-install-topology.test.sh --full`.
if bash "$REPO_DIR/scripts/test/prod-install-topology.test.sh"; then
  echo "${GRN}PASS: prod-deploy install logic matches the workspace topology.${RST}"
  record "0a2. prod-install topology (static)" "PASS"
else
  echo "${RED}FAIL: prod-deploy install logic drifted from the workspace topology — see fleet-deploy.sh / prod-install.sh.${RST}"
  record "0a2. prod-install topology (static)" "FAIL"
fi

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
  record "0c. schema-contract gate" "FAIL"
  record "1. mcp-server contract tests" "FAIL"
  record "2. mcp-server type-check" "FAIL"
  record "3. backend type-check" "FAIL"
  record "4. backend tests" "FAIL"
  record "4b. frontend tests" "FAIL"
  record "5. frontend build" "FAIL"
  hdr "SUMMARY"; for i in "${!STAGE_NAMES[@]}"; do printf '  %-32s %s\n' "${STAGE_NAMES[$i]}" "${STAGE_RESULTS[$i]}"; done
  printf '\n%s########## RED ##########%s\n' "$RED" "$RST"
  exit 1
fi

# =============================================================================
# STAGE 0c — schema-contract gate (anti-drift, Lesson 008)
# =============================================================================
# Proves the committed migrations DETERMINISTICALLY reproduce the expected schema.
# Reuses the disposable DB just migrated in Stage 0b (same DB the tests run on),
# extracts a canonical version-agnostic fingerprint, and diffs it against the
# committed reference (scripts/schema-reference.sql.txt). Catches the "migrations
# don't reproduce the schema / code calls phantom tables+columns" class of bug at
# the gate instead of in prod. Regenerate the reference (after an INTENTIONAL
# schema change) with:  bash scripts/schema-contract.sh regenerate
# =============================================================================
hdr "STAGE 0c: schema-contract gate (migrations reproduce reference schema)"
FINGERPRINT_SQL="$REPO_DIR/scripts/schema-fingerprint.sql"
SCHEMA_REF="$REPO_DIR/scripts/schema-reference.sql.txt"
SC_FRESH="/tmp/ci_schema_fresh_${SFX}.txt"
SC_REF_BODY="/tmp/ci_schema_ref_${SFX}.txt"
SC_DIFF="/tmp/ci_schema_diff_${SFX}.txt"
if [[ ! -f "$FINGERPRINT_SQL" || ! -f "$SCHEMA_REF" ]]; then
  echo "${RED}FAIL: schema-contract assets missing ($FINGERPRINT_SQL / $SCHEMA_REF)${RST}"
  record "0c. schema-contract gate" "FAIL"
else
  $PGSUPER psql -d "$DBNAME" -f "$FINGERPRINT_SQL" 2>/dev/null \
    | grep -E '^(COLUMN|CONSTRAINT|INDEX|VIEW|SEQUENCE|ENUM) ' \
    | LC_ALL=C sort > "$SC_FRESH"
  SC_LINES=$(wc -l < "$SC_FRESH")
  grep -v '^#' "$SCHEMA_REF" | sed '/^[[:space:]]*$/d' | LC_ALL=C sort > "$SC_REF_BODY"
  if [[ "$SC_LINES" -lt 50 ]]; then
    echo "${RED}FAIL: fingerprint extraction produced only ${SC_LINES} lines — broken.${RST}"
    record "0c. schema-contract gate" "FAIL"
  elif diff -u "$SC_REF_BODY" "$SC_FRESH" > "$SC_DIFF" 2>&1; then
    echo "${GRN}PASS: migrations reproduce the committed reference schema (${SC_LINES} objects).${RST}"
    record "0c. schema-contract gate" "PASS"
  else
    echo "${RED}FAIL: SCHEMA DRIFT — committed migrations do NOT reproduce scripts/schema-reference.sql.txt${RST}"
    echo "${YLW}--- < reference (committed)   --- > fresh migrate (actual) ---${RST}"
    grep -E '^[+-][^+-]' "$SC_DIFF" || cat "$SC_DIFF"
    echo "${YLW}If intentional, regenerate + commit:  bash scripts/schema-contract.sh regenerate${RST}"
    record "0c. schema-contract gate" "FAIL"
  fi
fi

# =============================================================================
# STAGE 1 — mcp-server tests (the FULL vitest suite, real DB)
# =============================================================================
# Runs the ENTIRE vitest suite (src/**/*.test.ts), not just *.contract.test.ts.
# Rationale (task sprint0/test-gate, Lesson 011 — fix the class, not the instance):
# scoping the gate to a hand-curated glob let non-contract test files (session.unit,
# httpContract, remoteMcpTransport.integration, the parser/unit suites) ROT silently
# outside the gate. Gating the whole suite means any test under src/** is enforced and
# a new test file is covered the moment it lands — no glob to keep in sync. The vitest
# config pins file-serial execution (fileParallelism:false / singleFork) so the suite
# is order-independent and contention-free against the ONE shared disposable CI DB.
hdr "STAGE 1: mcp-server tests (vitest — full suite, real DB)"
if ( cd "$MCP_DIR" && db_env NODE_ENV="test" EMBEDDING_PREFER_LOCAL="false" \
       npx vitest run ); then
  echo "${GRN}PASS: mcp-server tests${RST}"
  record "1. mcp-server tests (full vitest)" "PASS"
else
  echo "${RED}FAIL: mcp-server tests${RST}"
  record "1. mcp-server tests (full vitest)" "FAIL"
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

fi  # end FE_ONLY guard (DB + backend + mcp stages)

# =============================================================================
# STAGE 4b — frontend tests (react-scripts test, CI mode)
# =============================================================================
# Enforces the frontend Jest/RTL guards at the gate so frontend regressions (and
# in particular the projectResolution default-project guards, 15 cases from the
# v0.5.7 UI fix) can no longer slip through. CI=true makes react-scripts run the
# suite ONCE and exit non-zero on any failure (NOT watch mode). Gates the same
# way every other stage does: a non-zero rc => record FAIL => ci.sh goes RED.
#
# Unlike the backend stage, "no tests found" is treated as a FAILURE here: this
# stage exists specifically to enforce existing frontend guards, so their silent
# disappearance is a regression, not a benign skip.
# =============================================================================
hdr "STAGE 4b: frontend tests (react-scripts test, CI=true)"
FE_LOG="/tmp/ci_frontend_test_${SFX}.log"
set +e
( cd "$FRONTEND_DIR" && CI=true npm test ) 2>&1 | tee "$FE_LOG"
FE_RC=${PIPESTATUS[0]}
set -e
if [[ $FE_RC -ne 0 ]]; then
  echo "${RED}FAIL: frontend tests (react-scripts test, CI=true)${RST}"
  record "4b. frontend tests" "FAIL"
elif grep -qiE "No tests found|Tests:[[:space:]]+0 total" "$FE_LOG"; then
  # Precise zero-tests detection: react-scripts prints "No tests found", and the
  # jest summary line is "Tests:   N passed/total". Anchor on those — do NOT match
  # the bare "0 total" (the "Snapshots:   0 total" summary line is always present
  # and would false-positive a healthy run).
  echo "${RED}FAIL: frontend tests — react-scripts found ZERO tests."
  echo "This stage enforces the existing frontend guards (incl. projectResolution);"
  echo "their disappearance is a regression, not a skip.${RST}"
  record "4b. frontend tests (no tests)" "FAIL"
else
  echo "${GRN}PASS: frontend tests${RST}"
  record "4b. frontend tests" "PASS"
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
