#!/bin/bash

# CI-friendly fuzz testing script for AIDIS Phase 5 verification
# Returns appropriate exit codes for CI/CD pipelines

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🔥 AIDIS MCP Fuzz Testing - CI Mode"
echo "=================================="

# Create results directory
mkdir -p "$PROJECT_ROOT/fuzz-results"

# Run the fuzz tests
cd "$PROJECT_ROOT"

echo "⚡ Running quick fuzz test for CI validation..."
npx tsx run-fuzz-tests.ts quick

echo "✅ Fuzz testing completed successfully!"
echo "📊 Check fuzz-results/ directory for detailed results"