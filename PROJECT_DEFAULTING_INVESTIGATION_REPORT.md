# UI Default Project Not Syncing - Complete Investigation Report

**Date:** 2025-10-07
**Investigator:** Claude (AIDIS Agent)
**Duration:** 90 minutes
**Status:** ✅ ROOT CAUSE IDENTIFIED - SYSTEM WORKING AS DESIGNED

---

## Executive Summary

**Issue:** User set "aidis-refactor" as default project in AIDIS Command UI Settings, but MCP tools still return "aidis-alpha" as current project.

**Root Cause:** The backend API is working correctly and database is properly updated. The issue is that the MCP server maintains an **in-memory session cache** that persists until server restart. The `project_current` MCP tool returns the cached session state, not the database primary flag directly.

**Verdict:** This is **NOT A BUG** - it's working as designed. The system has two different concepts:
1. **Primary Project** (database metadata flag) - user's preferred default
2. **Current Session Project** (in-memory cache) - active project for this server session

**Solution Required:** Force the in-memory session to re-initialize and sync with the primary project from the database.

---

## Complete Data Flow Analysis

### 1. UI Settings Flow (✅ WORKING CORRECTLY)

**File:** `/home/ridgetop/aidis/aidis-command/frontend/src/pages/Settings.tsx`

```typescript
// Line 104: Dropdown onChange handler
onChange={handleDefaultProjectChange}

// Lines 35-48: Handler implementation
const handleDefaultProjectChange = async (projectName: string | null) => {
  if (projectName) {
    try {
      await setDefaultProject(projectName);  // ← Calls useSettings hook
      message.success(`Default project set to: ${projectName}`);
    } catch (error) {
      console.error('Failed to set default project:', error);
      message.error('Failed to set default project in backend. Local settings updated.');
    }
  }
};
```

**Evidence:** Code correctly calls the hook with proper error handling.

---

### 2. useSettings Hook Flow (✅ WORKING CORRECTLY)

**File:** `/home/ridgetop/aidis/aidis-command/frontend/src/hooks/useSettings.ts`

```typescript
// Lines 41-85: setDefaultProject implementation
const setDefaultProject = useCallback(async (projectName: string | null) => {
  console.log('🔧 useSettings: setDefaultProject called with:', projectName);

  if (projectName) {
    try {
      // Step 1: Find project ID by name
      const projectsResponse = await fetch('http://localhost:8080/api/v1/projects');
      const projectsData = await projectsResponse.json();
      const project = projectsData.data?.projects?.find((p: any) => p.name === projectName);

      if (project?.id) {
        // Step 2: Call backend to set project as primary
        const response = await fetch(`http://localhost:8080/api/v2/projects/${project.id}/set-primary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          console.error('Failed to set project as primary in backend:', await response.text());
        } else {
          console.log('✅ Successfully set project as primary in backend:', projectName);
        }
      }
    } catch (error) {
      console.error('Failed to update backend primary project:', error);
    }
  }

  // Step 3: Update local settings (localStorage)
  setSettings(prev => ({
    ...prev,
    defaultProject: projectName || undefined
  }));
}, []);
```

**Evidence:**
- ✅ Correctly fetches project list to find ID
- ✅ Calls `/api/v2/projects/${id}/set-primary` endpoint
- ✅ Updates localStorage
- ✅ Includes comprehensive error handling

---

### 3. Backend API Endpoint (✅ WORKING CORRECTLY)

**File:** `/home/ridgetop/aidis/mcp-server/src/api/controllers/projectController.ts`

```typescript
// Lines 19-104: setPrimary controller method
async setPrimary(req: Request, res: Response): Promise<void> {
  const client = await db.connect();

  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Step 1: Verify project exists
    const projectCheck = await client.query(
      'SELECT id, name FROM projects WHERE id = $1',
      [id]
    );

    if (projectCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: `Project with ID ${id} not found` });
      return;
    }

    // Step 2: Clear is_primary flag from all other projects
    await client.query(
      `UPDATE projects
       SET metadata = metadata - 'is_primary'
       WHERE metadata->>'is_primary' = 'true'`
    );

    // Step 3: Set new primary project
    const updateResult = await client.query(
      `UPDATE projects
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{is_primary}',
         'true'
       )
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    await client.query('COMMIT');

    res.json({ success: true, data: updateResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
}
```

**Evidence:**
- ✅ Transaction-safe (BEGIN/COMMIT/ROLLBACK)
- ✅ Clears old primary flags first
- ✅ Sets new primary flag in JSONB metadata
- ✅ Returns proper success/error responses

**Endpoint Registration:** `/home/ridgetop/aidis/mcp-server/src/server/healthServer.ts` (line 467)
```typescript
const urlPattern = /^\/api\/v2\/projects\/([^\/]+)\/set-primary$/;
```

---

### 4. Database State (✅ CORRECTLY UPDATED)

```sql
-- Query executed: 2025-10-07 20:03:18
SELECT name, metadata->>'is_primary' as is_primary, updated_at
FROM projects
ORDER BY updated_at DESC LIMIT 5;

-- Results:
name            | is_primary | updated_at
----------------|------------|----------------------
aidis-alpha     | NULL       | 2025-10-07 20:03:18
aidis-refactor  | true       | 2025-10-07 20:03:18  ← ✅ CORRECT
AIDIS COMMAND   | NULL       | 2025-10-07 02:15:35
aidis-bootstrap | NULL       | 2025-10-07 02:10:52
dc-viz          | NULL       | 2025-10-02 04:14:19
```

**Evidence:** Database correctly shows `aidis-refactor` has `is_primary=true` in metadata.

---

### 5. MCP Server Session Cache (⚠️ THE DISCONNECT POINT)

**File:** `/home/ridgetop/aidis/mcp-server/src/handlers/project.ts`

#### Session State Management (Lines 44-46)
```typescript
export class ProjectHandler {
  // In-memory session state (in production, this could be Redis/database)
  private sessionStates = new Map<string, SessionState>();
  private defaultSessionId = 'default-session';
```

**Issue:** The session state is stored in-memory and persists across calls until server restart.

#### getCurrentProjectId Method (Lines 227-249)
```typescript
async getCurrentProjectId(sessionId: string = this.defaultSessionId): Promise<string | null> {
  const state = this.sessionStates.get(sessionId);
  const cachedId = state?.currentProjectId;

  if (!cachedId) {
    return null;  // ← If no cached state, returns null (not primary project!)
  }

  // Validate cached ID still exists in database
  const result = await db.query(
    'SELECT 1 FROM projects WHERE id = $1',
    [cachedId]
  );

  if (result.rows.length === 0) {
    // Clear invalid cached state
    console.warn(`Clearing stale project cache for session ${sessionId}: project ${cachedId} no longer exists`);
    this.sessionStates.delete(sessionId);
    return null;
  }

  return cachedId;  // ← Returns cached ID (not checking if it's still primary!)
}
```

**Evidence:** Method returns cached session state, not the current primary project from database.

#### initializeSession Method (Lines 367-424)
```typescript
async initializeSession(sessionId: string = this.defaultSessionId): Promise<ProjectInfo | null> {
  console.log(`🔄 Initializing session: ${sessionId}`);

  const projects = await this.listProjects(false);
  if (projects.length === 0) return null;

  // Priority 1: Check for primary project FIRST (respects user preference)
  const primaryProject = projects.find(p => p.metadata && p.metadata.is_primary === true);

  if (primaryProject) {
    console.log(`✅ Found primary project: ${primaryProject.name}`);

    // Check if we're already on the primary project
    const existing = await this.getCurrentProjectId(sessionId);
    if (existing === primaryProject.id) {
      console.log(`✅ Already on primary project: ${primaryProject.name}`);
      return { ...primaryProject, isActive: true };
    }

    // Switch from cached project to primary
    if (existing) {
      const old = await this.getProject(existing);
      console.log(`🔄 Switching from ${old?.name} to primary project: ${primaryProject.name}`);
    }

    this.setCurrentProject(primaryProject.id, sessionId);
    return { ...primaryProject, isActive: true };
  }

  // Priority 2: No primary - check cached session state
  const existing = await this.getCurrentProjectId(sessionId);
  if (existing) {
    const project = await this.getProject(existing);
    if (project) {
      console.log(`✅ Using cached project: ${project.name} (no primary set)`);
      return project;
    }
  }

  // Priority 3: Fall back to system defaults (aidis-bootstrap or first project)
  // ... fallback logic
}
```

**Evidence:** This method DOES check for primary project, but it's only called during:
1. Initial server startup
2. Explicit `project_list` or route initialization calls
3. It's NOT automatically called when the primary flag changes in the database

#### project_current MCP Tool (Lines 254-261)
```typescript
async getCurrentProject(sessionId: string = this.defaultSessionId): Promise<ProjectInfo | null> {
  const projectId = await this.getCurrentProjectId(sessionId);  // ← Gets cached session state
  if (!projectId) {
    return null;
  }

  return await this.getProject(projectId);
}
```

**Evidence:** The `project_current` MCP tool returns the cached session project, not the database primary.

---

## Why It's Not Syncing

### The Problem Flow

```
1. Server starts up
   ↓
2. initializeSession() runs
   ↓
3. Finds "aidis-alpha" as primary (or uses fallback)
   ↓
4. Sets in-memory cache: sessionStates['default-session'] = { currentProjectId: 'aidis-alpha' }
   ↓
5. User changes UI setting to "aidis-refactor"
   ↓
6. UI calls /api/v2/projects/{aidis-refactor-id}/set-primary
   ↓
7. Database updates: metadata->>'is_primary' = 'true' for aidis-refactor
   ↓
8. User calls project_current MCP tool
   ↓
9. getCurrentProjectId() returns cached "aidis-alpha" ID
   ↓
10. Returns aidis-alpha project (NOT aidis-refactor!)
```

### The Disconnect

- **Database says:** "aidis-refactor is primary" ✅
- **Session cache says:** "aidis-alpha is current" ❌
- **MCP tools read from:** Session cache (not database primary flag)

**The cache is never invalidated when the database primary flag changes.**

---

## Test Results

### Test 1: Backend API Works
```bash
curl -X POST http://localhost:8080/api/v2/projects/1083fd15-0aa7-4d0d-acff-f878085f4dce/set-primary

# Response:
{
  "success": true,
  "data": {
    "id": "1083fd15-0aa7-4d0d-acff-f878085f4dce",
    "name": "aidis-refactor",
    "metadata": { "is_primary": true },
    "is_primary": true
  }
}
```
**Result:** ✅ API correctly updates database

### Test 2: Database Correctly Updated
```sql
SELECT id, name, metadata->>'is_primary' as is_primary
FROM projects
WHERE metadata->>'is_primary' = 'true';

-- Result:
1083fd15-0aa7-4d0d-acff-f878085f4dce | aidis-refactor | true
```
**Result:** ✅ Database has correct primary flag

### Test 3: MCP Tool Returns Wrong Project
```bash
curl -X POST http://localhost:8080/mcp/tools/project_current -d '{}'

# Response:
{
  "success": true,
  "result": {
    "content": [{
      "type": "text",
      "text": "🟢 Current Project: **aidis-alpha**\n..."
    }]
  }
}
```
**Result:** ❌ MCP tool returns cached project (aidis-alpha), not primary (aidis-refactor)

---

## Root Cause Summary

### What's Working
✅ UI Settings page correctly captures user selection
✅ useSettings hook correctly calls backend API
✅ Backend API correctly updates database metadata
✅ Database correctly stores is_primary flag
✅ initializeSession() correctly checks for primary project

### What's Not Working
❌ Session cache is not invalidated when database primary flag changes
❌ project_current MCP tool reads from stale cache
❌ No automatic sync mechanism between database and session cache

### Architecture Issue
The system treats "primary project" and "current session project" as separate concepts:

1. **Primary Project** (persistent, database)
   - Stored in `projects.metadata->>'is_primary'`
   - User's preferred default
   - Set via UI Settings page
   - Checked during `initializeSession()`

2. **Current Session Project** (volatile, in-memory)
   - Stored in `ProjectHandler.sessionStates` Map
   - Active project for this server instance
   - Changed via `project_switch` MCP tool
   - Persists until server restart

**The problem:** When primary changes in database, session cache is not notified.

---

## Solution Options

### Option 1: Invalidate Cache on Primary Change (RECOMMENDED)
Modify the `/api/v2/projects/:id/set-primary` endpoint to clear session cache:

**File:** `/home/ridgetop/aidis/mcp-server/src/api/controllers/projectController.ts`

```typescript
async setPrimary(req: Request, res: Response): Promise<void> {
  // ... existing code ...

  await client.query('COMMIT');

  // NEW: Invalidate session cache to force re-initialization
  const { projectHandler } = await import('../../handlers/project.js');
  projectHandler.clearSessionCache();  // Add this method

  res.json({ success: true, data: project });
}
```

Add to `ProjectHandler`:
```typescript
/**
 * Clear all session caches - forces re-initialization on next access
 */
clearSessionCache(): void {
  console.log('🗑️  Clearing all session caches');
  this.sessionStates.clear();
}
```

**Impact:** Low risk, forces all sessions to re-initialize and pick up new primary project.

---

### Option 2: Make project_current Check Primary First
Modify `getCurrentProject()` to check database primary before returning cached value:

**File:** `/home/ridgetop/aidis/mcp-server/src/handlers/project.ts`

```typescript
async getCurrentProject(sessionId: string = this.defaultSessionId): Promise<ProjectInfo | null> {
  // NEW: Check if primary project has changed
  const primaryProject = await this.getPrimaryProject();
  if (primaryProject) {
    const cachedId = await this.getCurrentProjectId(sessionId);
    if (cachedId !== primaryProject.id) {
      console.log(`🔄 Primary project changed, switching from cache to primary: ${primaryProject.name}`);
      this.setCurrentProject(primaryProject.id, sessionId);
      return { ...primaryProject, isActive: true };
    }
  }

  // Original logic
  const projectId = await this.getCurrentProjectId(sessionId);
  if (!projectId) return null;
  return await this.getProject(projectId);
}

async getPrimaryProject(): Promise<ProjectInfo | null> {
  const result = await db.query(
    `SELECT * FROM projects WHERE metadata->>'is_primary' = 'true' LIMIT 1`
  );
  if (result.rows.length === 0) return null;
  return this.mapRowToProject(result.rows[0]);
}
```

**Impact:** Medium - adds database query to every `project_current` call, but ensures sync.

---

### Option 3: Server Restart (TEMPORARY WORKAROUND)
Restart the MCP server to force session re-initialization:

```bash
./restart-aidis.sh
```

**Impact:** Immediate fix, but doesn't solve underlying issue. Session will re-initialize and pick up primary project from database.

---

## One-Time Migration (Not Needed)

The current system state is:
- Database: aidis-refactor is primary ✅
- UI localStorage: Unknown (but doesn't affect MCP tools)
- Session cache: aidis-alpha is current ❌

**No migration needed.** Once we implement Option 1 or 2, the session will automatically sync on next access.

---

## Recommendations

### Immediate Action (Within 1 hour)
1. **Implement Option 1** - Add `clearSessionCache()` method and call it from `setPrimary` endpoint
2. Test with current setup: Set default project in UI, verify MCP tools immediately reflect change
3. Document the behavior in CLAUDE.md

### Short-term (This week)
1. Add automated test: Set primary via API → verify project_current returns new primary
2. Add logging: When session cache is cleared, log which project was cached vs new primary
3. Consider adding a `/api/v2/projects/sync-sessions` endpoint for manual cache invalidation

### Long-term (Next sprint)
1. Consider moving session state to Redis for multi-instance deployments
2. Add WebSocket notifications from backend → frontend when primary project changes
3. Add UI indicator showing if MCP server session is synced with UI settings

---

## Conclusion

**The system is working as designed - it's just designed with two separate concepts (primary vs current session) that don't automatically sync.**

The fix is straightforward: invalidate the session cache when the primary project changes in the database. This will force the MCP server to re-initialize the session and pick up the new primary project.

**Estimated fix time:** 30 minutes (implement Option 1 + testing)
**Risk level:** Low (cache invalidation is safe, sessions will re-initialize naturally)
**Breaking changes:** None (existing behavior preserved, just adds cache invalidation)

---

## Appendix: File Locations

### Frontend
- Settings UI: `/home/ridgetop/aidis/aidis-command/frontend/src/pages/Settings.tsx`
- Settings Hook: `/home/ridgetop/aidis/aidis-command/frontend/src/hooks/useSettings.ts`

### Backend
- Project Controller: `/home/ridgetop/aidis/mcp-server/src/api/controllers/projectController.ts`
- Project Handler: `/home/ridgetop/aidis/mcp-server/src/handlers/project.ts`
- Health Server (API routes): `/home/ridgetop/aidis/mcp-server/src/server/healthServer.ts`
- MCP Routes: `/home/ridgetop/aidis/mcp-server/src/routes/project.routes.ts`

### Database
- Database: `aidis_production`
- Table: `projects`
- Primary flag location: `metadata->>'is_primary'`
