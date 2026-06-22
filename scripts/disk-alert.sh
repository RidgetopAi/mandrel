#!/usr/bin/env bash
# =============================================================================
# disk-alert.sh — leading-indicator disk-space alert for the Mandrel host
# =============================================================================
# From the 2026-06-21 disk-full incident (Lesson 015): the VPS hit 100% disk
# mid-deploy and a live customer (tomobobo) went down — but monitoring only
# alerted on the DOWNSTREAM symptom (/mcp 502), i.e. after a customer was already
# broken. There was NO leading-indicator alert on disk %. This script is that
# alert: a `df`-based cron that Telegrams at WARN/URGENT thresholds BEFORE the
# disk fills, so we act while it climbs 80% → 90% → 100% instead of after.
#
# WHAT IT DOES
#   * Checks used% on each watched mount (default: `/`, plus the docker data-root
#     if — and only if — it is a SEPARATE filesystem from `/`).
#   * Telegrams via the shared scripts/lib/ridge-notify.sh notify() helper:
#       used% >= DISK_URGENT_PCT  → URGENT (loud)
#       used% >= DISK_WARN_PCT    → WARN   (loud)
#       below both                → quiet (no Telegram)
#   * ANTI-SPAM: a small state file remembers the last alert LEVEL per mount and
#     when it last fired, so it only Telegrams on a NEW threshold crossing (OK→WARN,
#     WARN→URGENT, etc.) or re-alerts at most once every DISK_REALERT_HOURS while a
#     mount stays at/above a threshold. A recovery (back below WARN) sends one
#     "recovered" notice and resets state, so the next climb alerts again.
#
# CONFIG-DRIVEN (no hardcoded numbers — Brian's standing rule). Defaults live at
# the top of this script and may be overridden by an OPTIONAL env file:
#     /root/.ridge-disk-alert.env   (chmod 600; same spirit as the telegram env)
# Override the env path for testing with RIDGE_DISK_ALERT_ENV=/path.
# Knobs:
#     DISK_WARN_PCT        used% that triggers WARN     (default 80)
#     DISK_URGENT_PCT      used% that triggers URGENT   (default 90)
#     DISK_MOUNTS          space-separated mounts to watch (default: auto = "/"
#                          plus the docker data-root iff it is a separate fs)
#     DISK_REALERT_HOURS   re-alert cadence while still over threshold (default 6)
#     DISK_STATE_FILE      anti-spam state file (default /var/lib/ridge/disk-alert.state)
#
# TEST MODE
#     DISK_ALERT_FAKE_PCT=<n>   pretend EVERY watched mount is at <n>% used, so the
#                               WARN/URGENT/quiet paths can be exercised without
#                               actually filling the disk.
#     NOTIFY_DRY_RUN=1          (honored by ridge-notify) log what WOULD be sent,
#                               send no Telegram. Combine with FAKE_PCT to dry-test.
#
# CRON (install as root — Ridge installs this, NOT this script):
#     */10 * * * * /home/ridgetop/projects/ra-mandrel/scripts/disk-alert.sh >> /var/log/ridge-disk-alert.log 2>&1
#
# EXIT CODES: 0 = ran OK (regardless of alert level). Non-zero only on a real
# operational error (can't read df, can't source the notify lib).
# =============================================================================
set -euo pipefail

# --- Paths -------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NOTIFY_LIB="$SCRIPT_DIR/lib/ridge-notify.sh"

# --- Defaults (config block — overridable via env file / environment) --------
DISK_WARN_PCT="${DISK_WARN_PCT:-80}"
DISK_URGENT_PCT="${DISK_URGENT_PCT:-90}"
DISK_REALERT_HOURS="${DISK_REALERT_HOURS:-6}"
DISK_STATE_FILE="${DISK_STATE_FILE:-/var/lib/ridge/disk-alert.state}"
# DISK_MOUNTS: left empty here so the env file can set it; if still empty after
# loading config we auto-detect (/ + separate docker data-root) below.
DISK_MOUNTS="${DISK_MOUNTS:-}"

# --- Optional config override file -------------------------------------------
RIDGE_DISK_ALERT_ENV="${RIDGE_DISK_ALERT_ENV:-/root/.ridge-disk-alert.env}"
if [[ -r "$RIDGE_DISK_ALERT_ENV" ]]; then
  # shellcheck disable=SC1090
  . "$RIDGE_DISK_ALERT_ENV"
fi

# --- Logger ------------------------------------------------------------------
log() { printf '%s disk-alert: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2; }

# --- Source the shared notify helper -----------------------------------------
if [[ ! -r "$NOTIFY_LIB" ]]; then
  log "FATAL: cannot read notify lib $NOTIFY_LIB"
  exit 1
fi
# shellcheck source=lib/ridge-notify.sh
. "$NOTIFY_LIB"

# --- Resolve which mounts to watch -------------------------------------------
# If DISK_MOUNTS is set (config), honor it verbatim. Otherwise auto-detect:
#   always "/", plus the docker data-root ONLY IF it is on a different filesystem
#   than "/" (no point double-reporting the same fs — here data-root lives under
#   /var/lib/docker on /dev/sda1, the same fs as /, so it is folded into "/").
fsid_of() {  # <path> -> filesystem source (e.g. /dev/sda1); empty on failure
  df -P "$1" 2>/dev/null | awk 'NR==2 {print $1}'
}

if [[ -z "${DISK_MOUNTS// }" ]]; then
  DISK_MOUNTS="/"
  local_docker_root="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || true)"
  if [[ -n "$local_docker_root" && -d "$local_docker_root" ]]; then
    root_fs="$(fsid_of "/")"
    docker_fs="$(fsid_of "$local_docker_root")"
    if [[ -n "$docker_fs" && "$docker_fs" != "$root_fs" ]]; then
      DISK_MOUNTS="/ $local_docker_root"
      log "docker data-root '$local_docker_root' is a separate filesystem ($docker_fs) — watching it too"
    else
      log "docker data-root '$local_docker_root' shares the root filesystem ($root_fs) — covered by '/'"
    fi
  fi
fi

# --- Validate thresholds -----------------------------------------------------
if ! [[ "$DISK_WARN_PCT" =~ ^[0-9]+$ && "$DISK_URGENT_PCT" =~ ^[0-9]+$ ]]; then
  log "FATAL: DISK_WARN_PCT/DISK_URGENT_PCT must be integers (got '$DISK_WARN_PCT'/'$DISK_URGENT_PCT')"
  exit 1
fi
if (( DISK_URGENT_PCT <= DISK_WARN_PCT )); then
  log "WARN: DISK_URGENT_PCT ($DISK_URGENT_PCT) <= DISK_WARN_PCT ($DISK_WARN_PCT); URGENT will mask WARN. Proceeding."
fi

# --- State file helpers (anti-spam) ------------------------------------------
# State format, one line per mount: "<mount>\t<level>\t<epoch>"
#   <level> in: OK | WARN | URGENT
#   <epoch>  : unix time the current <level> was last ALERTED (0 for OK)
ensure_state_dir() {
  local dir; dir="$(dirname "$DISK_STATE_FILE")"
  if [[ ! -d "$dir" ]]; then
    mkdir -p "$dir" 2>/dev/null || { log "WARN: cannot create state dir $dir — anti-spam disabled this run"; return 1; }
  fi
  [[ -f "$DISK_STATE_FILE" ]] || : > "$DISK_STATE_FILE" 2>/dev/null || true
  return 0
}

# Read prior "<level> <epoch>" for a mount (defaults "OK 0").
state_get() {  # <mount> -> prints "<level> <epoch>"
  local m="$1" line
  if [[ -f "$DISK_STATE_FILE" ]]; then
    line="$(awk -F'\t' -v m="$m" '$1==m {print $2" "$3; found=1} END{if(!found) print ""}' "$DISK_STATE_FILE")"
  else
    line=""
  fi
  if [[ -z "$line" ]]; then echo "OK 0"; else echo "$line"; fi
}

# Upsert "<mount> <level> <epoch>" into the state file.
state_set() {  # <mount> <level> <epoch>
  local m="$1" lvl="$2" ep="$3" tmp
  [[ -f "$DISK_STATE_FILE" ]] || return 0
  tmp="$(mktemp "${DISK_STATE_FILE}.XXXXXX" 2>/dev/null)" || { log "WARN: mktemp failed — state not persisted"; return 0; }
  # Drop any existing row for this mount, then append the new one.
  awk -F'\t' -v m="$m" '$1!=m {print}' "$DISK_STATE_FILE" > "$tmp" 2>/dev/null || true
  printf '%s\t%s\t%s\n' "$m" "$lvl" "$ep" >> "$tmp"
  mv -f "$tmp" "$DISK_STATE_FILE" 2>/dev/null || { log "WARN: could not update state file"; rm -f "$tmp" 2>/dev/null || true; }
}

# --- Per-mount used% + human detail ------------------------------------------
# Honors DISK_ALERT_FAKE_PCT (test mode): every mount reports that used%.
used_pct_of() {  # <mount> -> integer used percent
  if [[ -n "${DISK_ALERT_FAKE_PCT:-}" ]]; then
    printf '%s' "$DISK_ALERT_FAKE_PCT"
    return 0
  fi
  df -P "$1" 2>/dev/null | awk 'NR==2 {gsub(/%/,"",$5); print $5}'
}

human_detail_of() {  # <mount> -> "used/size (avail free)"
  if [[ -n "${DISK_ALERT_FAKE_PCT:-}" ]]; then
    printf '[TEST MODE: simulated %s%% used]' "$DISK_ALERT_FAKE_PCT"
    return 0
  fi
  df -h -P "$1" 2>/dev/null | awk 'NR==2 {print $3"/"$2" used, "$4" free"}'
}

# Classify a used% into a level given the thresholds.
level_for() {  # <pct> -> OK|WARN|URGENT
  local p="$1"
  if   (( p >= DISK_URGENT_PCT )); then echo "URGENT"
  elif (( p >= DISK_WARN_PCT  )); then echo "WARN"
  else echo "OK"; fi
}

# =============================================================================
# Main
# =============================================================================
ensure_state_dir || true   # anti-spam degrades gracefully if state dir unwritable
now="$(date +%s)"
realert_secs=$(( DISK_REALERT_HOURS * 3600 ))

log "watching mounts: ${DISK_MOUNTS}  (WARN>=${DISK_WARN_PCT}%, URGENT>=${DISK_URGENT_PCT}%, re-alert every ${DISK_REALERT_HOURS}h)${DISK_ALERT_FAKE_PCT:+  [FAKE_PCT=${DISK_ALERT_FAKE_PCT}]}"

overall_alerted=0
for mount in $DISK_MOUNTS; do
  pct="$(used_pct_of "$mount")"
  if ! [[ "$pct" =~ ^[0-9]+$ ]]; then
    log "WARN: could not read used% for '$mount' (got '$pct') — skipping"
    continue
  fi
  detail="$(human_detail_of "$mount")"
  new_level="$(level_for "$pct")"

  read -r prev_level prev_epoch <<<"$(state_get "$mount")"
  prev_epoch="${prev_epoch:-0}"
  [[ "$prev_epoch" =~ ^[0-9]+$ ]] || prev_epoch=0

  log "mount '$mount': ${pct}% used (${detail}) — level=$new_level (was=$prev_level)"

  case "$new_level" in
    OK)
      # Recovery: if we WERE alerting on this mount, send one all-clear + reset.
      if [[ "$prev_level" != "OK" ]]; then
        notify "Disk recovered: $mount" \
          "$mount back to ${pct}% used (${detail}). Was at $prev_level. Threshold WARN ${DISK_WARN_PCT}% / URGENT ${DISK_URGENT_PCT}%." \
          "default" "🟢"
        overall_alerted=1
      fi
      state_set "$mount" "OK" "0"
      ;;
    WARN|URGENT)
      # Decide whether to fire: NEW crossing (level changed) OR re-alert cadence.
      fire=0
      if [[ "$new_level" != "$prev_level" ]]; then
        fire=1   # new threshold crossing (incl. OK→WARN, WARN→URGENT, URGENT→WARN)
      elif (( now - prev_epoch >= realert_secs )); then
        fire=1   # still over threshold, re-alert window elapsed
      fi

      if (( fire == 1 )); then
        if [[ "$new_level" == "URGENT" ]]; then
          emoji="🔴"; lvl="urgent"
          title="URGENT: disk ${pct}% on $mount"
        else
          emoji="🟠"; lvl="high"
          title="WARN: disk ${pct}% on $mount"
        fi
        body="$mount is ${pct}% used (${detail}).
Thresholds: WARN ${DISK_WARN_PCT}% / URGENT ${DISK_URGENT_PCT}%.
Leading-indicator alert (Lesson 015) — act before 100% = fleet-wide ENOSPC outage.
Safe reclaim: docker builder prune -af && docker image prune -f"
        notify "$title" "$body" "$lvl" "$emoji"
        state_set "$mount" "$new_level" "$now"
        overall_alerted=1
      else
        # Suppressed by anti-spam — record level (keep original epoch so the
        # re-alert clock keeps counting from the FIRST alert at this level).
        state_set "$mount" "$new_level" "$prev_epoch"
        log "mount '$mount': $new_level suppressed by anti-spam (last alert $(( (now - prev_epoch) / 60 ))m ago, re-alert every ${DISK_REALERT_HOURS}h)"
      fi
      ;;
  esac
done

if (( overall_alerted == 0 )); then
  log "all watched mounts below WARN (or anti-spam suppressed) — no alert sent"
fi
exit 0
