#!/bin/bash
# Capture the next full request/response through the proxy

DUMP_FILE="logs/raw-dumps/capture-$(date +%Y%m%d-%H%M%S).txt"

echo "🎥 Will capture next request to: $DUMP_FILE"
echo "📡 Make your Claude Code request now..."
echo ""

# Tail the proxy logs and capture the next full stream
timeout 60 tail -f /dev/null 2>/dev/null &
TAIL_PID=$!

# Wait for new traffic and capture it
echo "Waiting for traffic (60 second timeout)..."
echo "Press Ctrl+C to stop"

# This won't work perfectly since logs go to stdout of the background process
# Better approach: tell the user to check the background process logs

echo ""
echo "❌ This script can't capture from background process"
echo ""
echo "Instead, run this command to see the full logs:"
echo ""
echo "  # Check recent proxy logs:"
echo "  tail -1000 <(docker logs spindles-proxy 2>&1) | less"
echo ""
echo "Or check the background process output:"
echo "  BashOutput tool with the proxy's bash_id"
