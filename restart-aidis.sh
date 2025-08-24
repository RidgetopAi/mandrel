#!/bin/bash

# AIDIS Simple Process Restarter
# Quick restart for development workflow

cd "$(dirname "$0")"

echo "🔄 Restarting AIDIS MCP Server..."

./stop-aidis.sh
sleep 1
./start-aidis.sh

echo "🎯 AIDIS restart complete!"
