#!/bin/bash

# AMP MODE - Stop AIDIS service to avoid conflicts
# Run this before starting Amp sessions

echo "🤖 Preparing for Amp session..."

# Stop any running AIDIS processes
./stop-aidis.sh 2>/dev/null

# Clean PID files
rm -f logs/aidis.pid run/aidis*.pid mcp-server/aidis.pid

# Set environment for future starts
export AMP_CONNECTING=true

echo "✅ Ready for Amp connection!"
echo "💡 Amp will spawn its own MCP server instance"
echo "🔄 To return to standalone mode: unset AMP_CONNECTING && ./start-aidis.sh"
