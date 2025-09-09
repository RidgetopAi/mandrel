#!/bin/bash
# AIDIS Restore Script
set -e

BACKUP_DIR="$(dirname "$0")"
TIMESTAMP=$(basename "$BACKUP_DIR")

echo "🔄 AIDIS Restore Starting from backup: $TIMESTAMP"

# 1. Restore databases
echo "📊 Restoring databases..."
createdb -h localhost -p 5432 -U ridgetop aidis_production_restored 2>/dev/null || echo "DB exists"
createdb -h localhost -p 5432 -U ridgetop aidis_development_restored 2>/dev/null || echo "DB exists"

# Restore from custom format
pg_restore -h localhost -p 5432 -U ridgetop -d aidis_production_restored --verbose "$BACKUP_DIR/aidis_production_${TIMESTAMP}.backup"
pg_restore -h localhost -p 5432 -U ridgetop -d aidis_development_restored --verbose "$BACKUP_DIR/aidis_development_${TIMESTAMP}.backup"

# 2. Restore code (manual step)
echo "💻 Code backup available at: $BACKUP_DIR/aidis_code.tar.gz"
echo "   Extract with: tar -xzf aidis_code.tar.gz -C /"

echo "✅ Database restore complete!"
echo "   - Databases restored as: aidis_production_restored, aidis_development_restored"
echo "   - Rename them when ready to use"
