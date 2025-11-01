#!/bin/bash

# DEPRECATED: This script has been renamed to restart-mandrel.sh
# This wrapper is provided for backward compatibility

cd "$(dirname "$0")"

echo "⚠️  DEPRECATION WARNING: restart-aidis.sh is deprecated"
echo "📝 Please use restart-mandrel.sh instead"
echo "🔄 Forwarding to restart-mandrel.sh..."
echo ""

exec ./restart-mandrel.sh "$@"
