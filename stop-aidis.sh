#!/bin/bash

# AIDIS Simple Process Stopper
# Gracefully stops AIDIS MCP server

cd "$(dirname "$0")"

echo "🛑 Stopping AIDIS MCP Server..."

if [ ! -f logs/aidis.pid ]; then
    echo "⚠️  No PID file found - AIDIS may not be running"
    
    # Try to find and kill any running AIDIS processes
    AIDIS_PIDS=$(ps aux | grep "tsx src/server.ts" | grep -v grep | awk '{print $2}')
    if [ ! -z "$AIDIS_PIDS" ]; then
        echo "🔍 Found running AIDIS processes: $AIDIS_PIDS"
        echo "$AIDIS_PIDS" | xargs kill
        echo "✅ Killed orphaned AIDIS processes"
    else
        echo "ℹ️  No AIDIS processes found running"
    fi
    exit 0
fi

PID=$(cat logs/aidis.pid)

if ps -p $PID > /dev/null 2>&1; then
    echo "🛑 Stopping AIDIS (PID: $PID)"
    kill $PID
    
    # Wait for graceful shutdown
    sleep 2
    
    if ps -p $PID > /dev/null 2>&1; then
        echo "⚡ Forcing shutdown..."
        kill -9 $PID
    fi
    
    rm logs/aidis.pid
    echo "✅ AIDIS stopped successfully"
else
    echo "⚠️  Process $PID not found - cleaning stale PID file"
    rm logs/aidis.pid
fi
