#!/bin/bash

# AIDIS Staging Environment Stop Script
# Gracefully stops all staging services

cd "$(dirname "$0")"

echo "🛑 Stopping AIDIS Staging Environment..."

# Function to stop a service safely
stop_service() {
    local service_name=$1
    local pid_file=$2
    
    if [ -f "$pid_file" ]; then
        PID=$(cat "$pid_file")
        if ps -p $PID > /dev/null 2>&1; then
            echo "🛑 Stopping $service_name (PID: $PID)..."
            kill $PID
            
            # Wait for graceful shutdown
            local count=0
            while ps -p $PID > /dev/null 2>&1 && [ $count -lt 10 ]; do
                sleep 1
                count=$((count + 1))
            done
            
            # Force kill if still running
            if ps -p $PID > /dev/null 2>&1; then
                echo "⚡ Force killing $service_name..."
                kill -9 $PID 2>/dev/null || true
            fi
            
            echo "✅ $service_name stopped"
        else
            echo "⚠️  $service_name PID file exists but process not running"
        fi
        
        rm -f "$pid_file"
    else
        echo "⚠️  $service_name not running (no PID file)"
    fi
}

# Stop services in reverse order
stop_service "Frontend" "run/staging-frontend.pid"
stop_service "Backend" "run/staging-backend.pid"  
stop_service "MCP Server" "run/staging-mcp.pid"

# Clean up temporary files
echo "🧹 Cleaning up temporary files..."
rm -f staging-frontend-config.js

# Check for any remaining processes
echo "🔍 Checking for remaining staging processes..."
REMAINING=$(ps aux | grep -E "(staging|9080|6000|3001)" | grep -v grep | wc -l)
if [ $REMAINING -gt 0 ]; then
    echo "⚠️  Found $REMAINING potentially related processes:"
    ps aux | grep -E "(staging|9080|6000|3001)" | grep -v grep
    echo "💡 You may need to manually kill these processes"
else
    echo "✅ No remaining staging processes found"
fi

echo ""
echo "🎉 AIDIS Staging Environment Stopped"
echo "🚀 Restart with: ./start-staging-all.sh"
