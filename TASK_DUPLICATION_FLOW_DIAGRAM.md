# Task Duplication Flow Diagram

## Current (Broken) Flow - 4+ Duplicates

```
┌─────────────────────────────────────────────────────────────────────┐
│ EXTERNAL AGENT (via MCP)                                            │
│ Calls: task_create({title: "Fix bug", projectId: "abc123"})        │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ HTTP BRIDGE (port 8080)                                             │
│ POST /mcp/tools/task_create                                         │
│ Status: ✅ Single request                                           │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ MCP SERVER (/mcp-server/src/server.ts)                              │
│ - Validates input                                                   │
│ - Calls handleTaskCreate() (line 2175)                              │
│ - Calls tasksHandler.createTask() (line 2180)                       │
│ Status: ✅ Single execution                                         │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ DATABASE (PostgreSQL)                                               │
│ INSERT INTO tasks (...) VALUES (...) RETURNING *                    │
│ Status: ✅ Single row inserted                                      │
│ Result: task_id = "xyz-789"                                         │
└─────────────────────────────────────────────────────────────────────┘

                         [Task created in DB]
                                  │
         ┌────────────────────────┴────────────────────────┐
         │                                                  │
         ▼                                                  ▼
┌──────────────────────┐                    ┌──────────────────────────────┐
│ MCP Response         │                    │ AIDIS Command Backend        │
│ Returns to agent     │                    │ (Task created via AIDIS UI   │
│ Status: ✅ Success   │                    │  or external API)            │
└──────────────────────┘                    │ /backend/src/controllers/    │
                                            │   task.ts (line 110)         │
                                            │ TaskService.createTask()     │
                                            │ Status: ✅ Single insert     │
                                            └──────────┬───────────────────┘
                                                       │
                                                       ▼
                                            ┌──────────────────────────────┐
                                            │ WebSocket Broadcast          │
                                            │ webSocketService.broadcast({ │
                                            │   type: 'task_created',      │
                                            │   data: { task }             │
                                            │ })                           │
                                            │ Status: ✅ Single broadcast  │
                                            └──────────┬───────────────────┘
                                                       │
                         ┌─────────────────────────────┴─────────────────┐
                         │                                               │
                         ▼                                               ▼
              ┌────────────────────┐                          ┌────────────────────┐
              │ Tab A (Active)     │                          │ Tab B (Background) │
              │ Tasks.tsx          │                          │ Tasks.tsx          │
              └────────────────────┘                          └────────────────────┘
                         │                                               │
        ┌────────────────┴────────────────┐                             │
        │                                 │                              │
        ▼ (Line 215)                      ▼ (Line 68)                   ▼ (Line 68)
┌─────────────────┐            ┌─────────────────────┐        ┌─────────────────────┐
│ HTTP Response   │            │ WebSocket Event     │        │ WebSocket Event     │
│ Handler         │            │ Handler             │        │ Handler             │
│                 │            │                     │        │                     │
│ setTasks(       │            │ case 'task_created':│        │ case 'task_created':│
│   [task, ...])  │            │   if (!duplicate)   │        │   if (!duplicate)   │
│                 │            │     setTasks([...]) │        │     setTasks([...]) │
│ ❌ DUPLICATE #1 │            │   ❌ DUPLICATE #2   │        │   ❌ DUPLICATE #3   │
└─────────────────┘            └─────────────────────┘        └─────────────────────┘

                                    RACE CONDITION!
                        HTTP adds task to state (queued)
                        WebSocket checks OLD state (before commit)
                        WebSocket doesn't find task → adds it again
                        Both state updates commit → 2 tasks in Tab A

                        + Tab B receives WebSocket → adds 1 task
                        + React StrictMode doubles renders → 4 tasks
                        = TOTAL: 4+ duplicate tasks visible to user
```

## Fixed Flow - Single Task

```
┌─────────────────────────────────────────────────────────────────────┐
│ EXTERNAL AGENT (via MCP) OR USER (via UI)                           │
│ Creates task                                                        │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Backend creates task + broadcasts WebSocket                        │
│ Status: ✅ Single broadcast                                         │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
              ┌──────────────────────────────────────┐
              │                                      │
              ▼                                      ▼
   ┌────────────────────┐              ┌────────────────────┐
   │ Tab A (Active)     │              │ Tab B (Background) │
   │ Tasks.tsx          │              │ Tasks.tsx          │
   └────────────────────┘              └────────────────────┘
              │                                      │
              ▼ (Line 215 REMOVED)                   │
   ┌────────────────────┐                            │
   │ HTTP Response      │                            │
   │ Handler            │                            │
   │                    │                            │
   │ // No state update │                            │
   │ ✅ No duplicate    │                            │
   └────────────────────┘                            │
              │                                      │
              ▼ (Line 68 with guard)                 ▼ (Line 68 with guard)
   ┌────────────────────┐              ┌────────────────────┐
   │ WebSocket Event    │              │ WebSocket Event    │
   │ Handler            │              │ Handler            │
   │                    │              │                    │
   │ if (seen) break;   │              │ if (seen) break;   │
   │ mark as seen       │              │ mark as seen       │
   │ setTasks([task])   │              │ setTasks([task])   │
   │ ✅ Single task     │              │ ✅ Single task     │
   └────────────────────┘              └────────────────────┘

                    RESULT: 1 task in each tab
                    User sees: 1 task (same across tabs)
                    Database: 1 task ✅
```

## Key Differences

| Aspect | Broken (Current) | Fixed |
|--------|------------------|-------|
| HTTP response handler | Adds task to state | No-op (removed) |
| WebSocket handler | Adds if not found | Deduplication guard + add |
| State updates per creation | 2+ (HTTP + WebSocket) | 1 (WebSocket only) |
| Duplicates in single tab | 2-4+ | 1 |
| Duplicates across tabs | 2-4+ per tab | 1 per tab (same task) |
| Database rows | 1 ✅ | 1 ✅ |

## Files Modified

1. `/home/ridgetop/aidis/aidis-command/frontend/src/pages/Tasks.tsx`
   - Line 213-216: Comment out optimistic addition
   - After line 45: Add `processedTaskIdsRef`
   - Line 66-78: Add deduplication guard

## Testing Checklist

- [ ] Create task via MCP → 1 task appears
- [ ] Create task via UI → 1 task appears
- [ ] Create task with multiple tabs open → 1 task in each tab
- [ ] Refresh page → tasks load correctly
- [ ] WebSocket disconnect/reconnect → no duplicates
- [ ] React StrictMode → no duplicates
