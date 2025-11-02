#!/bin/bash
# Enable Spindles Proxy for Claude Code
# Usage: source ./enable-proxy.sh

export ANTHROPIC_BASE_URL=http://localhost:8082

echo "✅ Spindles Proxy ENABLED"
echo "📡 ANTHROPIC_BASE_URL = $ANTHROPIC_BASE_URL"
echo ""
echo "🎡 All Claude Code sessions will now route through the proxy"
echo "💭 Thinking blocks will be captured to: logs/spindles.jsonl"
echo ""
echo "To disable: unset ANTHROPIC_BASE_URL"
