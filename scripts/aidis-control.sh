#!/bin/bash

# AIDIS Process Control Script - Enterprise Hardened
# Oracle's mission-critical process management

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AIDIS_ROOT="$(dirname "$SCRIPT_DIR")"
MCP_SERVER_DIR="$AIDIS_ROOT/mcp-server"
PID_FILE="/home/ridgetop/aidis/run/aidis.pid"
HEALTH_URL="http://localhost:8080"
LOG_FILE="$AIDIS_ROOT/aidis.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] SUCCESS:${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$LOG_FILE"
}

# Kill all AIDIS processes (Oracle's nuclear option)
kill_all_aidis() {
    log "🔥 Killing all AIDIS processes..."
    
    # Find and kill all related processes
    pkill -f "aidis|server\.ts|tsx.*server\.ts" 2>/dev/null || true
    sleep 2
    
    # Force kill any remaining processes
    pkill -9 -f "aidis|server\.ts|tsx.*server\.ts" 2>/dev/null || true
    
    # Clean up PID file
    if [[ -f "$PID_FILE" ]]; then
        rm -f "$PID_FILE"
        log "🧹 Removed PID file"
    fi
    
    success "✅ All AIDIS processes terminated"
}

# Check if AIDIS is running
is_running() {
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            return 0
        else
            # Stale PID file
            rm -f "$PID_FILE"
        fi
    fi
    return 1
}

# Health check
health_check() {
    log "🏥 Performing health check..."
    
    # Check liveness
    if curl -s "$HEALTH_URL/healthz" > /dev/null; then
        success "✅ Liveness check passed"
    else
        error "❌ Liveness check failed"
        return 1
    fi
    
    # Check readiness
    if curl -s "$HEALTH_URL/readyz" > /dev/null; then
        success "✅ Readiness check passed"
    else
        error "❌ Readiness check failed"
        return 1
    fi
    
    return 0
}

# Start AIDIS
start() {
    log "🚀 Starting AIDIS MCP Server..."
    
    if is_running; then
        warn "⚠️  AIDIS is already running"
        return 0
    fi
    
    # Kill any zombie processes first
    kill_all_aidis
    
    # Change to MCP server directory
    cd "$MCP_SERVER_DIR"
    
    # Set environment variables for hardening
    export NODE_ENV=production
    export MCP_DEBUG=handshake,transport,errors
    export AIDIS_HEALTH_PORT=8080
    
    # Start AIDIS in background
    log "🔗 Launching AIDIS server..."
    nohup npx tsx src/server.ts > "$LOG_FILE" 2>&1 &
    
    # Wait for startup
    sleep 3
    
    # Verify it's running
    if is_running; then
        success "✅ AIDIS started successfully (PID: $(cat $PID_FILE))"
        
        # Wait for health checks
        log "⏳ Waiting for health checks..."
        for i in {1..30}; do
            if health_check 2>/dev/null; then
                success "🎯 AIDIS is healthy and ready!"
                return 0
            fi
            sleep 1
        done
        
        error "❌ AIDIS started but failed health checks"
        return 1
    else
        error "❌ Failed to start AIDIS"
        return 1
    fi
}

# Stop AIDIS
stop() {
    log "📴 Stopping AIDIS MCP Server..."
    
    if ! is_running; then
        warn "⚠️  AIDIS is not running"
        return 0
    fi
    
    local pid=$(cat "$PID_FILE")
    log "🛑 Sending SIGTERM to PID $pid..."
    
    kill -TERM "$pid" 2>/dev/null || true
    
    # Wait for graceful shutdown
    for i in {1..10}; do
        if ! kill -0 "$pid" 2>/dev/null; then
            success "✅ AIDIS stopped gracefully"
            return 0
        fi
        sleep 1
    done
    
    # Force kill if necessary
    warn "⚠️  Forcing shutdown..."
    kill -KILL "$pid" 2>/dev/null || true
    
    if [[ -f "$PID_FILE" ]]; then
        rm -f "$PID_FILE"
    fi
    
    success "✅ AIDIS stopped"
}

# Restart AIDIS
restart() {
    log "🔄 Restarting AIDIS MCP Server..."
    stop
    sleep 2
    start
}

# Show status
status() {
    echo "📊 AIDIS Status Report"
    echo "======================"
    
    if is_running; then
        local pid=$(cat "$PID_FILE")
        echo -e "Status: ${GREEN}RUNNING${NC} (PID: $pid)"
        
        # Show process info
        echo "Process info:"
        ps -p "$pid" -o pid,ppid,cmd,etime,pmem,pcpu || true
        
        # Health check
        echo ""
        if health_check; then
            echo -e "Health: ${GREEN}HEALTHY${NC}"
        else
            echo -e "Health: ${RED}UNHEALTHY${NC}"
        fi
        
    else
        echo -e "Status: ${RED}STOPPED${NC}"
    fi
    
    # Show recent logs
    echo ""
    echo "Recent logs:"
    echo "============"
    if [[ -f "$LOG_FILE" ]]; then
        tail -10 "$LOG_FILE"
    else
        echo "No log file found"
    fi
}

# Show help
usage() {
    echo "AIDIS Process Control - Enterprise Hardened"
    echo ""
    echo "Usage: $0 {start|stop|restart|status|health|kill-all|logs}"
    echo ""
    echo "Commands:"
    echo "  start     - Start AIDIS server with health checks"
    echo "  stop      - Gracefully stop AIDIS server"
    echo "  restart   - Restart AIDIS server"
    echo "  status    - Show detailed status information"
    echo "  health    - Run health check only"
    echo "  kill-all  - Kill all AIDIS processes (nuclear option)"
    echo "  logs      - Show recent logs"
    echo ""
    echo "Environment:"
    echo "  PID_FILE: $PID_FILE"
    echo "  HEALTH_URL: $HEALTH_URL"
    echo "  LOG_FILE: $LOG_FILE"
}

# Show logs
logs() {
    if [[ -f "$LOG_FILE" ]]; then
        echo "📋 AIDIS Logs (last 50 lines):"
        echo "==============================="
        tail -50 "$LOG_FILE"
    else
        echo "📋 No log file found at $LOG_FILE"
    fi
}

# Main command handler
case "${1:-}" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    status)
        status
        ;;
    health)
        health_check
        ;;
    kill-all)
        kill_all_aidis
        ;;
    logs)
        logs
        ;;
    *)
        usage
        exit 1
        ;;
esac
