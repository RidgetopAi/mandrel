#!/bin/bash
# Mandrel VPS Backup Script
# Runs on Hetzner VPS to backup the mandrel database
# (DB renamed from aidis_production -> mandrel in Jan 2026)

set -euo pipefail

DB_NAME="mandrel"
BACKUP_DIR="/root/mandrel-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/$TIMESTAMP"
LOG_FILE="/var/log/mandrel-backup.log"
# Minimum acceptable dump size in bytes. Real mandrel dump is tens of MB;
# anything under this means the dump is empty/corrupt and must fail loudly.
MIN_DUMP_BYTES=1000000   # 1 MB floor

log() {
    echo "[$(date)] $1" | tee -a "$LOG_FILE"
}

# fail loudly: log a clear FAILURE line, clean up any temp file, exit non-zero.
# Deliberately does NOT create the dated backup folder, so a failed run never
# leaves a fake "success" empty folder behind.
fail() {
    log "FAILURE: $1"
    log "=== Backup FAILED ==="
    rm -f "$TMP_DUMP" 2>/dev/null || true
    exit 1
}

TMP_DUMP="/tmp/${DB_NAME}_${TIMESTAMP}.backup"

log "=== Mandrel Backup Starting ==="

# 1. Dump to a TEMP file first. Only create the dated folder once we have a
#    verified, real dump in hand.
log "Creating full database backup ($DB_NAME) to temp..."
if ! sudo -u postgres pg_dump -d "$DB_NAME" --format=custom -f "$TMP_DUMP"; then
    fail "pg_dump exited non-zero for database '$DB_NAME'"
fi

# 2. Verify the temp dump exists and is above the sane size threshold.
if [ ! -f "$TMP_DUMP" ]; then
    fail "dump file '$TMP_DUMP' missing after pg_dump"
fi
DUMP_BYTES=$(stat -c %s "$TMP_DUMP")
if [ "$DUMP_BYTES" -lt "$MIN_DUMP_BYTES" ]; then
    fail "dump too small: ${DUMP_BYTES} bytes (< ${MIN_DUMP_BYTES} threshold)"
fi

# 3. Verify integrity: pg_restore --list must succeed and report objects.
if ! sudo -u postgres pg_restore --list "$TMP_DUMP" > /dev/null 2>&1; then
    fail "pg_restore --list failed; dump is not a valid archive"
fi
OBJECT_COUNT=$(sudo -u postgres pg_restore --list "$TMP_DUMP" 2>/dev/null | grep -c ';' || true)
if [ "${OBJECT_COUNT:-0}" -lt 1 ]; then
    fail "dump verification reported 0 objects"
fi

# 4. Dump verified. NOW create the dated folder and move the dump into place.
mkdir -p "$BACKUP_PATH"
mv "$TMP_DUMP" "$BACKUP_PATH/"

log "Creating schema backup..."
# shellcheck disable=SC2024  # intentional: redirect runs as the invoking user (root) so
# the backup file is root-owned; `sudo -u postgres` only elevates pg_dump's DB access.
if ! sudo -u postgres pg_dump -d "$DB_NAME" --schema-only > "$BACKUP_PATH/${DB_NAME}_schema.sql"; then
    fail "schema-only dump failed for database '$DB_NAME'"
fi

CONTEXT_COUNT=$(sudo -u postgres psql -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM contexts;" | xargs)
TASK_COUNT=$(sudo -u postgres psql -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM tasks;" | xargs)
PROJECT_COUNT=$(sudo -u postgres psql -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM projects;" | xargs)

cat > "$BACKUP_PATH/backup_info.txt" << EOF
Mandrel VPS Backup
==================
Timestamp: $TIMESTAMP
Created: $(date)
Host: $(hostname)

Database: $DB_NAME
- Contexts: $CONTEXT_COUNT
- Tasks: $TASK_COUNT
- Projects: $PROJECT_COUNT

Dump size (bytes): $DUMP_BYTES
Dump objects: $OBJECT_COUNT

Restore: sudo -u postgres pg_restore -d NEW_DB $BACKUP_PATH/${DB_NAME}_${TIMESTAMP}.backup
EOF

echo "$TIMESTAMP" > "$BACKUP_DIR/latest_timestamp"

log "Cleaning up old backups (keeping 14)..."
cd "$BACKUP_DIR"
ls -1dt */ 2>/dev/null | tail -n +15 | xargs rm -rf 2>/dev/null || true

BACKUP_SIZE=$(du -sh "$BACKUP_PATH" | cut -f1)
log "SUCCESS: verified backup at $BACKUP_PATH ($BACKUP_SIZE, ${DUMP_BYTES} bytes, ${OBJECT_COUNT} objects)"
log "Stats: Contexts=$CONTEXT_COUNT Tasks=$TASK_COUNT Projects=$PROJECT_COUNT"
log "=== Backup Finished ==="
