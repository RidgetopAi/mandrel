# TS004-1: Session Status Enum + 2-Hour Timeout Investigation Report

## Executive Summary

This investigation analyzes the requirements for implementing a session status enum ('active', 'inactive', 'disconnected') and a 2-hour inactivity timeout mechanism for AIDIS Sessions. The report provides detailed findings, implementation strategy, and specific code locations requiring updates.

---

## 1. USER REQUIREMENTS ANALYSIS

### From sessions-specs.md:

**Session Status Definitions:**
- **Active**: Server running → session is active, OR last session that was active if server is down
- **Inactive**: Sessions that are not active
- **Disconnected**: For archived/retired projects - once disconnected, no more DB read/write/delete operations allowed (future implementation)

**Timeout Requirement:**
- **2 hours of inactivity**: No LLM activity or user activity
- Inactivity means: no context storage, no task operations, no queries

**Key Insight**: User wants SIMPLE logic - avoid complex active session determination criteria.

---

## 2. CURRENT SESSIONS TABLE SCHEMA

### Existing Columns (18 total):
```sql
id                    | uuid                     | Primary Key
project_id            | uuid                     | Foreign Key to projects
agent_type            | character varying(50)    | NOT NULL
started_at            | timestamp with time zone | DEFAULT CURRENT_TIMESTAMP
ended_at              | timestamp with time zone | NULL = active session
context_summary       | text                     |
tokens_used           | integer                  | DEFAULT 0
metadata              | jsonb                    | DEFAULT '{}'::jsonb
updated_at            | timestamp with time zone | DEFAULT CURRENT_TIMESTAMP
active_branch         | character varying(255)   |
working_commit_sha    | character varying(40)    |
commits_contributed   | integer                  | DEFAULT 0
pattern_preferences   | jsonb                    |
insights_generated    | integer                  |
last_pattern_analysis | timestamp with time zone |
title                 | character varying(255)   |
description           | text                     |
agent_display_name    | character varying(100)   |
```

### Current Active Session Logic:
**Location**: `/home/ridgetop/aidis/mcp-server/src/services/sessionTracker.ts:236-265`
```typescript
static async getActiveSession(): Promise<string | null> {
  // If we have an active session in memory, return it
  if (this.activeSessionId) {
    return this.activeSessionId;
  }

  // Otherwise, get the last active session from database
  const sql = `
    SELECT id
    FROM sessions
    WHERE ended_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1
  `;
  // ... returns first session with ended_at IS NULL
}
```

**Current Indicator**: `ended_at IS NULL` means active session

---

## 3. REQUIRED DATABASE SCHEMA CHANGES

### 3.1 Add Status Column

**Need to Add:**
```sql
ALTER TABLE sessions
ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active'
CHECK (status IN ('active', 'inactive', 'disconnected'));

-- Index for status filtering
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_status_project ON sessions(status, project_id);
```

### 3.2 Add Activity Tracking Column

**Need to Add:**
```sql
ALTER TABLE sessions
ADD COLUMN last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Index for timeout queries (find sessions inactive > 2 hours)
CREATE INDEX idx_sessions_last_activity ON sessions(last_activity_at)
WHERE status = 'active';

-- Composite index for efficient timeout detection
CREATE INDEX idx_sessions_active_timeout ON sessions(status, last_activity_at)
WHERE status = 'active';
```

### 3.3 Migration Script Strategy

**Migration File**: `018_add_session_status_and_timeout.sql`

**Approach**:
1. Add `status` column with default 'active'
2. Add `last_activity_at` column with default CURRENT_TIMESTAMP
3. Backfill existing sessions:
   - If `ended_at IS NOT NULL` → status = 'inactive'
   - If `ended_at IS NULL` → status = 'active'
   - Set `last_activity_at` = GREATEST(updated_at, started_at)
4. Create indexes
5. Add trigger to update `last_activity_at` automatically

---

## 4. ACTIVITY TRACKING IMPLEMENTATION

### 4.1 Operations That Count as Activity

**Primary Activity Sources** (all update `last_activity_at`):

1. **Context Storage** - `/home/ridgetop/aidis/mcp-server/src/handlers/context.ts:86`
   - Method: `storeContext()`
   - Line: 86-189
   - **Action**: Add `UPDATE sessions SET last_activity_at = NOW()` after context insert

2. **Task Creation** - `/home/ridgetop/aidis/mcp-server/src/handlers/tasks.ts:27`
   - Method: `createTask()`
   - Line: 27-52
   - **Action**: Add `UPDATE sessions SET last_activity_at = NOW()` after task insert

3. **Task Updates** - `/home/ridgetop/aidis/mcp-server/src/handlers/tasks.ts`
   - Method: `updateTask()` (line ~153)
   - **Action**: Add `UPDATE sessions SET last_activity_at = NOW()` after task update

4. **Decision Recording** - `/home/ridgetop/aidis/mcp-server/src/handlers/decisions.ts:119`
   - Method: `recordDecision()`
   - Line: 119-180
   - **Action**: Add `UPDATE sessions SET last_activity_at = NOW()` after decision insert

5. **Session Operations** - `/home/ridgetop/aidis/mcp-server/src/services/sessionTracker.ts:295`
   - Method: `recordOperation()`
   - Line: 295-321
   - **Action**: Add `UPDATE sessions SET last_activity_at = NOW()` in recordOperation

### 4.2 Centralized Activity Update Function

**Recommended Approach**: Create helper function in `sessionTracker.ts`

```typescript
/**
 * Update last activity timestamp for active session
 * Call this from all activity-generating operations
 */
static async updateActivity(sessionId?: string): Promise<void> {
  try {
    const activeSessionId = sessionId || await this.getActiveSession();

    if (!activeSessionId) {
      return; // No active session, skip
    }

    const sql = `
      UPDATE sessions
      SET last_activity_at = NOW()
      WHERE id = $1 AND status = 'active'
    `;

    await db.query(sql, [activeSessionId]);

  } catch (error) {
    console.error('⚠️  Failed to update session activity:', error);
    // Don't throw - activity tracking failures shouldn't break operations
  }
}
```

**Integration Points** (add `await SessionTracker.updateActivity()` at these locations):
1. After context insert - context.ts:165
2. After task create - tasks.ts:48
3. After task update - tasks.ts:~180
4. After decision record - decisions.ts:~175
5. In recordOperation - sessionTracker.ts:313

---

## 5. TIMEOUT MECHANISM IMPLEMENTATION

### 5.1 Background Job Strategy

**Recommended Approach**: Node.js `setInterval` with configurable interval

**Why NOT node-cron**:
- Not currently in dependencies (would need `npm install node-cron`)
- `setInterval` is simpler and sufficient for this use case
- Already precedent in codebase: `sessionMonitoring.ts` uses `setInterval` (line 130)

### 5.2 Session Timeout Service

**Create New File**: `/home/ridgetop/aidis/mcp-server/src/services/sessionTimeout.ts`

**Implementation Strategy**:
```typescript
/**
 * AIDIS Session Timeout Service
 *
 * Monitors active sessions and marks them as inactive after 2 hours of inactivity.
 * Runs periodic checks every 5 minutes.
 *
 * Features:
 * - Automatic timeout detection (2 hours inactivity)
 * - Graceful session closure (updates ended_at, status)
 * - Configurable check interval
 * - Logging and monitoring
 */

import { db } from '../config/database.js';
import { logEvent } from '../middleware/eventLogger.js';

export interface TimeoutConfig {
  checkIntervalMs: number;      // How often to check (default: 5 minutes)
  timeoutMs: number;             // Inactivity timeout (default: 2 hours)
  enabled: boolean;
}

export class SessionTimeoutService {
  private static instance: SessionTimeoutService | null = null;
  private monitoring = false;
  private checkInterval: NodeJS.Timer | null = null;

  private config: TimeoutConfig = {
    checkIntervalMs: 5 * 60 * 1000,        // 5 minutes
    timeoutMs: 2 * 60 * 60 * 1000,         // 2 hours
    enabled: true
  };

  static getInstance(): SessionTimeoutService {
    if (!this.instance) {
      this.instance = new SessionTimeoutService();
    }
    return this.instance;
  }

  /**
   * Start monitoring sessions for timeout
   */
  async startMonitoring(): Promise<void> {
    if (this.monitoring) {
      console.log('⚠️  Session timeout monitoring already running');
      return;
    }

    console.log('⏰ Starting session timeout monitoring...');
    this.monitoring = true;

    await logEvent({
      actor: 'system',
      event_type: 'session_timeout_monitoring_started',
      status: 'open',
      metadata: {
        check_interval_ms: this.config.checkIntervalMs,
        timeout_ms: this.config.timeoutMs
      },
      tags: ['session-timeout', 'monitoring', 'start']
    });

    // Start periodic checks
    this.checkInterval = setInterval(() => {
      this.checkTimeouts().catch(error => {
        console.error('❌ Session timeout check failed:', error);
      });
    }, this.config.checkIntervalMs);

    console.log(`✅ Session timeout monitoring started (interval: ${this.config.checkIntervalMs}ms, timeout: ${this.config.timeoutMs}ms)`);
  }

  /**
   * Stop monitoring
   */
  async stopMonitoring(): Promise<void> {
    if (!this.monitoring) {
      return;
    }

    console.log('🛑 Stopping session timeout monitoring...');
    this.monitoring = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    await logEvent({
      actor: 'system',
      event_type: 'session_timeout_monitoring_stopped',
      status: 'closed',
      tags: ['session-timeout', 'monitoring', 'stop']
    });

    console.log('✅ Session timeout monitoring stopped');
  }

  /**
   * Check for timed out sessions and mark them inactive
   */
  private async checkTimeouts(): Promise<void> {
    try {
      const now = new Date();
      const timeoutThreshold = new Date(now.getTime() - this.config.timeoutMs);

      console.log(`⏰ Checking for timed out sessions (threshold: ${timeoutThreshold.toISOString()})`);

      // Find active sessions that have exceeded timeout
      const findTimeoutsSql = `
        SELECT id, project_id, started_at, last_activity_at,
               EXTRACT(EPOCH FROM (NOW() - last_activity_at)) / 3600 as hours_inactive
        FROM sessions
        WHERE status = 'active'
          AND last_activity_at < $1
      `;

      const result = await db.query(findTimeoutsSql, [timeoutThreshold]);

      if (result.rows.length === 0) {
        console.log('✅ No timed out sessions found');
        return;
      }

      console.log(`⚠️  Found ${result.rows.length} timed out session(s)`);

      // Mark each timed out session as inactive
      for (const session of result.rows) {
        await this.timeoutSession(session.id, session.hours_inactive);
      }

      // Log batch timeout event
      await logEvent({
        actor: 'system',
        event_type: 'session_timeout_batch_processed',
        status: 'closed',
        metadata: {
          sessions_timed_out: result.rows.length,
          timeout_threshold: timeoutThreshold.toISOString()
        },
        tags: ['session-timeout', 'batch', 'processed']
      });

    } catch (error) {
      console.error('❌ Failed to check session timeouts:', error);
      throw error;
    }
  }

  /**
   * Mark a specific session as timed out (inactive)
   */
  private async timeoutSession(sessionId: string, hoursInactive: number): Promise<void> {
    try {
      console.log(`⏰ Timing out session ${sessionId.substring(0, 8)}... (inactive for ${hoursInactive.toFixed(2)}h)`);

      // Update session status and ended_at
      const updateSql = `
        UPDATE sessions
        SET
          status = 'inactive',
          ended_at = COALESCE(ended_at, NOW()),
          metadata = metadata || $2::jsonb
        WHERE id = $1
        RETURNING id, started_at, ended_at, project_id
      `;

      const timeoutMetadata = JSON.stringify({
        timeout_reason: 'inactivity',
        hours_inactive: hoursInactive,
        timed_out_at: new Date().toISOString(),
        auto_closed: true
      });

      const result = await db.query(updateSql, [sessionId, timeoutMetadata]);

      if (result.rows.length > 0) {
        const session = result.rows[0];

        // Log timeout event
        await logEvent({
          actor: 'system',
          project_id: session.project_id,
          session_id: sessionId,
          event_type: 'session_timeout',
          status: 'closed',
          metadata: {
            hours_inactive: hoursInactive,
            started_at: session.started_at,
            ended_at: session.ended_at
          },
          tags: ['session-timeout', 'auto-closed']
        });

        console.log(`✅ Session ${sessionId.substring(0, 8)}... timed out and marked inactive`);
      }

    } catch (error) {
      console.error(`❌ Failed to timeout session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Get monitoring status
   */
  getStatus(): {
    monitoring: boolean;
    config: TimeoutConfig;
  } {
    return {
      monitoring: this.monitoring,
      config: this.config
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<TimeoutConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('🔧 Session timeout configuration updated');
  }
}

export default SessionTimeoutService;
```

### 5.3 Integration into Server Startup

**File**: `/home/ridgetop/aidis/mcp-server/src/server.ts`

**Add Import** (after line 57):
```typescript
import { SessionTimeoutService } from './services/sessionTimeout.js';
```

**Start Service** (in server startup sequence, around line 400-450):
```typescript
// Start session timeout monitoring
if (!SKIP_BACKGROUND_SERVICES) {
  const timeoutService = SessionTimeoutService.getInstance();
  await timeoutService.startMonitoring();
  console.log('⏰ Session timeout monitoring started');
}
```

**Stop Service** (in shutdown handler, around line 600-650):
```typescript
// Stop session timeout monitoring
const timeoutService = SessionTimeoutService.getInstance();
await timeoutService.stopMonitoring();
```

---

## 6. TYPESCRIPT INTERFACE UPDATES

### 6.1 SessionData Interface Update

**File**: `/home/ridgetop/aidis/mcp-server/src/services/sessionTracker.ts:21-34`

**Current Interface**:
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
  operations_count: number;
  productivity_score: number;
  success_status: 'active' | 'completed' | 'abandoned';
}
```

**Updated Interface** (add status and last_activity_at):
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
  operations_count: number;
  productivity_score: number;
  success_status: 'active' | 'completed' | 'abandoned';
  status: 'active' | 'inactive' | 'disconnected';  // NEW
  last_activity_at?: Date;                          // NEW
}
```

### 6.2 New Status Type Definition

**Add to** `/home/ridgetop/aidis/mcp-server/src/types/session.ts` (create if doesn't exist):
```typescript
/**
 * Session status values
 * - active: Server running and session is being used
 * - inactive: Session ended or timed out due to inactivity
 * - disconnected: Project archived/disconnected (future - no DB operations allowed)
 */
export type SessionStatus = 'active' | 'inactive' | 'disconnected';

/**
 * Session timeout configuration
 */
export interface SessionTimeoutConfig {
  enabled: boolean;
  inactivityTimeoutMs: number;  // 2 hours = 7200000ms
  checkIntervalMs: number;      // 5 minutes = 300000ms
}
```

---

## 7. STATUS TRANSITION RULES

### 7.1 State Machine

```
┌─────────────────────────────────────────────────────────┐
│                    SESSION LIFECYCLE                     │
└─────────────────────────────────────────────────────────┘

   [NEW SESSION]
        │
        │ startSession()
        ▼
   ┌─────────┐
   │ ACTIVE  │◄──────────────────┐
   └─────────┘                   │
        │                        │ (NOT ALLOWED)
        │ 2h inactivity timeout  │ reactivate = create new session
        │ OR endSession()        │
        ▼                        │
   ┌──────────┐                 │
   │ INACTIVE │─────────────────┘
   └──────────┘
        │
        │ project disconnect (future)
        ▼
   ┌──────────────┐
   │ DISCONNECTED │ (FINAL STATE - no DB operations)
   └──────────────┘
```

### 7.2 Transition Triggers

**active → inactive**:
- Manual: `endSession()` called
- Automatic: 2-hour inactivity timeout triggered
- Database: `UPDATE sessions SET status = 'inactive', ended_at = NOW()`

**active → disconnected**:
- Future implementation
- When parent project is archived/disconnected
- Prevents further DB operations

**inactive → active**:
- **NOT ALLOWED** - must create new session
- Rationale: Session lifecycle should be clear and unidirectional

**disconnected → any**:
- **NOT ALLOWED** - final state
- Future: Implement database triggers to prevent updates on disconnected sessions

---

## 8. MIGRATION SCRIPT (COMPLETE)

**File**: `/home/ridgetop/aidis/mcp-server/database/migrations/018_add_session_status_and_timeout.sql`

```sql
-- TS004-1: Add Session Status Enum + 2-Hour Timeout Implementation
--
-- This migration adds:
-- 1. Session status column (active, inactive, disconnected)
-- 2. Last activity tracking column
-- 3. Automatic timeout mechanism support
-- 4. Backfill logic for existing sessions
--
-- Author: AIDIS Team
-- Date: 2025-09-29

-- ============================================================================
-- STEP 1: Add status column
-- ============================================================================

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'
CHECK (status IN ('active', 'inactive', 'disconnected'));

COMMENT ON COLUMN sessions.status IS 'Session status: active (in use), inactive (ended/timed out), disconnected (project archived - no DB ops)';

-- ============================================================================
-- STEP 2: Add last_activity_at column for timeout tracking
-- ============================================================================

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

COMMENT ON COLUMN sessions.last_activity_at IS 'Last activity timestamp - updated on context store, task ops, etc. Used for 2-hour inactivity timeout';

-- ============================================================================
-- STEP 3: Backfill existing sessions with status and activity data
-- ============================================================================

-- Mark sessions with ended_at as inactive
UPDATE sessions
SET status = 'inactive'
WHERE ended_at IS NOT NULL AND status = 'active';

-- Set last_activity_at to the most recent timestamp available
UPDATE sessions
SET last_activity_at = GREATEST(
  COALESCE(updated_at, started_at),
  COALESCE(started_at, updated_at),
  CURRENT_TIMESTAMP
)
WHERE last_activity_at IS NULL;

-- ============================================================================
-- STEP 4: Create indexes for efficient timeout queries
-- ============================================================================

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- Composite index for status + project queries
CREATE INDEX IF NOT EXISTS idx_sessions_status_project ON sessions(status, project_id);

-- Partial index for active sessions (most common query)
CREATE INDEX IF NOT EXISTS idx_sessions_active_timeout
ON sessions(last_activity_at)
WHERE status = 'active';

-- ============================================================================
-- STEP 5: Create trigger to auto-update last_activity_at
-- ============================================================================

-- Function to update last_activity_at on session updates
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update last_activity_at if session is active
  IF NEW.status = 'active' THEN
    NEW.last_activity_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on sessions table updates
DROP TRIGGER IF EXISTS trigger_update_session_activity ON sessions;
CREATE TRIGGER trigger_update_session_activity
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION update_session_activity();

-- ============================================================================
-- STEP 6: Add function to manually timeout sessions (for testing/manual ops)
-- ============================================================================

CREATE OR REPLACE FUNCTION timeout_session(session_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  rows_affected INTEGER;
BEGIN
  UPDATE sessions
  SET
    status = 'inactive',
    ended_at = COALESCE(ended_at, NOW()),
    metadata = metadata || jsonb_build_object(
      'timeout_reason', 'manual',
      'timed_out_at', NOW()::text
    )
  WHERE id = session_uuid AND status = 'active';

  GET DIAGNOSTICS rows_affected = ROW_COUNT;

  RETURN rows_affected > 0;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION timeout_session(UUID) IS 'Manually timeout a session (mark as inactive)';

-- ============================================================================
-- STEP 7: Add function to find timed out sessions (helper for background job)
-- ============================================================================

CREATE OR REPLACE FUNCTION find_timed_out_sessions(timeout_hours INTEGER DEFAULT 2)
RETURNS TABLE(
  session_id UUID,
  project_id UUID,
  started_at TIMESTAMP WITH TIME ZONE,
  last_activity_at TIMESTAMP WITH TIME ZONE,
  hours_inactive NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id as session_id,
    s.project_id,
    s.started_at,
    s.last_activity_at,
    EXTRACT(EPOCH FROM (NOW() - s.last_activity_at)) / 3600 as hours_inactive
  FROM sessions s
  WHERE s.status = 'active'
    AND s.last_activity_at < (NOW() - (timeout_hours || ' hours')::INTERVAL)
  ORDER BY s.last_activity_at ASC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION find_timed_out_sessions(INTEGER) IS 'Find sessions that have exceeded inactivity timeout';

-- ============================================================================
-- STEP 8: Validation checks
-- ============================================================================

-- Verify all sessions have status
DO $$
DECLARE
  null_status_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_status_count
  FROM sessions
  WHERE status IS NULL;

  IF null_status_count > 0 THEN
    RAISE EXCEPTION 'Found % sessions with NULL status', null_status_count;
  END IF;

  RAISE NOTICE '✅ All sessions have valid status';
END $$;

-- Verify all sessions have last_activity_at
DO $$
DECLARE
  null_activity_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_activity_count
  FROM sessions
  WHERE last_activity_at IS NULL;

  IF null_activity_count > 0 THEN
    RAISE EXCEPTION 'Found % sessions with NULL last_activity_at', null_activity_count;
  END IF;

  RAISE NOTICE '✅ All sessions have valid last_activity_at';
END $$;

-- ============================================================================
-- Migration summary
-- ============================================================================

SELECT 'TS004-1 Migration completed successfully' as status;

SELECT
  status,
  COUNT(*) as session_count,
  MIN(last_activity_at) as oldest_activity,
  MAX(last_activity_at) as newest_activity
FROM sessions
GROUP BY status
ORDER BY status;
```

---

## 9. IMPLEMENTATION CHECKLIST

### Phase 1: Database Schema (1 migration)
- [ ] Create migration file `018_add_session_status_and_timeout.sql`
- [ ] Add `status` column with CHECK constraint
- [ ] Add `last_activity_at` column with timestamp
- [ ] Backfill existing sessions with appropriate status
- [ ] Create indexes for performance
- [ ] Create helper functions for timeout detection
- [ ] Test migration on development database
- [ ] Run migration on production database

### Phase 2: TypeScript Types (2 files)
- [ ] Update `SessionData` interface in `sessionTracker.ts`
- [ ] Create new `session.ts` types file with `SessionStatus` type
- [ ] Add timeout configuration interface
- [ ] Update all files that import SessionData

### Phase 3: Activity Tracking (6 locations)
- [ ] Create `updateActivity()` helper in `sessionTracker.ts`
- [ ] Add activity tracking to `context.storeContext()` - line 165
- [ ] Add activity tracking to `tasks.createTask()` - line 48
- [ ] Add activity tracking to `tasks.updateTask()` - line ~180
- [ ] Add activity tracking to `decisions.recordDecision()` - line ~175
- [ ] Add activity tracking to `sessionTracker.recordOperation()` - line 313
- [ ] Test activity tracking with real operations

### Phase 4: Timeout Service (1 new file)
- [ ] Create `sessionTimeout.ts` service
- [ ] Implement `SessionTimeoutService` class
- [ ] Implement `startMonitoring()` method
- [ ] Implement `checkTimeouts()` method
- [ ] Implement `timeoutSession()` method
- [ ] Add configuration support
- [ ] Add logging and event tracking
- [ ] Test timeout detection with mock data

### Phase 5: Server Integration (1 file)
- [ ] Import SessionTimeoutService in `server.ts`
- [ ] Start timeout monitoring in server startup
- [ ] Stop timeout monitoring in shutdown handler
- [ ] Test service starts/stops correctly
- [ ] Verify no duplicate monitoring instances

### Phase 6: Status Transition Logic (3 files)
- [ ] Update `startSession()` to set status = 'active'
- [ ] Update `endSession()` to set status = 'inactive'
- [ ] Update `getActiveSession()` to filter by status = 'active'
- [ ] Add validation to prevent status reversals
- [ ] Test all transition paths

### Phase 7: Testing & Validation
- [ ] Unit tests for activity tracking
- [ ] Unit tests for timeout detection
- [ ] Integration test for 2-hour timeout (use fast interval for testing)
- [ ] Test status transitions
- [ ] Test performance of timeout queries
- [ ] Verify indexes are being used (EXPLAIN ANALYZE)
- [ ] Load test with many active sessions

### Phase 8: Documentation
- [ ] Update API documentation with status field
- [ ] Document activity tracking behavior
- [ ] Document timeout mechanism
- [ ] Update sessions-specs.md with implementation details
- [ ] Create operator runbook for timeout service

---

## 10. PERFORMANCE CONSIDERATIONS

### Index Usage
```sql
-- Timeout check query uses partial index
EXPLAIN ANALYZE
SELECT id FROM sessions
WHERE status = 'active' AND last_activity_at < NOW() - INTERVAL '2 hours';

-- Expected: Index Scan using idx_sessions_active_timeout
```

### Query Frequency
- Timeout checker runs every 5 minutes
- Each check queries: `SELECT ... WHERE status = 'active' AND last_activity_at < threshold`
- Expected: <10ms per check with proper indexes
- Typical active sessions: <100 concurrent
- Index size: Minimal overhead (<1MB)

### Activity Update Overhead
- Each activity-generating operation adds 1 UPDATE query
- Impact: ~5-10ms per operation
- Mitigation: Updates are non-blocking, use WHERE clause optimization
- Alternative: Batch updates every 60 seconds (if performance issues arise)

---

## 11. RISK ASSESSMENT

### Low Risk ✅
- **Database schema changes**: Simple column additions, no data loss risk
- **Activity tracking**: Additive changes, failures don't break existing operations
- **Indexes**: Performance improvement, no functional impact

### Medium Risk ⚠️
- **Timeout service reliability**: If service fails, sessions won't timeout
  - **Mitigation**: Service restarts automatically with server
  - **Mitigation**: Manual timeout function available for recovery
- **Status transition bugs**: Incorrect transitions could break session management
  - **Mitigation**: Comprehensive unit tests
  - **Mitigation**: Database constraints prevent invalid states

### High Risk ❌
- **None identified** - Implementation is straightforward with existing patterns

---

## 12. ALTERNATIVE APPROACHES CONSIDERED

### Alternative 1: Database Triggers for Timeout
**Pros**: No background service needed
**Cons**: PostgreSQL doesn't support time-based triggers; would need pg_cron extension
**Decision**: Rejected - adds external dependency

### Alternative 2: Application-Level Caching of Activity
**Pros**: Reduces database writes
**Cons**: Activity tracking becomes unreliable if server crashes
**Decision**: Rejected - reliability more important than performance

### Alternative 3: Single `updated_at` Column for Activity
**Pros**: Reuses existing column
**Cons**: `updated_at` tracks all changes, not just activity; polluted semantics
**Decision**: Rejected - dedicated column provides clearer semantics

---

## 13. IMPLEMENTATION TIMELINE

**Estimated Total Time**: 8-12 hours

- **Phase 1** (Database): 2 hours
- **Phase 2** (Types): 1 hour
- **Phase 3** (Activity): 2 hours
- **Phase 4** (Timeout Service): 3 hours
- **Phase 5** (Integration): 1 hour
- **Phase 6** (Status Logic): 1 hour
- **Phase 7** (Testing): 2-3 hours
- **Phase 8** (Documentation): 1 hour

**Recommended Approach**: Implement in phases with testing between each phase.

---

## 14. CONCLUSION

This investigation provides a complete blueprint for implementing session status and timeout functionality. The approach:

✅ **Meets all user requirements** from sessions-specs.md
✅ **Maintains simplicity** - avoids complex active session logic
✅ **Follows existing patterns** - uses established service patterns (sessionMonitoring)
✅ **Low risk** - additive changes with proper validation
✅ **Performance optimized** - proper indexes and query optimization
✅ **Production ready** - logging, monitoring, error handling

**Next Steps**:
1. Review this investigation report with partner
2. Get approval on approach
3. Begin implementation with Phase 1 (Database Schema)
4. Test each phase before moving to next

---

**Investigation Complete** - Ready for Implementation Review