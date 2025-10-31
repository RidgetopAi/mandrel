# 🔄 RECOVERY PLAN: Return to Pre-Mandrel Rename State

**Created**: October 31, 2025 19:39 EDT  
**Purpose**: Restore to stable AIDIS state before Mandrel rebrand execution  
**Snapshot Point**: Post-investigation, pre-implementation

---

## 📸 SNAPSHOT DETAILS

### Git State
- **Repository**: `git@github.com:RidgetopAi/aidis.git`
- **Branch**: `aidis-stab`
- **Commit Hash**: `6e930b134940f4b79cc93a6eddbb372281bdb972`
- **Short Hash**: `6e930b1`
- **Commit Message**: "feat: AIDIS → Mandrel rebrand investigation complete"
- **Commit Date**: 2025-10-31 19:39:15 -0400

### Working Directory State
- **Path**: `/home/ridgetop/aidis`
- **Clean Working Tree**: ✅ Yes (all changes committed)
- **Untracked Files**: None
- **Branch Tracking**: `origin/aidis-stab` (up to date)

### Database State
- **Database Name**: `aidis_production`
- **PostgreSQL Version**: 16.9 (Debian 16.9-1.pgdg120+1)
- **Host**: localhost
- **Port**: 5432
- **User**: ridgetop
- **Status**: ✅ Active and operational

### Key Files at This Snapshot
- ✅ `mandrel-stab.md` - Complete investigation document (1040 lines)
- ✅ All source code uses "AIDIS" branding
- ✅ All package names: `aidis-*`
- ✅ All env vars: `AIDIS_*`
- ✅ Database: `aidis_production`

---

## 🚨 WHEN TO USE THIS RECOVERY PLAN

Use this plan if:
- Mandrel rename causes breaking changes
- Build/compilation fails after rename
- Database migrations go wrong
- Service names cause deployment issues
- Need to rollback for any critical production issue
- Want to start the rename process over from scratch

---

## 🔧 RECOVERY PROCEDURE

### Step 1: Stop All Running Services

```bash
# Stop AIDIS MCP Server
cd /home/ridgetop/aidis
./stop-aidis.sh

# Stop AIDIS Command (if running)
cd /home/ridgetop/aidis/aidis-command/backend
pkill -f "node.*aidis-command"

# Verify all stopped
ps aux | grep -i aidis
```

**Expected**: No AIDIS processes running

---

### Step 2: Backup Current State (Optional but Recommended)

```bash
# Create safety backup of whatever state you're in
cd /home/ridgetop
tar -czf aidis-backup-$(date +%Y%m%d-%H%M%S).tar.gz \
  --exclude='aidis/node_modules' \
  --exclude='aidis/*/node_modules' \
  --exclude='aidis/*/dist' \
  --exclude='aidis/**/dist' \
  aidis/

# Verify backup created
ls -lh aidis-backup-*.tar.gz
```

**Expected**: Backup file created in `/home/ridgetop/`

---

### Step 3: Return to Snapshot Commit

```bash
cd /home/ridgetop/aidis

# Check current status
git status

# Stash any uncommitted changes (if you want to keep them)
git stash save "pre-recovery-stash-$(date +%Y%m%d-%H%M%S)"

# Hard reset to snapshot commit
git reset --hard 6e930b1

# Verify you're at the right commit
git log -1 --oneline
```

**Expected Output**:
```
6e930b1 feat: AIDIS → Mandrel rebrand investigation complete
```

---

### Step 4: Ensure Branch Alignment

```bash
# Make sure you're on aidis-stab branch
git checkout aidis-stab

# Pull latest from origin (should be no-op if already synced)
git pull origin aidis-stab

# Verify branch state
git branch -vv
```

**Expected**: On `aidis-stab` branch, tracking `origin/aidis-stab`

---

### Step 5: Clean Build Artifacts

```bash
cd /home/ridgetop/aidis

# Clean mcp-server
cd mcp-server
rm -rf dist/ node_modules/.cache
npm install

# Clean aidis-command
cd ../aidis-command/backend
rm -rf dist/ node_modules/.cache
npm install

cd ../frontend
rm -rf build/ node_modules/.cache
npm install

cd ../..
```

**Expected**: Fresh `node_modules` with AIDIS-branded packages

---

### Step 6: Verify Database State

```bash
# Connect to database
psql -h localhost -p 5432 -U ridgetop -d aidis_production

# Verify key tables exist
\dt

# Check for any Mandrel-related tables/columns (should be none)
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE '%mandrel%';

# Exit psql
\q
```

**Expected**: 
- All original AIDIS tables present
- NO tables with 'mandrel' in the name
- Database named `aidis_production`

---

### Step 7: Verify Configuration Files

```bash
cd /home/ridgetop/aidis

# Check package names
grep -r '"name"' mcp-server/package.json aidis-command/package.json \
  aidis-command/backend/package.json aidis-command/frontend/package.json

# Should all show "aidis-*" names
```

**Expected Output** (sample):
```json
"name": "aidis-mcp-server"
"name": "aidis-command"
"name": "aidis-command-backend"
"name": "aidis-command-frontend"
```

---

### Step 8: Verify Environment Variables

```bash
# Check if any MANDREL_* env vars exist
env | grep -i mandrel

# Should return nothing

# Verify AIDIS_* vars if you have them set
env | grep -i aidis_
```

**Expected**: 
- NO `MANDREL_*` variables
- Original `AIDIS_*` variables (if any were set)

---

### Step 9: Build and Type Check

```bash
cd /home/ridgetop/aidis/mcp-server

# Type check
npm run type-check

# Build
npm run build
```

**Expected**: 
- ✅ Type check passes
- ✅ Build succeeds
- Output in `dist/` directory

```bash
cd /home/ridgetop/aidis/aidis-command/backend

# Type check
npm run type-check

# Build
npm run build
```

**Expected**: 
- ✅ Type check passes
- ✅ Build succeeds

---

### Step 10: Start Services and Verify

```bash
# Start AIDIS MCP Server
cd /home/ridgetop/aidis
./start-aidis.sh

# Wait 5 seconds
sleep 5

# Check if running
ps aux | grep -i "aidis"
```

**Expected**: AIDIS MCP server process running

```bash
# Test MCP server
curl -X POST http://localhost:8080/mcp/tools/aidis_ping \
  -H "Content-Type: application/json" \
  -d '{"message": "recovery test"}'
```

**Expected**: Successful ping response with "AIDIS Pong!"

---

### Step 11: Verify Key Files Exist

```bash
cd /home/ridgetop/aidis

# Verify investigation document exists
ls -lh mandrel-stab.md

# Verify this recovery plan exists
ls -lh docs/plans/RECOVERY-PLAN-pre-mandrel-rename.md

# Verify key source files have AIDIS naming
ls -lh mcp-server/src/server/AidisMcpServer.ts
ls -lh aidis-command/frontend/src/api/aidisApiClient.ts
```

**Expected**: All files exist with AIDIS naming

---

### Step 12: Run Smoke Tests

```bash
cd /home/ridgetop/aidis/mcp-server

# Run test suite (if available)
npm test 2>&1 | head -50
```

```bash
# Test MCP tools directly
cd /home/ridgetop/aidis
npx tsx mcp-server/test-complete-aidis.ts 2>&1 | grep -i "success\|fail\|error" | head -20
```

**Expected**: Tests pass or run without critical errors

---

## ✅ VERIFICATION CHECKLIST

After completing all steps, verify:

- [ ] Git is at commit `6e930b1`
- [ ] Branch is `aidis-stab`
- [ ] Working directory is clean (`git status`)
- [ ] Database is `aidis_production` and accessible
- [ ] All package.json have `aidis-*` names
- [ ] No `MANDREL_*` environment variables exist
- [ ] `mandrel-stab.md` exists with investigation
- [ ] AIDIS MCP server starts successfully
- [ ] MCP tools respond (test with `aidis_ping`)
- [ ] TypeScript compilation passes
- [ ] No files or directories with "mandrel" naming
- [ ] All class names use `Aidis*` (e.g., `AidisMcpServer`)
- [ ] All localStorage keys use `aidis_*` prefix
- [ ] All service names use `aidis-*` prefix

---

## 🔍 VERIFICATION COMMANDS SUMMARY

```bash
# Quick verification script
cd /home/ridgetop/aidis

echo "=== Git State ==="
git log -1 --oneline
git status --short

echo ""
echo "=== Database ==="
psql -h localhost -p 5432 -U ridgetop -d aidis_production -c "SELECT current_database();"

echo ""
echo "=== Package Names ==="
grep '"name"' mcp-server/package.json aidis-command/package.json

echo ""
echo "=== MCP Server Test ==="
curl -s -X POST http://localhost:8080/mcp/tools/aidis_ping \
  -H "Content-Type: application/json" \
  -d '{"message": "test"}' | grep -o "AIDIS Pong"

echo ""
echo "=== Environment Check ==="
env | grep -c MANDREL || echo "No MANDREL vars (good!)"

echo ""
echo "=== Key Files ==="
ls -1 mandrel-stab.md \
  mcp-server/src/server/AidisMcpServer.ts \
  aidis-command/frontend/src/api/aidisApiClient.ts
```

---

## 🆘 TROUBLESHOOTING

### If Git Reset Doesn't Work

```bash
# Force checkout the specific commit
git checkout -f 6e930b1

# Create new branch from this commit if needed
git checkout -b recovery-aidis-stab-$(date +%Y%m%d)
```

### If Database Connection Fails

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Restart if needed
sudo systemctl restart postgresql

# Verify database exists
psql -h localhost -p 5432 -U ridgetop -l | grep aidis
```

### If Services Won't Start

```bash
# Check for port conflicts
lsof -i :8080
lsof -i :5000
lsof -i :5001

# Kill any conflicting processes
kill -9 <PID>

# Check logs
tail -100 /home/ridgetop/aidis/mcp-server/logs/aidis-mcp.log
```

### If Build Fails

```bash
# Nuclear option: clean everything
cd /home/ridgetop/aidis
find . -name "node_modules" -type d -prune -exec rm -rf {} \;
find . -name "dist" -type d -prune -exec rm -rf {} \;
find . -name "build" -type d -prune -exec rm -rf {} \;

# Reinstall from scratch
cd mcp-server && npm install && npm run build
cd ../aidis-command/backend && npm install && npm run build
cd ../frontend && npm install && npm run build
```

### If Stashed Changes Are Needed

```bash
# List all stashes
git stash list

# Apply specific stash
git stash apply stash@{0}

# Or pop the most recent stash
git stash pop
```

---

## 📋 WHAT THIS SNAPSHOT INCLUDES

### Documentation
- ✅ Complete Mandrel investigation (`mandrel-stab.md`)
- ✅ This recovery plan
- ✅ All existing documentation

### Code State
- ✅ All AIDIS branding intact
- ✅ 27 MCP tools with `aidis_*` naming
- ✅ Package names: `aidis-mcp-server`, `aidis-command`, etc.
- ✅ Environment variables: `AIDIS_*` pattern
- ✅ Database: `aidis_production`
- ✅ Class names: `AidisMcpServer`, etc.
- ✅ Service names: `aidis-mcp`, `aidis-command-*`

### What This Snapshot DOES NOT Include
- ❌ NO Mandrel branding
- ❌ NO renamed packages
- ❌ NO renamed environment variables
- ❌ NO renamed database
- ❌ NO code changes for rebrand

---

## 🎯 POST-RECOVERY NEXT STEPS

After successful recovery:

1. **Investigate what went wrong** - Check logs, error messages
2. **Review the mandrel-stab.md plan** - Identify where things broke
3. **Create a new feature branch** - Don't work on aidis-stab directly
4. **Test changes incrementally** - Don't do everything at once
5. **Keep this recovery plan handy** - You can return here anytime

---

## 📞 EMERGENCY CONTACTS

**Repository**: https://github.com/RidgetopAi/aidis  
**Branch**: aidis-stab  
**Commit**: 6e930b134940f4b79cc93a6eddbb372281bdb972

**Recovery Backup Location**: `/home/ridgetop/aidis-backup-*.tar.gz`

---

## 🔐 FINAL SAFETY CHECK

Before proceeding with Mandrel rename after recovery:

```bash
# Ensure you're starting from clean slate
cd /home/ridgetop/aidis
git status
# Should show: "nothing to commit, working tree clean"

git log -1 --oneline
# Should show: "6e930b1 feat: AIDIS → Mandrel rebrand investigation complete"

# Create a safety branch
git checkout -b mandrel-rename-attempt-$(date +%Y%m%d-%H%M%S)
git push -u origin mandrel-rename-attempt-$(date +%Y%m%d-%H%M%S)

# Now you can work without fear - aidis-stab is safe!
```

---

**Recovery Plan Version**: 1.0  
**Tested**: No (created at snapshot time)  
**Last Updated**: 2025-10-31 19:39 EDT  
**Status**: ACTIVE RECOVERY POINT

---

## 💾 AUTOMATED RECOVERY SCRIPT

Save this as `/home/ridgetop/aidis/scripts/recover-to-aidis.sh`:

```bash
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

echo "Step 2: Stashing changes..."
git stash save "recovery-stash-$(date +%Y%m%d-%H%M%S)"

echo "Step 3: Hard reset to snapshot..."
git reset --hard 6e930b1

echo "Step 4: Verify branch..."
git checkout aidis-stab

echo "Step 5: Cleaning build artifacts..."
find . -name "dist" -type d -exec rm -rf {} \; 2>/dev/null || true

echo "Step 6: Rebuilding..."
cd mcp-server && npm run build
cd ../aidis-command/backend && npm run build

echo "Step 7: Starting services..."
cd /home/ridgetop/aidis
./start-aidis.sh

echo ""
echo "✅ Recovery complete!"
echo "Git commit: $(git log -1 --oneline)"
echo "Branch: $(git branch --show-current)"
echo ""
echo "Run verification:"
echo "  curl -X POST http://localhost:8080/mcp/tools/aidis_ping -H 'Content-Type: application/json' -d '{\"message\": \"test\"}'"
```

Make executable:
```bash
chmod +x /home/ridgetop/aidis/scripts/recover-to-aidis.sh
```

**Usage**:
```bash
/home/ridgetop/aidis/scripts/recover-to-aidis.sh
```

---

**END OF RECOVERY PLAN**
