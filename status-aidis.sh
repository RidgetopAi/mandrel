#!/bin/bash

# AIDIS Simple Process Status Checker
# Quick health and status check

cd "$(dirname "$0")"

echo "🔍 AIDIS Status Check..."

# Check PID file
if [ -f logs/aidis.pid ]; then
    PID=$(cat logs/aidis.pid)
    if ps -p $PID > /dev/null 2>&1; then
        echo "✅ AIDIS Process: Running (PID: $PID)"
    else
        echo "❌ AIDIS Process: Stopped (stale PID file)"
    fi
else
    echo "❌ AIDIS Process: No PID file found"
fi

# Check health endpoint
echo "🏥 Health Check:"
HEALTH=$(curl -s http://localhost:8080/healthz 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "✅ Health Endpoint: $HEALTH"
else
    echo "❌ Health Endpoint: Not responding"
fi

# Check port usage
echo "🔌 Port Usage:"
PORT_8080=$(ss -tlnp | grep :8080)
if [ ! -z "$PORT_8080" ]; then
    echo "✅ Port 8080: $PORT_8080"
else
    echo "❌ Port 8080: Not in use"
fi

# Show recent log entries
echo "📋 Recent Logs (last 5 lines):"
if [ -f logs/aidis.log ]; then
    tail -5 logs/aidis.log
else
    echo "❌ No log file found"
fi
