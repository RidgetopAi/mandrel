# MCP Project Selection Persistence Investigation - COMPLETE ANALYSIS

**Investigation Date:** 2025-01-27  
**Issue:** MCP project selection doesn't persist across server restarts  
**Status:** ROOT CAUSE IDENTIFIED ✅

## EXECUTIVE SUMMARY

**ROOT CAUSE FOUND:** MCP server uses **in-memory only** session state storage that doesn't persist across restarts, while UI uses **persistent localStorage** storage.

**The Missing Link:** MCP server lacks persistent storage for session-to-project mappings.

---

## 1. PROJECT PERSISTENCE MECHANISM ANALYSIS

### MCP Server Storage (THE PROBLEM)
**File:** `/home/ridgetop/aidis/mcp-server/src/handlers/project.ts` (Lines 44-46)

```typescript
export class ProjectHandler {
  // ❌ IN-MEMORY ONLY - LOST ON RESTART
  private sessionStates = new Map<string, SessionState>();
  private defaultSessionId = 'default-session';
```

**Critical Finding:** Session-to-project mappings are stored in a JavaScript `Map()` object in memory only.

### UI Project Persistence (WORKS CORRECTLY) 
**File:** `/home/ridgetop/aidis/aidis-command/frontend/src/contexts/ProjectContext.tsx` (Lines 36-41)

```typescript
// ✅ PERSISTENT STORAGE - SURVIVES REFRESH
useEffect(() => {
  if (currentProject) {
    localStorage.setItem('aidis_current_project', JSON.stringify(currentProject));
  } else {
    localStorage.removeItem('aidis_current_project');
  }
}, [currentProject]);
```

**UI Strategy:** Uses `localStorage` for persistent client-side storage.

---

## 2. STARTUP PROJECT SELECTION TRACE

### MCP Server Startup Process
**File:** `/home/ridgetop/aidis/mcp-server/src/handlers/project.ts` (Lines 340-371)

```typescript
async initializeSession(sessionId: string = this.defaultSessionId): Promise<ProjectInfo | null> {
  // ❌ MEMORY CHECK (empty after restart)
  const existing = this.getCurrentProjectId(sessionId);
  if (existing) {
    // This never executes after restart - memory is empty
  }

  // ✅ FALLBACK TO DATABASE - Always executes after restart
  const projects = await this.listProjects(false);
  
  // ❌ HARDCODED DEFAULT - Always defaults to this
  let defaultProject = projects.find(p => p.name === 'aidis-bootstrap');
  if (!defaultProject) {
    defaultProject = projects[0]; // First available
  }

  this.setCurrentProject(defaultProject.id, sessionId); // ❌ In-memory only
  return { ...defaultProject, isActive: true };
}
```

**The Issue:** After restart, memory is empty, so `existing` is always `null`, forcing fallback to hardcoded "aidis-bootstrap".

### Database Default Project
**File:** `/home/ridgetop/aidis/mcp-server/database/migrations/001_create_projects_table.sql` (Lines 46-54)

```sql
-- ❌ HARDCODED DEFAULT PROJECT CREATION
INSERT INTO projects (name, description, git_repo_url, root_directory, metadata) 
VALUES (
    'aidis-bootstrap', 
    'The AIDIS project itself - bootstrapping the AI Development Intelligence System',
    'https://github.com/your-username/aidis',
    '/home/ridgetop/aidis',
    '{"phase": "foundation", "tools": ["postgresql", "typescript", "mcp"], "learning_project": true}'::jsonb
) ON CONFLICT (name) DO NOTHING;
```

**Confirmed:** "aidis-bootstrap" is hardcoded as the system default.

---

## 3. COMPARISON: UI vs MCP PERSISTENCE

| Aspect | UI (Works) | MCP Server (Broken) |
|--------|------------|---------------------|
| **Storage Type** | localStorage | In-memory Map |
| **Survives Restart** | ✅ Yes | ❌ No |
| **Persistence Method** | Browser localStorage | None |
| **Recovery Strategy** | Read from localStorage + MCP sync | Hardcoded fallback |
| **Storage Location** | Client browser | Server memory |

### UI Success Example (Persistence)
```typescript
// 1. Save to localStorage on change
localStorage.setItem('aidis_current_project', JSON.stringify(currentProject));

// 2. Restore on app load
const stored = localStorage.getItem('aidis_current_project');
if (stored) {
  const project = JSON.parse(stored);
  setCurrentProject(project);
}

// 3. Sync with MCP server
await fetch('/api/sessions/assign', {
  method: 'POST',
  body: JSON.stringify({ projectName: project.name })
});
```

### MCP Server Failure (No Persistence)
```typescript
// ❌ NO PERSISTENT STORAGE
private sessionStates = new Map<string, SessionState>(); // Lost on restart

// ❌ NO RECOVERY FROM DATABASE
// ❌ NO ATTEMPT TO RESTORE LAST SELECTED PROJECT
// ❌ ALWAYS DEFAULTS TO "aidis-bootstrap"
```

---

## 4. THE MISSING PERSISTENCE LAYER

### What MCP Server SHOULD Have (but doesn't)

1. **Database Table for Session State**
```sql
CREATE TABLE session_project_mappings (
  session_id VARCHAR(255) PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

2. **Persistent Storage Methods**
```typescript
// Save to database when project changes
async setCurrentProject(projectId: string, sessionId: string): Promise<void> {
  // ❌ Missing: Save to database
  await db.query('INSERT INTO session_project_mappings (session_id, project_id) VALUES ($1, $2) ON CONFLICT (session_id) DO UPDATE SET project_id = $2, updated_at = NOW()', [sessionId, projectId]);
}

// Restore from database on startup
async getCurrentProjectId(sessionId: string): Promise<string | null> {
  // ❌ Missing: Check database first
  const result = await db.query('SELECT project_id FROM session_project_mappings WHERE session_id = $1', [sessionId]);
  return result.rows[0]?.project_id || null;
}
```

3. **Server Restart Recovery Logic**
```typescript
async initializeSession(sessionId: string): Promise<ProjectInfo | null> {
  // ✅ Should check database first (not just memory)
  const persistentProjectId = await this.getPersistedProjectId(sessionId);
  if (persistentProjectId) {
    return await this.getProject(persistentProjectId);
  }
  // Only then fall back to defaults
}
```

---

## 5. IDENTIFICATION OF ROOT CAUSE

### The Problem Is Architectural

**Design Flaw:** MCP server treats session state as ephemeral (in-memory only), while UI treats it as persistent (localStorage).

**Missing Component:** MCP server lacks a persistent storage layer for session-to-project mappings.

**Why It Happens:**
1. MCP server starts
2. Memory is empty (no session-to-project mappings)
3. `initializeSession()` always hits the fallback path
4. Hardcoded default "aidis-bootstrap" is selected
5. User's previous project selection is lost

### Comparison with UI Strategy

**UI Approach (Works):**
- Save project selection to localStorage immediately
- Restore from localStorage on page load
- Sync with MCP server afterward
- Multiple persistence layers (localStorage + API sync)

**MCP Approach (Broken):**
- Store project selection in memory only
- No persistence mechanism
- No recovery from previous state
- Single failure point (memory loss)

---

## 6. RECOMMENDED SOLUTION APPROACH

### Option 1: Database Persistence (Recommended)
**Implementation:**
1. Create `session_project_mappings` table
2. Modify `ProjectHandler.setCurrentProject()` to save to database
3. Modify `ProjectHandler.getCurrentProjectId()` to check database first
4. Add migration for existing sessions

**Pros:**
- Truly persistent across server restarts
- Consistent with database-first architecture
- Handles multiple sessions properly

### Option 2: File-Based Persistence
**Implementation:**
1. Save session state to JSON file
2. Read file on server startup
3. Fall back to in-memory if file corrupted

**Pros:**
- Simple implementation
- No database changes needed

**Cons:**
- File I/O overhead
- Concurrent access issues
- Less robust than database

### Option 3: Session Recovery from UI
**Implementation:**
1. UI automatically calls `project_switch` on load
2. Restore MCP state from localStorage
3. No server-side persistence needed

**Pros:**
- Minimal server changes
- Leverages existing UI persistence

**Cons:**
- Relies on UI to restore state
- Breaks when accessed via non-UI clients

---

## 7. CONFIGURATION AND CODE CHANGES NEEDED

### Required Changes for Database Solution

1. **Database Migration** (new file)
```sql
-- Create persistent session state table
CREATE TABLE session_project_mappings (
    session_id VARCHAR(255) PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

2. **ProjectHandler Updates** (`src/handlers/project.ts`)
```typescript
// Replace in-memory Map with database-backed storage
async setCurrentProject(projectId: string, sessionId: string): Promise<void> {
    await db.query(
        `INSERT INTO session_project_mappings (session_id, project_id) 
         VALUES ($1, $2) 
         ON CONFLICT (session_id) 
         DO UPDATE SET project_id = $2, updated_at = NOW()`,
        [sessionId, projectId]
    );
    
    // Keep in-memory cache for performance
    this.sessionStates.set(sessionId, { currentProjectId: projectId });
}

async getCurrentProjectId(sessionId: string): Promise<string | null> {
    // Check memory cache first
    const cached = this.sessionStates.get(sessionId);
    if (cached?.currentProjectId) {
        return cached.currentProjectId;
    }
    
    // Check database
    const result = await db.query(
        'SELECT project_id FROM session_project_mappings WHERE session_id = $1',
        [sessionId]
    );
    
    if (result.rows.length > 0) {
        const projectId = result.rows[0].project_id;
        // Cache for performance
        this.sessionStates.set(sessionId, { currentProjectId: projectId });
        return projectId;
    }
    
    return null;
}
```

3. **Server Startup Enhancement** 
```typescript
// On server start, populate memory cache from database
async initializeFromDatabase(): Promise<void> {
    const sessions = await db.query('SELECT session_id, project_id FROM session_project_mappings');
    for (const row of sessions.rows) {
        this.sessionStates.set(row.session_id, { currentProjectId: row.project_id });
    }
}
```

---

## 8. COMPLETE FINDINGS SUMMARY

### Exact Reason Restart Loses Project Selection
**ROOT CAUSE:** MCP server stores session-to-project mappings in JavaScript `Map()` objects that exist only in memory and are lost when the process restarts.

### Is This By Design or Missing Feature?
**ANSWER:** Missing feature. The architecture has a fundamental gap between:
- UI persistence strategy (localStorage)  
- MCP server persistence strategy (none)

### Configuration or Code Changes Needed
**REQUIRED:** Code changes to implement persistent storage for session state in MCP server.

**MINIMAL SOLUTION:** Add database table + update ProjectHandler to persist/restore from database.

**OPTIMAL SOLUTION:** Database persistence + memory caching + migration for existing data + cleanup of stale sessions.

---

## 9. SUCCESS CRITERIA VERIFICATION ✅

✅ **Complete understanding** of why restart persistence fails  
✅ **Root cause identified:** In-memory only storage in MCP server  
✅ **Missing link found:** No persistent storage layer for session state  
✅ **Solution approach recommended:** Database-backed persistence  
✅ **Code changes documented:** Specific files and implementation details  

**Investigation Status:** COMPLETE  
**Next Step:** Choose solution approach and implement persistent storage layer
