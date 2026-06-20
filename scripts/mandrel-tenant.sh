#!/usr/bin/env bash
# mandrel-tenant.sh — the operator CLI for the Mandrel tenant fleet lifecycle.
#
# ONE coherent CLI over the registry (/root/mandrel-registry.json, SOURCE OF TRUTH).
# Subcommands:
#   list                          stats + live health probe for every registered tenant
#   provision   <handle> [--type] DELEGATES to provision-instance.sh (P3) — no reinvent
#   suspend     <handle>          reversible stop: archive DB -> down (KEEP volumes) ->
#                                 de-route (disconnect ra-traefik) -> registry suspended
#   resume      <handle>          suspended -> up -> connect ra-traefik -> wait healthy ->
#                                 registry active
#   deprovision <handle> --yes [--archive|--no-archive]
#                                 PERMANENT: archive (default on) -> down -v -> remove
#                                 compose+env+admin+handoff+gitignore-line+registry entry
#                                 -> de-route. Requires --yes (destroys data).
#
# WHY A COMPANION SCRIPT (not subcommands bolted onto provision-instance.sh):
#   provision-instance.sh is a long, single-purpose onboarding pipeline (8 stages, smoke
#   gate, register). Lifecycle ops are orthogonal verbs on an ALREADY-provisioned tenant.
#   Keeping them in a thin companion that DELEGATES `provision` to the existing script
#   gives one operator entrypoint without bloating / risking the proven provisioner.
#   This file REUSES the provisioner's conventions verbatim: handle regex, registry path,
#   env/compose/handoff/network naming, EXPECTED_IP, the labels-only Traefik model
#   (runtime `docker network connect/disconnect ra-traefik` IS the route on/off switch —
#   the provisioner never edits the static traefik compose, and neither do we).
#
# ROUTING MODEL (labels-only era, task d035f4f8):
#   nginx wildcard :443 -> Traefik 127.0.0.1:8090 -> (Docker label) tenant containers.
#   A tenant is REACHABLE iff (a) its stack is up (labels present) AND (b) ra-traefik is
#   connected to its network. Suspend breaks both; resume restores both. A compose `down`
#   destroys the project network, so we ALWAYS disconnect ra-traefik BEFORE `down`, and
#   connect AFTER `up` (the network only exists while the stack is up).
#
# GUARDRAILS:
#   * handle must match the provisioner regex; refuse unknown handles (except provision).
#   * PROTECTED handles (staging + anything tagged type=canary/prod, plus an explicit
#     denylist) are refused for suspend/resume/deprovision unless --allow-protected.
#   * nginx is NEVER touched (labels-only; nginx only owns the wildcard vhost).
#   * the static /opt/mandrel/traefik compose is NEVER edited (runtime network ops only).
#   * secrets are NEVER printed.
#   * registry writes are atomic (jq -> tmp -> validate -> mv) and re-chmod 600.
set -euo pipefail

# ----- shared constants (MATCH provision-instance.sh) ---------------------------
REGISTRY="/root/mandrel-registry.json"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROVISIONER="${REPO_DIR}/scripts/provision-instance.sh"
TRAEFIK_CONTAINER="ra-traefik"
EXPECTED_IP="178.156.219.146"
DECOMM_DIR="/root/decommissioned"
HANDOFF_DIR="/root/mandrel-handoffs"
GITIGNORE="${REPO_DIR}/.gitignore"
TODAY="$(date +%Y%m%d)"

# Handles that must never be torn down / suspended by this CLI without --allow-protected.
PROTECTED_DENYLIST=("staging" "app")   # staging=canary anchor; app=primary tenant

# Logs go to STDERR so functions can return a value on STDOUT via command substitution
# without the log lines being captured into the caller's variable.
log()  { echo "[$(date +%H:%M:%S)] $*" >&2; }
fail() { echo "[$(date +%H:%M:%S)] ERROR: $*" >&2; exit 1; }

need() { command -v "$1" >/dev/null || fail "$1 is required"; }
need jq; need docker
[[ -f "${REGISTRY}" ]] || fail "registry not found: ${REGISTRY}"
jq -e . "${REGISTRY}" >/dev/null 2>&1 || fail "registry is not valid JSON: ${REGISTRY}"

# ----- helpers ------------------------------------------------------------------
validate_handle() {  # mirror provisioner's hygiene check
  local h="$1"
  [[ "$h" =~ ^[a-z0-9][a-z0-9-]*$ ]] \
    || fail "handle must match ^[a-z0-9][a-z0-9-]*\$ (lowercase, digits, dashes): '$h'"
}

tenant_exists() { jq -e ".tenants[\"$1\"]" "${REGISTRY}" >/dev/null 2>&1; }

require_tenant() {
  tenant_exists "$1" || fail "unknown handle '$1' — not in registry. Refusing to operate."
}

tenant_field() { jq -r ".tenants[\"$1\"].$2 // empty" "${REGISTRY}"; }

is_protected() {  # 0 if protected
  local h="$1" type
  type="$(tenant_field "$h" type)"
  [[ "$type" == "canary" || "$type" == "prod" ]] && return 0
  local d
  for d in "${PROTECTED_DENYLIST[@]}"; do [[ "$h" == "$d" ]] && return 0; done
  return 1
}

guard_protected() {  # $1=handle $2=allow_protected(0/1) $3=verb
  if is_protected "$1" && [[ "$2" != "1" ]]; then
    fail "'$1' is PROTECTED (canary/prod/denylist). Refusing to $3 without --allow-protected."
  fi
}

# Atomic registry status flip (no other fields touched).
set_status() {  # $1=handle $2=status
  local h="$1" st="$2" tmp
  tmp="$(mktemp)"
  jq --arg h "$h" --arg st "$st" '.tenants[$h].status = $st' "${REGISTRY}" > "${tmp}"
  jq -e . "${tmp}" >/dev/null 2>&1 || { rm -f "${tmp}"; fail "registry update -> invalid JSON; left ${REGISTRY} untouched"; }
  mv "${tmp}" "${REGISTRY}"; chmod 600 "${REGISTRY}"
}

# Remove a tenant entry entirely (deprovision).
remove_tenant() {  # $1=handle
  local h="$1" tmp
  tmp="$(mktemp)"
  jq --arg h "$h" 'del(.tenants[$h])' "${REGISTRY}" > "${tmp}"
  jq -e . "${tmp}" >/dev/null 2>&1 || { rm -f "${tmp}"; fail "registry delete -> invalid JSON; left ${REGISTRY} untouched"; }
  mv "${tmp}" "${REGISTRY}"; chmod 600 "${REGISTRY}"
}

compose_paths() {  # echoes the -f args for a tenant's stack
  local h="$1"
  echo "-f ${REPO_DIR}/docker-compose.yml -f ${REPO_DIR}/docker-compose.${h}.yml"
}

# The override interpolates ${MCP_AUTH_TOKEN:?}/${JWT_SECRET:?} — EVERY compose call
# (even `down`) must supply the env file or interpolation aborts. Echo the --env-file
# arg when the file exists (so deprovision still works after the env is already gone).
compose_envfile() {  # $1=handle
  local ef="/root/.mandrel-${1}.env"
  [[ -f "${ef}" ]] && echo "--env-file ${ef}" || echo ""
}

# Disconnect ra-traefik from a tenant network if currently attached (idempotent).
traefik_disconnect() {  # $1=network
  local net="$1"
  if docker network inspect "${net}" --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null \
       | grep -qw "${TRAEFIK_CONTAINER}"; then
    log "disconnecting ${TRAEFIK_CONTAINER} from ${net}"
    docker network disconnect "${net}" "${TRAEFIK_CONTAINER}" \
      || log "WARN: disconnect failed (continuing) — ${net}"
  else
    log "${TRAEFIK_CONTAINER} not on ${net} (ok)"
  fi
}

# Connect ra-traefik to a tenant network (idempotent).
traefik_connect() {  # $1=network
  local net="$1"
  if docker network inspect "${net}" --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null \
       | grep -qw "${TRAEFIK_CONTAINER}"; then
    log "${TRAEFIK_CONTAINER} already on ${net} (ok)"
  else
    log "connecting ${TRAEFIK_CONTAINER} -> ${net}"
    docker network connect "${net}" "${TRAEFIK_CONTAINER}" \
      || fail "could not connect ${TRAEFIK_CONTAINER} to ${net}"
  fi
}

# Archive a tenant's DB -> /root/decommissioned/<h>-<date>.sql.gz (600, gunzip -t verified).
# Requires the postgres container to be UP. NEVER prints DB contents.
archive_db() {  # $1=handle ; echoes archive path on success
  # SC2318: $h is not yet visible to pgc within the same `local`, so pgc became
  # `mandrel--postgres` (handle dropped) and every archive failed. Split it.
  local h="$1"
  local pgc="mandrel-${h}-postgres" out
  mkdir -p "${DECOMM_DIR}"; chmod 700 "${DECOMM_DIR}"
  out="${DECOMM_DIR}/${h}-${TODAY}.sql.gz"
  docker ps --format '{{.Names}}' | grep -qx "${pgc}" \
    || fail "cannot archive ${h}: postgres container ${pgc} is not running (start the stack first)"
  log "archiving DB ${pgc} -> ${out}"
  umask 077
  # pg_dump as the in-container mandrel/mandrel role (matches every tenant's compose).
  if ! docker exec "${pgc}" pg_dump -U mandrel mandrel 2>/dev/null | gzip -c > "${out}"; then
    rm -f "${out}"; fail "pg_dump failed for ${h}"
  fi
  chmod 600 "${out}"
  gunzip -t "${out}" 2>/dev/null || { rm -f "${out}"; fail "archive failed gunzip -t integrity check: ${out}"; }
  log "archive OK (gunzip -t PASS): ${out} ($(stat -c%s "${out}") bytes, 600)"
  echo "${out}"
}

# Live health probe through the REAL public path (nginx wildcard -> Traefik).
# echoes the http code; 200 = up, anything else (404/000) = down/dark.
health_probe() {  # $1=domain ; echoes a single clean http code (000 on curl failure)
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 \
            --resolve "$1:443:${EXPECTED_IP}" "https://$1/healthz" 2>/dev/null)" || code="000"
  echo "${code:-000}"
}

# ============================== SUBCOMMANDS =====================================

cmd_list() {
  printf '%-18s %-10s %-9s %-42s %-7s %s\n' HANDLE STATUS TYPE DOMAIN HEALTH PORTS
  printf '%-18s %-10s %-9s %-42s %-7s %s\n' "------" "------" "----" "------" "------" "-----"
  local handles h status type domain mcp
  handles="$(jq -r '.tenants | keys[]' "${REGISTRY}" | sort)"
  while IFS= read -r h; do
    [[ -z "$h" ]] && continue
    status="$(tenant_field "$h" status)"
    type="$(tenant_field "$h" type)"
    domain="$(tenant_field "$h" domain)"
    mcp="$(jq -r ".tenants[\"$h\"].ports.mcp // \"?\"" "${REGISTRY}")"
    local code hp
    code="$(health_probe "${domain}")"
    case "${code}" in
      200) hp="up" ;;
      000) hp="dark" ;;
      *)   hp="down(${code})" ;;
    esac
    printf '%-18s %-10s %-9s %-42s %-7s mcp=%s\n' "$h" "$status" "$type" "$domain" "$hp" "$mcp"
  done <<< "${handles}"
}

cmd_provision() {  # delegate verbatim to the proven P3 provisioner
  [[ -x "${PROVISIONER}" ]] || fail "provisioner not found/executable: ${PROVISIONER}"
  log "delegating provision -> ${PROVISIONER} $*"
  exec "${PROVISIONER}" "$@"
}

cmd_suspend() {  # $1=handle [--allow-protected]
  local h="" allow=0
  while [[ $# -gt 0 ]]; do case "$1" in
    --allow-protected) allow=1; shift ;;
    -*) fail "suspend: unknown flag $1" ;;
    *) [[ -z "$h" ]] && h="$1" && shift || fail "suspend: unexpected arg $1" ;;
  esac; done
  [[ -n "$h" ]] || fail "usage: suspend <handle> [--allow-protected]"
  validate_handle "$h"; require_tenant "$h"; guard_protected "$h" "$allow" suspend

  local status net
  status="$(tenant_field "$h" status)"
  net="$(tenant_field "$h" network)"
  if [[ "${status}" == "suspended" ]]; then
    log "'${h}' is already suspended — no-op."; return 0
  fi
  [[ "${status}" == "active" ]] || fail "'${h}' status is '${status}', expected active. Refusing."

  log "=== SUSPEND ${h} ==="
  # 1. archive DB while postgres is still up
  local archive; archive="$(archive_db "$h")"
  # 2. de-route FIRST (network disappears on down)
  traefik_disconnect "${net}"
  # 3. stop the stack, KEEP volumes
  log "compose down (KEEP volumes) -p mandrel-${h}"
  # shellcheck disable=SC2046
  docker compose $(compose_paths "$h") $(compose_envfile "$h") -p "mandrel-${h}" down
  # 4. registry -> suspended
  set_status "$h" suspended
  # 5. verify dark
  local code; code="$(health_probe "$(tenant_field "$h" domain)")"
  log "post-suspend health probe: ${code} (expect 404/000 = dark)"
  [[ "${code}" != "200" ]] || fail "'${h}' still answers 200 after suspend — de-route incomplete"
  log "SUSPENDED ${h}: archive=${archive}, volumes RETAINED, registry=suspended, dark(${code})"
  echo "RESULT:${h}:suspended"
}

cmd_resume() {  # $1=handle [--allow-protected]
  local h="" allow=0
  while [[ $# -gt 0 ]]; do case "$1" in
    --allow-protected) allow=1; shift ;;
    -*) fail "resume: unknown flag $1" ;;
    *) [[ -z "$h" ]] && h="$1" && shift || fail "resume: unexpected arg $1" ;;
  esac; done
  [[ -n "$h" ]] || fail "usage: resume <handle> [--allow-protected]"
  validate_handle "$h"; require_tenant "$h"; guard_protected "$h" "$allow" resume

  local status net domain env_file mcp_port
  status="$(tenant_field "$h" status)"
  net="$(tenant_field "$h" network)"
  domain="$(tenant_field "$h" domain)"
  env_file="/root/.mandrel-${h}.env"
  mcp_port="$(jq -r ".tenants[\"$h\"].ports.mcp" "${REGISTRY}")"
  if [[ "${status}" == "active" ]]; then
    log "'${h}' is already active — no-op."; return 0
  fi
  [[ "${status}" == "suspended" ]] || fail "'${h}' status is '${status}', expected suspended. Refusing."
  [[ -f "${env_file}" ]] || fail "env file missing for ${h}: ${env_file} (cannot resume)"
  [[ -f "${REPO_DIR}/docker-compose.${h}.yml" ]] || fail "compose override missing for ${h}"

  log "=== RESUME ${h} ==="
  # 1. up (reuse built image; no --build needed for resume)
  log "compose up -p mandrel-${h}"
  # shellcheck disable=SC2046
  docker compose $(compose_paths "$h") --env-file "${env_file}" -p "mandrel-${h}" up -d \
    postgres redis mcp-server mandrel-command-backend mandrel-command-frontend
  # 2. wait for mcp-server local healthy
  log "waiting for mcp-server /healthz 200 on 127.0.0.1:${mcp_port}"
  local ok=0 i code
  for i in $(seq 1 60); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${mcp_port}/healthz" || true)"
    [[ "${code}" == "200" ]] && { ok=1; break; }
    sleep 3
  done
  [[ "${ok}" == "1" ]] || fail "mcp-server /healthz never 200 on ${mcp_port}"
  log "mcp-server healthy locally on ${mcp_port}"
  # 3. connect ra-traefik to the (now-recreated) tenant network
  traefik_connect "${net}"
  # 4. wait for Traefik to register (catch-all registers a beat late — P3 learned this)
  sleep 4
  log "waiting for public /healthz 200 via wildcard ${domain}"
  ok=0
  for i in $(seq 1 25); do
    code="$(health_probe "${domain}")"
    [[ "${code}" == "200" ]] && { ok=1; break; }
    sleep 2
  done
  [[ "${ok}" == "1" ]] || fail "'${h}' /healthz never returned 200 via wildcard after resume"
  # 5. registry -> active
  set_status "$h" active
  log "RESUMED ${h}: /healthz 200 via wildcard, ra-traefik connected, registry=active"
  echo "RESULT:${h}:resumed"
}

cmd_deprovision() {  # $1=handle --yes [--archive|--no-archive] [--allow-protected]
  local h="" yes=0 archive=1 allow=0
  while [[ $# -gt 0 ]]; do case "$1" in
    --yes) yes=1; shift ;;
    --archive) archive=1; shift ;;
    --no-archive) archive=0; shift ;;
    --allow-protected) allow=1; shift ;;
    -*) fail "deprovision: unknown flag $1" ;;
    *) [[ -z "$h" ]] && h="$1" && shift || fail "deprovision: unexpected arg $1" ;;
  esac; done
  [[ -n "$h" ]] || fail "usage: deprovision <handle> --yes [--archive|--no-archive] [--allow-protected]"
  validate_handle "$h"; require_tenant "$h"; guard_protected "$h" "$allow" deprovision
  [[ "${yes}" == "1" ]] || fail "deprovision DESTROYS data (down -v + removes all artifacts). Re-run with --yes to confirm."

  local status net domain
  status="$(tenant_field "$h" status)"
  net="$(tenant_field "$h" network)"
  domain="$(tenant_field "$h" domain)"

  log "=== DEPROVISION ${h} (PERMANENT) ==="
  # 1. archive first (default on) — only possible if postgres is up
  local archpath="(skipped)"
  if [[ "${archive}" == "1" ]]; then
    if docker ps --format '{{.Names}}' | grep -qx "mandrel-${h}-postgres"; then
      archpath="$(archive_db "$h")"
    else
      log "WARN: --archive requested but postgres not running (tenant suspended?). Skipping archive — no live DB to dump."
      archpath="(no-live-db)"
    fi
  fi
  # 2. de-route before destroying the network (if up)
  traefik_disconnect "${net}"
  # 3. down -v (DESTROYS volumes) — only if a compose override exists
  if [[ -f "${REPO_DIR}/docker-compose.${h}.yml" ]]; then
    log "compose down -v (DESTROYS volumes) -p mandrel-${h}"
    # shellcheck disable=SC2046
    docker compose $(compose_paths "$h") $(compose_envfile "$h") -p "mandrel-${h}" down -v || log "WARN: compose down -v returned nonzero (continuing cleanup)"
  else
    log "no compose override for ${h}; attempting project-name down -v"
    docker compose -p "mandrel-${h}" down -v 2>/dev/null || true
  fi
  # 4. remove per-tenant artifacts
  local f
  for f in \
    "${REPO_DIR}/docker-compose.${h}.yml" \
    "/root/.mandrel-${h}.env" \
    "/root/.mandrel-${h}-admin.env" \
    "${HANDOFF_DIR}/${h}-CONNECT.md"; do
    if [[ -e "$f" ]]; then log "rm ${f}"; rm -f "$f"; fi
  done
  # 5. remove the .gitignore line
  if grep -qxF "docker-compose.${h}.yml" "${GITIGNORE}" 2>/dev/null; then
    log "removing .gitignore line docker-compose.${h}.yml"
    grep -vxF "docker-compose.${h}.yml" "${GITIGNORE}" > "${GITIGNORE}.tmp" && mv "${GITIGNORE}.tmp" "${GITIGNORE}"
  fi
  # 6. remove registry entry
  remove_tenant "$h"
  # 7. verify gone
  local code; code="$(health_probe "${domain}")"
  local lc; lc="$(docker ps -a --format '{{.Names}}' | grep -c "^mandrel-${h}-" || true)"
  local lv; lv="$(docker volume ls --format '{{.Name}}' | grep -c "^mandrel-${h}_" || true)"
  local inreg; inreg="$(tenant_exists "$h" && echo yes || echo no)"
  log "VERIFY: health=${code} (expect 404/000), containers=${lc} (expect 0), volumes=${lv} (expect 0), in-registry=${inreg} (expect no)"
  [[ "${code}" != "200" ]] || fail "still answers 200 after deprovision"
  [[ "${lc}" == "0" ]] || fail "containers remain after deprovision: ${lc}"
  [[ "${lv}" == "0" ]] || fail "volumes remain after deprovision: ${lv}"
  [[ "${inreg}" == "no" ]] || fail "still in registry after deprovision"
  log "DEPROVISIONED ${h}: gone (archive=${archpath} kept), registry clean"
  echo "RESULT:${h}:deprovisioned"
}

# ----- dispatch -----------------------------------------------------------------
usage() {
  cat >&2 <<EOF
mandrel-tenant.sh — Mandrel tenant lifecycle CLI (registry: ${REGISTRY})

  list                                      tenants + live health
  provision   <handle> [--type ...]         (delegates to provision-instance.sh)
  suspend     <handle> [--allow-protected]
  resume      <handle> [--allow-protected]
  deprovision <handle> --yes [--archive|--no-archive] [--allow-protected]
EOF
  exit 2
}

[[ $# -ge 1 ]] || usage
SUB="$1"; shift || true
case "${SUB}" in
  list)        cmd_list "$@" ;;
  provision)   cmd_provision "$@" ;;
  suspend)     cmd_suspend "$@" ;;
  resume)      cmd_resume "$@" ;;
  deprovision) cmd_deprovision "$@" ;;
  -h|--help|help) usage ;;
  *) echo "unknown subcommand: ${SUB}" >&2; usage ;;
esac
