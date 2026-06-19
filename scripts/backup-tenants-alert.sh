#!/bin/bash
# Mandrel Tenant Backup — SUCCESS-or-ALERT helper
# -----------------------------------------------------------------------------
# Fixes the "no alerting" gap. Run a few minutes AFTER backup-tenants-vps.sh
# (separate cron line). It checks whether today's tenant-backup log contains a
# fresh SUCCESS line; if NOT, it pings Brian via Telegram so a silent backup
# failure can't go unnoticed.
#
# Modelled on the existing notify scripts (waitlist-notify.sh):
#   - Routes through the shared Telegram helper (scripts/lib/ridge-notify.sh; creds
#     in /root/.ridge-telegram.env, NEVER echoed).
#   - Pushes ZERO PII / ZERO secrets — only a status string.
#   - Failure alerts are LOUD (high); the optional success heartbeat is SILENT (low).
#
# Logic:
#   - SUCCESS line dated TODAY present  -> healthy, send nothing (silent success),
#     unless ALERT_ON_SUCCESS=1 (then send a brief "backup OK" heartbeat).
#   - No fresh SUCCESS line (failure, partial, or didn't run) -> send ALERT.
#
# USAGE:
#   backup-tenants-alert.sh
#   ALERT_ON_SUCCESS=1 backup-tenants-alert.sh   # also ping on success (heartbeat)
#   LOG_FILE=/path TODAY=YYYYMMDD ... (override for testing)

set -euo pipefail

LOG_FILE="${LOG_FILE:-/var/log/mandrel-tenant-backup.log}"
NOTIFY_LIB="${NOTIFY_LIB:-$(dirname "${BASH_SOURCE[0]}")/lib/ridge-notify.sh}"
ALERT_ON_SUCCESS="${ALERT_ON_SUCCESS:-0}"
# Date string matched against the log. The backup logs `[$(date)]` (e.g.
# "Sun Jun 15 ...") so we match on the human date stamp for "today".
TODAY_HUMAN="${TODAY_HUMAN:-$(date '+%a %b %e')}"   # e.g. "Sun Jun 15"

log() { printf '%s tenant-backup-alert: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

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
    log "ALERT: tenant-backup log $LOG_FILE missing/unreadable — backup may not have run."
    send_alert "Mandrel tenant backup: NO LOG" "high" "⚠️" \
        "Tenant backup log not found. Backup may not have run. Check the VPS."
    exit 1
fi

# Look for a fresh SUCCESS line dated today.
if grep -F "$TODAY_HUMAN" "$LOG_FILE" | grep -q "SUCCESS: tenant backup"; then
    log "Healthy: found today's SUCCESS line."
    if [[ "$ALERT_ON_SUCCESS" == "1" ]]; then
        # Pull a brief summary (counts) from the success line — no secrets in it.
        summary="$(grep -F "$TODAY_HUMAN" "$LOG_FILE" | grep 'SUCCESS: tenant backup' | tail -n1 | sed 's/^\[[^]]*\] tenant-backup: //')"
        send_alert "Mandrel tenant backup OK" "low" "✅" \
            "${summary:-tenant backup succeeded}"
    fi
    exit 0
else
    log "ALERT: no fresh SUCCESS line for today ($TODAY_HUMAN) in $LOG_FILE."
    # Include the last PARTIAL/FAILURE line if present (no secrets in log lines).
    detail="$(grep -F "$TODAY_HUMAN" "$LOG_FILE" | grep -E 'FAILURE|PARTIAL' | tail -n1 | sed 's/^\[[^]]*\] tenant-backup: //')"
    send_alert "Mandrel tenant backup FAILED" "high" "🔴" \
        "No SUCCESS for today's tenant backup. ${detail:-Check /var/log/mandrel-tenant-backup.log on the VPS.}"
    exit 1
fi
