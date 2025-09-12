#!/bin/bash
# AIDIS Backup Verification Script
# Created for TR0004 - Refactoring safety infrastructure

set -e  # Exit on any error

# Configuration
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
    echo "If no backup file is specified, will verify the most recent backup."
    exit 1
}

# Function to verify compressed backup integrity
verify_compressed_backup() {
    local backup_file="$1"
    
    log "Verifying compressed backup: $(basename "$backup_file")"
    
    # Check if file exists and is not empty
    if [[ ! -s "$backup_file" ]]; then
        error "Backup file is missing or empty"
        return 1
    fi
    
    # Try to list contents of pg_restore backup
    if pg_restore --list "$backup_file" > /dev/null 2>&1; then
        info "✅ Compressed backup format is valid"
        
        # Count tables and data in backup
        local table_count=$(pg_restore --list "$backup_file" 2>/dev/null | grep -c "^[0-9].*; [0-9]* [0-9]* TABLE" || echo "0")
        local data_count=$(pg_restore --list "$backup_file" 2>/dev/null | grep -c "^[0-9].*; [0-9]* [0-9]* TABLE DATA" || echo "0")
        
        info "   Tables: ${table_count}"
        info "   Data sections: ${data_count}"
        
        return 0
    else
        error "Compressed backup appears to be corrupted"
        return 1
    fi
}

# Function to verify SQL backup integrity
verify_sql_backup() {
    local backup_file="$1"
    
    log "Verifying SQL backup: $(basename "$backup_file")"
    
    # Check if file exists and is not empty
    if [[ ! -s "$backup_file" ]]; then
        error "SQL backup file is missing or empty"
        return 1
    fi
    
    # Try to decompress and check SQL validity
    if zcat "$backup_file" 2>/dev/null | head -20 | grep -q "PostgreSQL database dump"; then
        info "✅ SQL backup format is valid"
        
        # Count CREATE TABLE statements
        local table_count=$(zcat "$backup_file" 2>/dev/null | grep -c "^CREATE TABLE" || echo "0")
        local copy_count=$(zcat "$backup_file" 2>/dev/null | grep -c "^COPY " || echo "0")
        
        info "   CREATE TABLE statements: ${table_count}"
        info "   COPY statements: ${copy_count}"
        
        return 0
    else
        error "SQL backup appears to be corrupted or not a PostgreSQL dump"
        return 1
    fi
}

# Function to verify backup metadata
verify_metadata() {
    local meta_file="$1"
    
    if [[ -f "$meta_file" ]]; then
        log "Verifying backup metadata: $(basename "$meta_file")"
        
        if jq empty "$meta_file" 2>/dev/null; then
            info "✅ Metadata is valid JSON"
            
            # Display key metadata
            local backup_date=$(jq -r '.backup_date' "$meta_file" 2>/dev/null || echo "Unknown")
            local db_size=$(jq -r '.database_size' "$meta_file" 2>/dev/null || echo "Unknown")
            local table_count=$(jq -r '.table_count' "$meta_file" 2>/dev/null || echo "Unknown")
            
            info "   Backup Date: ${backup_date}"
            info "   Database Size: ${db_size}"
            info "   Table Count: ${table_count}"
            
            return 0
        else
            error "Metadata file contains invalid JSON"
            return 1
        fi
    else
        warning "Metadata file not found"
        return 1
    fi
}

# Main verification logic
main() {
    log "Starting AIDIS backup verification..."
    
    # Determine backup file to verify
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
    
    log "Backup files to verify:"
    echo "  Compressed: ${BACKUP_FILE_COMPRESSED}"
    echo "  SQL: ${BACKUP_FILE_SQL}"
    echo "  Metadata: ${BACKUP_META}"
    echo
    
    # Track verification results
    local compressed_ok=false
    local sql_ok=false
    local meta_ok=false
    
    # Verify compressed backup
    if verify_compressed_backup "$BACKUP_FILE_COMPRESSED"; then
        compressed_ok=true
    fi
    
    echo
    
    # Verify SQL backup
    if verify_sql_backup "$BACKUP_FILE_SQL"; then
        sql_ok=true
    fi
    
    echo
    
    # Verify metadata
    if verify_metadata "$BACKUP_META"; then
        meta_ok=true
    fi
    
    echo
    
    # Summary
    log "Verification Summary:"
    echo -e "  Compressed backup: $($compressed_ok && echo -e "${GREEN}✅ PASSED${NC}" || echo -e "${RED}❌ FAILED${NC}")"
    echo -e "  SQL backup: $($sql_ok && echo -e "${GREEN}✅ PASSED${NC}" || echo -e "${RED}❌ FAILED${NC}")"
    echo -e "  Metadata: $($meta_ok && echo -e "${GREEN}✅ PASSED${NC}" || echo -e "${YELLOW}⚠️  MISSING${NC}")"
    
    # Overall result
    if $compressed_ok && $sql_ok; then
        log "🎉 Backup verification PASSED - Backup is ready for restore"
        return 0
    else
        error "🚨 Backup verification FAILED - Backup may not be usable"
        return 1
    fi
}

# Run main function
main "$@"
