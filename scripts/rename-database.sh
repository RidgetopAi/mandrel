#!/bin/bash

# =============================================================================
# Database Rename Migration Script: aidis_production -> mandrel
# =============================================================================
# This script renames the production database from aidis_production to mandrel.
#
# IMPORTANT: This script requires:
#   - PostgreSQL superuser access (typically via sudo -u postgres)
#   - No active connections to aidis_production database
#   - Sufficient disk space for backup (approximately 2x database size)
#
# Usage:
#   ./scripts/rename-database.sh [--dry-run]
#
# Options:
#   --dry-run     Show what would be done without making changes
#   --no-backup   Skip backup step (NOT recommended)
#   --force       Skip confirmation prompts
#
# Exit codes:
#   0 - Migration completed successfully
#   1 - Migration failed or was cancelled
# =============================================================================

set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANDREL_ROOT="$(dirname "$SCRIPT_DIR")"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Database names
OLD_DB_NAME="aidis_production"
NEW_DB_NAME="mandrel"

# Backup location
BACKUP_DIR="${BACKUP_DIR:-/tmp/mandrel-migration}"
BACKUP_FILE="$BACKUP_DIR/${OLD_DB_NAME}_pre_rename_$TIMESTAMP.backup"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Flags
DRY_RUN=false
NO_BACKUP=false
FORCE=false

# =============================================================================
# ARGUMENT PARSING
# =============================================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --no-backup)
            NO_BACKUP=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [--dry-run] [--no-backup] [--force]"
            echo ""
            echo "Options:"
            echo "  --dry-run     Show what would be done without making changes"
            echo "  --no-backup   Skip backup step (NOT recommended)"
            echo "  --force       Skip confirmation prompts"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# =============================================================================
# LOGGING FUNCTIONS
# =============================================================================

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] SUCCESS:${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

step() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}========================================${NC}"
}

dry_run_notice() {
    if $DRY_RUN; then
        echo -e "${YELLOW}[DRY RUN]${NC} $1"
    fi
}

# =============================================================================
# PREFLIGHT CHECKS
# =============================================================================

preflight_checks() {
    step "Preflight Checks"

    # Check if running as root or with sudo capability
    if [[ $EUID -ne 0 ]]; then
        if ! sudo -n true 2>/dev/null; then
            warn "This script may require sudo privileges for PostgreSQL operations"
        fi
    fi

    # Check PostgreSQL is running
    log "Checking PostgreSQL status..."
    if ! pg_isready -h localhost -p 5432 &>/dev/null; then
        error "PostgreSQL is not running on localhost:5432"
        exit 1
    fi
    success "PostgreSQL is running"

    # Check if old database exists
    log "Checking if $OLD_DB_NAME exists..."
    if ! sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "$OLD_DB_NAME"; then
        error "Database '$OLD_DB_NAME' does not exist"
        exit 1
    fi
    success "Database '$OLD_DB_NAME' exists"

    # Check if new database already exists
    log "Checking if $NEW_DB_NAME already exists..."
    if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "$NEW_DB_NAME"; then
        error "Database '$NEW_DB_NAME' already exists. Remove it first or choose a different name."
        exit 1
    fi
    success "Database '$NEW_DB_NAME' does not exist (good)"

    # Check for active connections
    log "Checking for active connections to $OLD_DB_NAME..."
    local conn_count=$(sudo -u postgres psql -t -c "SELECT COUNT(*) FROM pg_stat_activity WHERE datname = '$OLD_DB_NAME' AND pid != pg_backend_pid();" 2>/dev/null | tr -d ' ')
    if [[ "$conn_count" -gt 0 ]]; then
        warn "There are $conn_count active connections to $OLD_DB_NAME"
        echo ""
        echo "Active connections:"
        sudo -u postgres psql -c "SELECT pid, usename, application_name, client_addr, state FROM pg_stat_activity WHERE datname = '$OLD_DB_NAME' AND pid != pg_backend_pid();" 2>/dev/null
        echo ""
        if ! $FORCE; then
            read -p "Do you want to terminate these connections and proceed? (y/N) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                error "Migration cancelled by user"
                exit 1
            fi
        fi
    else
        success "No active connections to $OLD_DB_NAME"
    fi

    # Check disk space for backup
    if ! $NO_BACKUP; then
        log "Checking disk space for backup..."
        local db_size=$(sudo -u postgres psql -t -c "SELECT pg_database_size('$OLD_DB_NAME');" 2>/dev/null | tr -d ' ')
        local backup_dir_free=$(df --output=avail "$BACKUP_DIR" 2>/dev/null | tail -1 || df "$BACKUP_DIR" 2>/dev/null | tail -1 | awk '{print $4}')

        if [[ -n "$db_size" ]]; then
            local db_size_mb=$((db_size / 1024 / 1024))
            log "Database size: ${db_size_mb}MB"
            log "Backup will be created at: $BACKUP_FILE"
        fi
    fi

    success "All preflight checks passed"
}

# =============================================================================
# BACKUP DATABASE
# =============================================================================

backup_database() {
    if $NO_BACKUP; then
        warn "Skipping backup (--no-backup specified)"
        return 0
    fi

    step "Creating Backup"

    if $DRY_RUN; then
        dry_run_notice "Would create backup at: $BACKUP_FILE"
        return 0
    fi

    # Create backup directory
    mkdir -p "$BACKUP_DIR"

    log "Creating backup of $OLD_DB_NAME..."
    log "Backup file: $BACKUP_FILE"

    # Create custom format backup (most flexible for restore)
    if sudo -u postgres pg_dump -Fc -v "$OLD_DB_NAME" > "$BACKUP_FILE" 2>&1; then
        local backup_size=$(du -h "$BACKUP_FILE" | cut -f1)
        success "Backup created successfully ($backup_size)"
    else
        error "Backup failed!"
        exit 1
    fi

    # Verify backup integrity
    log "Verifying backup integrity..."
    if pg_restore -l "$BACKUP_FILE" &>/dev/null; then
        success "Backup integrity verified"
    else
        error "Backup verification failed!"
        exit 1
    fi
}

# =============================================================================
# TERMINATE CONNECTIONS
# =============================================================================

terminate_connections() {
    step "Terminating Connections"

    if $DRY_RUN; then
        dry_run_notice "Would terminate all connections to $OLD_DB_NAME"
        return 0
    fi

    log "Terminating connections to $OLD_DB_NAME..."

    sudo -u postgres psql -c "
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '$OLD_DB_NAME'
        AND pid != pg_backend_pid();
    " 2>/dev/null || true

    # Give connections time to terminate
    sleep 2

    # Verify no connections remain
    local conn_count=$(sudo -u postgres psql -t -c "SELECT COUNT(*) FROM pg_stat_activity WHERE datname = '$OLD_DB_NAME' AND pid != pg_backend_pid();" 2>/dev/null | tr -d ' ')
    if [[ "$conn_count" -gt 0 ]]; then
        error "Failed to terminate all connections"
        exit 1
    fi

    success "All connections terminated"
}

# =============================================================================
# RENAME DATABASE
# =============================================================================

rename_database() {
    step "Renaming Database"

    if $DRY_RUN; then
        dry_run_notice "Would rename $OLD_DB_NAME to $NEW_DB_NAME"
        return 0
    fi

    log "Renaming $OLD_DB_NAME to $NEW_DB_NAME..."

    # PostgreSQL ALTER DATABASE ... RENAME TO requires exclusive access
    if sudo -u postgres psql -c "ALTER DATABASE $OLD_DB_NAME RENAME TO $NEW_DB_NAME;" 2>&1; then
        success "Database renamed to $NEW_DB_NAME"
    else
        error "Failed to rename database"
        exit 1
    fi

    # Verify rename
    log "Verifying database rename..."
    if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "$NEW_DB_NAME"; then
        success "Database $NEW_DB_NAME exists"
    else
        error "Database $NEW_DB_NAME not found after rename"
        exit 1
    fi

    if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "$OLD_DB_NAME"; then
        error "Database $OLD_DB_NAME still exists after rename"
        exit 1
    fi

    success "Database rename verified"
}

# =============================================================================
# VERIFY DATA INTEGRITY
# =============================================================================

verify_data_integrity() {
    step "Verifying Data Integrity"

    if $DRY_RUN; then
        dry_run_notice "Would verify data integrity in $NEW_DB_NAME"
        return 0
    fi

    log "Checking tables in $NEW_DB_NAME..."

    # Get table counts
    local tables=$(sudo -u postgres psql -t -d "$NEW_DB_NAME" -c "
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    " 2>/dev/null | tr -d ' ')

    log "Found $tables tables in $NEW_DB_NAME"

    # Check critical tables exist
    local critical_tables=("contexts" "projects" "technical_decisions" "tasks" "sessions")
    for table in "${critical_tables[@]}"; do
        if sudo -u postgres psql -t -d "$NEW_DB_NAME" -c "SELECT 1 FROM information_schema.tables WHERE table_name = '$table';" 2>/dev/null | grep -q 1; then
            log "  - Table '$table' exists"
        else
            warn "  - Table '$table' not found (may be expected if not yet created)"
        fi
    done

    # Check extensions
    log "Checking PostgreSQL extensions..."
    local extensions=$(sudo -u postgres psql -t -d "$NEW_DB_NAME" -c "SELECT extname FROM pg_extension WHERE extname IN ('vector', 'pg_trgm', 'pgcrypto', 'uuid-ossp');" 2>/dev/null | tr -d ' ')
    echo "$extensions" | while read -r ext; do
        if [[ -n "$ext" ]]; then
            log "  - Extension '$ext' installed"
        fi
    done

    success "Data integrity checks passed"
}

# =============================================================================
# PRINT SUMMARY
# =============================================================================

print_summary() {
    step "Migration Summary"

    if $DRY_RUN; then
        echo ""
        echo -e "${YELLOW}=== DRY RUN COMPLETE ===${NC}"
        echo ""
        echo "This was a dry run. No changes were made."
        echo ""
        echo "The following actions would be performed:"
        echo "  1. Create backup at: $BACKUP_FILE"
        echo "  2. Terminate connections to $OLD_DB_NAME"
        echo "  3. Rename database: $OLD_DB_NAME -> $NEW_DB_NAME"
        echo "  4. Verify data integrity"
        echo ""
        echo "To perform the actual migration, run:"
        echo "  $0"
        echo ""
        return 0
    fi

    echo ""
    echo -e "${GREEN}=== MIGRATION COMPLETE ===${NC}"
    echo ""
    echo "Database has been renamed:"
    echo "  OLD: $OLD_DB_NAME"
    echo "  NEW: $NEW_DB_NAME"
    echo ""
    if ! $NO_BACKUP; then
        echo "Backup created at:"
        echo "  $BACKUP_FILE"
        echo ""
        echo "To restore from backup (if needed):"
        echo "  sudo -u postgres createdb $OLD_DB_NAME"
        echo "  sudo -u postgres pg_restore -d $OLD_DB_NAME $BACKUP_FILE"
        echo ""
    fi
    echo "IMPORTANT: Next steps required:"
    echo ""
    echo "  1. Update all .env files to use DATABASE_NAME=$NEW_DB_NAME"
    echo "  2. Restart all services:"
    echo "     sudo systemctl restart mandrel"
    echo "     sudo systemctl restart mandrel-command"
    echo "  3. Verify services are working:"
    echo "     curl http://localhost:8080/health"
    echo ""
    echo "If you encounter issues, restore from backup:"
    echo "  sudo -u postgres createdb $OLD_DB_NAME"
    echo "  sudo -u postgres pg_restore -d $OLD_DB_NAME $BACKUP_FILE"
    echo "  sudo -u postgres dropdb $NEW_DB_NAME"
    echo ""
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    echo ""
    echo "=============================================="
    echo "  Database Rename Migration"
    echo "  $OLD_DB_NAME -> $NEW_DB_NAME"
    echo "=============================================="
    echo ""

    if $DRY_RUN; then
        echo -e "${YELLOW}DRY RUN MODE - No changes will be made${NC}"
        echo ""
    fi

    # Confirmation
    if ! $FORCE && ! $DRY_RUN; then
        echo "This script will:"
        echo "  1. Backup $OLD_DB_NAME"
        echo "  2. Terminate all connections"
        echo "  3. Rename $OLD_DB_NAME to $NEW_DB_NAME"
        echo ""
        read -p "Are you sure you want to proceed? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            error "Migration cancelled by user"
            exit 1
        fi
    fi

    # Run migration steps
    preflight_checks
    backup_database
    terminate_connections
    rename_database
    verify_data_integrity
    print_summary

    if ! $DRY_RUN; then
        success "Migration completed successfully!"
    fi
}

# Run main function
main "$@"
