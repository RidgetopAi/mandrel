# Task Duplication Issue - Executive Summary

## Problem
External model agents creating tasks via AIDIS MCP tools result in 4+ duplicate tasks appearing in the UI, despite only 1 task being created in the database.

## Root Cause
**Frontend State Management Race Condition**

The Tasks page (`/home/ridgetop/aidis/aidis-command/frontend/src/pages/Tasks.tsx`) adds tasks to state in TWO places:

1. **Line 215**: Immediately after HTTP POST response (optimistic UI)
2. **Line 68-73**: When WebSocket `task_created` event arrives

**Race Condition Flow:**
```
1. HTTP POST creates task → Backend inserts into DB → Backend broadcasts WebSocket
2. HTTP response arrives → Frontend adds task to state (UPDATE #1)
3. WebSocket event arrives → Frontend checks for duplicate in OLD state
4. Duplicate check fails (state hasn't committed yet) → Adds task AGAIN (UPDATE #2)
5. Result: 2 identical tasks in UI, but only 1 in database
```

## Why 4+ Duplicates?
- **Base**: 2 duplicates (HTTP + WebSocket)
- **React StrictMode**: Doubles renders in dev → 4 duplicates
- **Multiple tabs**: Each tab adds duplicates independently
- **WebSocket reconnects**: May replay messages

## Verified Working Correctly ✅
- Database Layer (1 INSERT per task)
- MCP Server (1 execution per call)
- HTTP Bridge (1 request per call)
- Backend API (1 broadcast per task)
- WebSocket Singleton (properly implemented)

## The Bug ❌
- Frontend Tasks.tsx (double state addition)

## Fix (5 minutes)
**File**: `/home/ridgetop/aidis/aidis-command/frontend/src/pages/Tasks.tsx`

### Change 1: Remove Optimistic Addition (Line 213-216)
```typescript
// COMMENT OUT:
/*
if (response.data.task.project_id === projectId) {
  setTasks(prev => [response.data.task, ...prev]);
}
*/
```

### Change 2: Add Deduplication Guard (After line 45)
```typescript
const processedTaskIdsRef = useRef(new Set<string>());

// Update WebSocket handler (line 66-78):
case 'task_created':
  if (taskPayload && isProjectMatch(taskPayload)) {
    if (processedTaskIdsRef.current.has(taskPayload.id)) {
      console.log('🛡️ Duplicate blocked:', taskPayload.id);
      break;
    }
    processedTaskIdsRef.current.add(taskPayload.id);
    setTasks(prev => [...prev.filter(t => t.id !== taskPayload.id), taskPayload]);
  }
  break;
```

## Testing
```bash
# Before fix: Creates 2-4+ duplicates
# After fix: Creates 1 task
# Database: Always 1 task (no change)
```

## Impact
- **User Experience**: CRITICAL → EXCELLENT
- **Data Integrity**: GOOD → EXCELLENT (maintained)
- **Risk**: LOW (frontend-only change)

## Evidence
Test task created via MCP:
- Database: 1 row (ID: 3b58fdb9-7378-40b7-9b76-fe9848c244de)
- Confirmed: No backend duplication
- Confirmed: Frontend race condition

---
**Full Report**: `TASK_DUPLICATION_ROOT_CAUSE_INVESTIGATION.md`
