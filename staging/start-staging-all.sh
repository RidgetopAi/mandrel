#!/bin/bash

# AIDIS Complete Staging Environment Startup
# Starts all staging services in the correct order

cd "$(dirname "$0")"

echo "🧪 Starting AIDIS Complete Staging Environment..."
echo "================================================="

# Ensure staging directory structure
mkdir -p logs run

# 1. Setup database (if needed)
if ! psql -h localhost -p 5432 -d aidis_staging -c "SELECT 1;" > /dev/null 2>&1; then
    echo "📦 Setting up staging database..."
    ./setup-staging-database.sh
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
echo "   Frontend:  http://localhost:3001"
echo "   Backend:   http://localhost:6000"  
echo "   MCP HTTP:  http://localhost:9090 (+ STDIO)"
echo ""
echo "🗄️  Database:  aidis_staging"
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

if curl -s http://localhost:6000/healthz > /dev/null 2>&1; then
    echo "✅ Backend healthy"
else
    echo "❌ Backend unhealthy"
fi

if curl -s http://localhost:3001 > /dev/null 2>&1; then
    echo "✅ Frontend accessible"
else
    echo "❌ Frontend inaccessible"
fi

DB_CHECK=$(psql -h localhost -p 5432 -d aidis_staging -t -c "SELECT count(*) FROM projects;" 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "✅ Database connected ($DB_CHECK projects)"
else
    echo "❌ Database connection failed"
fi

echo ""
echo "🚀 Staging environment ready for testing!"
