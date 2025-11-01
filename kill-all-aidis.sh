#!/bin/bash

# DEPRECATED: This script has been renamed to kill-all-mandrel.sh
# This wrapper is provided for backward compatibility

cd "$(dirname "$0")"

echo "⚠️  DEPRECATION WARNING: kill-all-aidis.sh is deprecated"
echo "📝 Please use kill-all-mandrel.sh instead"
echo "🔄 Forwarding to kill-all-mandrel.sh..."
echo ""

exec ./kill-all-mandrel.sh "$@"
