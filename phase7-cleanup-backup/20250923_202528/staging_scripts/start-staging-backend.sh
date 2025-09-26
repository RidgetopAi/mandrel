#!/bin/bash

# AIDIS Staging Backend HTTP Server Startup Script  
# Runs HTTP bridge and web backend on port 6000

cd "$(dirname "$0")"

echo "🌐 Starting AIDIS Staging Backend Server..."

# Check if already running
BACKEND_PID_FILE="run/staging-backend.pid"
if [ -f "$BACKEND_PID_FILE" ]; then
    PID=$(cat "$BACKEND_PID_FILE")
    if ps -p $PID > /dev/null 2>&1; then
        echo "⚠️  Staging Backend already running (PID: $PID)"
        echo "💡 Use ./stop-staging.sh first"
        exit 1
    else
        echo "🧹 Cleaning stale backend PID file"
        rm "$BACKEND_PID_FILE"
    fi
fi

# Load staging environment variables
export NODE_ENV=staging
export HTTP_PORT=6000
export MCP_PORT=9080

# Start staging HTTP backend using staging bridge
NODE_ENV=staging HTTP_PORT=6000 MCP_PORT=9080 node claude-http-mcp-bridge-staging.js > logs/backend-staging.log 2>&1 &
BACKEND_PID=$!

# Save PID for management
echo $BACKEND_PID > "$BACKEND_PID_FILE"

# Wait a moment and verify startup
sleep 3

if ps -p $BACKEND_PID > /dev/null 2>&1; then
    echo "✅ Staging Backend started successfully (PID: $BACKEND_PID)"
    echo "🔗 Backend Port: 6000"
    echo "📋 Backend Logs: tail -f staging/logs/backend-staging.log"
    echo "🏥 Health Check: curl http://localhost:6000/healthz"
    
    # Test backend health
    echo "🔍 Testing backend health..."
    if curl -s http://localhost:6000/healthz > /dev/null 2>&1; then
        echo "✅ Backend health check successful"
    else
        echo "❌ Backend health check failed"
    fi
else
    echo "❌ Failed to start Staging Backend"
    echo "📋 Check logs: tail staging/logs/backend-staging.log"  
    rm -f "$BACKEND_PID_FILE"
    exit 1
fi
