#!/bin/bash
# Mandrel Off-site Backup -> Backblaze B2
# Pushes the newest local Mandrel DB dump folder to Backblaze B2 (off-site).
# Local dumps are produced by backup-mandrel-vps.sh (nightly 03:00). This runs
# after that (04:00) and replicates the freshest dated folder off-box.
#
# Scope/safety:
#   - Writes ONLY under the b2:RidgetopAi/mandrel-db/ prefix. Never touches any
#     other files/prefixes in the bucket.
#   - No client-side encryption (Private bucket + TLS only, by decision).
#   - Verifies every upload by hash (rclone copy + rclone check).

set -euo pipefail

BACKUP_DIR="/root/mandrel-backups"
REMOTE="b2:RidgetopAi/mandrel-db"
LOG_FILE="/var/log/mandrel-offsite.log"
RCLONE_CONF="/root/.config/rclone/rclone.conf"
KEEP=30   # number of newest dated folders to keep remotely under mandrel-db/

log() {
    echo "[$(date)] $1" | tee -a "$LOG_FILE"
}

# fail loudly: log a greppable FAILURE line and exit non-zero.
fail() {
    log "FAILURE: $1"
    log "=== Off-site Backup FAILED ==="
    exit 1
}

log "=== Mandrel Off-site Backup Starting ==="

# 0. Sanity: rclone present + config present.
command -v rclone >/dev/null 2>&1 || fail "rclone not found on PATH"
[ -f "$RCLONE_CONF" ] || fail "rclone config missing at $RCLONE_CONF"

# 1. Find the NEWEST prod DB dump under $BACKUP_DIR.
#    Selection is CONTENT-BASED, not mtime-of-dir-based: we pick the newest
#    file matching a dated dump folder's *.backup (20260608_030001/*.backup) and
#    take its parent folder. This is robust by construction — a SIBLING dir whose
#    mtime is newer (e.g. tenants/, tenants-intraday/, prod-presync-*) can NEVER
#    be selected, because it holds no top-level dated *.backup of its own.
#    (Historical bug: `ls -1dt */` selected tenants/ once its mtime got bumped,
#    silently breaking off-site for 4 days. Fixed permanently here.)
cd "$BACKUP_DIR" || fail "cannot cd to $BACKUP_DIR"
LOCAL_DUMP=$(ls -1t "$BACKUP_DIR"/20*_*/*.backup 2>/dev/null | head -n 1 || true)
[ -n "$LOCAL_DUMP" ] || fail "no dated dump (20*_*/*.backup) found under $BACKUP_DIR"
LOCAL_FOLDER=$(dirname "$LOCAL_DUMP")
NEWEST=$(basename "$LOCAL_FOLDER")
[ -d "$LOCAL_FOLDER" ] || fail "resolved newest '$LOCAL_FOLDER' is not a directory"

LOCAL_DUMP_BYTES=$(stat -c %s "$LOCAL_DUMP")
log "Newest local dump folder: $NEWEST"
log "Local dump: $(basename "$LOCAL_DUMP") (${LOCAL_DUMP_BYTES} bytes)"

# 2. Upload the folder. rclone copy verifies each transfer by hash by default.
DEST="$REMOTE/$NEWEST/"
log "Copying $LOCAL_FOLDER -> $DEST ..."
if ! rclone copy "$LOCAL_FOLDER" "$DEST" --transfers 4 --b2-hard-delete 2>&1 | tee -a "$LOG_FILE"; then
    fail "rclone copy failed for $NEWEST"
fi

# 3. Verify the upload end-to-end with rclone check (compares by hash).
log "Verifying upload with rclone check ..."
if ! rclone check "$LOCAL_FOLDER" "$DEST" 2>&1 | tee -a "$LOG_FILE"; then
    fail "rclone check found differences for $NEWEST (upload not verified)"
fi

# 3b. Explicitly confirm the .backup file is present remotely with matching size.
DUMP_BASENAME=$(basename "$LOCAL_DUMP")
REMOTE_DUMP_BYTES=$(rclone size "$DEST$DUMP_BASENAME" --json 2>/dev/null \
    | grep -o '"bytes":[0-9]*' | head -n1 | cut -d: -f2 || true)
[ -n "$REMOTE_DUMP_BYTES" ] || fail "remote dump $DUMP_BASENAME not found after upload"
if [ "$REMOTE_DUMP_BYTES" != "$LOCAL_DUMP_BYTES" ]; then
    fail "remote dump size ${REMOTE_DUMP_BYTES} != local ${LOCAL_DUMP_BYTES} bytes"
fi
log "Verified remote dump $DUMP_BASENAME (${REMOTE_DUMP_BYTES} bytes, matches local)"

# 4. Remote retention: keep newest $KEEP dated folders under mandrel-db/,
#    delete older ones. Operates ONLY within the mandrel-db/ prefix.
log "Applying remote retention (keep newest $KEEP folders under mandrel-db/) ..."
# List only timestamped dir names (e.g. 20260608_030001/), sorted, drop trailing slash.
REMOTE_DIRS=$(rclone lsf "$REMOTE/" --dirs-only 2>/dev/null | sed 's:/*$::' | sort)
TOTAL=$(echo "$REMOTE_DIRS" | grep -c . || true)
if [ "${TOTAL:-0}" -gt "$KEEP" ]; then
    # Oldest first (sort asc), prune all but the last $KEEP.
    DELETE_COUNT=$((TOTAL - KEEP))
    echo "$REMOTE_DIRS" | head -n "$DELETE_COUNT" | while read -r OLD; do
        [ -n "$OLD" ] || continue
        # Guard: only ever purge inside the mandrel-db/ prefix.
        log "Retention: purging old remote folder mandrel-db/$OLD"
        rclone purge "$REMOTE/$OLD" 2>&1 | tee -a "$LOG_FILE" || \
            log "WARN: failed to purge mandrel-db/$OLD (continuing)"
    done
else
    log "Retention: $TOTAL folder(s) remote, under keep limit ($KEEP); nothing to prune"
fi

log "SUCCESS: off-site backup of $NEWEST uploaded and verified to $DEST"
log "=== Off-site Backup Finished ==="
