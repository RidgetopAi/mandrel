#!/bin/bash
set -e

echo "🔄 AIDIS Recovery Script"
echo "========================"
echo "This will restore to commit 6e930b1 (pre-Mandrel rename)"
echo ""

read -p "Are you sure you want to proceed? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "Recovery cancelled."
  exit 0
fi

cd /home/ridgetop/aidis

echo "Step 1: Stopping services..."
./stop-aidis.sh 2>/dev/null || true
pkill -f "aidis-command" 2>/dev/null || true
sleep 2

echo "Step 2: Stashing changes..."
git stash save "recovery-stash-$(date +%Y%m%d-%H%M%S)"

echo "Step 3: Hard reset to snapshot..."
git reset --hard 6e930b1

echo "Step 4: Verify branch..."
git checkout aidis-stab

echo "Step 5: Cleaning build artifacts..."
find . -name "dist" -type d -prune -exec rm -rf {} \; 2>/dev/null || true

echo "Step 6: Rebuilding..."
cd mcp-server && npm run build
cd ../aidis-command/backend && npm run build

echo "Step 7: Starting services..."
cd /home/ridgetop/aidis
./start-aidis.sh

sleep 3

echo ""
echo "✅ Recovery complete!"
echo "Git commit: $(git log -1 --oneline)"
echo "Branch: $(git branch --show-current)"
echo ""
echo "Run verification:"
echo "  curl -X POST http://localhost:8080/mcp/tools/aidis_ping -H 'Content-Type: application/json' -d '{\"message\": \"test\"}'"
