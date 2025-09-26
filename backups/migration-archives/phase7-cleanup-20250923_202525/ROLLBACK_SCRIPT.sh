#!/bin/bash
# AIDIS Phase 7 Migration Cleanup Rollback Script
# This script can restore the archived migration directories if needed

ARCHIVE_DIR="/home/ridgetop/aidis/backups/migration-archives/phase7-cleanup-20250923_202525"
echo "🔄 AIDIS Migration Cleanup Rollback Script"
echo "Archive Directory: $ARCHIVE_DIR"
echo ""

# Function to restore a directory
restore_directory() {
    local source="$1"
    local target="$2"
    local description="$3"

    echo "Restoring: $description"
    echo "  From: $source"
    echo "  To: $target"

    if [ -d "$source" ]; then
        mkdir -p "$(dirname "$target")"
        cp -r "$source" "$target"
        echo "  ✅ Restored successfully"
    else
        echo "  ⚠️  Source not found: $source"
    fi
    echo ""
}

echo "This script will restore all archived migration directories."
echo "⚠️  WARNING: This will overwrite any existing directories at the target locations."
echo ""
read -p "Do you want to proceed with the rollback? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Starting rollback..."
    echo ""

    # Restore archived directories
    restore_directory "$ARCHIVE_DIR/mcp-server-archive-migrations" "/home/ridgetop/aidis/mcp-server-archive/database/migrations" "MCP Server Archive Migrations"
    restore_directory "$ARCHIVE_DIR/mcp-server-backup-20250817-migrations" "/home/ridgetop/aidis/mcp-server-backup-20250817-1743/database/migrations" "MCP Server Backup 2025-08-17 Migrations"
    restore_directory "$ARCHIVE_DIR/aidis-command-dev-database-migrations" "/home/ridgetop/aidis/aidis-command-dev/backend/src/database/migrations" "AIDIS Command Dev Database Migrations"
    restore_directory "$ARCHIVE_DIR/aidis-command-dev-migration-backup" "/home/ridgetop/aidis/aidis-command-dev/migration-backup" "AIDIS Command Dev Migration Backup"
    restore_directory "$ARCHIVE_DIR/aidis-command-database-migrations" "/home/ridgetop/aidis/aidis-command/backend/src/database/migrations" "AIDIS Command Database Migrations"
    restore_directory "$ARCHIVE_DIR/aidis-command-src-migrations" "/home/ridgetop/aidis/aidis-command/backend/src/migrations" "AIDIS Command Src Migrations"
    restore_directory "$ARCHIVE_DIR/backups-migration-20250819-204010" "/home/ridgetop/aidis/backups/migration-20250819-204010" "Backups Migration 2025-08-19"

    echo "🎉 Rollback completed!"
    echo ""
    echo "📋 Summary:"
    echo "- All archived migration directories have been restored"
    echo "- The active migration system at /home/ridgetop/aidis/mcp-server/database/migrations/ was not affected"
    echo "- You may need to restart any running services"
    echo ""
else
    echo "❌ Rollback cancelled."
fi

echo "📚 For more information, see:"
echo "  - Archive Manifest: $ARCHIVE_DIR/ARCHIVE_MANIFEST.md"
echo "  - Cleanup Documentation: $ARCHIVE_DIR/CLEANUP_DOCUMENTATION.md"