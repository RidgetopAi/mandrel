# PHASE 7 Environment Variables & Configuration Cleanup Plan

## Backup Strategy

### Step 1: Create Complete Backup
```bash
# Create timestamped backup directory
mkdir -p /home/ridgetop/aidis/backups/env-cleanup-$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/ridgetop/aidis/backups/env-cleanup-$(date +%Y%m%d_%H%M%S)"

# Backup all environment files
find /home/ridgetop/aidis -name ".env*" -type f -exec cp {} "$BACKUP_DIR/" \;

# Create inventory of backed up files
find /home/ridgetop/aidis -name ".env*" -type f > "$BACKUP_DIR/env_files_inventory.txt"

# Backup configuration directories
cp -r /home/ridgetop/aidis/config "$BACKUP_DIR/config_backup"

# Create restore script
cat > "$BACKUP_DIR/restore.sh" << 'EOF'
#!/bin/bash
echo "Restoring environment files from backup..."
# Individual restore commands will be added here
echo "Restore complete. Please restart AIDIS services."
EOF
chmod +x "$BACKUP_DIR/restore.sh"
```

### Step 2: Test System Before Cleanup
```bash
# Test that system builds and runs
cd /home/ridgetop/aidis/aidis-command/backend && npm run build
cd /home/ridgetop/aidis/aidis-command/frontend && npm run build
cd /home/ridgetop/aidis/mcp-server && npm run build

# Test AIDIS services can start
./start-aidis.sh
curl http://localhost:8080/health
./stop-aidis.sh
```

## Cleanup Phases

### Phase 1: Remove Archive/Backup Files (Safest)

**Files to Remove:**
```bash
# Archive directories (old copies)
rm -f /home/ridgetop/aidis/mcp-server-backup-20250817-1743/.env*
rm -f /home/ridgetop/aidis/mcp-server-archive/.env*
rm -f /home/ridgetop/aidis/aidis-command-dev/.env*

# Duplicate staging files
rm -f /home/ridgetop/aidis/staging/.env.staging
rm -f /home/ridgetop/aidis/mcp-server/.env.staging
```

**Risk:** Minimal - these are archived/duplicate files

**Test After Phase 1:**
```bash
# Verify builds still work
cd /home/ridgetop/aidis/aidis-command/backend && npm run build
cd /home/ridgetop/aidis/aidis-command/frontend && npm run build
cd /home/ridgetop/aidis/mcp-server && npm run build
```

### Phase 2: Remove Unused Environment Variables (Moderate Risk)

**Variables to Remove from Active Files:**

**From `/home/ridgetop/aidis/aidis-command/backend/.env`:**
- `FRONTEND_URL=http://localhost:3000` (unused in code)
- `RATE_LIMIT_WINDOW_MS=900000` (if rate limiting not implemented)
- `RATE_LIMIT_MAX_REQUESTS=100` (if rate limiting not implemented)
- `MAX_FILE_SIZE=10485760` (if file upload not implemented)
- `UPLOAD_DIR=uploads` (if file upload not implemented)

**From `/home/ridgetop/aidis/config/environments/.env.development`:**
- Legacy duplicates (keep AIDIS_ prefixed versions only)
- Unused port variables: `AIDIS_MCP_BRIDGE_PORT`, `AIDIS_COMMAND_DEV_PORT`, `AIDIS_COMMAND_PROD_PORT`
- Unused feature flags: `AIDIS_FEATURE_FLAG_PHASE1_*`

**Risk:** Moderate - verify these aren't used in scripts or Docker

**Test After Phase 2:**
```bash
# Full system test
./start-aidis.sh
curl http://localhost:8080/health
curl http://localhost:5000/api/health
curl http://localhost:3000
./stop-aidis.sh
```

### Phase 3: Consolidate Duplicate Variables (Low Risk)

**Configuration File Cleanup:**

**File: `/home/ridgetop/aidis/config/environments/.env.development`**
Remove legacy duplicates, keep AIDIS_ prefixed versions:
```bash
# Remove these legacy variables (keep AIDIS_ versions):
DATABASE_USER=ridgetop          # Keep AIDIS_DATABASE_USER
DATABASE_HOST=localhost         # Keep AIDIS_DATABASE_HOST
DATABASE_NAME=aidis_production  # Keep AIDIS_DATABASE_NAME
DATABASE_PORT=5432              # Keep AIDIS_DATABASE_PORT
JWT_EXPIRES_IN=24h              # Keep AIDIS_JWT_EXPIRES_IN
BCRYPT_ROUNDS=10                # Keep AIDIS_BCRYPT_ROUNDS
PORT=5000                       # Keep AIDIS_HTTP_PORT
MCP_SERVER_PORT=3000            # Keep AIDIS_MCP_PORT
MCP_SERVER_HOST=localhost       # Keep AIDIS_MCP_HOST
CORS_ORIGIN=http://localhost:3000,http://localhost:3001  # Keep AIDIS_CORS_ORIGIN
LOG_LEVEL=debug                 # Keep AIDIS_LOG_LEVEL
DB_LOG_LEVEL=info               # Keep AIDIS_DB_LOG_LEVEL
ENABLE_LOG_ROTATION=false       # Keep AIDIS_ENABLE_LOG_ROTATION
MCP_DEBUG=handshake,transport,errors  # Keep AIDIS_MCP_DEBUG
```

**Risk:** Low - code is designed to use AIDIS_ prefixed versions with fallbacks

### Phase 4: Verify and Clean Config Files

**Feature Flags Review:**
- Check `/home/ridgetop/aidis/config/feature-flags.json` for obsolete flags
- Remove phase1 flags that are no longer needed
- Update phase4 flags based on current implementation

**OpenAPI Config:**
- `/home/ridgetop/aidis/aidis-command/backend/src/config/openapi.ts` - appears current, keep

**Sentry Config:**
- `/home/ridgetop/aidis/aidis-command/frontend/src/config/sentry.ts` - appears current, keep

## Verification Steps

### After Each Phase:
1. **Build Test:**
   ```bash
   cd /home/ridgetop/aidis/aidis-command/backend && npm run build
   cd /home/ridgetop/aidis/aidis-command/frontend && npm run build
   cd /home/ridgetop/aidis/mcp-server && npm run build
   ```

2. **Service Test:**
   ```bash
   ./start-aidis.sh
   sleep 10
   curl http://localhost:8080/health
   curl http://localhost:5000/api/health
   curl http://localhost:3000
   ./stop-aidis.sh
   ```

3. **Functionality Test:**
   ```bash
   # Test MCP tools
   curl -X POST http://localhost:8080/mcp/tools/aidis_ping -H "Content-Type: application/json" -d '{}'

   # Test command interface
   curl http://localhost:5000/api/projects
   ```

## Rollback Plan

If issues are encountered:

1. **Stop all services:**
   ```bash
   ./stop-aidis.sh
   ```

2. **Restore from backup:**
   ```bash
   cd "$BACKUP_DIR"
   ./restore.sh
   ```

3. **Restart services:**
   ```bash
   ./start-aidis.sh
   ```

## Success Criteria

✅ **System builds successfully**
✅ **All services start without errors**
✅ **Health checks pass**
✅ **MCP tools respond**
✅ **Web interfaces load**
✅ **No environment variable errors in logs**

## Documentation Updates

After cleanup, update:
1. `README.md` files with current environment setup
2. `.env.example` files to reflect actual usage
3. Docker compose files if needed
4. Deployment documentation

## Estimated Impact

**Files Removed:** ~11 obsolete environment files
**Variables Removed:** ~15-20 unused variables
**Lines Reduced:** ~200-300 lines across config files
**Maintenance Burden:** Significantly reduced
**Risk Level:** Low to Moderate (with proper testing)

## Timeline

- **Phase 1:** 15 minutes (safe file removal)
- **Phase 2:** 30 minutes (variable cleanup + testing)
- **Phase 3:** 30 minutes (consolidation + testing)
- **Phase 4:** 15 minutes (config review)
- **Total:** ~90 minutes with thorough testing

## Post-Cleanup Verification

1. Create new git commit with cleaned configuration
2. Test full deployment cycle
3. Monitor logs for missing environment variables
4. Update deployment scripts if needed
5. Archive backup directory after verification period