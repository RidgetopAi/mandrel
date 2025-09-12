#!/bin/bash
# AIDIS Log Monitoring Script
# Monitors logs for error rate spikes and service issues

set -euo pipefail

AIDIS_ROOT="/home/ridgetop/aidis"
LOGS_DIR="$AIDIS_ROOT/logs"
MONITOR_STATE="$LOGS_DIR/.monitor.state"
ALERT_THRESHOLD_ERRORS_PER_MINUTE=5
ALERT_COOLDOWN_MINUTES=30

cd "$AIDIS_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOGS_DIR/system/monitoring.log"
}

send_alert() {
    local severity="$1"
    local message="$2"
    local details="${3:-}"
    
    log_message "[$severity] ALERT: $message"
    
    # Write to alert log
    echo "$(date '+%Y-%m-%d %H:%M:%S') - [$severity] $message" >> "$LOGS_DIR/system/alerts.log"
    if [ -n "$details" ]; then
        echo "Details: $details" >> "$LOGS_DIR/system/alerts.log"
    fi
    
    # Could integrate with external alerting systems here
    # For example: send to Slack, email, PagerDuty, etc.
    
    # For now, just display prominently
    case "$severity" in
        "CRITICAL")
            echo -e "${RED}🚨 CRITICAL ALERT: $message${NC}"
            ;;
        "WARNING")
            echo -e "${YELLOW}⚠️  WARNING: $message${NC}"
            ;;
        "INFO")
            echo -e "${BLUE}ℹ️  INFO: $message${NC}"
            ;;
    esac
}

check_service_health() {
    local issues=0
    
    # Check if main services are running
    if ! pgrep -f "tsx src/server.ts" > /dev/null && ! pgrep -f "tsx src/core-server.ts" > /dev/null; then
        send_alert "CRITICAL" "No AIDIS services are running"
        ((issues++))
    fi
    
    # Check for recent log activity
    local recent_log_count
    recent_log_count=$(find "$LOGS_DIR" -name "*.log" -mmin -10 -exec wc -l {} \; 2>/dev/null | awk '{sum += $1} END {print sum+0}')
    
    if [ "$recent_log_count" -eq 0 ]; then
        send_alert "WARNING" "No recent log activity detected" "Last 10 minutes: $recent_log_count lines"
        ((issues++))
    fi
    
    return $issues
}

check_error_rate() {
    local current_minute
    current_minute=$(date '+%Y-%m-%d %H:%M')
    
    # Count errors in the last minute across all log files
    local error_count=0
    
    while IFS= read -r -d '' logfile; do
        local file_errors
        file_errors=$(grep -c "$current_minute.*\(ERROR\|FATAL\|Failed\|Exception\)" "$logfile" 2>/dev/null || echo 0)
        ((error_count += file_errors))
    done < <(find "$LOGS_DIR" -name "*.log" -print0 2>/dev/null)
    
    log_message "Error rate check: $error_count errors in last minute"
    
    if [ "$error_count" -ge "$ALERT_THRESHOLD_ERRORS_PER_MINUTE" ]; then
        # Check if we're in cooldown period
        local last_alert_time=0
        if [ -f "$MONITOR_STATE" ]; then
            last_alert_time=$(grep "last_error_alert" "$MONITOR_STATE" 2>/dev/null | cut -d'=' -f2 || echo 0)
        fi
        
        local current_time
        current_time=$(date +%s)
        local time_since_last_alert=$((current_time - last_alert_time))
        
        if [ "$time_since_last_alert" -gt $((ALERT_COOLDOWN_MINUTES * 60)) ]; then
            send_alert "CRITICAL" "High error rate detected" "$error_count errors per minute (threshold: $ALERT_THRESHOLD_ERRORS_PER_MINUTE)"
            
            # Update state file
            mkdir -p "$(dirname "$MONITOR_STATE")"
            echo "last_error_alert=$current_time" > "$MONITOR_STATE"
            
            # Include some recent error examples
            echo "Recent errors:" >> "$LOGS_DIR/system/alerts.log"
            find "$LOGS_DIR" -name "*.log" -exec grep -l "ERROR\|FATAL\|Failed\|Exception" {} \; 2>/dev/null | head -3 | while read -r logfile; do
                echo "From $logfile:" >> "$LOGS_DIR/system/alerts.log"
                grep "ERROR\|FATAL\|Failed\|Exception" "$logfile" | tail -3 >> "$LOGS_DIR/system/alerts.log"
            done
        else
            log_message "High error rate detected but in cooldown period (${time_since_last_alert}s since last alert)"
        fi
    fi
    
    return 0
}

check_disk_usage() {
    local usage_mb
    usage_mb=$(du -sm "$LOGS_DIR" 2>/dev/null | cut -f1)
    
    if [ "$usage_mb" -gt 1000 ]; then  # 1GB threshold
        send_alert "WARNING" "High log disk usage" "${usage_mb}MB in logs directory"
    fi
    
    # Check for very large individual files
    find "$LOGS_DIR" -name "*.log" -size +100M 2>/dev/null | while read -r large_file; do
        local file_size
        file_size=$(ls -lah "$large_file" | awk '{print $5}')
        send_alert "WARNING" "Large log file detected" "$large_file is $file_size"
    done
}

check_log_rotation() {
    # Check if any log files are getting too large (indicating rotation issues)
    find "$LOGS_DIR" -name "*.log" -size +200M 2>/dev/null | while read -r oversized_file; do
        local file_size
        file_size=$(ls -lah "$oversized_file" | awk '{print $5}')
        send_alert "WARNING" "Log file too large - rotation may have failed" "$oversized_file is $file_size"
    done
    
    # Check if logrotate state file is very old
    if [ -f "$LOGS_DIR/.logrotate.state" ]; then
        local state_age
        state_age=$(find "$LOGS_DIR/.logrotate.state" -mtime +7 2>/dev/null | wc -l)
        if [ "$state_age" -gt 0 ]; then
            send_alert "WARNING" "Log rotation may not be running" "Logrotate state file is more than 7 days old"
        fi
    fi
}

monitor_patterns() {
    # Look for specific warning patterns in recent logs
    local patterns=(
        "OutOfMemory\|Memory.*exhausted"
        "Connection.*refused\|Connection.*timeout"
        "Database.*connection.*failed"
        "SIGTERM\|SIGKILL\|Process.*killed"
        "Permission.*denied"
        "Disk.*full\|No space left"
    )
    
    for pattern in "${patterns[@]}"; do
        local matches
        matches=$(find "$LOGS_DIR" -name "*.log" -mmin -60 -exec grep -c "$pattern" {} \; 2>/dev/null | paste -sd+ | bc 2>/dev/null || echo 0)
        
        if [ "$matches" -gt 0 ]; then
            send_alert "WARNING" "Pattern detected in logs" "$matches matches for: $pattern"
        fi
    done
}

generate_status_report() {
    local report_file="$LOGS_DIR/system/monitoring-status.json"
    local timestamp
    timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
    
    # Create JSON status report
    cat > "$report_file" << EOF
{
  "timestamp": "$timestamp",
  "monitoring_status": "active",
  "service_health": {
    "aidis_mcp_running": $(pgrep -f "tsx src/server.ts" > /dev/null && echo "true" || echo "false"),
    "aidis_core_running": $(pgrep -f "tsx src/core-server.ts" > /dev/null && echo "true" || echo "false")
  },
  "log_metrics": {
    "active_log_files": $(find "$LOGS_DIR" -name "*.log" 2>/dev/null | wc -l),
    "archived_log_files": $(find "$LOGS_DIR/archive" -name "*.gz" 2>/dev/null | wc -l),
    "total_disk_usage_mb": $(du -sm "$LOGS_DIR" 2>/dev/null | cut -f1),
    "recent_error_count": $(find "$LOGS_DIR" -name "*.log" -mmin -60 -exec grep -c -i "error\|failed\|exception" {} \; 2>/dev/null | paste -sd+ | bc 2>/dev/null || echo 0)
  },
  "last_rotation": "$(stat -c %y "$LOGS_DIR/.logrotate.state" 2>/dev/null || echo 'never')",
  "alerts_in_last_hour": $(grep -c "$(date '+%Y-%m-%d %H')" "$LOGS_DIR/system/alerts.log" 2>/dev/null || echo 0)
}
EOF
    
    log_message "Status report generated: $report_file"
}

# Main monitoring function
run_monitoring() {
    log_message "Starting monitoring cycle"
    
    # Ensure log directories exist
    mkdir -p "$LOGS_DIR/system"
    
    # Run health checks
    local total_issues=0
    
    check_service_health || ((total_issues += $?))
    check_error_rate || ((total_issues += $?))
    check_disk_usage || ((total_issues += $?))
    check_log_rotation || ((total_issues += $?))
    monitor_patterns || ((total_issues += $?))
    
    # Generate status report
    generate_status_report
    
    if [ "$total_issues" -eq 0 ]; then
        log_message "Monitoring cycle completed - no issues detected"
    else
        log_message "Monitoring cycle completed - $total_issues issues detected"
    fi
    
    return $total_issues
}

# Command line interface
case "${1:-monitor}" in
    "monitor"|"run")
        run_monitoring
        ;;
    "status")
        if [ -f "$LOGS_DIR/system/monitoring-status.json" ]; then
            echo -e "${GREEN}📊 Latest Monitoring Status:${NC}"
            cat "$LOGS_DIR/system/monitoring-status.json"
        else
            echo "No monitoring status available. Run './scripts/log-monitor.sh monitor' first."
        fi
        ;;
    "alerts")
        echo -e "${GREEN}🚨 Recent Alerts:${NC}"
        if [ -f "$LOGS_DIR/system/alerts.log" ]; then
            tail -20 "$LOGS_DIR/system/alerts.log"
        else
            echo "No alerts recorded yet."
        fi
        ;;
    "test")
        echo -e "${GREEN}🧪 Testing alert system...${NC}"
        send_alert "INFO" "Test alert from log monitoring system" "This is a test message"
        ;;
    "help")
        cat << EOF
🔍 AIDIS Log Monitoring Tool

Usage: $0 [COMMAND]

Commands:
    monitor     Run monitoring cycle (default)
    status      Show latest monitoring status
    alerts      Show recent alerts
    test        Send test alert
    help        Show this help

The monitoring system checks for:
- Service health and availability
- Error rate spikes
- Disk usage issues
- Log rotation problems
- Warning patterns in logs

Configure thresholds by editing the script variables.
EOF
        ;;
    *)
        echo "Unknown command: $1"
        echo "Use '$0 help' for usage information."
        exit 1
        ;;
esac
