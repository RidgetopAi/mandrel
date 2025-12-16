#!/bin/bash
# AIDIS Quick Backup - Just the essential database
set -e

BACKUP_DIR="/home/ridgetop/aidis/backups/quick"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

mkdir -p "$BACKUP_DIR"

echo "⚡ AIDIS Quick Backup - $TIMESTAMP"

# Database backup only (most critical) - FIXED FOR CORRECT DATABASE
pg_dump -h localhost -p 5432 -U ridgetop -d aidis_production --format=custom > "$BACKUP_DIR/aidis_production_quick_$TIMESTAMP.backup"

# Keep only last 20 quick backups
cd "$BACKUP_DIR"
ls -1t aidis_*_quick_*.backup | tail -n +21 | xargs rm -f 2>/dev/null || true

echo "✅ Quick backup complete: $BACKUP_DIR/aidis_production_quick_$TIMESTAMP.backup"
echo "🔄 Restore with: pg_restore -h localhost -p 5432 -U ridgetop -d NEW_DB_NAME $BACKUP_DIR/aidis_production_quick_$TIMESTAMP.backup"
