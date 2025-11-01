#!/bin/bash

# DEPRECATED: This script has been renamed to start-mandrel-bridge.sh
# This wrapper is provided for backward compatibility

cd "$(dirname "$0")"

echo "⚠️  DEPRECATION WARNING: start-aidis-bridge.sh is deprecated"
echo "📝 Please use start-mandrel-bridge.sh instead"
echo "🔄 Forwarding to start-mandrel-bridge.sh..."
echo ""

exec ./start-mandrel-bridge.sh "$@"
