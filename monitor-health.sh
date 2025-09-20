#!/bin/bash
# monitor-health.sh
# Continuous Phase 4 Health Monitoring with Auto-Rollback
# TR018-4: Phase 4 Rollback and Emergency Procedures

ALERT_THRESHOLD=3  # Failed checks before triggering rollback
MONITOR_INTERVAL=30  # Seconds between checks
LOG_FILE="logs/health-monitor-$(date +%Y%m%d).log"

# Ensure logs directory exists
mkdir -p logs

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Logging function
log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo -e "${GREEN}${msg}${NC}"
    echo "${msg}" >> "${LOG_FILE}"
}

warning() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $1"
    echo -e "${YELLOW}${msg}${NC}"
    echo "${msg}" >> "${LOG_FILE}"
}

error() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1"
    echo -e "${RED}${msg}${NC}"
    echo "${msg}" >> "${LOG_FILE}"
}

# Health check function
check_endpoint() {
    local url=$1
    local name=$2
    local timeout=${3:-5}

    if curl -f -s --max-time "$timeout" "$url" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Comprehensive health check
health_check() {
    local failed_services=0
    local total_services=5

    # Check AIDIS MCP Health
    if check_endpoint "http://localhost:8080/healthz" "AIDIS MCP Health"; then
        log "✅ AIDIS MCP Health: OK"
    else
        error "❌ AIDIS MCP Health: FAILED"
        ((failed_services++))
    fi

    # Check AIDIS MCP Ready
    if check_endpoint "http://localhost:8080/readyz" "AIDIS MCP Ready"; then
        log "✅ AIDIS MCP Ready: OK"
    else
        error "❌ AIDIS MCP Ready: FAILED"
        ((failed_services++))
    fi

    # Check AIDIS MCP Live
    if check_endpoint "http://localhost:8080/livez" "AIDIS MCP Live"; then
        log "✅ AIDIS MCP Live: OK"
    else
        error "❌ AIDIS MCP Live: FAILED"
        ((failed_services++))
    fi

    # Check Frontend
    if check_endpoint "http://localhost:3000" "Frontend"; then
        log "✅ Frontend: OK"
    else
        error "❌ Frontend: FAILED"
        ((failed_services++))
    fi

    # Check Database
    if psql -h localhost -p 5432 -d aidis_production -c "SELECT 1;" > /dev/null 2>&1; then
        log "✅ Database: OK"
    else
        error "❌ Database: FAILED"
        ((failed_services++))
    fi

    # System resource checks
    process_count=$(ps aux | grep -E "(node|tsx|npm)" | grep -v grep | wc -l)
    memory_usage=$(free | awk '/^Mem:/{printf "%.0f", $3/$2 * 100.0}')

    log "📊 System Status: ${process_count} processes, ${memory_usage}% memory"

    # Performance thresholds
    if [ "$process_count" -gt 20 ]; then
        warning "⚠️  High process count: $process_count (threshold: 20)"
        ((failed_services++))
    fi

    if [ "$memory_usage" -gt 85 ]; then
        warning "⚠️  High memory usage: ${memory_usage}% (threshold: 85%)"
        ((failed_services++))
    fi

    # Return status
    if [ "$failed_services" -eq 0 ]; then
        log "🎉 All systems healthy (${total_services}/${total_services})"
        return 0
    else
        error "🚨 ${failed_services}/${total_services} services failed"
        return "$failed_services"
    fi
}

# MCP Tool test
test_mcp_tools() {
    log "🔧 Testing MCP tool functionality..."

    if response=$(curl -s -X POST "http://localhost:8080/mcp/tools/aidis_ping" \
                       -H "Content-Type: application/json" \
                       -d '{}' 2>/dev/null); then
        if echo "$response" | grep -q "Pong"; then
            log "✅ MCP tools: Responding correctly"
            return 0
        else
            error "❌ MCP tools: Invalid response"
            return 1
        fi
    else
        error "❌ MCP tools: Connection failed"
        return 1
    fi
}

# Performance test
performance_test() {
    log "⚡ Running performance test..."

    local start_time
    start_time=$(date +%s%N)

    if check_endpoint "http://localhost:8080/healthz" "Performance Test"; then
        local end_time
        end_time=$(date +%s%N)
        local duration_ms=$(( (end_time - start_time) / 1000000 ))

        if [ "$duration_ms" -lt 1000 ]; then
            log "✅ Performance: ${duration_ms}ms (good)"
            return 0
        else
            warning "⚠️  Performance: ${duration_ms}ms (slow, threshold: 1000ms)"
            return 1
        fi
    else
        error "❌ Performance test failed"
        return 1
    fi
}

# Trigger emergency rollback
trigger_emergency_rollback() {
    error "🚨 TRIGGERING EMERGENCY ROLLBACK"
    error "Multiple consecutive health check failures detected"
    error "Threshold: $ALERT_THRESHOLD failed checks"

    # Log rollback trigger
    cat >> "logs/emergency-trigger-$(date +%Y%m%d_%H%M%S).log" << EOF
EMERGENCY ROLLBACK TRIGGERED
Timestamp: $(date)
Reason: Health monitoring detected $ALERT_THRESHOLD consecutive failures
Last Health Check Results: See $LOG_FILE
Triggering Command: ./emergency-rollback.sh
EOF

    # Execute emergency rollback
    if [ -x "./emergency-rollback.sh" ]; then
        log "Executing emergency rollback script..."
        # Note: In production, might want to add more safeguards here
        echo "EMERGENCY ROLLBACK" | ./emergency-rollback.sh
    else
        error "Emergency rollback script not found or not executable"
        error "Manual intervention required immediately"
    fi
}

# Signal handlers
cleanup() {
    log "Health monitoring stopped by signal"
    exit 0
}

trap cleanup INT TERM

# Main monitoring loop
main() {
    echo -e "${GREEN}🏥 AIDIS Phase 4 Health Monitor Started${NC}"
    echo "Monitor interval: ${MONITOR_INTERVAL} seconds"
    echo "Alert threshold: ${ALERT_THRESHOLD} consecutive failures"
    echo "Log file: ${LOG_FILE}"
    echo "Emergency rollback script: ./emergency-rollback.sh"
    echo

    local failed_count=0
    local check_number=0

    log "Health monitoring started"

    while true; do
        ((check_number++))
        log "=== Health Check #${check_number} ==="

        # Run comprehensive health check
        if health_check; then
            # Health check passed
            failed_count=0

            # Additional functionality tests
            test_mcp_tools || warning "MCP tools test failed but not critical"
            performance_test || warning "Performance test failed but not critical"

        else
            # Health check failed
            ((failed_count++))
            error "Health check failed (${failed_count}/${ALERT_THRESHOLD})"

            if [ "$failed_count" -ge "$ALERT_THRESHOLD" ]; then
                # Trigger emergency rollback
                trigger_emergency_rollback
                # Exit after triggering rollback
                exit 1
            fi
        fi

        log "Next check in ${MONITOR_INTERVAL} seconds..."
        log ""

        # Wait for next check
        sleep "$MONITOR_INTERVAL"
    done
}

# Help function
show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

AIDIS Phase 4 Health Monitor with Auto-Rollback

OPTIONS:
    -h, --help          Show this help message
    -i, --interval SEC  Set monitoring interval (default: 30)
    -t, --threshold N   Set failure threshold (default: 3)
    -v, --verbose       Enable verbose logging
    --test              Run single health check and exit
    --dry-run           Monitor but don't trigger rollback

EXAMPLES:
    $0                          # Start monitoring with defaults
    $0 -i 60 -t 5              # Monitor every 60s, rollback after 5 failures
    $0 --test                   # Run single health check
    $0 --dry-run                # Monitor only, no auto-rollback

SIGNALS:
    INT, TERM               Stop monitoring gracefully

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -i|--interval)
            MONITOR_INTERVAL="$2"
            shift 2
            ;;
        -t|--threshold)
            ALERT_THRESHOLD="$2"
            shift 2
            ;;
        --test)
            log "Running single health check..."
            health_check
            test_mcp_tools
            performance_test
            exit $?
            ;;
        --dry-run)
            log "DRY RUN MODE: Monitoring only, no auto-rollback"
            # Override trigger function to do nothing
            trigger_emergency_rollback() {
                error "🚨 WOULD TRIGGER EMERGENCY ROLLBACK (DRY RUN)"
                error "In production, emergency rollback would be executed now"
            }
            shift
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validation
if ! [[ "$MONITOR_INTERVAL" =~ ^[0-9]+$ ]] || [ "$MONITOR_INTERVAL" -lt 5 ]; then
    error "Invalid monitor interval: $MONITOR_INTERVAL (minimum: 5 seconds)"
    exit 1
fi

if ! [[ "$ALERT_THRESHOLD" =~ ^[0-9]+$ ]] || [ "$ALERT_THRESHOLD" -lt 1 ]; then
    error "Invalid alert threshold: $ALERT_THRESHOLD (minimum: 1)"
    exit 1
fi

# Execute main monitoring loop
main