#!/bin/bash

# AIDIS Staging Database Setup
# Creates aidis_staging database from production backup

set -e

BACKUP_FILE="../backups/aidis_backup_20250912_162614.sql.gz"
STAGING_DB="aidis_staging"
PRODUCTION_DB="aidis_production"

echo "🗄️  Setting up AIDIS Staging Database..."

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Drop staging database if it exists
echo "🧹 Dropping existing staging database (if exists)..."
psql -h localhost -p 5432 -c "DROP DATABASE IF EXISTS $STAGING_DB;" 2>/dev/null || true

# Create staging database
echo "📦 Creating staging database..."
psql -h localhost -p 5432 -c "CREATE DATABASE $STAGING_DB OWNER ridgetop;"

# Restore from backup
echo "📥 Restoring from backup..."
gunzip -c "$BACKUP_FILE" | psql -h localhost -p 5432 -d "$STAGING_DB"

# Verify database structure
echo "🔍 Verifying database structure..."
TABLE_COUNT=$(psql -h localhost -p 5432 -d "$STAGING_DB" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")
echo "   Tables created: $TABLE_COUNT"

# Check key tables exist
CONTEXT_COUNT=$(psql -h localhost -p 5432 -d "$STAGING_DB" -t -c "SELECT count(*) FROM contexts;")
PROJECT_COUNT=$(psql -h localhost -p 5432 -d "$STAGING_DB" -t -c "SELECT count(*) FROM projects;")
SESSION_COUNT=$(psql -h localhost -p 5432 -d "$STAGING_DB" -t -c "SELECT count(*) FROM sessions;")

echo "   Contexts: $CONTEXT_COUNT"
echo "   Projects: $PROJECT_COUNT"  
echo "   Sessions: $SESSION_COUNT"

# Create staging-specific test data
echo "🧪 Adding staging test markers..."
psql -h localhost -p 5432 -d "$STAGING_DB" -c "
INSERT INTO projects (id, name, description, created_at) 
VALUES (gen_random_uuid(), 'staging-test', 'Staging environment test project', NOW())
ON CONFLICT (name) DO NOTHING;
"

echo "✅ Staging database setup complete!"
echo "🔗 Connection: postgresql://ridgetop@localhost:5432/$STAGING_DB"
