#!/bin/bash
# Mandrel Off-site Backup — SUCCESS-or-ALERT helper
# -----------------------------------------------------------------------------
# Closes the "no alerting" gap on the PROD DB off-site backup (offsite-mandrel-b2.sh).
# A 4-day silent off-site failure (Jun 16-19, 2026) went unnoticed precisely
# because nothing watched this log. Tenants already had backup-tenants-alert.sh;
# this is its sibling for the prod-brain off-site copy. Same mechanism, no drift.
#
# Run a few minutes AFTER offsite-mandrel-b2.sh (separate cron line). Checks
# whether today's off-site log has a fresh SUCCESS line; if NOT, pings Brian via
# Telegram so a silent off-site failure can't go unnoticed again.
#
#   - Routes through the shared Telegram helper (scripts/lib/ridge-notify.sh; creds
#     in /root/.ridge-telegram.env, NEVER echoed).
#   - Pushes ZERO PII / ZERO secrets — only a status string.
#   - Failure alerts are LOUD (high); the optional success heartbeat is SILENT (low).
#
# USAGE:
#   offsite-mandrel-alert.sh
#   ALERT_ON_SUCCESS=1 offsite-mandrel-alert.sh   # also ping on success (heartbeat)
#   LOG_FILE=/path TODAY_HUMAN="Fri Jun 19" offsite-mandrel-alert.sh   # test overrides

set -euo pipefail

LOG_FILE="${LOG_FILE:-/var/log/mandrel-offsite.log}"
NOTIFY_LIB="${NOTIFY_LIB:-$(dirname "${BASH_SOURCE[0]}")/lib/ridge-notify.sh}"
ALERT_ON_SUCCESS="${ALERT_ON_SUCCESS:-0}"
# The off-site script logs `[$(date)]` (e.g. "Fri Jun 19 ...") so we match on the
# human date stamp for "today".
TODAY_HUMAN="${TODAY_HUMAN:-$(date '+%a %b %e')}"   # e.g. "Fri Jun 19"
SUCCESS_PATTERN="${SUCCESS_PATTERN:-SUCCESS: off-site backup}"

log() { printf '%s offsite-backup-alert: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

# Load the shared Telegram notify helper (creds never echoed).
if [[ ! -r "$NOTIFY_LIB" ]]; then
    log "FATAL: notify helper not found: $NOTIFY_LIB. Cannot alert."
    exit 1
fi
# shellcheck disable=SC1090
. "$NOTIFY_LIB"

send_alert() {  # send_alert <title> <level> <emoji> <body>  (loud unless level=low/min)
    local title="$1" level="$2" emoji="$3" body="$4"
    if notify "$title" "$body" "$level" "$emoji"; then
        log "SENT [ok:true] ${title}"
        return 0
    else
        log "FAILED [HTTP ${NOTIFY_LAST_HTTP:-000}] could not deliver Telegram alert"
        return 1
    fi
}

if [[ ! -r "$LOG_FILE" ]]; then
    log "ALERT: off-site log $LOG_FILE missing/unreadable — off-site backup may not have run."
    send_alert "Mandrel off-site backup: NO LOG" "high" "⚠️" \
        "Off-site backup log not found. Backup may not have run. Check the VPS."
    exit 1
fi

# Look for a fresh SUCCESS line dated today.
if grep -F "$TODAY_HUMAN" "$LOG_FILE" | grep -q "$SUCCESS_PATTERN"; then
    log "Healthy: found today's SUCCESS line."
    if [[ "$ALERT_ON_SUCCESS" == "1" ]]; then
        summary="$(grep -F "$TODAY_HUMAN" "$LOG_FILE" | grep "$SUCCESS_PATTERN" | tail -n1 | sed 's/^\[[^]]*\] //')"
        send_alert "Mandrel off-site backup OK" "low" "✅" \
            "${summary:-prod DB off-site backup succeeded}"
    fi
    exit 0
else
    log "ALERT: no fresh SUCCESS line for today ($TODAY_HUMAN) in $LOG_FILE."
    detail="$(grep -F "$TODAY_HUMAN" "$LOG_FILE" | grep -E 'FAILURE' | tail -n1 | sed 's/^\[[^]]*\] //')"
    send_alert "Mandrel off-site backup FAILED" "high" "🔴" \
        "No SUCCESS for today's prod DB off-site backup. ${detail:-Check /var/log/mandrel-offsite.log on the VPS.}"
    exit 1
fi
