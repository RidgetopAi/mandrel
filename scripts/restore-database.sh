#!/bin/bash
# AIDIS Database Restore Script
# Created for TR0004 - Refactoring safety infrastructure

set -e  # Exit on any error

# Configuration
DB_NAME="aidis_production"
DB_HOST="localhost"
DB_PORT="5432"
DB_USER="ridgetop"
BACKUP_DIR="/home/ridgetop/aidis/backups"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] INFO:${NC} $1"
}

# Usage function
usage() {
    echo "Usage: $0 [backup_file_base_name]"
    echo
    echo "Examples:"
    echo "  $0 aidis_backup_20250912_153000.sql"
    echo "  $0"
    echo
    echo "If no backup file is specified, will use the most recent backup."
    echo
    echo "Available backups:"
    cd "${BACKUP_DIR}" 2>/dev/null || { error "Backup directory not found: ${BACKUP_DIR}"; exit 1; }
    ls -1t aidis_backup_*.sql.backup 2>/dev/null | head -5 | while read backup; do
        base_name=$(echo "$backup" | sed 's/\.backup$//')
        if [[ -f "${base_name}.meta" ]]; then
            backup_date=$(jq -r '.backup_date' "${base_name}.meta" 2>/dev/null || echo "Unknown")
            echo "  ${base_name} (${backup_date})"
        else
            echo "  ${base_name}"
        fi
    done
    exit 1
}

# Confirmation function
confirm() {
    while true; do
        read -p "$1 [y/N]: " yn
        case $yn in
            [Yy]* ) return 0;;
            [Nn]* | "" ) return 1;;
            * ) echo "Please answer yes or no.";;
        esac
    done
}

# Determine backup file to restore
if [[ $# -eq 0 ]]; then
    # No argument provided, use most recent backup
    cd "${BACKUP_DIR}" 2>/dev/null || { error "Backup directory not found: ${BACKUP_DIR}"; exit 1; }
    LATEST_BACKUP=$(ls -1t aidis_backup_*.sql.backup 2>/dev/null | head -1)
    if [[ -z "$LATEST_BACKUP" ]]; then
        error "No backup files found in ${BACKUP_DIR}"
        usage
    fi
    BACKUP_BASE=$(echo "$LATEST_BACKUP" | sed 's/\.backup$//')
    info "Using most recent backup: ${BACKUP_BASE}"
elif [[ $# -eq 1 ]]; then
    BACKUP_BASE="$1"
    # Remove .sql extension if provided
    BACKUP_BASE=$(echo "$BACKUP_BASE" | sed 's/\.sql$//')
else
    error "Too many arguments"
    usage
fi

# Construct full paths
BACKUP_FILE_COMPRESSED="${BACKUP_DIR}/${BACKUP_BASE}.backup"
BACKUP_FILE_SQL="${BACKUP_DIR}/${BACKUP_BASE}.gz"
BACKUP_META="${BACKUP_DIR}/${BACKUP_BASE}.meta"

# Verify backup files exist
if [[ ! -f "$BACKUP_FILE_COMPRESSED" ]]; then
    error "Compressed backup file not found: $BACKUP_FILE_COMPRESSED"
    usage
fi

# Show backup information if metadata exists
if [[ -f "$BACKUP_META" ]]; then
    log "Backup Information:"
    echo "  Date: $(jq -r '.backup_date' "$BACKUP_META" 2>/dev/null || echo "Unknown")"
    echo "  Original DB Size: $(jq -r '.database_size' "$BACKUP_META" 2>/dev/null || echo "Unknown")"
    echo "  Table Count: $(jq -r '.table_count' "$BACKUP_META" 2>/dev/null || echo "Unknown")"
    echo "  PostgreSQL Version: $(jq -r '.pg_version' "$BACKUP_META" 2>/dev/null | cut -d' ' -f1-2 || echo "Unknown")"
    echo
fi

# Final confirmation
warning "This will COMPLETELY REPLACE the current database: ${DB_NAME}"
warning "All current data will be lost!"
echo
if ! confirm "Are you absolutely sure you want to proceed?"; then
    info "Restore cancelled by user"
    exit 0
fi

# Check database connection
log "Testing database connection..."
if ! psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres -c "SELECT 1;" > /dev/null 2>&1; then
    error "Cannot connect to PostgreSQL server"
    exit 1
fi

log "Database connection successful"

# Get current database info before restore
CURRENT_SIZE=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT pg_size_pretty(pg_database_size('${DB_NAME}'));" 2>/dev/null | xargs || echo "Unknown")
CURRENT_TABLES=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs || echo "0")

log "Current database size: ${CURRENT_SIZE}"
log "Current table count: ${CURRENT_TABLES}"

# Terminate active connections to the database
log "Terminating active connections to ${DB_NAME}..."
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres -c "
    SELECT pg_terminate_backend(pid) 
    FROM pg_stat_activity 
    WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();
" > /dev/null 2>&1

# Drop and recreate database
log "Dropping database ${DB_NAME}..."
dropdb -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" "${DB_NAME}" 2>/dev/null || true

log "Creating database ${DB_NAME}..."
createdb -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" "${DB_NAME}"

# Restore from backup
log "Restoring database from backup..."
log "This may take several minutes depending on database size..."

pg_restore -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" \
           --dbname="${DB_NAME}" \
           --verbose \
           --clean \
           --no-owner \
           --no-privileges \
           "${BACKUP_FILE_COMPRESSED}" 2>/dev/null

# Verify restoration
log "Verifying database restoration..."
RESTORED_SIZE=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT pg_size_pretty(pg_database_size('${DB_NAME}'));" | xargs)
RESTORED_TABLES=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | xargs)

log "Database restoration completed!"
log "Restored database size: ${RESTORED_SIZE}"
log "Restored table count: ${RESTORED_TABLES}"

# Run a quick validation query
log "Running validation checks..."
CONTEXT_COUNT=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT COUNT(*) FROM contexts;" 2>/dev/null | xargs || echo "0")
PROJECT_COUNT=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT COUNT(*) FROM projects;" 2>/dev/null | xargs || echo "0")

log "Validation results:"
echo "  Contexts: ${CONTEXT_COUNT}"
echo "  Projects: ${PROJECT_COUNT}"

log "Database restore completed successfully!"
echo
warning "Remember to restart AIDIS services to pick up the restored data:"
echo "  ./restart-aidis.sh"
