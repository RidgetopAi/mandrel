#!/usr/bin/env bash
# =============================================================================
# systemd-failure-alert.sh — Telegram alert when a Mandrel systemd unit FAILS
# =============================================================================
# WHY THIS EXISTS
#   2026-06-19 audit (Lane 4/P1): alerting was poll-only. There was no systemd
#   OnFailure= on any unit, so a service that crash-loops between poll ticks went
#   silent. Concretely: a prod crash-loop restarted ~83x with NO alert. This
#   script is the OnFailure= target — systemd runs it the instant a watched unit
#   enters `failed`, and it Telegrams Brian IMMEDIATELY (URGENT 🔴) with the unit
#   name + the last journal lines, so a crash storm can never be silent again.
#
# HOW IT'S WIRED (defense-in-depth, complements the 5-min poll)
#   A templated alert unit `ridge-failure-alert@.service` runs:
#       systemd-failure-alert.sh %i
#   and the watched prod services get a drop-in:
#       [Unit]
#       OnFailure=ridge-failure-alert@%n.service
#   so when e.g. mandrel.service fails, systemd starts
#   ridge-failure-alert@mandrel.service which calls this with "mandrel.service".
#   Unit/drop-in files + install note live in deploy/systemd/ (NOT applied here —
#   touching prod service config is Ridge's call to enable after review).
#
# USAGE
#   systemd-failure-alert.sh <unit-name>
#     <unit-name> : the failed unit, e.g. "mandrel.service" (what %n expands to).
#                   A bare name without .service is accepted and normalized.
#
# CONFIG (config-driven; no hardcoded tunables — configs-not-hardcoded rule)
#   Overridable via env (or the optional env file below):
#     FAILURE_ALERT_JOURNAL_LINES   journal lines to include   (default 15)
#     FAILURE_ALERT_LEVEL           ridge-notify level         (default urgent)
#     FAILURE_ALERT_EMOJI           leading emoji              (default 🔴)
#     RIDGE_FAILURE_ALERT_ENV       optional env file to source for the above
#                                   (default /root/.ridge-failure-alert.env)
#   Telegram creds come from ridge-notify.sh (/root/.ridge-telegram.env) — the
#   token is NEVER read or echoed here.
#
# TEST MODE
#   NOTIFY_DRY_RUN=1  -> ridge-notify logs what WOULD be sent, sends nothing.
#                        (This script still gathers the journal so you see the
#                        real composed alert in the dry-run log.)
#
# EXIT CODES
#   0  alert sent (or dry-run logged) successfully
#   2  usage error (no unit name given)
#   3  operational error (cannot source the notify lib)
#   Non-zero from notify() (e.g. creds missing) is propagated so a failed
#   delivery is itself visible (systemd will log this unit's failure).
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NOTIFY_LIB="$SCRIPT_DIR/lib/ridge-notify.sh"

# --- Config (env-overridable, optionally from an env file) -------------------
RIDGE_FAILURE_ALERT_ENV="${RIDGE_FAILURE_ALERT_ENV:-/root/.ridge-failure-alert.env}"
if [[ -r "$RIDGE_FAILURE_ALERT_ENV" ]]; then
  # shellcheck disable=SC1090
  . "$RIDGE_FAILURE_ALERT_ENV"
fi
FAILURE_ALERT_JOURNAL_LINES="${FAILURE_ALERT_JOURNAL_LINES:-15}"
FAILURE_ALERT_LEVEL="${FAILURE_ALERT_LEVEL:-urgent}"
FAILURE_ALERT_EMOJI="${FAILURE_ALERT_EMOJI:-🔴}"

log() { printf '%s systemd-failure-alert: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2; }

# --- Args --------------------------------------------------------------------
if [[ $# -lt 1 || -z "${1:-}" ]]; then
  log "usage: systemd-failure-alert.sh <unit-name>  (e.g. mandrel.service)"
  exit 2
fi
RAW_UNIT="$1"
# Normalize: accept "mandrel" or "mandrel.service" — keep templated names intact.
if [[ "$RAW_UNIT" == *.* ]]; then
  UNIT="$RAW_UNIT"
else
  UNIT="${RAW_UNIT}.service"
fi

# --- Source the shared notify helper -----------------------------------------
if [[ ! -r "$NOTIFY_LIB" ]]; then
  log "FATAL: cannot read notify lib $NOTIFY_LIB"
  exit 3
fi
# shellcheck source=lib/ridge-notify.sh
. "$NOTIFY_LIB"

# --- Gather failure detail ---------------------------------------------------
# ActiveState/SubState/Result give the one-line "why"; the journal tail gives the
# context. Both are best-effort — never let a missing field abort the alert.
STATE="$(systemctl show "$UNIT" \
  --property=ActiveState,SubState,Result,ExecMainStatus,NRestarts \
  --no-pager 2>/dev/null \
  | tr '\n' ' ' | sed 's/  */ /g; s/ *$//' || true)"
[[ -n "$STATE" ]] || STATE="(systemctl show returned nothing — unit unknown to this host?)"

JOURNAL="$(journalctl -u "$UNIT" \
  --no-pager --no-hostname -n "$FAILURE_ALERT_JOURNAL_LINES" \
  -o short-iso 2>/dev/null || true)"
[[ -n "$JOURNAL" ]] || JOURNAL="(no journal lines available for $UNIT)"

HOST="$(hostname -s 2>/dev/null || hostname 2>/dev/null || echo unknown-host)"

# --- Compose + send ----------------------------------------------------------
TITLE="systemd unit FAILED: ${UNIT}"
BODY="host: ${HOST}
state: ${STATE}

last ${FAILURE_ALERT_JOURNAL_LINES} journal lines:
${JOURNAL}"

log "alerting for $UNIT (state: $STATE)"
notify "$TITLE" "$BODY" "$FAILURE_ALERT_LEVEL" "$FAILURE_ALERT_EMOJI"
rc=$?
if [[ "$rc" -eq 0 ]]; then
  log "alert dispatched for $UNIT (rc=0)"
else
  log "alert FAILED to dispatch for $UNIT (notify rc=$rc)"
fi
exit "$rc"
