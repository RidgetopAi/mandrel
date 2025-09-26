#!/bin/bash

# AIDIS Complete Staging Environment Startup
# Starts all staging services in the correct order

cd "$(dirname "$0")"

# Load staging configuration
export NODE_ENV=staging
echo "🔧 Loading staging configuration..."

# Source centralized environment config if it exists
if [ -f "../config/environments/.env.staging" ]; then
    echo "📄 Loading config from: ../config/environments/.env.staging"
    export $(grep -v '^#' "../config/environments/.env.staging" | xargs)
fi

# Set environment-specific variables with fallbacks
STAGING_DATABASE=${AIDIS_DATABASE_NAME:-aidis_staging}
FRONTEND_PORT=${AIDIS_COMMAND_DEV_PORT:-3001}
BACKEND_PORT=${AIDIS_COMMAND_PROD_PORT:-6000}
MCP_HTTP_PORT=${AIDIS_HTTP_PORT:-9090}

echo "🧪 Starting AIDIS Complete Staging Environment..."
echo "================================================="
echo "🔧 Configuration:"
echo "   Database: $STAGING_DATABASE"
echo "   Frontend Port: $FRONTEND_PORT"
echo "   Backend Port: $BACKEND_PORT"
echo "   MCP HTTP Port: $MCP_HTTP_PORT"
echo "================================================="

# Ensure staging directory structure
mkdir -p logs run

# 1. Setup database (if needed)
echo "🔍 Checking staging database: $STAGING_DATABASE"
if ! psql -h localhost -p 5432 -d "$STAGING_DATABASE" -c "SELECT 1;" > /dev/null 2>&1; then
    echo "📦 Setting up staging database: $STAGING_DATABASE"
    STAGING_DATABASE="$STAGING_DATABASE" ./setup-staging-database.sh
fi

echo ""

# 2. Start MCP Server
echo "🚀 Starting MCP Server..."
./start-staging-mcp.sh
if [ $? -ne 0 ]; then
    echo "❌ Failed to start MCP Server"
    exit 1
fi

echo ""

# 3. Start Backend HTTP Bridge 
echo "🌐 Starting Backend Server..."
sleep 2  # Give MCP server time to fully start
./start-staging-backend.sh
if [ $? -ne 0 ]; then
    echo "❌ Failed to start Backend Server"
    ./stop-staging.sh
    exit 1
fi

echo ""

# 4. Start Frontend
echo "🎨 Starting Frontend Server..."
sleep 2  # Give backend time to fully start
./start-staging-frontend.sh
if [ $? -ne 0 ]; then
    echo "❌ Failed to start Frontend Server"
    ./stop-staging.sh
    exit 1
fi

echo ""
echo "🎉 AIDIS Staging Environment Started Successfully!"
echo "================================================="
echo ""
echo "📊 Service URLs:"
echo "   Frontend:  http://localhost:$FRONTEND_PORT"
echo "   Backend:   http://localhost:$BACKEND_PORT"
echo "   MCP HTTP:  http://localhost:$MCP_HTTP_PORT (+ STDIO)"
echo ""
echo "🗄️  Database:  $STAGING_DATABASE"
echo ""
echo "📋 Logs:"
echo "   MCP:       tail -f staging/logs/mcp-staging.log"
echo "   Backend:   tail -f staging/logs/backend-staging.log"  
echo "   Frontend:  tail -f staging/logs/frontend-staging.log"
echo ""
echo "🔧 Management:"
echo "   Status:    ./status-staging.sh"
echo "   Stop:      ./stop-staging.sh"
echo "   Restart:   ./restart-staging.sh"
echo ""

# Quick health check
echo "🔍 Quick Health Check:"
sleep 3

if curl -s http://localhost:$BACKEND_PORT/healthz > /dev/null 2>&1; then
    echo "✅ Backend healthy (port $BACKEND_PORT)"
else
    echo "❌ Backend unhealthy (port $BACKEND_PORT)"
fi

if curl -s http://localhost:$FRONTEND_PORT > /dev/null 2>&1; then
    echo "✅ Frontend accessible (port $FRONTEND_PORT)"
else
    echo "❌ Frontend inaccessible (port $FRONTEND_PORT)"
fi

DB_CHECK=$(psql -h localhost -p 5432 -d "$STAGING_DATABASE" -t -c "SELECT count(*) FROM projects;" 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "✅ Database connected ($DB_CHECK projects)"
else
    echo "❌ Database connection failed"
fi

echo ""
echo "🚀 Staging environment ready for testing!"
