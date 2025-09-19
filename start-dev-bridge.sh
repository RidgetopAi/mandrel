#!/bin/bash

# AIDIS Dev Environment - Start HTTP-MCP Bridge
# This script ensures the bridge is running for aidis-command-dev

cd "$(dirname "$0")"

# Load centralized configuration
NODE_ENV=${NODE_ENV:-development}
echo "🔧 Loading configuration for environment: $NODE_ENV"

# Source centralized environment config if it exists
if [ -f "config/environments/.env.$NODE_ENV" ]; then
    echo "📄 Loading config from: config/environments/.env.$NODE_ENV"
    export $(grep -v '^#' "config/environments/.env.$NODE_ENV" | xargs)
fi

# Set port from environment variable with fallback
BRIDGE_PORT=${AIDIS_MCP_BRIDGE_PORT:-${MCP_BRIDGE_PORT:-8081}}

echo "🌉 Starting AIDIS Dev HTTP-MCP Bridge on port $BRIDGE_PORT..."

# Check if already running
if ss -tlnp | grep -q ":$BRIDGE_PORT"; then
    echo "⚠️  Port $BRIDGE_PORT already in use. Checking if it's our bridge..."

    if curl -s localhost:$BRIDGE_PORT/health | grep -q "Simple HTTP-MCP Bridge"; then
        echo "✅ HTTP-MCP Bridge already running and healthy on port $BRIDGE_PORT"
        exit 0
    else
        echo "❌ Something else is using port $BRIDGE_PORT"
        echo "🔧 Kill the process and run this script again"
        exit 1
    fi
fi

# Ensure log directory exists
mkdir -p logs

# Start the bridge with configured port
echo "🚀 Starting HTTP-MCP Bridge on port $BRIDGE_PORT..."
HOST=localhost PORT=$BRIDGE_PORT nohup node scripts/simple-http-bridge.js > logs/http-bridge.log 2>&1 &
BRIDGE_PID=$!

# Wait for it to start
sleep 2

# Verify it's running
if ss -tlnp | grep -q ":$BRIDGE_PORT"; then
    echo "✅ HTTP-MCP Bridge started successfully (PID: $BRIDGE_PID)"
    echo "📡 Health check: curl http://localhost:$BRIDGE_PORT/health"
    echo "📋 Logs: tail -f ~/aidis/logs/http-bridge.log"
    echo "🔧 Port configuration: AIDIS_MCP_BRIDGE_PORT=$BRIDGE_PORT"
    echo ""
    echo "🎯 Ready for aidis-command-dev backend connections!"
    echo "💡 Now you can run: cd aidis-command-dev && npm run dev:full"
else
    echo "❌ Failed to start HTTP-MCP Bridge"
    echo "📋 Check logs: tail ~/aidis/logs/http-bridge.log"
    exit 1
fi
