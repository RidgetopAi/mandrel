#!/usr/bin/env bash
#
# waitlist-dashboard.sh — "Request access" / waitlist rollup (front-door visibility)
#
# The live ridgetopai.net landing page's "Request access" form POSTs to
# /api/waitlist -> systemd ra-waitlist.service (127.0.0.1:8788), which appends one
# JSON line {email, ts, source} to /root/waitlist.jsonl (chmod 600). Until now those
# signups lived ONLY in that file — invisible to Brian. This script renders them as a
# static dashboard at ~/projects/ridgetopai-reports/waitlist.html so they show up at
# ridge.ridgetopai.net/waitlist.html (basic-auth gated — these are PII emails).
#
# WHY WE SHOW THE EMAIL IN FULL — and why that's not a privacy violation here:
#   The waitlist email is data the person DELIBERATELY HANDED US via the access-request
#   form ("contact me about access"). Surfacing it to Brian is the entire point — it's
#   addressed to us. The dashboard is auth_basic gated (location / in the ridge nginx
#   site), so the PII never leaves the gated surface. The *push* alert
#   (waitlist-notify.sh) is METADATA-ONLY as a defense-in-depth rule — the raw email
#   appears ONLY here, behind auth.
#
# READ-ONLY: this script only READS /root/waitlist.jsonl and WRITES the HTML output.
#   It never mutates the waitlist file and never touches prod (8080) or /opt.
#
# Safe to run repeatedly (cron, ~every 2-3 min).
#
set -euo pipefail

SRC="${WAITLIST_SRC:-/root/waitlist.jsonl}"
OUT="${WAITLIST_OUT:-/home/ridgetop/projects/ridgetopai-reports/waitlist.html}"
TMP="$(mktemp)"
NOW_UTC="$(date -u '+%Y-%m-%d %H:%M UTC')"
trap 'rm -f "$TMP"' EXIT

# --- HTML escape helper (email + source are user-supplied — escape them) ----------
esc() { local s="${1:-}"; s="${s//&/&amp;}"; s="${s//</&lt;}"; s="${s//>/&gt;}"; s="${s//\"/&quot;}"; printf '%s' "$s"; }

# --- Parse the JSONL with node (robust JSON parsing, newest-first) -----------------
# Emits one tab-separated line per valid entry, sorted newest-first:
#   epoch \t email \t source \t abs_ts(UTC) \t rel_age
# Plus a trailing summary line: __SUMMARY__ \t total \t count_24h \t count_today
# (count_today = entries whose ts falls on the current UTC calendar day)
ROWS="$(node - "$SRC" <<'NODE'
const fs = require("node:fs");
const file = process.argv[2];
let lines = [];
try { lines = fs.readFileSync(file, "utf8").split("\n"); } catch { lines = []; }
const now = Date.now();
const todayUTC = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
const rows = [];
let total = 0, c24h = 0, cToday = 0;
function rel(ms) {
  const d = now - ms;
  if (d < 60e3) return "just now";
  if (d < 3600e3) return Math.floor(d / 60e3) + "m ago";
  if (d < 86400e3) return Math.floor(d / 3600e3) + "h ago";
  return Math.floor(d / 86400e3) + "d ago";
}
for (const ln of lines) {
  const t = ln.trim();
  if (!t) continue;
  let o;
  try { o = JSON.parse(t); } catch { continue; }
  const email = typeof o.email === "string" ? o.email : "";
  if (!email) continue;
  const source = typeof o.source === "string" && o.source ? o.source : "unknown";
  const tsRaw = typeof o.ts === "string" ? o.ts : "";
  const d = tsRaw ? new Date(tsRaw) : new Date(NaN);
  const ms = d.getTime();
  const epoch = Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
  const absTs = Number.isFinite(ms)
    ? d.toISOString().slice(0, 16).replace("T", " ") + " UTC"
    : "unknown time";
  const relAge = Number.isFinite(ms) ? rel(ms) : "—";
  total++;
  if (Number.isFinite(ms)) {
    if (now - ms < 86400e3) c24h++;
    if (d.toISOString().slice(0, 10) === todayUTC) cToday++;
  }
  rows.push([epoch, email, source, absTs, relAge].join("\t"));
}
rows.sort((a, b) => Number(b.split("\t")[0]) - Number(a.split("\t")[0]));
for (const r of rows) process.stdout.write(r + "\n");
process.stdout.write(["__SUMMARY__", total, c24h, cToday].join("\t") + "\n");
NODE
)"

# --- Split out the summary line and build table rows ------------------------------
total=0; c24h=0; cToday=0
TABLE_ROWS=""
while IFS=$'\t' read -r f_epoch f_email f_source f_ts f_rel; do
  [[ -z "$f_epoch" ]] && continue
  if [[ "$f_epoch" == "__SUMMARY__" ]]; then
    total="$f_email"; c24h="$f_source"; cToday="$f_ts"
    continue
  fi
  TABLE_ROWS+="<tr>
      <td class=\"email\">$(esc "$f_email")</td>
      <td class=\"when\"><span class=\"rel\">$(esc "$f_rel")</span><span class=\"abs\">$(esc "$f_ts")</span></td>
      <td class=\"src\"><code>$(esc "$f_source")</code></td>
    </tr>"
done <<< "$ROWS"

# --- Emit HTML (house style — mirrors feedback.html / fleet.html) -----------------
{
cat <<HEAD
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="180">
<title>Ridge · Waitlist</title>
<style>
  :root{
    --bg:#f6f7f9; --card:#ffffff; --ink:#1f2430; --muted:#6b7280;
    --line:#e6e8ec; --accent:#2f6df6; --accent-soft:#eaf1ff;
    --warn:#b4690e; --warn-soft:#fdf3e3; --ok:#1a7f4b; --ok-soft:#e8f6ee;
    --down:#b42318; --down-soft:#fde8e6;
    --grey:#6b7280; --grey-soft:#eef0f3;
  }
  *{box-sizing:border-box}
  body{margin:0;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
       background:var(--bg);color:var(--ink);-webkit-text-size-adjust:100%}
  .wrap{max-width:880px;margin:0 auto;padding:20px 16px 64px}
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
  table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,.04)}
  thead th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);
           padding:11px 16px;border-bottom:1px solid var(--line);background:#fbfcfd;font-weight:700}
  tbody td{padding:12px 16px;border-bottom:1px solid var(--line);vertical-align:top;font-size:14px}
  tbody tr:last-child td{border-bottom:none}
  tbody tr:hover{background:#fbfcff}
  td.email{font-weight:600;color:var(--ink);word-break:break-all}
  td.when .rel{display:block;color:var(--ink)}
  td.when .abs{display:block;color:var(--muted);font-size:11.5px;margin-top:1px}
  td.src code{background:#f0f2f5;padding:1px 6px;border-radius:5px;font-size:11.5px;color:var(--accent)}
  .empty{text-align:center;color:var(--muted);padding:34px 16px}
  .empty .big{font-size:30px;margin-bottom:8px}
  a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
  footer{margin-top:30px;color:var(--muted);font-size:12px;text-align:center;line-height:1.7}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Ridge<span class="dot">·</span>Waitlist</h1>
    <span class="sub">"Request access" signups from the front door · as of ${NOW_UTC}</span>
  </header>

  <section>
    <div class="card">
      <div class="stats">
        <div class="stat"><div class="n">${total}</div><div class="l">Total requests</div></div>
        <div class="stat"><div class="n">${cToday}</div><div class="l">New today</div></div>
        <div class="stat"><div class="n">${c24h}</div><div class="l">Last 24h</div></div>
      </div>
    </div>
  </section>

  <section>
    <div class="sec-h">📋 Access requests · newest first</div>
HEAD

if [[ "$total" -gt 0 ]]; then
  cat <<'THEAD'
    <table>
      <thead><tr><th>Email</th><th>When</th><th>Source</th></tr></thead>
      <tbody>
THEAD
  printf '%s\n' "$TABLE_ROWS"
  cat <<'TFOOT'
      </tbody>
    </table>
TFOOT
else
  cat <<'EMPTY'
    <div class="card">
      <div class="empty">
        <div class="big">📭</div>
        <div>No access requests yet — the form's live, nobody's signed up.</div>
      </div>
    </div>
EMPTY
fi

cat <<FOOT
  </section>

  <footer>
    Waitlist dashboard v1 · regenerated every ~3 min by <code>scripts/waitlist-dashboard.sh</code> (cron)<br>
    Shows the <b>full email</b> because the person submitted it <i>to us</i> via the access-request form · gated behind basic-auth on <code>ridge.ridgetopai.net</code><br>
    Source: <code>/root/waitlist.jsonl</code> (600) · written by <code>ra-waitlist.service</code>
  </footer>
</div>
</body>
</html>
FOOT
} > "$TMP"

mv "$TMP" "$OUT"
trap - EXIT
chmod 644 "$OUT" 2>/dev/null || true
# Match the reports-dir house style: nginx serves these; keep the page world-readable
# and owned like the rest of the dir (collector writes ridgetop:ridgetop, but this
# dir is root-owned 755 and nginx reads via 644 — own it to ridgetop to match peers).
chown ridgetop:ridgetop "$OUT" 2>/dev/null || true
echo "waitlist-dashboard: wrote $OUT (${total} total, ${cToday} today, ${c24h} in 24h)"
