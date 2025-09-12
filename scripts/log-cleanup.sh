#!/bin/bash
# AIDIS Log Cleanup Automation
# Automated cleanup of old logs to prevent disk issues

set -euo pipefail

AIDIS_ROOT="/home/ridgetop/aidis"
LOGS_DIR="$AIDIS_ROOT/logs"

cd "$AIDIS_ROOT"

# Default cleanup policies (can be overridden with environment variables)
CLEANUP_ARCHIVES_DAYS=${CLEANUP_ARCHIVES_DAYS:-90}    # Keep archived logs for 90 days
CLEANUP_ROTATED_DAYS=${CLEANUP_ROTATED_DAYS:-30}      # Keep rotated logs for 30 days
CLEANUP_ERROR_LOGS_DAYS=${CLEANUP_ERROR_LOGS_DAYS:-180} # Keep error logs longer
MAX_LOG_SIZE_MB=${MAX_LOG_SIZE_MB:-500}                # Max size for active logs
MAX_TOTAL_SIZE_GB=${MAX_TOTAL_SIZE_GB:-5}              # Max total size for all logs

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOGS_DIR/system/cleanup.log"
}

show_help() {
    cat << EOF
🧹 AIDIS Log Cleanup Tool

Usage: $0 [OPTIONS] [COMMAND]

Commands:
    auto        Run automatic cleanup with default policies (default)
    manual      Interactive cleanup with confirmations  
    dry-run     Show what would be cleaned without doing it
    emergency   Aggressive cleanup for disk space emergencies
    status      Show current disk usage and cleanup potential
    
Options:
    --archives-days N      Keep archived logs for N days (default: $CLEANUP_ARCHIVES_DAYS)
    --rotated-days N       Keep rotated logs for N days (default: $CLEANUP_ROTATED_DAYS)  
    --error-logs-days N    Keep error logs for N days (default: $CLEANUP_ERROR_LOGS_DAYS)
    --max-size-gb N        Max total size in GB (default: $MAX_TOTAL_SIZE_GB)
    --help                 Show this help

Examples:
    $0 auto                           # Run with defaults
    $0 --archives-days 60 auto        # Keep archives for 60 days
    $0 dry-run                        # Preview cleanup
    $0 emergency                      # Aggressive cleanup
    
Environment Variables:
    CLEANUP_ARCHIVES_DAYS     Days to keep archived logs
    CLEANUP_ROTATED_DAYS      Days to keep rotated logs
    CLEANUP_ERROR_LOGS_DAYS   Days to keep error logs
    MAX_TOTAL_SIZE_GB         Maximum total log size in GB
EOF
}

get_size_mb() {
    local path="$1"
    if [ -e "$path" ]; then
        du -sm "$path" 2>/dev/null | cut -f1
    else
        echo 0
    fi
}

get_size_gb() {
    local path="$1"
    if [ -e "$path" ]; then
        echo "scale=2; $(du -sm "$path" 2>/dev/null | cut -f1) / 1024" | bc
    else
        echo "0.00"
    fi
}

show_status() {
    log_message "=== Log Disk Usage Status ==="
    
    echo -e "${GREEN}📊 Current Status:${NC}"
    echo "  Total logs size: $(get_size_gb "$LOGS_DIR")GB"
    echo "  Archive size: $(get_size_gb "$LOGS_DIR/archive")GB"
    echo "  Active logs: $(find "$LOGS_DIR" -maxdepth 1 -name "*.log" 2>/dev/null | wc -l) files"
    echo "  Archived logs: $(find "$LOGS_DIR/archive" -name "*.gz" 2>/dev/null | wc -l) files"
    
    echo
    echo -e "${GREEN}🔍 Cleanup Potential:${NC}"
    
    # Show what would be cleaned with current policies
    local old_archives
    old_archives=$(find "$LOGS_DIR/archive" -name "*.gz" -mtime +$CLEANUP_ARCHIVES_DAYS 2>/dev/null | wc -l)
    if [ "$old_archives" -gt 0 ]; then
        local archive_size
        archive_size=$(find "$LOGS_DIR/archive" -name "*.gz" -mtime +$CLEANUP_ARCHIVES_DAYS 2>/dev/null -exec du -cm {} + | tail -1 | cut -f1)
        echo "  Old archives (>$CLEANUP_ARCHIVES_DAYS days): $old_archives files (${archive_size}MB)"
    fi
    
    local old_rotated
    old_rotated=$(find "$LOGS_DIR" -name "*.log.*" -mtime +$CLEANUP_ROTATED_DAYS 2>/dev/null | wc -l)
    if [ "$old_rotated" -gt 0 ]; then
        echo "  Old rotated logs (>$CLEANUP_ROTATED_DAYS days): $old_rotated files"
    fi
    
    # Show large files
    echo
    echo -e "${GREEN}📋 Largest Files:${NC}"
    find "$LOGS_DIR" -type f \( -name "*.log" -o -name "*.gz" \) 2>/dev/null | xargs ls -lah 2>/dev/null | sort -k5 -hr | head -10
}

cleanup_archived_logs() {
    local days="$1"
    local dry_run="$2"
    
    log_message "Cleaning up archived logs older than $days days"
    
    local files_to_delete
    files_to_delete=$(find "$LOGS_DIR/archive" -name "*.gz" -mtime +$days 2>/dev/null)
    
    if [ -z "$files_to_delete" ]; then
        log_message "No archived logs to clean up"
        return 0
    fi
    
    local file_count
    file_count=$(echo "$files_to_delete" | wc -l)
    
    local total_size=0
    while IFS= read -r file; do
        local file_size
        file_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
        total_size=$((total_size + file_size))
    done <<< "$files_to_delete"
    
    local total_size_mb=$((total_size / 1024 / 1024))
    
    if [ "$dry_run" = "true" ]; then
        echo -e "${YELLOW}[DRY RUN] Would delete $file_count archived log files (${total_size_mb}MB)${NC}"
        echo "$files_to_delete" | head -5
        [ $file_count -gt 5 ] && echo "... and $((file_count - 5)) more files"
        return 0
    fi
    
    log_message "Deleting $file_count archived log files (${total_size_mb}MB)"
    
    echo "$files_to_delete" | while IFS= read -r file; do
        rm -f "$file"
    done
    
    log_message "Archived log cleanup completed"
    return 0
}

cleanup_rotated_logs() {
    local days="$1"
    local dry_run="$2"
    
    log_message "Cleaning up rotated logs older than $days days"
    
    # Look for rotated logs (with date extensions or .1, .2, etc)
    local files_to_delete
    files_to_delete=$(find "$LOGS_DIR" -name "*.log.*" -mtime +$days 2>/dev/null)
    
    if [ -z "$files_to_delete" ]; then
        log_message "No rotated logs to clean up"
        return 0
    fi
    
    local file_count
    file_count=$(echo "$files_to_delete" | wc -l)
    
    if [ "$dry_run" = "true" ]; then
        echo -e "${YELLOW}[DRY RUN] Would delete $file_count rotated log files${NC}"
        echo "$files_to_delete" | head -5
        [ $file_count -gt 5 ] && echo "... and $((file_count - 5)) more files"
        return 0
    fi
    
    log_message "Deleting $file_count rotated log files"
    echo "$files_to_delete" | while IFS= read -r file; do
        rm -f "$file"
    done
    
    log_message "Rotated log cleanup completed"
    return 0
}

cleanup_large_active_logs() {
    local max_size_mb="$1"
    local dry_run="$2"
    
    log_message "Checking for oversized active logs (>${max_size_mb}MB)"
    
    local large_files
    large_files=$(find "$LOGS_DIR" -maxdepth 1 -name "*.log" -size +${max_size_mb}M 2>/dev/null)
    
    if [ -z "$large_files" ]; then
        log_message "No oversized active logs found"
        return 0
    fi
    
    while IFS= read -r file; do
        local file_size
        file_size=$(ls -lah "$file" | awk '{print $5}')
        
        if [ "$dry_run" = "true" ]; then
            echo -e "${YELLOW}[DRY RUN] Would truncate large log file: $file ($file_size)${NC}"
            continue
        fi
        
        log_message "Truncating large log file: $file ($file_size)"
        
        # Keep last 1000 lines and truncate
        local temp_file
        temp_file=$(mktemp)
        tail -1000 "$file" > "$temp_file" && mv "$temp_file" "$file"
        
        log_message "Truncated $file to last 1000 lines"
        
    done <<< "$large_files"
    
    return 0
}

emergency_cleanup() {
    local dry_run="$1"
    
    log_message "=== EMERGENCY CLEANUP MODE ==="
    
    if [ "$dry_run" != "true" ]; then
        echo -e "${RED}⚠️  EMERGENCY CLEANUP - This will aggressively remove logs!${NC}"
        echo "This will:"
        echo "  - Remove all archived logs older than 7 days"
        echo "  - Remove all rotated logs older than 7 days" 
        echo "  - Truncate active logs larger than 50MB"
        echo "  - Remove old debug and temp files"
        echo
        read -p "Continue with emergency cleanup? (yes/NO): " -r
        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            echo "Emergency cleanup cancelled"
            return 1
        fi
    fi
    
    # Aggressive cleanup
    cleanup_archived_logs 7 "$dry_run"
    cleanup_rotated_logs 7 "$dry_run"
    cleanup_large_active_logs 50 "$dry_run"
    
    # Remove debug files
    local debug_files
    debug_files=$(find "$LOGS_DIR" -name "debug_*" -o -name "tmp_*" -o -name "*.tmp" 2>/dev/null)
    
    if [ -n "$debug_files" ]; then
        local file_count
        file_count=$(echo "$debug_files" | wc -l)
        
        if [ "$dry_run" = "true" ]; then
            echo -e "${YELLOW}[DRY RUN] Would delete $file_count debug/temp files${NC}"
        else
            log_message "Removing $file_count debug/temp files"
            echo "$debug_files" | while IFS= read -r file; do
                rm -f "$file"
            done
        fi
    fi
    
    if [ "$dry_run" != "true" ]; then
        log_message "Emergency cleanup completed"
    fi
}

check_total_size() {
    local max_size_gb="$1"
    local dry_run="$2"
    
    local current_size_gb
    current_size_gb=$(get_size_gb "$LOGS_DIR")
    
    log_message "Total log size check: ${current_size_gb}GB (limit: ${max_size_gb}GB)"
    
    if [ "$(echo "$current_size_gb > $max_size_gb" | bc)" -eq 1 ]; then
        log_message "Total log size exceeds limit - additional cleanup needed"
        
        if [ "$dry_run" = "true" ]; then
            echo -e "${YELLOW}[DRY RUN] Would run additional cleanup due to size limit${NC}"
        else
            echo -e "${YELLOW}⚠️  Log directory size (${current_size_gb}GB) exceeds limit (${max_size_gb}GB)${NC}"
            echo "Running additional cleanup..."
            
            # More aggressive cleanup
            cleanup_archived_logs $((CLEANUP_ARCHIVES_DAYS / 2)) false
            cleanup_rotated_logs $((CLEANUP_ROTATED_DAYS / 2)) false
            cleanup_large_active_logs $((MAX_LOG_SIZE_MB / 2)) false
        fi
    else
        log_message "Total log size is within limits"
    fi
}

run_auto_cleanup() {
    local dry_run="${1:-false}"
    
    log_message "=== Starting automatic log cleanup ==="
    log_message "Policies: Archives($CLEANUP_ARCHIVES_DAYS days), Rotated($CLEANUP_ROTATED_DAYS days), Errors($CLEANUP_ERROR_LOGS_DAYS days)"
    
    # Create system log directory
    mkdir -p "$LOGS_DIR/system"
    
    # Run cleanup tasks
    cleanup_archived_logs "$CLEANUP_ARCHIVES_DAYS" "$dry_run"
    cleanup_rotated_logs "$CLEANUP_ROTATED_DAYS" "$dry_run"  
    cleanup_large_active_logs "$MAX_LOG_SIZE_MB" "$dry_run"
    check_total_size "$MAX_TOTAL_SIZE_GB" "$dry_run"
    
    if [ "$dry_run" != "true" ]; then
        log_message "Automatic log cleanup completed"
        
        # Update cleanup timestamp
        echo "last_cleanup=$(date +%s)" > "$LOGS_DIR/.cleanup.state"
        
        # Generate cleanup report
        local final_size
        final_size=$(get_size_gb "$LOGS_DIR")
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Cleanup completed, final size: ${final_size}GB" >> "$LOGS_DIR/system/cleanup-summary.log"
    fi
}

run_manual_cleanup() {
    echo -e "${GREEN}🧹 Manual Log Cleanup${NC}"
    echo
    
    show_status
    echo
    
    echo "Select cleanup actions:"
    echo "1) Clean archived logs (>$CLEANUP_ARCHIVES_DAYS days)"
    echo "2) Clean rotated logs (>$CLEANUP_ROTATED_DAYS days)"  
    echo "3) Truncate large active logs (>${MAX_LOG_SIZE_MB}MB)"
    echo "4) Run full automatic cleanup"
    echo "5) Emergency cleanup (aggressive)"
    echo "6) Just show what would be done (dry run)"
    echo "0) Exit"
    
    read -p "Enter choice (0-6): " -n 1 -r choice
    echo
    
    case $choice in
        1) cleanup_archived_logs "$CLEANUP_ARCHIVES_DAYS" false ;;
        2) cleanup_rotated_logs "$CLEANUP_ROTATED_DAYS" false ;;
        3) cleanup_large_active_logs "$MAX_LOG_SIZE_MB" false ;;
        4) run_auto_cleanup false ;;
        5) emergency_cleanup false ;;
        6) run_auto_cleanup true ;;
        0) echo "Cleanup cancelled" ;;
        *) echo "Invalid choice" ;;
    esac
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --archives-days)
            CLEANUP_ARCHIVES_DAYS="$2"
            shift 2
            ;;
        --rotated-days)
            CLEANUP_ROTATED_DAYS="$2"
            shift 2
            ;;
        --error-logs-days)
            CLEANUP_ERROR_LOGS_DAYS="$2"
            shift 2
            ;;
        --max-size-gb)
            MAX_TOTAL_SIZE_GB="$2"
            shift 2
            ;;
        --help)
            show_help
            exit 0
            ;;
        auto|manual|dry-run|emergency|status)
            COMMAND="$1"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Default command
COMMAND="${COMMAND:-auto}"

# Execute command
case "$COMMAND" in
    auto)
        run_auto_cleanup false
        ;;
    manual)
        run_manual_cleanup
        ;;
    dry-run)
        echo -e "${BLUE}🔍 Dry Run Mode - No files will be deleted${NC}"
        echo
        run_auto_cleanup true
        ;;
    emergency)
        emergency_cleanup false
        ;;
    status)
        show_status
        ;;
    *)
        echo "Unknown command: $COMMAND"
        show_help
        exit 1
        ;;
esac
