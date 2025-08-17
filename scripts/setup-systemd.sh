#!/bin/bash

# AIDIS SystemD Setup Script
# Run with: sudo bash scripts/setup-systemd.sh

echo "🛡️ Setting up AIDIS SystemD service for bulletproof operation..."

# Stop any existing AIDIS processes
echo "🔄 Stopping existing AIDIS processes..."
pkill -f "tsx src/server.ts" || echo "No processes to kill"
sleep 2

# Copy service file
echo "📋 Installing SystemD service file..."
cp /home/ridgetop/aidis/aidis.service /etc/systemd/system/
chmod 644 /etc/systemd/system/aidis.service

# Reload systemd
echo "🔄 Reloading SystemD daemon..."
systemctl daemon-reload

# Enable service for auto-start
echo "⚡ Enabling AIDIS service..."
systemctl enable aidis

# Start the service
echo "🚀 Starting AIDIS service..."
systemctl start aidis

# Check status
echo "📊 Service status:"
systemctl status aidis --no-pager

echo ""
echo "✅ SystemD setup complete!"
echo "🔍 Check logs with: sudo journalctl -u aidis -f"
echo "🔄 Restart with: sudo systemctl restart aidis"
echo "📊 Status with: sudo systemctl status aidis"
