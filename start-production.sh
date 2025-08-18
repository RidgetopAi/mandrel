#!/bin/bash
# AIDIS Command Production Startup Script

echo "🚀 Starting AIDIS Command Production Environment..."
echo ""

# Check if we're in the right directory
if [ ! -d "aidis-command" ]; then
    echo "❌ Error: Must run from ~/aidis/ directory"
    echo "   Current directory: $(pwd)"
    echo "   Expected: /home/ridgetop/aidis/"
    exit 1
fi

echo "📂 Changing to aidis-command directory..."
cd aidis-command

echo "🔧 Installing dependencies if needed..."
npm install

echo ""
echo "🎯 Starting Production Services:"
echo "   • Backend: http://localhost:5000"
echo "   • Frontend: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both services"
echo ""

# Start both services
npm run dev:full
