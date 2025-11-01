#!/bin/bash

# DEPRECATED: This script has been renamed to kill-mandrel.sh
# This wrapper is provided for backward compatibility

cd "$(dirname "$0")"

echo "⚠️  DEPRECATION WARNING: kill-aidis.sh is deprecated"
echo "📝 Please use kill-mandrel.sh instead"
echo "🔄 Forwarding to kill-mandrel.sh..."
echo ""

exec ./kill-mandrel.sh "$@"
