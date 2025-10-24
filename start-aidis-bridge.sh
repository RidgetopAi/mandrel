#!/bin/bash

# AIDIS HTTP Bridge Mode Starter
# Starts AIDIS with HTTP bridge ONLY (no direct STDIO)
# For use with AmpCode (via stdio-mock) and Claude Code (direct HTTP)

cd "$(dirname "$0")"

echo "🌉 Starting AIDIS in HTTP Bridge Mode..."

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

# Start AIDIS in HTTP-only mode (SKIP STDIO)
cd mcp-server
AIDIS_SKIP_STDIO=true npx tsx src/main.ts > ../logs/aidis.log 2>&1 &
AIDIS_PID=$!

# Save PID for management
echo $AIDIS_PID > ../logs/aidis.pid

# Wait a moment and verify startup
sleep 3

if ps -p $AIDIS_PID > /dev/null 2>&1; then
    echo "✅ AIDIS HTTP Bridge started successfully (PID: $AIDIS_PID)"
    echo "📋 Logs: tail -f logs/aidis.log"
    echo ""
    echo "🌉 HTTP Bridge Mode:"
    echo "   • AmpCode → stdio-mock → HTTP:8080 ✅"
    echo "   • Claude Code → HTTP:8080 directly ✅"
    echo "   • Direct STDIO: DISABLED (clean!)"

    # Check port registry for actual assigned port
    sleep 2
    if [ -f run/port-registry.json ]; then
        ACTUAL_PORT=$(cat run/port-registry.json | grep -o '"port":[0-9]*' | head -1 | cut -d':' -f2)
        if [ -n "$ACTUAL_PORT" ]; then
            echo ""
            echo "🏥 Health: curl http://localhost:${ACTUAL_PORT}/healthz"
        else
            echo ""
            echo "🏥 Health: curl http://localhost:8080/healthz"
        fi
    else
        echo ""
        echo "🏥 Health: curl http://localhost:8080/healthz"
    fi

    echo "🛑 Stop: ./stop-aidis.sh"
else
    echo "❌ Failed to start AIDIS"
    echo "📋 Check logs: tail logs/aidis.log"
    rm -f ../logs/aidis.pid
    exit 1
fi
