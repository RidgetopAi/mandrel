#!/bin/bash
# AIDIS Log Analysis Script
# Provides common log analysis and debugging tools

set -euo pipefail

AIDIS_ROOT="/home/ridgetop/aidis"
LOGS_DIR="$AIDIS_ROOT/logs"

cd "$AIDIS_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}"
}

show_help() {
    cat << EOF
🔍 AIDIS Log Analysis Tool

Usage: $0 [COMMAND] [OPTIONS]

Commands:
    errors [HOURS]     Show errors from last N hours (default: 24)
    status             Show current service status and recent activity
    performance        Show performance metrics and warnings
    patterns           Analyze pattern detection logs
    metrics            Show metrics collection activity
    git                Show git tracking activity
    search TERM        Search for term across all logs
    tail SERVICE       Tail logs for specific service
    disk-usage         Show disk usage by log directory
    cleanup [DAYS]     Clean up logs older than N days (default: 90)
    health             Overall system health from logs

Examples:
    $0 errors          # Show errors from last 24 hours
    $0 errors 6        # Show errors from last 6 hours
    $0 search "failed" # Search for "failed" in all logs
    $0 tail aidis      # Tail main AIDIS service logs
    $0 cleanup 60      # Remove logs older than 60 days
EOF
}

analyze_errors() {
    local hours=${1:-24}
    print_header "Errors from last $hours hours"
    
    # Use find to get recent logs and search for errors
    find "$LOGS_DIR" -name "*.log" -mtime -"$(echo "$hours/24" | bc -l)" -exec grep -l -i "error\|failed\|exception\|fatal" {} \; 2>/dev/null | while read -r logfile; do
        echo -e "\n${YELLOW}📁 $logfile${NC}"
        grep -i --color=always "error\|failed\|exception\|fatal" "$logfile" | tail -10
    done
    
    # Also check archived logs if they're recent
    find "$LOGS_DIR/archive" -name "*.gz" -mtime -1 -exec zgrep -l -i "error\|failed\|exception\|fatal" {} \; 2>/dev/null | while read -r logfile; do
        echo -e "\n${YELLOW}📁 $logfile (archived)${NC}"
        zgrep -i --color=always "error\|failed\|exception\|fatal" "$logfile" | tail -5
    done
}

show_status() {
    print_header "Service Status and Recent Activity"
    
    # Check if the MCP server is running. The entrypoint is now src/main.ts (dev,
    # via tsx) / dist/main.js (prod, node) — the old `tsx src/server.ts` and the
    # separate `core-server.ts` ("Core HTTP") process no longer exist.
    echo -e "${GREEN}🔍 Process Status:${NC}"
    if pgrep -f "(dist/main\.js|src/main\.ts)" > /dev/null; then
        echo "✅ AIDIS MCP Server: Running (PID: $(pgrep -f '(dist/main\.js|src/main\.ts)' | tr '\n' ' '))"
    else
        echo -e "${RED}❌ AIDIS MCP Server: Not running${NC}"
    fi

    echo
    echo -e "${GREEN}📋 Recent Log Activity (last 50 lines):${NC}"
    find "$LOGS_DIR" -name "*.log" -exec tail -5 {} \; | head -50
    
    echo
    echo -e "${GREEN}💾 Log File Sizes:${NC}"
    ls -lah "$LOGS_DIR"/*.log 2>/dev/null || echo "No active log files found"
}

show_performance() {
    print_header "Performance Analysis"
    
    echo -e "${GREEN}🚀 Performance Warnings:${NC}"
    find "$LOGS_DIR" -name "*.log" -exec grep -l -i "slow\|timeout\|performance\|memory\|cpu" {} \; 2>/dev/null | while read -r logfile; do
        echo -e "\n${YELLOW}📁 $logfile${NC}"
        grep -i --color=always "slow\|timeout\|performance\|memory\|cpu" "$logfile" | tail -5
    done
    
    echo
    echo -e "${GREEN}⚡ Response Time Analysis:${NC}"
    if [ -f "$LOGS_DIR/aidis-core.log" ]; then
        grep -E "took [0-9]+ms" "$LOGS_DIR/aidis-core.log" 2>/dev/null | tail -10 || echo "No timing data found"
    fi
}

analyze_patterns() {
    print_header "Pattern Detection Analysis"
    
    if [ -d "$LOGS_DIR/patterns" ]; then
        echo -e "${GREEN}🔮 Pattern Detection Activity:${NC}"
        find "$LOGS_DIR/patterns" -name "*.log" -exec tail -20 {} \;
    else
        echo "No pattern detection logs found"
    fi
}

analyze_metrics() {
    print_header "Metrics Collection Analysis"
    
    if [ -d "$LOGS_DIR/metrics" ]; then
        echo -e "${GREEN}📊 Metrics Collection Activity:${NC}"
        find "$LOGS_DIR/metrics" -name "*.log" -exec tail -20 {} \;
    else
        echo "No metrics logs found"
    fi
}

analyze_git() {
    print_header "Git Tracking Analysis"
    
    if [ -d "$LOGS_DIR/git-tracking" ]; then
        echo -e "${GREEN}📝 Git Tracking Activity:${NC}"
        find "$LOGS_DIR/git-tracking" -name "*.log" -exec tail -20 {} \;
    else
        echo "No git tracking logs found"
    fi
}

search_logs() {
    local search_term="$1"
    print_header "Searching for: $search_term"
    
    echo -e "${GREEN}🔍 Search Results:${NC}"
    
    # Search current logs
    find "$LOGS_DIR" -name "*.log" -exec grep -l "$search_term" {} \; 2>/dev/null | while read -r logfile; do
        echo -e "\n${YELLOW}📁 $logfile${NC}"
        grep --color=always "$search_term" "$logfile" | tail -10
    done
    
    # Search archived logs
    find "$LOGS_DIR/archive" -name "*.gz" -exec zgrep -l "$search_term" {} \; 2>/dev/null | while read -r logfile; do
        echo -e "\n${YELLOW}📁 $logfile (archived)${NC}"
        zgrep --color=always "$search_term" "$logfile" | tail -5
    done
}

tail_service() {
    local service="$1"
    
    case "$service" in
        "aidis"|"main")
            echo -e "${GREEN}📋 Tailing AIDIS main logs...${NC}"
            tail -f "$LOGS_DIR/aidis.log" 2>/dev/null || echo "Log file not found"
            ;;
        "core"|"http")
            echo -e "${GREEN}📋 Tailing AIDIS core logs...${NC}"
            tail -f "$LOGS_DIR/aidis-core.log" 2>/dev/null || echo "Log file not found"
            ;;
        "bridge")
            echo -e "${GREEN}📋 Tailing HTTP bridge logs...${NC}"
            tail -f "$LOGS_DIR/http-mcp-bridge.log" 2>/dev/null || echo "Log file not found"
            ;;
        *)
            echo -e "${RED}❌ Unknown service: $service${NC}"
            echo "Available services: aidis, core, bridge"
            ;;
    esac
}

show_disk_usage() {
    print_header "Disk Usage Analysis"
    
    echo -e "${GREEN}💾 Disk Usage by Directory:${NC}"
    du -sh "$LOGS_DIR"/* 2>/dev/null | sort -hr
    
    echo
    echo -e "${GREEN}📊 Largest Log Files:${NC}"
    find "$LOGS_DIR" -name "*.log" -o -name "*.gz" 2>/dev/null | xargs ls -lah | sort -k5 -hr | head -20
    
    echo
    echo -e "${GREEN}🗂️  Archive Statistics:${NC}"
    if [ -d "$LOGS_DIR/archive" ]; then
        echo "Archived files: $(find "$LOGS_DIR/archive" -name "*.gz" | wc -l)"
        echo "Archive size: $(du -sh "$LOGS_DIR/archive" | cut -f1)"
    else
        echo "No archive directory found"
    fi
}

cleanup_logs() {
    local days=${1:-90}
    print_header "Cleaning up logs older than $days days"
    
    echo -e "${YELLOW}⚠️  This will permanently delete log files older than $days days${NC}"
    read -p "Continue? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${GREEN}🧹 Cleaning up old logs...${NC}"
        
        # Remove old archived logs
        find "$LOGS_DIR/archive" -name "*.gz" -mtime +$days -delete 2>/dev/null && echo "✅ Removed old archived logs"
        
        # Remove old uncompressed logs (be careful not to remove active logs)
        find "$LOGS_DIR" -name "*.log.*" -mtime +$days -delete 2>/dev/null && echo "✅ Removed old rotated logs"
        
        echo -e "${GREEN}✅ Cleanup completed${NC}"
        
        # Log the cleanup
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Log cleanup completed (${days} days)" >> logs/system/log-cleanup.log
    else
        echo "Cleanup cancelled"
    fi
}

show_health() {
    print_header "System Health Check"
    
    local health_score=0
    local max_score=5
    
    # Check 1: Service processes (entrypoint is now main.ts/main.js — see show_status)
    echo -e "${GREEN}🔍 Service Processes:${NC}"
    if pgrep -f "(dist/main\.js|src/main\.ts)" > /dev/null; then
        echo "✅ At least one AIDIS service is running"
        ((health_score++))
    else
        echo -e "${RED}❌ No AIDIS services running${NC}"
    fi
    
    # Check 2: Recent errors
    echo -e "\n${GREEN}🚨 Error Rate (last hour):${NC}"
    local error_count
    error_count=$(find "$LOGS_DIR" -name "*.log" -mmin -60 -exec grep -c -i "error\|failed\|exception" {} \; 2>/dev/null | paste -sd+ | bc 2>/dev/null || echo 0)
    if [ "$error_count" -lt 5 ]; then
        echo "✅ Low error rate ($error_count errors)"
        ((health_score++))
    else
        echo -e "${YELLOW}⚠️  Elevated error rate ($error_count errors)${NC}"
    fi
    
    # Check 3: Disk space
    echo -e "\n${GREEN}💾 Disk Usage:${NC}"
    local disk_usage
    disk_usage=$(du -sm "$LOGS_DIR" | cut -f1)
    if [ "$disk_usage" -lt 500 ]; then
        echo "✅ Log disk usage is reasonable (${disk_usage}MB)"
        ((health_score++))
    else
        echo -e "${YELLOW}⚠️  High log disk usage (${disk_usage}MB)${NC}"
    fi
    
    # Check 4: Log rotation
    echo -e "\n${GREEN}🔄 Log Rotation:${NC}"
    if [ -f "$LOGS_DIR/.logrotate.state" ]; then
        echo "✅ Log rotation is configured"
        ((health_score++))
    else
        echo -e "${YELLOW}⚠️  Log rotation not initialized${NC}"
    fi
    
    # Check 5: Archive directory
    echo -e "\n${GREEN}🗂️  Log Archives:${NC}"
    if [ -d "$LOGS_DIR/archive" ] && [ "$(find "$LOGS_DIR/archive" -name "*.gz" | wc -l)" -gt 0 ]; then
        echo "✅ Log archives are present"
        ((health_score++))
    else
        echo "ℹ️  No archived logs (may be normal for new installation)"
        ((health_score++))  # Don't penalize new installations
    fi
    
    # Overall health
    echo
    echo -e "${GREEN}🏥 Overall Health Score: $health_score/$max_score${NC}"
    
    if [ "$health_score" -eq "$max_score" ]; then
        echo -e "${GREEN}✅ System is healthy${NC}"
    elif [ "$health_score" -ge 3 ]; then
        echo -e "${YELLOW}⚠️  System needs attention${NC}"
    else
        echo -e "${RED}❌ System has significant issues${NC}"
    fi
}

# Main command processing
case "${1:-help}" in
    "errors")
        analyze_errors "${2:-24}"
        ;;
    "status")
        show_status
        ;;
    "performance")
        show_performance
        ;;
    "patterns")
        analyze_patterns
        ;;
    "metrics")
        analyze_metrics
        ;;
    "git")
        analyze_git
        ;;
    "search")
        if [ -z "${2:-}" ]; then
            echo -e "${RED}❌ Search term required${NC}"
            exit 1
        fi
        search_logs "$2"
        ;;
    "tail")
        if [ -z "${2:-}" ]; then
            echo -e "${RED}❌ Service name required${NC}"
            exit 1
        fi
        tail_service "$2"
        ;;
    "disk-usage")
        show_disk_usage
        ;;
    "cleanup")
        cleanup_logs "${2:-90}"
        ;;
    "health")
        show_health
        ;;
    "help"|"-h"|"--help")
        show_help
        ;;
    *)
        echo -e "${RED}❌ Unknown command: $1${NC}"
        echo
        show_help
        exit 1
        ;;
esac
