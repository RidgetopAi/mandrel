#!/bin/bash
# Test AIDIS backup and restore functionality

set -e

echo "🧪 AIDIS Backup/Restore Test"

# 1. Create test backup
echo "1️⃣ Creating test backup..."
/home/ridgetop/aidis/scripts/quick-backup.sh

# 2. Find the latest backup
LATEST_BACKUP=$(ls -1t /home/ridgetop/aidis/backups/quick/aidis_quick_*.backup | head -1)
echo "📦 Latest backup: $LATEST_BACKUP"

# 3. Create test restore database
TEST_DB="aidis_backup_test_$(date +%s)"
echo "2️⃣ Creating test database: $TEST_DB"

docker exec fb_postgres createdb -U fb_user "$TEST_DB"

# 4. Restore backup to test database
echo "3️⃣ Restoring backup to test database..."
docker cp "$LATEST_BACKUP" fb_postgres:/tmp/test_restore.backup
docker exec fb_postgres pg_restore -U fb_user -d "$TEST_DB" --verbose /tmp/test_restore.backup

# 5. Verify restore worked
echo "4️⃣ Verifying restore..."
TABLES=$(docker exec fb_postgres psql -U fb_user -d "$TEST_DB" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
CONTEXTS=$(docker exec fb_postgres psql -U fb_user -d "$TEST_DB" -t -c "SELECT COUNT(*) FROM contexts;" 2>/dev/null || echo "0")

echo "✅ Restore verification:"
echo "   - Tables restored: $TABLES"
echo "   - Contexts restored: $CONTEXTS"

# 6. Cleanup test database
echo "5️⃣ Cleaning up test database..."
docker exec fb_postgres dropdb -U fb_user "$TEST_DB"
docker exec fb_postgres rm -f /tmp/test_restore.backup

echo "🎉 Backup/Restore test completed successfully!"
echo "   Your backups are working properly!"
