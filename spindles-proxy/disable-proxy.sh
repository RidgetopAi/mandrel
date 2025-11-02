#!/bin/bash
# Disable Spindles Proxy for Claude Code
# Usage: source ./disable-proxy.sh

unset ANTHROPIC_BASE_URL

echo "❌ Spindles Proxy DISABLED"
echo "📡 ANTHROPIC_BASE_URL = (not set)"
echo ""
echo "🌐 Claude Code will now connect directly to Anthropic API"
