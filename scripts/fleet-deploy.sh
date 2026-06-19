#!/usr/bin/env bash
# =============================================================================
# fleet-deploy.sh — the CD orchestrator for the Mandrel fleet
# =============================================================================
# Safe, gated, one-at-a-time rolling deploy of the code services across every
# hosted Mandrel instance on this VPS.
#
#   CI gate (scripts/ci.sh)  →  STAGING bake (mandrel-staging)  →  rolling
#   customer fleet, ONE INSTANCE AT A TIME, health-gated, STOP on first failure.
#
# A "deploy" of an instance is:
#   docker compose -f docker-compose.yml -f docker-compose.<h>.yml \
#     --env-file /root/.mandrel-<h>.env -p mandrel-<h> up -d --build <services>
# followed by: wait for containers `healthy` + smoke (mcp /healthz 200,
# backend /api/health 200, plus a deeper non-5xx app check).
#
# SCOPE / SAFETY:
#   * Only ever touches the three CODE services (mcp-server, command-backend,
#     command-frontend). NEVER postgres/redis (data tier untouched).
#   * Discovers customer instances dynamically; EXCLUDES `staging` from the
#     customer roll (it is the canary, deployed in its own stage) and anything
#     tied to the systemd internal prod under /opt/mandrel (not a compose stack,
#     never discovered here).
#   * Idempotent / re-runnable. Clear per-stage + per-instance PASS/FAIL.
#
# Flags:
#   --services "<a b c>"   Services to deploy. Default: all three code services.
#                          postgres/redis are rejected if passed.
#   --skip-ci              Skip the ci.sh gate (LOUD warning). Default: run it.
#   --skip-prod            Skip the final PROD (/opt/mandrel) deploy stage. Default:
#                          deploy prod LAST, after the fleet roll is green.
#   --dry-run              Print the full plan; deploy NOTHING.
#   --only <handle>        Deploy a single instance (still CI+staging-gated
#                          unless --skip-ci). <handle> may be a customer or
#                          `staging` itself.
#   --yes                  Non-interactive (assume yes to the confirm prompt).
#
# Usage:
#   bash scripts/fleet-deploy.sh                       # full pipeline, all instances
#   bash scripts/fleet-deploy.sh --dry-run             # show the plan
#   bash scripts/fleet-deploy.sh --only <handle> --yes # one instance, gated
#   bash scripts/fleet-deploy.sh --skip-ci --only <handle>
# =============================================================================
set -euo pipefail

# --- Paths -------------------------------------------------------------------
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_COMPOSE="$REPO_DIR/docker-compose.yml"
CI_SCRIPT="$REPO_DIR/scripts/ci.sh"

# --- Defaults ----------------------------------------------------------------
SERVICES="mcp-server mandrel-command-backend mandrel-command-frontend"
SKIP_CI=0
DRY_RUN=0
ONLY=""
ASSUME_YES=0
HEALTH_TIMEOUT=60          # seconds to wait for healthy/smoke before declaring fail
STAGING_HANDLE="staging"

# --- PROD (systemd /opt/mandrel) — deployed as the FINAL stage --------------
# Prod is NOT a compose stack; it's the systemd internal instance. It used to be
# excluded entirely, so it silently drifted behind the fleet every release (the
# "do I have to remember to sync prod?" defect). It is now a first-class final
# stage: after the customer roll is GREEN, prod is deployed from a CLEAN CHECKOUT
# of the SAME ref the fleet got — reset --hard (NEVER stash/clean, so untracked
# secrets/.env.secrets + ops scripts are never touched — see Lesson 012), rebuild,
# restart, health-gate. DEPLOY_PROD=0 (--skip-prod) opts out.
PROD_DIR="${PROD_DIR:-/opt/mandrel}"
PROD_REF="${PROD_REF:-$(git -C "$REPO_DIR" rev-parse HEAD)}"   # the commit the fleet was built from
PROD_USER="${PROD_USER:-ridgetop}"                              # systemd User= for both prod services
PROD_SERVICES="${PROD_SERVICES:-mandrel mandrel-command}"
DEPLOY_PROD=1

# --- Pretty output -----------------------------------------------------------
RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; CYN=$'\033[36m'; BLD=$'\033[1m'; RST=$'\033[0m'
hdr()  { printf '\n%s========== %s ==========%s\n' "$BLD" "$*" "$RST"; }
info() { printf '%s[fleet-deploy]%s %s\n' "$CYN" "$RST" "$*"; }
ok()   { printf '  %s[PASS]%s %s\n' "$GRN" "$RST" "$*"; }
bad()  { printf '  %s[FAIL]%s %s\n' "$RED" "$RST" "$*"; }
warn() { printf '%s[WARN]%s %s\n' "$YLW" "$RST" "$*"; }

# --- Shared PROD install logic (workspace-correct; Lesson 013) ---------------
# Factored into a sourced lib so the acceptance test (scripts/test/) can exercise
# the EXACT install targets/gates this deploy uses, not a drifting copy. Sourced
# AFTER info/ok/bad so the lib reuses them (its shims become no-ops).
# shellcheck source=lib/prod-install.sh
source "$REPO_DIR/scripts/lib/prod-install.sh"

# --- Arg parsing -------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --services) SERVICES="${2:?--services needs a value}"; shift 2 ;;
    --skip-ci)  SKIP_CI=1; shift ;;
    --skip-prod) DEPLOY_PROD=0; shift ;;
    --dry-run)  DRY_RUN=1; shift ;;
    --only)     ONLY="${2:?--only needs a handle}"; shift 2 ;;
    --yes|-y)   ASSUME_YES=1; shift ;;
    -h|--help)  grep -E '^#' "$0" | sed 's/^# \{0,1\}//' | head -60; exit 0 ;;
    *) echo "${RED}Unknown flag: $1${RST}" >&2; exit 2 ;;
  esac
done

# --- Guard: never deploy the data tier ---------------------------------------
for s in $SERVICES; do
  case "$s" in
    postgres|redis)
      echo "${RED}REFUSING: '$s' is a data-tier service and must never be deployed by fleet-deploy.${RST}" >&2
      exit 2 ;;
    mcp-server|mandrel-command-backend|mandrel-command-frontend) : ;;
    *)
      echo "${RED}REFUSING: unknown service '$s' (expected mcp-server|mandrel-command-backend|mandrel-command-frontend).${RST}" >&2
      exit 2 ;;
  esac
done

# =============================================================================
# Instance discovery
# =============================================================================
# Discover every compose instance by its postgres container (mandrel-<h>-postgres),
# mirroring fleet-status.sh. The customer roll EXCLUDES staging (its own stage).
discover_handles() {  # prints all handles (incl. staging), one per line
  docker ps --format '{{.Names}}' \
    | grep -E '^mandrel-.*-postgres$' \
    | sed -E 's/^mandrel-(.*)-postgres$/\1/' \
    | sort
}

# Resolve the per-instance artifacts for a handle.
override_for()  { echo "$REPO_DIR/docker-compose.$1.yml"; }
envfile_for()   { echo "/root/.mandrel-$1.env"; }

# Mapped host port for a container's internal port (e.g. 8080/tcp -> 18099).
mapped_port() {  # <container> <internal_port>  -> host port or empty
  docker inspect "$1" --format \
    "{{range \$p,\$v := .NetworkSettings.Ports}}{{if eq \$p \"$2/tcp\"}}{{range \$v}}{{.HostPort}}{{end}}{{end}}{{end}}" \
    2>/dev/null || true
}

# =============================================================================
# Per-instance deploy + health + smoke
# =============================================================================
# Returns 0 on full success, non-zero on any failure (with a printed reason).
deploy_instance() {  # <handle>
  local h="$1"
  local override env_file project
  override="$(override_for "$h")"
  env_file="$(envfile_for "$h")"
  project="mandrel-$h"

  info "── instance '$h' ──"

  # Pre-flight: artifacts must exist.
  if [[ ! -f "$override" ]]; then bad "$h: missing compose override $override"; return 1; fi
  if [[ ! -f "$env_file" ]]; then bad "$h: missing env file $env_file"; return 1; fi

  # ---- deploy (build + up the code services only) ----
  info "$h: deploying services [$SERVICES] (-p $project)"
  if ! docker compose -f "$BASE_COMPOSE" -f "$override" \
        --env-file "$env_file" -p "$project" up -d --build $SERVICES; then
    bad "$h: docker compose up failed"
    return 1
  fi

  # ---- wait for containers healthy ----
  # Only wait on the services we deployed that actually declare a healthcheck.
  local -a wait_containers=()
  for s in $SERVICES; do
    case "$s" in
      mcp-server)               wait_containers+=("mandrel-$h-mcp-server") ;;
      mandrel-command-backend)  wait_containers+=("mandrel-$h-command-backend") ;;
      mandrel-command-frontend) wait_containers+=("mandrel-$h-command-frontend") ;;
    esac
  done

  info "$h: waiting up to ${HEALTH_TIMEOUT}s for containers healthy"
  local deadline=$(( SECONDS + HEALTH_TIMEOUT ))
  for c in "${wait_containers[@]}"; do
    local cok=0
    while (( SECONDS < deadline )); do
      local hs
      hs="$(docker inspect "$c" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' 2>/dev/null || echo missing)"
      local rs
      rs="$(docker inspect "$c" --format '{{.State.Status}}' 2>/dev/null || echo missing)"
      # 'none' = no healthcheck declared → accept once running.
      if [[ "$hs" == "healthy" ]] || { [[ "$hs" == "none" ]] && [[ "$rs" == "running" ]]; }; then
        cok=1; break
      fi
      if [[ "$rs" == "exited" || "$rs" == "dead" || "$hs" == "unhealthy" ]]; then
        bad "$h: container $c is $rs/$hs"
        return 1
      fi
      sleep 3
    done
    if [[ "$cok" != "1" ]]; then
      bad "$h: container $c never became healthy within ${HEALTH_TIMEOUT}s"
      return 1
    fi
    ok "$h: $c healthy"
  done

  # ---- smoke (retry health endpoints for ~HEALTH_TIMEOUT before failing) ----
  local mcp_c="mandrel-$h-mcp-server"
  local be_c="mandrel-$h-command-backend"
  local mcp_port be_port
  mcp_port="$(mapped_port "$mcp_c" 8080)"
  be_port="$(mapped_port "$be_c" 5000)"

  # (1) mcp /healthz == 200  (only if mcp-server was part of this deploy / exists)
  if [[ -n "$mcp_port" ]]; then
    if ! retry_http 200 "http://127.0.0.1:${mcp_port}/healthz"; then
      bad "$h: mcp /healthz did not return 200 on port ${mcp_port}"
      return 1
    fi
    ok "$h: mcp /healthz 200 (port ${mcp_port})"

    # (3) deeper: mcp sessions/start path is non-5xx (DB write path alive).
    local sess_code
    sess_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 \
      -X POST "http://127.0.0.1:${mcp_port}/api/v2/sessions/start" \
      -H 'Content-Type: application/json' -d '{}' || echo 000)"
    if [[ "$sess_code" =~ ^5 || "$sess_code" == "000" ]]; then
      bad "$h: mcp /api/v2/sessions/start returned $sess_code (expected non-5xx)"
      return 1
    fi
    ok "$h: mcp /api/v2/sessions/start non-5xx ($sess_code)"
  fi

  # (2) backend /api/health == 200
  if [[ -n "$be_port" ]]; then
    if ! retry_http 200 "http://127.0.0.1:${be_port}/api/health"; then
      bad "$h: backend /api/health did not return 200 on port ${be_port}"
      return 1
    fi
    ok "$h: backend /api/health 200 (port ${be_port})"

    # (4) deeper: an authed app route answers non-5xx (401 expected w/o token,
    #     which proves the route+DB+auth chain is alive, not a crashed app).
    local proj_code
    proj_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 \
      "http://127.0.0.1:${be_port}/api/projects" || echo 000)"
    if [[ "$proj_code" =~ ^5 || "$proj_code" == "000" ]]; then
      bad "$h: backend /api/projects returned $proj_code (expected non-5xx, e.g. 401)"
      return 1
    fi
    ok "$h: backend /api/projects non-5xx ($proj_code)"
  fi

  ok "$h: deploy + health + smoke GREEN"
  return 0
}

# Retry an HTTP GET until it returns the expected code or HEALTH_TIMEOUT elapses.
retry_http() {  # <expected_code> <url>
  local want="$1" url="$2"
  local deadline=$(( SECONDS + HEALTH_TIMEOUT ))
  while (( SECONDS < deadline )); do
    local code
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$url" || echo 000)"
    [[ "$code" == "$want" ]] && return 0
    sleep 3
  done
  return 1
}

# =============================================================================
# PROD deploy (systemd /opt/mandrel) — clean checkout of PROD_REF, rebuild, smoke
# =============================================================================
# Returns 0 on full success, non-zero on any failure (prints a rollback hint).
# SAFETY (Lesson 012): only `git fetch` + `git reset --hard` — NEVER stash/clean,
# so untracked runtime files (.env.secrets, prod-only ops scripts) are untouched.
deploy_prod() {
  local dir="$PROD_DIR" ref="$PROD_REF"
  info "── PROD ($dir → ${ref:0:12}) ──"

  if [[ ! -d "$dir/.git" ]]; then bad "prod: $dir is not a git checkout"; return 1; fi

  # Rollback point (current prod commit) — printed on failure.
  local prev; prev="$(git -C "$dir" rev-parse HEAD 2>/dev/null || echo unknown)"
  info "prod: current=$prev  target=$ref"

  # Fetch the exact ref the fleet was built from; refuse if it isn't reachable.
  # --force so divergent local tags (e.g. from a history rewrite) can't fail the
  # fetch with "would clobber existing tag" — origin is the source of truth.
  if ! git -C "$dir" fetch --quiet --force --tags origin; then bad "prod: git fetch failed"; return 1; fi
  if ! git -C "$dir" cat-file -e "${ref}^{commit}" 2>/dev/null; then
    bad "prod: target ref $ref not found after fetch (is it pushed to origin?)"; return 1
  fi

  # Detect whether deps changed across the deploy (decides npm ci vs build-only).
  local deps_changed=""
  deps_changed="$(git -C "$dir" diff --name-only "$prev" "$ref" 2>/dev/null \
    | grep -E '(^|/)package(-lock)?\.json$' || true)"

  # Clean checkout — tracked files → ref; untracked runtime files UNTOUCHED.
  if ! git -C "$dir" reset --hard "$ref"; then bad "prod: git reset --hard failed"; return 1; fi
  ok "prod: tree at $(git -C "$dir" rev-parse --short HEAD)"

  # Install deps for the on-box build, WORKSPACE-CORRECTLY (Lesson 013). The two
  # install targets match the real topology:
  #   * mcp-server            — standalone package; tsc→dist, RUN from dist.
  #   * mandrel-command       — npm workspace ROOT (members backend/frontend/
  #                             shared); install ONCE at the root so deps hoist.
  #                             The backend runs tsx (live src, no build) but its
  #                             runtime deps (cors/helmet) must resolve; the
  #                             frontend is a static CRA build served by nginx.
  # All installs pass --include=dev because prod systemd runs NODE_ENV=production,
  # under which `npm ci` OMITS the devDeps the on-box build needs (tsc / react-
  # scripts). prod_install_deps reinstalls a target when its package*.json
  # changed, its node_modules is absent, OR — the real gate — the actual build
  # binary / runtime dep is unresolvable (NOT merely "node_modules/ exists"). It
  # fails closed if the artifacts that crash-looped prod (frontend react-scripts,
  # backend cors/helmet) are still missing after the install. See
  # scripts/lib/prod-install.sh.
  if ! prod_install_deps "$dir" "$deps_changed"; then
    bad "prod: dependency install failed — ROLLBACK: git -C $dir reset --hard $prev && rebuild && systemctl restart $PROD_SERVICES"
    return 1
  fi
  info "prod: building mcp-server (tsc) + frontend (CRA)"
  if ! ( cd "$dir/mcp-server" && npm run build ) ; then bad "prod: mcp-server build failed"; return 1; fi
  if [[ -d "$dir/mandrel-command/frontend" ]]; then
    if ! ( cd "$dir/mandrel-command/frontend" && CI=false npm run build ) ; then bad "prod: frontend build failed"; return 1; fi
  fi

  # Ownership back to the service user (root built it — Lesson 008). Fail closed:
  # a root-owned dist/build would crash the ridgetop-user services.
  if ! chown -R "$PROD_USER:$PROD_USER" "$dir"; then
    bad "prod: chown to $PROD_USER FAILED — ROLLBACK: git -C $dir reset --hard $prev && rebuild && systemctl restart $PROD_SERVICES"
    return 1
  fi

  # Restart + health-gate.
  info "prod: restarting [$PROD_SERVICES]"
  if ! systemctl restart $PROD_SERVICES; then
    bad "prod: systemctl restart failed — ROLLBACK: git -C $dir reset --hard $prev && rebuild && systemctl restart $PROD_SERVICES"
    return 1
  fi

  # Smoke: mcp /healthz 200, backend /api/health 200, and initialize reports the
  # version this ref ships (proves the NEW build is actually live, not stale).
  if ! retry_http 200 "http://127.0.0.1:8080/healthz"; then
    bad "prod: mcp /healthz not 200 — ROLLBACK: git -C $dir reset --hard $prev && rebuild && systemctl restart $PROD_SERVICES"
    return 1
  fi
  ok "prod: mcp /healthz 200"
  if ! retry_http 200 "http://127.0.0.1:5000/api/health"; then
    bad "prod: backend /api/health not 200 — ROLLBACK: git -C $dir reset --hard $prev && rebuild && systemctl restart $PROD_SERVICES"
    return 1
  fi
  ok "prod: backend /api/health 200"

  local want_ver live_ver tok
  want_ver="$(grep -m1 '"version"' "$dir/mcp-server/package.json" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+[^"]*')"
  tok="$(grep -m1 '^MCP_AUTH_TOKEN=' "$dir/.env.secrets" 2>/dev/null | cut -d= -f2-)"
  live_ver="$(curl -s --max-time 8 -X POST http://127.0.0.1:8080/mcp \
      -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
      -H "Authorization: Bearer $tok" \
      -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"fleet-deploy","version":"1"}}}' \
      2>/dev/null | grep -oE '"version":"[^"]*"' | head -1 | sed -E 's/.*:"([^"]*)"/\1/')"
  if [[ -z "$want_ver" ]]; then
    bad "prod: could not parse expected version from $dir/mcp-server/package.json — cannot verify the build is live (fail closed)"
    return 1
  fi
  if [[ "$live_ver" != "$want_ver" ]]; then
    bad "prod: initialize reports '$live_ver' but ref ships '$want_ver' (stale/broken build) — ROLLBACK: git -C $dir reset --hard $prev && rebuild && systemctl restart $PROD_SERVICES"
    return 1
  fi
  ok "prod: initialize reports v${live_ver}"
  ok "prod: deploy + health + smoke GREEN"
  return 0
}

# =============================================================================
# Build the plan
# =============================================================================
ALL_HANDLES=()
mapfile -t ALL_HANDLES < <(discover_handles)

# Customer roll = all discovered handles EXCEPT staging.
CUSTOMER_HANDLES=()
for h in "${ALL_HANDLES[@]}"; do
  [[ "$h" == "$STAGING_HANDLE" ]] && continue
  CUSTOMER_HANDLES+=("$h")
done

# Apply --only narrowing.
ROLL_TARGETS=()
DEPLOY_STAGING=1
if [[ -n "$ONLY" ]]; then
  if [[ "$ONLY" == "prod" ]]; then
    # --only prod: just (re)deploy prod (still CI-gated). No staging, no customer roll.
    DEPLOY_STAGING=0; ROLL_TARGETS=(); DEPLOY_PROD=1
  elif [[ "$ONLY" == "$STAGING_HANDLE" ]]; then
    # --only staging: just (re)deploy staging via the staging stage; no customer roll, no prod.
    ROLL_TARGETS=(); DEPLOY_PROD=0
  else
    # any other targeted --only <customer>: that one customer only, never prod.
    DEPLOY_PROD=0
    # --only <customer>: must be a discovered customer handle.
    only_found=0
    for h in "${CUSTOMER_HANDLES[@]}"; do [[ "$h" == "$ONLY" ]] && only_found=1; done
    if [[ "$only_found" != "1" ]]; then
      echo "${RED}--only '$ONLY' is not a discovered customer instance.${RST}" >&2
      echo "Discovered customers: ${CUSTOMER_HANDLES[*]:-<none>}" >&2
      exit 2
    fi
    ROLL_TARGETS=("$ONLY")
  fi
else
  ROLL_TARGETS=("${CUSTOMER_HANDLES[@]}")
fi

# =============================================================================
# Print the plan
# =============================================================================
hdr "PLAN"
echo "  Repo:            $REPO_DIR"
echo "  Services:        $SERVICES"
echo "  CI gate:         $( [[ $SKIP_CI -eq 1 ]] && echo 'SKIPPED (--skip-ci)' || echo 'run scripts/ci.sh (abort on RED)' )"
echo "  Staging bake:    $( [[ $DEPLOY_STAGING -eq 1 ]] && echo "deploy + health-gate mandrel-$STAGING_HANDLE" || echo 'none' )"
echo "  Discovered:      ${ALL_HANDLES[*]:-<none>}"
echo "  Customer roll:   ${ROLL_TARGETS[*]:-<none (none selected)>}"
echo "  Order:           CI → staging → $( [[ ${#ROLL_TARGETS[@]} -gt 0 ]] && printf '%s → ' "${ROLL_TARGETS[@]}" || true )$( [[ $DEPLOY_PROD -eq 1 ]] && echo 'PROD' || echo '(no prod)' )"
echo "  Prod deploy:     $( [[ $DEPLOY_PROD -eq 1 ]] && echo "$PROD_DIR @ ${PROD_REF:0:12} (clean reset --hard, rebuild, restart, smoke)" || echo 'SKIPPED (--skip-prod / targeted --only)' )"
echo "  Mode:            $( [[ $DRY_RUN -eq 1 ]] && echo 'DRY-RUN (deploy nothing)' || echo 'LIVE' )"
echo "  Stop policy:     fleet roll STOPS on the first instance failure; remaining instances are NOT attempted."

if [[ $DRY_RUN -eq 1 ]]; then
  hdr "DRY-RUN — no changes made"
  exit 0
fi

# Confirm (unless --yes).
if [[ $ASSUME_YES -ne 1 ]]; then
  printf '\nProceed with LIVE deploy? [y/N] '
  read -r reply
  [[ "$reply" == "y" || "$reply" == "Y" ]] || { echo "Aborted by user."; exit 1; }
fi

# =============================================================================
# STAGE 1 — CI gate
# =============================================================================
hdr "STAGE 1: CI GATE"
if [[ $SKIP_CI -eq 1 ]]; then
  warn "CI GATE SKIPPED via --skip-ci. Deploying WITHOUT a green build is risky."
else
  info "Running: bash scripts/ci.sh"
  if bash "$CI_SCRIPT"; then
    ok "CI GREEN — proceeding."
  else
    bad "CI RED — ABORTING. No instance was touched."
    printf '\n%s##########  ABORTED: CI RED  ##########%s\n' "$RED" "$RST"
    exit 1
  fi
fi

# =============================================================================
# STAGE 2 — Staging bake
# =============================================================================
STAGING_RESULT="skipped"
if [[ $DEPLOY_STAGING -eq 1 ]]; then
  hdr "STAGE 2: STAGING BAKE (mandrel-$STAGING_HANDLE)"
  if deploy_instance "$STAGING_HANDLE"; then
    STAGING_RESULT="PASS"
    ok "STAGING bake GREEN — safe to roll the fleet."
  else
    STAGING_RESULT="FAIL"
    bad "STAGING bake FAILED — ABORTING before any customer instance is touched."
    printf '\n%s##########  ABORTED: STAGING FAILED  ##########%s\n' "$RED" "$RST"
    exit 1
  fi
fi

# =============================================================================
# STAGE 3 — Rolling fleet deploy (ONE AT A TIME, stop on first failure)
# =============================================================================
declare -A INSTANCE_RESULT
SUCCEEDED=(); FAILED=""; NOT_ATTEMPTED=()

if [[ ${#ROLL_TARGETS[@]} -eq 0 ]]; then
  info "No customer instances in this roll (--only staging or none discovered)."
else
  hdr "STAGE 3: ROLLING FLEET DEPLOY (one at a time)"
  for idx in "${!ROLL_TARGETS[@]}"; do
    h="${ROLL_TARGETS[$idx]}"
    if [[ -n "$FAILED" ]]; then
      # A prior instance failed — record everything else as not attempted and stop.
      INSTANCE_RESULT["$h"]="NOT_ATTEMPTED"
      NOT_ATTEMPTED+=("$h")
      continue
    fi
    if deploy_instance "$h"; then
      INSTANCE_RESULT["$h"]="PASS"
      SUCCEEDED+=("$h")
    else
      INSTANCE_RESULT["$h"]="FAIL"
      FAILED="$h"
      bad "STOPPING ROLL: '$h' failed. Remaining instances will NOT be deployed."
      # Mark the rest not-attempted.
      for j in "${ROLL_TARGETS[@]:$((idx+1))}"; do
        INSTANCE_RESULT["$j"]="NOT_ATTEMPTED"; NOT_ATTEMPTED+=("$j")
      done
      break
    fi
  done
fi

# =============================================================================
# STAGE 4 — PROD (systemd /opt/mandrel), the FINAL stage
# =============================================================================
# Runs only if everything upstream is GREEN (no customer failed). Prod is Ridge's
# own/dogfood instance + the public mandrel.ridgetopai.net; it goes LAST, after the
# release is proven on the fleet. This is the fix for prod silently drifting behind.
PROD_RESULT="skipped"
if [[ $DEPLOY_PROD -eq 1 ]]; then
  if [[ -n "$FAILED" ]]; then
    PROD_RESULT="skipped (fleet roll failed)"
    warn "PROD stage skipped — a customer instance failed; not touching prod."
  else
    hdr "STAGE 4: PROD DEPLOY ($PROD_DIR)"
    if deploy_prod; then
      PROD_RESULT="PASS"
      ok "PROD deploy GREEN."
    else
      PROD_RESULT="FAIL"
      bad "PROD deploy FAILED (customers already deployed OK). See the ROLLBACK hint above."
    fi
  fi
fi

# =============================================================================
# SUMMARY
# =============================================================================
hdr "SUMMARY"
echo "  CI gate:        $( [[ $SKIP_CI -eq 1 ]] && echo 'SKIPPED' || echo 'GREEN' )"
echo "  Staging bake:   $STAGING_RESULT"
if [[ ${#ROLL_TARGETS[@]} -gt 0 ]]; then
  echo "  Fleet roll:"
  for h in "${ROLL_TARGETS[@]}"; do
    r="${INSTANCE_RESULT[$h]:-?}"
    case "$r" in
      PASS) c="$GRN" ;; FAIL) c="$RED" ;; NOT_ATTEMPTED) c="$YLW" ;; *) c="$RST" ;;
    esac
    printf '    %-22s %s%s%s\n' "$h" "$c" "$r" "$RST"
  done
  echo "  Succeeded:      ${SUCCEEDED[*]:-<none>}"
  echo "  Failed:         ${FAILED:-<none>}"
  echo "  Not attempted:  ${NOT_ATTEMPTED[*]:-<none>}"
fi
echo "  Prod deploy:    $PROD_RESULT"

if [[ -n "$FAILED" || "$PROD_RESULT" == "FAIL" ]]; then
  printf '\n%s##########  OVERALL: FAILED (%s)  ##########%s\n' "$RED" \
    "$( [[ -n "$FAILED" ]] && echo "roll stopped at $FAILED" || echo "prod deploy failed" )" "$RST"
  exit 1
else
  printf '\n%s##########  OVERALL: GREEN  ##########%s\n' "$GRN" "$RST"
  exit 0
fi
