# AIDIS Emergency Rollback Procedures

**Created**: September 12, 2025  
**Purpose**: Final Phase 0 safety infrastructure for emergency situations  
**Target**: Complete rollback in <10 minutes

## 🚨 Emergency Decision Tree

### When to Use Emergency Rollback Scripts

```
Is the system completely broken?
├─ YES → Use `emergency-rollback.sh` (FULL SYSTEM ROLLBACK)
└─ NO → Continue below

Is only the database corrupted/problematic?
├─ YES → Use `rollback-database.sh` (DATABASE ONLY)
└─ NO → Continue below

Are services stuck/unresponsive but data is intact?
├─ YES → Use `rollback-services.sh restart` (SERVICES ONLY)
└─ NO → Use `health-check.sh` (DIAGNOSTIC)
```

## 📋 Available Scripts

### 1. `emergency-rollback.sh` - Full System Rollback
**Use when**: Complete system failure requiring full reset
- **Action**: Rolls back git repository AND database AND restarts services  
- **Target**: `pre-refactor-baseline-2025-09-12` git tag
- **Backup**: `aidis_backup_20250912_162614.sql`
- **Time**: <10 minutes (target)
- **Risk**: ⚠️ **DESTROYS ALL CURRENT WORK**

```bash
./emergency-rollback.sh
# Requires typing "EMERGENCY ROLLBACK" to confirm
```

### 2. `rollback-database.sh` - Database Only Rollback
**Use when**: Database corruption but code is fine
- **Action**: Restores database only from baseline backup
- **Preserves**: Current git state and running services
- **Time**: ~3-5 minutes
- **Risk**: ⚠️ **LOSES ALL DATABASE CHANGES**

```bash
./rollback-database.sh                                    # Uses default baseline
./rollback-database.sh aidis_backup_20250912_162614.sql   # Specific backup
```

### 3. `rollback-services.sh` - Services Only Management
**Use when**: Services are stuck but data is intact
- **Action**: Clean stop/restart of AIDIS services
- **Preserves**: All data and git state
- **Time**: ~30 seconds
- **Risk**: ✅ **SAFE** - No data loss

```bash
./rollback-services.sh stop      # Stop services only
./rollback-services.sh restart   # Stop and restart services
./rollback-services.sh verify    # Verify services are stopped
```

### 4. `health-check.sh` - System Diagnostics
**Use when**: Need to verify system state after rollback or troubleshoot
- **Action**: Comprehensive system health verification
- **Checks**: Database, MCP server, backend, frontend, filesystem, git state
- **Time**: ~15 seconds
- **Risk**: ✅ **SAFE** - Read-only diagnostics

```bash
./health-check.sh
# Exit code 0 = healthy, 1 = critical issues
```

## 🔄 Common Rollback Scenarios

### Scenario 1: Development Disaster
**Problem**: Major development mistakes, system completely broken  
**Solution**: Full emergency rollback
```bash
./emergency-rollback.sh
```

### Scenario 2: Database Migration Gone Wrong
**Problem**: Database schema or data corruption after migration  
**Solution**: Database-only rollback
```bash
./rollback-database.sh
./rollback-services.sh restart  # Restart services to pick up restored data
```

### Scenario 3: Services Won't Start/Respond
**Problem**: AIDIS services stuck, ports blocked, or hanging  
**Solution**: Service restart
```bash
./rollback-services.sh restart
./health-check.sh  # Verify everything is working
```

### Scenario 4: Post-Rollback Verification
**Problem**: Need to verify rollback was successful  
**Solution**: Health check
```bash
./health-check.sh
```

## ⚡ Quick Reference Commands

| Situation | Command | Time | Data Loss Risk |
|-----------|---------|------|----------------|
| Total system failure | `./emergency-rollback.sh` | <10 min | ⚠️ HIGH |
| Database corruption | `./rollback-database.sh` | ~5 min | ⚠️ MEDIUM |
| Service issues | `./rollback-services.sh restart` | ~30 sec | ✅ NONE |
| System health check | `./health-check.sh` | ~15 sec | ✅ NONE |

## 🏗️ Baseline Information

**Git Baseline**: `pre-refactor-baseline-2025-09-12`
- Created: September 12, 2025
- Commit: Clean, tested system state before refactoring
- Location: Git tag in main repository

**Database Baseline**: `aidis_backup_20250912_162614.sql`
- Created: September 12, 2025 at 16:26:14
- Location: `/home/ridgetop/aidis/backups/`
- Format: PostgreSQL custom format (.backup)
- Verified: Tested restore capability

## 🔍 Script Details

### Emergency Rollback Process
1. **Stop Services** - All AIDIS processes terminated
2. **Git Rollback** - Hard reset to baseline tag  
3. **Database Rollback** - Complete restore from backup
4. **Restart & Verify** - Services restarted and health checked

### Safety Features
- **Confirmation Required**: Must type "EMERGENCY ROLLBACK" 
- **Pre-flight Checks**: Verifies baseline and backup exist
- **Comprehensive Logging**: All actions logged with timestamps
- **Timer Tracking**: Monitors execution time vs 10-minute target
- **Graceful Degradation**: Fallback methods if primary methods fail

### Error Handling
- **Exit on Error**: Scripts halt on any critical failure
- **Rollback Logging**: Detailed logs saved to `logs/emergency-rollback-*.log`
- **Status Reporting**: Clear success/failure indicators
- **Recovery Guidance**: Instructions for manual intervention if needed

## 🚨 Important Warnings

### Before Using Emergency Rollback
1. **BACKUP CURRENT WORK** - Emergency rollback destroys everything
2. **Notify Team** - Alert all developers about the rollback
3. **Document Issue** - Record what caused the emergency
4. **Verify Baseline** - Ensure baseline tag and backup are correct

### After Using Emergency Rollback
1. **Run Health Check** - Verify all systems operational
2. **Check Data Integrity** - Validate database content
3. **Test Core Functions** - Ensure basic AIDIS functionality works
4. **Review Rollback Log** - Check for any warnings or issues
5. **Plan Recovery** - Determine how to restore lost work (if possible)

## 📞 Emergency Contacts & Procedures

### If Rollback Scripts Fail
1. Check rollback logs in `logs/emergency-rollback-*.log`
2. Try individual components:
   - `git reset --hard pre-refactor-baseline-2025-09-12`
   - `./scripts/restore-database.sh aidis_backup_20250912_162614.sql`
   - `./restart-aidis.sh`
3. Consult `AIDIS_MCP_SERVER_REFERENCE_GUIDE.md` for manual procedures

### System Recovery
- **Git Recovery**: `git reflog` to find lost commits
- **Database Recovery**: Check `backups/` for additional restore points
- **Service Recovery**: Use `ps aux` and `lsof -i` to troubleshoot

---

**Remember**: Emergency rollbacks are destructive operations. Use the minimum necessary script for your situation.
