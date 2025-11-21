#!/bin/bash
# Quick start script for spindles viewer

cd "$(dirname "$0")"

echo "╔════════════════════════════════════════════════╗"
echo "║  🎡 Starting Spindles Viewer...                ║"
echo "╚════════════════════════════════════════════════╝"
echo ""
echo "📂 Working directory: $(pwd)"
echo ""

# Check if node is available
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"
echo ""

# Start the server
node server.js
