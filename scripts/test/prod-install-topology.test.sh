#!/usr/bin/env bash
# =============================================================================
# prod-install-topology.test.sh
# -----------------------------------------------------------------------------
# Acceptance test for the workspace-correct PROD dependency install used by
# scripts/lib/prod-install.sh (called from fleet-deploy.sh deploy_prod).
#
# It proves the v0.5.0 crash-loop class (Lesson 013) is fixed WITHOUT touching
# real prod:
#   * Static (fast, default): assert the install logic targets/gates match the
#     real topology — mandrel-command is a workspace ROOT (install once), root
#     package.json is NOT a workspace, cors/helmet live in the backend member,
#     react-scripts in the frontend member, typescript in mcp-server. And that
#     the deploy script delegates to prod_install_deps (no per-member npm ci).
#   * Heavy (--full): in a CLEAN `git worktree` of current main (node_modules
#     ABSENT), under NODE_ENV=production, run prod_install_deps and assert:
#       1. mcp-server/node_modules/.bin/tsc exists & is executable.
#       2. react-scripts resolves for the frontend.
#       3. From mandrel-command/backend: node require.resolve('cors'/'helmet') ok.
#       4. `npm run build` (mcp-server) AND `CI=false npm run build` (frontend) ok.
#     Then it DEMONSTRATES THE TEST CATCHES THE REGRESSION: it reproduces the OLD
#     per-member approach (frontend→backend order) in a separate clean worktree.
#     Because npm hoists+prunes a workspace per member, the backend member install
#     PRUNES the frontend's react-scripts back out — so assertion #2 (react-scripts
#     resolvable) FAILS under the old way. The test is not vacuously green.
#
# The heavy path is network/time-heavy (two full `npm ci`s). It is gated behind
# --full so CI can keep just the fast static assertions by default.
#
# USAGE
#   bash scripts/test/prod-install-topology.test.sh           # fast static only
#   bash scripts/test/prod-install-topology.test.sh --full    # + real install/build
#   PROD_INSTALL_FULL=1 bash scripts/test/prod-install-topology.test.sh
# =============================================================================
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LIB="$REPO_DIR/scripts/lib/prod-install.sh"
DEPLOY="$REPO_DIR/scripts/fleet-deploy.sh"

FULL=0
[[ "${1:-}" == "--full" || "${PROD_INSTALL_FULL:-0}" == "1" ]] && FULL=1

RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; BLD=$'\033[1m'; RST=$'\033[0m'
PASS=0; FAIL=0
pass() { printf '  %s[PASS]%s %s\n' "$GRN" "$RST" "$*"; PASS=$((PASS+1)); }
fail() { printf '  %s[FAIL]%s %s\n' "$RED" "$RST" "$*"; FAIL=$((FAIL+1)); }
hdr()  { printf '\n%s== %s ==%s\n' "$BLD" "$*" "$RST"; }

# A grep that asserts presence, used for the static checks.
assert_grep() {  # <pattern> <file> <label>
  if grep -qE "$1" "$2"; then pass "$3"; else fail "$3 (pattern not found: $1)"; fi
}
assert_no_grep() {  # <pattern> <file> <label>
  if grep -qE "$1" "$2"; then fail "$3 (UNEXPECTED match: $1)"; else pass "$3"; fi
}

# =============================================================================
hdr "STATIC: topology facts (the install targets must match these)"
# Root is NOT a workspace.
assert_no_grep '"workspaces"' "$REPO_DIR/package.json" "root package.json has NO workspaces field (mcp-server/mandrel-command are independent)"
# mandrel-command IS the workspace root.
assert_grep '"workspaces"' "$REPO_DIR/mandrel-command/package.json" "mandrel-command/package.json IS a workspace root"
# cors + helmet declared in the BACKEND member (the deps that crash-looped).
assert_grep '"cors"'   "$REPO_DIR/mandrel-command/backend/package.json"  "cors declared in mandrel-command/backend"
assert_grep '"helmet"' "$REPO_DIR/mandrel-command/backend/package.json"  "helmet declared in mandrel-command/backend"
# react-scripts in the FRONTEND member.
assert_grep '"react-scripts"' "$REPO_DIR/mandrel-command/frontend/package.json" "react-scripts declared in mandrel-command/frontend"
# typescript in mcp-server (standalone build toolchain).
assert_grep '"typescript"' "$REPO_DIR/mcp-server/package.json" "typescript declared in mcp-server"

hdr "STATIC: deploy logic delegates correctly (no per-member npm ci)"
# The deploy script must call the shared workspace-correct driver.
assert_grep 'prod_install_deps' "$DEPLOY" "deploy_prod calls prod_install_deps"
# The OLD broken loop (per-member npm ci on frontend/backend) must be GONE.
assert_no_grep 'for pkg in mcp-server mandrel-command/frontend mandrel-command/backend' \
  "$DEPLOY" "old per-member install loop is REMOVED"
# The lib installs mandrel-command at the ROOT, not per-member.
assert_grep 'cd "\$dir/mandrel-command" && npm ci --include=dev' "$LIB" "lib installs mandrel-command at WORKSPACE ROOT"
assert_grep 'cd "\$dir/mcp-server" && npm ci --include=dev'       "$LIB" "lib installs mcp-server standalone"
# The lib must include the backend runtime-dep gate (the incident check).
assert_grep "require.resolve\\('cors'\\)" "$LIB" "lib gates on backend cors resolvable"
assert_grep "require.resolve\\('helmet'\\)" "$LIB" "lib gates on backend helmet resolvable"
# All installs pass --include=dev (NODE_ENV=production omits devDeps otherwise).
assert_no_grep 'npm ci( --include=dev)?$' "$LIB" "no bare 'npm ci' without --include=dev in lib"

if [[ $FULL -eq 0 ]]; then
  hdr "RESULT (static only)"
  printf '  PASS=%d  FAIL=%d\n' "$PASS" "$FAIL"
  echo "  ${YLW}Heavy install/build assertions SKIPPED — re-run with --full to exercise them.${RST}"
  [[ $FAIL -eq 0 ]] && exit 0 || exit 1
fi

# =============================================================================
# HEAVY PATH — real install + build in throwaway worktrees, node_modules ABSENT.
# =============================================================================
source "$LIB"

WORKROOT="$(mktemp -d /tmp/prod-install-test.XXXXXX)"
NEW_WT="$WORKROOT/new"     # exercises the NEW workspace-root install
OLD_WT="$WORKROOT/old"     # reproduces the OLD per-member install (must fail #3)
cleanup() {
  # Remove the worktrees from git's registry, then the temp dir.
  git -C "$REPO_DIR" worktree remove --force "$NEW_WT" 2>/dev/null || true
  git -C "$REPO_DIR" worktree remove --force "$OLD_WT" 2>/dev/null || true
  rm -rf "$WORKROOT"
  git -C "$REPO_DIR" worktree prune 2>/dev/null || true
}
trap cleanup EXIT

REF="$(git -C "$REPO_DIR" rev-parse HEAD)"
hdr "HEAVY: clean worktrees of $REF (node_modules absent), NODE_ENV=production"
git -C "$REPO_DIR" worktree add --quiet --detach "$NEW_WT" "$REF" || { fail "git worktree add (new) failed"; exit 1; }
git -C "$REPO_DIR" worktree add --quiet --detach "$OLD_WT" "$REF" || { fail "git worktree add (old) failed"; exit 1; }
# Prove node_modules really is absent in the fresh checkout.
if [[ ! -d "$NEW_WT/mandrel-command/node_modules" && ! -d "$NEW_WT/mcp-server/node_modules" ]]; then
  pass "fresh worktree has NO node_modules (reproduces a clean prod checkout)"
else
  fail "fresh worktree unexpectedly has node_modules"
fi

export NODE_ENV=production
echo "  NODE_ENV=$NODE_ENV (reproduces prod systemd; npm ci would omit devDeps without --include=dev)"

# ---- NEW approach: the real driver under test --------------------------------
hdr "HEAVY: run prod_install_deps (the FIX) in the clean worktree"
if prod_install_deps "$NEW_WT" ""; then
  pass "prod_install_deps completed (its internal fail-closed gates passed)"
else
  fail "prod_install_deps returned non-zero"
fi

# Assertion 1: mcp-server tsc binary.
if [[ -x "$NEW_WT/mcp-server/node_modules/.bin/tsc" ]]; then
  pass "#1 mcp-server/node_modules/.bin/tsc exists & executable"
else
  fail "#1 mcp-server tsc binary missing/not executable"
fi

# Assertion 2: react-scripts resolves for the frontend.
if ( cd "$NEW_WT/mandrel-command/frontend" && node -e "require.resolve('react-scripts/package.json')" ) >/dev/null 2>&1 \
   || [[ -x "$NEW_WT/mandrel-command/node_modules/.bin/react-scripts" ]]; then
  pass "#2 react-scripts resolves for the frontend"
else
  fail "#2 react-scripts NOT resolvable for the frontend"
fi

# Assertion 3: backend runtime deps resolve FROM the backend (the incident check).
if ( cd "$NEW_WT/mandrel-command/backend" && node -e "require.resolve('cors'); require.resolve('helmet')" ) >/dev/null 2>&1; then
  pass "#3 cors + helmet resolve from mandrel-command/backend (incident is fixed)"
else
  fail "#3 cors/helmet do NOT resolve from backend — REGRESSION"
fi

# Assertion 4: the real builds succeed.
hdr "HEAVY: real builds (mcp-server tsc + frontend CRA)"
if ( cd "$NEW_WT/mcp-server" && npm run build ) >"$WORKROOT/mcp-build.log" 2>&1; then
  pass "#4a mcp-server 'npm run build' succeeded"
else
  fail "#4a mcp-server build failed (see $WORKROOT/mcp-build.log)"; tail -20 "$WORKROOT/mcp-build.log"
fi
if ( cd "$NEW_WT/mandrel-command/frontend" && CI=false npm run build ) >"$WORKROOT/fe-build.log" 2>&1; then
  pass "#4b frontend 'CI=false npm run build' succeeded"
else
  fail "#4b frontend build failed (see $WORKROOT/fe-build.log)"; tail -20 "$WORKROOT/fe-build.log"
fi

# ---- OLD approach: prove the test CATCHES the regression ---------------------
# Reproduce the v0.5.0 mechanism FAITHFULLY (verified by signal-tracing, not
# assumed): the old loop ran `npm ci` per-member in order
# `mcp-server, mandrel-command/frontend, mandrel-command/backend`. Because each
# member is part of the mandrel-command WORKSPACE, npm installs+hoists to the
# workspace ROOT and PRUNES it to ONLY the member it was invoked for. So the
# members OVERWRITE each other's hoisted tree — the LAST member wins:
#   frontend install → react-scripts hoisted to mandrel-command/node_modules/.bin
#   backend  install → re-resolves the hoisted tree for the BACKEND only and
#                      PRUNES react-scripts OUT  →  "react-scripts: not found".
# So the regression surfaces as assertion #2 (the frontend build binary) failing
# after the backend member install — the exact "react-scripts: not found" the
# incident hit. We assert that the OLD ordering leaves react-scripts UNRESOLVABLE.
hdr "REGRESSION DEMO: old per-member install (frontend→backend) must leave react-scripts MISSING"
echo "  (running 'npm ci --include=dev' per-member in the OLD loop order — NOT once at the root)"
( cd "$OLD_WT/mandrel-command/frontend" && npm ci --include=dev ) >"$WORKROOT/old-fe.log" 2>&1
echo "  after FRONTEND member install — react-scripts present:"
if [[ -x "$OLD_WT/mandrel-command/node_modules/.bin/react-scripts" ]]; then
  echo "    yes (hoisted to mandrel-command/node_modules/.bin/react-scripts)"
else
  echo "    ${YLW}no (unexpected — frontend install should have placed it)${RST}"
fi
( cd "$OLD_WT/mandrel-command/backend" && npm ci --include=dev ) >"$WORKROOT/old-be.log" 2>&1
echo "  after BACKEND member install (overwrites the hoisted tree)…"
# react-scripts must now be GONE — that is the catch.
if ( cd "$OLD_WT/mandrel-command/frontend" && node -e "require.resolve('react-scripts/package.json')" ) >/dev/null 2>&1 \
   || [[ -x "$OLD_WT/mandrel-command/node_modules/.bin/react-scripts" ]]; then
  fail "REGRESSION DEMO: old per-member install LEFT react-scripts resolvable — test would NOT catch the bug"
else
  pass "REGRESSION DEMO: old per-member install PRUNED react-scripts (the 'react-scripts: not found' incident) → assertion #2 correctly catches it"
fi

# =============================================================================
hdr "RESULT"
printf '  PASS=%d  FAIL=%d\n' "$PASS" "$FAIL"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
