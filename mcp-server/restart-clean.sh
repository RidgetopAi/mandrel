#!/bin/bash

echo "🧹 Cleaning up AIDIS processes..."

# Kill all AIDIS-related processes
pkill -f "src/server.ts" 2>/dev/null || true
pkill -f "aidis" 2>/dev/null || true  
pkill -f "tsx.*server" 2>/dev/null || true

# Wait for processes to terminate
sleep 2

# Force kill any remaining processes
pkill -9 -f "src/server.ts" 2>/dev/null || true
pkill -9 -f "tsx.*server" 2>/dev/null || true

# Clean up any lingering connections
lsof -ti:8080 | xargs kill -9 2>/dev/null || true

echo "✅ All AIDIS processes terminated"
echo "🚀 Starting fresh AIDIS server..."

# Start the server in the background
cd /home/ridgetop/aidis/mcp-server
npx tsx src/server.ts &

# Wait a moment for startup
sleep 3

echo "📊 Current AIDIS processes:"
ps aux | grep -E "(aidis|tsx.*server)" | grep -v grep
echo "✅ AIDIS restart complete!"
