#!/usr/bin/env bash
#
# fleet-status.sh — Fleet monitoring v1 (operator "are they using it / are we OK" view)
#
# Discovers every hosted Mandrel instance running on this VPS (by its compose
# postgres container), collects READ-ONLY health + usage STATS, and regenerates a
# static HTML snapshot at ~/projects/ridgetopai-reports/fleet.html.
#
# PRIVACY — THE HARD RULE: STATS, NOT DATA.
#   This script reads ONLY counts, timestamps, and status enums. It NEVER selects
#   or displays any user content: no context.content, no titles, no descriptions,
#   no free text, no project names, no usernames/emails/tokens. The only per-
#   instance label shown is the HANDLE (e.g. "app", "brian"), which Brian owns.
#   The exact columns queried are documented inline below the SELECT.
#
# READ-ONLY: every DB statement is a SELECT of aggregate counts/timestamps. The
#   script never mutates any instance DB and never touches prod (8080) or /opt.
#
# Safe to run repeatedly (cron, ~every 10 min).
#
set -euo pipefail

OUT="${FLEET_OUT:-/home/ridgetop/projects/ridgetopai-reports/fleet.html}"
TMP="$(mktemp)"
NOW_UTC="$(date -u '+%Y-%m-%d %H:%M UTC')"
trap 'rm -f "$TMP"' EXIT

# --- HTML escape helper (defensive; handles produce only numbers/timestamps) ----
esc() { local s="${1:-}"; s="${s//&/&amp;}"; s="${s//</&lt;}"; s="${s//>/&gt;}"; printf '%s' "$s"; }

# --- Discover instances by their postgres containers (auto-pickup new ones) ------
mapfile -t PG_CONTAINERS < <(docker ps --format '{{.Names}}' | grep -E '^mandrel-.*-postgres$' | sort)

# Fleet-level accumulators
fleet_up=0; fleet_total=0; fleet_active_sessions=0; fleet_sessions_24h=0
ROWS=""

for pg in "${PG_CONTAINERS[@]}"; do
  # mandrel-<handle>-postgres -> <handle>
  handle="${pg#mandrel-}"; handle="${handle%-postgres}"
  fleet_total=$((fleet_total+1))

  mcp="mandrel-${handle}-mcp-server"
  cmd="mandrel-${handle}-command-backend"

  # --- HEALTH: container states + /healthz on mapped mcp port -------------------
  pg_state=$(docker inspect "$pg" --format '{{.State.Status}}' 2>/dev/null || echo missing)
  mcp_state=$(docker inspect "$mcp" --format '{{.State.Status}}' 2>/dev/null || echo missing)
  mcp_healthcheck=$(docker inspect "$mcp" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' 2>/dev/null || echo none)
  cmd_state=$(docker inspect "$cmd" --format '{{.State.Status}}' 2>/dev/null || echo missing)

  # mapped host port for mcp-server's internal 8080
  mcp_port=$(docker inspect "$mcp" --format '{{range $p,$v := .NetworkSettings.Ports}}{{if eq $p "8080/tcp"}}{{range $v}}{{.HostPort}}{{end}}{{end}}{{end}}' 2>/dev/null || echo "")
  healthz="n/a"
  if [[ -n "$mcp_port" ]]; then
    healthz=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${mcp_port}/healthz" 2>/dev/null || echo "000")
  fi

  # Roll up to one status enum: UP / DEGRADED / DOWN
  containers_up=true
  for st in "$pg_state" "$mcp_state" "$cmd_state"; do
    [[ "$st" == "running" ]] || containers_up=false
  done
  if ! $containers_up; then
    status="DOWN"
  elif [[ "$healthz" == "200" && ( "$mcp_healthcheck" == "healthy" || "$mcp_healthcheck" == "none" ) ]]; then
    status="UP"
  else
    status="DEGRADED"
  fi
  [[ "$status" == "UP" ]] && fleet_up=$((fleet_up+1))

  # --- USAGE: counts + timestamps ONLY ----------------------------------------
  # Columns read (ALL content-free):
  #   sessions:  status (enum), started_at, ended_at, last_activity_at  (timestamps + enum)
  #   contexts:  created_at                                             (timestamp)
  #   tasks:     status (enum)                                          (enum)
  #   technical_decisions / projects: row existence only                (count(*))
  # NO content/title/description/name/email/token column is ever referenced.
  stats=""
  if [[ "$pg_state" == "running" ]]; then
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
    s_total="—"; s_active="—"; s_lastact="—"; s_24h="—"; s_7d="—"
    avg_disp="—"; s_totalhr="—"; c_total="—"; c_last="—"; tasks_disp="—"; d_total="—"; p_total="—"
  fi

  # --- Optional: container memory glance (resource) ----------------------------
  mem=$(docker stats --no-stream --format '{{.MemUsage}}' "$mcp" 2>/dev/null | awk '{print $1}' || echo "—")
  [[ -z "$mem" ]] && mem="—"

  # status pill class
  case "$status" in
    UP) cls="ok" ;;
    DEGRADED) cls="warn" ;;
    *) cls="down" ;;
  esac

  ROWS+="<tr>
    <td class=\"handle\">$(esc "$handle")</td>
    <td><span class=\"pill $cls\">$(esc "$status")</span><span class=\"sub2\">hz $(esc "$healthz")</span></td>
    <td class=\"num\"><b>$(esc "$s_active")</b> / $(esc "$s_total")</td>
    <td class=\"ts\">$(esc "$s_lastact")</td>
    <td class=\"num\">$(esc "$s_24h") / $(esc "$s_7d")</td>
    <td class=\"num\">$(esc "$avg_disp")<span class=\"sub2\">${s_totalhr}h total</span></td>
    <td class=\"num\">$(esc "$c_total")<span class=\"sub2\">$(esc "$c_last")</span></td>
    <td class=\"num\">$(esc "$tasks_disp")</td>
    <td class=\"num\">$(esc "$d_total")</td>
    <td class=\"num\">$(esc "$p_total")</td>
    <td class=\"num sub2\">$(esc "$mem")</td>
  </tr>"
done

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
  .wrap{max-width:1040px;margin:0 auto;padding:20px 16px 64px}
  header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:8px 2px 20px;flex-wrap:wrap}
  h1{font-size:20px;margin:0;letter-spacing:.2px}
  h1 .dot{color:var(--accent)}
  .sub{color:var(--muted);font-size:13px}
  section{margin:22px 0}
  .sec-h{display:flex;align-items:center;gap:8px;margin:0 2px 10px;font-size:13px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:10px 0;box-shadow:0 1px 2px rgba(16,24,40,.04)}
  .stats{display:flex;flex-wrap:wrap;gap:18px}
  .stat{flex:1;min-width:150px}
  .stat .n{font-size:28px;font-weight:700;letter-spacing:.3px}
  .stat .l{color:var(--muted);font-size:12.5px;text-transform:uppercase;letter-spacing:.5px}
  table{width:100%;border-collapse:collapse;font-size:13.5px}
  th{text-align:left;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.5px;font-weight:600;padding:8px 10px;border-bottom:1px solid var(--line)}
  td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:middle}
  tr:last-child td{border-bottom:none}
  td.handle{font-weight:600}
  td.num{text-align:right;font-variant-numeric:tabular-nums}
  td.ts{font-variant-numeric:tabular-nums;color:#3b414d;white-space:nowrap}
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
    <span class="sub">Hosted Mandrel instances · as of ${NOW_UTC}</span>
  </header>

  <section>
    <div class="card">
      <div class="stats">
        <div class="stat"><div class="n">${fleet_up} / ${fleet_total}</div><div class="l">Instances UP</div></div>
        <div class="stat"><div class="n">${fleet_active_sessions}</div><div class="l">Active sessions (fleet)</div></div>
        <div class="stat"><div class="n">${fleet_sessions_24h}</div><div class="l">Sessions started · 24h</div></div>
      </div>
    </div>
  </section>

  <section>
    <div class="sec-h">📊 Per-instance · usage &amp; health</div>
    <div class="card" style="overflow-x:auto">
      <table>
        <thead>
          <tr>
            <th>Handle</th><th>Health</th><th>Sessions<br>active/total</th><th>Last active</th>
            <th>Started<br>24h/7d</th><th>Avg dur</th><th>Contexts<br>(last)</th>
            <th>Tasks<br>td/ip/done</th><th>Decisions</th><th>Projects</th><th>MCP mem</th>
          </tr>
        </thead>
        <tbody>
HEAD

printf '%s\n' "$ROWS"

cat <<FOOT
        </tbody>
      </table>
      <div class="legend">
        UP = all containers running + <code>/healthz</code> 200 · DEGRADED = up but health probe off · DOWN = a container not running.
        Times in UTC. Avg dur = mean session length (started→last activity). <b>Stats only — no user content is read or shown.</b>
      </div>
    </div>
  </section>

  <footer>
    Fleet monitoring v1 · regenerated every ~10 min by <code>scripts/fleet-status.sh</code> (cron)<br>
    Read-only · privacy boundary: counts &amp; timestamps only, never user content · served from <code>ridge.ridgetopai.net</code>
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
echo "fleet-status: wrote $OUT (${fleet_up}/${fleet_total} UP, ${fleet_active_sessions} active sessions, ${fleet_sessions_24h} in 24h)"
