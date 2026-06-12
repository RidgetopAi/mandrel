#!/usr/bin/env bash
#
# feedback-collector.sh — Tester-feedback rollup (closes the open feedback loop)
#
# Discovers every hosted Mandrel instance running on this VPS (by its compose
# postgres container), reads each instance's `feedback` table (migration 044), and
# regenerates a static HTML snapshot at ~/projects/ridgetopai-reports/feedback.html.
#
# WHY WE SHOW FEEDBACK CONTENT IN FULL — and why that is NOT a privacy violation:
#   fleet-status.sh obeys a hard "STATS, NOT DATA" rule: it never reads user
#   content. THIS script is different ON PURPOSE. The `feedback` table holds text a
#   tester DELIBERATELY SUBMITTED TO US via the dashboard feedback form ("send this
#   to the operator"). That content is addressed to us; surfacing it in full is the
#   entire point — otherwise the feedback never reaches Brian/Ridge. This exception
#   is SCOPED STRICTLY to the `feedback` table. Do NOT extend it to context.content,
#   project names, titles, or any other user project data — that remains governed by
#   the operator-sees-stats-not-data rule in fleet-status.sh.
#
# READ-ONLY: every DB statement here is a SELECT from `feedback`. The script never
#   mutates any instance DB and never touches prod (8080) or /opt.
#
# Safe to run repeatedly (cron, ~every 10 min).
#
set -euo pipefail

OUT="${FEEDBACK_OUT:-/home/ridgetop/projects/ridgetopai-reports/feedback.html}"
TMP="$(mktemp)"
NOW_UTC="$(date -u '+%Y-%m-%d %H:%M UTC')"
trap 'rm -f "$TMP"' EXIT

# --- HTML escape helper (feedback message is real user free text — escape it) -----
esc() { local s="${1:-}"; s="${s//&/&amp;}"; s="${s//</&lt;}"; s="${s//>/&gt;}"; s="${s//\"/&quot;}"; printf '%s' "$s"; }

# --- Discover instances by their postgres containers (auto-pickup new ones) -------
mapfile -t PG_CONTAINERS < <(docker ps --format '{{.Names}}' | grep -E '^mandrel-.*-postgres$' | sort)

# Collect every feedback row across the fleet into one TSV stream, newest-first.
# Each line: handle \t id \t username \t type \t severity \t created_at_iso \t created_rel \t page \t message
# (message last + base64 to survive newlines/tabs in free text)
ALL_ROWS=""
total=0; total_24h=0; n_bug=0; n_idea=0; n_question=0

for pg in "${PG_CONTAINERS[@]}"; do
  # mandrel-<handle>-postgres -> <handle>
  handle="${pg#mandrel-}"; handle="${handle%-postgres}"

  pg_state=$(docker inspect "$pg" --format '{{.State.Status}}' 2>/dev/null || echo missing)
  [[ "$pg_state" == "running" ]] || continue

  # Guard: skip instances that do not have the feedback table (migration 044 absent).
  has_tbl=$(docker exec "$pg" psql -U mandrel -d mandrel -t -A -c \
    "SELECT to_regclass('public.feedback');" 2>/dev/null || echo "")
  [[ "$has_tbl" == "feedback" ]] || continue

  # READ-ONLY select of the feedback rows this tester chose to send us.
  # Fields: id, username, type, severity, created_at (ISO), human-relative age,
  #         page, and the message (base64-encoded so embedded newlines/tabs survive
  #         the line-oriented transport below; decoded at render time).
  rows=$(docker exec "$pg" psql -U mandrel -d mandrel -t -A -F$'\t' -c "
    SELECT
      id,
      coalesce(username,''),
      type,
      severity,
      to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI')||' UTC',
      CASE
        WHEN now()-created_at < interval '1 minute' THEN 'just now'
        WHEN now()-created_at < interval '1 hour'   THEN floor(extract(epoch FROM now()-created_at)/60)::text||'m ago'
        WHEN now()-created_at < interval '1 day'    THEN floor(extract(epoch FROM now()-created_at)/3600)::text||'h ago'
        ELSE floor(extract(epoch FROM now()-created_at)/86400)::text||'d ago'
      END,
      coalesce(page,''),
      (created_at > now()-interval '24 hours')::int,
      type='bug', type='idea', type='question',
      -- base64 with the per-76-char newlines PG inserts stripped, so each feedback
      -- row stays on ONE line through the line-oriented read below (decoded at render)
      replace(encode(convert_to(message,'UTF8'),'base64'), chr(10), ''),
      extract(epoch FROM created_at)::bigint
    FROM feedback
    ORDER BY created_at DESC;
  " 2>/dev/null || echo "")

  [[ -z "$rows" ]] && continue

  while IFS=$'\t' read -r f_id f_user f_type f_sev f_ts f_rel f_page f_24h f_isbug f_isidea f_isq f_msg_b64 f_epoch; do
    [[ -z "$f_id" ]] && continue
    total=$((total+1))
    [[ "$f_24h" == "1" ]] && total_24h=$((total_24h+1))
    [[ "$f_isbug" == "t" ]] && n_bug=$((n_bug+1))
    [[ "$f_isidea" == "t" ]] && n_idea=$((n_idea+1))
    [[ "$f_isq" == "t" ]] && n_question=$((n_question+1))
    # Prefix each emitted line with sort epoch + handle for cross-instance sorting.
    ALL_ROWS+="${f_epoch}\t${handle}\t${f_user}\t${f_type}\t${f_sev}\t${f_ts}\t${f_rel}\t${f_page}\t${f_msg_b64}"$'\n'
  done <<< "$rows"
done

# --- Sort newest-first across all instances, then render each card ----------------
CARDS=""
if [[ "$total" -gt 0 ]]; then
  # ALL_ROWS contains literal \t escapes from the accumulation; materialize them.
  sorted=$(printf '%b' "$ALL_ROWS" | sort -t$'\t' -k1,1nr)
  while IFS=$'\t' read -r s_epoch s_handle s_user s_type s_sev s_ts s_rel s_page s_msg_b64; do
    [[ -z "$s_handle" ]] && continue
    msg=$(printf '%s' "$s_msg_b64" | base64 -d 2>/dev/null || printf '')
    [[ -z "$s_user" ]] && s_user="—"
    [[ -z "$s_page" ]] && page_disp="—" || page_disp=$(esc "$s_page")

    case "$s_sev" in
      high)   sev_cls="sev-high" ;;
      medium) sev_cls="sev-med" ;;
      *)      sev_cls="sev-low" ;;
    esac
    case "$s_type" in
      bug)      type_cls="type-bug";      type_icon="🐞" ;;
      idea)     type_cls="type-idea";     type_icon="💡" ;;
      question) type_cls="type-question"; type_icon="❓" ;;
      *)        type_cls="type-bug";      type_icon="•" ;;
    esac

    CARDS+="<div class=\"fb\">
      <div class=\"fb-head\">
        <span class=\"badge ${type_cls}\">${type_icon} $(esc "$s_type")</span>
        <span class=\"badge ${sev_cls}\">$(esc "$s_sev")</span>
        <span class=\"who\"><b>$(esc "$s_user")</b> · <span class=\"inst\">$(esc "$s_handle")</span></span>
        <span class=\"when\" title=\"$(esc "$s_ts")\">$(esc "$s_rel")</span>
      </div>
      <div class=\"fb-msg\">$(esc "$msg")</div>
      <div class=\"fb-meta\">on <code>${page_disp}</code> · <span class=\"abs\">$(esc "$s_ts")</span></div>
    </div>"
  done <<< "$sorted"
fi

# --- Emit HTML (house style — mirrors fleet.html) ---------------------------------
{
cat <<HEAD
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="600">
<title>Ridge · Feedback</title>
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
  .badge{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;white-space:nowrap;text-transform:capitalize}
  .sev-high{background:var(--down-soft);color:var(--down)}
  .sev-med{background:var(--warn-soft);color:var(--warn)}
  .sev-low{background:var(--grey-soft);color:var(--grey)}
  .type-bug{background:#fbeae9;color:#9a2b22}
  .type-idea{background:var(--accent-soft);color:var(--accent)}
  .type-question{background:#efeafc;color:#6b4ec0}
  .fb{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:13px 16px;margin:10px 0;box-shadow:0 1px 2px rgba(16,24,40,.04)}
  .fb-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .fb-head .who{color:var(--ink);font-size:13px}
  .fb-head .inst{color:var(--muted);font-variant:small-caps;letter-spacing:.3px}
  .fb-head .when{margin-left:auto;color:var(--muted);font-size:12px;white-space:nowrap}
  .fb-msg{margin:10px 0 8px;font-size:14.5px;line-height:1.55;white-space:pre-wrap;word-wrap:break-word;color:#262b36}
  .fb-meta{color:var(--muted);font-size:12px}
  .fb-meta code{background:#f0f2f5;padding:1px 5px;border-radius:5px;font-size:11.5px}
  .empty{text-align:center;color:var(--muted);padding:34px 16px}
  .empty .big{font-size:30px;margin-bottom:8px}
  a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
  footer{margin-top:30px;color:var(--muted);font-size:12px;text-align:center;line-height:1.7}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Ridge<span class="dot">·</span>Feedback</h1>
    <span class="sub">Tester submissions across hosted instances · as of ${NOW_UTC}</span>
  </header>

  <section>
    <div class="card">
      <div class="stats">
        <div class="stat"><div class="n">${total}</div><div class="l">Total feedback</div></div>
        <div class="stat"><div class="n">${total_24h}</div><div class="l">Last 24h</div></div>
        <div class="stat"><div class="n">${n_bug}</div><div class="l">🐞 Bugs</div></div>
        <div class="stat"><div class="n">${n_idea}</div><div class="l">💡 Ideas</div></div>
        <div class="stat"><div class="n">${n_question}</div><div class="l">❓ Questions</div></div>
      </div>
    </div>
  </section>

  <section>
    <div class="sec-h">🗣️ Submissions · newest first</div>
HEAD

if [[ "$total" -gt 0 ]]; then
  printf '%s\n' "$CARDS"
else
  cat <<'EMPTY'
    <div class="card">
      <div class="empty">
        <div class="big">📭</div>
        <div>No feedback yet — the form's live, nothing submitted.</div>
      </div>
    </div>
EMPTY
fi

cat <<FOOT
  </section>

  <footer>
    Feedback collector v1 · regenerated every ~10 min by <code>scripts/feedback-collector.sh</code> (cron)<br>
    Shows the <b>full message</b> because testers submitted it <i>to us</i> via the feedback form · read-only · served from <code>ridge.ridgetopai.net</code>
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
echo "feedback-collector: wrote $OUT (${total} total, ${total_24h} in 24h, ${n_bug} bug / ${n_idea} idea / ${n_question} question)"
