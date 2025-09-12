#!/bin/bash
# AIDIS PostgreSQL Base Backup Script (for Point-in-Time Recovery)
# Created for TR0004 - Refactoring safety infrastructure

set -e  # Exit on any error

# Configuration
DB_NAME="aidis_production"
DB_HOST="localhost"
DB_PORT="5432"
DB_USER="ridgetop"
BACKUP_DIR="/home/ridgetop/aidis/backups/base"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_PATH="${BACKUP_DIR}/base_backup_${TIMESTAMP}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

log "Starting PostgreSQL base backup for Point-in-Time Recovery..."
log "Backup directory: ${BACKUP_PATH}"

# Check database connection
log "Testing database connection..."
if ! psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1;" > /dev/null 2>&1; then
    error "Cannot connect to database ${DB_NAME}"
    exit 1
fi

log "Database connection successful"

# Check if pg_basebackup is available
if ! command -v pg_basebackup &> /dev/null; then
    error "pg_basebackup command not found"
    exit 1
fi

# Get database cluster size
CLUSTER_SIZE=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT pg_size_pretty(sum(pg_database_size(datname))) FROM pg_database;" | xargs)
log "PostgreSQL cluster size: ${CLUSTER_SIZE}"

# Create base backup with WAL files
log "Creating base backup with WAL files..."
log "This may take several minutes depending on database size..."

pg_basebackup -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" \
              -D "${BACKUP_PATH}" \
              -Ft \
              -z \
              -P \
              -W \
              --wal-method=include \
              --checkpoint=fast \
              --label="AIDIS_Refactoring_Baseline_${TIMESTAMP}" 2>/dev/null

# Verify backup completed
if [[ ! -d "$BACKUP_PATH" ]]; then
    error "Base backup failed - directory not created"
    exit 1
fi

# Get backup size
BACKUP_SIZE=$(du -sh "${BACKUP_PATH}" | cut -f1)

log "Base backup completed successfully!"
log "Backup location: ${BACKUP_PATH}"
log "Backup size: ${BACKUP_SIZE}"

# Create backup metadata
cat > "${BACKUP_PATH}/backup_info.json" << EOF
{
  "backup_date": "$(date -Iseconds)",
  "backup_type": "pg_basebackup",
  "database_cluster": "${DB_HOST}:${DB_PORT}",
  "cluster_size": "${CLUSTER_SIZE}",
  "backup_size": "${BACKUP_SIZE}",
  "backup_label": "AIDIS_Refactoring_Baseline_${TIMESTAMP}",
  "wal_method": "include",
  "compression": "gzip",
  "pg_version": "$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT version();" | xargs)"
}
EOF

log "Backup metadata saved: ${BACKUP_PATH}/backup_info.json"

# Cleanup old base backups (keep last 3)
log "Cleaning up old base backups (keeping last 3)..."
cd "${BACKUP_DIR}"
ls -1dt base_backup_* 2>/dev/null | tail -n +4 | while read old_backup; do
    if [[ -d "$old_backup" ]]; then
        rm -rf "$old_backup"
        warning "Removed old base backup: $old_backup"
    fi
done

log "PostgreSQL base backup completed successfully!"
echo
echo "This backup can be used for Point-in-Time Recovery (PITR)"
echo "Backup location: ${BACKUP_PATH}"
echo
warning "For PITR, you'll also need WAL files from the time of this backup onwards"
warning "Make sure PostgreSQL is configured for continuous WAL archiving"
