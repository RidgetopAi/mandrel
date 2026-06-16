#!/usr/bin/env bash
#
# fleet-status.sh — Fleet monitoring v2 (registry-driven operator "are they using
#                    it / are we OK" view)
#
# Iterates the TENANT REGISTRY (/root/mandrel-registry.json — the source of truth
# for who-exists, lifecycle status, ports, domain) and for every registered tenant
# — INCLUDING suspended ones whose containers are down — collects READ-ONLY health
# + usage STATS, then regenerates a static HTML snapshot at
# ~/projects/ridgetopai-reports/fleet.html.
#
# v2 change vs v1: discovery is by REGISTRY, not by running postgres container.
#   v1 missed suspended tenants (their containers are down -> invisible). v2 lists
#   every tenant the registry knows about, flags suspended ones clearly, and still
#   shows live usage stats for the active ones.
#
# PRIVACY — THE HARD RULE: STATS, NOT DATA.
#   This script reads ONLY counts, timestamps, and status enums. It NEVER selects
#   or displays any user content: no context.content, no titles, no descriptions,
#   no free text, no project names, no usernames/emails/tokens. The only per-
#   tenant labels shown are the per-tenant HANDLE (e.g. "<handle>") and the *.mandrel
#   domain — both of which Brian owns. The exact columns queried are documented
#   inline below the SELECT. Archive listing shows filenames + size + mtime only.
#
# READ-ONLY: every DB statement is a SELECT of aggregate counts/timestamps. The
#   script never mutates any instance DB, never starts a stopped (suspended)
#   instance, and never touches prod (8080) or /opt. Registry is read-only here.
#
# Safe to run repeatedly (cron, ~every 10 min).
#
set -euo pipefail

REGISTRY="${FLEET_REGISTRY:-/root/mandrel-registry.json}"
OUT="${FLEET_OUT:-/home/ridgetop/projects/ridgetopai-reports/fleet.html}"
ARCHIVE_DIR="${FLEET_ARCHIVE_DIR:-/root/decommissioned}"
EXPECTED_IP="${FLEET_EXPECTED_IP:-178.156.219.146}"   # wildcard A-record target (matches mandrel-tenant.sh)
TMP="$(mktemp)"
NOW_UTC="$(date -u '+%Y-%m-%d %H:%M UTC')"
trap 'rm -f "$TMP"' EXIT

command -v jq >/dev/null 2>&1 || { echo "fleet-status: jq required" >&2; exit 1; }
[[ -f "$REGISTRY" ]] || { echo "fleet-status: registry not found: $REGISTRY" >&2; exit 1; }
jq -e . "$REGISTRY" >/dev/null 2>&1 || { echo "fleet-status: registry is not valid JSON" >&2; exit 1; }

# --- HTML escape helper (defensive; handles produce only numbers/timestamps) ----
esc() { local s="${1:-}"; s="${s//&/&amp;}"; s="${s//</&lt;}"; s="${s//>/&gt;}"; printf '%s' "$s"; }

# --- Live health probe through the REAL public path (nginx wildcard -> Traefik) --
# Mirrors mandrel-tenant.sh: 200 = up, 404 = down(404), 000 = dark/unreachable.
health_probe() {  # $1=domain ; echoes a single http code (000 on curl failure)
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 \
            --resolve "$1:443:${EXPECTED_IP}" "https://$1/healthz" 2>/dev/null)" || code="000"
  echo "${code:-000}"
}

# Fleet-level accumulators
fleet_active=0; fleet_suspended=0; fleet_total=0
fleet_up=0; fleet_active_sessions=0; fleet_sessions_24h=0
ROWS=""

# --- Iterate the REGISTRY (source of truth) -------------------------------------
mapfile -t HANDLES < <(jq -r '.tenants | keys[]' "$REGISTRY" | sort)

for handle in "${HANDLES[@]}"; do
  [[ -z "$handle" ]] && continue
  fleet_total=$((fleet_total+1))

  reg_status="$(jq -r ".tenants[\"$handle\"].status // \"unknown\"" "$REGISTRY")"
  type="$(jq -r ".tenants[\"$handle\"].type // \"—\"" "$REGISTRY")"
  domain="$(jq -r ".tenants[\"$handle\"].domain // \"—\"" "$REGISTRY")"
  mcp_port="$(jq -r ".tenants[\"$handle\"].ports.mcp // \"—\"" "$REGISTRY")"
  created="$(jq -r ".tenants[\"$handle\"].created // \"—\"" "$REGISTRY")"

  [[ "$reg_status" == "active" ]]    && fleet_active=$((fleet_active+1))
  [[ "$reg_status" == "suspended" ]] && fleet_suspended=$((fleet_suspended+1))

  pg="mandrel-${handle}-postgres"

  # --- LIVE HEALTH via the public wildcard path -------------------------------
  hz="$(health_probe "$domain")"
  case "$hz" in
    200) health="up";        hcls="ok" ;;
    404) health="down(404)"; hcls="down" ;;
    000) health="dark";      hcls="down" ;;
    *)   health="down(${hz})"; hcls="down" ;;
  esac
  [[ "$health" == "up" ]] && fleet_up=$((fleet_up+1))

  # status pill class for the registry status column
  case "$reg_status" in
    active)    scls="ok" ;;
    suspended) scls="warn" ;;
    *)         scls="down" ;;
  esac

  # --- USAGE: counts + timestamps ONLY, and ONLY for ACTIVE tenants -----------
  # SUSPENDED tenants have their DB container down by design — we do NOT start it
  # to read stats. We show "suspended" and dashes instead.
  #
  # Columns read (ALL content-free):
  #   sessions:  status (enum), started_at, ended_at, last_activity_at  (timestamps + enum)
  #   contexts:  created_at                                             (timestamp)
  #   tasks:     status (enum)                                          (enum)
  #   technical_decisions / projects: row existence only                (count(*))
  # NO content/title/description/name/email/token column is ever referenced.
  stats=""
  pg_running="$(docker inspect "$pg" --format '{{.State.Status}}' 2>/dev/null || echo missing)"
  if [[ "$reg_status" == "active" && "$pg_running" == "running" ]]; then
    stats=$(docker exec "$pg" psql -U mandrel -d mandrel -t -A -F'|' -c "
      SELECT
        (SELECT count(*) FROM sessions),
        (SELECT count(*) FROM sessions WHERE status='active'),
        (SELECT to_char(max(last_activity_at),'YYYY-MM-DD HH24:MI') FROM sessions),
        (SELECT count(*) FROM sessions WHERE started_at > now()-interval '24 hours'),
        (SELECT count(*) FROM sessions WHERE started_at > now()-interval '7 days'),
        (SELECT coalesce(round(avg(extract(epoch FROM (coalesce(ended_at,last_activity_at,started_at)-started_at))/60.0))::int,0) FROM sessions WHERE started_at IS NOT NULL),
        (SELECT coalesce(round(sum(extract(epoch FROM (coalesce(ended_at,last_activity_at,started_at)-started_at))/3600.0))::int,0) FROM sessions WHERE started_at IS NOT NULL),
        (SELECT count(*) FROM contexts),
        (SELECT to_char(max(created_at),'YYYY-MM-DD HH24:MI') FROM contexts),
        (SELECT count(*) FILTER (WHERE status='todo') FROM tasks),
        (SELECT count(*) FILTER (WHERE status='in_progress') FROM tasks),
        (SELECT count(*) FILTER (WHERE status='completed') FROM tasks),
        (SELECT count(*) FROM technical_decisions),
        (SELECT count(*) FROM projects);
    " 2>/dev/null || echo "")
  fi

  if [[ -n "$stats" ]]; then
    IFS='|' read -r s_total s_active s_lastact s_24h s_7d s_avgmin s_totalhr c_total c_last t_todo t_inprog t_done d_total p_total <<<"$stats"
    fleet_active_sessions=$((fleet_active_sessions + ${s_active:-0}))
    fleet_sessions_24h=$((fleet_sessions_24h + ${s_24h:-0}))
    [[ -z "$s_lastact" ]] && s_lastact="—"
    [[ -z "$c_last" ]] && c_last="—"
    avg_disp="${s_avgmin:-0}m"
    tasks_disp="${t_todo:-0}/${t_inprog:-0}/${t_done:-0}"
  else
    # suspended (or active-but-down): no live stats
    s_total="—"; s_active="—"; s_lastact="—"; s_24h="—"; s_7d="—"
    avg_disp="—"; s_totalhr="—"; c_total="—"; c_last="—"; tasks_disp="—"; d_total="—"; p_total="—"
  fi

  # suspended rows get a muted row class so they're visually distinct
  rowcls=""
  [[ "$reg_status" == "suspended" ]] && rowcls=" class=\"suspended\""

  ROWS+="<tr${rowcls}>
    <td class=\"handle\">$(esc "$handle")</td>
    <td><span class=\"pill $scls\">$(esc "$reg_status")</span></td>
    <td>$(esc "$type")</td>
    <td><span class=\"pill $hcls\">$(esc "$health")</span></td>
    <td class=\"dom\">$(esc "$domain")</td>
    <td class=\"num\">$(esc "$mcp_port")</td>
    <td class=\"ts\">$(esc "$created")</td>
    <td class=\"num\"><b>$(esc "$s_active")</b> / $(esc "$s_total")</td>
    <td class=\"ts\">$(esc "$s_lastact")</td>
    <td class=\"num\">$(esc "$s_24h") / $(esc "$s_7d")</td>
    <td class=\"num\">$(esc "$c_total")<span class=\"sub2\">$(esc "$c_last")</span></td>
    <td class=\"num\">$(esc "$tasks_disp")</td>
    <td class=\"num\">$(esc "$d_total")</td>
    <td class=\"num\">$(esc "$p_total")</td>
  </tr>"
done

# --- ARCHIVES: decommissioned/suspended DB dumps (filenames + size + date only) -
ARCHIVE_ROWS=""
archive_count=0
if [[ -d "$ARCHIVE_DIR" ]]; then
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    archive_count=$((archive_count+1))
    fname="$(basename "$f")"
    fsize="$(du -h "$f" 2>/dev/null | awk '{print $1}')"
    fdate="$(date -u -r "$f" '+%Y-%m-%d %H:%M' 2>/dev/null || echo '—')"
    ARCHIVE_ROWS+="<tr>
      <td class=\"handle\">$(esc "$fname")</td>
      <td class=\"num\">$(esc "${fsize:-—}")</td>
      <td class=\"ts\">$(esc "$fdate") UTC</td>
    </tr>"
  done < <(find "$ARCHIVE_DIR" -maxdepth 1 -type f -name '*.sql.gz' 2>/dev/null | sort)
fi
if [[ "$archive_count" -eq 0 ]]; then
  ARCHIVE_ROWS="<tr><td colspan=\"3\" style=\"color:var(--muted)\">No archives in ${ARCHIVE_DIR}.</td></tr>"
fi

# --- Emit HTML (house style) ----------------------------------------------------
{
cat <<HEAD
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="600">
<title>Ridge · Fleet</title>
<style>
  :root{
    --bg:#f6f7f9; --card:#ffffff; --ink:#1f2430; --muted:#6b7280;
    --line:#e6e8ec; --accent:#2f6df6; --accent-soft:#eaf1ff;
    --warn:#b4690e; --warn-soft:#fdf3e3; --ok:#1a7f4b; --ok-soft:#e8f6ee;
    --down:#b42318; --down-soft:#fde8e6;
  }
  *{box-sizing:border-box}
  body{margin:0;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
       background:var(--bg);color:var(--ink);-webkit-text-size-adjust:100%}
  .wrap{max-width:1180px;margin:0 auto;padding:20px 16px 64px}
  header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:8px 2px 20px;flex-wrap:wrap}
  h1{font-size:20px;margin:0;letter-spacing:.2px}
  h1 .dot{color:var(--accent)}
  .sub{color:var(--muted);font-size:13px}
  section{margin:22px 0}
  .sec-h{display:flex;align-items:center;gap:8px;margin:0 2px 10px;font-size:13px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:10px 0;box-shadow:0 1px 2px rgba(16,24,40,.04)}
  .stats{display:flex;flex-wrap:wrap;gap:18px}
  .stat{flex:1;min-width:140px}
  .stat .n{font-size:28px;font-weight:700;letter-spacing:.3px}
  .stat .l{color:var(--muted);font-size:12.5px;text-transform:uppercase;letter-spacing:.5px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;color:var(--muted);font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;font-weight:600;padding:8px 9px;border-bottom:1px solid var(--line)}
  td{padding:9px 9px;border-bottom:1px solid var(--line);vertical-align:middle}
  tr:last-child td{border-bottom:none}
  td.handle{font-weight:600}
  td.num{text-align:right;font-variant-numeric:tabular-nums}
  td.ts{font-variant-numeric:tabular-nums;color:#3b414d;white-space:nowrap}
  td.dom{color:#3b414d;font-size:12px}
  tr.suspended td{background:#fbfafa;color:var(--muted)}
  tr.suspended td.handle{color:var(--warn)}
  .sub2{display:block;color:var(--muted);font-size:11px;font-weight:400;margin-top:1px}
  .pill{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;white-space:nowrap}
  .pill.ok{background:var(--ok-soft);color:var(--ok)}
  .pill.warn{background:var(--warn-soft);color:var(--warn)}
  .pill.down{background:var(--down-soft);color:var(--down)}
  .legend{color:var(--muted);font-size:12px;margin-top:8px}
  a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
  footer{margin-top:30px;color:var(--muted);font-size:12px;text-align:center;line-height:1.7}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Ridge<span class="dot">·</span>Fleet</h1>
    <span class="sub">Registry-driven · hosted Mandrel tenants · as of ${NOW_UTC}</span>
  </header>

  <section>
    <div class="card">
      <div class="stats">
        <div class="stat"><div class="n">${fleet_total}</div><div class="l">Tenants (registry)</div></div>
        <div class="stat"><div class="n">${fleet_active}</div><div class="l">Active</div></div>
        <div class="stat"><div class="n">${fleet_suspended}</div><div class="l">Suspended</div></div>
        <div class="stat"><div class="n">${fleet_up} / ${fleet_total}</div><div class="l">Live health UP</div></div>
        <div class="stat"><div class="n">${fleet_active_sessions}</div><div class="l">Active sessions</div></div>
        <div class="stat"><div class="n">${fleet_sessions_24h}</div><div class="l">Sessions · 24h</div></div>
      </div>
    </div>
  </section>

  <section>
    <div class="sec-h">📊 Tenants · registry · health &amp; usage</div>
    <div class="card" style="overflow-x:auto">
      <table>
        <thead>
          <tr>
            <th>Handle</th><th>Status</th><th>Type</th><th>Health</th><th>Domain</th>
            <th>MCP<br>port</th><th>Created</th>
            <th>Sessions<br>active/total</th><th>Last active</th><th>Started<br>24h/7d</th>
            <th>Contexts<br>(last)</th><th>Tasks<br>td/ip/done</th><th>Dec.</th><th>Proj.</th>
          </tr>
        </thead>
        <tbody>
HEAD

printf '%s\n' "$ROWS"

cat <<MID
        </tbody>
      </table>
      <div class="legend">
        <b>Status</b> = registry lifecycle (active / suspended). <b>Health</b> = live probe via the public wildcard
        path (<code>/healthz</code>): up = 200 · down(404) = no route (suspended/dark) · dark = unreachable.
        Suspended tenants show no live usage stats by design — their DB is down and is never started to read it.
        Times in UTC. <b>Stats only — no user content is read or shown.</b>
      </div>
    </div>
  </section>

  <section>
    <div class="sec-h">🗄️ Archives · decommissioned / suspended DB dumps</div>
    <div class="card" style="overflow-x:auto">
      <table>
        <thead>
          <tr><th>Archive file</th><th>Size</th><th>Created</th></tr>
        </thead>
        <tbody>
MID

printf '%s\n' "$ARCHIVE_ROWS"

cat <<FOOT
        </tbody>
      </table>
      <div class="legend">
        From <code>${ARCHIVE_DIR}</code>. Filenames, sizes and timestamps only — archive <b>contents are never read</b>.
      </div>
    </div>
  </section>

  <footer>
    Fleet monitoring v2 (registry-driven) · regenerated every ~10 min by <code>scripts/fleet-status.sh</code> (cron)<br>
    Read-only · privacy boundary: counts, timestamps &amp; status enums only, never user content · served from <code>ridge.ridgetopai.net</code>
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
echo "fleet-status: wrote $OUT (${fleet_total} tenants: ${fleet_active} active, ${fleet_suspended} suspended; ${fleet_up}/${fleet_total} live UP; ${fleet_active_sessions} active sessions, ${fleet_sessions_24h} in 24h; ${archive_count} archives)"
