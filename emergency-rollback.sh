#!/bin/bash
# AIDIS EMERGENCY ROLLBACK SCRIPT
# Complete system rollback to pre-refactor baseline in <10 minutes
# Created for TR0011 - Final Phase 0 safety infrastructure

set -e  # Exit on any error

# Configuration
BASELINE_TAG="pre-refactor-baseline-2025-09-12"
BASELINE_BACKUP="aidis_backup_20250912_162614.sql"
AIDIS_ROOT="/home/ridgetop/aidis"
ROLLBACK_LOG="${AIDIS_ROOT}/logs/emergency-rollback-$(date +%Y%m%d_%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging function
log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo -e "${GREEN}${msg}${NC}"
    echo "${msg}" >> "${ROLLBACK_LOG}"
}

error() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1"
    echo -e "${RED}${msg}${NC}" >&2
    echo "${msg}" >> "${ROLLBACK_LOG}"
}

warning() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $1"
    echo -e "${YELLOW}${msg}${NC}"
    echo "${msg}" >> "${ROLLBACK_LOG}"
}

info() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] INFO: $1"
    echo -e "${BLUE}${msg}${NC}"
    echo "${msg}" >> "${ROLLBACK_LOG}"
}

# Timer functions
start_timer() {
    TIMER_START=$(date +%s)
}

show_timer() {
    local current=$(date +%s)
    local elapsed=$((current - TIMER_START))
    local minutes=$((elapsed / 60))
    local seconds=$((elapsed % 60))
    info "Elapsed time: ${minutes}m ${seconds}s"
}

# Confirmation function
confirm_emergency() {
    echo
    echo -e "${RED}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                 EMERGENCY ROLLBACK                     ║${NC}"
    echo -e "${RED}║                                                        ║${NC}"
    echo -e "${RED}║  This will COMPLETELY ROLLBACK the AIDIS system to:   ║${NC}"
    echo -e "${RED}║  • Git tag: ${BASELINE_TAG}      ║${NC}"
    echo -e "${RED}║  • Database backup: ${BASELINE_BACKUP}  ║${NC}"
    echo -e "${RED}║                                                        ║${NC}"
    echo -e "${RED}║  ALL CURRENT WORK WILL BE LOST!                       ║${NC}"
    echo -e "${RED}║                                                        ║${NC}"
    echo -e "${RED}║  This action cannot be undone.                        ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════╝${NC}"
    echo

    read -p "Type 'EMERGENCY ROLLBACK' to confirm: " confirmation
    if [[ "$confirmation" != "EMERGENCY ROLLBACK" ]]; then
        error "Emergency rollback cancelled - confirmation failed"
        exit 1
    fi
}

# Pre-flight checks
preflight_checks() {
    log "Running pre-flight checks..."

    # Check we're in AIDIS root
    if [[ ! -f "${AIDIS_ROOT}/package.json" ]] || [[ ! -d "${AIDIS_ROOT}/mcp-server" ]]; then
        error "Not in AIDIS root directory: ${AIDIS_ROOT}"
        exit 1
    fi

    # Check git repository status
    cd "${AIDIS_ROOT}"
    if [[ ! -d .git ]]; then
        error "Not a git repository"
        exit 1
    fi

    # Check baseline tag exists
    if ! git tag --list | grep -q "^${BASELINE_TAG}$"; then
        error "Baseline tag not found: ${BASELINE_TAG}"
        exit 1
    fi

    # Check backup file exists
    if [[ ! -f "${AIDIS_ROOT}/backups/${BASELINE_BACKUP}.backup" ]]; then
        error "Baseline backup not found: ${AIDIS_ROOT}/backups/${BASELINE_BACKUP}.backup"
        exit 1
    fi

    # Check database connectivity
    if ! psql -h localhost -p 5432 -U ridgetop -d postgres -c "SELECT 1;" > /dev/null 2>&1; then
        error "Cannot connect to PostgreSQL server"
        exit 1
    fi

    # Ensure logs directory exists
    mkdir -p "${AIDIS_ROOT}/logs"

    log "Pre-flight checks passed"
}

# Step 1: Stop all services
stop_services() {
    log "Step 1/4: Stopping all AIDIS services..."
    
    # Use dedicated service rollback script
    if [[ -f "${AIDIS_ROOT}/rollback-services.sh" ]]; then
        "${AIDIS_ROOT}/rollback-services.sh" || warning "Service stop encountered issues"
    else
        # Fallback service stop
        "${AIDIS_ROOT}/stop-aidis.sh" || true
        sleep 2
        
        # Kill any remaining AIDIS processes
        pkill -f "tsx.*src/server.ts" || true
        pkill -f "node.*server" || true
        sleep 1
    fi
    
    log "Services stopped"
    show_timer
}

# Step 2: Git rollback
git_rollback() {
    log "Step 2/4: Rolling back git repository..."
    cd "${AIDIS_ROOT}"
    
    # Stash any uncommitted changes
    if ! git diff --quiet || ! git diff --staged --quiet; then
        warning "Stashing uncommitted changes..."
        git stash push -m "Emergency rollback stash $(date)"
    fi
    
    # Hard reset to baseline tag
    log "Resetting to baseline tag: ${BASELINE_TAG}"
    git reset --hard "${BASELINE_TAG}"
    
    # Clean untracked files
    git clean -fd
    
    log "Git rollback completed"
    show_timer
}

# Step 3: Database rollback
database_rollback() {
    log "Step 3/4: Rolling back database..."
    
    # Use dedicated database rollback script
    if [[ -f "${AIDIS_ROOT}/rollback-database.sh" ]]; then
        "${AIDIS_ROOT}/rollback-database.sh" "${BASELINE_BACKUP}" || {
            error "Database rollback failed"
            exit 1
        }
    else
        error "Database rollback script not found"
        exit 1
    fi
    
    log "Database rollback completed"
    show_timer
}

# Step 4: Restart services and verify
restart_and_verify() {
    log "Step 4/4: Restarting services and verifying..."
    
    # Restart services
    log "Starting AIDIS services..."
    "${AIDIS_ROOT}/start-aidis.sh" || {
        error "Failed to start services"
        exit 1
    }
    
    # Wait for services to stabilize
    sleep 5
    
    # Run health check
    if [[ -f "${AIDIS_ROOT}/health-check.sh" ]]; then
        log "Running comprehensive health check..."
        "${AIDIS_ROOT}/health-check.sh" || {
            warning "Health check failed - manual verification needed"
        }
    else
        # Basic health check
        log "Running basic health check..."
        "${AIDIS_ROOT}/status-aidis.sh"
    fi
    
    log "Services restarted and verified"
    show_timer
}

# Main execution
main() {
    echo -e "${YELLOW}AIDIS Emergency Rollback Script${NC}"
    echo "Target baseline: ${BASELINE_TAG}"
    echo "Target backup: ${BASELINE_BACKUP}"
    echo

    start_timer

    # Safety confirmation
    confirm_emergency

    # Initialize logging
    log "Starting emergency rollback procedure..."
    log "Logging to: ${ROLLBACK_LOG}"

    # Execute rollback steps
    preflight_checks
    stop_services
    git_rollback
    database_rollback
    restart_and_verify

    # Final status
    echo
    log "🎉 EMERGENCY ROLLBACK COMPLETED SUCCESSFULLY!"
    show_timer
    
    local total_elapsed=$(($(date +%s) - TIMER_START))
    if [[ ${total_elapsed} -lt 600 ]]; then  # 10 minutes
        log "✅ Rollback completed within 10-minute target (${total_elapsed}s)"
    else
        warning "⚠️  Rollback took longer than 10-minute target (${total_elapsed}s)"
    fi
    
    echo
    log "System has been rolled back to baseline state."
    log "Verify all functionality before resuming development."
    log "Rollback log saved to: ${ROLLBACK_LOG}"
}

# Handle interruption
trap 'error "Emergency rollback interrupted!"; exit 130' INT TERM

# Execute main function
main "$@"
