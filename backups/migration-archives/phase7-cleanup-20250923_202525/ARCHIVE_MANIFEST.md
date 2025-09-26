# AIDIS Phase 7 Migration Cleanup Archive
**Archive Date**: 2025-09-23 20:25:25
**Purpose**: Phase 7 Task 3 - Old Migration Files Cleanup

## Archive Contents

### 1. mcp-server-archive-migrations/
**Source**: `/home/ridgetop/aidis/mcp-server-archive/database/migrations/`
**Description**: Archive copy of migrations from the mcp-server-archive directory
**Files**: 7 migration files (001-007)
**Date Range**: Original migrations from legacy system
**Status**: ARCHIVED - These were already archived in mcp-server-archive

### 2. mcp-server-backup-20250817-migrations/
**Source**: `/home/ridgetop/aidis/mcp-server-backup-20250817-1743/database/migrations/`
**Description**: Backup copy of migrations from 2025-08-17
**Files**: 7 migration files (001-007)
**Date Range**: August 2025 backup
**Status**: ARCHIVED - Backup copy, superseded by current migrations

### 3. aidis-command-dev-database-migrations/
**Source**: `/home/ridgetop/aidis/aidis-command-dev/backend/src/database/migrations/`
**Description**: Development version migration files
**Files**: 2 migration files (003-004)
**Content**: Auth tables and tasks table creation
**Status**: ARCHIVED - Development version files

### 4. aidis-command-dev-migration-backup/
**Source**: `/home/ridgetop/aidis/aidis-command-dev/migration-backup/`
**Description**: SQL backup dumps from development environment
**Files**: 2 SQL backup files
**Content**: Database dumps from August 2025
**Status**: ARCHIVED - Development backup files

### 5. aidis-command-database-migrations/
**Source**: `/home/ridgetop/aidis/aidis-command/backend/src/database/migrations/`
**Description**: Alternative location migration files
**Files**: 2 migration files (003-004)
**Content**: Duplicate of auth and tasks migrations
**Status**: ARCHIVED - Duplicate/alternative location

### 6. aidis-command-src-migrations/
**Source**: `/home/ridgetop/aidis/aidis-command/backend/src/migrations/`
**Description**: Session-related migrations
**Files**: 2 migration files (001-002)
**Content**: Sessions table creation and enhancement
**Status**: ARCHIVED - Legacy session migrations

### 7. backups-migration-20250819-204010/
**Source**: `/home/ridgetop/aidis/backups/migration-20250819-204010/`
**Description**: Complete database backup from August 19
**Files**: 1 SQL dump file
**Content**: Full aidis_dev backup
**Status**: ARCHIVED - Historical backup

## Active Migration System

**Current Location**: `/home/ridgetop/aidis/mcp-server/database/migrations/`
**Current Files**: 25 migration files (001-025)
**Migration Runner**: `/home/ridgetop/aidis/mcp-server/scripts/migrate.ts`
**Tracking Table**: `_aidis_migrations`
**Status**: ACTIVE - This is the canonical migration system

## Consolidation Evidence

Migration `020_consolidate_migration_history.sql` shows that legacy tracking has been consolidated:
- Migrated from `schema_migrations` to `_aidis_migrations`
- Handled version mapping and numbering
- Dropped legacy tracking table after consolidation

## Safety Measures

1. **Archive-Only**: No files were deleted, only copied to archive
2. **Comprehensive**: All migration directories identified and archived
3. **Manifest**: Complete documentation of archive contents
4. **Verification**: Active system remains untouched

## Next Steps

After verification that the active migration system works correctly:
1. The archived directories can be safely removed from their original locations
2. This archive provides complete rollback capability if needed
3. Future migration cleanup can reference this manifest

## Notes

- All migrations 001-007 are duplicated across multiple archived locations
- Migrations 008-025 exist only in the active system
- Migration 020 specifically handles legacy consolidation
- No dependencies found referencing the archived directories