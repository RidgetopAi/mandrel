#!/bin/bash

# DEPRECATED: This script has been renamed to start-mandrel.sh
# This wrapper is provided for backward compatibility

cd "$(dirname "$0")"

echo "⚠️  DEPRECATION WARNING: start-aidis.sh is deprecated"
echo "📝 Please use start-mandrel.sh instead"
echo "🔄 Forwarding to start-mandrel.sh..."
echo ""

exec ./start-mandrel.sh "$@"
