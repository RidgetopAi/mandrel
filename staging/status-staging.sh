#!/bin/bash

# AIDIS Staging Environment Status Check
# Shows status of all staging services

cd "$(dirname "$0")"

echo "📊 AIDIS Staging Environment Status"
echo "===================================="

# Function to check service status
check_service() {
    local service_name=$1
    local pid_file=$2
    local port=$3
    local health_url=$4
    
    echo ""
    echo "🔍 $service_name:"
    
    if [ -f "$pid_file" ]; then
        PID=$(cat "$pid_file")
        if ps -p $PID > /dev/null 2>&1; then
            echo "   Status: ✅ Running (PID: $PID)"
            
            # Check port if specified
            if [ -n "$port" ]; then
                if netstat -ln | grep ":$port " > /dev/null 2>&1; then
                    echo "   Port: ✅ $port (listening)"
                else
                    echo "   Port: ❌ $port (not listening)"
                fi
            fi
            
            # Check health endpoint if specified  
            if [ -n "$health_url" ]; then
                if curl -s "$health_url" > /dev/null 2>&1; then
                    echo "   Health: ✅ Responding"
                else
                    echo "   Health: ❌ Not responding"
                fi
            fi
            
        else
            echo "   Status: ❌ Not running (stale PID file)"
        fi
    else
        echo "   Status: ❌ Not running (no PID file)"
    fi
}

# Check each service
check_service "MCP Server" "run/staging-mcp.pid" "9090" "http://localhost:9090/healthz"
check_service "Backend Server" "run/staging-backend.pid" "6000" "http://localhost:6000/healthz"
check_service "Frontend Server" "run/staging-frontend.pid" "3001" "http://localhost:3001"

# Database status
echo ""
echo "🗄️  Database Status:"
if psql -h localhost -p 5432 -d aidis_staging -c "SELECT 1;" > /dev/null 2>&1; then
    echo "   Connection: ✅ Connected to aidis_staging"
    
    # Get some basic stats
    PROJECT_COUNT=$(psql -h localhost -p 5432 -d aidis_staging -t -c "SELECT count(*) FROM projects;" 2>/dev/null)
    CONTEXT_COUNT=$(psql -h localhost -p 5432 -d aidis_staging -t -c "SELECT count(*) FROM contexts;" 2>/dev/null)
    SESSION_COUNT=$(psql -h localhost -p 5432 -d aidis_staging -t -c "SELECT count(*) FROM sessions;" 2>/dev/null)
    
    echo "   Projects: $PROJECT_COUNT"
    echo "   Contexts: $CONTEXT_COUNT"
    echo "   Sessions: $SESSION_COUNT"
else
    echo "   Connection: ❌ Cannot connect to aidis_staging"
fi

# Log files status
echo ""
echo "📋 Recent Log Activity:"
for log_file in logs/*.log; do
    if [ -f "$log_file" ]; then
        log_name=$(basename "$log_file")
        log_size=$(du -h "$log_file" | cut -f1)
        last_modified=$(stat -c %y "$log_file" | cut -d. -f1)
        echo "   $log_name: $log_size (modified: $last_modified)"
    fi
done

# System resources
echo ""
echo "💻 System Resources:"
MEM_USAGE=$(free -h | awk 'NR==2{printf "%.1f%%", $3/$2*100}')
CPU_LOAD=$(uptime | awk -F'load average:' '{ print $2 }')
echo "   Memory: $MEM_USAGE used"
echo "   Load:$CPU_LOAD"

# Port conflicts check
echo ""
echo "🔍 Port Conflict Check:"
for port in 9090 6000 3001; do
    if netstat -ln | grep ":$port " > /dev/null 2>&1; then
        PROCESS=$(netstat -lnp | grep ":$port " | awk '{print $7}' | cut -d/ -f2)
        echo "   Port $port: ✅ In use by $PROCESS"
    else
        echo "   Port $port: ⚪ Available"
    fi
done

echo ""
echo "🎯 Quick Actions:"
echo "   View MCP logs:     tail -f staging/logs/mcp-staging.log"
echo "   View Backend logs: tail -f staging/logs/backend-staging.log"
echo "   View Frontend logs:tail -f staging/logs/frontend-staging.log"
echo "   Stop all services: ./stop-staging.sh"
echo "   Restart all:       ./restart-staging.sh"
