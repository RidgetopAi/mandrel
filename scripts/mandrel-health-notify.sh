#!/usr/bin/env bash
#
# mandrel-health-notify.sh — synthetic health probe + phone alert for PROD Mandrel
#
# WHY THIS EXISTS
#   On 2026-06-13 a deploy (239bb87e) shipped the remote Streamable-HTTP MCP transport
#   with fail-closed bearer auth but never provisioned MCP_AUTH_TOKEN / MCP_ALLOWED_HOSTS
#   in prod. The result: GET/POST /mcp returned 503/403 for ~2 days while the bridge
#   (/mcp/tools/*) AND /health both stayed 200 — so nothing alerted. A customer
#   (Tombobo) reported it, not our monitoring. This probe closes that blind spot by
#   testing the EXACT surface a real MCP client uses, end-to-end through nginx.
#
# WHAT IT CHECKS (public, through nginx, as a real client would)
#   1. /mcp  — POST initialize WITH bearer token; must be HTTP 200 + an mcp-session-id.
#              (This is the surface that silently broke. /health is NOT enough.)
#   2. /mcp/tools/mandrel_ping — the HTTP bridge (Ridge/agents/UI path).
#   3. command UI — https://command.ridgetopai.net.
#
# ALERTING
#   Routes through the shared Telegram notify helper (scripts/lib/ridge-notify.sh;
#   creds in /root/.ridge-telegram.env), same as feedback-notify.sh /
#   waitlist-notify.sh — headless, phone-push, cron-safe. State-debounced: alerts
#   ONCE on DOWN and ONCE on RECOVERY (both loud), never spams while down.
#
# PRIVACY / SAFETY
#   - Read-only: only GET/POST health probes + one state file. Never mutates Mandrel.
#   - The bearer token is read at runtime from /opt/mandrel/.env.secrets and is NEVER
#     echoed, logged, or put in the alert payload. Alerts carry status metadata only.
#
# Safe to run repeatedly (cron, every ~5 min).

set -euo pipefail

NOTIFY_LIB="${NOTIFY_LIB:-$(dirname "${BASH_SOURCE[0]}")/lib/ridge-notify.sh}"
SECRETS="${SECRETS:-/opt/mandrel/.env.secrets}"
STATE_FILE="${STATE_FILE:-/root/.ridge-mcp-health-state}"

MCP_URL="https://mandrel.ridgetopai.net/mcp"
BRIDGE_URL="https://mandrel.ridgetopai.net/mcp/tools/mandrel_ping"
COMMAND_URL="https://command.ridgetopai.net"

log() { printf '%s mandrel-health: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

# --- Load shared Telegram notify helper (creds never echoed) ----------------------
if [[ ! -r "$NOTIFY_LIB" ]]; then log "FATAL: notify helper not found: $NOTIFY_LIB"; exit 1; fi
# shellcheck disable=SC1090
. "$NOTIFY_LIB"

# --- Load bearer token (never echoed) --------------------------------------------
TOKEN="$(grep -E '^MCP_AUTH_TOKEN=' "$SECRETS" 2>/dev/null | head -1 | cut -d= -f2- || true)"
if [[ -z "$TOKEN" ]]; then log "FATAL: MCP_AUTH_TOKEN missing from $SECRETS"; exit 1; fi

push() {  # push <title> <level> <emoji> <message>   (loud unless level=low/min)
  notify "$1" "$4" "$2" "$3" || log "WARN: Telegram alert failed"
}

# --- Probe 1: the real /mcp transport (the surface that broke) --------------------
INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"healthcheck","version":"1"}}}'
mcp_resp="$(curl -s -m 12 -D - -o /dev/null -w 'HTTP %{http_code}' \
  -X POST "$MCP_URL" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Authorization: Bearer $TOKEN" \
  -d "$INIT" 2>&1 || echo 'HTTP 000')"
mcp_code="$(printf '%s' "$mcp_resp" | grep -oE 'HTTP [0-9]{3}$' | awk '{print $2}')"
mcp_has_session="$(printf '%s' "$mcp_resp" | grep -ci 'mcp-session-id' || true)"

MCP_OK=0
if [[ "$mcp_code" == "200" && "$mcp_has_session" -ge 1 ]]; then MCP_OK=1; fi

# --- Probe 2 + 3: bridge + command UI (context, not the primary signal) -----------
bridge_code="$(curl -s -m 10 -o /dev/null -w '%{http_code}' -X POST "$BRIDGE_URL" -H 'Content-Type: application/json' -d '{"arguments":{}}' || echo 000)"
command_code="$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$COMMAND_URL" || echo 000)"

# --- Decide overall state. /mcp is the gating signal. -----------------------------
if [[ "$MCP_OK" == "1" ]]; then NOW="UP"; else NOW="DOWN"; fi
PREV="$(cat "$STATE_FILE" 2>/dev/null || echo UNKNOWN)"

detail="/mcp=${mcp_code:-000}$([[ $MCP_OK == 1 ]] && echo '(+session)' || echo '(NO session)') | bridge=${bridge_code} | command=${command_code}"
log "state now=$NOW prev=$PREV | $detail"

if [[ "$NOW" == "DOWN" && "$PREV" != "DOWN" ]]; then
  log "ALERT: /mcp DOWN — pushing"
  push "Mandrel /mcp DOWN" "urgent" "🔴" \
    "Remote MCP transport failing. ${detail}. Real MCP clients (e.g. Tombobo) cannot connect. Check: systemctl status mandrel; curl /mcp."
  printf 'DOWN' > "$STATE_FILE"
elif [[ "$NOW" == "UP" && "$PREV" == "DOWN" ]]; then
  log "RECOVERY: /mcp back up — pushing"
  push "Mandrel /mcp recovered" "default" "🟢" \
    "Remote MCP transport is healthy again. ${detail}."
  printf 'UP' > "$STATE_FILE"
else
  # No state change: keep state file current, stay quiet.
  printf '%s' "$NOW" > "$STATE_FILE"
fi
