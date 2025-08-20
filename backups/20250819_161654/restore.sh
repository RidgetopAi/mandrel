#!/bin/bash
# AIDIS Restore Script
set -e

BACKUP_DIR="$(dirname "$0")"
TIMESTAMP=$(basename "$BACKUP_DIR")

echo "🔄 AIDIS Restore Starting from backup: $TIMESTAMP"

# 1. Restore databases
echo "📊 Restoring databases..."
docker exec fb_postgres createdb -U fb_user aidis_development_restored 2>/dev/null || echo "DB exists"
docker exec fb_postgres createdb -U fb_user aidis_ui_dev_restored 2>/dev/null || echo "DB exists"

# Copy backup files to container
docker cp "$BACKUP_DIR/aidis_dev_${TIMESTAMP}.backup" fb_postgres:/tmp/
docker cp "$BACKUP_DIR/aidis_ui_${TIMESTAMP}.backup" fb_postgres:/tmp/

# Restore from custom format
docker exec fb_postgres pg_restore -U fb_user -d aidis_development_restored --verbose "/tmp/aidis_dev_${TIMESTAMP}.backup"
docker exec fb_postgres pg_restore -U fb_user -d aidis_ui_dev_restored --verbose "/tmp/aidis_ui_${TIMESTAMP}.backup"

# 2. Restore code (manual step)
echo "💻 Code backup available at: $BACKUP_DIR/aidis_code.tar.gz"
echo "   Extract with: tar -xzf aidis_code.tar.gz -C /"

echo "✅ Database restore complete!"
echo "   - Databases restored as: aidis_development_restored, aidis_ui_dev_restored"
echo "   - Rename them when ready to use"
