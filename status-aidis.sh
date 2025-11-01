#!/bin/bash

# DEPRECATED: This script has been renamed to status-mandrel.sh
# This wrapper is provided for backward compatibility

cd "$(dirname "$0")"

echo "⚠️  DEPRECATION WARNING: status-aidis.sh is deprecated"
echo "📝 Please use status-mandrel.sh instead"
echo "🔄 Forwarding to status-mandrel.sh..."
echo ""

exec ./status-mandrel.sh "$@"
