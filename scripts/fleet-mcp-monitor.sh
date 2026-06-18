#!/usr/bin/env bash
#
# fleet-mcp-monitor.sh — registry-driven, AUTHENTICATED, fleet-wide /mcp monitor
#                        (the INTERNAL / ON-BOX tier)
#
# ============================ HONESTY HEADER ====================================
# THIS IS THE ON-BOX / INTERNAL MONITORING TIER. IT RUNS ON THE VPS ITSELF.
#
#   Because it runs on the same box that hosts the tenants, every probe it makes
#   to https://<tenant>.mandrel.ridgetopai.net/mcp is a HAIRPIN — the packet may
#   never actually leave the machine (see Lesson 010: an on-box curl to your own
#   public name can loop back internally and "pass" even when the box is
#   unreachable from the outside world). So:
#
#     >>> THIS IS NOT A SUBSTITUTE FOR TRUE EXTERNAL MONITORING. <<<
#
#   A separate EXTERNAL-VANTAGE tier (probing from off-box, Brian-gated) is the
#   thing that proves the fleet is reachable by real customers. That tier is
#   PENDING and is intentionally NOT built here.
#
#   What THIS tier is genuinely good for, and why it's worth running NOW:
#     1. It exercises the REAL auth + transport surface fleet-wide — a synthetic
#        MCP `initialize` POST with each tenant's OWN bearer token, asserting both
#        HTTP 200 AND a returned mcp-session-id. That is exactly the surface that
#        silently broke in prod on 2026-06-13 (503/auth) while /healthz stayed
#        green — the Lesson 009 trap that fleet-status.sh's shallow /healthz check
#        still falls into today. This closes that fleet-wide blind spot.
#     2. When the external tier (pending) DOES fire, this tier disambiguates
#        EDGE vs SERVICE: if external says DOWN but on-box says UP, the fault is
#        in the edge/DNS/network path, not the Mandrel service; if both say DOWN,
#        the service itself is broken.
# ===============================================================================
#
# WHAT IT DOES
#   - Iterates the TENANT REGISTRY (/root/mandrel-registry.json — source of truth),
#     probing ONLY status=="active" tenants (auto-skips suspended ones, and
#     auto-covers any newly-added active tenant) PLUS prod
#     (mandrel.ridgetopai.net).
#   - For each endpoint: POST a synthetic MCP `initialize` to https://<domain>/mcp
#     using THAT endpoint's bearer token, and measure %{time_total}.
#       * tenant tokens: /root/.mandrel-<handle>.env   (MCP_AUTH_TOKEN=)
#       * prod token:    /opt/mandrel/.env.secrets      (MCP_AUTH_TOKEN=)
#   - Classifies each: UP (200 + session, fast) / DEGRADED (200 + session but
#     slow, > DEGRADED_THRESHOLD_S) / DOWN (non-200, no session, or timeout).
#   - Per-endpoint STATE-DEBOUNCED Telegram alert: DOWN pushed ONCE (loud),
#     RECOVERY pushed ONCE (loud), DEGRADED ONCE (loud) — never spams while a
#     state persists (reuses the prod script's state-file debounce pattern).
#   - Regenerates the fleet HTML adding a real /mcp status + latency column
#     alongside fleet-status.sh's shallow /healthz column.
#
# TOKEN DISCIPLINE (HARD RULE)
#   Tokens are read at runtime and are NEVER echoed, logged, written to the HTML,
#   or placed in any alert payload. Alerts/HTML carry ONLY handle + status +
#   latency. The Authorization header is constructed inline and never expanded
#   into a log line.
#
# READ-ONLY / SAFETY
#   Only POSTs a synthetic `initialize` (read-only handshake; no tool call, no
#   mutation) and writes its own per-endpoint state files + the HTML snapshot.
#   Never mutates any tenant DB, never starts a suspended instance, never touches
#   /opt or prod state beyond reading the prod token.
#
# Safe to run repeatedly (cron, ~every 5 min).

set -euo pipefail

# --------------------------- configuration ------------------------------------
REGISTRY="${FLEET_REGISTRY:-/root/mandrel-registry.json}"
PROD_SECRETS="${PROD_SECRETS:-/opt/mandrel/.env.secrets}"
TENANT_ENV_DIR="${TENANT_ENV_DIR:-/root}"
STATE_DIR="${FLEET_MCP_STATE_DIR:-/root/.ridge-fleet-mcp-state}"
OUT="${FLEET_MCP_OUT:-/home/ridgetop/projects/ridgetopai-reports/fleet-mcp.html}"

# Shared Telegram notify helper (single source of truth for host alerts).
NOTIFY_LIB="${NOTIFY_LIB:-$(dirname "${BASH_SOURCE[0]}")/lib/ridge-notify.sh}"

PROD_HANDLE="prod"
PROD_DOMAIN="mandrel.ridgetopai.net"

DEGRADED_THRESHOLD_S="${DEGRADED_THRESHOLD_S:-3.0}"   # > this (and 200+session) => DEGRADED
PROBE_TIMEOUT_S="${PROBE_TIMEOUT_S:-12}"

# When set (DRY_RUN=1) the script probes + classifies + writes HTML but sends NO
# alerts and does NOT update state files (so a dry-run can't desync debounce).
DRY_RUN="${DRY_RUN:-0}"

NOW_UTC="$(date -u '+%Y-%m-%d %H:%M UTC')"

log() { printf '%s fleet-mcp: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

command -v jq   >/dev/null 2>&1 || { log "FATAL: jq required";   exit 1; }
command -v curl >/dev/null 2>&1 || { log "FATAL: curl required"; exit 1; }
[[ -f "$REGISTRY" ]] || { log "FATAL: registry not found: $REGISTRY"; exit 1; }
jq -e . "$REGISTRY" >/dev/null 2>&1 || { log "FATAL: registry is not valid JSON"; exit 1; }

mkdir -p "$STATE_DIR"

# --------------------------- shared notify helper -----------------------------
# Sources the single Telegram notify helper (creds from /root/.ridge-telegram.env,
# never echoed). DRY_RUN here propagates to the helper so a dry-run sends nothing.
[[ -r "$NOTIFY_LIB" ]] || { log "FATAL: notify helper not found: $NOTIFY_LIB"; exit 1; }
# shellcheck disable=SC1090
. "$NOTIFY_LIB"
[[ "$DRY_RUN" == "1" ]] && export NOTIFY_DRY_RUN=1

# --------------------------- HTML escape helper -------------------------------
esc() { local s="${1:-}"; s="${s//&/&amp;}"; s="${s//</&lt;}"; s="${s//>/&gt;}"; printf '%s' "$s"; }

# --------------------------- alert push (Telegram) ----------------------------
push() {  # push <title> <level> <emoji> <message>   (loud unless level=low/min)
  notify "$1" "$4" "$2" "$3" || log "WARN: Telegram alert failed"
}

# --------------------------- token loader (NEVER echoed) ----------------------
# Echoes the token to stdout of the function ONLY (captured into a local var by
# the caller); it is never logged. Returns empty string if not found.
load_token() {  # $1 = handle  (special: "prod")
  local handle="$1" file
  if [[ "$handle" == "$PROD_HANDLE" ]]; then
    file="$PROD_SECRETS"
  else
    file="${TENANT_ENV_DIR}/.mandrel-${handle}.env"
  fi
  [[ -r "$file" ]] || { printf ''; return 0; }
  grep -E '^MCP_AUTH_TOKEN=' "$file" 2>/dev/null | head -1 | cut -d= -f2- || printf ''
}

# --------------------------- per-endpoint probe -------------------------------
# Sets globals: P_CODE P_SESSION (0/1) P_TIME (seconds, float) P_STATE (UP|DEGRADED|DOWN)
# Token is passed as $2 and used ONLY to build the Authorization header inline.
probe_endpoint() {  # $1=domain  $2=token
  local domain="$1" token="$2"
  local init resp
  init='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"fleet-mcp-monitor","version":"1"}}}'

  P_CODE="000"; P_SESSION=0; P_TIME="0"; P_STATE="DOWN"

  if [[ -z "$token" ]]; then
    # No token to authenticate with -> cannot exercise the real surface. DOWN.
    P_CODE="no-token"; P_SESSION=0; P_TIME="0"; P_STATE="DOWN"
    return 0
  fi

  # -D - dumps response headers to stdout (where we grep for mcp-session-id);
  # body is discarded (-o /dev/null). Time + code appended via -w on a sentinel line.
  resp="$(curl -s -m "$PROBE_TIMEOUT_S" -D - -o /dev/null \
            -w $'\n__MCPMON__ %{http_code} %{time_total}\n' \
            -X POST "https://${domain}/mcp" \
            -H 'Content-Type: application/json' \
            -H 'Accept: application/json, text/event-stream' \
            -H "Authorization: Bearer ${token}" \
            -d "$init" 2>/dev/null || printf '\n__MCPMON__ 000 0\n')"

  P_CODE="$(printf '%s' "$resp"   | awk '/^__MCPMON__/ {print $2}' | tail -1)"
  P_TIME="$(printf '%s' "$resp"   | awk '/^__MCPMON__/ {print $3}' | tail -1)"
  P_SESSION="$(printf '%s' "$resp" | grep -ci 'mcp-session-id' || true)"
  [[ -z "$P_CODE" ]] && P_CODE="000"
  [[ -z "$P_TIME" ]] && P_TIME="0"

  # Classify.
  if [[ "$P_CODE" == "200" && "${P_SESSION:-0}" -ge 1 ]]; then
    # 200 + session => UP unless slow => DEGRADED
    if awk -v t="$P_TIME" -v thr="$DEGRADED_THRESHOLD_S" 'BEGIN{exit !(t+0 > thr+0)}'; then
      P_STATE="DEGRADED"
    else
      P_STATE="UP"
    fi
  else
    P_STATE="DOWN"
  fi
}

# --------------------------- debounced alert per endpoint ---------------------
# Reads/writes a per-handle state file; pushes only on state transitions.
alert_if_changed() {  # $1=handle $2=domain $3=state $4=code $5=time
  local handle="$1" domain="$2" now="$3" code="$4" time="$5"
  local sf="${STATE_DIR}/${handle}.state"
  local prev; prev="$(cat "$sf" 2>/dev/null || echo UNKNOWN)"

  # Latency formatted for human payload (handle + status + latency ONLY — no token).
  local lat; lat="$(awk -v t="$time" 'BEGIN{printf "%.0fms", (t+0)*1000}')"

  case "$now" in
    DOWN)
      if [[ "$prev" != "DOWN" ]]; then
        log "ALERT(DOWN): ${handle} /mcp DOWN (code=${code}, ${lat})"
        push "${handle} /mcp DOWN" "urgent" "🔴" \
          "Tenant '${handle}' MCP transport failing — code=${code}, latency=${lat}. Synthetic initialize got no valid session. (on-box/internal probe)"
      fi
      ;;
    DEGRADED)
      if [[ "$prev" != "DEGRADED" ]]; then
        log "ALERT(DEGRADED): ${handle} /mcp slow (${lat})"
        push "${handle} /mcp DEGRADED" "default" "🟠" \
          "Tenant '${handle}' MCP slow — code=${code}, latency=${lat} (> ${DEGRADED_THRESHOLD_S}s). (on-box/internal probe)"
      fi
      ;;
    UP)
      if [[ "$prev" == "DOWN" || "$prev" == "DEGRADED" ]]; then
        log "RECOVERY: ${handle} /mcp back to UP (${lat})"
        push "${handle} /mcp recovered" "default" "🟢" \
          "Tenant '${handle}' MCP healthy again — code=${code}, latency=${lat}. (on-box/internal probe)"
      fi
      ;;
  esac

  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY_RUN: state file NOT updated (prev=${prev}, now=${now})"
  else
    printf '%s' "$now" > "$sf"
  fi
}

# --------------------------- build the endpoint list --------------------------
# Canary/internal handles EXCLUDED from customer-facing fleet monitoring.
# `staging` is a localhost-only deploy canary (MCP_ALLOWED_HOSTS=localhost:18099 by
# design): its PUBLIC /mcp correctly 403s an authenticated call, which is NOT a
# customer outage. It's health-checked on localhost at deploy time (fleet-deploy.sh),
# so it does not belong in the continuous public probe. Override: FLEET_MONITOR_EXCLUDE="a b".
EXCLUDE_HANDLES="${FLEET_MONITOR_EXCLUDE:-staging}"

# Active tenants from the registry (sorted, minus excluded canaries); prod appended explicitly.
mapfile -t ACTIVE_HANDLES < <(jq -r --arg excl "$EXCLUDE_HANDLES" '
  ($excl | split(" ")) as $x
  | .tenants | to_entries[]
  | select(.value.status=="active")
  | select((.key) as $k | ($x | index($k)) | not)
  | .key' "$REGISTRY" | sort)

# Accumulators + HTML rows
fleet_up=0; fleet_degraded=0; fleet_down=0; fleet_total=0
ROWS=""

probe_one() {  # $1=handle $2=domain
  local handle="$1" domain="$2" token state_cls
  fleet_total=$((fleet_total+1))

  token="$(load_token "$handle")"     # captured locally; never logged
  probe_endpoint "$domain" "$token"

  # tally
  case "$P_STATE" in
    UP)       fleet_up=$((fleet_up+1));        state_cls="ok"   ;;
    DEGRADED) fleet_degraded=$((fleet_degraded+1)); state_cls="warn" ;;
    *)        fleet_down=$((fleet_down+1));      state_cls="down" ;;
  esac

  local lat_disp; lat_disp="$(awk -v t="$P_TIME" 'BEGIN{printf "%.0f ms", (t+0)*1000}')"
  local sess_disp; [[ "${P_SESSION:-0}" -ge 1 ]] && sess_disp="yes" || sess_disp="no"

  log "${handle}: ${P_STATE} (code=${P_CODE}, session=${sess_disp}, ${lat_disp}) domain=${domain}"

  # debounced alert
  alert_if_changed "$handle" "$domain" "$P_STATE" "$P_CODE" "$P_TIME"

  ROWS+="<tr>
    <td class=\"handle\">$(esc "$handle")</td>
    <td class=\"dom\">$(esc "$domain")</td>
    <td><span class=\"pill $state_cls\">$(esc "$P_STATE")</span></td>
    <td class=\"num\">$(esc "$P_CODE")</td>
    <td class=\"num\">$(esc "$sess_disp")</td>
    <td class=\"num\">$(esc "$lat_disp")</td>
  </tr>"
}

for handle in "${ACTIVE_HANDLES[@]}"; do
  [[ -z "$handle" ]] && continue
  domain="$(jq -r ".tenants[\"$handle\"].domain // \"—\"" "$REGISTRY")"
  probe_one "$handle" "$domain"
done
# prod (not in tenant registry)
probe_one "$PROD_HANDLE" "$PROD_DOMAIN"

# --------------------------- emit HTML ----------------------------------------
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{
cat <<HEAD
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="300">
<title>Ridge · Fleet /mcp</title>
<style>
  :root{
    --bg:#f6f7f9; --card:#ffffff; --ink:#1f2430; --muted:#6b7280;
    --line:#e6e8ec; --accent:#2f6df6;
    --warn:#b4690e; --warn-soft:#fdf3e3; --ok:#1a7f4b; --ok-soft:#e8f6ee;
    --down:#b42318; --down-soft:#fde8e6;
  }
  *{box-sizing:border-box}
  body{margin:0;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
       background:var(--bg);color:var(--ink);-webkit-text-size-adjust:100%}
  .wrap{max-width:980px;margin:0 auto;padding:20px 16px 64px}
  header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:8px 2px 20px;flex-wrap:wrap}
  h1{font-size:20px;margin:0;letter-spacing:.2px}
  h1 .dot{color:var(--accent)}
  .sub{color:var(--muted);font-size:13px}
  section{margin:22px 0}
  .sec-h{display:flex;align-items:center;gap:8px;margin:0 2px 10px;font-size:13px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:10px 0;box-shadow:0 1px 2px rgba(16,24,40,.04)}
  .stats{display:flex;flex-wrap:wrap;gap:18px}
  .stat{flex:1;min-width:120px}
  .stat .n{font-size:28px;font-weight:700;letter-spacing:.3px}
  .stat .l{color:var(--muted);font-size:12.5px;text-transform:uppercase;letter-spacing:.5px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;color:var(--muted);font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;font-weight:600;padding:8px 9px;border-bottom:1px solid var(--line)}
  td{padding:9px 9px;border-bottom:1px solid var(--line);vertical-align:middle}
  tr:last-child td{border-bottom:none}
  td.handle{font-weight:600}
  td.num{text-align:right;font-variant-numeric:tabular-nums}
  td.dom{color:#3b414d;font-size:12px}
  .pill{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;white-space:nowrap}
  .pill.ok{background:var(--ok-soft);color:var(--ok)}
  .pill.warn{background:var(--warn-soft);color:var(--warn)}
  .pill.down{background:var(--down-soft);color:var(--down)}
  .legend{color:var(--muted);font-size:12px;margin-top:8px}
  .hairpin{background:var(--warn-soft);border:1px solid #f0d9b0;border-radius:10px;padding:10px 12px;color:#6a4a12;font-size:12.5px;margin:10px 0}
  footer{margin-top:30px;color:var(--muted);font-size:12px;text-align:center;line-height:1.7}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Ridge<span class="dot">·</span>Fleet /mcp</h1>
    <span class="sub">Authenticated synthetic <code>initialize</code> · as of ${NOW_UTC}</span>
  </header>

  <div class="hairpin">
    <b>On-box / internal tier.</b> These probes run on the VPS itself, so they are a
    <b>hairpin</b> (Lesson 010) and are <b>not a substitute for external monitoring</b>.
    Their value: they exercise the real auth + transport surface fleet-wide (the surface
    that silently broke while <code>/healthz</code> stayed green), and disambiguate
    edge-vs-service when the external tier fires.
  </div>

  <section>
    <div class="card">
      <div class="stats">
        <div class="stat"><div class="n">${fleet_total}</div><div class="l">Endpoints probed</div></div>
        <div class="stat"><div class="n">${fleet_up}</div><div class="l">UP</div></div>
        <div class="stat"><div class="n">${fleet_degraded}</div><div class="l">Degraded</div></div>
        <div class="stat"><div class="n">${fleet_down}</div><div class="l">Down</div></div>
      </div>
    </div>
  </section>

  <section>
    <div class="sec-h">🔌 /mcp · authenticated initialize + latency</div>
    <div class="card" style="overflow-x:auto">
      <table>
        <thead>
          <tr>
            <th>Handle</th><th>Domain</th><th>/mcp status</th>
            <th>HTTP</th><th>Session</th><th>Latency</th>
          </tr>
        </thead>
        <tbody>
HEAD

printf '%s\n' "$ROWS"

cat <<FOOT
        </tbody>
      </table>
      <div class="legend">
        <b>/mcp status</b> = synthetic MCP <code>initialize</code> POST with each endpoint's
        own bearer token. <b>UP</b> = HTTP 200 + <code>mcp-session-id</code>, fast.
        <b>Degraded</b> = 200 + session but slow (&gt; ${DEGRADED_THRESHOLD_S}s).
        <b>Down</b> = non-200, no session, or timeout. Only <b>active</b> registry tenants
        (+ prod) are probed; suspended tenants are skipped. Tokens are read at runtime and
        never displayed. Times in UTC.
      </div>
    </div>
  </section>

  <footer>
    Fleet /mcp monitor (internal tier) · regenerated every ~5 min by <code>scripts/fleet-mcp-monitor.sh</code> (cron)<br>
    On-box hairpin — exercises real auth+transport surface · per-endpoint state-debounced Telegram alerts · tokens never logged or shown
  </footer>
</div>
</body>
</html>
FOOT
} > "$TMP"

mv "$TMP" "$OUT"
trap - EXIT
chmod 644 "$OUT" 2>/dev/null || true
chown ridgetop:ridgetop "$OUT" 2>/dev/null || true

log "wrote $OUT (${fleet_total} endpoints: ${fleet_up} UP, ${fleet_degraded} DEGRADED, ${fleet_down} DOWN)$([[ "$DRY_RUN" == "1" ]] && echo ' [DRY_RUN: no alerts sent, no state written]')"
