#!/usr/bin/env bash
# provision-instance.sh — one-command onboarding of a dedicated Mandrel tenant.
#
# TRAEFIK / LABELS-ONLY ERA (task d035f4f8, 2026-06-13). Onboarding is now:
#   registry port alloc -> secrets -> compose override (PROVEN Traefik label set)
#   -> stack up -> connect ra-traefik to the tenant network -> admin -> connect doc
#   -> smoke gate through the REAL nginx-wildcard + Traefik path -> register tenant.
#
# There is NO per-instance nginx vhost and NO per-instance certbot anymore. The
# wildcard cert + DNS (*.mandrel.ridgetopai.net, grey) already cover every handle:
#   Cloudflare DNS *.mandrel (grey) -> nginx :443 mandrel-wildcard vhost (LE wildcard
#   cert, SSE headers) -> Traefik 127.0.0.1:8090 (plain HTTP, Docker-label routing)
#   -> tenant mcp-server:8080 (/mcp,/healthz prio 100) + frontend:3000 (catch-all prio 1).
#
# PORTS ARE AUTO-ALLOCATED from the tenant registry (/root/mandrel-registry.json) —
# the next free port in each range, cross-checked against live host bindings. No more
# 6 positional port args.
#
# USAGE:
#   scripts/provision-instance.sh <handle> [--type customer|canary]
#
# Example:
#   scripts/provision-instance.sh acme-example
#   scripts/provision-instance.sh ptest --type canary
#
# Per-tenant artifacts (LOCAL only, never committed/pushed):
#   docker-compose.<h>.yml                 (gitignored)
#   /root/.mandrel-<h>.env                 (600)
#   /root/.mandrel-<h>-admin.env           (600)
#   /root/mandrel-handoffs/<h>-CONNECT.md  (600)
#   registry entry in /root/mandrel-registry.json (600, LOCAL only)
#
# Idempotent: safe to re-run. Existing secrets / compose / registry ports are REUSED,
# not clobbered. A re-run re-asserts the stack + labels + admin and re-smokes.
#
# Constraints honored: only new compose projects (mandrel-<h>); prod (8080), the 6 live
# tenants, staging, and the ra-traefik stack are NEVER touched (only additively: connect
# ra-traefik to the NEW tenant's network). Secrets are never printed.
set -euo pipefail

# ----- args ---------------------------------------------------------------------
TYPE="customer"
H=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --type) TYPE="${2:-}"; shift 2 ;;
    --type=*) TYPE="${1#*=}"; shift ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *) if [[ -z "$H" ]]; then H="$1"; shift; else echo "unexpected arg: $1" >&2; exit 2; fi ;;
  esac
done
if [[ -z "$H" ]]; then
  echo "usage: $0 <handle> [--type customer|canary]" >&2
  exit 2
fi
if [[ "$TYPE" != "customer" && "$TYPE" != "canary" ]]; then
  echo "--type must be 'customer' or 'canary' (got '$TYPE')" >&2
  exit 2
fi
# Handle hygiene: lowercase alphanumerics + dashes (DNS-label-safe, container-name-safe).
if [[ ! "$H" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "handle must match ^[a-z0-9][a-z0-9-]*\$ (lowercase, digits, dashes): '$H'" >&2
  exit 2
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOMAIN="${H}.mandrel.ridgetopai.net"
EXPECTED_IP="178.156.219.146"
ENV_FILE="/root/.mandrel-${H}.env"
ADMIN_ENV_FILE="/root/.mandrel-${H}-admin.env"
COMPOSE_OVERRIDE="${REPO_DIR}/docker-compose.${H}.yml"
HANDOFF_DIR="/root/mandrel-handoffs"
HANDOFF_DOC="${HANDOFF_DIR}/${H}-CONNECT.md"
TEMPLATE_DOC="${REPO_DIR}/docs/onboarding/CONNECT-MANDREL.md"
PROJECT="mandrel-${H}"
NETWORK="mandrel-${H}_mandrel-network"
TRAEFIK_CONTAINER="ra-traefik"
REGISTRY="/root/mandrel-registry.json"
TODAY="$(date +%Y-%m-%d)"

log()  { echo "[$(date +%H:%M:%S)] [${H}] $*"; }
fail() { echo "[$(date +%H:%M:%S)] [${H}] FAILED: $*" >&2; exit 1; }

command -v jq >/dev/null  || fail "jq is required (registry parsing)"
[[ -f "${REGISTRY}" ]]    || fail "registry not found: ${REGISTRY}"
jq -e . "${REGISTRY}" >/dev/null 2>&1 || fail "registry is not valid JSON: ${REGISTRY}"
docker ps --format '{{.Names}}' | grep -qx "${TRAEFIK_CONTAINER}" \
  || fail "${TRAEFIK_CONTAINER} not running — labels-only onboarding needs the Traefik fleet up"

# ----- 1. Port allocation (registry-driven, idempotent) -------------------------
# If this handle already has registry ports, REUSE them (idempotent re-run). Otherwise
# allocate the lowest free port in each range: not used by any tenant in the registry,
# not in reserved_ports, and not currently bound on the host.
log "1/8 port allocation (registry: ${REGISTRY})"

host_bound() {  # port -> 0 if something is LISTENING on 127.0.0.1:<port>
  ss -ltn 2>/dev/null | grep -q "127.0.0.1:$1 " || ss -ltn 2>/dev/null | grep -q "0.0.0.0:$1 "
}

alloc_range() {  # range_key -> echoes an allocated port or exits nonzero
  local key="$1"
  local lo hi
  lo="$(jq -r ".port_ranges.${key}[0]" "${REGISTRY}")"
  hi="$(jq -r ".port_ranges.${key}[1]" "${REGISTRY}")"
  # ports already taken by OTHER tenants in the registry
  local used reserved
  used="$(jq -r "[.tenants[].ports.${key}] | @sh" "${REGISTRY}" | tr -d "'")"
  reserved="$(jq -r "(.reserved_ports.${key} // []) | @sh" "${REGISTRY}" 2>/dev/null | tr -d "'")"
  local p
  for ((p=lo; p<=hi; p++)); do
    case " ${used} "     in *" $p "*) continue ;; esac
    case " ${reserved} " in *" $p "*) continue ;; esac
    if host_bound "$p"; then continue; fi
    echo "$p"; return 0
  done
  return 1
}

port_of() {  # service -> the host port already bound by an existing tenant container, else ""
  docker port "mandrel-${H}-$1" 2>/dev/null | grep -oE '127.0.0.1:[0-9]+' | head -1 | cut -d: -f2
}

if jq -e ".tenants[\"${H}\"]" "${REGISTRY}" >/dev/null 2>&1; then
  log "registry already has '${H}' — reusing its allocated ports (idempotent)"
  MCP_PORT="$(jq -r ".tenants[\"${H}\"].ports.mcp" "${REGISTRY}")"
  PG_PORT="$(jq -r ".tenants[\"${H}\"].ports.pg" "${REGISTRY}")"
  REDIS_PORT="$(jq -r ".tenants[\"${H}\"].ports.redis" "${REGISTRY}")"
  BACKEND_PORT="$(jq -r ".tenants[\"${H}\"].ports.backend" "${REGISTRY}")"
  FRONTEND_PORT="$(jq -r ".tenants[\"${H}\"].ports.frontend" "${REGISTRY}")"
elif [[ -n "$(port_of mcp-server)" ]]; then
  # Not yet in the registry (e.g. a prior run failed smoke before registering) but a
  # live stack exists — reuse ITS ports so a retry doesn't recreate on fresh ports.
  log "no registry entry yet but live '${H}' containers exist — reusing their bound ports (idempotent)"
  MCP_PORT="$(port_of mcp-server)"
  PG_PORT="$(port_of postgres)"
  REDIS_PORT="$(port_of redis)"
  BACKEND_PORT="$(port_of command-backend)"
  FRONTEND_PORT="$(port_of command-frontend)"
else
  MCP_PORT="$(alloc_range mcp)"           || fail "no free MCP port in range"
  PG_PORT="$(alloc_range pg)"             || fail "no free PG port in range"
  REDIS_PORT="$(alloc_range redis)"       || fail "no free REDIS port in range"
  BACKEND_PORT="$(alloc_range backend)"   || fail "no free BACKEND port in range"
  FRONTEND_PORT="$(alloc_range frontend)" || fail "no free FRONTEND port in range"
fi
log "ports: mcp=${MCP_PORT} pg=${PG_PORT} redis=${REDIS_PORT} backend=${BACKEND_PORT} frontend=${FRONTEND_PORT}"

# ----- 2. DNS sanity (wildcard resolves; not a hard gate per-handle) -------------
# With the wildcard *.mandrel.ridgetopai.net A record, every handle resolves to the box.
# We verify the wildcard answers for THIS handle via public DNS; the on-box stub resolver
# negative-caches brand-new hosts, so we query 1.1.1.1 directly. Non-fatal warn (smoke
# uses --resolve regardless), but a wrong IP is worth surfacing.
log "2/8 DNS sanity: ${DOMAIN} via 1.1.1.1"
GOT_IP="$(dig +short @1.1.1.1 "${DOMAIN}" 2>/dev/null | tail -1)"
if [[ "${GOT_IP}" == "${EXPECTED_IP}" ]]; then
  log "DNS ok (${GOT_IP}) — wildcard covers ${DOMAIN}"
else
  log "WARN: public DNS for ${DOMAIN} = '${GOT_IP:-<none>}' (expected ${EXPECTED_IP}). Wildcard should still cover it; smoke uses --resolve. Continuing."
fi

# ----- 3. Secrets ---------------------------------------------------------------
if [[ -f "${ENV_FILE}" ]]; then
  log "3/8 secrets: ${ENV_FILE} exists, reusing"
else
  log "3/8 secrets: generating ${ENV_FILE}"
  MCP_AUTH_TOKEN="$(openssl rand -hex 32)"
  JWT_SECRET="$(openssl rand -hex 32)"
  umask 077
  cat > "${ENV_FILE}" <<EOF
MCP_AUTH_TOKEN=${MCP_AUTH_TOKEN}
JWT_SECRET=${JWT_SECRET}
MCP_ALLOWED_HOSTS=${DOMAIN},127.0.0.1:${MCP_PORT},localhost:${MCP_PORT}
EOF
  chmod 600 "${ENV_FILE}"
fi

# ----- 4. Compose override (PROVEN Traefik label set) ---------------------------
# Generated freshly each run from the proven label set (staging cutover, task
# 705fbad0). NOTE: routers <h>-mcp / <h>-healthz prio 100 -> mcp-server:8080; router
# <h>-frontend prio 1 -> frontend:3000; NO tls=true (nginx terminates the wildcard);
# traefik.docker.network pins the right network for the socket-proxy provider.
log "4/8 compose override: ${COMPOSE_OVERRIDE}"
cat > "${COMPOSE_OVERRIDE}" <<EOF
# docker-compose.${H}.yml — override for ${DOMAIN}
# Dedicated Mandrel tenant. Isolated stack (own names/ports/volumes/DB), built from main.
# Generated by scripts/provision-instance.sh (Traefik labels-only era, task d035f4f8).
#   docker compose -f docker-compose.yml -f docker-compose.${H}.yml \\
#     --env-file ${ENV_FILE} -p ${PROJECT} up -d --build \\
#     postgres redis mcp-server mandrel-command-backend mandrel-command-frontend
# Secrets in ${ENV_FILE} (600). Routing: nginx wildcard :443 -> Traefik 127.0.0.1:8090
# -> (by Docker label) /mcp+/healthz -> mcp-server:8080, / -> frontend:3000.
# LOCAL ONLY — gitignored (do not leak tenant handles to the public repo).

services:
  postgres:
    container_name: mandrel-${H}-postgres
    ports: !override
      - "127.0.0.1:${PG_PORT}:5432"

  redis:
    container_name: mandrel-${H}-redis
    ports: !override
      - "127.0.0.1:${REDIS_PORT}:6379"

  mcp-server:
    container_name: mandrel-${H}-mcp-server
    ports: !override
      - "127.0.0.1:${MCP_PORT}:8080"
    environment:
      MCP_AUTH_TOKEN: "\${MCP_AUTH_TOKEN:?set MCP_AUTH_TOKEN in ${ENV_FILE}}"
      # ${DOMAIN} must stay in the allowed-hosts list so Traefik-routed requests
      # (Host: ${DOMAIN}) pass the mcp-server host check.
      MCP_ALLOWED_HOSTS: "\${MCP_ALLOWED_HOSTS:-${DOMAIN}}"
    # --- Traefik fleet routing (labels-only, plain HTTP behind nginx wildcard) ---
    # PathPrefix /mcp and /healthz on ${DOMAIN} -> this mcp-server:8080, higher priority
    # than the catch-all frontend router so path matches win. NO tls here (nginx
    # terminates the wildcard cert). Remove this whole labels block to fully revert.
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=${NETWORK}"
      - "traefik.http.routers.${H}-mcp.rule=Host(\`${DOMAIN}\`) && PathPrefix(\`/mcp\`)"
      - "traefik.http.routers.${H}-mcp.entrypoints=web"
      - "traefik.http.routers.${H}-mcp.priority=100"
      - "traefik.http.routers.${H}-mcp.service=${H}-mcp-svc"
      - "traefik.http.routers.${H}-healthz.rule=Host(\`${DOMAIN}\`) && PathPrefix(\`/healthz\`)"
      - "traefik.http.routers.${H}-healthz.entrypoints=web"
      - "traefik.http.routers.${H}-healthz.priority=100"
      - "traefik.http.routers.${H}-healthz.service=${H}-mcp-svc"
      - "traefik.http.services.${H}-mcp-svc.loadbalancer.server.port=8080"

  mandrel-command-backend:
    container_name: mandrel-${H}-command-backend
    ports: !override
      - "127.0.0.1:${BACKEND_PORT}:5000"
    environment:
      JWT_SECRET: "\${JWT_SECRET:?set JWT_SECRET in ${ENV_FILE}}"
      MANDREL_JWT_SECRET: "\${JWT_SECRET}"
      CORS_ORIGIN: "https://${DOMAIN}"
      FRONTEND_URL: "https://${DOMAIN}"
      MANDREL_MCP_URL: "http://mcp-server:8080"

  mandrel-command-frontend:
    container_name: mandrel-${H}-command-frontend
    ports: !override
      - "127.0.0.1:${FRONTEND_PORT}:3000"
    # --- Traefik fleet routing (labels-only) ---
    # Catch-all for ${DOMAIN} -> the Command UI frontend:3000. priority=1 (lowest) so
    # /mcp + /healthz path routers above always win. No tls (nginx terminates).
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=${NETWORK}"
      - "traefik.http.routers.${H}-frontend.rule=Host(\`${DOMAIN}\`)"
      - "traefik.http.routers.${H}-frontend.entrypoints=web"
      - "traefik.http.routers.${H}-frontend.priority=1"
      - "traefik.http.routers.${H}-frontend.service=${H}-frontend-svc"
      - "traefik.http.services.${H}-frontend-svc.loadbalancer.server.port=3000"
EOF

# Ensure the per-tenant compose file is gitignored (privacy — handles must not leak).
GITIGNORE="${REPO_DIR}/.gitignore"
if ! grep -qxF "docker-compose.${H}.yml" "${GITIGNORE}" 2>/dev/null; then
  log "adding docker-compose.${H}.yml to .gitignore"
  printf 'docker-compose.%s.yml\n' "${H}" >> "${GITIGNORE}"
fi

# ----- 5. Up + connect ra-traefik to the tenant network -------------------------
log "5/8 stack up (-p ${PROJECT})"
docker compose -f "${REPO_DIR}/docker-compose.yml" -f "${COMPOSE_OVERRIDE}" \
  --env-file "${ENV_FILE}" -p "${PROJECT}" up -d --build \
  postgres redis mcp-server mandrel-command-backend mandrel-command-frontend

log "waiting for mcp-server /healthz 200 on 127.0.0.1:${MCP_PORT}"
ok=0
for i in $(seq 1 60); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${MCP_PORT}/healthz" || true)"
  if [[ "${code}" == "200" ]]; then ok=1; break; fi
  sleep 3
done
[[ "${ok}" == "1" ]] || fail "mcp-server /healthz never returned 200 on port ${MCP_PORT}"
log "mcp-server healthy on 127.0.0.1:${MCP_PORT}"

# Connect Traefik to THIS tenant's network so its label-routed services are reachable.
# Idempotent: 'already exists' is fine.
log "connecting ${TRAEFIK_CONTAINER} -> ${NETWORK}"
if docker network inspect "${NETWORK}" --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null | grep -qw "${TRAEFIK_CONTAINER}"; then
  log "${TRAEFIK_CONTAINER} already on ${NETWORK} (ok)"
else
  docker network connect "${NETWORK}" "${TRAEFIK_CONTAINER}" \
    || fail "could not connect ${TRAEFIK_CONTAINER} to ${NETWORK}"
  log "connected"
fi
# Give Traefik's provider time to observe the new labels/network. The healthz/mcp
# path routers and the catch-all frontend router can register a beat apart, so we wait
# until the frontend catch-all actually answers (not just a fixed sleep).
sleep 4
log "waiting for Traefik to route ${DOMAIN}/ -> frontend (catch-all router)"
for i in $(seq 1 20); do
  fc="$(curl -s -o /dev/null -w '%{http_code}' --resolve "${DOMAIN}:443:${EXPECTED_IP}" "https://${DOMAIN}/" || true)"
  if [[ "${fc}" == "200" ]]; then break; fi
  sleep 2
done

# ----- 6. Create instance admin -------------------------------------------------
log "6/8 create instance admin (in-container bcrypt upsert)"
BACKEND_CONTAINER="mandrel-${H}-command-backend"
if [[ -f "${ADMIN_ENV_FILE}" ]]; then
  log "admin env exists; re-asserting admin row from stored password"
  ADMIN_PASSWORD="$(grep '^ADMIN_PASSWORD=' "${ADMIN_ENV_FILE}" | cut -d= -f2-)"
else
  # Generate an admin password that satisfies the dashboard's own reset policy
  # (>=8 AND upper AND lower AND digit AND special). Specials restricted to a
  # sed/shell-safe subset (NO # & \) so the connect-doc substitution stays safe.
  _rand_one() { openssl rand -base64 64 | tr -dc "$1" | head -c1; }
  ADMIN_PASSWORD="$(
    {
      openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 20
      _rand_one 'A-Z'; _rand_one 'a-z'; _rand_one '0-9'
      printf '%s' '!@%^*' | fold -w1 | shuf | head -c1
    } | fold -w1 | shuf | tr -d '\n'
  )"
fi
ADMIN_USER="admin"
ADMIN_EMAIL="admin@${DOMAIN}"

HASH="$(docker exec -e PW="${ADMIN_PASSWORD}" "${BACKEND_CONTAINER}" \
  node -e 'const b=require("bcrypt");b.hash(process.env.PW,12).then(h=>process.stdout.write(h))')"
[[ -n "${HASH}" ]] || fail "bcrypt hash generation returned empty"

docker exec -i "mandrel-${H}-postgres" psql -U mandrel -d mandrel -v ON_ERROR_STOP=1 -q \
  -v ADMIN_USER_V="${ADMIN_USER}" -v ADMIN_EMAIL_V="${ADMIN_EMAIL}" -v HASH_V="${HASH}" <<'SQL'
INSERT INTO admin_users (username, email, password_hash, role, is_active, must_change_password)
VALUES (:'ADMIN_USER_V', :'ADMIN_EMAIL_V', :'HASH_V', 'admin', true, true)
ON CONFLICT (username) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      email         = EXCLUDED.email,
      is_active     = true,
      updated_at    = CURRENT_TIMESTAMP;
SQL

if [[ ! -f "${ADMIN_ENV_FILE}" ]]; then
  umask 077
  cat > "${ADMIN_ENV_FILE}" <<EOF
ADMIN_URL=https://${DOMAIN}
ADMIN_USERNAME=${ADMIN_USER}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
EOF
  chmod 600 "${ADMIN_ENV_FILE}"
fi
log "admin upserted"

# ----- 7. Fill the connect doc --------------------------------------------------
log "7/8 fill connect doc -> ${HANDOFF_DOC}"
mkdir -p "${HANDOFF_DIR}"; chmod 700 "${HANDOFF_DIR}"
MCP_AUTH_TOKEN="$(grep '^MCP_AUTH_TOKEN=' "${ENV_FILE}" | cut -d= -f2-)"

umask 077
awk 'f{print} /-->/{f=1}' "${TEMPLATE_DOC}" > "${HANDOFF_DOC}"
[[ -s "${HANDOFF_DOC}" ]] || cp "${TEMPLATE_DOC}" "${HANDOFF_DOC}"

sed -i \
  -e "s#{{MCP_URL}}#https://${DOMAIN}/mcp#g" \
  -e "s#{{DASHBOARD_URL}}#https://${DOMAIN}#g" \
  -e "s#{{TOKEN}}#${MCP_AUTH_TOKEN}#g" \
  -e "s#{{ADMIN_USER}}#${ADMIN_USER}#g" \
  -e "s#{{ADMIN_PASSWORD}}#${ADMIN_PASSWORD}#g" \
  "${HANDOFF_DOC}"
chmod 600 "${HANDOFF_DOC}"

LEFTOVER="$(grep -c '{{' "${HANDOFF_DOC}" || true)"
[[ "${LEFTOVER}" == "0" ]] || fail "connect doc still has ${LEFTOVER} '{{' placeholders"
log "connect doc filled (0 leftover placeholders)"

# ----- 8. Smoke gate (through the REAL nginx-wildcard + Traefik path) ------------
log "8/8 smoke gate (public path via --resolve ${DOMAIN}:443:${EXPECTED_IP})"
SMOKE_OK=1
smoke() {  # name expected actual
  if [[ "$2" == "$3" ]]; then echo "  [PASS] $1: $3"; else echo "  [FAIL] $1: got $3, expected $2"; SMOKE_OK=0; fi
}
RESOLVE=(--resolve "${DOMAIN}:443:${EXPECTED_IP}")
# MCP Streamable-HTTP requires an `initialize` handshake to open a session before any
# tools/call; a sessionless tools/call correctly returns 400. So the round-trip smoke
# is `initialize` (200), which proves auth + routing + the MCP server all the way through.
INIT_BODY='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0"}}}'

# (a) public /healthz 200 via Traefik wildcard path (real cert, no -k)
hz=$(curl -s -o /dev/null -w '%{http_code}' "${RESOLVE[@]}" "https://${DOMAIN}/healthz")
smoke "healthz (wildcard 200)" "200" "${hz}"

# (b) cert served is the wildcard *.mandrel
CN=$(curl -sv "${RESOLVE[@]}" "https://${DOMAIN}/healthz" 2>&1 | grep -i 'subject:' | grep -o 'CN=[^ ]*' | head -1)
smoke "cert CN (*.mandrel)" "CN=*.mandrel.ridgetopai.net" "${CN}"

# (c) / (frontend catch-all) 200 through Traefik
root=$(curl -s -o /dev/null -w '%{http_code}' "${RESOLVE[@]}" "https://${DOMAIN}/")
smoke "frontend / (200)" "200" "${root}"

# (d) /mcp no-token 401 through Traefik
n401=$(curl -s -o /dev/null -w '%{http_code}' "${RESOLVE[@]}" \
  -X POST "https://${DOMAIN}/mcp" -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' -d "${INIT_BODY}")
smoke "mcp no-token (401)" "401" "${n401}"

# (e) /mcp with-token initialize 200 through Traefik (proves auth + routing + MCP server)
init=$(curl -s -o /dev/null -w '%{http_code}' "${RESOLVE[@]}" \
  -X POST "https://${DOMAIN}/mcp" -H "Authorization: Bearer ${MCP_AUTH_TOKEN}" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d "${INIT_BODY}")
smoke "mcp initialize with-token (200)" "200" "${init}"

# (f) admin login 200 (direct to backend container)
login=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:${BACKEND_PORT}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${ADMIN_USER}\",\"password\":$(node -e 'console.log(JSON.stringify(process.argv[1]))' "${ADMIN_PASSWORD}")}")
smoke "admin login (200)" "200" "${login}"

echo "----------------------------------------------------------------"
if [[ "${SMOKE_OK}" != "1" ]]; then
  log "SMOKE FAILED — see [FAIL] lines above. Stack is up but NOT registered active. Handoff: ${HANDOFF_DOC}"
  echo "RESULT:${H}:smoke-failed"
  exit 1
fi

# ----- register tenant (only after smoke passes) --------------------------------
log "registering '${H}' in ${REGISTRY} (status=active, type=${TYPE})"
TMP_REG="$(mktemp)"
jq \
  --arg h "${H}" --arg domain "${DOMAIN}" --arg net "${NETWORK}" \
  --arg type "${TYPE}" --arg created "${TODAY}" \
  --argjson mcp "${MCP_PORT}" --argjson pg "${PG_PORT}" --argjson redis "${REDIS_PORT}" \
  --argjson backend "${BACKEND_PORT}" --argjson frontend "${FRONTEND_PORT}" '
  .tenants[$h] = ((.tenants[$h] // {}) + {
    status: "active",
    type: (.tenants[$h].type // $type),
    domain: $domain,
    ports: { mcp: $mcp, pg: $pg, redis: $redis, backend: $backend, frontend: $frontend },
    network: $net,
    routing: "traefik",
    created: (.tenants[$h].created // $created)
  })
' "${REGISTRY}" > "${TMP_REG}"
jq -e . "${TMP_REG}" >/dev/null 2>&1 || { rm -f "${TMP_REG}"; fail "registry update produced invalid JSON — left ${REGISTRY} untouched"; }
mv "${TMP_REG}" "${REGISTRY}"
chmod 600 "${REGISTRY}"

log "PROVISIONED OK — registered active; handoff: ${HANDOFF_DOC}"
echo "RESULT:${H}:provisioned"
