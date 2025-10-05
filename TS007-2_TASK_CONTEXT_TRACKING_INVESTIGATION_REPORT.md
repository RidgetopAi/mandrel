# TS007-2 Task + Context Activity Tracking - Investigation Report

**Investigation Date:** 2025-09-30
**Investigator:** Claude Code Agent
**Objective:** Trace implementation path for tracking task AND context creation/updates per session

---

## Executive Summary

This investigation analyzed the AIDIS codebase to determine how to implement comprehensive session activity tracking, including:
- **Tasks:** tasks_created, tasks_updated, tasks_completed
- **Contexts:** contexts_created

The current architecture already tracks contexts and decisions via SQL JOINs in `getSessionStatus()`, but there's no persistent counter columns or task activity tracking. This ticket will add database columns and real-time tracking hooks.

---

## Current Architecture

### 1. Sessions Table Structure

**Current Columns (relevant to this ticket):**
```sql
-- Token tracking (TS006-2 - already implemented)
input_tokens          BIGINT DEFAULT 0 NOT NULL
output_tokens         BIGINT DEFAULT 0 NOT NULL
total_tokens          BIGINT DEFAULT 0 NOT NULL

-- Activity tracking (TS004-1 - already implemented)
status                VARCHAR(20) DEFAULT 'active'
last_activity_at      TIMESTAMP WITH TIME ZONE

-- Session metadata
metadata              JSONB DEFAULT '{}'::jsonb
```

**Missing Columns (to be added in TS007-2):**
- `tasks_created` - Count of tasks created in this session
- `tasks_updated` - Count of task updates in this session
- `tasks_completed` - Count of tasks marked as completed in this session
- `contexts_created` - Count of contexts stored in this session

### 2. Task Handler Operations

**File:** `/home/ridgetop/aidis/mcp-server/src/handlers/tasks.ts`

**Task Creation Flow:**
- **Lines 28-72:** `createTask()` method
  - Line 52-53: Already imports SessionTracker and gets active session
  - Line 55-61: Inserts task with `session_id` (TS005-1)
  - Lines 64-66: Calls `SessionTracker.updateSessionActivity(sessionId)` (TS004-1)
  - **TS007-2 Hook Point:** Add `recordTaskCreated()` call after line 66

**Task Update Flow:**
- **Lines 150-183:** `updateTaskStatus()` method
  - Lines 153-172: Updates task status, handles timestamps
  - Line 157: Detects `status === 'in_progress'`
  - Line 158: Detects `status === 'completed'`
  - Lines 174-179: Calls `SessionTracker.updateSessionActivity(sessionId)`
  - **TS007-2 Hook Points:**
    - Add `recordTaskUpdated()` call after line 179
    - Add `recordTaskCompleted()` call if status === 'completed'

**Bulk Update Flow:**
- **Lines 191-317:** `bulkUpdateTasks()` method
  - Line 298: Executes bulk UPDATE query
  - **Note:** No session activity tracking currently
  - **TS007-2 Hook Point:** Add tracking after line 301 (after COMMIT)

### 3. Context Handler Operations

**File:** `/home/ridgetop/aidis/mcp-server/src/handlers/context.ts`

**Context Storage Flow:**
- **Lines 86-200:** `storeContext()` method
  - Lines 100-101: Gets/creates project and session IDs
  - Line 159: Executes INSERT query
  - Lines 162-165: Calls `SessionTracker.updateSessionActivity(sessionId)` (TS004-1)
  - **TS007-2 Hook Point:** Add `recordContextCreated()` call after line 165

### 4. SessionTracker Service

**File:** `/home/ridgetop/aidis/mcp-server/src/services/sessionTracker.ts`

**Current Token Tracking Pattern (TS006-2):**
```typescript
// Lines 374-393: Token tracking implementation
static recordTokenUsage(sessionId: string, inputTokens: number, outputTokens: number): void {
  // In-memory tracking
  let tokens = this.sessionTokens.get(sessionId);
  // ... increment logic
}

static getTokenUsage(sessionId: string): { input: number; output: number; total: number } {
  return this.sessionTokens.get(sessionId) || { input: 0, output: 0, total: 0 };
}
```

**Similar Pattern Needed for Activity Tracking:**
- New in-memory Map for activity counters
- Methods: `recordTaskCreated()`, `recordTaskUpdated()`, `recordTaskCompleted()`, `recordContextCreated()`
- Flush to database on `endSession()` (line 168-201)

### 5. Session Status Display

**File:** `/home/ridgetop/aidis/mcp-server/src/handlers/sessionAnalytics.ts`

**Current Implementation (lines 649-700):**
```typescript
static async getSessionStatus() {
  const result = await db.query(`
    SELECT
      s.id, s.agent_type, s.started_at, s.ended_at, s.project_id,
      p.name as project_name,
      s.metadata,
      s.input_tokens, s.output_tokens, s.total_tokens,
      COALESCE((SELECT COUNT(*) FROM contexts c WHERE c.session_id = s.id), 0) as contexts_count,
      COALESCE((SELECT COUNT(*) FROM technical_decisions td WHERE td.session_id = s.id), 0) as decisions_count
    FROM sessions s
    LEFT JOIN projects p ON s.project_id = p.id
    WHERE s.id = $1
  `, [activeSessionId]);
}
```

**Display Format (lines 6622-6632 in server.ts):**
```typescript
const statusText =
  `📝 Contexts: ${session.contexts_created}\n` +
  `🎯 Decisions: ${session.decisions_created}\n` +
  `🪙 Tokens: ${session.total_tokens?.toLocaleString() || 0} (↓${session.input_tokens} ↑${session.output_tokens})\n`;
```

**TS007-2 Changes:**
- Add `tasks_created`, `tasks_updated`, `tasks_completed`, `contexts_created` to SELECT
- Replace JOINs with direct column reads (faster, real-time accurate)
- Update display format to include task metrics

### 6. Frontend Display

**File:** `/home/ridgetop/aidis/aidis-command/frontend/src/pages/Sessions.tsx`

**Current Activity Column (lines 206-214):**
```tsx
{
  title: 'Activity',
  key: 'activity',
  render: (record: SessionItem) => (
    <Space>
      <Badge count={record.context_count || 0} color="blue" />
      <Text type="secondary">contexts</Text>
    </Space>
  ),
}
```

**TS007-2 Enhancement:**
- Add task activity badges
- Use Tooltip to show breakdown
- Format: "5 tasks (3 completed) · 12 contexts"

---

## Implementation Path

### Step 1: Database Migration 024

**File:** `/home/ridgetop/aidis/mcp-server/database/migrations/024_add_session_activity_tracking.sql`

```sql
-- Migration 024: Add Session Activity Tracking
-- TS007-2: Task + Context Activity Tracking
-- Created: 2025-09-30
-- Purpose: Add activity counter columns to sessions table

BEGIN;

-- Add activity tracking columns
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS tasks_created INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS tasks_updated INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS tasks_completed INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS contexts_created INTEGER DEFAULT 0 NOT NULL;

-- Backfill existing data from actual counts
UPDATE sessions s
SET
  tasks_created = COALESCE((
    SELECT COUNT(*) FROM tasks t
    WHERE t.session_id = s.id
  ), 0),
  tasks_completed = COALESCE((
    SELECT COUNT(*) FROM tasks t
    WHERE t.session_id = s.id AND t.status = 'completed'
  ), 0),
  contexts_created = COALESCE((
    SELECT COUNT(*) FROM contexts c
    WHERE c.session_id = s.id
  ), 0);

-- Add indexes for performance on activity queries
CREATE INDEX IF NOT EXISTS idx_sessions_tasks_created ON sessions(tasks_created) WHERE tasks_created > 0;
CREATE INDEX IF NOT EXISTS idx_sessions_contexts_created ON sessions(contexts_created) WHERE contexts_created > 0;

-- Add comments for documentation
COMMENT ON COLUMN sessions.tasks_created IS 'Number of tasks created during this session';
COMMENT ON COLUMN sessions.tasks_updated IS 'Number of task updates during this session';
COMMENT ON COLUMN sessions.tasks_completed IS 'Number of tasks completed during this session';
COMMENT ON COLUMN sessions.contexts_created IS 'Number of contexts stored during this session';

-- Verify the migration
DO $$
DECLARE
  col_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_name = 'sessions'
    AND column_name IN ('tasks_created', 'tasks_updated', 'tasks_completed', 'contexts_created');

  IF col_count = 4 THEN
    RAISE NOTICE 'Migration 024 completed successfully: All activity tracking columns added';
  ELSE
    RAISE EXCEPTION 'Migration 024 failed: Expected 4 columns, found %', col_count;
  END IF;
END $$;

COMMIT;
```

**Note:** Migration numbers may need adjustment based on existing migrations. Check for conflicts with:
- `024_implement_dual_write_validation.sql` (already exists)

Recommend renaming to: `026_add_session_activity_tracking.sql`

### Step 2: SessionTracker Service Methods

**File:** `/home/ridgetop/aidis/mcp-server/src/services/sessionTracker.ts`

**Add After Line 55 (after sessionTokens Map):**
```typescript
// TS007-2: In-memory activity tracking for active sessions
private static sessionActivity: Map<string, {
  tasksCreated: number;
  tasksUpdated: number;
  tasksCompleted: number;
  contextsCreated: number;
}> = new Map();
```

**Add After Line 401 (after getTokenUsage method):**
```typescript
/**
 * Record task creation for a session
 * TS007-2: Track task activity per session
 */
static recordTaskCreated(sessionId: string): void {
  try {
    let activity = this.sessionActivity.get(sessionId);
    if (!activity) {
      activity = { tasksCreated: 0, tasksUpdated: 0, tasksCompleted: 0, contextsCreated: 0 };
      this.sessionActivity.set(sessionId, activity);
    }
    activity.tasksCreated++;
    console.log(`📋 Session ${sessionId.substring(0, 8)}... tasks created: ${activity.tasksCreated}`);
  } catch (error) {
    console.error('❌ Failed to record task creation:', error);
  }
}

/**
 * Record task update for a session
 * TS007-2: Track task activity per session
 */
static recordTaskUpdated(sessionId: string, isCompletion: boolean = false): void {
  try {
    let activity = this.sessionActivity.get(sessionId);
    if (!activity) {
      activity = { tasksCreated: 0, tasksUpdated: 0, tasksCompleted: 0, contextsCreated: 0 };
      this.sessionActivity.set(sessionId, activity);
    }
    activity.tasksUpdated++;
    if (isCompletion) {
      activity.tasksCompleted++;
      console.log(`✅ Session ${sessionId.substring(0, 8)}... tasks completed: ${activity.tasksCompleted}`);
    }
    console.log(`📝 Session ${sessionId.substring(0, 8)}... tasks updated: ${activity.tasksUpdated}`);
  } catch (error) {
    console.error('❌ Failed to record task update:', error);
  }
}

/**
 * Record context creation for a session
 * TS007-2: Track context activity per session
 */
static recordContextCreated(sessionId: string): void {
  try {
    let activity = this.sessionActivity.get(sessionId);
    if (!activity) {
      activity = { tasksCreated: 0, tasksUpdated: 0, tasksCompleted: 0, contextsCreated: 0 };
      this.sessionActivity.set(sessionId, activity);
    }
    activity.contextsCreated++;
    console.log(`💾 Session ${sessionId.substring(0, 8)}... contexts created: ${activity.contextsCreated}`);
  } catch (error) {
    console.error('❌ Failed to record context creation:', error);
  }
}

/**
 * Get current activity counts for a session
 * TS007-2: Retrieve in-memory activity counters
 */
static getActivityCounts(sessionId: string): {
  tasksCreated: number;
  tasksUpdated: number;
  tasksCompleted: number;
  contextsCreated: number;
} {
  return this.sessionActivity.get(sessionId) || {
    tasksCreated: 0,
    tasksUpdated: 0,
    tasksCompleted: 0,
    contextsCreated: 0
  };
}
```

**Update endSession() method (line 168, inside try block after line 166):**
```typescript
// TS007-2: Get activity counts from memory
const activityCounts = this.getActivityCounts(sessionId);

// Update the sessions table with end time and stats
const updateSessionSql = `
  UPDATE sessions
  SET ended_at = $1,
      tokens_used = $2,
      input_tokens = $3,
      output_tokens = $4,
      total_tokens = $5,
      tasks_created = $6,
      tasks_updated = $7,
      tasks_completed = $8,
      contexts_created = $9,
      context_summary = $10,
      metadata = metadata || $11::jsonb
  WHERE id = $12
`;

const sessionUpdateParams = [
  endTime,
  tokenUsage.total,
  tokenUsage.input,
  tokenUsage.output,
  tokenUsage.total,
  activityCounts.tasksCreated,        // NEW
  activityCounts.tasksUpdated,        // NEW
  activityCounts.tasksCompleted,      // NEW
  activityCounts.contextsCreated,     // NEW
  `Session completed with ${activityCounts.contextsCreated} contexts created, ${activityCounts.tasksCreated} tasks created`,
  JSON.stringify({
    end_time: endTime.toISOString(),
    duration_ms: durationMs,
    contexts_created: activityCounts.contextsCreated,
    tasks_created: activityCounts.tasksCreated,
    tasks_updated: activityCounts.tasksUpdated,
    tasks_completed: activityCounts.tasksCompleted,
    operations_count: sessionData.operations_count,
    productivity_score: sessionData.productivity_score,
    input_tokens: tokenUsage.input,
    output_tokens: tokenUsage.output,
    total_tokens: tokenUsage.total,
    completed_by: 'aidis-session-tracker'
  }),
  sessionId
];
```

**Update endSession() cleanup (after line 235):**
```typescript
// TS007-2: Clean up in-memory activity tracking
this.sessionActivity.delete(sessionId);
```

**Update SessionData interface (line 21-39):**
```typescript
export interface SessionData {
  session_id: string;
  start_time: Date;
  end_time?: Date;
  duration_ms?: number;
  project_id?: string;
  title?: string;
  description?: string;
  contexts_created: number;
  decisions_created: number;
  tasks_created: number;         // NEW
  tasks_updated: number;         // NEW
  tasks_completed: number;       // NEW
  operations_count: number;
  productivity_score: number;
  success_status: 'active' | 'completed' | 'abandoned';
  status: 'active' | 'inactive' | 'disconnected';
  last_activity_at?: Date;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}
```

### Step 3: Task Handler Integration

**File:** `/home/ridgetop/aidis/mcp-server/src/handlers/tasks.ts`

**Update createTask() method (after line 66):**
```typescript
// TS004-1: Update session activity after task creation
if (sessionId) {
  await SessionTracker.updateSessionActivity(sessionId);
  // TS007-2: Record task creation
  SessionTracker.recordTaskCreated(sessionId);
}
```

**Update updateTaskStatus() method (after line 179):**
```typescript
// TS004-1: Update session activity after task update
const { SessionTracker } = await import('../services/sessionTracker.js');
const sessionId = await SessionTracker.getActiveSession();
if (sessionId) {
  await SessionTracker.updateSessionActivity(sessionId);
  // TS007-2: Record task update (and completion if applicable)
  SessionTracker.recordTaskUpdated(sessionId, status === 'completed');
}
```

**Update bulkUpdateTasks() method (after line 301, before finally block):**
```typescript
await client.query('COMMIT');

// TS007-2: Record bulk task updates
const { SessionTracker } = await import('../services/sessionTracker.js');
const sessionId = await SessionTracker.getActiveSession();
if (sessionId && updatedTaskIds.length > 0) {
  // Record one update per task
  for (let i = 0; i < updatedTaskIds.length; i++) {
    SessionTracker.recordTaskUpdated(sessionId, updates.status === 'completed');
  }
  await SessionTracker.updateSessionActivity(sessionId);
}

return {
  totalRequested: taskIds.length,
  // ... rest of return
```

### Step 4: Context Handler Integration

**File:** `/home/ridgetop/aidis/mcp-server/src/handlers/context.ts`

**Update storeContext() method (after line 165):**
```typescript
// TS004-1: Update session activity after context storage
if (sessionId) {
  const { SessionTracker } = await import('../services/sessionTracker.js');
  await SessionTracker.updateSessionActivity(sessionId);
  // TS007-2: Record context creation
  SessionTracker.recordContextCreated(sessionId);
}
```

### Step 5: Session Status Display

**File:** `/home/ridgetop/aidis/mcp-server/src/handlers/sessionAnalytics.ts`

**Update getSessionStatus() query (lines 650-667):**
```typescript
const result = await db.query(`
  SELECT
    s.id,
    s.agent_type,
    s.started_at,
    s.ended_at,
    s.project_id,
    p.name as project_name,
    s.metadata,
    s.input_tokens,
    s.output_tokens,
    s.total_tokens,
    s.tasks_created,
    s.tasks_updated,
    s.tasks_completed,
    s.contexts_created,
    COALESCE((SELECT COUNT(*) FROM technical_decisions td WHERE td.session_id = s.id), 0) as decisions_count
  FROM sessions s
  LEFT JOIN projects p ON s.project_id = p.id
  WHERE s.id = $1
`, [activeSessionId]);
```

**Note:** Remove the contexts_count subquery since we now have the column directly.

**Update return statement (after line 682):**
```typescript
// TS007-2: Get in-memory activity counts if session is active
const activityCounts = SessionTracker.getActivityCounts(activeSessionId);

return {
  success: true,
  session: {
    id: session.id,
    type: session.agent_type,
    started_at: session.started_at,
    project_name: session.project_name || 'No project assigned',
    duration_minutes: Math.round(duration / 60000),
    tasks_created: activityCounts.tasksCreated || parseInt(session.tasks_created) || 0,
    tasks_updated: activityCounts.tasksUpdated || parseInt(session.tasks_updated) || 0,
    tasks_completed: activityCounts.tasksCompleted || parseInt(session.tasks_completed) || 0,
    contexts_created: activityCounts.contextsCreated || parseInt(session.contexts_created) || 0,
    decisions_created: parseInt(session.decisions_count) || 0,
    input_tokens: tokenUsage.input || parseInt(session.input_tokens) || 0,
    output_tokens: tokenUsage.output || parseInt(session.output_tokens) || 0,
    total_tokens: tokenUsage.total || parseInt(session.total_tokens) || 0,
    metadata: session.metadata || {}
  },
  message: `Current session: ${session.id.substring(0, 8)}...`
};
```

**Update display format in server.ts (line 6622-6632):**
```typescript
const statusText = `📋 Current Session Status\n\n` +
  `🆔 Session ID: ${session.id.substring(0, 8)}...\n` +
  `🏷️  Type: ${session.type}\n` +
  `🏢 Project: ${session.project_name}\n` +
  `⏰ Started: ${new Date(session.started_at).toLocaleString()}\n` +
  `⏱️  Duration: ${session.duration_minutes} minutes\n` +
  `\n📊 Activity:\n` +
  `  📝 Contexts: ${session.contexts_created}\n` +
  `  📋 Tasks: ${session.tasks_created} created, ${session.tasks_updated} updated, ${session.tasks_completed} completed\n` +
  `  🎯 Decisions: ${session.decisions_created}\n` +
  `\n💰 Token Usage:\n` +
  `  🪙 Total: ${session.total_tokens?.toLocaleString() || 0}\n` +
  `  ↓ Input: ${session.input_tokens?.toLocaleString() || 0}\n` +
  `  ↑ Output: ${session.output_tokens?.toLocaleString() || 0}\n` +
  (session.metadata.title ? `\n📌 Title: "${session.metadata.title}"\n` : '') +
  (session.metadata.assigned_manually ? `🔧 Manually assigned at: ${new Date(session.metadata.assigned_at).toLocaleString()}\n` : '');
```

### Step 6: Frontend Display

**File:** `/home/ridgetop/aidis/aidis-command/frontend/src/pages/Sessions.tsx`

**Update Activity column (replace lines 206-214):**
```tsx
{
  title: 'Activity',
  key: 'activity',
  render: (record: SessionItem) => (
    <Space direction="vertical" size="small">
      <Space>
        <Tooltip title={`${record.tasks_created || 0} created · ${record.tasks_updated || 0} updated · ${record.tasks_completed || 0} completed`}>
          <Badge count={record.tasks_created || 0} color="purple" />
          <Text type="secondary">tasks</Text>
        </Tooltip>
      </Space>
      <Space>
        <Badge count={record.contexts_created || 0} color="blue" />
        <Text type="secondary">contexts</Text>
      </Space>
    </Space>
  ),
  sorter: (a: SessionItem, b: SessionItem) =>
    ((a.tasks_created || 0) + (a.contexts_created || 0)) -
    ((b.tasks_created || 0) + (b.contexts_created || 0)),
}
```

**Update SessionItem type definition:**
```typescript
interface SessionItem extends Session {
  tasks_created?: number;
  tasks_updated?: number;
  tasks_completed?: number;
  contexts_created?: number;
}
```

### Step 7: Testing Approach

**Test File:** `/home/ridgetop/aidis/test-ts007-2-activity-tracking.ts`

```typescript
/**
 * TS007-2: Task + Context Activity Tracking Tests
 *
 * Validates:
 * 1. Task creation increments counter
 * 2. Task updates increment counter
 * 3. Task completions increment both update and completion counters
 * 4. Context storage increments counter
 * 5. Session status displays all activity metrics
 * 6. Database columns persist correctly on session end
 */

import { db } from './mcp-server/src/config/database.js';
import { SessionTracker } from './mcp-server/src/services/sessionTracker.js';
import { tasksHandler } from './mcp-server/src/handlers/tasks.js';
import { contextHandler } from './mcp-server/src/handlers/context.js';

async function testActivityTracking() {
  console.log('🧪 TS007-2: Testing Session Activity Tracking\n');

  try {
    // Setup: Create a test project
    const projectResult = await db.query(`
      INSERT INTO projects (name, description)
      VALUES ('TS007-2 Test Project', 'Testing activity tracking')
      RETURNING id
    `);
    const projectId = projectResult.rows[0].id;

    // Test 1: Start session
    console.log('📝 Test 1: Start session');
    const sessionId = await SessionTracker.startSession(projectId, 'Activity Tracking Test');
    console.log(`✅ Session started: ${sessionId.substring(0, 8)}...\n`);

    // Test 2: Create tasks
    console.log('📝 Test 2: Create 3 tasks');
    await tasksHandler.createTask(projectId, 'Task 1', 'First task');
    await tasksHandler.createTask(projectId, 'Task 2', 'Second task');
    await tasksHandler.createTask(projectId, 'Task 3', 'Third task');

    const counts1 = SessionTracker.getActivityCounts(sessionId);
    console.log(`✅ Tasks created: ${counts1.tasksCreated} (expected: 3)\n`);
    if (counts1.tasksCreated !== 3) {
      throw new Error(`Expected 3 tasks created, got ${counts1.tasksCreated}`);
    }

    // Test 3: Update tasks
    console.log('📝 Test 3: Update 2 tasks');
    const tasks = await tasksHandler.listTasks(projectId);
    await tasksHandler.updateTaskStatus(tasks[0].id, 'in_progress');
    await tasksHandler.updateTaskStatus(tasks[1].id, 'in_progress');

    const counts2 = SessionTracker.getActivityCounts(sessionId);
    console.log(`✅ Tasks updated: ${counts2.tasksUpdated} (expected: 2)\n`);
    if (counts2.tasksUpdated !== 2) {
      throw new Error(`Expected 2 tasks updated, got ${counts2.tasksUpdated}`);
    }

    // Test 4: Complete a task
    console.log('📝 Test 4: Complete 1 task');
    await tasksHandler.updateTaskStatus(tasks[0].id, 'completed');

    const counts3 = SessionTracker.getActivityCounts(sessionId);
    console.log(`✅ Tasks updated: ${counts3.tasksUpdated} (expected: 3)`);
    console.log(`✅ Tasks completed: ${counts3.tasksCompleted} (expected: 1)\n`);
    if (counts3.tasksCompleted !== 1) {
      throw new Error(`Expected 1 task completed, got ${counts3.tasksCompleted}`);
    }

    // Test 5: Store contexts
    console.log('📝 Test 5: Store 4 contexts');
    await contextHandler.storeContext({
      projectId,
      sessionId,
      type: 'code',
      content: 'Context 1: Test code snippet',
      tags: ['test']
    });
    await contextHandler.storeContext({
      projectId,
      sessionId,
      type: 'decision',
      content: 'Context 2: Test decision',
      tags: ['test']
    });
    await contextHandler.storeContext({
      projectId,
      sessionId,
      type: 'planning',
      content: 'Context 3: Test plan',
      tags: ['test']
    });
    await contextHandler.storeContext({
      projectId,
      sessionId,
      type: 'completion',
      content: 'Context 4: Test completion',
      tags: ['test']
    });

    const counts4 = SessionTracker.getActivityCounts(sessionId);
    console.log(`✅ Contexts created: ${counts4.contextsCreated} (expected: 4)\n`);
    if (counts4.contextsCreated !== 4) {
      throw new Error(`Expected 4 contexts created, got ${counts4.contextsCreated}`);
    }

    // Test 6: Check session status before end
    console.log('📝 Test 6: Get session status (in-memory counts)');
    const SessionManagementHandler = (await import('./mcp-server/src/handlers/sessionAnalytics.js')).SessionManagementHandler;
    const status1 = await SessionManagementHandler.getSessionStatus();
    console.log(`✅ Session status retrieved:`);
    console.log(`   Tasks: ${status1.session.tasks_created} created, ${status1.session.tasks_updated} updated, ${status1.session.tasks_completed} completed`);
    console.log(`   Contexts: ${status1.session.contexts_created}\n`);

    // Test 7: End session (persist to database)
    console.log('📝 Test 7: End session and persist counts');
    await SessionTracker.endSession(sessionId);
    console.log(`✅ Session ended\n`);

    // Test 8: Verify database persistence
    console.log('📝 Test 8: Verify database persistence');
    const dbResult = await db.query(`
      SELECT
        tasks_created, tasks_updated, tasks_completed, contexts_created
      FROM sessions
      WHERE id = $1
    `, [sessionId]);

    const dbCounts = dbResult.rows[0];
    console.log(`✅ Database counts:`);
    console.log(`   Tasks created: ${dbCounts.tasks_created} (expected: 3)`);
    console.log(`   Tasks updated: ${dbCounts.tasks_updated} (expected: 3)`);
    console.log(`   Tasks completed: ${dbCounts.tasks_completed} (expected: 1)`);
    console.log(`   Contexts created: ${dbCounts.contexts_created} (expected: 4)\n`);

    // Validate
    if (dbCounts.tasks_created !== 3) throw new Error('Database tasks_created mismatch');
    if (dbCounts.tasks_updated !== 3) throw new Error('Database tasks_updated mismatch');
    if (dbCounts.tasks_completed !== 1) throw new Error('Database tasks_completed mismatch');
    if (dbCounts.contexts_created !== 4) throw new Error('Database contexts_created mismatch');

    // Cleanup
    console.log('🧹 Cleaning up test data...');
    await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    await db.query('DELETE FROM projects WHERE id = $1', [projectId]);

    console.log('\n✅ All tests passed!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  }
}

testActivityTracking().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
```

---

## File Locations (with line numbers)

### Files to Modify

1. **Database Migration**
   - **NEW FILE:** `/home/ridgetop/aidis/mcp-server/database/migrations/026_add_session_activity_tracking.sql`

2. **SessionTracker Service**
   - File: `/home/ridgetop/aidis/mcp-server/src/services/sessionTracker.ts`
   - Lines to modify:
     - **Line 55:** Add `sessionActivity` Map
     - **After Line 401:** Add `recordTaskCreated()`, `recordTaskUpdated()`, `recordContextCreated()`, `getActivityCounts()` methods
     - **Line 168-201:** Update `endSession()` to persist activity counts
     - **Line 235:** Update cleanup to delete activity map entry
     - **Line 21-39:** Update `SessionData` interface

3. **Task Handler**
   - File: `/home/ridgetop/aidis/mcp-server/src/handlers/tasks.ts`
   - Lines to modify:
     - **Line 66:** Add `recordTaskCreated()` call in `createTask()`
     - **Line 179:** Add `recordTaskUpdated()` call in `updateTaskStatus()`
     - **Line 301:** Add bulk update activity tracking in `bulkUpdateTasks()`

4. **Context Handler**
   - File: `/home/ridgetop/aidis/mcp-server/src/handlers/context.ts`
   - Lines to modify:
     - **Line 165:** Add `recordContextCreated()` call in `storeContext()`

5. **Session Analytics Handler**
   - File: `/home/ridgetop/aidis/mcp-server/src/handlers/sessionAnalytics.ts`
   - Lines to modify:
     - **Lines 650-667:** Update query to include activity columns
     - **Lines 684-700:** Update return statement with activity counts

6. **Server Status Display**
   - File: `/home/ridgetop/aidis/mcp-server/src/server.ts`
   - Lines to modify:
     - **Lines 6622-6632:** Update status text format to include task metrics

7. **Frontend Sessions Page**
   - File: `/home/ridgetop/aidis/aidis-command/frontend/src/pages/Sessions.tsx`
   - Lines to modify:
     - **Lines 206-214:** Update Activity column to show task and context badges
     - **Around line 36:** Update `SessionItem` interface

8. **Test File**
   - **NEW FILE:** `/home/ridgetop/aidis/test-ts007-2-activity-tracking.ts`

---

## Design Decisions Needed

### 1. Migration Number Conflict
**Issue:** Migration 024 already exists (`024_implement_dual_write_validation.sql`)

**Options:**
- A) Rename new migration to `026_add_session_activity_tracking.sql`
- B) Use timestamp-based naming: `2025093001_add_session_activity_tracking.sql`

**Recommendation:** Option A (use next available number: 026)

### 2. Backfill Strategy
**Issue:** Should we backfill activity counts for existing sessions?

**Current Implementation:** Yes, migration includes backfill from actual counts
- `tasks_created`: Count from tasks table where session_id matches
- `tasks_completed`: Count from tasks table where session_id matches AND status = 'completed'
- `contexts_created`: Count from contexts table where session_id matches
- `tasks_updated`: Cannot backfill accurately (no update history), leave as 0

**Recommendation:** Keep backfill for historical data accuracy

### 3. Bulk Operations Tracking
**Issue:** Should bulk task updates count as N individual updates or 1 bulk operation?

**Current Implementation:** Count as N individual updates (one per task)

**Recommendation:** Keep as N updates for accuracy (matches actual operation count)

### 4. Activity vs. Operations Count
**Issue:** Relationship to existing `operations_count` field?

**Current Implementation:** `operations_count` is from analytics_events table, tracks all operations
- New activity counts are session-specific and granular

**Recommendation:** Keep both - they serve different purposes
- `operations_count`: Total system operations
- `tasks_created` etc.: Specific activity types

### 5. Performance Impact
**Issue:** Will activity tracking slow down task/context operations?

**Analysis:**
- In-memory Map operations: O(1) complexity
- No additional database queries during operations
- Flush to database only on session end
- Similar pattern to token tracking (proven performant)

**Recommendation:** Minimal impact, no additional optimizations needed

---

## Recommended Implementation Order

1. **Phase 1: Database Foundation**
   - Create migration 026
   - Run migration to add columns
   - Verify backfill completed correctly

2. **Phase 2: SessionTracker Core**
   - Add `sessionActivity` Map
   - Implement tracking methods
   - Update `endSession()` to persist
   - Update `SessionData` interface

3. **Phase 3: Handler Integration**
   - Update `tasksHandler.createTask()`
   - Update `tasksHandler.updateTaskStatus()`
   - Update `tasksHandler.bulkUpdateTasks()`
   - Update `contextHandler.storeContext()`

4. **Phase 4: Display Updates**
   - Update `SessionManagementHandler.getSessionStatus()` query
   - Update session status return structure
   - Update server.ts display format

5. **Phase 5: Frontend Enhancement**
   - Update Sessions.tsx Activity column
   - Update SessionItem interface
   - Test frontend display

6. **Phase 6: Testing & Validation**
   - Create test script
   - Run comprehensive tests
   - Verify in-memory tracking
   - Verify database persistence
   - Test edge cases (session end, restart, etc.)

---

## Implementation Challenges & Solutions

### Challenge 1: Session ID Availability in Handlers

**Issue:** Task and context handlers need session ID to record activity

**Current State:**
- Task handler: Already gets session ID via `SessionTracker.getActiveSession()` (line 53)
- Context handler: Already gets session ID via `ensureSessionId()` (line 101)

**Solution:** ✅ Already resolved - both handlers have session ID access

### Challenge 2: Determining Task Completion vs Update

**Issue:** How to differentiate completion from general updates?

**Solution:** Check `status === 'completed'` parameter in `updateTaskStatus()`
- Line 158 already has this logic
- Pass `isCompletion` boolean to `recordTaskUpdated()`

### Challenge 3: In-Memory vs Database Sync

**Issue:** Risk of data loss if server crashes before `endSession()`

**Analysis:**
- Similar to token tracking (TS006-2) - accepted trade-off
- Can reconstruct from database counts if needed
- Session activity updates are "best effort" metrics

**Solution:** Accept risk, document in comments
- Not critical data (analytics only)
- Can rebuild from source tables if needed

### Challenge 4: Bulk Operation Edge Cases

**Issue:** Bulk updates with multiple tasks, some completing

**Solution:** Loop through results and check status change
- Count each task individually
- Detect completions based on final status

### Challenge 5: Testing Without Breaking Existing Sessions

**Issue:** How to test without affecting production data?

**Solution:**
- Create isolated test project
- Use dedicated test session
- Clean up test data after validation
- Test script included in this report

---

## Edge Cases to Consider

1. **Server Restart During Active Session**
   - In-memory counters lost
   - Falls back to database columns (backfilled values)
   - Acceptable behavior (documented)

2. **Multiple Sessions Updating Same Task**
   - Each session tracks its own updates
   - Correct behavior (task modified in multiple sessions)

3. **Task Created in One Session, Updated in Another**
   - Creation tracked in first session
   - Update tracked in second session
   - Correct behavior (reflects actual activity)

4. **Context Storage Failure**
   - Activity counter still increments (in-memory)
   - Database insert fails
   - Result: Counter mismatch (minor issue, self-correcting on restart)

5. **Bulk Update Partial Failure**
   - Transaction rollback prevents task updates
   - Activity counters already incremented
   - Result: Temporary mismatch (self-correcting on next operation)

---

## Performance Considerations

### Memory Footprint
- **sessionActivity Map:** ~100 bytes per active session
- **Expected load:** ~10 concurrent sessions = ~1KB
- **Verdict:** Negligible impact

### CPU Overhead
- **Map operations:** O(1) lookup, insert, update
- **Per operation cost:** ~0.01ms
- **Expected load:** 100 ops/min = 1ms/min total
- **Verdict:** Negligible impact

### Database Impact
- **Migration:** One-time backfill query (may take 1-10s)
- **Session end:** 4 additional columns in UPDATE (negligible)
- **Session queries:** Direct column reads vs JOINs (faster!)
- **Verdict:** Net performance improvement (removed JOINs)

---

## Testing Scenarios

1. **Happy Path**
   - Create session → create tasks → update tasks → complete tasks → store contexts → end session
   - Verify all counters accurate

2. **Bulk Operations**
   - Create session → bulk update 10 tasks → verify counters

3. **Mixed Updates**
   - Create session → update 5 tasks → complete 2 tasks → verify separate counters

4. **Server Restart**
   - Create session → create data → kill server → restart → verify database columns

5. **No Activity**
   - Create session → end immediately → verify zeros

6. **High Volume**
   - Create session → create 100 tasks → store 100 contexts → verify performance

---

## Success Criteria

### ✅ Functional Requirements
- [ ] Database migration adds 4 columns
- [ ] SessionTracker methods work correctly
- [ ] Task creation increments counter
- [ ] Task updates increment counter
- [ ] Task completions increment both counters
- [ ] Context storage increments counter
- [ ] Session status displays all metrics
- [ ] Database persistence on session end

### ✅ Non-Functional Requirements
- [ ] Operations complete in < 10ms
- [ ] Memory usage < 10KB for 100 sessions
- [ ] No breaking changes to existing code
- [ ] TypeScript compilation passes
- [ ] All tests pass

### ✅ Documentation Requirements
- [ ] Migration documented with comments
- [ ] Code comments explain tracking logic
- [ ] This investigation report complete

---

## Related Tickets Reference

- **TS004-1:** Session status and timeout tracking (last_activity_at)
- **TS005-1:** Task-session linking (session_id column in tasks)
- **TS006-2:** Token counting (input_tokens, output_tokens, total_tokens)
- **TS007-2:** This ticket (activity tracking)

---

## Conclusion

The implementation path is clear and straightforward:

1. **Database layer:** Add 4 columns with backfill
2. **Service layer:** Add in-memory tracking (identical pattern to token tracking)
3. **Handler layer:** Add 4 hook points (task create/update, context create)
4. **Display layer:** Update queries and formats
5. **Frontend layer:** Enhanced activity badges

**Estimated Implementation Time:** 3-4 hours
**Complexity:** Low-Medium (following established patterns)
**Risk Level:** Low (non-breaking, analytics-only)

**Ready for Implementation:** ✅ Yes

---

**Report Generated:** 2025-09-30
**Investigation Status:** Complete
**Next Action:** Begin Phase 1 implementation
