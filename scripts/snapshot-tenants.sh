#!/bin/bash
# Mandrel TENANT INTRA-DAY Snapshot Script  (change-triggered, low-RPO)
# -----------------------------------------------------------------------------
# Companion to the NIGHTLY full backup (scripts/backup-tenants-vps.sh). The
# nightly is a heavy, complete run (DB + registry + secrets + restore-drill,
# 14d/30d retention) done once a day. This script closes the RPO gap BETWEEN
# nightlies: a customer working 1AM-noon should not lose up to ~9h of work
# waiting for the next midnight run.
#
# Intended cron cadence: every 30-60 min (target <= 1h RPO). It is deliberately
# CHEAP so it can run that often:
#
#   CHANGE-TRIGGERED:  For each ACTIVE tenant we compute a cheap "last-write
#   watermark" = GREATEST of the max timestamps across the real Mandrel write
#   tables/columns (verified against the live schema 2026-06-15):
#       contexts.created_at, tasks.created_at, tasks.updated_at,
#       sessions.updated_at, technical_decisions.updated_at
#   (Note: contexts has only created_at; sessions/technical_decisions have only
#    updated_at; tasks has both — so we DON'T blindly GREATEST(created,updated)
#    per table, we list each table's existing column.)
#   The watermark is read with one quick `docker exec ... psql -tAc` (NO dump).
#   We compare it to the watermark saved from this tenant's LAST snapshot
#   (small state file). If it ADVANCED -> take a snapshot. If UNCHANGED (idle,
#   no new DB writes) -> SKIP and touch nothing. This is the whole idea:
#   "snapshot while they work, the last one persists when they stop, wait until
#    there are real DB writes again." Idle tenants cost ~one cheap psql query.
#
#   SNAPSHOT = `docker exec mandrel-<h>-postgres pg_dump -Fc` (DB ONLY). Intra-day
#   does NOT dump secrets, registry, or run the restore-drill — the nightly owns
#   those. Each dump is integrity-checked (pg_restore --list valid + size floor),
#   stored locally, then pushed off-site to B2. Only on a fully successful,
#   verified snapshot do we advance the saved watermark (so a failed run retries
#   next cycle instead of silently skipping).
#
# REGISTRY-DRIVEN: iterates status:"active" tenants from the registry, exactly
# like the nightly, so NEW customers are auto-covered with zero code changes.
#
# NO COLLISION WITH NIGHTLY: separate dirs + B2 prefixes.
#       nightly local   : /root/mandrel-backups/tenants/<TS>/
#       intra-day local : /root/mandrel-backups/tenants-intraday/<h>/<TS>.dump
#       nightly remote  : b2:RidgetopAi/mandrel-tenants/<TS>/
#       intra-day remote: b2:RidgetopAi/mandrel-tenants-intraday/<h>/<TS>.dump
#
# SAFETY (intentionally conservative — same posture as the nightly):
#   - READ-ONLY on tenant data: `pg_dump` + watermark `psql SELECT` only. Never
#     writes to, restores into, or drops anything in a tenant DB.
#   - ADDITIVE local files only under the intra-day dir + a state dir.
#   - Off-site uploads DB dumps ONLY. No secrets, no registry.
#   - Never prints/logs secret VALUES. Creds read from container env into locals.
#   - Idempotent + safe to re-run: re-running with no new writes SKIPS everyone.
#
# USAGE:
#   snapshot-tenants.sh                      # normal change-triggered run
#   ONLY_TENANT=staging snapshot-tenants.sh  # restrict to a single tenant (testing)
#   NO_OFFSITE=1 snapshot-tenants.sh         # skip B2 (local snapshot only; testing)
#   FORCE=1 snapshot-tenants.sh              # ignore watermark, snapshot everyone
#   REMOTE=b2:RidgetopAi/test-prefix ...     # override remote prefix (testing)
#   OUTPUT_ROOT=/tmp/x ...                   # override local root (testing)
#
# Exit non-zero on any tenant failure. Designed to run from cron as root.

set -euo pipefail

# --- Config -------------------------------------------------------------------
REGISTRY="${REGISTRY:-/root/mandrel-registry.json}"
OUTPUT_ROOT="${OUTPUT_ROOT:-/root/mandrel-backups/tenants-intraday}"
STATE_DIR="${STATE_DIR:-/root/.mandrel-intraday-state}"
LOG_FILE="${LOG_FILE:-/var/log/mandrel-tenant-intraday.log}"
REMOTE="${REMOTE:-b2:RidgetopAi/mandrel-tenants-intraday}"
RCLONE_CONF="${RCLONE_CONF:-/root/.config/rclone/rclone.conf}"

# Retention: keep last N snapshots PER TENANT (local + remote).
KEEP_LOCAL="${KEEP_LOCAL:-3}"
KEEP_REMOTE="${KEEP_REMOTE:-3}"

# Integrity floors (same as nightly — even a near-empty tenant dumps ~400KB/725 obj).
MIN_DUMP_BYTES="${MIN_DUMP_BYTES:-50000}"
MIN_OBJECTS="${MIN_OBJECTS:-100}"

# Toggles
NO_OFFSITE="${NO_OFFSITE:-0}"
FORCE="${FORCE:-0}"
ONLY_TENANT="${ONLY_TENANT:-}"

TMP_ROOT="$(mktemp -d /tmp/mandrel-intraday.XXXXXX)"

# Ensure the log's parent dir exists before the first log() tee (cron uses
# /var/log which always exists; this keeps testing with a custom LOG_FILE safe).
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

# Counters for the final status line.
SNAP_OK=0
SNAP_SKIP=0
SNAP_FAILED=0

log() {
    echo "[$(date)] intraday-snapshot: $1" | tee -a "$LOG_FILE"
}

cleanup() {
    rm -rf "$TMP_ROOT" 2>/dev/null || true
}
trap cleanup EXIT

fail() {
    log "FAILURE: $1"
    log "=== Intra-day Snapshot FAILED ==="
    exit 1
}

log "=== Mandrel Intra-day Snapshot Starting ==="

# --- 0. Sanity checks ---------------------------------------------------------
command -v docker >/dev/null 2>&1 || fail "docker not found on PATH"
command -v jq     >/dev/null 2>&1 || fail "jq not found on PATH"
command -v pg_restore >/dev/null 2>&1 || fail "pg_restore not found on PATH"
[ -r "$REGISTRY" ] || fail "registry not readable at $REGISTRY"

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"
mkdir -p "$OUTPUT_ROOT"

# The watermark query. Each table contributes only the timestamp column(s) it
# actually has (verified against live schema). COALESCE to epoch 0 so a tenant
# with no rows still yields a stable, comparable value rather than empty/NULL.
WM_SQL="SELECT COALESCE(GREATEST(
    (SELECT max(created_at) FROM contexts),
    (SELECT max(created_at) FROM tasks),
    (SELECT max(updated_at) FROM tasks),
    (SELECT max(updated_at) FROM sessions),
    (SELECT max(updated_at) FROM technical_decisions)
), to_timestamp(0))::text;"

# --- 1. Resolve ACTIVE tenants from the registry ------------------------------
mapfile -t ACTIVE_TENANTS < <(jq -r '.tenants | to_entries[] | select(.value.status=="active") | .key' "$REGISTRY")
[ "${#ACTIVE_TENANTS[@]}" -gt 0 ] || fail "no active tenants found in registry"

if [ -n "$ONLY_TENANT" ]; then
    # Filter to just the requested tenant (must still be registry-active).
    local_found=0
    for h in "${ACTIVE_TENANTS[@]}"; do [ "$h" == "$ONLY_TENANT" ] && local_found=1; done
    [ "$local_found" == "1" ] || fail "ONLY_TENANT='$ONLY_TENANT' is not an active tenant in the registry"
    ACTIVE_TENANTS=("$ONLY_TENANT")
fi
log "Active tenants in scope: ${ACTIVE_TENANTS[*]}"

# --- read_watermark <h> -> prints current live watermark, or empty on error ---
read_watermark() {
    local h="$1"
    local container="mandrel-${h}-postgres"
    local pguser pgdb
    pguser="$(docker exec "$container" printenv POSTGRES_USER 2>/dev/null || true)"
    pgdb="$(docker exec "$container" printenv POSTGRES_DB 2>/dev/null || true)"
    [ -n "$pguser" ] && [ -n "$pgdb" ] || return 1
    docker exec "$container" psql -U "$pguser" -d "$pgdb" -tAc "$WM_SQL" 2>/dev/null | tr -d '[:space:]'
}

# --- snapshot_tenant <h> ------------------------------------------------------
# Dump -> integrity-check -> promote local -> off-site -> rotate -> advance state.
# Returns: 0 = snapshotted, 2 = skipped (idle/unchanged), 1 = failed.
snapshot_tenant() {
    local h="$1"
    local container="mandrel-${h}-postgres"
    local state_file="$STATE_DIR/$h"

    if ! docker ps --format '{{.Names}}' | grep -qx "$container"; then
        log "WARN: $container not running — skipping '$h' (registry-active but no pg container)"
        return 2
    fi

    # --- 1. Cheap watermark read (no dump) ---
    local live_wm
    live_wm="$(read_watermark "$h")" || { log "ERROR: could not read watermark for '$h'"; return 1; }
    if [ -z "$live_wm" ]; then
        log "ERROR: empty watermark for '$h' (psql failed?)"
        return 1
    fi

    local prev_wm=""
    [ -f "$state_file" ] && prev_wm="$(cat "$state_file" 2>/dev/null | tr -d '[:space:]')"

    if [ "$FORCE" != "1" ] && [ -n "$prev_wm" ] && [ "$prev_wm" == "$live_wm" ]; then
        log "SKIP: '$h' unchanged (watermark=$live_wm) — no new DB writes since last snapshot"
        return 2
    fi

    if [ -z "$prev_wm" ]; then
        log "SNAP: '$h' first run (no prior watermark) — live watermark=$live_wm"
    elif [ "$FORCE" == "1" ]; then
        log "SNAP: '$h' FORCE=1 — watermark=$live_wm (prev=$prev_wm)"
    else
        log "SNAP: '$h' watermark ADVANCED ($prev_wm -> $live_wm) — snapshotting"
    fi

    # --- 2. Dump (DB only) ---
    local pguser pgdb
    pguser="$(docker exec "$container" printenv POSTGRES_USER 2>/dev/null || true)"
    pgdb="$(docker exec "$container" printenv POSTGRES_DB 2>/dev/null || true)"
    if [ -z "$pguser" ] || [ -z "$pgdb" ]; then
        log "ERROR: could not read POSTGRES_USER/DB from $container — skipping '$h'"
        return 1
    fi

    local ts tmp_dump
    ts="$(date +%Y%m%d_%H%M%S)"
    tmp_dump="$TMP_ROOT/${h}_${ts}.dump"

    if ! docker exec "$container" pg_dump -U "$pguser" -Fc -d "$pgdb" > "$tmp_dump" 2>>"$LOG_FILE"; then
        log "ERROR: pg_dump failed for '$h'"
        rm -f "$tmp_dump"
        return 1
    fi

    # --- 3. Integrity: size floor + valid archive + object floor ---
    local bytes objects
    bytes="$(stat -c %s "$tmp_dump" 2>/dev/null || echo 0)"
    if [ "$bytes" -lt "$MIN_DUMP_BYTES" ]; then
        log "ERROR: '$h' dump too small: ${bytes} bytes (< ${MIN_DUMP_BYTES})"
        rm -f "$tmp_dump"; return 1
    fi
    if ! pg_restore --list "$tmp_dump" >/dev/null 2>&1; then
        log "ERROR: '$h' dump is not a valid archive (pg_restore --list failed)"
        rm -f "$tmp_dump"; return 1
    fi
    objects="$(pg_restore --list "$tmp_dump" 2>/dev/null | grep -c ';' || true)"
    if [ "${objects:-0}" -lt "$MIN_OBJECTS" ]; then
        log "ERROR: '$h' dump reported ${objects} objects (< ${MIN_OBJECTS} floor)"
        rm -f "$tmp_dump"; return 1
    fi
    log "OK: '$h' dump verified (${bytes} bytes, ${objects} objects)"

    # --- 4. Promote local (verify-then-promote) ---
    local dest_dir="$OUTPUT_ROOT/$h"
    local dest_dump="$dest_dir/${ts}.dump"
    mkdir -p "$dest_dir"
    chmod 700 "$dest_dir"
    mv "$tmp_dump" "$dest_dump"
    chmod 600 "$dest_dump"

    # --- 5. Off-site to B2 (DB dump only) ---
    if [ "$NO_OFFSITE" != "1" ]; then
        if ! offsite_push "$h" "$dest_dump" "$ts"; then
            log "ERROR: '$h' off-site push/verify failed — NOT advancing watermark (will retry next cycle)"
            # Local snapshot is kept (it's valid), but we leave the state file as-is
            # so the next run re-attempts the off-site for this change.
            return 1
        fi
    else
        log "OFFSITE: skipped for '$h' (NO_OFFSITE=1)"
    fi

    # --- 6. Local retention: keep newest $KEEP_LOCAL dumps for this tenant ---
    ( cd "$dest_dir" && ls -1t *.dump 2>/dev/null | tail -n +$((KEEP_LOCAL + 1)) | xargs -r rm -f ) || \
        log "WARN: '$h' local retention prune hit an error (continuing)"

    # --- 7. Advance the saved watermark (ONLY after full success) ---
    printf '%s\n' "$live_wm" > "$state_file"
    chmod 600 "$state_file"
    log "STATE: '$h' watermark advanced to $live_wm"

    return 0
}

# --- offsite_push <h> <dumpfile> <ts> -----------------------------------------
# rclone copy the single dump to b2:.../<h>/, verify with rclone check, prune
# remote to last $KEEP_REMOTE for this tenant.
offsite_push() {
    local h="$1" dumpfile="$2" ts="$3"
    command -v rclone >/dev/null 2>&1 || { log "OFFSITE FAILURE: rclone not on PATH"; return 1; }
    [ -f "$RCLONE_CONF" ] || { log "OFFSITE FAILURE: rclone config missing at $RCLONE_CONF"; return 1; }

    local remote_dir="$REMOTE/$h/"
    local local_dir; local_dir="$(dirname "$dumpfile")"
    local fname; fname="$(basename "$dumpfile")"

    log "OFFSITE: '$h' rclone copy $fname -> $remote_dir ..."
    if ! rclone copyto "$dumpfile" "$remote_dir$fname" --b2-hard-delete 2>&1 | tee -a "$LOG_FILE"; then
        log "OFFSITE FAILURE: '$h' rclone copy failed"
        return 1
    fi

    # Verify the just-uploaded file by hash. rclone check compares DIRECTORIES,
    # so we scope it to this one file with --include rather than naming the file
    # directly (file paths make rclone error "is a file not a directory").
    log "OFFSITE: '$h' verifying $fname with rclone check ..."
    if ! rclone check "$local_dir" "$remote_dir" --include "$fname" 2>&1 | tee -a "$LOG_FILE"; then
        log "OFFSITE FAILURE: '$h' rclone check found a difference for $fname"
        return 1
    fi

    # Remote retention: keep newest $KEEP_REMOTE *.dump under this tenant prefix.
    local remote_files total delete_count
    remote_files="$(rclone lsf "$remote_dir" --include '*.dump' 2>/dev/null | sort)"
    total="$(echo "$remote_files" | grep -c . || true)"
    if [ "${total:-0}" -gt "$KEEP_REMOTE" ]; then
        delete_count=$((total - KEEP_REMOTE))
        echo "$remote_files" | head -n "$delete_count" | while read -r OLD; do
            [ -n "$OLD" ] || continue
            log "OFFSITE retention: '$h' deleting old remote $OLD"
            rclone deletefile "$remote_dir$OLD" 2>&1 | tee -a "$LOG_FILE" || \
                log "OFFSITE WARN: '$h' failed to delete remote $OLD (continuing)"
        done
    fi

    log "OFFSITE: '$h' $fname uploaded + verified to $remote_dir"
    return 0
}

# --- Main loop ----------------------------------------------------------------
for h in "${ACTIVE_TENANTS[@]}"; do
    set +e
    snapshot_tenant "$h"
    rc=$?
    set -e
    case "$rc" in
        0) SNAP_OK=$((SNAP_OK + 1)) ;;
        2) SNAP_SKIP=$((SNAP_SKIP + 1)) ;;
        *) SNAP_FAILED=$((SNAP_FAILED + 1)) ;;
    esac
done

# --- Final status -------------------------------------------------------------
if [ "$SNAP_FAILED" -eq 0 ]; then
    log "SUCCESS: intra-day snapshot — snapped=${SNAP_OK} skipped=${SNAP_SKIP} failed=0"
else
    log "PARTIAL: intra-day snapshot — snapped=${SNAP_OK} skipped=${SNAP_SKIP} failed=${SNAP_FAILED}"
fi
log "=== Intra-day Snapshot Finished ==="

[ "$SNAP_FAILED" -eq 0 ] || exit 1
exit 0
