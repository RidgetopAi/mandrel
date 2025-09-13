#!/bin/bash
# AIDIS Service Rollback Script
# Clean service stop and restart for emergency rollback
# Created for TR0011 - Emergency rollback procedures

set -e  # Exit on any error

# Configuration
AIDIS_ROOT="/home/ridgetop/aidis"
PID_FILE="${AIDIS_ROOT}/logs/aidis.pid"
TIMEOUT_SECONDS=30

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

# Check if process is running
is_process_running() {
    local pid="$1"
    [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

# Wait for process to stop
wait_for_stop() {
    local pid="$1"
    local timeout="$2"
    local count=0
    
    while is_process_running "$pid" && [[ $count -lt $timeout ]]; do
        sleep 1
        count=$((count + 1))
    done
    
    ! is_process_running "$pid"
}

# Stop AIDIS services
stop_services() {
    log "Stopping AIDIS services..."
    
    # Method 1: Use standard stop script
    if [[ -f "${AIDIS_ROOT}/stop-aidis.sh" ]]; then
        log "Using standard stop script..."
        cd "${AIDIS_ROOT}"
        ./stop-aidis.sh || warning "Standard stop script failed"
        sleep 2
    fi
    
    # Method 2: Check PID file and stop gracefully
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
        if [[ -n "$pid" ]] && is_process_running "$pid"; then
            log "Stopping AIDIS process (PID: $pid) gracefully..."
            kill "$pid" 2>/dev/null || true
            
            if wait_for_stop "$pid" "$TIMEOUT_SECONDS"; then
                log "Process stopped gracefully"
            else
                warning "Process did not stop gracefully, forcing..."
                kill -9 "$pid" 2>/dev/null || true
                sleep 1
            fi
        fi
        rm -f "$PID_FILE"
    fi
    
    # Method 3: Find and kill any remaining AIDIS processes
    log "Checking for remaining AIDIS processes..."
    local aidis_pids=$(ps aux | grep -E "(tsx.*src/server\.ts|aidis.*server\.ts)" | grep -v grep | awk '{print $2}' || true)
    
    if [[ -n "$aidis_pids" ]]; then
        warning "Found remaining AIDIS processes: $aidis_pids"
        echo "$aidis_pids" | xargs -r kill -TERM 2>/dev/null || true
        sleep 2
        
        # Check if any are still running and force kill
        local remaining_pids=$(ps aux | grep -E "(tsx.*src/server\.ts|aidis.*server\.ts)" | grep -v grep | awk '{print $2}' || true)
        if [[ -n "$remaining_pids" ]]; then
            warning "Force killing remaining processes: $remaining_pids"
            echo "$remaining_pids" | xargs -r kill -9 2>/dev/null || true
        fi
    fi
    
    # Method 4: Kill processes by port (if applicable)
    log "Checking processes on AIDIS ports..."
    local port_8080_pid=$(lsof -ti:8080 2>/dev/null || true)
    local port_5000_pid=$(lsof -ti:5000 2>/dev/null || true)
    
    if [[ -n "$port_8080_pid" ]]; then
        warning "Killing process on port 8080 (PID: $port_8080_pid)"
        kill -9 "$port_8080_pid" 2>/dev/null || true
    fi
    
    if [[ -n "$port_5000_pid" ]]; then
        warning "Killing process on port 5000 (PID: $port_5000_pid)"
        kill -9 "$port_5000_pid" 2>/dev/null || true
    fi
    
    # Clean up any remaining files
    log "Cleaning up process files..."
    rm -f "${AIDIS_ROOT}/logs/aidis.pid"
    rm -f "${AIDIS_ROOT}/run"/*.pid 2>/dev/null || true
    
    log "Service stop completed"
}

# Restart AIDIS services
restart_services() {
    log "Restarting AIDIS services..."
    
    cd "${AIDIS_ROOT}"
    
    # Wait a moment before restart
    sleep 2
    
    # Start services
    if [[ -f "./start-aidis.sh" ]]; then
        log "Starting AIDIS services..."
        ./start-aidis.sh || {
            error "Failed to start AIDIS services"
            return 1
        }
        
        # Wait for services to stabilize
        sleep 3
        
        # Verify startup
        if [[ -f "$PID_FILE" ]]; then
            local pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
            if [[ -n "$pid" ]] && is_process_running "$pid"; then
                log "AIDIS services started successfully (PID: $pid)"
            else
                error "AIDIS services failed to start properly"
                return 1
            fi
        else
            warning "No PID file found after start"
        fi
    else
        error "Start script not found: ./start-aidis.sh"
        return 1
    fi
    
    log "Service restart completed"
}

# Verify services are stopped
verify_stopped() {
    log "Verifying all services are stopped..."
    
    # Check for any AIDIS processes
    local remaining=$(ps aux | grep -E "(tsx.*src/server\.ts|aidis.*server\.ts)" | grep -v grep || true)
    if [[ -n "$remaining" ]]; then
        warning "Some AIDIS processes may still be running:"
        echo "$remaining"
        return 1
    fi
    
    # Check ports
    local port_check=$(ss -tlnp | grep -E ":(8080|5000)\s" || true)
    if [[ -n "$port_check" ]]; then
        warning "AIDIS ports may still be in use:"
        echo "$port_check"
        return 1
    fi
    
    log "All services confirmed stopped"
    return 0
}

# Usage function
usage() {
    echo "Usage: $0 [stop|restart|verify]"
    echo
    echo "Commands:"
    echo "  stop      - Stop all AIDIS services (default)"
    echo "  restart   - Stop and restart all AIDIS services"  
    echo "  verify    - Verify services are stopped"
    echo
    echo "This script provides clean service management for emergency rollback."
    exit 1
}

# Main execution
main() {
    local action="${1:-stop}"
    
    case "$action" in
        stop)
            stop_services
            verify_stopped || warning "Service stop verification failed"
            ;;
        restart)
            stop_services
            verify_stopped || warning "Service stop verification failed"
            restart_services
            ;;
        verify)
            verify_stopped
            ;;
        *)
            error "Unknown action: $action"
            usage
            ;;
    esac
    
    log "Service rollback operation completed: $action"
}

# Execute main function
main "$@"
