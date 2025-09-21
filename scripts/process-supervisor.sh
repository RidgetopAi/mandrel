#!/bin/bash

# AIDIS Process Supervisor
# Manages AIDIS MCP server with monitoring and auto-restart capabilities

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PID_FILE="$PROJECT_ROOT/run/supervisor.pid"
LOG_FILE="$PROJECT_ROOT/run/supervisor.log"
SERVICE_PID_FILE="$PROJECT_ROOT/run/aidis-mcp.pid"
HEALTH_ENDPOINT="http://localhost:8080/healthz"
RESTART_DELAY=5
MAX_RETRIES=3

# Ensure run directory exists
mkdir -p "$PROJECT_ROOT/run"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

is_supervisor_running() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        fi
    fi
    return 1
}

is_service_running() {
    if [ -f "$SERVICE_PID_FILE" ]; then
        local pid=$(cat "$SERVICE_PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        fi
    fi
    return 1
}

check_health() {
    response=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_ENDPOINT" 2>/dev/null)
    if [ "$response" = "200" ]; then
        return 0
    fi
    return 1
}

start_service() {
    log "Starting AIDIS MCP server..."
    cd "$PROJECT_ROOT/mcp-server"

    # Start the service in background
    nohup npx tsx src/server.ts > "$PROJECT_ROOT/run/aidis-mcp.log" 2>&1 &
    local pid=$!
    echo "$pid" > "$SERVICE_PID_FILE"

    # Wait for health check
    local retries=0
    while [ $retries -lt 30 ]; do
        sleep 1
        if check_health; then
            log "AIDIS MCP server started successfully (PID: $pid)"
            return 0
        fi
        retries=$((retries + 1))
    done

    log "ERROR: AIDIS MCP server failed to start"
    return 1
}

stop_service() {
    if is_service_running; then
        local pid=$(cat "$SERVICE_PID_FILE")
        log "Stopping AIDIS MCP server (PID: $pid)..."
        kill -TERM "$pid" 2>/dev/null

        # Wait for graceful shutdown
        local retries=0
        while [ $retries -lt 10 ] && is_service_running; do
            sleep 1
            retries=$((retries + 1))
        done

        # Force kill if still running
        if is_service_running; then
            log "Force killing AIDIS MCP server..."
            kill -9 "$pid" 2>/dev/null
        fi

        rm -f "$SERVICE_PID_FILE"
        log "AIDIS MCP server stopped"
    fi
}

monitor_loop() {
    log "Starting process supervisor monitoring loop"
    echo "$$" > "$PID_FILE"

    local consecutive_failures=0

    # Trap signals for clean shutdown
    trap 'log "Supervisor shutting down..."; stop_service; rm -f "$PID_FILE"; exit 0' TERM INT

    while true; do
        if ! is_service_running || ! check_health; then
            consecutive_failures=$((consecutive_failures + 1))
            log "Service unhealthy or not running (failure #$consecutive_failures)"

            if [ $consecutive_failures -gt $MAX_RETRIES ]; then
                log "ERROR: Max retries exceeded. Manual intervention required."
                exit 1
            fi

            stop_service
            sleep $RESTART_DELAY

            if start_service; then
                consecutive_failures=0
                log "Service restarted successfully"
            else
                log "Failed to restart service"
            fi
        else
            # Reset failure counter on successful health check
            consecutive_failures=0
        fi

        # Check every 10 seconds
        sleep 10
    done
}

case "$1" in
    start)
        if is_supervisor_running; then
            echo -e "${YELLOW}Process supervisor is already running${NC}"
            exit 1
        fi

        echo -e "${GREEN}Starting AIDIS process supervisor...${NC}"
        monitor_loop &
        echo "Process supervisor started. Check logs at: $LOG_FILE"
        ;;

    stop)
        if ! is_supervisor_running; then
            echo -e "${YELLOW}Process supervisor is not running${NC}"
            exit 1
        fi

        echo -e "${GREEN}Stopping AIDIS process supervisor...${NC}"
        local supervisor_pid=$(cat "$PID_FILE")
        kill -TERM "$supervisor_pid" 2>/dev/null
        rm -f "$PID_FILE"
        echo "Process supervisor stopped"
        ;;

    restart)
        $0 stop
        sleep 2
        $0 start
        ;;

    status)
        echo "=== AIDIS Process Supervisor Status ==="

        if is_supervisor_running; then
            echo -e "Supervisor: ${GREEN}RUNNING${NC} (PID: $(cat "$PID_FILE"))"
        else
            echo -e "Supervisor: ${RED}NOT RUNNING${NC}"
        fi

        if is_service_running; then
            echo -e "AIDIS MCP Server: ${GREEN}RUNNING${NC} (PID: $(cat "$SERVICE_PID_FILE"))"

            if check_health; then
                echo -e "Health Check: ${GREEN}HEALTHY${NC}"
                curl -s "$HEALTH_ENDPOINT" | python3 -m json.tool 2>/dev/null || curl -s "$HEALTH_ENDPOINT"
            else
                echo -e "Health Check: ${RED}UNHEALTHY${NC}"
            fi
        else
            echo -e "AIDIS MCP Server: ${RED}NOT RUNNING${NC}"
        fi

        echo ""
        echo "Log file: $LOG_FILE"
        echo "Recent logs:"
        tail -n 5 "$LOG_FILE" 2>/dev/null || echo "No logs available"
        ;;

    *)
        echo "Usage: $0 {start|stop|restart|status}"
        echo ""
        echo "Process supervisor for AIDIS MCP server with:"
        echo "  - Automatic restart on failure"
        echo "  - Health check monitoring"
        echo "  - Graceful shutdown handling"
        echo "  - Comprehensive logging"
        exit 1
        ;;
esac

exit 0