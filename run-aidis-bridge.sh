#!/usr/bin/env bash

# DEPRECATED: This script has been renamed to run-mandrel-bridge.sh
# This wrapper is provided for backward compatibility

cd "$(dirname "$0")"

echo "⚠️  DEPRECATION WARNING: run-aidis-bridge.sh is deprecated" >&2
echo "📝 Please use run-mandrel-bridge.sh instead" >&2
echo "🔄 Forwarding to run-mandrel-bridge.sh..." >&2
echo "" >&2

exec ./run-mandrel-bridge.sh "$@"

