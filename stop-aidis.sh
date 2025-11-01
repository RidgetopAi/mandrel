#!/bin/bash

# DEPRECATED: This script has been renamed to stop-mandrel.sh
# This wrapper is provided for backward compatibility

cd "$(dirname "$0")"

echo "⚠️  DEPRECATION WARNING: stop-aidis.sh is deprecated"
echo "📝 Please use stop-mandrel.sh instead"
echo "🔄 Forwarding to stop-mandrel.sh..."
echo ""

exec ./stop-mandrel.sh "$@"
