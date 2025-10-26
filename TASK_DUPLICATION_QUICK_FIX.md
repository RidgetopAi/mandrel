# Task Duplication - Quick Fix Guide

## 🎯 The Problem
Creating 1 task → Shows 4+ duplicates in UI (but only 1 in database)

## 🔍 Root Cause
Frontend adds task TWICE: once on HTTP response, once on WebSocket event

## ✅ The Fix (5 minutes)

### File: `/home/ridgetop/aidis/aidis-command/frontend/src/pages/Tasks.tsx`

#### Step 1: Add deduplication ref (after line 45)
```typescript
const processedTaskIdsRef = useRef(new Set<string>());
```

#### Step 2: Remove optimistic addition (line 213-216)
```typescript
// COMMENT OUT THESE LINES:
/*
if (response.data.task.project_id === projectId) {
  setTasks(prev => [response.data.task, ...prev]);
}
*/
```

#### Step 3: Add guard to WebSocket handler (line 66-78)
```typescript
case 'task_created':
  if (taskPayload && isProjectMatch(taskPayload)) {
    // Deduplication guard
    if (processedTaskIdsRef.current.has(taskPayload.id)) {
      console.log('🛡️ Duplicate task_created event blocked:', taskPayload.id);
      break;
    }
    processedTaskIdsRef.current.add(taskPayload.id);
    
    setTasks(prev => {
      if (prev.some(task => task.id === taskPayload.id)) {
        return prev;
      }
      return [taskPayload, ...prev];
    });
    
    notification.success({
      message: 'Task Created',
      description: `New task "${taskPayload.title}" has been created.`
    });
  }
  break;
```

## 🧪 Test
```bash
# Create task via MCP
curl -X POST http://localhost:8080/mcp/tools/task_create \
  -H "Content-Type: application/json" \
  -d '{"arguments":{"projectId":"<project-uuid>","title":"Test Task","type":"test"}}'

# Check UI: Should see 1 task
# Check DB: Should see 1 task
psql -h localhost -p 5432 -d aidis_production -c \
  "SELECT id, title FROM tasks WHERE title = 'Test Task';"
```

## 📊 Expected Results
| Metric | Before | After |
|--------|--------|-------|
| Tasks in UI | 4+ | 1 |
| Tasks in DB | 1 | 1 |
| WebSocket events | 1 | 1 |
| State updates | 2+ | 1 |

## 🚀 Deploy
1. Make changes in `Tasks.tsx`
2. Test locally
3. Commit & push
4. Restart frontend: `npm run dev:frontend`

## 📝 Quick Context
- **No backend changes needed** ✅
- **No database changes needed** ✅
- **Frontend-only fix** ✅
- **Low risk** ✅

## 📚 Full Documentation
- Executive Summary: `TASK_DUPLICATION_EXECUTIVE_SUMMARY.md`
- Full Investigation: `TASK_DUPLICATION_ROOT_CAUSE_INVESTIGATION.md`
- Flow Diagram: `TASK_DUPLICATION_FLOW_DIAGRAM.md`
