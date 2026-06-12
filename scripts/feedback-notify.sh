#!/usr/bin/env bash
#
# feedback-notify.sh — PUSH-ON-NEW-FEEDBACK (the push half of the feedback loop)
#
# The feedback-collector (feedback-collector.sh) is PULL-ONLY: it regenerates a static
# dashboard page (ridge.ridgetopai.net/feedback.html) that someone has to go look at.
# This script is the PUSH half: when a tester submits feedback on ANY hosted Mandrel
# instance, fire a phone alert so Brian knows to go look — even though this runs
# head­less from cron (the Claude-app/Remote-Control push is tied to Ridge's live
# session and can't be fired from cron, so we use ntfy.sh instead).
#
# ── PRIVACY: METADATA ONLY ────────────────────────────────────────────────────────
#   The push alert carries ONLY metadata: type, severity, username, instance, page.
#   It DELIBERATELY does NOT include the feedback message body. The full content stays
#   on the dashboard (ridge.ridgetopai.net/feedback.html). The alert just says
#   "something came in, go look." This keeps free-text user content off a third-party
#   push service (ntfy.sh). Do NOT add the message body to the ntfy payload.
#
# ── READ-ONLY ─────────────────────────────────────────────────────────────────────
#   Every DB statement against an instance is a SELECT from `feedback`. This script
#   never mutates any instance DB and never touches prod (8080) or /opt. The only
#   state it writes is its own watermark file on this host.
#
# ── HOW IT STAYS IDEMPOTENT ───────────────────────────────────────────────────────
#   A high-water mark (the max feedback.created_at already pushed) is persisted in
#   $WATERMARK_FILE. Each run pushes only rows with created_at > watermark, then
#   advances the watermark to the new global max seen. A re-run with nothing new
#   sends nothing and leaves the watermark unchanged.
#
#   FIRST RUN (no watermark file): initialize the watermark to the current global max
#   created_at across the fleet (or now() if the fleet has zero feedback) and send
#   NOTHING — so we never blast historical feedback on first deploy.
#
# Safe to run repeatedly (cron, ~every 5 min).
#
set -euo pipefail

NTFY_ENV="${NTFY_ENV:-/root/.ridge-ntfy.env}"
WATERMARK_FILE="${WATERMARK_FILE:-/root/.ridge-feedback-watermark}"
DASHBOARD="ridge.ridgetopai.net/feedback.html"

log() { printf '%s feedback-notify: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

# --- Load the secret ntfy topic (never echoed) ------------------------------------
if [[ ! -r "$NTFY_ENV" ]]; then
  log "FATAL: cannot read $NTFY_ENV (ntfy topic). Aborting."
  exit 1
fi
# shellcheck disable=SC1090
. "$NTFY_ENV"
if [[ -z "${NTFY_TOPIC:-}" ]]; then
  log "FATAL: NTFY_TOPIC not set in $NTFY_ENV. Aborting."
  exit 1
fi

# --- Discover instances by their postgres containers (auto-pickup new ones) -------
mapfile -t PG_CONTAINERS < <(docker ps --format '{{.Names}}' | grep -E '^mandrel-.*-postgres$' | sort)

# Helper: global max created_at (epoch, integer) across all instances with feedback.
# Echoes an integer epoch, or empty string if the fleet has zero feedback.
global_max_epoch() {
  local pg handle gmax="" e
  for pg in "${PG_CONTAINERS[@]}"; do
    [[ "$(docker inspect "$pg" --format '{{.State.Status}}' 2>/dev/null || echo missing)" == "running" ]] || continue
    [[ "$(docker exec "$pg" psql -U mandrel -d mandrel -t -A -c "SELECT to_regclass('public.feedback');" 2>/dev/null || echo "")" == "feedback" ]] || continue
    e=$(docker exec "$pg" psql -U mandrel -d mandrel -t -A -c \
      "SELECT coalesce(extract(epoch FROM max(created_at))::bigint::text,'') FROM feedback;" 2>/dev/null || echo "")
    [[ -n "$e" ]] || continue
    if [[ -z "$gmax" || "$e" -gt "$gmax" ]]; then gmax="$e"; fi
  done
  printf '%s' "$gmax"
}

# ── FIRST-RUN INIT ────────────────────────────────────────────────────────────────
# No watermark file => initialize to current global max (or now()), send nothing.
if [[ ! -f "$WATERMARK_FILE" ]]; then
  init_epoch="$(global_max_epoch)"
  [[ -n "$init_epoch" ]] || init_epoch="$(date +%s)"   # zero feedback fleet-wide -> now()
  printf '%s\n' "$init_epoch" > "$WATERMARK_FILE"
  chmod 600 "$WATERMARK_FILE"
  log "INIT: no prior watermark. Initialized to epoch=$init_epoch ($(date -u -d "@$init_epoch" '+%Y-%m-%d %H:%M:%SZ')). Sent 0 alerts (historical feedback suppressed)."
  exit 0
fi

WATERMARK="$(tr -d '[:space:]' < "$WATERMARK_FILE")"
if ! [[ "$WATERMARK" =~ ^[0-9]+$ ]]; then
  log "FATAL: watermark file $WATERMARK_FILE is corrupt (value not an epoch). Aborting to avoid blasting feedback."
  exit 1
fi
log "start: watermark epoch=$WATERMARK ($(date -u -d "@$WATERMARK" '+%Y-%m-%d %H:%M:%SZ'))"

# --- Map severity -> ntfy Priority header -----------------------------------------
sev_to_priority() {
  case "$1" in
    high)   echo "urgent" ;;
    medium) echo "default" ;;
    low)    echo "low" ;;
    *)      echo "default" ;;
  esac
}
# --- Map type -> tag/emoji (ntfy renders named emoji from the Tags header) ---------
type_to_tag() {
  case "$1" in
    bug)      echo "beetle" ;;       # 🐞
    idea)     echo "bulb" ;;         # 💡
    question) echo "question" ;;     # ❓
    *)        echo "speech_balloon" ;;  # 🗣️
  esac
}

sent=0
new_global_max="$WATERMARK"

# --- Walk every running instance with a feedback table ----------------------------
for pg in "${PG_CONTAINERS[@]}"; do
  handle="${pg#mandrel-}"; handle="${handle%-postgres}"

  [[ "$(docker inspect "$pg" --format '{{.State.Status}}' 2>/dev/null || echo missing)" == "running" ]] || continue
  [[ "$(docker exec "$pg" psql -U mandrel -d mandrel -t -A -c "SELECT to_regclass('public.feedback');" 2>/dev/null || echo "")" == "feedback" ]] || continue

  # READ-ONLY: pull only the METADATA columns (NO message body) for rows newer than
  # the watermark, oldest-first so notifications arrive in chronological order.
  # Fields (tab-separated): epoch, type, severity, username, page
  rows=$(docker exec "$pg" psql -U mandrel -d mandrel -t -A -F$'\t' -c "
    SELECT
      extract(epoch FROM created_at)::bigint,
      type,
      severity,
      coalesce(nullif(username,''),'anon'),
      coalesce(nullif(page,''),'?')
    FROM feedback
    WHERE extract(epoch FROM created_at)::bigint > ${WATERMARK}
    ORDER BY created_at ASC;
  " 2>/dev/null || echo "")

  [[ -z "$rows" ]] && continue

  while IFS=$'\t' read -r r_epoch r_type r_sev r_user r_page; do
    [[ -z "$r_epoch" ]] && continue

    priority="$(sev_to_priority "$r_sev")"
    tag="$(type_to_tag "$r_type")"
    title="New feedback: ${r_type}/${r_sev}"
    # BODY = METADATA ONLY. No feedback.message anywhere in this payload.
    body="${r_user} on ${handle} · page ${r_page}"$'\n'"→ ${DASHBOARD}"

    http=$(curl -s -o /dev/null -w '%{http_code}' \
      -H "Title: ${title}" \
      -H "Priority: ${priority}" \
      -H "Tags: ${tag}" \
      -d "${body}" \
      "https://ntfy.sh/${NTFY_TOPIC}" 2>/dev/null || echo "000")

    if [[ "$http" == "200" ]]; then
      sent=$((sent+1))
      log "SENT [HTTP $http] ${title} | ${r_user} on ${handle} · page ${r_page} (epoch=$r_epoch)"
      [[ "$r_epoch" -gt "$new_global_max" ]] && new_global_max="$r_epoch"
    else
      # Do NOT advance the watermark past a row we failed to deliver — it will retry
      # on the next run. Stop advancing here to preserve at-least-once delivery.
      log "FAILED [HTTP $http] ${title} | ${r_user} on ${handle} (epoch=$r_epoch) — leaving watermark; will retry next run."
    fi
  done <<< "$rows"
done

# --- Advance watermark to the newest row we SUCCESSFULLY delivered -----------------
if [[ "$new_global_max" -gt "$WATERMARK" ]]; then
  printf '%s\n' "$new_global_max" > "$WATERMARK_FILE"
  chmod 600 "$WATERMARK_FILE"
  log "done: sent $sent alert(s); watermark advanced to epoch=$new_global_max ($(date -u -d "@$new_global_max" '+%Y-%m-%d %H:%M:%SZ'))."
else
  log "done: sent $sent alert(s); watermark unchanged (epoch=$WATERMARK)."
fi
