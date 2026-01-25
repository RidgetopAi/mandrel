#!/bin/bash
# AIDIS Database Backup Script
# Created for TR0004 - Refactoring safety infrastructure

set -e  # Exit on any error

# Configuration
DB_NAME="mandrel"
DB_HOST="localhost"
DB_PORT="5432"
DB_USER="ridgetop"
BACKUP_DIR="/home/ridgetop/aidis/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="aidis_backup_${TIMESTAMP}.sql"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"

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

log "Starting AIDIS database backup..."
log "Database: ${DB_NAME}"
log "Backup file: ${BACKUP_PATH}"

# Check database connection
log "Testing database connection..."
if ! psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1;" > /dev/null 2>&1; then
    error "Cannot connect to database ${DB_NAME}"
    exit 1
fi

log "Database connection successful"

# Get database size for progress indication
DB_SIZE=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT pg_size_pretty(pg_database_size('${DB_NAME}'));" | xargs)
log "Database size: ${DB_SIZE}"

# Create compressed backup with progress
log "Creating compressed backup..."
pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" \
        --verbose \
        --format=custom \
        --compress=9 \
        --no-owner \
        --no-privileges \
        "${DB_NAME}" > "${BACKUP_PATH}.backup" 2>/dev/null

# Create plain SQL backup for easier inspection
log "Creating plain SQL backup..."
pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" \
        --verbose \
        --format=plain \
        --no-owner \
        --no-privileges \
        "${DB_NAME}" | gzip > "${BACKUP_PATH}.gz" 2>/dev/null

# Verify backups exist and have content
if [[ ! -s "${BACKUP_PATH}.backup" ]]; then
    error "Compressed backup failed or is empty"
    exit 1
fi

if [[ ! -s "${BACKUP_PATH}.gz" ]]; then
    error "SQL backup failed or is empty"
    exit 1
fi

# Get backup file sizes
BACKUP_SIZE=$(du -h "${BACKUP_PATH}.backup" | cut -f1)
SQL_SIZE=$(du -h "${BACKUP_PATH}.gz" | cut -f1)

log "Backup completed successfully!"
log "Compressed backup: ${BACKUP_PATH}.backup (${BACKUP_SIZE})"
log "SQL backup: ${BACKUP_PATH}.gz (${SQL_SIZE})"

# Create backup metadata file
cat > "${BACKUP_PATH}.meta" << EOF
{
  "backup_date": "$(date -Iseconds)",
  "database_name": "${DB_NAME}",
  "database_size": "${DB_SIZE}",
  "backup_files": {
    "compressed": "${BACKUP_FILE}.backup",
    "sql": "${BACKUP_FILE}.gz"
  },
  "backup_sizes": {
    "compressed": "${BACKUP_SIZE}",
    "sql": "${SQL_SIZE}"
  },
  "pg_version": "$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT version();" | xargs)",
  "table_count": $(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | xargs)
}
EOF

log "Backup metadata saved: ${BACKUP_PATH}.meta"

# Cleanup old backups (keep last 10)
log "Cleaning up old backups (keeping last 10)..."
cd "${BACKUP_DIR}"
ls -1t aidis_backup_*.sql.backup 2>/dev/null | tail -n +11 | while read backup; do
    base_name=$(echo "$backup" | sed 's/\.backup$//')
    if [[ -f "$backup" ]]; then
        rm -f "$backup" "${base_name}.gz" "${base_name}.meta"
        warning "Removed old backup: $backup"
    fi
done

log "Database backup completed successfully!"
echo
echo "To restore this backup, use:"
echo "  ./restore-database.sh ${BACKUP_FILE}"
