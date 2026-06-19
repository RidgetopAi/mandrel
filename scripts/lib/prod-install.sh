#!/usr/bin/env bash
#
# prod-install.sh — workspace-correct dependency install for the on-box PROD
# (systemd /opt/mandrel) deploy stage of fleet-deploy.sh.
#
# WHY THIS EXISTS (Lesson 013)
#   The PROD tree is built ON the box under NODE_ENV=production. Two traps bit us
#   during the v0.5.0 deploy and this helper guards both as a single class:
#
#   1. NODE_ENV=production makes `npm ci` OMIT devDependencies — so the on-box
#      build loses its toolchain (mcp-server's `tsc`, frontend's `react-scripts`).
#      => every install here passes --include=dev.
#
#   2. TOPOLOGY: the install TARGETS must match how the repo is actually wired:
#        * root package.json            — NOT an npm workspace (no `workspaces`).
#        * mcp-server/                  — standalone package; compiled tsc→dist,
#                                         run from dist. Install in-place.
#        * mandrel-command/package.json — IS a workspace root (members: backend,
#                                         frontend, shared). In a workspace you
#                                         install ONCE at the ROOT and deps hoist.
#                                         Running `npm ci` per-member leaves the
#                                         members PARTIALLY installed — that is
#                                         exactly how the backend ended up missing
#                                         `cors`/`helmet` and crash-looped.
#        * mandrel-command/backend      — runs via tsx (live src, no build) but
#                                         still needs its runtime deps resolvable
#                                         from the workspace.
#
# THE GATE (verify the BINARY/DEP, not just node_modules/)
#   We (re)install when:
#     - the relevant package*.json changed across the deploy, OR
#     - node_modules/ is absent, OR
#     - the actual build binary / runtime dep is NOT resolvable. The backend
#       runtime-dep check (cors + helmet resolvable from mandrel-command/backend)
#       is the one that would have CAUGHT the v0.5.0 incident.
#
# USAGE
#   source "scripts/lib/prod-install.sh"
#   prod_install_deps "<prod_dir>" "<deps_changed_paths>"
#     <prod_dir>           : the /opt/mandrel checkout (workspace lives under it).
#     <deps_changed_paths> : newline-separated list of package*.json paths that
#                            changed across the deploy (may be empty). Matched
#                            against the install targets below.
#   Returns 0 on success, non-zero on the first failed install.
#
# This file is sourced by fleet-deploy.sh (which defines info/bad/ok) AND called
# directly by scripts/test/prod-install-topology.test.sh (which does not). So the
# logging helpers degrade gracefully to plain echo if not already defined.

# --- logging shims (no-op override if the caller already defined them) -------
if ! declare -F info >/dev/null 2>&1; then info() { printf '[prod-install] %s\n' "$*"; }; fi
if ! declare -F ok   >/dev/null 2>&1; then ok()   { printf '  [PASS] %s\n' "$*"; }; fi
if ! declare -F bad  >/dev/null 2>&1; then bad()  { printf '  [FAIL] %s\n' "$*"; }; fi

# --- resolution probes (gate on the real artifact, not the folder) -----------

# mcp-server build binary present & executable?
prod_mcp_tsc_ok() {  # <prod_dir>
  [[ -x "$1/mcp-server/node_modules/.bin/tsc" ]]
}

# frontend build binary (react-scripts) resolvable, regardless of hoisting?
# In a workspace it usually hoists to mandrel-command/node_modules/.bin, but it
# may also land under the member — so test BOTH bin paths AND a require.resolve
# from the frontend dir (the resolution npm itself uses to run the build).
prod_frontend_react_scripts_ok() {  # <prod_dir>
  local cmd="$1/mandrel-command"
  [[ -x "$cmd/node_modules/.bin/react-scripts" ]] && return 0
  [[ -x "$cmd/frontend/node_modules/.bin/react-scripts" ]] && return 0
  ( cd "$cmd/frontend" && node -e "require.resolve('react-scripts/package.json')" ) >/dev/null 2>&1
}

# backend runtime deps resolvable FROM the backend? This is the check that would
# have caught the crash-loop: cors + helmet must resolve from mandrel-command/backend.
prod_backend_runtime_ok() {  # <prod_dir>
  ( cd "$1/mandrel-command/backend" && node -e "require.resolve('cors'); require.resolve('helmet')" ) >/dev/null 2>&1
}

# --- the install driver ------------------------------------------------------
# prod_install_deps <prod_dir> <deps_changed_paths>
prod_install_deps() {
  local dir="$1" deps_changed="${2:-}"

  # --- mcp-server (standalone package; tsc→dist) ----------------------------
  if [[ -d "$dir/mcp-server" ]]; then
    local need=""
    # deps_changed maps: any change to mcp-server/package*.json → reinstall here.
    if [[ -n "$deps_changed" ]] && grep -q '^mcp-server/package' <<<"$deps_changed"; then need=1; fi
    [[ -d "$dir/mcp-server/node_modules" ]] || need=1
    prod_mcp_tsc_ok "$dir" || need=1
    if [[ -n "$need" ]]; then
      info "prod: npm ci --include=dev in mcp-server (standalone)"
      if ! ( cd "$dir/mcp-server" && npm ci --include=dev ); then bad "prod: npm ci failed in mcp-server"; return 1; fi
    fi
    prod_mcp_tsc_ok "$dir" || { bad "prod: mcp-server tsc still missing after install"; return 1; }
  fi

  # --- mandrel-command (npm workspace ROOT; install ONCE, deps hoist) --------
  # Members backend/frontend/shared are installed by the SINGLE root `npm ci`.
  # NEVER `npm ci` a member directly — that leaves the others partial (the
  # cors/helmet crash-loop). Reinstall when ANY member's (or the root's)
  # package*.json changed, node_modules is absent at the root, or any of the
  # three real artifacts (frontend build binary, backend runtime deps) is
  # unresolvable.
  if [[ -d "$dir/mandrel-command" ]]; then
    local need=""
    if [[ -n "$deps_changed" ]] && grep -qE '^mandrel-command/(package|backend/package|frontend/package|shared/package)' <<<"$deps_changed"; then need=1; fi
    [[ -d "$dir/mandrel-command/node_modules" ]] || need=1
    prod_frontend_react_scripts_ok "$dir" || need=1
    prod_backend_runtime_ok "$dir"        || need=1
    if [[ -n "$need" ]]; then
      info "prod: npm ci --include=dev at mandrel-command WORKSPACE ROOT (hoists backend+frontend+shared)"
      if ! ( cd "$dir/mandrel-command" && npm ci --include=dev ); then bad "prod: npm ci failed at mandrel-command workspace root"; return 1; fi
    fi
    # Re-verify the exact artifacts that broke prod — fail closed if still missing.
    prod_frontend_react_scripts_ok "$dir" || { bad "prod: frontend react-scripts unresolvable after workspace install"; return 1; }
    prod_backend_runtime_ok "$dir"        || { bad "prod: backend cors/helmet unresolvable after workspace install"; return 1; }
  fi

  return 0
}
