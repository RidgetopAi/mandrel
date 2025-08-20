#!/bin/bash
# AIDIS User SystemD Service Setup
# Avoids sudo password issues by using user services

echo "🔧 Setting up AIDIS User SystemD Service..."

# Stop manual server if running
echo "🛑 Stopping manual server processes..."
pkill -f "tsx src/server.ts" || true
sleep 2

# Create user systemd directory
mkdir -p ~/.config/systemd/user

# Copy service file to user location
cp /home/ridgetop/aidis/aidis-user.service ~/.config/systemd/user/aidis.service

# Reload user daemon
systemctl --user daemon-reload

# Enable and start service
echo "🚀 Starting AIDIS user service..."
systemctl --user enable aidis
systemctl --user start aidis

# Check status
sleep 3
echo "📊 Service Status:"
systemctl --user status aidis --no-pager

echo "🏥 Health Check:"
curl -s http://localhost:8080/healthz | jq . || echo "Health check failed"

echo "✅ AIDIS User SystemD Service Setup Complete!"
echo "🔗 MCP Proxy should now detect running service"
