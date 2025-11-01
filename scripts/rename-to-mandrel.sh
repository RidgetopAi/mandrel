#!/bin/bash
set -e

echo "🐙 AIDIS → Mandrel Rename Script (THE KRAKEN)"
echo "=============================================="

BASE_DIR="/home/ridgetop/aidis"
cd "$BASE_DIR"

# Phase 1: Rename main directory
echo "📁 Phase 1: Renaming aidis-command/ → mandrel-command/"
if [ -d "aidis-command" ]; then
    git mv aidis-command mandrel-command
    echo "  ✓ Directory renamed"
else
    echo "  ⚠ aidis-command directory not found or already renamed"
fi

# Phase 2: Rename core TypeScript files
echo "📝 Phase 2: Renaming core files..."

# AidisMcpServer.ts → MandrelMcpServer.ts
if [ -f "mcp-server/src/server/AidisMcpServer.ts" ]; then
    git mv mcp-server/src/server/AidisMcpServer.ts mcp-server/src/server/MandrelMcpServer.ts
    echo "  ✓ AidisMcpServer.ts → MandrelMcpServer.ts"
fi

# aidisApiClient.ts → mandrelApiClient.ts
if [ -f "mandrel-command/frontend/src/api/aidisApiClient.ts" ]; then
    git mv mandrel-command/frontend/src/api/aidisApiClient.ts mandrel-command/frontend/src/api/mandrelApiClient.ts
    echo "  ✓ aidisApiClient.ts → mandrelApiClient.ts"
fi

# useAidisV2Status.ts → useMandrelV2Status.ts
if [ -f "mandrel-command/frontend/src/hooks/useAidisV2Status.ts" ]; then
    git mv mandrel-command/frontend/src/hooks/useAidisV2Status.ts mandrel-command/frontend/src/hooks/useMandrelV2Status.ts
    echo "  ✓ useAidisV2Status.ts → useMandrelV2Status.ts"
fi

# AidisApiErrorBoundary.tsx → MandrelApiErrorBoundary.tsx
if [ -f "mandrel-command/frontend/src/components/error/AidisApiErrorBoundary.tsx" ]; then
    git mv mandrel-command/frontend/src/components/error/AidisApiErrorBoundary.tsx mandrel-command/frontend/src/components/error/MandrelApiErrorBoundary.tsx
    echo "  ✓ AidisApiErrorBoundary.tsx → MandrelApiErrorBoundary.tsx"
fi

# AidisV2ApiTest.tsx → MandrelV2ApiTest.tsx
if [ -f "mandrel-command/frontend/src/components/testing/AidisV2ApiTest.tsx" ]; then
    git mv mandrel-command/frontend/src/components/testing/AidisV2ApiTest.tsx mandrel-command/frontend/src/components/testing/MandrelV2ApiTest.tsx
    echo "  ✓ AidisV2ApiTest.tsx → MandrelV2ApiTest.tsx"
fi

# Rename other aidis-*.ts files in mcp-server
for file in mcp-server/aidis-*.ts; do
    if [ -f "$file" ]; then
        newname=$(echo "$file" | sed 's/aidis-/mandrel-/')
        git mv "$file" "$newname"
        echo "  ✓ $(basename $file) → $(basename $newname)"
    fi
done

echo ""
echo "✅ Phase 1 & 2 complete - Core files renamed"
echo "   Next: Run content replacement script"
