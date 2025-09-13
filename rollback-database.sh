#!/bin/bash
# AIDIS Database Rollback Script
# Database-only rollback using existing backups
# Created for TR0011 - Emergency rollback procedures

set -e  # Exit on any error

# Configuration
BACKUP_DIR="/home/ridgetop/aidis/backups"
DB_NAME="aidis_production"
DB_HOST="localhost"
DB_PORT="5432"
DB_USER="ridgetop"
TARGET_BACKUP="aidis_backup_20250912_162614.sql"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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
    echo "  $0 ${TARGET_BACKUP}"
    echo "  $0  # Uses default target backup"
    echo
    echo "This script performs database-only rollback for emergency situations."
    echo "It uses the existing restore-database.sh script with automatic confirmation."
    exit 1
}

# Main execution
main() {
    local backup_file="$1"
    
    # Use target backup if no argument provided
    if [[ -z "$backup_file" ]]; then
        backup_file="${TARGET_BACKUP}"
        info "Using default target backup: ${backup_file}"
    fi
    
    log "Starting database rollback..."
    log "Target backup: ${backup_file}"
    
    # Verify backup exists
    local backup_path="${BACKUP_DIR}/${backup_file}.backup"
    if [[ ! -f "$backup_path" ]]; then
        error "Backup file not found: $backup_path"
        exit 1
    fi
    
    log "Backup file verified: $backup_path"
    
    # Check if this is called from emergency rollback (no interaction needed)
    if [[ "${EMERGENCY_ROLLBACK:-}" == "true" ]]; then
        log "Emergency rollback mode - proceeding without confirmation"
        
        # Call restore script with automated responses
        echo "y" | "${BACKUP_DIR}/../scripts/restore-database.sh" "${backup_file}" 2>/dev/null || {
            # If piping doesn't work, use expect if available, or manual override
            if command -v expect > /dev/null; then
                expect << EOF
spawn ${BACKUP_DIR}/../scripts/restore-database.sh ${backup_file}
expect "Are you absolutely sure you want to proceed?" { send "y\r" }
expect eof
EOF
            else
                # Direct call to restore script components
                log "Performing direct database restore..."
                perform_direct_restore "${backup_file}"
            fi
        }
    else
        # Interactive mode - call restore script normally
        log "Interactive mode - calling restore script"
        "${BACKUP_DIR}/../scripts/restore-database.sh" "${backup_file}"
    fi
    
    log "Database rollback completed successfully"
}

# Direct restore function (bypass interactive restore script)
perform_direct_restore() {
    local backup_base="$1"
    local backup_file="${BACKUP_DIR}/${backup_base}.backup"
    
    log "Performing direct database restore..."
    
    # Test database connection
    log "Testing database connection..."
    if ! psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres -c "SELECT 1;" > /dev/null 2>&1; then
        error "Cannot connect to PostgreSQL server"
        exit 1
    fi
    
    # Terminate active connections
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
    pg_restore -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" \
               --dbname="${DB_NAME}" \
               --verbose \
               --clean \
               --no-owner \
               --no-privileges \
               "${backup_file}" 2>/dev/null
    
    # Quick verification
    log "Verifying database restoration..."
    local table_count=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | xargs)
    local context_count=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT COUNT(*) FROM contexts;" 2>/dev/null | xargs || echo "0")
    
    log "Verification results:"
    echo "  Tables: ${table_count}"
    echo "  Contexts: ${context_count}"
}

# Set emergency rollback mode if called from emergency script
if [[ "${1}" == "--emergency" ]]; then
    export EMERGENCY_ROLLBACK="true"
    shift
fi

# Execute main function
main "$@"
