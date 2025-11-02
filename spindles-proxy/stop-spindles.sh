#!/bin/bash
# Stop the Spindles Proxy server

echo "🛑 Stopping Spindles Proxy..."

# Kill all tsx processes running server.ts
pkill -f "tsx src/server.ts"

sleep 1

if lsof -ti:8082 > /dev/null 2>&1; then
    echo "⚠️  Port 8082 still in use, force killing..."
    lsof -ti:8082 | xargs kill -9 2>/dev/null
    sleep 1
fi

if ! lsof -ti:8082 > /dev/null 2>&1; then
    echo "✅ Spindles Proxy stopped"
else
    echo "❌ Failed to stop Spindles Proxy"
    exit 1
fi
