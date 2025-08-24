#!/bin/bash

# AIDIS Simple Process Starter
# Replaces SystemD service with basic process management

cd "$(dirname "$0")"

echo "🚀 Starting AIDIS MCP Server..."

# Ensure logs directory exists
mkdir -p logs

# Check if already running
if [ -f logs/aidis.pid ]; then
    PID=$(cat logs/aidis.pid)
    if ps -p $PID > /dev/null 2>&1; then
        echo "⚠️  AIDIS already running (PID: $PID)"
        echo "💡 Use ./stop-aidis.sh first or ./restart-aidis.sh"
        exit 1
    else
        echo "🧹 Cleaning stale PID file"
        rm logs/aidis.pid
    fi
fi

# Start AIDIS MCP server with direct STDIO for MCP protocol
cd mcp-server
npx tsx src/server.ts > ../logs/aidis.log 2>&1 &
AIDIS_PID=$!

# Save PID for management
echo $AIDIS_PID > ../logs/aidis.pid

# Wait a moment and verify startup
sleep 3

if ps -p $AIDIS_PID > /dev/null 2>&1; then
    echo "✅ AIDIS MCP Server started successfully (PID: $AIDIS_PID)"
    echo "📋 Logs: tail -f logs/aidis.log"
    echo "🏥 Health: curl http://localhost:8080/healthz"
    echo "🛑 Stop: ./stop-aidis.sh"
else
    echo "❌ Failed to start AIDIS"
    echo "📋 Check logs: tail logs/aidis.log"
    rm -f ../logs/aidis.pid
    exit 1
fi
