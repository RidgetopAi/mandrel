# AIDIS Backup & Recovery Guide
## Complete System Backup and Disaster Recovery

> **🚨 EMERGENCY MODE**: In crisis? Jump to [Quick Reference](#quick-reference) section below.

---

## Table of Contents
1. [Introduction](#introduction)
2. [Quick Reference - Emergency Commands](#quick-reference)
3. [Backup Scripts Overview](#backup-scripts-overview)
4. [Daily Usage](#daily-usage)
5. [Recovery Procedures](#recovery-procedures)
6. [Automation Setup](#automation-setup)
7. [Troubleshooting](#troubleshooting)
8. [Testing Your Backups](#testing-your-backups)
9. [File Locations](#file-locations)

---

## Introduction

AIDIS (AI Development Intelligence System) maintains critical project data, contexts, decisions, and agent coordination information in PostgreSQL databases. **Data loss means losing weeks or months of development context**, including:

- 115+ stored development contexts
- Technical decision records
- Project management data
- Multi-agent coordination history
- Code analysis results
- Naming registry consistency

**This backup system is your safety net.**

---

## Quick Reference

### 🚨 EMERGENCY: Data Loss Occurred
```bash
# 1. STOP AIDIS immediately
sudo systemctl stop aidis

# 2. Check available backups
ls -la /home/ridgetop/aidis/backups/

# 3. Find latest full backup (format: backup_YYYYMMDD_HHMMSS.tar.gz)
ls -la /home/ridgetop/aidis/backups/backup_*.tar.gz | tail -5

# 4. Restore from latest backup (replace TIMESTAMP)
cd /home/ridgetop/aidis/scripts
./test-backup-restore.sh /home/ridgetop/aidis/backups/backup_TIMESTAMP.tar.gz

# 5. Start AIDIS
sudo systemctl start aidis
```

### 🚨 EMERGENCY: Quick Database Backup NOW
```bash
# Immediate database backup (5 seconds)
cd /home/ridgetop/aidis/scripts
./quick-backup.sh
```

### 🚨 EMERGENCY: Full System Backup NOW
```bash
# Complete system backup (30-60 seconds)
cd /home/ridgetop/aidis/scripts
./backup-aidis.sh
```

---

## Backup Scripts Overview

### 1. **Full System Backup** - `backup-aidis.sh`
**When to use**: Complete system protection, before major changes
- ✅ Database dumps (both `aidis_development` and `aidis_ui_dev`)
- ✅ Environment configuration (`.env` files)
- ✅ Logs and run state
- ✅ Configuration files
- ⏱️ **Runtime**: 30-60 seconds
- 📦 **Output**: `/home/ridgetop/aidis/backups/backup_YYYYMMDD_HHMMSS.tar.gz`

### 2. **Quick Database Backup** - `quick-backup.sh`  
**When to use**: Rapid protection before risky operations
- ✅ Database dumps only
- ✅ Minimal system impact
- ⏱️ **Runtime**: 5-10 seconds  
- 📦 **Output**: `/home/ridgetop/aidis/backups/quick_backup_YYYYMMDD_HHMMSS.tar.gz`

### 3. **Backup Testing** - `test-backup-restore.sh`
**When to use**: Verify backups work, disaster recovery
- ✅ Validates backup integrity
- ✅ Tests restoration process
- ✅ Can restore from any backup file
- ⏱️ **Runtime**: 60-120 seconds

---

## Daily Usage

### Quick Daily Backup (Recommended)
```bash
# Run this every morning or before risky changes
cd /home/ridgetop/aidis/scripts
./quick-backup.sh
```

### Weekly Full Backup (Recommended)
```bash
# Run this weekly or before major system changes
cd /home/ridgetop/aidis/scripts
./backup-aidis.sh
```

### Before Dangerous Operations
```bash
# Always backup before:
# - System updates
# - Database migrations  
# - Major code changes
# - Configuration changes

cd /home/ridgetop/aidis/scripts
./backup-aidis.sh  # For complete protection
# OR
./quick-backup.sh  # For fast database protection
```

---

## Recovery Procedures

### Standard Recovery Process

#### Step 1: Stop AIDIS Service
```bash
sudo systemctl stop aidis
sudo systemctl status aidis  # Verify stopped
```

#### Step 2: Identify Recovery Point
```bash
# List available backups (newest first)
ls -la /home/ridgetop/aidis/backups/ | head -10

# Full backups (complete system)
ls -la /home/ridgetop/aidis/backups/backup_*.tar.gz

# Quick backups (database only)  
ls -la /home/ridgetop/aidis/backups/quick_backup_*.tar.gz
```

#### Step 3: Perform Recovery
```bash
cd /home/ridgetop/aidis/scripts

# Restore from backup (replace with actual filename)
./test-backup-restore.sh /home/ridgetop/aidis/backups/backup_20250817_143022.tar.gz

# The script will:
# - Validate backup integrity
# - Stop existing containers
# - Restore databases
# - Restart services
```

#### Step 4: Verify Recovery
```bash
# Start AIDIS service
sudo systemctl start aidis

# Check service status
sudo systemctl status aidis

# Test AIDIS functionality
cd /home/ridgetop/aidis/mcp-server
npx tsx test-complete-aidis.ts
```

### Partial Recovery (Database Only)

If you only need database recovery and have a quick backup:

```bash
# 1. Stop AIDIS
sudo systemctl stop aidis

# 2. Extract database files from quick backup
cd /tmp
tar -xzf /home/ridgetop/aidis/backups/quick_backup_TIMESTAMP.tar.gz

# 3. Stop database container
docker stop fb_postgres

# 4. Restore database files manually
docker cp /tmp/aidis_development.sql fb_postgres:/tmp/
docker cp /tmp/aidis_ui_dev.sql fb_postgres:/tmp/

# 5. Start container and restore
docker start fb_postgres
docker exec -i fb_postgres psql -U postgres -c "DROP DATABASE IF EXISTS aidis_development;"
docker exec -i fb_postgres psql -U postgres -c "CREATE DATABASE aidis_development;"
docker exec -i fb_postgres psql -U postgres -d aidis_development < /tmp/aidis_development.sql

docker exec -i fb_postgres psql -U postgres -c "DROP DATABASE IF EXISTS aidis_ui_dev;"  
docker exec -i fb_postgres psql -U postgres -c "CREATE DATABASE aidis_ui_dev;"
docker exec -i fb_postgres psql -U postgres -d aidis_ui_dev < /tmp/aidis_ui_dev.sql

# 6. Start AIDIS
sudo systemctl start aidis
```

---

## Automation Setup

### Install Automated Daily Backups
```bash
cd /home/ridgetop/aidis/scripts
./setup-backup-cron.sh
```

This creates:
- **Daily quick backup** at 2:00 AM
- **Weekly full backup** on Sundays at 3:00 AM  
- **Automatic cleanup** of backups older than 30 days

### Manual Cron Configuration
```bash
# Edit cron jobs manually
crontab -e

# Add these lines for custom schedule:
# Daily quick backup at 2 AM
0 2 * * * /home/ridgetop/aidis/scripts/quick-backup.sh

# Weekly full backup on Sundays at 3 AM
0 3 * * 0 /home/ridgetop/aidis/scripts/backup-aidis.sh

# Monthly cleanup (keep last 30 days)
0 4 1 * * find /home/ridgetop/aidis/backups/ -name "*.tar.gz" -mtime +30 -delete
```

### Verify Automation
```bash
# Check cron jobs are installed
crontab -l

# Check cron service is running
sudo systemctl status cron

# Monitor backup logs
tail -f /var/log/syslog | grep backup
```

---

## Troubleshooting

### Common Issues & Solutions

#### ❌ "Docker container not found" 
```bash
# Check container status
docker ps -a | grep postgres

# If stopped, start it
docker start fb_postgres

# If missing, check original setup
cd /home/ridgetop/aidis/scripts
./setup-dev.sh
```

#### ❌ "Permission denied" errors
```bash
# Fix script permissions
chmod +x /home/ridgetop/aidis/scripts/*.sh

# Fix backup directory permissions  
sudo chown -R $USER:$USER /home/ridgetop/aidis/backups/
chmod 755 /home/ridgetop/aidis/backups/
```

#### ❌ "Disk space full" errors
```bash
# Check available space
df -h /home/ridgetop/aidis/backups/

# Clean old backups (keep last 10)
cd /home/ridgetop/aidis/backups/
ls -t *.tar.gz | tail -n +11 | xargs rm -f
```

#### ❌ "Database connection failed"
```bash
# Check database container
docker logs fb_postgres

# Check database is running
docker exec fb_postgres psql -U postgres -c "SELECT version();"

# Check databases exist
docker exec fb_postgres psql -U postgres -c "\\l"
```

#### ❌ Backup script hangs or fails
```bash
# Kill hanging processes
pkill -f backup-aidis
pkill -f quick-backup

# Check system resources
top
df -h

# Try single database backup
docker exec fb_postgres pg_dump -U postgres aidis_development > /tmp/test_backup.sql
```

### Recovery Troubleshooting

#### ❌ "Backup file corrupted"
```bash
# Test backup integrity
tar -tzf /home/ridgetop/aidis/backups/backup_TIMESTAMP.tar.gz

# If corrupted, try previous backup
ls -la /home/ridgetop/aidis/backups/ | head -20
```

#### ❌ "Service won't start after recovery"
```bash
# Check service logs  
sudo journalctl -u aidis -f

# Check container logs
docker logs fb_postgres

# Verify database restoration
docker exec fb_postgres psql -U postgres -d aidis_development -c "SELECT COUNT(*) FROM contexts;"
```

---

## Testing Your Backups

### Monthly Backup Test (CRITICAL)
```bash
# 1. Create test backup
cd /home/ridgetop/aidis/scripts  
./backup-aidis.sh

# 2. Note current data state
docker exec fb_postgres psql -U postgres -d aidis_development -c "SELECT COUNT(*) FROM contexts;"

# 3. Test restoration process
./test-backup-restore.sh /home/ridgetop/aidis/backups/backup_$(date +%Y%m%d)_*.tar.gz

# 4. Verify data integrity
docker exec fb_postgres psql -U postgres -d aidis_development -c "SELECT COUNT(*) FROM contexts;"

# 5. Test AIDIS functionality
cd /home/ridgetop/aidis/mcp-server
npx tsx test-complete-aidis.ts
```

### Backup Validation Script
```bash
# Create validation script
cat > /home/ridgetop/aidis/scripts/validate-backup.sh << 'EOF'
#!/bin/bash
BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup-file>"
    exit 1
fi

echo "🔍 Validating backup: $BACKUP_FILE"

# Test archive integrity
if tar -tzf "$BACKUP_FILE" > /dev/null 2>&1; then
    echo "✅ Archive integrity: PASSED"
else
    echo "❌ Archive integrity: FAILED"
    exit 1
fi

# Test SQL files present
if tar -tzf "$BACKUP_FILE" | grep -q "aidis_development.sql"; then
    echo "✅ Development DB backup: PRESENT"
else
    echo "❌ Development DB backup: MISSING"
fi

if tar -tzf "$BACKUP_FILE" | grep -q "aidis_ui_dev.sql"; then
    echo "✅ UI DB backup: PRESENT"
else
    echo "❌ UI DB backup: MISSING"
fi

echo "✅ Backup validation complete"
EOF

chmod +x /home/ridgetop/aidis/scripts/validate-backup.sh

# Use it
./scripts/validate-backup.sh /home/ridgetop/aidis/backups/backup_TIMESTAMP.tar.gz
```

---

## File Locations

### Backup Scripts
```
/home/ridgetop/aidis/scripts/
├── backup-aidis.sh          # Full system backup
├── quick-backup.sh           # Quick database backup
├── test-backup-restore.sh    # Backup testing & recovery
└── setup-backup-cron.sh     # Automation setup
```

### Backup Storage
```
/home/ridgetop/aidis/backups/
├── backup_YYYYMMDD_HHMMSS.tar.gz    # Full system backups
├── quick_backup_YYYYMMDD_HHMMSS.tar.gz  # Quick database backups
└── backup_*.log                      # Backup operation logs
```

### System Components
```
/home/ridgetop/aidis/
├── .env                    # Environment configuration  
├── mcp-server/            # AIDIS MCP server
├── logs/                  # System logs
├── run/                   # Runtime data
└── aidis.service         # Systemd service file
```

### Database Container
- **Container name**: `fb_postgres`
- **Databases**: `aidis_development`, `aidis_ui_dev`
- **Port**: 5432 (internal)
- **User**: postgres (no password for local development)

---

## Emergency Contact Information

### System Information
- **Project**: AIDIS (AI Development Intelligence System)
- **Environment**: Production/Development
- **Database**: PostgreSQL 15 with pgvector extension
- **Current Contexts**: 115+ development contexts stored
- **Tables**: 19 core system tables

### Critical Commands Quick Reference
```bash
# Check AIDIS status
sudo systemctl status aidis

# Check database container  
docker ps | grep postgres

# Check disk space
df -h /home/ridgetop/aidis/

# Emergency backup
/home/ridgetop/aidis/scripts/quick-backup.sh

# Emergency recovery
/home/ridgetop/aidis/scripts/test-backup-restore.sh BACKUP_FILE

# View recent backups
ls -lat /home/ridgetop/aidis/backups/ | head -10
```

---

**💡 Remember**: A backup is only as good as your last test of it. Test your recovery procedures monthly, and always backup before making significant changes.

**🚨 When in doubt**: Run a backup first, ask questions later. Disk space is cheaper than lost development context.

---
*Last updated: 2025-08-17*  
*AIDIS Backup System v1.0*
