#!/bin/bash

# AIDIS Comprehensive Backup Script
# Creates timestamped backups of databases, code, and configs

set -e  # Exit on error

BACKUP_DIR="/home/ridgetop/aidis/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_PATH="$BACKUP_DIR/$TIMESTAMP"

echo "🚀 AIDIS Backup Starting - $TIMESTAMP"

# Create backup directory
mkdir -p "$BACKUP_PATH"

# 1. DATABASE BACKUPS (CRITICAL) - FIXED FOR CORRECT DATABASE
echo "📊 Backing up PostgreSQL databases on port 5432..."
pg_dump -h localhost -p 5432 -U ridgetop -d mandrel --format=custom --verbose --file="$BACKUP_PATH/mandrel_$TIMESTAMP.backup"
pg_dump -h localhost -p 5432 -U ridgetop -d aidis_development --format=custom --verbose --file="$BACKUP_PATH/aidis_development_$TIMESTAMP.backup"

# 2. SCHEMA-ONLY BACKUP (for quick restore structure)
echo "🏗️  Creating schema-only backups..."
pg_dump -h localhost -p 5432 -U ridgetop -d mandrel --schema-only > "$BACKUP_PATH/mandrel_schema.sql"
pg_dump -h localhost -p 5432 -U ridgetop -d aidis_development --schema-only > "$BACKUP_PATH/aidis_development_schema.sql"

# 3. APPLICATION CODE BACKUP
echo "💻 Backing up application code..."
tar -czf "$BACKUP_PATH/aidis_code.tar.gz" \
    --exclude="node_modules" \
    --exclude="*.log" \
    --exclude="backups" \
    --exclude=".git" \
    /home/ridgetop/aidis/

# 4. CONFIGURATION BACKUP
echo "⚙️  Backing up configurations..."
cp -r /home/ridgetop/.config/amp "$BACKUP_PATH/amp_config" 2>/dev/null || echo "No Amp config found"
cp /home/ridgetop/aidis/aidis.service "$BACKUP_PATH/" 2>/dev/null || echo "No systemd service file"

# 5. DOCKER COMPOSE / ENV FILES
echo "🐳 Backing up Docker configurations..."
if [ -f "/home/ridgetop/aidis/docker-compose.yml" ]; then
    cp /home/ridgetop/aidis/docker-compose.yml "$BACKUP_PATH/"
fi

# 6. CREATE RESTORE SCRIPT
echo "🔧 Creating restore script..."
cat > "$BACKUP_PATH/restore.sh" << 'EOF'
#!/bin/bash
# AIDIS Restore Script
set -e

BACKUP_DIR="$(dirname "$0")"
TIMESTAMP=$(basename "$BACKUP_DIR")

echo "🔄 AIDIS Restore Starting from backup: $TIMESTAMP"

# 1. Restore databases
echo "📊 Restoring databases..."
createdb -h localhost -p 5432 -U ridgetop mandrel_restored 2>/dev/null || echo "DB exists"
createdb -h localhost -p 5432 -U ridgetop aidis_development_restored 2>/dev/null || echo "DB exists"

# Restore from custom format
pg_restore -h localhost -p 5432 -U ridgetop -d mandrel_restored --verbose "$BACKUP_DIR/mandrel_${TIMESTAMP}.backup"
pg_restore -h localhost -p 5432 -U ridgetop -d aidis_development_restored --verbose "$BACKUP_DIR/aidis_development_${TIMESTAMP}.backup"

# 2. Restore code (manual step)
echo "💻 Code backup available at: $BACKUP_DIR/aidis_code.tar.gz"
echo "   Extract with: tar -xzf aidis_code.tar.gz -C /"

echo "✅ Database restore complete!"
echo "   - Databases restored as: mandrel_restored, aidis_development_restored"
echo "   - Rename them when ready to use"
EOF

chmod +x "$BACKUP_PATH/restore.sh"

# 7. CREATE BACKUP INFO
echo "📋 Creating backup info..."
cat > "$BACKUP_PATH/backup_info.txt" << EOF
AIDIS Backup Information
========================
Timestamp: $TIMESTAMP
Created: $(date)
Host: $(hostname)
User: $(whoami)

Contents:
- mandrel_${TIMESTAMP}.backup (PostgreSQL custom format - LIVE DATA)
- aidis_development_${TIMESTAMP}.backup (PostgreSQL custom format - DEV DATA)
- mandrel_schema.sql (Schema only)
- aidis_development_schema.sql (Schema only)
- aidis_code.tar.gz (Application code)
- amp_config/ (Amp configuration)
- restore.sh (Restoration script)

Database Stats:
$(psql -h localhost -p 5432 -U ridgetop -d mandrel -c "SELECT schemaname,tablename,n_tup_ins,n_tup_upd,n_tup_del FROM pg_stat_user_tables;" 2>/dev/null || echo "Could not get stats")
EOF

# 8. CLEANUP OLD BACKUPS (keep last 10)
echo "🧹 Cleaning up old backups..."
cd "$BACKUP_DIR"
ls -1t | tail -n +11 | xargs rm -rf 2>/dev/null || echo "No old backups to clean"

# 9. BACKUP SIZE INFO
BACKUP_SIZE=$(du -sh "$BACKUP_PATH" | cut -f1)
echo "✅ AIDIS Backup Complete!"
echo "📂 Location: $BACKUP_PATH"
echo "📦 Size: $BACKUP_SIZE"
echo "🔄 Restore with: $BACKUP_PATH/restore.sh"

echo ""
echo "Quick Recovery Commands:"
echo "========================"
echo "Production DB: pg_restore -h localhost -p 5432 -U ridgetop -d NEW_DB_NAME $BACKUP_PATH/mandrel_${TIMESTAMP}.backup"
echo "Full restore:  $BACKUP_PATH/restore.sh"
