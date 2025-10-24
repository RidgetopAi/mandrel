# Project Defaulting - Complete Data Flow Diagram

**Date:** 2025-10-07

---

## Current Flow (WITH ISSUE)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  USER INTERACTION                                                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
            User selects "aidis-refactor" in UI Settings dropdown
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  FRONTEND (React)                                                        │
│  File: /aidis-command/frontend/src/pages/Settings.tsx                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ onChange handler (line 104)
                                    ▼
                    handleDefaultProjectChange("aidis-refactor")
                                    │
                                    │ await setDefaultProject(projectName)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  SETTINGS HOOK                                                           │
│  File: /aidis-command/frontend/src/hooks/useSettings.ts                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ├──────────────────────┐
                                    │                      │
                                    ▼                      ▼
                    Step 1: Get project list    Step 3: Update localStorage
                    fetch('/api/v1/projects')   "aidis_user_settings" ✅
                                    │
                                    ▼
                    Step 2: Find project ID
                    project.id = "1083fd15-..."
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  BACKEND API CALL                                                        │
│  POST /api/v2/projects/1083fd15-0aa7-4d0d-acff-f878085f4dce/set-primary │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PROJECT CONTROLLER                                                      │
│  File: /mcp-server/src/api/controllers/projectController.ts             │
│  Method: setPrimary()                                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                         BEGIN TRANSACTION
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              Verify project   Clear old      Set new primary
               exists (✅)     is_primary     metadata->>'is_primary'='true'
                                    │
                                    ▼
                         COMMIT TRANSACTION
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  DATABASE (PostgreSQL)                                                   │
│  Table: projects                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
          aidis-refactor: metadata->>'is_primary' = 'true' ✅
          aidis-alpha:    metadata->>'is_primary' = NULL ✅
                                    │
                                    ▼
                         SUCCESS RESPONSE
                                    │
                                    ▼
                    ┌───────────────────────────┐
                    │  ⚠️  DISCONNECT POINT ⚠️   │
                    │  Session cache NOT        │
                    │  invalidated!             │
                    └───────────────────────────┘

═══════════════════════════════════════════════════════════════════════════

LATER: User calls MCP tool project_current

┌─────────────────────────────────────────────────────────────────────────┐
│  MCP TOOL CALL                                                           │
│  Tool: project_current                                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PROJECT HANDLER                                                         │
│  File: /mcp-server/src/handlers/project.ts                              │
│  Method: getCurrentProject()                                             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    getCurrentProjectId(sessionId)
                                    │
                                    ▼
            ┌───────────────────────────────────────┐
            │  IN-MEMORY SESSION CACHE              │
            │  sessionStates.get('default-session') │
            │  returns: 'aidis-alpha' ID ❌         │
            └───────────────────────────────────────┘
                                    │
                                    ▼
                    Returns "aidis-alpha" project ❌
                    (Database says "aidis-refactor"! ✅)


═══════════════════════════════════════════════════════════════════════════
═══════════════════════════════════════════════════════════════════════════


## Fixed Flow (WITH CACHE INVALIDATION)

```
... [Everything same until COMMIT TRANSACTION] ...
                                    │
                                    ▼
                         COMMIT TRANSACTION
                                    │
                                    ▼
          ┌───────────────────────────────────────────┐
          │  NEW CODE: Invalidate Session Cache       │
          │  projectHandler.clearSessionCache()       │
          │  sessionStates.clear() ✅                  │
          └───────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  DATABASE (PostgreSQL)                                                   │
│  Table: projects                                                         │
└─────────────────────────────────────────────────────────────────────────┘
          aidis-refactor: metadata->>'is_primary' = 'true' ✅
          aidis-alpha:    metadata->>'is_primary' = NULL ✅
                                    │
                                    ▼
                         SUCCESS RESPONSE

═══════════════════════════════════════════════════════════════════════════

LATER: User calls MCP tool project_current

┌─────────────────────────────────────────────────────────────────────────┐
│  MCP TOOL CALL                                                           │
│  Tool: project_current                                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PROJECT HANDLER                                                         │
│  File: /mcp-server/src/handlers/project.ts                              │
│  Method: getCurrentProject()                                             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    getCurrentProjectId(sessionId)
                                    │
                                    ▼
            ┌───────────────────────────────────────┐
            │  IN-MEMORY SESSION CACHE              │
            │  sessionStates.get('default-session') │
            │  returns: NULL (cache cleared!) ✅    │
            └───────────────────────────────────────┘
                                    │
                                    ▼
                        initializeSession()
                                    │
                                    ▼
            ┌───────────────────────────────────────┐
            │  Check database for primary project   │
            │  SELECT ... WHERE is_primary='true'   │
            │  finds: "aidis-refactor" ✅           │
            └───────────────────────────────────────┘
                                    │
                                    ▼
            setCurrentProject("aidis-refactor" ID)
                                    │
                                    ▼
                    Returns "aidis-refactor" project ✅
                    (Matches database! ✅)


═══════════════════════════════════════════════════════════════════════════
═══════════════════════════════════════════════════════════════════════════


## Session Initialization Priority Logic

```
┌─────────────────────────────────────────────────────────────────────────┐
│  initializeSession() - Priority Cascade                                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
            ┌───────────────────────────────────┐
            │  Priority 1: Primary Project      │
            │  Check: metadata->>'is_primary'   │
            └───────────────────────────────────┘
                    │                   │
                    │ Found ✅          │ Not Found ❌
                    ▼                   ▼
            Use Primary Project     ┌───────────────────────────────────┐
                    │               │  Priority 2: Cached Session       │
                    │               │  Check: sessionStates.get()       │
                    │               └───────────────────────────────────┘
                    │                       │                   │
                    │                       │ Found ✅          │ Not Found ❌
                    │                       ▼                   ▼
                    │               Use Cached Project  ┌───────────────────────────────────┐
                    │                       │           │  Priority 3: aidis-bootstrap      │
                    │                       │           │  Check: name='aidis-bootstrap'    │
                    │                       │           └───────────────────────────────────┘
                    │                       │                   │                   │
                    │                       │                   │ Found ✅          │ Not Found ❌
                    │                       │                   ▼                   ▼
                    │                       │           Use aidis-bootstrap  ┌───────────────────────────────────┐
                    │                       │                   │            │  Priority 4: First Project        │
                    │                       │                   │            │  Use: projects[0]                 │
                    │                       │                   │            └───────────────────────────────────┘
                    │                       │                   │                    │
                    └───────────────────────┴───────────────────┴────────────────────┘
                                            │
                                            ▼
                            setCurrentProject(projectId)
                                            │
                                            ▼
                                    Return project ✅
```

---

## Key Takeaways

1. **Two Separate Systems:**
   - **Database primary flag** = User preference (persistent)
   - **Session cache** = Active project (volatile, in-memory)

2. **The Problem:**
   - Setting primary in database doesn't invalidate session cache
   - Cache persists until server restart or manual invalidation

3. **The Solution:**
   - Add `clearSessionCache()` call after setting primary
   - Forces re-initialization on next access
   - Re-initialization respects Priority 1 (primary project)

4. **Why It Works:**
   - `initializeSession()` checks primary project FIRST
   - If primary exists, it overrides cached session
   - Cache clearing triggers re-initialization naturally
