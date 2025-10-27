#!/bin/bash

# Kill ALL AIDIS processes - nuclear option
# Use when stop-aidis.sh fails

echo "💥 Killing ALL AIDIS processes..."

# Find all AIDIS-related processes
AIDIS_PIDS=$(ps aux | grep -E "(aidis|tsx.*server\.ts)" | grep -v grep | awk '{print $2}')

if [ ! -z "$AIDIS_PIDS" ]; then
    echo "🎯 Found AIDIS processes: $AIDIS_PIDS"
    echo "$AIDIS_PIDS" | xargs kill -9
    echo "✅ All AIDIS processes terminated"
    
    # Clean up PID files
    rm -f logs/aidis.pid run/aidis*.pid mcp-server/aidis.pid
    echo "🧹 Cleaned up PID files"
else
    echo "ℹ️  No AIDIS processes found"
fi
