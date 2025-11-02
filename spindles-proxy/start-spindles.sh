#!/bin/bash
# Start the Spindles Proxy server

cd "$(dirname "$0")"

# Check if already running
if lsof -ti:8082 > /dev/null 2>&1; then
    echo "⚠️  Spindles Proxy already running on port 8082"
    exit 1
fi

echo "🎡 Starting Spindles Proxy..."
npm start &

# Wait for server to start
sleep 2

if lsof -ti:8082 > /dev/null 2>&1; then
    echo "✅ Spindles Proxy started on port 8082"
    echo "🏥 Health check: http://localhost:8082/health"
else
    echo "❌ Failed to start Spindles Proxy"
    exit 1
fi
