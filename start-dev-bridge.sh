#!/bin/bash

# AIDIS Dev Environment - Start HTTP-MCP Bridge
# This script ensures the bridge is running for aidis-command-dev

cd "$(dirname "$0")"

echo "🌉 Starting AIDIS Dev HTTP-MCP Bridge..."

# Check if already running
if ss -tlnp | grep -q ":8081"; then
    echo "⚠️  Port 8081 already in use. Checking if it's our bridge..."
    
    if curl -s localhost:8081/health | grep -q "Simple HTTP-MCP Bridge"; then
        echo "✅ HTTP-MCP Bridge already running and healthy"
        exit 0
    else
        echo "❌ Something else is using port 8081"
        echo "🔧 Kill the process and run this script again"
        exit 1
    fi
fi

# Ensure log directory exists
mkdir -p logs

# Start the bridge
echo "🚀 Starting HTTP-MCP Bridge on port 8081..."
nohup node scripts/simple-http-bridge.js > logs/http-bridge.log 2>&1 &
BRIDGE_PID=$!

# Wait for it to start
sleep 2

# Verify it's running
if ss -tlnp | grep -q ":8081"; then
    echo "✅ HTTP-MCP Bridge started successfully (PID: $BRIDGE_PID)"
    echo "📡 Health check: curl http://localhost:8081/health"
    echo "📋 Logs: tail -f ~/aidis/logs/http-bridge.log"
    echo ""
    echo "🎯 Ready for aidis-command-dev backend connections!"
    echo "💡 Now you can run: cd aidis-command-dev && npm run dev:full"
else
    echo "❌ Failed to start HTTP-MCP Bridge"
    echo "📋 Check logs: tail ~/aidis/logs/http-bridge.log"
    exit 1
fi
