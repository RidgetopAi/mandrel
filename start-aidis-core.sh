#!/bin/bash

# AIDIS Core HTTP Service Starter
# Starts the pure HTTP API service (no STDIO)

cd "$(dirname "$0")"

echo "🚀 Starting AIDIS Core HTTP Service..."

# Ensure required directories exist
mkdir -p logs run

# Check if already running
if [ -f run/aidis-core.pid ]; then
    PID=$(cat run/aidis-core.pid)
    if ps -p $PID > /dev/null 2>&1; then
        echo "⚠️  AIDIS Core already running (PID: $PID)"
        echo "💡 Use ./stop-aidis.sh first or ./restart-aidis.sh"
        exit 1
    else
        echo "🧹 Cleaning stale PID file"
        rm run/aidis-core.pid
    fi
fi

# Set environment variables
export AIDIS_HTTP_PORT=${AIDIS_HTTP_PORT:-8080}
export NODE_ENV=${NODE_ENV:-development}
export DATABASE_URL=${DATABASE_URL:-postgresql://ridgetop@localhost:5432/aidis_production}
export DATABASE_NAME=${DATABASE_NAME:-aidis_production}
export DATABASE_USER=${DATABASE_USER:-ridgetop}
export DATABASE_HOST=${DATABASE_HOST:-localhost}
export DATABASE_PORT=${DATABASE_PORT:-5432}

# Start AIDIS Core HTTP server
cd mcp-server
npx tsx src/core-server.ts > ../logs/aidis-core.log 2>&1 &
AIDIS_PID=$!

# Save PID for management
echo $AIDIS_PID > ../run/aidis-core.pid

# Wait a moment and verify startup
sleep 3

if ps -p $AIDIS_PID > /dev/null 2>&1; then
    echo "✅ AIDIS Core HTTP Service started successfully (PID: $AIDIS_PID)"
    echo "🌐 HTTP API: http://localhost:${AIDIS_HTTP_PORT}"
    echo "🏥 Health Check: curl http://localhost:${AIDIS_HTTP_PORT}/healthz"
    echo "📋 Tools List: curl http://localhost:${AIDIS_HTTP_PORT}/mcp/tools"
    echo "🔧 Tool Execute: curl -X POST http://localhost:${AIDIS_HTTP_PORT}/mcp/tools/aidis_ping"
    echo "📋 Logs: tail -f logs/aidis-core.log"
    echo "🛑 Stop: ./stop-aidis.sh"
else
    echo "❌ Failed to start AIDIS Core"
    echo "📋 Check logs: tail logs/aidis-core.log"
    rm -f ../run/aidis-core.pid
    exit 1
fi
