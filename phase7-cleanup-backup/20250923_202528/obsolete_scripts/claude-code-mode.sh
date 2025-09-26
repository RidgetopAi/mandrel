#!/bin/bash

# CLAUDE CODE MODE - Start AIDIS HTTP service for Claude Code integration
# Claude Code uses HTTP bridge while Amp uses direct STDIO

echo "🔗 Preparing for Claude Code session..."

# Stop any existing AIDIS processes
./stop-aidis.sh 2>/dev/null

# Clean PID files
rm -f logs/aidis.pid run/aidis*.pid mcp-server/aidis.pid

# Start AIDIS with HTTP endpoints for Claude Code
echo "🚀 Starting AIDIS HTTP service for Claude Code..."
./start-aidis.sh

echo "✅ Claude Code mode ready!"
echo "💡 Architecture:"
echo "   Claude Code (MCP STDIO) → HTTP Bridge → AIDIS HTTP Service (port 8080)"
echo "🔄 To return to Amp mode: ./amp-mode.sh"
