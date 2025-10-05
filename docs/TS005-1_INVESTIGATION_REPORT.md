# TS005-1: Task-Session Linking + Display ID Generation
## Investigation Report

**Date**: 2025-09-30
**Investigator**: Claude Code
**Status**: ✅ Investigation Complete

---

## EXECUTIVE SUMMARY

Investigation completed for linking tasks to sessions and generating human-readable display IDs for sessions. Current state analysis reveals:

- **Tasks table**: ❌ **NO session_id column exists** - needs to be added
- **Contexts table**: ✅ Already has session_id FK with proper indexes
- **Sessions table**: ✅ Has all required fields (title, description, status, timestamps)
- **Display ID**: ❌ Not implemented - needs new column + generation logic
- **Data volume**: 396 tasks, 61 sessions, 186 contexts already linked to sessions

**Key Finding**: The sessions-specs.md requirement for "session_display_id user readable" (like "SES-2025-0001") needs implementation with year-based sequence management.

---

## 1. CURRENT DATABASE SCHEMA ANALYSIS

### 1.1 Tasks Table Schema
```sql
-- Current tasks table (from production database)
Table "public.tasks"
Column       | Type                      | Nullable | Default
-------------|---------------------------|----------|------------------
id           | uuid                      | not null | gen_random_uuid()
project_id   | uuid                      | not null |
title        | varchar(500)              | not null |
description  | text                      |          |
type         | varchar(100)              | not null | 'general'
status       | varchar(50)               | not null | 'todo'
priority     | varchar(20)               | not null | 'medium'
assigned_to  | varchar(200)              |          |
dependencies | uuid[]                    |          | '{}'
tags         | text[]                    |          | '{}'
metadata     | jsonb                     |          | '{}'
created_at   | timestamp with time zone  |          | CURRENT_TIMESTAMP
updated_at   | timestamp with time zone  |          | CURRENT_TIMESTAMP
progress     | integer                   |          | 0
started_at   | timestamp with time zone  |          |
completed_at | timestamp with time zone  |          |
created_by   | varchar(200)              |          |
```

**Critical Gap**: ❌ **NO session_id column**

### 1.2 Sessions Table Schema
```sql
-- Current sessions table (from production database)
Table "public.sessions"
Column               | Type                      | Nullable | Default
---------------------|---------------------------|----------|-------------------
id                   | uuid                      | not null | gen_random_uuid()
project_id           | uuid                      |          |
agent_type           | varchar(50)               | not null |
started_at           | timestamp with time zone  |          | CURRENT_TIMESTAMP
ended_at             | timestamp with time zone  |          |
context_summary      | text                      |          |
tokens_used          | integer                   |          | 0
metadata             | jsonb                     |          | '{}'
updated_at           | timestamp with time zone  |          | CURRENT_TIMESTAMP
active_branch        | varchar(255)              |          |
working_commit_sha   | varchar(40)               |          |
commits_contributed  | integer                   |          | 0
pattern_preferences  | jsonb                     |          | '{}'
insights_generated   | integer                   |          | 0
last_pattern_analysis| timestamp with time zone  |          |
title                | varchar(255)              |          |
description          | text                      |          |
agent_display_name   | varchar(100)              |          |
status               | varchar(20)               |          | 'active'
last_activity_at     | timestamp with time zone  |          |
```

**Critical Gap**: ❌ **NO display_id column** for human-readable session IDs

### 1.3 Contexts Table (Reference Pattern)
```sql
-- contexts table ALREADY has session_id FK - use as reference pattern
session_id | uuid | | (references sessions.id ON DELETE SET NULL)

-- WITH proper indexing:
idx_contexts_session_id ON contexts(session_id)
```

**Pattern to Follow**: Contexts successfully link to sessions via session_id FK with ON DELETE SET NULL

### 1.4 Technical Decisions Table (Another Reference)
```sql
-- technical_decisions table ALSO has session_id FK
session_id | uuid | | (references sessions.id ON DELETE SET NULL)
```

**Pattern Confirmed**: Multiple tables use session_id FK for linking

---

## 2. DISPLAY ID GENERATION SPECIFICATION

### 2.1 User Requirements Analysis

From sessions-specs.md:
> "session_id (this needs to be searchable by you and user - is the parent)"
> "let's make the session_display_id user readable"

**Interpretation**: Need TWO identifiers:
- `id` (UUID) - Primary key for database relationships (parent)
- `display_id` (VARCHAR) - Human-readable for user/AI search (e.g., "SES-2025-0001")

### 2.2 Display ID Format Design

**Proposed Format**: `SES-YYYY-NNNN`

Examples:
- `SES-2025-0001` - First session of 2025
- `SES-2025-0061` - 61st session of 2025 (current count)
- `SES-2026-0001` - First session of 2026 (resets each year)

**Benefits**:
- Human-readable and memorable
- Year-based grouping for analytics
- Auto-sortable chronologically
- Searchable by partial match (all 2025 sessions: `SES-2025-%`)
- Fixed width for UI alignment

### 2.3 Sequence Management Strategy

PostgreSQL has one existing sequence: `_aidis_migrations_id_seq` (for migrations only)

**Option A: PostgreSQL Sequence per Year** ⭐ **RECOMMENDED**
```sql
-- Create sequence function that handles year rollover
CREATE OR REPLACE FUNCTION get_next_session_display_id()
RETURNS VARCHAR(13) AS $$
DECLARE
    current_year INTEGER := EXTRACT(YEAR FROM CURRENT_TIMESTAMP);
    sequence_name VARCHAR := 'session_seq_' || current_year;
    next_num INTEGER;
BEGIN
    -- Create sequence for current year if not exists
    EXECUTE format(
        'CREATE SEQUENCE IF NOT EXISTS %I START WITH 1',
        sequence_name
    );

    -- Get next value
    EXECUTE format('SELECT nextval(%L)', sequence_name) INTO next_num;

    -- Format: SES-YYYY-NNNN
    RETURN 'SES-' || current_year || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Usage in INSERT:
-- display_id = get_next_session_display_id()
```

**Benefits**:
- Atomic operation (no race conditions)
- Year rollover handled automatically
- Postgres native (fast, reliable)
- No external tracking needed

**Option B: Table-Based Counter** (Alternative)
```sql
CREATE TABLE session_counters (
    year INTEGER PRIMARY KEY,
    counter INTEGER NOT NULL DEFAULT 0
);

-- Increment and get in transaction
-- More complex, more code to maintain
```

**Decision**: Use Option A (Postgres function) for simplicity and reliability

### 2.4 Backfill Strategy for Existing Sessions

Current data: 61 sessions (all from 2025)

```sql
-- Step 1: Add display_id column (nullable initially)
ALTER TABLE sessions ADD COLUMN display_id VARCHAR(13);

-- Step 2: Create generation function (as above)

-- Step 3: Backfill existing sessions chronologically
WITH numbered_sessions AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY EXTRACT(YEAR FROM started_at)
            ORDER BY started_at ASC
        ) as seq_num,
        EXTRACT(YEAR FROM started_at) as year
    FROM sessions
    WHERE display_id IS NULL
)
UPDATE sessions s
SET display_id = 'SES-' || ns.year || '-' || LPAD(ns.seq_num::TEXT, 4, '0')
FROM numbered_sessions ns
WHERE s.id = ns.id;

-- Step 4: Make display_id NOT NULL and add constraint
ALTER TABLE sessions ALTER COLUMN display_id SET NOT NULL;
ALTER TABLE sessions ADD CONSTRAINT sessions_display_id_unique UNIQUE (display_id);

-- Step 5: Initialize sequence for current year
SELECT setval('session_seq_2025', (
    SELECT COALESCE(MAX(CAST(SUBSTRING(display_id FROM 10 FOR 4) AS INTEGER)), 0)
    FROM sessions
    WHERE display_id LIKE 'SES-2025-%'
));
```

---

## 3. TASK-SESSION LINKING IMPLEMENTATION

### 3.1 Add session_id Column to Tasks Table

```sql
-- Migration: Add session_id FK to tasks table
ALTER TABLE tasks
ADD COLUMN session_id UUID
REFERENCES sessions(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX idx_tasks_session_id ON tasks(session_id);

-- Add compound index for common analytics queries
CREATE INDEX idx_tasks_session_project ON tasks(session_id, project_id)
WHERE session_id IS NOT NULL;
```

**Design Decision**: ON DELETE SET NULL
- Matches pattern from contexts and technical_decisions tables
- Preserves task history even if session is deleted
- Allows orphaned tasks (session_id = NULL) from pre-implementation data

### 3.2 Populate session_id on Task Creation

**Current Code Location**: `/home/ridgetop/aidis/mcp-server/src/handlers/tasks.ts`

```typescript
// CURRENT CODE (lines 41-48):
const result = await client.query(
    `INSERT INTO tasks
     (project_id, title, description, type, priority, assigned_to, created_by, tags, dependencies, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [projectId, title, description, type, priority, assignedTo, createdBy, tags, dependencies, metadata]
);

// CURRENT SESSION TRACKING (lines 49-54):
const { SessionTracker } = await import('../services/sessionTracker.js');
const sessionId = await SessionTracker.getActiveSession();
if (sessionId) {
    await SessionTracker.updateSessionActivity(sessionId);
}
```

**REQUIRED CHANGE**:
```typescript
// Get active session BEFORE insert
const { SessionTracker } = await import('../services/sessionTracker.js');
const sessionId = await SessionTracker.getActiveSession();

// Include session_id in INSERT
const result = await client.query(
    `INSERT INTO tasks
     (project_id, session_id, title, description, type, priority, assigned_to, created_by, tags, dependencies, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [projectId, sessionId, title, description, type, priority, assignedTo, createdBy, tags, dependencies, metadata]
);

// Update session activity
if (sessionId) {
    await SessionTracker.updateSessionActivity(sessionId);
}
```

### 3.3 TypeScript Interface Updates

**File**: `/home/ridgetop/aidis/mcp-server/src/handlers/tasks.ts`

```typescript
// CURRENT Interface (lines 4-22):
export interface Task {
    id: string;
    projectId: string;
    title: string;
    description?: string;
    type: string;
    status: 'todo' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    dependencies: string[];
    tags: string[];
    metadata: Record<string, any>;
    assignedTo?: string;
    createdBy?: string;
    progress: number;
    startedAt?: Date;
    completedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

// ADD THIS FIELD:
export interface Task {
    id: string;
    projectId: string;
    sessionId?: string;  // ⬅️ ADD THIS LINE
    // ... rest of interface
}
```

**Update mapTask function** (line 465):
```typescript
private mapTask(row: any): Task {
    return {
        id: row.id,
        projectId: row.project_id,
        sessionId: row.session_id,  // ⬅️ ADD THIS LINE
        title: row.title,
        // ... rest of mapping
    };
}
```

### 3.4 Backfill Strategy for Existing Tasks

**Challenge**: 396 existing tasks with no session_id

**Strategy**: Time-based heuristic matching

```sql
-- Attempt to match tasks to sessions by time proximity and project
WITH task_session_matches AS (
    SELECT
        t.id as task_id,
        s.id as session_id,
        ROW_NUMBER() OVER (
            PARTITION BY t.id
            ORDER BY ABS(EXTRACT(EPOCH FROM (t.created_at - s.started_at)))
        ) as match_rank
    FROM tasks t
    LEFT JOIN sessions s ON (
        s.project_id = t.project_id
        AND s.started_at <= t.created_at + INTERVAL '5 minutes'
        AND s.started_at >= t.created_at - INTERVAL '1 hour'
    )
    WHERE t.session_id IS NULL
)
UPDATE tasks t
SET session_id = tsm.session_id
FROM task_session_matches tsm
WHERE t.id = tsm.task_id
  AND tsm.match_rank = 1
  AND tsm.session_id IS NOT NULL;

-- Result check query:
SELECT
    COUNT(*) FILTER (WHERE session_id IS NOT NULL) as linked_tasks,
    COUNT(*) FILTER (WHERE session_id IS NULL) as orphaned_tasks,
    COUNT(*) as total_tasks
FROM tasks;
```

**Expected Outcome**:
- Recent tasks (created during active sessions) → linked
- Old tasks (pre-sessions implementation) → orphaned (session_id = NULL)
- Future tasks → automatically linked via updated createTask code

---

## 4. ANALYTICS QUERY PATTERNS

### 4.1 Tasks Per Session
```sql
-- Count tasks created during each session
SELECT
    s.id,
    s.display_id,
    s.title,
    s.started_at,
    COUNT(t.id) as tasks_created,
    COUNT(t.id) FILTER (WHERE t.status = 'completed') as tasks_completed,
    ROUND(
        COUNT(t.id) FILTER (WHERE t.status = 'completed')::numeric /
        NULLIF(COUNT(t.id), 0) * 100,
        1
    ) as completion_percentage
FROM sessions s
LEFT JOIN tasks t ON t.session_id = s.id
GROUP BY s.id, s.display_id, s.title, s.started_at
ORDER BY s.started_at DESC;
```

### 4.2 Session Details with All Linked Data
```sql
-- Comprehensive session details (for "Details on click" requirement)
SELECT
    s.id,
    s.display_id,
    s.title,
    s.description,
    p.name as project_name,
    s.started_at,
    s.ended_at,
    EXTRACT(EPOCH FROM (COALESCE(s.ended_at, NOW()) - s.started_at))::INTEGER as session_duration_seconds,
    (SELECT COUNT(*) FROM contexts c WHERE c.session_id = s.id) as contexts_created,
    (SELECT COUNT(*) FROM tasks t WHERE t.session_id = s.id) as tasks_created,
    (SELECT COUNT(*) FROM tasks t WHERE t.session_id = s.id AND t.status = 'completed') as tasks_completed,
    s.tokens_used,
    s.status,
    s.agent_type,
    s.agent_display_name
FROM sessions s
LEFT JOIN projects p ON p.id = s.project_id
WHERE s.id = $1;  -- or s.display_id = 'SES-2025-0042'
```

### 4.3 Search by Display ID
```sql
-- User requirement: "session_id needs to be searchable by you and user"
-- Search by display_id pattern
SELECT id, display_id, title, started_at, status
FROM sessions
WHERE display_id ILIKE $1  -- e.g., '%2025%' or 'SES-2025-0042'
ORDER BY started_at DESC;

-- Add GIN index for ILIKE performance
CREATE INDEX idx_sessions_display_id_gin ON sessions USING GIN (display_id gin_trgm_ops);
-- Requires: CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### 4.4 Tasks by Session (for Clickable Contexts)
```sql
-- List all tasks for a session (clickable from session details)
SELECT
    t.id,
    t.title,
    t.type,
    t.status,
    t.priority,
    t.assigned_to,
    t.created_at,
    t.completed_at,
    t.tags
FROM tasks t
WHERE t.session_id = $1  -- session UUID or lookup by display_id
ORDER BY t.created_at DESC;
```

---

## 5. INDEX REQUIREMENTS FOR PERFORMANCE

### 5.1 Sessions Table Indexes (New)
```sql
-- Display ID indexes
CREATE UNIQUE INDEX idx_sessions_display_id_unique ON sessions(display_id);
CREATE INDEX idx_sessions_display_id_pattern ON sessions(display_id varchar_pattern_ops);

-- For year-based analytics
CREATE INDEX idx_sessions_year ON sessions(EXTRACT(YEAR FROM started_at));

-- Compound index for common session details query
CREATE INDEX idx_sessions_details ON sessions(id, project_id, started_at)
WHERE ended_at IS NULL OR ended_at IS NOT NULL;
```

### 5.2 Tasks Table Indexes (New)
```sql
-- Session FK index
CREATE INDEX idx_tasks_session_id ON tasks(session_id);

-- Compound index for session-project analytics
CREATE INDEX idx_tasks_session_project ON tasks(session_id, project_id)
WHERE session_id IS NOT NULL;

-- For counting completed tasks per session
CREATE INDEX idx_tasks_session_status ON tasks(session_id, status)
WHERE session_id IS NOT NULL;
```

### 5.3 Existing Indexes (Verified)
```sql
-- Contexts already has:
idx_contexts_session_id ON contexts(session_id)  ✅

-- Tasks already has:
idx_tasks_project_id ON tasks(project_id)  ✅
idx_tasks_status ON tasks(status)  ✅
idx_tasks_created_at ON tasks(created_at)  ✅
```

---

## 6. IMPLEMENTATION PLAN

### Phase 1: Sessions Display ID (No Dependencies)
1. Create migration `026_add_session_display_id.sql`
   - Add `display_id VARCHAR(13)` column to sessions
   - Create `get_next_session_display_id()` function
   - Backfill existing 61 sessions chronologically
   - Add unique constraint
   - Create indexes

2. Update TypeScript session interfaces
   - Add `displayId: string` to session types
   - Update session creation to call generation function
   - Update session queries to SELECT display_id

3. Update session handlers to return display_id
   - sessionTracker.ts: include display_id in return objects
   - session_new tool: return display_id in response

### Phase 2: Tasks-Session Linking (Depends on Phase 1)
1. Create migration `027_add_tasks_session_id.sql`
   - Add `session_id UUID` FK to tasks table
   - Create indexes for performance
   - Attempt time-based backfill for existing tasks

2. Update tasks.ts TypeScript code
   - Add `sessionId?: string` to Task interface
   - Update `createTask()` to capture and insert session_id
   - Update `mapTask()` to include session_id
   - Update task listing to optionally filter by session_id

3. Add new task analytics methods
   - `getTasksBySession(sessionId)`
   - Update `getTaskProgressSummary()` to group by session
   - Add session_id to bulk operations

### Phase 3: Frontend/API Updates (Depends on Phase 2)
1. Update MCP tool schemas
   - task_create: document session_id auto-population
   - session_new: document display_id in response
   - session_details: include tasks_created count

2. Update session details API/tool
   - Include tasks count and list
   - Include contexts count (already working)
   - Add display_id to all session responses

3. Update AIDIS Command UI (if applicable)
   - Display session display_id in UI
   - Make display_id searchable
   - Show linked tasks on session details page

---

## 7. MIGRATION SCRIPTS

### Migration 026: Add Session Display ID
```sql
-- File: /home/ridgetop/aidis/mcp-server/database/migrations/026_add_session_display_id.sql
-- TS005-1: Session Display ID Generation
-- Date: 2025-09-30

BEGIN;

-- Step 1: Add display_id column (nullable for now)
ALTER TABLE sessions
ADD COLUMN display_id VARCHAR(13);

-- Step 2: Create year-based sequence generator function
CREATE OR REPLACE FUNCTION get_next_session_display_id()
RETURNS VARCHAR(13) AS $$
DECLARE
    current_year INTEGER := EXTRACT(YEAR FROM CURRENT_TIMESTAMP);
    sequence_name VARCHAR := 'session_seq_' || current_year;
    next_num INTEGER;
BEGIN
    -- Create sequence for current year if not exists
    EXECUTE format(
        'CREATE SEQUENCE IF NOT EXISTS %I START WITH 1',
        sequence_name
    );

    -- Get next value
    EXECUTE format('SELECT nextval(%L)', sequence_name) INTO next_num;

    -- Format: SES-YYYY-NNNN
    RETURN 'SES-' || current_year || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Step 3: Backfill existing sessions chronologically
WITH numbered_sessions AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY EXTRACT(YEAR FROM started_at)
            ORDER BY started_at ASC
        ) as seq_num,
        EXTRACT(YEAR FROM started_at)::INTEGER as year
    FROM sessions
    WHERE display_id IS NULL
)
UPDATE sessions s
SET display_id = 'SES-' || ns.year || '-' || LPAD(ns.seq_num::TEXT, 4, '0')
FROM numbered_sessions ns
WHERE s.id = ns.id;

-- Step 4: Initialize sequence to continue from last backfilled value
DO $$
DECLARE
    last_seq INTEGER;
BEGIN
    SELECT COALESCE(
        MAX(CAST(SUBSTRING(display_id FROM 10 FOR 4) AS INTEGER)),
        0
    ) INTO last_seq
    FROM sessions
    WHERE display_id LIKE 'SES-2025-%';

    IF last_seq > 0 THEN
        PERFORM setval('session_seq_2025', last_seq);
    END IF;
END $$;

-- Step 5: Make display_id required and unique
ALTER TABLE sessions
ALTER COLUMN display_id SET NOT NULL;

ALTER TABLE sessions
ADD CONSTRAINT sessions_display_id_unique UNIQUE (display_id);

-- Step 6: Create indexes for performance
CREATE INDEX idx_sessions_display_id_pattern
ON sessions(display_id varchar_pattern_ops);

CREATE INDEX idx_sessions_year
ON sessions(EXTRACT(YEAR FROM started_at));

-- Step 7: Add helpful comment
COMMENT ON COLUMN sessions.display_id IS
'Human-readable session identifier (e.g., SES-2025-0042). Auto-generated on insert using get_next_session_display_id() function. Searchable by users and AI. Year-based sequence resets annually.';

-- Step 8: Create trigger to auto-generate display_id on insert
CREATE OR REPLACE FUNCTION set_session_display_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.display_id IS NULL THEN
        NEW.display_id := get_next_session_display_id();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_session_display_id
    BEFORE INSERT ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION set_session_display_id();

-- Verify migration
SELECT
    COUNT(*) as total_sessions,
    COUNT(display_id) as sessions_with_display_id,
    MIN(display_id) as first_display_id,
    MAX(display_id) as last_display_id
FROM sessions;

COMMIT;

-- Rollback plan (if needed):
-- DROP TRIGGER IF EXISTS trigger_set_session_display_id ON sessions;
-- DROP FUNCTION IF EXISTS set_session_display_id();
-- DROP FUNCTION IF EXISTS get_next_session_display_id();
-- ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_display_id_unique;
-- ALTER TABLE sessions DROP COLUMN IF EXISTS display_id;
-- DROP SEQUENCE IF EXISTS session_seq_2025;
```

### Migration 027: Add Tasks Session ID
```sql
-- File: /home/ridgetop/aidis/mcp-server/database/migrations/027_add_tasks_session_id.sql
-- TS005-1: Link Tasks to Sessions
-- Date: 2025-09-30

BEGIN;

-- Step 1: Add session_id FK column to tasks
ALTER TABLE tasks
ADD COLUMN session_id UUID
REFERENCES sessions(id) ON DELETE SET NULL;

-- Step 2: Create index for session_id lookups
CREATE INDEX idx_tasks_session_id ON tasks(session_id);

-- Step 3: Create compound index for session-project analytics
CREATE INDEX idx_tasks_session_project ON tasks(session_id, project_id)
WHERE session_id IS NOT NULL;

-- Step 4: Create index for session status filtering
CREATE INDEX idx_tasks_session_status ON tasks(session_id, status)
WHERE session_id IS NOT NULL;

-- Step 5: Attempt time-based backfill for existing tasks
-- Match tasks to sessions by proximity in time and same project
WITH task_session_matches AS (
    SELECT
        t.id as task_id,
        s.id as session_id,
        ROW_NUMBER() OVER (
            PARTITION BY t.id
            ORDER BY ABS(EXTRACT(EPOCH FROM (t.created_at - s.started_at)))
        ) as match_rank,
        ABS(EXTRACT(EPOCH FROM (t.created_at - s.started_at))) as time_diff_seconds
    FROM tasks t
    INNER JOIN sessions s ON (
        s.project_id = t.project_id
        AND s.started_at <= t.created_at + INTERVAL '10 minutes'
        AND s.started_at >= t.created_at - INTERVAL '2 hours'
    )
    WHERE t.session_id IS NULL
)
UPDATE tasks t
SET session_id = tsm.session_id,
    metadata = COALESCE(t.metadata, '{}'::jsonb) || jsonb_build_object(
        'session_backfilled', true,
        'backfill_time_diff_seconds', tsm.time_diff_seconds,
        'backfill_date', NOW()
    )
FROM task_session_matches tsm
WHERE t.id = tsm.task_id
  AND tsm.match_rank = 1
  AND tsm.time_diff_seconds < 3600;  -- Only link if within 1 hour

-- Step 6: Add helpful comment
COMMENT ON COLUMN tasks.session_id IS
'Reference to the development session during which this task was created. Links to sessions.id. NULL indicates task created before session tracking or outside active session. Used for session analytics and productivity metrics.';

-- Step 7: Verify migration results
WITH stats AS (
    SELECT
        COUNT(*) as total_tasks,
        COUNT(session_id) as linked_tasks,
        COUNT(*) FILTER (WHERE session_id IS NULL) as orphaned_tasks,
        COUNT(*) FILTER (WHERE metadata->>'session_backfilled' = 'true') as backfilled_tasks
    FROM tasks
)
SELECT
    total_tasks,
    linked_tasks,
    orphaned_tasks,
    backfilled_tasks,
    ROUND(linked_tasks::numeric / total_tasks * 100, 1) as link_percentage
FROM stats;

-- Step 8: Show session task counts
SELECT
    s.display_id,
    s.title,
    s.started_at,
    COUNT(t.id) as tasks_count,
    COUNT(t.id) FILTER (WHERE t.status = 'completed') as completed_count
FROM sessions s
LEFT JOIN tasks t ON t.session_id = s.id
GROUP BY s.id, s.display_id, s.title, s.started_at
HAVING COUNT(t.id) > 0
ORDER BY s.started_at DESC
LIMIT 10;

COMMIT;

-- Rollback plan (if needed):
-- DROP INDEX IF EXISTS idx_tasks_session_status;
-- DROP INDEX IF EXISTS idx_tasks_session_project;
-- DROP INDEX IF EXISTS idx_tasks_session_id;
-- ALTER TABLE tasks DROP COLUMN IF EXISTS session_id;
```

---

## 8. TYPESCRIPT INTERFACE UPDATES

### Update Task Interface
```typescript
// File: /home/ridgetop/aidis/mcp-server/src/handlers/tasks.ts

export interface Task {
    id: string;
    projectId: string;
    sessionId?: string;  // NEW: Link to session during task creation
    title: string;
    description?: string;
    type: string;
    status: 'todo' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    dependencies: string[];
    tags: string[];
    metadata: Record<string, any>;
    assignedTo?: string;
    createdBy?: string;
    progress: number;
    startedAt?: Date;
    completedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}
```

### Update Task Creation Method
```typescript
// File: /home/ridgetop/aidis/mcp-server/src/handlers/tasks.ts
// Method: createTask (lines 27-60)

async createTask(
    projectId: string,
    title: string,
    description?: string,
    type: string = 'general',
    priority: Task['priority'] = 'medium',
    assignedTo?: string,
    createdBy?: string,
    tags: string[] = [],
    dependencies: string[] = [],
    metadata: Record<string, any> = {}
): Promise<Task> {
    const client = await this.pool.connect();
    try {
        // TS005-1: Get active session before insert
        const { SessionTracker } = await import('../services/sessionTracker.js');
        const sessionId = await SessionTracker.getActiveSession();

        // TS005-1: Include session_id in INSERT
        const result = await client.query(
            `INSERT INTO tasks
             (project_id, session_id, title, description, type, priority, assigned_to, created_by, tags, dependencies, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING *`,
            [projectId, sessionId, title, description, type, priority, assignedTo, createdBy, tags, dependencies, metadata]
        );

        // TS004-1: Update session activity after task creation
        if (sessionId) {
            await SessionTracker.updateSessionActivity(sessionId);
        }

        return this.mapTask(result.rows[0]);
    } finally {
        client.release();
    }
}
```

### Update Task Mapping Function
```typescript
// File: /home/ridgetop/aidis/mcp-server/src/handlers/tasks.ts
// Method: mapTask (line 465)

private mapTask(row: any): Task {
    return {
        id: row.id,
        projectId: row.project_id,
        sessionId: row.session_id,  // TS005-1: Add session_id mapping
        title: row.title,
        description: row.description,
        type: row.type,
        status: row.status,
        priority: row.priority,
        dependencies: row.dependencies || [],
        tags: row.tags || [],
        metadata: row.metadata || {},
        assignedTo: row.assigned_to,
        createdBy: row.created_by,
        progress: row.progress || 0,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}
```

### Add Session Interface with Display ID
```typescript
// File: /home/ridgetop/aidis/mcp-server/src/services/sessionTracker.ts
// Update SessionData interface (lines 21-36)

export interface SessionData {
  session_id: string;
  display_id: string;  // TS005-1: Add human-readable display ID
  start_time: Date;
  end_time?: Date;
  duration_ms?: number;
  project_id?: string;
  title?: string;
  description?: string;
  contexts_created: number;
  decisions_created: number;
  tasks_created: number;  // TS005-1: Add task count
  operations_count: number;
  productivity_score: number;
  success_status: 'active' | 'completed' | 'abandoned';
  status: 'active' | 'inactive' | 'disconnected';
  last_activity_at?: Date;
}
```

---

## 9. RISK ASSESSMENT

### 9.1 Database Migration Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Sequence race condition during concurrent inserts | Medium | Low | Use Postgres function (atomic) |
| Display ID collision after year rollover | High | Low | Sequence reset verification in migration |
| Backfill matches wrong session to task | Low | Medium | Conservative time window (1 hour), mark as backfilled |
| Display ID format change needed later | Medium | Low | Use flexible VARCHAR(13), easy to regenerate |
| Task session_id backfill misses many tasks | Low | High | Expected - many old tasks pre-date sessions |

### 9.2 Performance Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Session details query joins too slow | Medium | Compound indexes on session_id, query optimization |
| Display ID search performance | Low | varchar_pattern_ops index for LIKE queries |
| Backfill UPDATE locks tasks table | Medium | Run during low-traffic window, batched updates |

### 9.3 Code Integration Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Task creation fails if no active session | Low | session_id is nullable, task creation continues |
| Display ID not surfaced to frontend | Medium | Update all session response objects |
| TypeScript interface out of sync with DB | High | Update interfaces in same commit as migration |

---

## 10. TESTING STRATEGY

### 10.1 Database Testing
```sql
-- Test 1: Display ID generation
INSERT INTO sessions (project_id, agent_type)
VALUES ('5d335666-ca85-4d54-8f8c-c7e817a8b08e', 'test-agent')
RETURNING id, display_id;
-- Expected: display_id = 'SES-2025-0062' (next in sequence)

-- Test 2: Task with session_id
-- (After TypeScript update)
-- Call task_create tool, verify session_id populated

-- Test 3: Session details query
SELECT
    s.display_id,
    s.title,
    (SELECT COUNT(*) FROM tasks WHERE session_id = s.id) as task_count
FROM sessions s
WHERE s.display_id = 'SES-2025-0001';

-- Test 4: Year rollover (manual verification in 2026)
-- Verify sequence resets to 0001 for new year
```

### 10.2 Integration Testing
```typescript
// Test 1: Task creation links to active session
const sessionId = await SessionTracker.startSession(projectId);
const task = await tasksHandler.createTask(projectId, 'Test Task');
assert(task.sessionId === sessionId);

// Test 2: Display ID appears in session responses
const sessionData = await SessionTracker.getSessionData(sessionId);
assert(sessionData.display_id.startsWith('SES-2025-'));

// Test 3: Task listing includes session_id
const tasks = await tasksHandler.listTasks(projectId);
assert(tasks[0].sessionId !== undefined);
```

### 10.3 User Acceptance Testing
- [ ] Create new session, verify display_id visible in UI
- [ ] Create task, verify it links to current session
- [ ] Search sessions by display_id pattern
- [ ] View session details, verify task count and list
- [ ] Verify contexts count still works (existing feature)
- [ ] Test with multiple sessions in same day

---

## 11. IMPLEMENTATION RECOMMENDATIONS

### Priority: HIGH (Blocks Session Analytics)

**Recommended Approach**: Phased implementation

1. **Week 1**: Sessions Display ID (Migration 026)
   - Low risk, high value
   - No code dependencies
   - Enables user-friendly session identification
   - Test thoroughly before Phase 2

2. **Week 2**: Tasks-Session Linking (Migration 027 + TypeScript updates)
   - Depends on Phase 1
   - Update Task interface and createTask method
   - Test task creation in active session
   - Verify backfill results

3. **Week 3**: Analytics & Frontend
   - Add session task analytics methods
   - Update session details API/tool
   - Surface display_id in all UIs
   - Test end-to-end workflows

### Alternative: All-at-once Implementation
- Higher risk but faster delivery
- Requires careful testing of both migrations
- Single deployment window

### Recommendation: **Phased approach** for safety

---

## 12. APPENDIX: CODE LOCATIONS

### Files to Modify

1. **Database Migrations**:
   - Create: `/home/ridgetop/aidis/mcp-server/database/migrations/026_add_session_display_id.sql`
   - Create: `/home/ridgetop/aidis/mcp-server/database/migrations/027_add_tasks_session_id.sql`

2. **TypeScript Handlers**:
   - Modify: `/home/ridgetop/aidis/mcp-server/src/handlers/tasks.ts` (lines 4-22, 27-60, 465-485)
   - Modify: `/home/ridgetop/aidis/mcp-server/src/services/sessionTracker.ts` (lines 21-36, 377-476)

3. **MCP Server**:
   - Modify: `/home/ridgetop/aidis/mcp-server/src/server.ts` (handleTaskCreate method, lines 5211-5241)

4. **Session Handlers** (if exists):
   - Modify any session listing/details endpoints to include display_id
   - Update session analytics to count tasks per session

### Existing Patterns to Reference

- **session_id FK pattern**: `/home/ridgetop/aidis/mcp-server/database/migrations/002_create_contexts_and_sessions.sql` (lines 30-32)
- **agent_display_name pattern**: `/home/ridgetop/aidis/mcp-server/database/migrations/018_add_agent_display_name.sql` (reference for display naming)
- **Session tracking**: `/home/ridgetop/aidis/mcp-server/src/services/sessionTracker.ts` (lines 49-54, 298-311)

---

## 13. CONCLUSION

**Investigation Status**: ✅ **Complete**

**Key Deliverables**:
1. ✅ Complete database schema analysis
2. ✅ Display ID format specification (SES-YYYY-NNNN)
3. ✅ PostgreSQL sequence-based generation function
4. ✅ Migration scripts for both display_id and session_id
5. ✅ TypeScript interface updates with exact line numbers
6. ✅ Backfill strategies for 61 sessions and 396 tasks
7. ✅ Analytics query patterns for session details
8. ✅ Index requirements for optimal performance
9. ✅ Risk assessment and testing strategy
10. ✅ Phased implementation plan

**Ready for Implementation**: YES

**Next Steps**:
1. Review this investigation report with partner
2. Confirm display ID format (SES-YYYY-NNNN)
3. Create implementation subagent with specific requirements
4. Execute Phase 1 (Display ID) first
5. Test and validate before Phase 2 (Task linking)

---

**Report Generated**: 2025-09-30
**Total Investigation Time**: Comprehensive analysis complete
**Files Analyzed**: 15+ migration files, 5 TypeScript handlers, production database schema
**Database Queries**: 10+ schema and data analysis queries executed
**Implementation Risk**: LOW (following established patterns, phased approach)