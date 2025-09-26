#!/bin/bash

# AIDIS Staging MCP Server Startup Script
# Runs MCP server with staging configuration on port 9080

cd "$(dirname "$0")"

echo "🚀 Starting AIDIS Staging MCP Server..."

# Ensure staging directory structure exists
mkdir -p logs
mkdir -p run

# Check if already running
STAGING_PID_FILE="run/staging-mcp.pid"
if [ -f "$STAGING_PID_FILE" ]; then
    PID=$(cat "$STAGING_PID_FILE")
    if ps -p $PID > /dev/null 2>&1; then
        echo "⚠️  Staging MCP already running (PID: $PID)"
        echo "💡 Use ./stop-staging.sh first or ./restart-staging.sh"
        exit 1
    else
        echo "🧹 Cleaning stale PID file"
        rm "$STAGING_PID_FILE"
    fi
fi

# Load staging environment
export NODE_ENV=staging

# Create a temporary .env file for staging MCP server
cp .env.staging ../mcp-server/.env.staging

# Start staging MCP server with staging env file and separate lock file
cd ../mcp-server
AIDIS_LOCK_FILE="../staging/run/staging-aidis.pid" AIDIS_HTTP_PORT=9090 AIDIS_HEALTH_PORT=9090 NODE_ENV=staging DATABASE_URL=postgresql://ridgetop@localhost:5432/aidis_staging npx tsx src/server.ts > ../staging/logs/mcp-staging.log 2>&1 &
STAGING_PID=$!

# Save PID for management
echo $STAGING_PID > "../staging/$STAGING_PID_FILE"

# Wait a moment and verify startup
sleep 3

if ps -p $STAGING_PID > /dev/null 2>&1; then
    echo "✅ Staging MCP Server started successfully (PID: $STAGING_PID)"
    echo "🔗 MCP STDIO Protocol + HTTP Server on 9090"
    echo "📋 Logs: tail -f staging/logs/mcp-staging.log"
    echo "🧪 Database: aidis_staging"
    echo "🏥 Health: curl http://localhost:9090/healthz"
    echo "🛑 Stop: ./stop-staging.sh"
    
    # Test database connection
    echo "🔍 Testing database connection..."
    if psql -h localhost -p 5432 -d aidis_staging -c "SELECT 1;" > /dev/null 2>&1; then
        echo "✅ Database connection successful"
    else
        echo "❌ Database connection failed"
    fi
else
    echo "❌ Failed to start Staging MCP Server"
    echo "📋 Check logs: tail staging/logs/mcp-staging.log"
    rm -f "../staging/$STAGING_PID_FILE"
    exit 1
fi
