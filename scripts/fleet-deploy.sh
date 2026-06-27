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
#   --prune-first          Run the SAFE docker prune (build cache + dangling
#                          images) BEFORE the pre-flight disk gate decides, then
#                          re-check free space. Use when the gate would otherwise
#                          abort on low disk. (Lesson 015.)
#   --yes                  Non-interactive (assume yes to the confirm prompt).
#
# DISK HYGIENE (Lesson 015): a pre-flight free-space gate (fail-closed) refuses to
# start if the docker data-root has < MIN_FREE_GB free; a successful roll prunes
# build cache + dangling images behind it (PRUNE_AFTER). Both are config-driven
# (MIN_FREE_GB / PRUNE_AFTER) — see the Defaults block.
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

# The git branch a fleet deploy MUST roll from. Config-overridable but defaults to
# main. The working tree is SHARED across subagents (Foreman/Inspector), so it can
# carry a leftover feature checkout — rolling the fleet off it would ship
# un-Inspected code. assert_expected_branch (called at the top of PLAN, before any
# CI/build/mutation and for --dry-run too) aborts up front if we're not on it.
EXPECTED_BRANCH="${EXPECTED_BRANCH:-main}"

# --- Disk hygiene (Lesson 015) -----------------------------------------------
# The 2026-06-21 incident: a staging build pushed the VPS to 100% disk mid-roll
# and took a live customer down (fleet-wide ENOSPC). These knobs make the deploy
# fail-closed on low disk and clean up the build cache it generates.
#   MIN_FREE_GB     pre-flight headroom required on the docker data-root before any
#                   build runs; deploy ABORTS below this (suggest --prune-first).
#   PRUNE_AFTER     run the SAFE prune (build cache + dangling images) after a
#                   successful roll. 1=on (default), 0=off.
# Safe prune = `docker builder prune -af` + `docker image prune -f` ONLY. NEVER
# --volumes (would nuke postgres/redis data) and NEVER `-a` on images (would remove
# images that existing tenant containers still reference). See safe_docker_prune().
MIN_FREE_GB="${MIN_FREE_GB:-25}"
PRUNE_AFTER="${PRUNE_AFTER:-1}"
PRUNE_FIRST=0             # set by --prune-first: prune (and re-check) before the gate decides

# Marker agent_type stamped on the session the deploy smoke creates via
# /api/v2/sessions/start. The session write-path liveness probe MUST create a real
# row (that is what it proves), but a marked row is identifiable: the smoke ends it
# immediately (best-effort cleanup) AND the analytics layer excludes this marker
# (migration 048 view + SessionStatsService) so a deploy never pollutes session
# stats/list. Keep in lockstep with DEPLOY_SMOKE_AGENT_TYPE in
# mcp-server/src/services/session/types.ts and migration 048.
DEPLOY_SMOKE_AGENT_TYPE="deploy-smoke"

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

# Refuse to roll a deploy off a stray branch (near-miss 2026-06-20). Runs before
# any CI/build/mutation AND for --dry-run, so a wrong-branch invocation aborts up
# front with an actionable message instead of shipping un-Inspected code.
current_git_branch() { git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo ''; }
assert_expected_branch() {
  local cur; cur="$(current_git_branch)"
  if [[ -z "$cur" || "$cur" == "HEAD" ]]; then
    bad "git: cannot determine branch (detached HEAD / not a repo). Deploys must roll from '$EXPECTED_BRANCH'."
    info "git: REMEDY → git -C $REPO_DIR checkout $EXPECTED_BRANCH, then re-run."
    printf '\n%s##########  ABORTED: BRANCH GUARD  ##########%s\n' "$RED" "$RST"
    exit 2
  fi
  if [[ "$cur" != "$EXPECTED_BRANCH" ]]; then
    bad "git: on branch '$cur' but deploys must roll from '$EXPECTED_BRANCH'."
    info "git: the shared working tree may carry a subagent's leftover checkout — rolling off it would ship un-Inspected code."
    info "git: REMEDY → git -C $REPO_DIR checkout $EXPECTED_BRANCH (or set EXPECTED_BRANCH=$cur if intentional), then re-run."
    printf '\n%s##########  ABORTED: BRANCH GUARD (on %s, expected %s)  ##########%s\n' "$RED" "$cur" "$EXPECTED_BRANCH" "$RST"
    exit 2
  fi
  ok "git: on expected deploy branch '$cur'"
}

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
    --prune-first) PRUNE_FIRST=1; shift ;;
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
# Disk hygiene (Lesson 015) — free-space gate + safe prune-behind
# =============================================================================
# WHY: `docker build`/`compose build` accumulate image layers + BuildKit cache and
# never GC themselves. On 2026-06-21 a staging build pushed the VPS to 100% disk
# mid-roll → fleet-wide ENOSPC → a live customer went down. So: gate on free disk
# BEFORE building (fail-closed), and prune the disposable build artifacts AFTER a
# green roll. Mirrors the existing fail-closed CI/migration gates.

# Resolve the docker data-root (where builds/images live), then its free GB.
docker_root_dir() {
  docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker
}

# Integer free GB on the filesystem backing the docker data-root (df -BG, floored).
docker_root_free_gb() {
  local dir; dir="$(docker_root_dir)"
  [[ -d "$dir" ]] || dir="/"
  df -BG -P "$dir" 2>/dev/null | awk 'NR==2 {gsub(/G/,"",$4); print $4+0}'
}

# SAFE prune ONLY — never data-destructive:
#   * docker builder prune -af  → BuildKit build cache (disposable, biggest reclaim)
#   * docker image prune -f     → DANGLING (untagged) images only
# Explicitly NOT used: `--volumes` (would delete postgres/redis named data volumes)
# and `image prune -a` (would remove tagged images that running tenant containers
# still reference). These two commands never touch a running container or a named
# volume. Logs reclaimed bytes. Returns 0 even if a prune sub-step is a no-op.
safe_docker_prune() {
  local before after dir
  dir="$(docker_root_dir)"
  before="$(docker_root_free_gb)"
  info "disk: safe prune — docker builder prune -af && docker image prune -f (NO --volumes, NO image -a)"
  if [[ $DRY_RUN -eq 1 ]]; then
    info "disk: [dry-run] would run safe prune; current free on $dir = ${before}G"
    return 0
  fi
  local rc1=0 rc2=0
  docker builder prune -af 2>&1 | sed 's/^/    builder-prune: /' || rc1=$?
  docker image  prune -f  2>&1 | sed 's/^/    image-prune:   /' || rc2=$?
  after="$(docker_root_free_gb)"
  if (( rc1 != 0 || rc2 != 0 )); then
    warn "disk: a prune sub-step returned non-zero (builder=$rc1 image=$rc2) — continuing; free now ${after}G"
  fi
  ok "disk: safe prune done — free ${before}G → ${after}G on $dir"
  return 0
}

# Pre-flight FREE-SPACE GATE (fail-closed). Runs for --dry-run too (so a dry-run
# shows whether the gate WOULD pass). With --prune-first, runs the safe prune and
# re-checks BEFORE deciding. Returns 0 if free >= MIN_FREE_GB, non-zero otherwise.
preflight_disk_gate() {
  local dir free
  dir="$(docker_root_dir)"

  if [[ $PRUNE_FIRST -eq 1 ]]; then
    info "disk: --prune-first → pruning before the gate decides"
    safe_docker_prune
  fi

  free="$(docker_root_free_gb)"
  if ! [[ "$free" =~ ^[0-9]+$ ]]; then
    bad "disk: could not read free space on docker data-root '$dir' (df failed) — failing closed"
    return 1
  fi

  if (( free < MIN_FREE_GB )); then
    bad "disk PRE-FLIGHT GATE: only ${free}G free on docker data-root '$dir', need >= ${MIN_FREE_GB}G."
    info "disk: a build needs headroom; 100% disk = fleet-wide ENOSPC outage (Lesson 015)."
    info "disk: REMEDY → re-run with --prune-first (safe: docker builder prune -af && docker image prune -f),"
    info "disk:          or free space manually, then retry. Lower MIN_FREE_GB only if you understand the risk."
    return 1
  fi
  ok "disk PRE-FLIGHT GATE: ${free}G free on '$dir' (>= ${MIN_FREE_GB}G required)"
  return 0
}

# =============================================================================
# PRE-FLIGHT — origin has the target ref (fail-fast, BEFORE the customer roll)
# =============================================================================
# The 2026-06-26 incident: PROD_REF was merged to LOCAL main but never PUSHED to
# origin. Customers build from the local working tree, so all 8 rolled GREEN — then
# the PROD stage (which deploys from a CLEAN ORIGIN checkout) aborted with "target
# ref not found after fetch". Failing-closed was correct, but it wasted the whole
# customer roll AND (after a mid-deploy disconnect) left a half-deploy window.
#
# This gate predicts that prod-stage failure up front: when prod is in the plan,
# fetch origin and confirm PROD_REF is reachable from a REMOTE ref. (A bare
# `cat-file -e` in the deploy repo is NOT enough — the local repo always has its
# own HEAD even when origin doesn't; we must check a remote-tracking ref.)
# Only relevant when DEPLOY_PROD=1 (the customer roll itself builds from the local
# tree and does not need origin).
preflight_origin_ref() {
  if [[ $DEPLOY_PROD -ne 1 ]]; then
    ok "origin-ref PRE-FLIGHT GATE: skipped (no prod deploy in this plan)"
    return 0
  fi
  info "origin-ref: confirming PROD_REF ${PROD_REF:0:12} is on origin (prod deploys from a clean origin checkout)"
  if ! git -C "$REPO_DIR" fetch --quiet --force --tags origin; then
    bad "origin-ref PRE-FLIGHT GATE: git fetch origin failed — cannot confirm the ref is pushed (network/auth?). Failing closed."
    return 1
  fi
  if git -C "$REPO_DIR" branch -r --contains "$PROD_REF" 2>/dev/null | grep -q .; then
    ok "origin-ref PRE-FLIGHT GATE: ${PROD_REF:0:12} is on origin (the PROD stage will find it)"
    return 0
  fi
  bad "origin-ref PRE-FLIGHT GATE: PROD_REF ${PROD_REF:0:12} is NOT on origin."
  info "origin-ref: prod deploys from origin, so this WOULD abort the PROD stage AFTER rolling the whole customer fleet."
  info "origin-ref: REMEDY → push first:  git push origin ${EXPECTED_BRANCH}   (then re-run). Or --skip-prod to deploy customers only."
  return 1
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
    #     Litter-free: marks the session 'deploy-smoke' + ends it; analytics
    #     excludes the marker (task bc819ae5). See session_smoke().
    if ! session_smoke "$h" "http://127.0.0.1:${mcp_port}"; then
      return 1
    fi

    # (5) DEEP real-surface smoke: a real tool query must NOT error. The bridge
    #     tool route is unauthenticated on every instance (see deep_tool_smoke), so
    #     ALL instances — staging canary AND customers — get the deep schema smoke,
    #     not just shallow health. This is what would have caught the v0.5.8 break.
    if ! deep_tool_smoke "$h" "http://127.0.0.1:${mcp_port}"; then
      return 1
    fi
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
# DEEP (real-surface) tool smoke — exercise the DB SCHEMA through a real tool call
# =============================================================================
# WHY: the shallow smoke (/healthz, /api/health, initialize-version) stayed GREEN
# through the v0.5.8 incident — the server was UP and reported the right version,
# but task_list threw "column archived_at does not exist" because the schema was
# un-migrated. Liveness/version probes can't see a schema/data-layer break. This
# probe POSTs a REAL tool query to the on-box bridge and asserts the response is
# NOT an error, so a missing-column / un-migrated DB fails the deploy RED.
#
# The bridge tool route (POST /mcp/tools/:toolName) is UNAUTHENTICATED on every
# instance — bearerAuth guards only the remote /mcp Streamable route, NOT the
# on-box /mcp/tools/* bridge (see mcp-server/src/middleware/bearerAuth.ts). So this
# deep smoke needs NO token and works identically for prod AND tenant containers.
#
# We use `task_list limit:1` — it reads the tasks table (the exact table whose
# missing `archived_at` column broke the incident). An EMPTY result set still
# returns success (the query ran), so we assert non-error, NOT non-empty.
#
# Error taxonomy proven against the live bridge (healthServer.handleMcpToolExpress):
#   * healthy  → HTTP 200, body has "success":true
#   * tool/runtime error (incl. a DB column error) → HTTP 500, body "success":false
#
# DECISION (PASS/FAIL must be read off the ERROR CHANNEL, not arbitrary body text):
#   A response is an ERROR iff the error channel says so:
#       HTTP != 200, OR "success":false, OR "isError":true, OR "ok":false.
#   ONLY when the channel already flags an error do we additionally surface the
#   literal incident signature (`column ... does not exist`) — as extra detail in
#   the failure message, NOT as an independent trigger.
#   A healthy response (HTTP 200 + "success":true + none of isError/ok flags) PASSES
#   even if a row's content happens to contain the string "does not exist" (e.g. a
#   task TITLE). Previously we grepped the FULL body for "does not exist", so a legit
#   row text could false-RED a perfectly healthy deploy. The old behavior was
#   fail-safe (false-RED only), so tightening it removes a false-positive without
#   weakening real detection: a genuine schema break still rides the error channel
#   (HTTP 500 / success:false) and is caught here.
#
# Retries for up to HEALTH_TIMEOUT (the app may still be warming the tool layer
# right after a restart), then fails.
deep_tool_smoke() {  # <label> <base_url>   e.g. deep_tool_smoke "prod" http://127.0.0.1:8080
  local label="$1" base="$2"
  local url="${base%/}/mcp/tools/task_list"
  local deadline=$(( SECONDS + HEALTH_TIMEOUT ))
  local body code last=""
  while (( SECONDS < deadline )); do
    # Capture body + HTTP code in one call; body and code separated by a sentinel.
    local resp
    resp="$(curl -s -w $'\n%{http_code}' --max-time 8 \
      -X POST "$url" -H 'Content-Type: application/json' \
      -d '{"arguments":{"limit":1}}' 2>/dev/null || printf '\n000')"
    code="${resp##*$'\n'}"
    body="${resp%$'\n'*}"
    last="$body"

    # --- Read the ERROR CHANNEL only (not arbitrary body content) -------------
    # channel_error=1 if ANY error signal is present on the channel.
    local channel_error=0
    [[ "$code" != "200" ]] && channel_error=1
    if ! grep -q '"success":[[:space:]]*true' <<<"$body"; then channel_error=1; fi
    if grep -qiE '"isError":[[:space:]]*true|"ok":[[:space:]]*false' <<<"$body"; then channel_error=1; fi

    if [[ "$channel_error" -eq 0 ]]; then
      # Healthy on the error channel → PASS, regardless of any row text.
      ok "$label: deep tool smoke (task_list) non-error (HTTP $code)"
      return 0
    fi
    # A 5xx / success:false is a hard error — don't keep retrying a real break for
    # the full window if the schema is genuinely wrong; but allow a few warmup
    # retries for transient 000/connection-refused right after restart.
    sleep 3
  done
  # FAIL: surface the incident signature as extra detail ONLY when present in the
  # (already error-channel-flagged) last response, to speed diagnosis.
  local detail=""
  if grep -qiE 'column [^ ]* does not exist|does not exist' <<<"$last"; then
    detail=" [incident signature 'does not exist' present in error body]"
  fi
  bad "$label: deep tool smoke (task_list) FAILED — last HTTP=$code; this is the schema/data-layer break the shallow smoke misses (e.g. un-migrated DB).${detail} Response head: $(printf '%.200s' "$last")"
  return 1
}

# =============================================================================
# SESSION write-path smoke (litter-free) — task bc819ae5
# =============================================================================
# Proves the session DB write-path is alive by POSTing /api/v2/sessions/start,
# WITHOUT leaving litter in session analytics. Two-layer guarantee:
#   (1) the started session is MARKED with agent_type='deploy-smoke' (sessionType
#       → agent_type) so it is identifiable, and ENDED immediately (best-effort
#       cleanup — a failed end never fails the deploy);
#   (2) even if cleanup fails, the analytics read paths EXCLUDE this marker
#       (migration 048 v_session_summaries + SessionStatsService), so a stray
#       smoke row can never be counted.
# Returns 0 if /start was non-5xx (write-path alive), 1 otherwise.
session_smoke() {  # <label> <base_url>   e.g. session_smoke "$h" http://127.0.0.1:8080
  local label="$1" base="${2%/}"
  local resp code body sid
  resp="$(curl -s -w $'\n%{http_code}' --max-time 8 \
    -X POST "${base}/api/v2/sessions/start" \
    -H 'Content-Type: application/json' \
    -d "{\"title\":\"deploy smoke (fleet-deploy)\",\"sessionType\":\"${DEPLOY_SMOKE_AGENT_TYPE}\"}" \
    2>/dev/null || printf '\n000')"
  code="${resp##*$'\n'}"
  body="${resp%$'\n'*}"

  if [[ "$code" =~ ^5 || "$code" == "000" ]]; then
    bad "$label: mcp /api/v2/sessions/start returned $code (expected non-5xx)"
    return 1
  fi
  ok "$label: mcp /api/v2/sessions/start non-5xx ($code) [marked '${DEPLOY_SMOKE_AGENT_TYPE}']"

  # Best-effort cleanup: parse the returned session id and end it so the row is
  # closed immediately. Never fails the deploy — the analytics exclusion (layer 2)
  # is the real guarantee; this just keeps the row count tidy.
  sid="$(printf '%s' "$body" | grep -oE '"session_id"[[:space:]]*:[[:space:]]*"[0-9a-fA-F-]{36}"' | grep -oE '[0-9a-fA-F-]{36}' | head -1)"
  if [[ -n "$sid" ]]; then
    if curl -s -o /dev/null --max-time 8 -X POST "${base}/api/v2/sessions/${sid}/end" \
        -H 'Content-Type: application/json' -d '{}' 2>/dev/null; then
      ok "$label: deploy-smoke session ${sid:0:8}… ended (cleanup)"
    else
      warn "$label: could not end deploy-smoke session ${sid:0:8}… (excluded from analytics anyway)"
    fi
  else
    warn "$label: /start gave no session_id to clean up (excluded from analytics anyway)"
  fi
  return 0
}

# =============================================================================
# PROD migrations — run the project's OWN runner against the prod host DB
# =============================================================================
# This is the fix for the recurring incident where a migration-bearing release
# (e.g. v0.5.8 / migrations 046+047) shipped to prod but the schema was never
# migrated, so the new code hit columns that didn't exist (task_list →
# "column archived_at does not exist") until someone hand-ran the migrations.
# Tenant CONTAINERS already do this on every boot (mcp-server/docker-entrypoint.sh
# runs `tsx scripts/migrate.ts` before exec'ing the server); prod (systemd, not a
# container) had no equivalent step. This replicates the tenants' contract for prod.
#
# CONTRACT (mirrors the container entrypoint exactly):
#   * Uses the project's existing idempotent runner (tsx scripts/migrate.ts), which
#     tracks applied files in _aidis_migrations, runs ONLY pending files in order,
#     and is a clean no-op ("All migrations are up to date!") when nothing's pending.
#     We do NOT hand-write SQL or reimplement migration logic.
#   * ORDER: called AFTER build (so the runner's deps/tsx exist) and BEFORE the
#     service restart, so the schema is migrated before the NEW code serves traffic.
#     Our migrations are additive/backward-compatible, so the brief window where the
#     OLD code runs against the already-migrated schema is safe.
#   * Runs as $PROD_USER (the systemd User=) so it connects with the same DB role
#     and never leaves root-owned artifacts.
#
# SECRETS: the env files (mcp-server/.env carries SURVEYOR_LLM_API_KEY; .env.secrets
# carries DATABASE_PASSWORD / MCP_AUTH_TOKEN / JWT) are sourced ONLY inside the
# $PROD_USER subshell's environment via `set -a; . <file>; set +a` — their VALUES are
# never echoed and never reach the deploy log. The runner itself logs only DB
# host/name/user (no secrets). `set +e`/explicit capture keeps `set -euo pipefail`
# from masking the runner's real exit code.
#
# Returns 0 if migrations are applied (or already up to date), non-zero on failure.
# Factored out so it is independently runnable/testable:
#   PROD_DIR=/opt/mandrel PROD_USER=ridgetop \
#     bash -c 'source scripts/fleet-deploy.sh ...'  # (or call prod_run_migrations)
prod_run_migrations() {  # <prod_dir>
  local dir="${1:-$PROD_DIR}"
  local mcp="$dir/mcp-server"

  if [[ ! -f "$mcp/scripts/migrate.ts" ]]; then
    bad "prod: migration runner $mcp/scripts/migrate.ts missing — cannot migrate (fail closed)"
    return 1
  fi
  if [[ ! -x "$mcp/node_modules/.bin/tsx" ]]; then
    bad "prod: tsx not found at $mcp/node_modules/.bin/tsx — deps not installed? (fail closed)"
    return 1
  fi

  info "prod: running DB migrations (tsx scripts/migrate.ts) as $PROD_USER — pending-only, idempotent"

  # Source the env files INSIDE the $PROD_USER shell so secret VALUES live only in
  # that subprocess env, never in this script's env or the log. The runner's stdout/
  # stderr (DB host/name/user + per-migration progress) carries no secrets, so it is
  # safe to stream straight to the deploy log.
  if ! sudo -u "$PROD_USER" bash -c '
        set -euo pipefail
        cd "$1/mcp-server"
        set -a
        [ -f ./.env ] && . ./.env
        [ -f "$1/.env.secrets" ] && . "$1/.env.secrets"
        set +a
        exec node_modules/.bin/tsx scripts/migrate.ts
      ' _ "$dir"; then
    bad "prod: DB migration FAILED — prod may be partially migrated (DB tier untouched by rollback; migrations are additive). Caller prints the exact git ROLLBACK; re-run pending migrations once the cause is fixed."
    return 1
  fi

  ok "prod: DB migrations applied (or already up to date)"
  return 0
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

  # Run pending DB migrations BEFORE the restart so the schema is migrated before the
  # NEW code serves traffic (the fix for prod silently shipping un-migrated releases;
  # mirrors the tenant container entrypoint). Idempotent no-op when nothing's pending.
  # GATE: if migrations fail, go RED with the same rollback guidance as other prod
  # failure paths — do not restart onto a half-migrated DB.
  if ! prod_run_migrations "$dir"; then
    bad "prod: ROLLBACK: git -C $dir reset --hard $prev && rebuild && systemctl restart $PROD_SERVICES"
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

  # DEEP real-surface smoke: a real tool query against the prod bridge must NOT
  # error. This is the detection half of the fix — the shallow checks above all
  # stayed GREEN during the v0.5.8 incident while task_list threw a missing-column
  # error. The bridge tool route is unauthenticated on-box (no token needed).
  if ! deep_tool_smoke "prod" "http://127.0.0.1:8080"; then
    bad "prod: ROLLBACK: git -C $dir reset --hard $prev && rebuild && systemctl restart $PROD_SERVICES"
    return 1
  fi

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
# Branch guard FIRST — before disk gate, CI, build, or the dry-run exit, so a
# wrong-branch invocation never proceeds (and a dry-run surfaces it too).
assert_expected_branch
echo "  Repo:            $REPO_DIR"
echo "  Branch:          $(current_git_branch)  (expected: $EXPECTED_BRANCH)"
echo "  Services:        $SERVICES"
echo "  CI gate:         $( [[ $SKIP_CI -eq 1 ]] && echo 'SKIPPED (--skip-ci)' || echo 'run scripts/ci.sh (abort on RED)' )"
echo "  Staging bake:    $( [[ $DEPLOY_STAGING -eq 1 ]] && echo "deploy + health-gate mandrel-$STAGING_HANDLE" || echo 'none' )"
echo "  Discovered:      ${ALL_HANDLES[*]:-<none>}"
echo "  Customer roll:   ${ROLL_TARGETS[*]:-<none (none selected)>}"
echo "  Order:           CI → staging → $( [[ ${#ROLL_TARGETS[@]} -gt 0 ]] && printf '%s → ' "${ROLL_TARGETS[@]}" || true )$( [[ $DEPLOY_PROD -eq 1 ]] && echo 'PROD' || echo '(no prod)' )"
echo "  Prod deploy:     $( [[ $DEPLOY_PROD -eq 1 ]] && echo "$PROD_DIR @ ${PROD_REF:0:12} (clean reset --hard, rebuild, restart, smoke)" || echo 'SKIPPED (--skip-prod / targeted --only)' )"
echo "  Disk gate:       fail-closed if docker data-root ($(docker_root_dir)) free < ${MIN_FREE_GB}G  [current: $(docker_root_free_gb)G free]$( [[ $PRUNE_FIRST -eq 1 ]] && echo ' (--prune-first: prune then re-check)' )"
echo "  Prune-behind:    $( [[ $PRUNE_AFTER -eq 1 ]] && echo 'after a green roll: docker builder prune -af + image prune -f (safe, no --volumes/-a)' || echo 'disabled (PRUNE_AFTER=0)' )"
echo "  Mode:            $( [[ $DRY_RUN -eq 1 ]] && echo 'DRY-RUN (deploy nothing)' || echo 'LIVE' )"
echo "  Stop policy:     fleet roll STOPS on the first instance failure; remaining instances are NOT attempted."

# =============================================================================
# PRE-FLIGHT — disk free-space gate (Lesson 015, fail-closed)
# =============================================================================
# Runs for --dry-run too: a dry-run must SHOW whether the gate would pass before
# any build is attempted. With --prune-first it prunes + re-checks here.
hdr "PRE-FLIGHT: DISK FREE-SPACE GATE"
if preflight_disk_gate; then
  ok "disk gate would-pass — safe to build."
  DISK_GATE_RESULT="PASS"
else
  DISK_GATE_RESULT="FAIL"
  if [[ $DRY_RUN -eq 1 ]]; then
    warn "disk gate WOULD ABORT this deploy (dry-run — nothing was changed)."
  else
    bad "disk gate ABORTED the deploy. No CI, no build, no instance was touched."
    printf '\n%s##########  ABORTED: DISK GATE (free < %sG)  ##########%s\n' "$RED" "$MIN_FREE_GB" "$RST"
    exit 1
  fi
fi

# =============================================================================
# PRE-FLIGHT — origin has the target ref (Lesson: 2026-06-26 push-before-prod)
# =============================================================================
# Runs for --dry-run too, and BEFORE CI/staging/customer roll, so a missing push
# fails fast instead of after rolling the whole fleet.
hdr "PRE-FLIGHT: ORIGIN-REF GATE"
if preflight_origin_ref; then
  ORIGIN_GATE_RESULT="PASS"
else
  ORIGIN_GATE_RESULT="FAIL"
  if [[ $DRY_RUN -eq 1 ]]; then
    warn "origin-ref gate WOULD ABORT this deploy (dry-run — nothing was changed)."
  else
    bad "origin-ref gate ABORTED the deploy. No CI, no build, no instance was touched."
    printf '\n%s##########  ABORTED: ORIGIN-REF GATE (push %s first)  ##########%s\n' "$RED" "$EXPECTED_BRANCH" "$RST"
    exit 1
  fi
fi

if [[ $DRY_RUN -eq 1 ]]; then
  hdr "DRY-RUN — no changes made"
  echo "  Disk gate:      $DISK_GATE_RESULT (would-${DISK_GATE_RESULT,,})"
  echo "  Origin-ref gate: $ORIGIN_GATE_RESULT (would-${ORIGIN_GATE_RESULT,,})"
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
# PRUNE-BEHIND (Lesson 015) — clean up the build cache this deploy generated
# =============================================================================
# Only after a SUCCESSFUL roll (no customer failed, prod not failed). Safe prune
# only — build cache + dangling images; never volumes, never tagged images a tenant
# still references. Keeps the long-lived host from accumulating builds unbounded.
PRUNE_RESULT="skipped"
if [[ $PRUNE_AFTER -eq 1 ]]; then
  if [[ -z "$FAILED" && "$PROD_RESULT" != "FAIL" ]]; then
    hdr "PRUNE-BEHIND (safe: build cache + dangling images)"
    safe_docker_prune
    PRUNE_RESULT="done"
  else
    warn "prune-behind skipped — deploy did not finish green (don't reclaim while debugging a failure)."
    PRUNE_RESULT="skipped (deploy not green)"
  fi
fi

# =============================================================================
# SUMMARY
# =============================================================================
hdr "SUMMARY"
echo "  Disk gate:      ${DISK_GATE_RESULT:-PASS}"
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
echo "  Prune-behind:   ${PRUNE_RESULT:-skipped}"

if [[ -n "$FAILED" || "$PROD_RESULT" == "FAIL" ]]; then
  printf '\n%s##########  OVERALL: FAILED (%s)  ##########%s\n' "$RED" \
    "$( [[ -n "$FAILED" ]] && echo "roll stopped at $FAILED" || echo "prod deploy failed" )" "$RST"
  exit 1
else
  printf '\n%s##########  OVERALL: GREEN  ##########%s\n' "$GRN" "$RST"
  exit 0
fi
