#!/usr/bin/env bash
#
# ridge-notify.sh — the SINGLE shared notify helper for Ridge/Mandrel host alerts.
#
# WHY THIS EXISTS
#   ntfy.sh's iOS push does NOT actually alert Brian (messages arrive but no
#   banner/sound, even at "urgent" priority — confirmed 2026-06). Telegram IS
#   reliable for him. So every host cron alert script now routes through THIS one
#   helper instead of its own divergent curl-to-ntfy. One source of truth, no drift.
#
# USAGE
#   source "/path/to/scripts/lib/ridge-notify.sh"
#   notify "<title>" "<body>" "<level>" "<emoji>"
#
#   - <title> : short headline (rendered bold)
#   - <body>  : detail lines (may contain \n)
#   - <level> : maps to Telegram notification behaviour (see PRIORITY MAP below).
#               Accepts the OLD ntfy priority words so call sites map 1:1:
#                 urgent | high | default  -> LOUD  (normal Telegram notification)
#                 low | min                -> SILENT (disable_notification=true)
#               Default when omitted/unknown = LOUD (the whole point: Brian gets it).
#   - <emoji> : optional leading emoji for the message (e.g. 🔴, 🟢, 🐞). Optional.
#
#   Returns 0 on Telegram ok:true, non-zero otherwise. Sets NOTIFY_LAST_OK=1/0 and
#   NOTIFY_LAST_HTTP=<code> for callers that want to gate watermark/state advances.
#
# CONFIG (token NEVER hardcoded here or in any caller)
#   Reads /root/.ridge-telegram.env (chmod 600), which defines:
#       TELEGRAM_BOT_TOKEN=...
#       TELEGRAM_CHAT_ID=...
#   The token is used only to build the API URL inline and is NEVER echoed/logged.
#   Override the env path for testing with RIDGE_TELEGRAM_ENV=/path.
#
# TEST MODE
#   NOTIFY_DRY_RUN=1  -> log what WOULD be sent (title + loud/silent), send nothing.

RIDGE_TELEGRAM_ENV="${RIDGE_TELEGRAM_ENV:-/root/.ridge-telegram.env}"

# Internal logger — prefix is overridable so each caller can keep its own log voice.
_notify_log() { printf '%s notify: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2; }

# Telegram HTML-escape (text is sent with parse_mode=HTML so the title can be bold).
_notify_html_esc() {
  local s="${1:-}"
  s="${s//&/&amp;}"; s="${s//</&lt;}"; s="${s//>/&gt;}"
  printf '%s' "$s"
}

# Map an old-ntfy-style level to Telegram disable_notification (true=silent).
# Default to LOUD when unsure — alerting is the whole reason this exists.
_notify_is_silent() {
  case "${1:-}" in
    low|min|silent|quiet) printf 'true'  ;;
    *)                    printf 'false' ;;   # urgent|high|default|warn|"" -> loud
  esac
}

# notify <title> <body> <level> <emoji>
notify() {
  local title="${1:-Ridge alert}" body="${2:-}" level="${3:-default}" emoji="${4:-}"
  NOTIFY_LAST_OK=0
  NOTIFY_LAST_HTTP="000"

  local silent; silent="$(_notify_is_silent "$level")"

  if [[ "${NOTIFY_DRY_RUN:-0}" == "1" ]]; then
    local _dbg_body="${body//$'\n'/ | }"
    _notify_log "DRY_RUN: would send -> [$([ "$silent" = true ] && echo SILENT || echo LOUD)] title='${title}' body='${_dbg_body}'"
    NOTIFY_LAST_OK=1
    return 0
  fi

  # Load creds (never echoed). Failure here must be loud in the log but not crash
  # a caller running under `set -e` in a way that hides the reason.
  if [[ ! -r "$RIDGE_TELEGRAM_ENV" ]]; then
    _notify_log "FATAL: cannot read $RIDGE_TELEGRAM_ENV (telegram creds). Alert NOT sent."
    return 1
  fi
  # shellcheck disable=SC1090
  . "$RIDGE_TELEGRAM_ENV"
  if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
    _notify_log "FATAL: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set in $RIDGE_TELEGRAM_ENV. Alert NOT sent."
    return 1
  fi

  # Compose message: bold title (optionally prefixed with emoji) + body.
  local head="${emoji:+${emoji} }<b>$(_notify_html_esc "$title")</b>"
  local text="$head"
  [[ -n "$body" ]] && text+=$'\n'"$(_notify_html_esc "$body")"

  # POST via --data-urlencode so newlines/special chars survive intact. The bot
  # token is interpolated ONLY into the URL string here and never logged.
  # Capture BOTH the body (to assert Telegram's own ok:true) and the HTTP code.
  local resp http
  resp="$(curl -s -w $'\n%{http_code}' -m 15 \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${text}" \
    --data-urlencode "parse_mode=HTML" \
    --data-urlencode "disable_web_page_preview=true" \
    --data-urlencode "disable_notification=${silent}" \
    2>/dev/null || printf '\n000')"
  http="$(printf '%s' "$resp" | tail -n1)"
  local payload; payload="$(printf '%s' "$resp" | sed '$d')"

  NOTIFY_LAST_HTTP="$http"
  # Telegram can return HTTP 200 with {"ok":false,...} (e.g. parse error), so we
  # assert ok:true, not merely the HTTP code.
  if [[ "$http" == "200" ]] && printf '%s' "$payload" | grep -q '"ok":true'; then
    NOTIFY_LAST_OK=1
    _notify_log "SENT [HTTP $http, ok:true, $([ "$silent" = true ] && echo silent || echo loud)] ${title}"
    return 0
  else
    # Log the description ONLY (no token can appear here — it's never in the body).
    local desc; desc="$(printf '%s' "$payload" | grep -oE '"description":"[^"]*"' | head -1)"
    _notify_log "FAILED [HTTP $http] Telegram alert not delivered: ${title} ${desc}"
    return 1
  fi
}
