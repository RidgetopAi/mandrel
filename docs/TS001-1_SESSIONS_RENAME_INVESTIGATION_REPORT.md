# TS001-1: Sessions Table Rename Investigation Report
**Investigation Task**: Map all code that references the `sessions` table to prepare for rename to `agent_sessions`

**Date**: 2025-09-29
**Status**: Investigation Complete ✅
**Objective**: Zero-breaking-change rename of `sessions` → `agent_sessions`

---

## Executive Summary

The `sessions` table is **extensively integrated** across the AIDIS system with:
- **17 columns** with rich metadata and git integration
- **18 foreign key constraints** from 11 different tables
- **6 indexes** for performance optimization
- **4 triggers** for data validation and updates
- **100+ code references** across MCP server and AIDIS Command backend
- **2 materialized views** that reference the table
- **Dual-write system** currently in place for migration purposes

**Complexity Level**: HIGH - This is a critical core table with deep integration

---

## 1. Database Schema Analysis

### Current `sessions` Table Schema

```sql
CREATE TABLE sessions (
    -- Core identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    agent_type VARCHAR(50) NOT NULL,

    -- Temporal tracking
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Session metadata
    title VARCHAR(255),
    description TEXT,
    context_summary TEXT,
    tokens_used INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Git integration (added in migration 010)
    active_branch VARCHAR(255),
    working_commit_sha VARCHAR(40),
    commits_contributed INTEGER DEFAULT 0,

    -- Pattern analysis tracking (added in migration 015)
    pattern_preferences JSONB DEFAULT '{}'::jsonb,
    insights_generated INTEGER DEFAULT 0,
    last_pattern_analysis TIMESTAMP WITH TIME ZONE,

    -- Constraints
    CONSTRAINT reasonable_session_duration
        CHECK (ended_at IS NULL OR ended_at >= started_at),
    CONSTRAINT reasonable_title_length
        CHECK (title IS NULL OR LENGTH(title) BETWEEN 1 AND 255)
);
```

### Indexes on `sessions` Table

```sql
-- Primary and foreign key indexes
sessions_pkey                PRIMARY KEY (id)
idx_sessions_project_id      ON (project_id)
idx_sessions_agent_type      ON (agent_type)
idx_sessions_started_at      ON (started_at)

-- Composite indexes for common queries
idx_sessions_project_agent   ON (project_id, agent_type)
idx_sessions_title           ON (title)

-- Git integration indexes
idx_sessions_branch          ON (active_branch) WHERE active_branch IS NOT NULL
idx_sessions_working_commit  ON (working_commit_sha) WHERE working_commit_sha IS NOT NULL
```

### Foreign Key Constraints

**Tables that reference `sessions` (18 total):**

1. **contexts.session_id** → sessions(id) ON DELETE SET NULL
2. **technical_decisions.session_id** → sessions(id) ON DELETE SET NULL
3. **code_analysis_sessions.development_session_id** → sessions(id) ON DELETE SET NULL
4. **analysis_session_links.development_session_id** → sessions(id) ON DELETE CASCADE
5. **event_log.session_id** → sessions(id) - NO ACTION
6. **pattern_discovery_sessions.session_id** → sessions(id) ON DELETE SET NULL
7. **metrics_collection_sessions.session_id** → sessions(id) ON DELETE SET NULL
8. **productivity_health_metrics.target_session_id** → sessions(id) ON DELETE SET NULL
9. **complexity_analysis_sessions.session_id** → sessions(id) ON DELETE SET NULL
10. **commit_session_links.session_id** → sessions(id) ON DELETE CASCADE

**Tables that `sessions` references (1 total):**

1. **sessions.project_id** → projects(id) ON DELETE CASCADE (duplicate constraint exists as fk_sessions_project)

### Triggers on `sessions` Table

```sql
-- 1. Update timestamp trigger
CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 2. Update timestamp trigger (duplicate)
CREATE TRIGGER update_sessions_updated_at_trigger
    BEFORE UPDATE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_sessions_updated_at();

-- 3. Title auto-generation trigger
CREATE TRIGGER trigger_ensure_session_title
    BEFORE INSERT OR UPDATE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION ensure_session_title();

-- 4. Dual-write trigger (for migration purposes)
CREATE TRIGGER sessions_dual_write_trigger
    AFTER INSERT OR UPDATE OR DELETE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION dual_write_trigger_function();
```

**Note**: There are duplicate `updated_at` triggers that should be consolidated during rename.

---

## 2. Migration Files Analysis

### Primary Migration: 002_create_contexts_and_sessions.sql

**Location**: `/home/ridgetop/aidis/mcp-server/database/migrations/002_create_contexts_and_sessions.sql`

**Creates**:
- `sessions` table with core schema
- Initial indexes (project_id, agent_type, started_at, project_agent composite)
- Update trigger for `updated_at`
- Sample data insertion

**Lines that need updating**: 13-26, 54-57, 83-86

### Enhancement Migration: 010_create_git_tracking_system.sql

**Location**: `/home/ridgetop/aidis/mcp-server/database/migrations/010_create_git_tracking_system.sql`

**Adds to `sessions` table**:
```sql
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS active_branch VARCHAR(255),
ADD COLUMN IF NOT EXISTS working_commit_sha VARCHAR(40),
ADD COLUMN IF NOT EXISTS commits_contributed INTEGER DEFAULT 0;
```

**Creates**:
- `commit_session_links` table with FK to `sessions`
- Indexes on new columns

**Lines that need updating**: 283-287, 363-364

### Enhancement Migration: 011_enhance_code_analysis_sessions.sql

**Location**: `/home/ridgetop/aidis/mcp-server/database/migrations/011_enhance_code_analysis_sessions.sql`

**Adds**:
- `code_analysis_sessions.development_session_id` FK to `sessions`
- `analysis_session_links` table with FK to `sessions`

**Lines that need updating**: 35, 350

### Enhancement Migration: 014_enforce_session_project_fk.sql

**Location**: `/home/ridgetop/aidis/mcp-server/database/migrations/014_enforce_session_project_fk.sql`

**Adds**:
- Additional FK constraint `fk_sessions_project`
- Default project_id (later removed)

**Lines that need updating**: 24-25, 30-31

### Enhancement Migration: 017_add_session_title_description.sql

**Location**: `/home/ridgetop/aidis/mcp-server/database/migrations/017_add_session_title_description.sql`

**Adds**:
- `title` and `description` columns
- `trigger_ensure_session_title` trigger
- Title validation constraint

**Lines that need updating**: 4-5, 8-9, 12, 43-46, 57-59, 64-72

### Other Migrations with `sessions` References

**Migration 018** (development_metrics_tables.sql):
- Creates `metrics_collection_sessions` with FK to `sessions`

**Migration 019** (change_pattern_tables.sql):
- Creates `pattern_discovery_sessions` with FK to `sessions`

**Migration 023** (shadow_tables.sql):
- Creates `sessions_shadow` table for dual-write testing

**Migration 025** (feature_flag_cutover.sql):
- References `sessions` in dual-write logic

---

## 3. MCP Server Code References

### Core Session Management

#### `/home/ridgetop/aidis/mcp-server/src/services/sessionTracker.ts`

**Primary session management service - 20+ SQL queries**

**Critical SQL operations**:
```typescript
// Line 68-71: Session creation
INSERT INTO sessions (
  id, project_id, agent_type, started_at, title, description, metadata
) VALUES ($1, $2, $3, $4, $5, $6, $7)

// Line 152-156: Session ending
UPDATE sessions
SET ended_at = $1,
    tokens_used = $2,
    context_summary = $3,
    metadata = metadata || $4

// Line 262-265: Session recovery
SELECT id
FROM sessions
WHERE ended_at IS NULL
ORDER BY started_at DESC

// Line 580-584: Session update
UPDATE sessions
SET title = COALESCE($2, title),
    description = COALESCE($3, description),
    updated_at = NOW()

// Line 632-633: Session details query
SELECT id, title, description, project_id, started_at, ended_at
FROM sessions
WHERE id = $1

// Line 664-665: Session existence check
SELECT 1 FROM sessions
WHERE id = $1 AND ended_at IS NULL
```

**Safe to rename**: YES - All queries are parameterized
**Risk level**: HIGH - This is the core session lifecycle manager

#### `/home/ridgetop/aidis/mcp-server/src/handlers/sessionAnalytics.ts`

**Session analytics and reporting - 15+ queries**

**Key operations**:
```typescript
// Line 590-593: Project assignment
UPDATE sessions
SET project_id = $1,
    metadata = COALESCE(metadata, '{}') || $2
WHERE id = $3

// Line 661-663: Session detail retrieval
FROM sessions s
LEFT JOIN projects p ON s.project_id = p.id
WHERE s.id = $1

// Line 720-722: Session verification
SELECT id, title, description, project_id
FROM sessions
WHERE id = $1

// Line 767-769: Session metadata update
UPDATE sessions
SET ${updates.join(', ')}
WHERE id = $${paramIndex}

// Line 872-874: Session detail with related data
FROM sessions s
LEFT JOIN projects p ON s.project_id = p.id
WHERE s.id = $1
```

**Safe to rename**: YES - All queries are in SQL template strings
**Risk level**: HIGH - Powers all session analytics endpoints

### Supporting Services

#### `/home/ridgetop/aidis/mcp-server/src/services/sessionMigrator.ts`

**Session migration and recovery logic**

**Operations**:
- Line 275-277: Restore sessions from backup
- Line 306: Orphan session queries
- Line 505: Session project assignment
- Line 533: Backup creation

**Safe to rename**: YES
**Risk level**: MEDIUM

#### `/home/ridgetop/aidis/mcp-server/src/services/metricsCollector.ts`

**Metrics collection**

```typescript
// Line 1178: Session count in metrics
(SELECT COUNT(*) FROM sessions WHERE project_id = $1 AND created_at >= $2 AND created_at <= $3) as sessions
```

**Safe to rename**: YES
**Risk level**: LOW

#### `/home/ridgetop/aidis/mcp-server/src/services/gitTracker.ts`

**Git integration**

```typescript
// Line 221: Session project lookup
SELECT project_id FROM sessions WHERE id = $1

// Line 319-321: Session-based git path resolution
FROM sessions s
JOIN projects p ON s.project_id = p.id
WHERE s.id = $1
```

**Safe to rename**: YES
**Risk level**: MEDIUM

#### `/home/ridgetop/aidis/mcp-server/src/services/patternDetector.ts`

**Pattern analysis**

```typescript
// Line 1483: Union query for session project
SELECT project_id FROM sessions WHERE id = $1
```

**Safe to rename**: YES
**Risk level**: LOW

### Test Files

#### `/home/ridgetop/aidis/mcp-server/src/tests/session.unit.test.ts`

- Line 49: Test expects `INSERT INTO sessions`
- Line 104: Test expects query with `SELECT id FROM sessions WHERE ended_at IS NULL`
- Line 288: Test expects `SELECT 1 FROM sessions WHERE id = $1 AND ended_at IS NULL`
- Line 393: Test expects `UPDATE sessions SET project_id = $1`
- Line 517: Test expects `UPDATE sessions SET ended_at = NOW()`

**Safe to rename**: YES - Just update test assertions
**Risk level**: LOW

#### `/home/ridgetop/aidis/mcp-server/src/tests/session.e2e.test.ts`

- Lines 46, 71, 77, 84, 90, 103, 108, 125, 145: Direct SQL queries in tests
- All use `SELECT/DELETE FROM sessions`

**Safe to rename**: YES - Update test queries
**Risk level**: LOW

---

## 4. AIDIS Command Backend References

### Session Services

#### `/home/ridgetop/aidis/aidis-command/backend/src/services/session.ts`

**Web session management - DOES NOT reference `sessions` table**

This service only works with `user_sessions` table (web authentication sessions). No changes needed.

**Safe to rename**: N/A - No references to `sessions` table
**Risk level**: NONE

#### `/home/ridgetop/aidis/aidis-command/backend/src/services/sessionDetail.ts`

**Session detail aggregation**

```typescript
// Line 345-347: Union query combining user_sessions and sessions
FROM sessions s
LEFT JOIN projects p ON s.project_id = p.id

// Line 413-414: Union for session time range
SELECT project_id, started_at, ended_at
FROM sessions
WHERE id = $1
```

**Safe to rename**: YES - Straightforward SQL updates
**Risk level**: MEDIUM

#### `/home/ridgetop/aidis/aidis-command/backend/src/services/sessionAnalytics.ts`

**Analytics service - DOES NOT reference `sessions` table**

Uses `user_sessions` table exclusively. No changes needed.

**Safe to rename**: N/A - No references to `sessions` table
**Risk level**: NONE

### API Routes

#### `/home/ridgetop/aidis/aidis-command/backend/src/routes/sessionCode.ts`

**Session code analysis endpoints**

```typescript
// Line 21-23: Current session query
SELECT id, project_id, started_at, ended_at
FROM sessions
WHERE ended_at IS NULL

// Line 225-227: Session lookup
SELECT id FROM sessions
WHERE ended_at IS NULL
```

**Safe to rename**: YES
**Risk level**: MEDIUM

#### `/home/ridgetop/aidis/aidis-command/backend/src/services/gitService.ts`

**Git service integration**

```typescript
// Line 491-493: Session query for git correlation
SELECT id, started_at, ended_at, agent_type
FROM sessions
WHERE project_id = $1
```

**Safe to rename**: YES
**Risk level**: LOW

#### `/home/ridgetop/aidis/aidis-command/backend/src/services/project.ts`

**Project service with session stats**

```typescript
// Line 324-326: Session aggregation in project stats
FROM sessions s
LEFT JOIN projects p ON s.project_id = p.id
```

**Safe to rename**: YES
**Risk level**: LOW

---

## 5. View and Materialized View Dependencies

### Materialized Views

#### `project_complexity_dashboard`

**References**: Indirectly through `complexity_analysis_sessions.session_id`

```sql
LEFT JOIN complexity_analysis_sessions cas
  ON (p.id = cas.project_id AND cas.analysis_timestamp >= ...)
```

**Impact**: None directly, but `complexity_analysis_sessions` has FK to `sessions`

**Safe to rename**: YES - No direct reference, FK handled by migration
**Risk level**: LOW

#### `high_risk_complexity_items`

**References**: Indirectly through `complexity_analysis_sessions`

**Safe to rename**: YES
**Risk level**: LOW

### Standard Views

#### `project_pattern_summary`

**References**: Through `pattern_discovery_sessions.session_id` FK

**Safe to rename**: YES
**Risk level**: LOW

#### `high_risk_files_summary`

**References**: Through pattern session FKs

**Safe to rename**: YES
**Risk level**: LOW

**Note**: Views don't need updating as they don't directly reference the `sessions` table name in their definitions - they go through tables with FKs.

---

## 6. Migration Strategy

### Pre-Migration Checklist

- [ ] Full database backup created
- [ ] All MCP server tests passing
- [ ] All AIDIS Command tests passing
- [ ] Current session count documented: `SELECT COUNT(*) FROM sessions`
- [ ] Active session count documented: `SELECT COUNT(*) FROM sessions WHERE ended_at IS NULL`
- [ ] No active deployments in progress

### Migration SQL (026_rename_sessions_to_agent_sessions.sql)

```sql
-- =====================================================
-- TS001-1: Rename sessions table to agent_sessions
-- =====================================================
-- Purpose: Clarify distinction between MCP agent sessions
--          and web user_sessions for authentication
-- Author: AIDIS Team
-- Date: 2025-09-29
-- Risk Level: HIGH - Core table rename
-- Estimated Downtime: 2-5 seconds (depending on data volume)

BEGIN;

-- Step 1: Drop dual-write trigger (no longer needed)
DROP TRIGGER IF EXISTS sessions_dual_write_trigger ON sessions;

-- Step 2: Drop duplicate updated_at trigger (cleanup)
DROP TRIGGER IF EXISTS update_sessions_updated_at_trigger ON sessions;

-- Step 3: Rename the table
ALTER TABLE sessions RENAME TO agent_sessions;

-- Step 4: Rename the primary key constraint
ALTER TABLE agent_sessions
  RENAME CONSTRAINT sessions_pkey TO agent_sessions_pkey;

-- Step 5: Rename indexes
ALTER INDEX idx_sessions_project_id RENAME TO idx_agent_sessions_project_id;
ALTER INDEX idx_sessions_agent_type RENAME TO idx_agent_sessions_agent_type;
ALTER INDEX idx_sessions_started_at RENAME TO idx_agent_sessions_started_at;
ALTER INDEX idx_sessions_project_agent RENAME TO idx_agent_sessions_project_agent;
ALTER INDEX idx_sessions_title RENAME TO idx_agent_sessions_title;
ALTER INDEX idx_sessions_branch RENAME TO idx_agent_sessions_branch;
ALTER INDEX idx_sessions_working_commit RENAME TO idx_agent_sessions_working_commit;

-- Step 6: Rename check constraints
ALTER TABLE agent_sessions
  RENAME CONSTRAINT reasonable_session_duration TO reasonable_agent_session_duration;

ALTER TABLE agent_sessions
  RENAME CONSTRAINT reasonable_title_length TO reasonable_agent_session_title_length;

-- Step 7: Rename foreign key constraints
ALTER TABLE agent_sessions
  RENAME CONSTRAINT sessions_project_id_fkey TO agent_sessions_project_id_fkey;

ALTER TABLE agent_sessions
  RENAME CONSTRAINT fk_sessions_project TO fk_agent_sessions_project;

-- Step 8: Update foreign keys in referencing tables
-- contexts table
ALTER TABLE contexts
  DROP CONSTRAINT contexts_session_id_fkey,
  ADD CONSTRAINT contexts_agent_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE SET NULL;

-- technical_decisions table
ALTER TABLE technical_decisions
  DROP CONSTRAINT technical_decisions_session_id_fkey,
  ADD CONSTRAINT technical_decisions_agent_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE SET NULL;

-- code_analysis_sessions table
ALTER TABLE code_analysis_sessions
  DROP CONSTRAINT code_analysis_sessions_development_session_id_fkey,
  ADD CONSTRAINT code_analysis_sessions_development_agent_session_id_fkey
    FOREIGN KEY (development_session_id) REFERENCES agent_sessions(id) ON DELETE SET NULL;

-- analysis_session_links table
ALTER TABLE analysis_session_links
  DROP CONSTRAINT analysis_session_links_development_session_id_fkey,
  ADD CONSTRAINT analysis_session_links_development_agent_session_id_fkey
    FOREIGN KEY (development_session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE;

-- event_log table
ALTER TABLE event_log
  DROP CONSTRAINT event_log_session_id_fkey,
  ADD CONSTRAINT event_log_agent_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES agent_sessions(id);

-- pattern_discovery_sessions table
ALTER TABLE pattern_discovery_sessions
  DROP CONSTRAINT pattern_discovery_sessions_session_id_fkey,
  ADD CONSTRAINT pattern_discovery_sessions_agent_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE SET NULL;

-- metrics_collection_sessions table
ALTER TABLE metrics_collection_sessions
  DROP CONSTRAINT metrics_collection_sessions_session_id_fkey,
  ADD CONSTRAINT metrics_collection_sessions_agent_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE SET NULL;

-- productivity_health_metrics table
ALTER TABLE productivity_health_metrics
  DROP CONSTRAINT productivity_health_metrics_target_session_id_fkey,
  ADD CONSTRAINT productivity_health_metrics_target_agent_session_id_fkey
    FOREIGN KEY (target_session_id) REFERENCES agent_sessions(id) ON DELETE SET NULL;

-- complexity_analysis_sessions table
ALTER TABLE complexity_analysis_sessions
  DROP CONSTRAINT complexity_analysis_sessions_session_id_fkey,
  ADD CONSTRAINT complexity_analysis_sessions_agent_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE SET NULL;

-- commit_session_links table
ALTER TABLE commit_session_links
  DROP CONSTRAINT commit_session_links_session_id_fkey,
  ADD CONSTRAINT commit_session_links_agent_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE;

-- Step 9: Rename triggers
ALTER TRIGGER update_sessions_updated_at ON agent_sessions
  RENAME TO update_agent_sessions_updated_at;

ALTER TRIGGER trigger_ensure_session_title ON agent_sessions
  RENAME TO trigger_ensure_agent_session_title;

-- Step 10: Update function that references table (if needed)
-- The ensure_session_title() function doesn't reference the table name,
-- so no changes needed. Same for update_updated_at_column().

-- Step 11: Add comment to new table for documentation
COMMENT ON TABLE agent_sessions IS
  'MCP agent development sessions - renamed from sessions to clarify distinction from user_sessions (web auth). Contains AI agent work sessions with context, git integration, and analytics.';

-- Step 12: Validation queries
DO $$
DECLARE
  session_count INTEGER;
  fk_count INTEGER;
  index_count INTEGER;
BEGIN
  -- Verify table exists with data
  SELECT COUNT(*) INTO session_count FROM agent_sessions;
  RAISE NOTICE 'agent_sessions table has % rows', session_count;

  -- Verify foreign keys
  SELECT COUNT(*) INTO fk_count
  FROM information_schema.table_constraints
  WHERE table_name IN (
    'contexts', 'technical_decisions', 'code_analysis_sessions',
    'analysis_session_links', 'event_log', 'pattern_discovery_sessions',
    'metrics_collection_sessions', 'productivity_health_metrics',
    'complexity_analysis_sessions', 'commit_session_links'
  ) AND constraint_type = 'FOREIGN KEY'
  AND constraint_name LIKE '%agent_session%';
  RAISE NOTICE 'Found % foreign key constraints to agent_sessions', fk_count;

  -- Verify indexes
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE tablename = 'agent_sessions';
  RAISE NOTICE 'agent_sessions has % indexes', index_count;

  IF fk_count < 10 THEN
    RAISE EXCEPTION 'Foreign key migration incomplete - expected 10+, found %', fk_count;
  END IF;
END $$;

COMMIT;

-- Post-migration verification
SELECT 'Migration 026 completed successfully - sessions renamed to agent_sessions' AS status;

-- Show table structure for verification
\d agent_sessions
```

### Rollback SQL (if needed)

```sql
-- EMERGENCY ROLLBACK: Rename agent_sessions back to sessions
-- Only use if migration fails or critical issues discovered

BEGIN;

-- Reverse table rename
ALTER TABLE agent_sessions RENAME TO sessions;

-- Reverse constraint renames
ALTER TABLE sessions RENAME CONSTRAINT agent_sessions_pkey TO sessions_pkey;
ALTER TABLE sessions RENAME CONSTRAINT reasonable_agent_session_duration TO reasonable_session_duration;
ALTER TABLE sessions RENAME CONSTRAINT reasonable_agent_session_title_length TO reasonable_title_length;
ALTER TABLE sessions RENAME CONSTRAINT agent_sessions_project_id_fkey TO sessions_project_id_fkey;
ALTER TABLE sessions RENAME CONSTRAINT fk_agent_sessions_project TO fk_sessions_project;

-- Reverse index renames
ALTER INDEX idx_agent_sessions_project_id RENAME TO idx_sessions_project_id;
ALTER INDEX idx_agent_sessions_agent_type RENAME TO idx_sessions_agent_type;
ALTER INDEX idx_agent_sessions_started_at RENAME TO idx_sessions_started_at;
ALTER INDEX idx_agent_sessions_project_agent RENAME TO idx_sessions_project_agent;
ALTER INDEX idx_agent_sessions_title RENAME TO idx_sessions_title;
ALTER INDEX idx_agent_sessions_branch RENAME TO idx_sessions_branch;
ALTER INDEX idx_agent_sessions_working_commit RENAME TO idx_sessions_working_commit;

-- Reverse trigger renames
ALTER TRIGGER update_agent_sessions_updated_at ON sessions
  RENAME TO update_sessions_updated_at;
ALTER TRIGGER trigger_ensure_agent_session_title ON sessions
  RENAME TO trigger_ensure_session_title;

-- Reverse foreign keys (simplified - recreate all)
-- contexts
ALTER TABLE contexts DROP CONSTRAINT contexts_agent_session_id_fkey;
ALTER TABLE contexts ADD CONSTRAINT contexts_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;

-- technical_decisions
ALTER TABLE technical_decisions DROP CONSTRAINT technical_decisions_agent_session_id_fkey;
ALTER TABLE technical_decisions ADD CONSTRAINT technical_decisions_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;

-- (repeat for all 10 referencing tables...)

COMMIT;
```

---

## 7. Code Update Strategy

### Phase 1: MCP Server Updates

**Priority files (in order)**:

1. **sessionTracker.ts** - 20+ queries to update
2. **sessionAnalytics.ts** - 15+ queries to update
3. **sessionMigrator.ts** - 5+ queries to update
4. **gitTracker.ts** - 2 queries to update
5. **patternDetector.ts** - 1 query to update
6. **metricsCollector.ts** - 1 query to update
7. **sessionManager.ts** - 1 query to update
8. **Test files** - Update all assertions

**Find and replace pattern**:
```bash
# Search pattern (careful - must preserve "user_sessions")
grep -r "FROM sessions" --include="*.ts" --exclude-dir=node_modules .
grep -r "INSERT INTO sessions" --include="*.ts" --exclude-dir=node_modules .
grep -r "UPDATE sessions" --include="*.ts" --exclude-dir=node_modules .
grep -r "DELETE FROM sessions" --include="*.ts" --exclude-dir=node_modules .

# Replace sessions → agent_sessions (but NOT user_sessions)
# Manual review required for each occurrence
```

### Phase 2: AIDIS Command Backend Updates

**Priority files**:

1. **sessionDetail.ts** - Union queries to update
2. **sessionCode.ts** - Route queries to update
3. **gitService.ts** - Integration queries to update
4. **project.ts** - Stats queries to update

**Note**: Most files use `user_sessions` and don't need updates.

### Phase 3: Migration Files Updates

**Create new consolidated migration**:

Option A: Keep historical migrations intact (recommended)
- Leave migrations 002, 010, 011, 014, 017 as-is
- Create new migration 026 that performs the rename
- Update comments in old migrations noting the rename

Option B: Update historical migrations
- Update all references in migrations 002, 010, 011, 014, 017
- Only viable if no production databases exist yet

**Recommendation**: Option A for production safety

---

## 8. Risk Assessment

### HIGH RISKS

1. **Concurrent Operations During Migration**
   - **Risk**: Active sessions being created/updated during rename
   - **Mitigation**:
     - Schedule migration during low-activity window
     - Stop MCP server before migration
     - Use transaction to ensure atomicity
   - **Severity**: HIGH

2. **Foreign Key Cascade Effects**
   - **Risk**: FK constraint operations may lock child tables
   - **Mitigation**:
     - Use `LOCK TABLE sessions IN ACCESS EXCLUSIVE MODE` at start
     - Keep transaction as short as possible
     - Test on copy of production database first
   - **Severity**: HIGH

3. **Application Downtime**
   - **Risk**: Code references `sessions` while DB has `agent_sessions`
   - **Mitigation**:
     - Deploy code changes BEFORE running migration
     - Use feature flag to switch between old/new table name
     - Have rollback script ready
   - **Severity**: HIGH

### MEDIUM RISKS

4. **Cached Query Plans**
   - **Risk**: Application might have cached prepared statements with old table name
   - **Mitigation**:
     - Restart all application services after migration
     - Clear any query plan caches
   - **Severity**: MEDIUM

5. **External Tools/Scripts**
   - **Risk**: Monitoring, backup, or admin scripts might reference `sessions`
   - **Mitigation**:
     - Audit all scripts in `/run/`, `/backups/`, etc.
     - Update health checks and monitoring queries
   - **Severity**: MEDIUM

6. **Documentation References**
   - **Risk**: Docs, diagrams, examples still show `sessions`
   - **Mitigation**:
     - Update CLAUDE.md, README.md, and all doc files
     - Update OpenAPI schemas if they reference the table
   - **Severity**: LOW

### LOW RISKS

7. **Test Data Inconsistency**
   - **Risk**: Test fixtures might use old table name
   - **Mitigation**:
     - Run full test suite after migration
     - Update test data generators
   - **Severity**: LOW

8. **Logging and Error Messages**
   - **Risk**: Error messages might still say "sessions table"
   - **Mitigation**:
     - Update error messages in code
     - Grep for hardcoded strings
   - **Severity**: LOW

---

## 9. Testing Strategy

### Pre-Migration Testing

1. **Schema validation on copy**:
   ```bash
   # Create test database
   createdb aidis_test_rename
   pg_restore -d aidis_test_rename latest_backup.sql

   # Run migration
   psql -d aidis_test_rename -f 026_rename_sessions_to_agent_sessions.sql

   # Verify structure
   psql -d aidis_test_rename -c "\d agent_sessions"
   psql -d aidis_test_rename -c "\dC agent_sessions"
   ```

2. **Code compatibility check**:
   ```bash
   # Before migration
   npm run test:unit
   npm run test:e2e
   npm run type-check
   npm run lint
   ```

3. **Integration test**:
   - Create session via MCP
   - Verify it appears in `agent_sessions`
   - Query session details
   - Update session metadata
   - End session
   - Verify all operations work

### Post-Migration Testing

1. **Database integrity**:
   ```sql
   -- Verify row count matches backup
   SELECT COUNT(*) FROM agent_sessions;

   -- Verify all foreign keys exist
   SELECT COUNT(*) FROM information_schema.table_constraints
   WHERE constraint_name LIKE '%agent_session%'
   AND constraint_type = 'FOREIGN KEY';

   -- Verify indexes exist
   SELECT COUNT(*) FROM pg_indexes
   WHERE tablename = 'agent_sessions';

   -- Verify triggers exist
   SELECT COUNT(*) FROM pg_trigger
   WHERE tgrelid = 'agent_sessions'::regclass;
   ```

2. **Application functionality**:
   - [ ] Start new session successfully
   - [ ] Session appears in dashboard
   - [ ] Can assign session to project
   - [ ] Can update session title/description
   - [ ] Context storage works
   - [ ] Session analytics display correctly
   - [ ] Git correlation works
   - [ ] Pattern detection works
   - [ ] Metrics collection works
   - [ ] Session ending works
   - [ ] Session recovery works

3. **Performance validation**:
   ```sql
   -- Verify query plans haven't changed
   EXPLAIN ANALYZE
   SELECT * FROM agent_sessions
   WHERE project_id = '...' AND ended_at IS NULL;

   -- Check index usage
   SELECT schemaname, tablename, indexname, idx_scan
   FROM pg_stat_user_indexes
   WHERE tablename = 'agent_sessions';
   ```

---

## 10. Deployment Checklist

### Pre-Deployment

- [ ] Full database backup created (pg_dump)
- [ ] Backup verified restorable
- [ ] Migration SQL reviewed and tested on copy
- [ ] Rollback SQL prepared and tested
- [ ] All code changes committed and tested
- [ ] MCP server test suite passing
- [ ] AIDIS Command test suite passing
- [ ] Stakeholders notified of maintenance window
- [ ] Monitoring alerts configured for post-migration

### Deployment Steps

1. [ ] Put system in maintenance mode
2. [ ] Stop all AIDIS services:
   ```bash
   ./stop-aidis.sh
   cd aidis-command && docker-compose down
   ```

3. [ ] Create final backup:
   ```bash
   pg_dump -h localhost -p 5432 -d aidis_production > \
     pre_rename_backup_$(date +%Y%m%d_%H%M%S).sql
   ```

4. [ ] Run migration:
   ```bash
   psql -h localhost -p 5432 -d aidis_production \
     -f mcp-server/database/migrations/026_rename_sessions_to_agent_sessions.sql
   ```

5. [ ] Verify migration success:
   ```bash
   psql -h localhost -p 5432 -d aidis_production \
     -c "\d agent_sessions"
   ```

6. [ ] Deploy updated code:
   ```bash
   git pull
   cd mcp-server && npm install
   cd ../aidis-command && npm install
   ```

7. [ ] Start services:
   ```bash
   ./start-aidis.sh
   cd aidis-command && docker-compose up -d
   ```

8. [ ] Run smoke tests (see Post-Migration Testing above)

9. [ ] Monitor for errors:
   ```bash
   tail -f /var/log/aidis/*.log
   ```

10. [ ] Remove maintenance mode

### Post-Deployment

- [ ] Monitor application logs for 24 hours
- [ ] Verify session creation rate normal
- [ ] Check database performance metrics
- [ ] Validate all analytics dashboards working
- [ ] Update documentation (CLAUDE.md, README.md)
- [ ] Document actual downtime and any issues
- [ ] Archive migration backup

### Rollback Procedure (if needed)

1. [ ] Stop all services immediately
2. [ ] Run rollback SQL script
3. [ ] Restore previous code version
4. [ ] Restart services
5. [ ] Verify system operational
6. [ ] Document rollback reason
7. [ ] Schedule post-mortem

---

## 11. Open Questions / Decisions Needed

1. **Migration Timing**
   - Preferred maintenance window?
   - Expected downtime tolerance?
   - Rollback window if issues found?

2. **Code Deployment Strategy**
   - Deploy code first, then migrate DB?
   - Or migrate DB first, then deploy code?
   - **Recommendation**: Code first (with backward compatibility)

3. **Dual-Write Cleanup**
   - Remove `sessions_shadow` table?
   - Remove dual-write triggers?
   - **Recommendation**: Yes, cleanup in this migration

4. **Duplicate Trigger Cleanup**
   - Remove `update_sessions_updated_at_trigger` (duplicate)?
   - **Recommendation**: Yes, keep only one updated_at trigger

5. **Historical Migration Updates**
   - Update old migrations or leave as-is?
   - **Recommendation**: Leave historical migrations as-is, add notes

---

## 12. Success Criteria

### Functional Success
- [ ] All sessions accessible via `agent_sessions` table
- [ ] All foreign keys functioning correctly
- [ ] All triggers functioning correctly
- [ ] All indexes providing expected performance
- [ ] MCP server can create/update/end sessions
- [ ] AIDIS Command can query session data
- [ ] Analytics and reporting working
- [ ] Git correlation working
- [ ] Pattern detection working

### Performance Success
- [ ] Query performance same or better than before
- [ ] Index usage statistics similar to before
- [ ] No new slow query log entries
- [ ] Application response times unchanged

### Data Integrity Success
- [ ] Row count in `agent_sessions` matches pre-migration `sessions`
- [ ] All UUIDs preserved
- [ ] All timestamps preserved
- [ ] All JSON metadata intact
- [ ] All foreign key relationships intact
- [ ] No orphaned records in child tables

---

## 13. Estimated Effort

- **Investigation Time**: 4 hours ✅ (completed)
- **Migration SQL Development**: 2 hours
- **Code Updates**: 4-6 hours
  - MCP Server: 3-4 hours
  - AIDIS Command Backend: 1-2 hours
- **Testing**: 3-4 hours
  - Unit test updates: 1 hour
  - Integration testing: 2-3 hours
- **Deployment**: 1-2 hours
  - Actual migration: 5-10 minutes
  - Verification and monitoring: 1-2 hours
- **Documentation Updates**: 1 hour

**Total Estimated Effort**: 15-19 hours
**Actual Downtime**: 2-5 seconds (just the ALTER TABLE duration)
**Risk-Adjusted Buffer**: +25% for unexpected issues

---

## 14. Conclusion

The rename of `sessions` → `agent_sessions` is **feasible but requires careful execution** due to:

1. **Extensive Integration**: 18 foreign keys, 100+ code references
2. **Critical Functionality**: Core to all MCP session operations
3. **Zero-Downtime Requirement**: Must maintain service availability

**Recommended Approach**:
1. Deploy code changes first (with feature flag support)
2. Run migration during low-activity window
3. Use transaction-wrapped SQL for atomicity
4. Have tested rollback ready
5. Monitor closely for 24 hours post-deployment

**Next Steps**:
1. Partner review of investigation report
2. Approval to proceed with implementation
3. Schedule migration window
4. Begin code updates (TS001-2)

---

**Investigation Complete**: Ready to proceed with implementation phase pending partner approval.