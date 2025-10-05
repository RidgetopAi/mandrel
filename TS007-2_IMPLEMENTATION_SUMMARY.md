# TS007-2: Task + Context Activity Tracking - Implementation Summary

## Quick Reference

**Status:** Investigation Complete ✅
**Implementation Ready:** Yes
**Estimated Time:** 3-4 hours
**Complexity:** Low-Medium
**Risk Level:** Low

---

## What We're Building

Add comprehensive activity tracking to sessions:

```
Current:                          New (TS007-2):
─────────────────────            ─────────────────────────────────
📝 Contexts: 12                   📝 Contexts: 12 created
🎯 Decisions: 3                   📋 Tasks: 5 created, 8 updated, 3 completed
🪙 Tokens: 15,234                 🎯 Decisions: 3
                                  🪙 Tokens: 15,234
```

---

## The Changes (At a Glance)

### 1. Database: 4 New Columns
```sql
ALTER TABLE sessions ADD COLUMN
  tasks_created INTEGER DEFAULT 0,
  tasks_updated INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  contexts_created INTEGER DEFAULT 0;
```

### 2. Service: In-Memory Tracking
```typescript
// Following TS006-2 token tracking pattern
SessionTracker.recordTaskCreated(sessionId);
SessionTracker.recordTaskUpdated(sessionId, isCompletion);
SessionTracker.recordContextCreated(sessionId);
```

### 3. Handlers: 4 Hook Points
```
✅ tasks.ts → createTask()         → recordTaskCreated()
✅ tasks.ts → updateTaskStatus()   → recordTaskUpdated()
✅ tasks.ts → bulkUpdateTasks()    → recordTaskUpdated() × N
✅ context.ts → storeContext()     → recordContextCreated()
```

### 4. Display: Enhanced Metrics
```typescript
// CLI Output
📋 Tasks: 5 created, 8 updated, 3 completed

// Web UI
🟣 5 tasks (3 completed) · 🔵 12 contexts
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER OPERATIONS                          │
└──────────────┬─────────────────────────┬────────────────────────┘
               │                         │
               ▼                         ▼
     ┌─────────────────┐      ┌──────────────────┐
     │  Task Handler   │      │ Context Handler  │
     │                 │      │                  │
     │ createTask()    │      │ storeContext()   │
     │ updateTask()    │      └────────┬─────────┘
     │ bulkUpdate()    │               │
     └────────┬────────┘               │
              │                        │
              │  Calls                 │  Calls
              ▼                        ▼
     ┌────────────────────────────────────────────────┐
     │         SessionTracker (In-Memory)              │
     │                                                 │
     │  📊 sessionActivity Map {                       │
     │       sessionId: {                              │
     │         tasksCreated: 5,                        │
     │         tasksUpdated: 8,                        │
     │         tasksCompleted: 3,                      │
     │         contextsCreated: 12                     │
     │       }                                         │
     │  }                                              │
     └──────────────────┬──────────────────────────────┘
                        │
                        │  Flush on endSession()
                        ▼
     ┌────────────────────────────────────────────────┐
     │          Database (sessions table)              │
     │                                                 │
     │  tasks_created       INTEGER                    │
     │  tasks_updated       INTEGER                    │
     │  tasks_completed     INTEGER                    │
     │  contexts_created    INTEGER                    │
     └────────────────────────────────────────────────┘
                        │
                        │  Read by
                        ▼
     ┌────────────────────────────────────────────────┐
     │       Display Layer (CLI + Web UI)              │
     │                                                 │
     │  session_status tool                            │
     │  Sessions.tsx page                              │
     └────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Database Foundation (30 minutes)
```bash
# Create migration 026
cd /home/ridgetop/aidis/mcp-server/database/migrations
# Use migration SQL from investigation report

# Run migration
psql -h localhost -p 5432 -d aidis_production -f 026_add_session_activity_tracking.sql

# Verify
psql -h localhost -p 5432 -d aidis_production -c "\d sessions"
```

### Phase 2: SessionTracker Core (45 minutes)
```typescript
// Add in sessionTracker.ts:
1. sessionActivity Map (line 55)
2. recordTaskCreated() method
3. recordTaskUpdated() method
4. recordContextCreated() method
5. getActivityCounts() method
6. Update endSession() to persist
7. Update SessionData interface
```

### Phase 3: Handler Integration (30 minutes)
```typescript
// tasks.ts
- Line 66: Add recordTaskCreated()
- Line 179: Add recordTaskUpdated()
- Line 301: Add bulk update tracking

// context.ts
- Line 165: Add recordContextCreated()
```

### Phase 4: Display Updates (45 minutes)
```typescript
// sessionAnalytics.ts
- Update getSessionStatus() query
- Update return structure

// server.ts
- Update status text format

// Sessions.tsx
- Update Activity column
- Update SessionItem interface
```

### Phase 5: Testing (60 minutes)
```bash
# Run test script
npx tsx test-ts007-2-activity-tracking.ts

# Manual verification
# 1. Create session → create tasks → verify counters
# 2. Update tasks → verify increments
# 3. Complete tasks → verify completion counter
# 4. Store contexts → verify context counter
# 5. End session → verify database persistence
```

---

## Key Implementation Points

### ✅ Following Established Patterns
```typescript
// Token Tracking (TS006-2)          // Activity Tracking (TS007-2)
SessionTracker.recordTokenUsage()  → SessionTracker.recordTaskCreated()
SessionTracker.getTokenUsage()     → SessionTracker.getActivityCounts()
```

### ✅ Hook Points Already Exist
```typescript
// All handlers already have:
const sessionId = await SessionTracker.getActiveSession();
await SessionTracker.updateSessionActivity(sessionId);

// Just add activity recording:
SessionTracker.recordTaskCreated(sessionId);
```

### ✅ Database Already Prepared
```typescript
// Tasks table already has session_id (TS005-1)
// Contexts table already has session_id (baseline)
// Just need to add counter columns to sessions table
```

---

## Testing Checklist

### Functional Tests
- [ ] Task creation increments tasks_created
- [ ] Task update increments tasks_updated
- [ ] Task completion increments both tasks_updated AND tasks_completed
- [ ] Context storage increments contexts_created
- [ ] Session status shows in-memory counts (before end)
- [ ] Session end persists counts to database
- [ ] Bulk operations track correctly (N tasks = N updates)

### Edge Case Tests
- [ ] Server restart: Falls back to database columns
- [ ] Multiple sessions: Activity isolated per session
- [ ] Zero activity: All counters remain 0
- [ ] High volume: Performance acceptable (100+ operations)

### Integration Tests
- [ ] Frontend displays activity badges correctly
- [ ] CLI output shows formatted activity metrics
- [ ] API returns complete activity data

---

## File Modification Checklist

### New Files
- [ ] `/mcp-server/database/migrations/026_add_session_activity_tracking.sql`
- [ ] `/test-ts007-2-activity-tracking.ts`

### Modified Files
- [ ] `/mcp-server/src/services/sessionTracker.ts` (7 changes)
- [ ] `/mcp-server/src/handlers/tasks.ts` (3 changes)
- [ ] `/mcp-server/src/handlers/context.ts` (1 change)
- [ ] `/mcp-server/src/handlers/sessionAnalytics.ts` (2 changes)
- [ ] `/mcp-server/src/server.ts` (1 change)
- [ ] `/aidis-command/frontend/src/pages/Sessions.tsx` (2 changes)

---

## Before You Start

### Prerequisites
✅ Database running (aidis_production)
✅ Migration 023 applied (token tracking)
✅ Sessions table has input_tokens, output_tokens, total_tokens
✅ Tasks table has session_id column (TS005-1)
✅ Contexts table has session_id column

### Verify Current State
```bash
# Check sessions table columns
psql -h localhost -p 5432 -d aidis_production -c "\d sessions"

# Should see: input_tokens, output_tokens, total_tokens
# Should NOT see: tasks_created, tasks_updated, tasks_completed, contexts_created

# Check tasks table has session_id
psql -h localhost -p 5432 -d aidis_production -c "\d tasks"

# Should see: session_id UUID
```

---

## After Implementation

### Verify Success
```bash
# 1. Check database columns added
psql -h localhost -p 5432 -d aidis_production -c "
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_name = 'sessions'
    AND column_name IN ('tasks_created', 'tasks_updated', 'tasks_completed', 'contexts_created')
  ORDER BY column_name;
"

# 2. Check backfilled data
psql -h localhost -p 5432 -d aidis_production -c "
  SELECT
    COUNT(*) as total_sessions,
    SUM(tasks_created) as total_tasks,
    SUM(contexts_created) as total_contexts
  FROM sessions
  WHERE tasks_created > 0 OR contexts_created > 0;
"

# 3. Test with active session
npx tsx test-ts007-2-activity-tracking.ts

# 4. Verify frontend display
# → Open http://localhost:3000/sessions
# → Check Activity column shows task and context badges
```

---

## Rollback Plan (If Needed)

```sql
-- Remove columns (does not delete data)
BEGIN;

ALTER TABLE sessions
  DROP COLUMN IF EXISTS tasks_created,
  DROP COLUMN IF EXISTS tasks_updated,
  DROP COLUMN IF EXISTS tasks_completed,
  DROP COLUMN IF EXISTS contexts_created;

COMMIT;

-- Revert code changes
git checkout HEAD -- mcp-server/src/services/sessionTracker.ts
git checkout HEAD -- mcp-server/src/handlers/tasks.ts
git checkout HEAD -- mcp-server/src/handlers/context.ts
git checkout HEAD -- mcp-server/src/handlers/sessionAnalytics.ts
git checkout HEAD -- mcp-server/src/server.ts
git checkout HEAD -- aidis-command/frontend/src/pages/Sessions.tsx
```

---

## Success Metrics

### Before TS007-2
```
session_status output:
📝 Contexts: 12 (from JOIN query)
🎯 Decisions: 3 (from JOIN query)
🪙 Tokens: 15,234

Performance: 2 JOINs, ~50ms query time
Data: No historical activity tracking
```

### After TS007-2
```
session_status output:
📝 Contexts: 12 created
📋 Tasks: 5 created, 8 updated, 3 completed
🎯 Decisions: 3
🪙 Tokens: 15,234 (↓5,120 ↑10,114)

Performance: Direct column reads, ~10ms query time (5x faster!)
Data: Complete activity history in database
```

---

## Questions?

Refer to:
- **Full Investigation Report:** `/home/ridgetop/aidis/TS007-2_TASK_CONTEXT_TRACKING_INVESTIGATION_REPORT.md`
- **Related Tickets:** TS004-1, TS005-1, TS006-2
- **Pattern Reference:** Token tracking implementation in SessionTracker

---

**Ready to implement!** 🚀

Start with Phase 1 (Database Foundation) and work through sequentially.
