#!/bin/bash

# AIDIS Staging Environment Restart Script
# Stops and starts all staging services

cd "$(dirname "$0")"

echo "🔄 Restarting AIDIS Staging Environment..."

# Stop all services first
echo "🛑 Stopping current services..."
./stop-staging.sh

echo ""
echo "⏳ Waiting 5 seconds for complete shutdown..."
sleep 5

echo ""
echo "🚀 Starting services..."
./start-staging-all.sh

echo ""
echo "🎉 Staging environment restarted!"
