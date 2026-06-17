#!/usr/bin/env bash
#
# waitlist-notify.sh — PUSH-ON-NEW-WAITLIST (the push half of the front-door loop)
#
# waitlist-dashboard.sh is PULL-ONLY: it regenerates a static dashboard page
# (ridge.ridgetopai.net/waitlist.html) someone has to go look at. This script is the
# PUSH half: when a NEW "Request access" signup lands in /root/waitlist.jsonl, fire a
# phone alert so Brian knows to go look — even though this runs headless from cron
# (the Claude-app/Remote-Control push is tied to Ridge's live session and can't fire
# from cron, so we route through Telegram instead).
#
# ── PRIVACY: EMAIL INCLUDED — PRIVATE TELEGRAM BOT ONLY ───────────────────────────
#   The waitlist email is PII. It is now included in the push because the push goes
#   to Brian's PRIVATE Telegram chat (his own bot/chat id), so he can triage a signup
#   at a glance without opening the auth-gated dashboard. This is ONLY acceptable
#   because the channel is private. Do NOT route this alert to any public or
#   third-party channel (e.g. a public ntfy topic) while it carries the email. The
#   full list also remains on the auth-gated dashboard (ridge.ridgetopai.net/waitlist.html).
#
# ── READ-ONLY ─────────────────────────────────────────────────────────────────────
#   This script only READS /root/waitlist.jsonl. It never mutates the waitlist file
#   and never touches prod (8080) or /opt. The only state it writes is its own
#   watermark file on this host.
#
# ── HOW IT STAYS IDEMPOTENT ───────────────────────────────────────────────────────
#   A high-water mark (the max ts/epoch already pushed) is persisted in
#   $WATERMARK_FILE. Each run counts rows with epoch > watermark; if there are any, it
#   sends ONE consolidated alert ("N new, M total") and advances the watermark to the
#   newest epoch seen. A re-run with nothing new sends nothing and leaves the
#   watermark unchanged.
#
#   FIRST RUN (no watermark file): initialize the watermark to the current max ts in
#   the file (or now() if empty) and send NOTHING — so we never blast historical
#   signups on first deploy.
#
# Safe to run repeatedly (cron, ~every 3-5 min).
#
set -euo pipefail

SRC="${WAITLIST_SRC:-/root/waitlist.jsonl}"
NOTIFY_LIB="${NOTIFY_LIB:-$(dirname "${BASH_SOURCE[0]}")/lib/ridge-notify.sh}"
WATERMARK_FILE="${WATERMARK_FILE:-/root/.ridge-waitlist-watermark}"
DASHBOARD="ridge.ridgetopai.net/waitlist.html"

log() { printf '%s waitlist-notify: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

# --- Load shared Telegram notify helper (creds never echoed) -----------------------
if [[ ! -r "$NOTIFY_LIB" ]]; then
  log "FATAL: notify helper not found: $NOTIFY_LIB. Aborting."
  exit 1
fi
# shellcheck disable=SC1090
. "$NOTIFY_LIB"

# --- Compute (max_epoch, total, count_newer_than_watermark) from the JSONL --------
# Echoes three space-separated integers: MAXEPOCH TOTAL NEWER (relative to $1=wmark).
# MAXEPOCH is 0 if the file is empty/missing.
scan() {
  local wmark="$1"
  node - "$SRC" "$wmark" <<'NODE'
const fs = require("node:fs");
const [file, wmarkArg] = process.argv.slice(2);
const wmark = Number(wmarkArg) || 0;
let lines = [];
try { lines = fs.readFileSync(file, "utf8").split("\n"); } catch { lines = []; }
let maxEpoch = 0, total = 0, newer = 0;
for (const ln of lines) {
  const t = ln.trim();
  if (!t) continue;
  let o; try { o = JSON.parse(t); } catch { continue; }
  if (typeof o.email !== "string" || !o.email) continue;
  total++;
  const ms = typeof o.ts === "string" ? new Date(o.ts).getTime() : NaN;
  if (!Number.isFinite(ms)) continue;
  const epoch = Math.floor(ms / 1000);
  if (epoch > maxEpoch) maxEpoch = epoch;
  if (epoch > wmark) newer++;
}
process.stdout.write(`${maxEpoch} ${total} ${newer}\n`);
NODE
}

# --- New signups (email + source) newer than the watermark, oldest-first ----------
# Echoes one Telegram bullet line per NEW signup: "• <email> (<source>)". This goes
# to Brian's PRIVATE Telegram bot, so the email (PII) is included for at-a-glance
# triage. Do NOT route this script's output to any public / third-party channel.
new_signup_lines() {
  local wmark="$1"
  node - "$SRC" "$wmark" <<'NODE'
const fs = require("node:fs");
const [file, wmarkArg] = process.argv.slice(2);
const wmark = Number(wmarkArg) || 0;
let lines = [];
try { lines = fs.readFileSync(file, "utf8").split("\n"); } catch { lines = []; }
const rows = [];
for (const ln of lines) {
  const t = ln.trim();
  if (!t) continue;
  let o; try { o = JSON.parse(t); } catch { continue; }
  if (typeof o.email !== "string" || !o.email) continue;
  const ms = typeof o.ts === "string" ? new Date(o.ts).getTime() : NaN;
  if (!Number.isFinite(ms)) continue;
  const epoch = Math.floor(ms / 1000);
  if (epoch > wmark) rows.push({ epoch, email: o.email, source: (typeof o.source === "string" ? o.source : "") });
}
rows.sort((a, b) => a.epoch - b.epoch);
for (const r of rows) process.stdout.write("• " + r.email + (r.source ? " (" + r.source + ")" : "") + "\n");
NODE
}

# ── FIRST-RUN INIT ────────────────────────────────────────────────────────────────
# No watermark file => initialize to current max ts (or now()), send nothing.
if [[ ! -f "$WATERMARK_FILE" ]]; then
  read -r init_max _ _ < <(scan 0)
  [[ "${init_max:-0}" -gt 0 ]] || init_max="$(date +%s)"   # empty file -> now()
  printf '%s\n' "$init_max" > "$WATERMARK_FILE"
  chmod 600 "$WATERMARK_FILE"
  log "INIT: no prior watermark. Initialized to epoch=$init_max ($(date -u -d "@$init_max" '+%Y-%m-%d %H:%M:%SZ')). Sent 0 alerts (historical signups suppressed)."
  exit 0
fi

WATERMARK="$(tr -d '[:space:]' < "$WATERMARK_FILE")"
if ! [[ "$WATERMARK" =~ ^[0-9]+$ ]]; then
  log "FATAL: watermark file $WATERMARK_FILE is corrupt (value not an epoch). Aborting to avoid blasting signups."
  exit 1
fi
log "start: watermark epoch=$WATERMARK ($(date -u -d "@$WATERMARK" '+%Y-%m-%d %H:%M:%SZ'))"

read -r max_epoch total newer < <(scan "$WATERMARK")
max_epoch="${max_epoch:-0}"; total="${total:-0}"; newer="${newer:-0}"

if [[ "$newer" -le 0 ]]; then
  log "done: 0 new request(s); watermark unchanged (epoch=$WATERMARK)."
  exit 0
fi

# --- Build the push: includes the new signup email(s) for at-a-glance triage ------
# (private Telegram bot — see new_signup_lines header re: PII.)
if [[ "$newer" -eq 1 ]]; then
  title="New access request"
else
  title="${newer} new access requests"
fi
signups="$(new_signup_lines "$WATERMARK")"
body="${newer} new · ${total} total"$'\n'"${signups}"$'\n'"→ ${DASHBOARD}"

# New access requests alert loudly (default level = loud).
notify "${title}" "${body}" "default" "📥" || true

if [[ "${NOTIFY_LAST_OK:-0}" == "1" ]]; then
  printf '%s\n' "$max_epoch" > "$WATERMARK_FILE"
  chmod 600 "$WATERMARK_FILE"
  log "SENT [ok:true] ${title} | ${newer} new, ${total} total — watermark advanced to epoch=$max_epoch ($(date -u -d "@$max_epoch" '+%Y-%m-%d %H:%M:%SZ'))."
else
  # Do NOT advance the watermark on a failed delivery — retry next run.
  log "FAILED [HTTP ${NOTIFY_LAST_HTTP:-000}] ${title} | ${newer} new — leaving watermark at epoch=$WATERMARK; will retry next run."
  exit 1
fi
