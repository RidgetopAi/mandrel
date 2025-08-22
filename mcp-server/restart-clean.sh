#!/bin/bash

echo "🧹 Cleaning up AIDIS processes..."

# Stop systemd service first if running
systemctl --user stop aidis 2>/dev/null || true

# Kill any manual processes
pkill -f "src/server.ts" 2>/dev/null || true
pkill -f "tsx.*server" 2>/dev/null || true

# Wait for processes to terminate
sleep 2

# Force kill any remaining processes
pkill -9 -f "src/server.ts" 2>/dev/null || true
pkill -9 -f "tsx.*server" 2>/dev/null || true

# Clean up any lingering connections
lsof -ti:8080 | xargs kill -9 2>/dev/null || true

echo "✅ All AIDIS processes terminated"
echo "🚀 Starting AIDIS via systemd service..."

# Start via systemd (your original setup)
systemctl --user start aidis

# Wait a moment for startup
sleep 5

echo "📊 AIDIS systemd status:"
systemctl --user status aidis --no-pager -l
echo "✅ AIDIS restart complete!"
