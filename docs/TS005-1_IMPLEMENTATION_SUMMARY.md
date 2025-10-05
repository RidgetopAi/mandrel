# TS005-1: Task-Session Linking + Display ID - Implementation Summary

## Quick Reference Guide

### Current State ❌
- Tasks table: **NO session_id column**
- Sessions table: **NO display_id column**
- 396 tasks, 61 sessions, 186 contexts (contexts already linked ✅)

### Target State ✅
- Sessions have human-readable display_id: `SES-2025-0001`, `SES-2025-0042`, etc.
- Tasks automatically capture session_id on creation
- Session details show: contexts_created, tasks_created, duration, project_name, searchable display_id

---

## Implementation Checklist

### Phase 1: Session Display ID (1-2 days)
- [ ] Run migration `026_add_session_display_id.sql`
- [ ] Verify 61 sessions backfilled with SES-2025-NNNN format
- [ ] Test new session creation generates next display_id
- [ ] Update session TypeScript interfaces to include displayId
- [ ] Update session API responses to return display_id
- [ ] Test display_id searchability

### Phase 2: Task-Session Linking (2-3 days)
- [ ] Run migration `027_add_tasks_session_id.sql`
- [ ] Check backfill results (expect ~50-70% linked based on time proximity)
- [ ] Update Task interface in tasks.ts (add sessionId field)
- [ ] Update createTask() method to capture active session_id
- [ ] Update mapTask() to include session_id in response
- [ ] Test task creation during active session
- [ ] Verify session_id appears in task objects

### Phase 3: Analytics & UI (2-3 days)
- [ ] Add session task count to session details query
- [ ] Create getTasksBySession(sessionId) helper method
- [ ] Update session details API/tool response
- [ ] Test session details shows task counts
- [ ] Update frontend to display session display_id
- [ ] Make display_id searchable in UI
- [ ] Show linked tasks on session details page

---

## Key SQL Commands

### Check Migration Status
```sql
-- After migration 026:
SELECT display_id, title, started_at FROM sessions ORDER BY started_at DESC LIMIT 10;

-- After migration 027:
SELECT COUNT(*) FILTER (WHERE session_id IS NOT NULL) as linked,
       COUNT(*) FILTER (WHERE session_id IS NULL) as orphaned
FROM tasks;

-- Session with task counts:
SELECT s.display_id, COUNT(t.id) as tasks
FROM sessions s
LEFT JOIN tasks t ON t.session_id = s.id
GROUP BY s.id, s.display_id
ORDER BY s.started_at DESC;
```

### Manual Testing
```sql
-- Test display_id generation:
INSERT INTO sessions (project_id, agent_type)
VALUES ('5d335666-ca85-4d54-8f8c-c7e817a8b08e', 'test-agent')
RETURNING id, display_id;
-- Should return: SES-2025-0062 (or next in sequence)

-- Test session search by display_id:
SELECT * FROM sessions WHERE display_id ILIKE '%2025-004%';
```

---

## Critical Code Changes

### tasks.ts - Task Interface (line 4)
```typescript
export interface Task {
    id: string;
    projectId: string;
    sessionId?: string;  // ⬅️ ADD THIS
    // ... rest of fields
}
```

### tasks.ts - createTask Method (lines 38-48)
```typescript
// GET active session BEFORE insert
const { SessionTracker } = await import('../services/sessionTracker.js');
const sessionId = await SessionTracker.getActiveSession();

// ADD session_id to INSERT query
const result = await client.query(
    `INSERT INTO tasks
     (project_id, session_id, title, description, ...)  -- ⬅️ ADD session_id
     VALUES ($1, $2, $3, $4, ...)`,
    [projectId, sessionId, title, description, ...]  -- ⬅️ ADD sessionId param
);
```

### tasks.ts - mapTask Method (line 467)
```typescript
return {
    id: row.id,
    projectId: row.project_id,
    sessionId: row.session_id,  // ⬅️ ADD THIS
    // ... rest of mapping
};
```

---

## Display ID Format Specification

**Format**: `SES-YYYY-NNNN`

Examples:
- `SES-2025-0001` - First session of 2025
- `SES-2025-0042` - 42nd session of 2025
- `SES-2026-0001` - First session of 2026 (resets each year)

**Properties**:
- Fixed width: 13 characters
- Year-based: Resets sequence annually
- Searchable: Pattern matching works naturally
- Sortable: Chronological ordering by string sort
- Human-readable: Easy to communicate verbally

---

## Expected Outcomes

### After Migration 026 (Display ID)
- 61 existing sessions have display_ids: SES-2025-0001 through SES-2025-0061
- New sessions auto-generate next ID via trigger
- Sequence continues from 0061 for 2025
- Display ID unique constraint prevents duplicates

### After Migration 027 (Task Linking)
- New tasks automatically capture session_id
- Existing tasks: ~60-70% linked via time-based backfill
- Orphaned tasks (session_id = NULL) preserved for history
- Tasks show which session created them

### After Phase 3 (Analytics)
- Session details show: "Tasks Created: 5 (3 completed)"
- Click task count → filtered task list for that session
- Search sessions by display_id: "SES-2025-*"
- Session productivity metrics include task completion rate

---

## Rollback Plan

### Rollback Migration 027 (if needed)
```sql
BEGIN;
DROP INDEX IF EXISTS idx_tasks_session_status;
DROP INDEX IF EXISTS idx_tasks_session_project;
DROP INDEX IF EXISTS idx_tasks_session_id;
ALTER TABLE tasks DROP COLUMN IF EXISTS session_id;
COMMIT;
```

### Rollback Migration 026 (if needed)
```sql
BEGIN;
DROP TRIGGER IF EXISTS trigger_set_session_display_id ON sessions;
DROP FUNCTION IF EXISTS set_session_display_id();
DROP FUNCTION IF EXISTS get_next_session_display_id();
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_display_id_unique;
ALTER TABLE sessions DROP COLUMN IF EXISTS display_id;
DROP SEQUENCE IF EXISTS session_seq_2025;
COMMIT;
```

---

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| Display ID collision | LOW | Postgres sequence is atomic |
| Task backfill wrong session | LOW | Conservative 1-hour window + metadata flag |
| No active session during task create | LOW | session_id is nullable |
| Performance impact | LOW | Indexes added for all FK lookups |
| TypeScript interface out of sync | MEDIUM | Update in same PR as migration |

**Overall Risk**: **LOW** - Following established patterns (contexts already use session_id FK)

---

## Success Criteria

✅ All 61 existing sessions have unique display_ids
✅ New sessions auto-generate display_id via trigger
✅ Display_id is searchable and appears in all session responses
✅ New tasks capture active session_id automatically
✅ Task interface includes sessionId field
✅ Session details API returns task counts
✅ At least 50% of existing tasks linked to sessions via backfill
✅ No errors in migration execution
✅ Performance remains acceptable (no slow queries)
✅ TypeScript compiles without errors

---

## Files to Modify

**Migrations**:
- `/home/ridgetop/aidis/mcp-server/database/migrations/026_add_session_display_id.sql` (CREATE)
- `/home/ridgetop/aidis/mcp-server/database/migrations/027_add_tasks_session_id.sql` (CREATE)

**TypeScript**:
- `/home/ridgetop/aidis/mcp-server/src/handlers/tasks.ts` (MODIFY: lines 4-22, 38-60, 465-485)
- `/home/ridgetop/aidis/mcp-server/src/services/sessionTracker.ts` (MODIFY: add displayId to interfaces)
- `/home/ridgetop/aidis/mcp-server/src/server.ts` (OPTIONAL: update handleTaskCreate response)

---

## Estimated Timeline

- **Phase 1** (Display ID): 1-2 days
  - Migration: 1 hour
  - TypeScript updates: 2-3 hours
  - Testing: 2-3 hours

- **Phase 2** (Task Linking): 2-3 days
  - Migration: 1 hour
  - TypeScript updates: 4-5 hours
  - Testing: 3-4 hours

- **Phase 3** (Analytics): 2-3 days
  - Query updates: 3-4 hours
  - API/tool updates: 3-4 hours
  - Frontend integration: 4-6 hours

**Total**: 5-8 days for complete implementation

---

## Quick Start Commands

```bash
# 1. Run Phase 1 migration
psql -h localhost -p 5432 -d aidis_production -f mcp-server/database/migrations/026_add_session_display_id.sql

# 2. Verify display IDs
psql -h localhost -p 5432 -d aidis_production -c "SELECT display_id, started_at FROM sessions ORDER BY started_at DESC LIMIT 10;"

# 3. Update TypeScript and rebuild
cd mcp-server
npm run type-check
npx tsc

# 4. Run Phase 2 migration
psql -h localhost -p 5432 -d aidis_production -f mcp-server/database/migrations/027_add_tasks_session_id.sql

# 5. Verify task linking
psql -h localhost -p 5432 -d aidis_production -c "SELECT COUNT(*) FILTER (WHERE session_id IS NOT NULL) as linked FROM tasks;"

# 6. Restart MCP server
./restart-aidis.sh
```

---

**Quick Reference Created**: 2025-09-30
**See Full Report**: `/home/ridgetop/aidis/TS005-1_INVESTIGATION_REPORT.md`