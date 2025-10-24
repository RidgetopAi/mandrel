# REST API Architecture Investigation Report
## Session Tools Migration: MCP → REST API

**Date:** 2025-10-05
**Investigator:** Claude Code
**Scope:** Migrate 8 session analytics tools from MCP to REST API
**Goal:** Reduce AI context tokens and enable automation

---

## Executive Summary

This investigation reveals that AIDIS already has Express.js REST infrastructure via `/v2/mcp/tools/*` endpoints (port 8080). The migration is **straightforward** - we can add 8 new session analytics REST endpoints to the existing V2 API router without creating new server infrastructure.

**Key Finding:** No need to create new Express server or HTTP bridge - we extend the existing `/src/api/v2/mcpRoutes.ts` system.

---

## 1. CURRENT ARCHITECTURE SUMMARY

### Express Server Status
✅ **Express is ALREADY configured** via V2 MCP Router
- **Location:** `/home/ridgetop/aidis/mcp-server/src/api/v2/mcpRoutes.ts`
- **Port:** 8080 (via `AIDIS_HTTP_PORT` or default 8080)
- **Pattern:** `/v2/mcp/tools/:toolName` (POST requests)
- **Middleware:** JSON parsing (1MB limit), CORS, validation, logging

### Current Server Initialization Flow
```
server.ts (Line 200-2655)
  ├── Class AIDISServer (MCP Server)
  ├── StdioServerTransport (MCP protocol)
  ├── HTTP Health Server (port from env)
  └── V2 MCP REST API Router (/v2/mcp/*)
      └── Express Router with 41 tools
```

### Existing REST Infrastructure
- **File:** `/home/ridgetop/aidis/mcp-server/src/api/v2/mcpRoutes.ts` (391 lines)
- **API Version:** 2.0.0 with compatibility versioning
- **Authentication:** None (localhost only)
- **Error Handling:** Standardized V2McpResponse format
- **Validation:** IngressValidator middleware

### HTTP Bridge Status
- **File:** `/home/ridgetop/aidis/mcp-server/src/utils/httpMcpBridge.ts` (port 8081)
- **Status:** Placeholder implementation, NOT USED for production
- **Conclusion:** Ignore httpMcpBridge.ts - use V2 MCP Router instead

---

## 2. TOOLS TO MIGRATE (8 Total)

### Phase 2 Tracking Tools (5 tools)

#### 1. `session_record_activity`
- **Handler:** `handleSessionRecordActivity` (Line 3140-3156)
- **Service Method:** `SessionManagementHandler.recordSessionActivity(sessionId, activityType, activityData)`
- **Request:** `{ sessionId: string, activityType: string, activityData?: object }`
- **Response:** MCP text content with activity confirmation
- **New Endpoint:** `POST /api/v2/sessions/:sessionId/activities`

#### 2. `session_get_activities`
- **Handler:** `handleSessionGetActivities` (Line 3162-3182)
- **Service Method:** `SessionManagementHandler.getSessionActivitiesHandler(sessionId, activityType?, limit?)`
- **Request:** `{ sessionId: string, activityType?: string, limit?: number }`
- **Response:** MCP text content with formatted activity timeline
- **New Endpoint:** `GET /api/v2/sessions/:sessionId/activities?type=&limit=`

#### 3. `session_record_file_edit`
- **Handler:** `handleSessionRecordFileEdit` (Line 3184-3206)
- **Service Method:** `SessionManagementHandler.recordFileEdit(sessionId, filePath, linesAdded, linesDeleted, source)`
- **Request:** `{ sessionId: string, filePath: string, linesAdded: number, linesDeleted: number, source?: 'tool'|'git'|'manual' }`
- **Response:** MCP text content with LOC summary
- **New Endpoint:** `POST /api/v2/sessions/:sessionId/files`

#### 4. `session_get_files`
- **Handler:** `handleSessionGetFiles` (Line 3208-3226)
- **Service Method:** `SessionManagementHandler.getSessionFilesHandler(sessionId)`
- **Request:** `{ sessionId: string }`
- **Response:** MCP text content with file modification list
- **New Endpoint:** `GET /api/v2/sessions/:sessionId/files`

#### 5. `session_calculate_productivity`
- **Handler:** `handleSessionCalculateProductivity` (Line 3228-3247)
- **Service Method:** `SessionManagementHandler.calculateSessionProductivity(sessionId, configName?)`
- **Request:** `{ sessionId: string, configName?: string }`
- **Response:** MCP text content with productivity score
- **New Endpoint:** `POST /api/v2/sessions/:sessionId/productivity`

### Phase 3 Analytics Tools (3 tools)

#### 6. `sessions_list`
- **Handler:** `handleSessionsList` (Line 3249-3375)
- **Service Method:** Direct DB query to `v_session_summaries` view
- **Request:** Complex filtering (projectId, dateFrom, dateTo, tags, status, agentType, hasGoal, minProductivity, sortBy, sortOrder, limit, offset)
- **Response:** Formatted session list with pagination
- **New Endpoint:** `GET /api/v2/sessions?projectId=&dateFrom=&dateTo=...`

#### 7. `sessions_stats`
- **Handler:** `handleSessionsStats` (Line 3377-3415)
- **Service Method:** `SessionTracker.getSessionStatsEnhanced(options)`
- **Request:** `{ projectId?: string, period?: 'day'|'week'|'month'|'all', groupBy?: 'project'|'agent'|'tag'|'none', phase2Only?: boolean }`
- **Response:** Aggregate statistics with grouping and time-series data
- **New Endpoint:** `GET /api/v2/sessions/stats?projectId=&period=&groupBy=&phase2Only=`

#### 8. `sessions_compare`
- **Handler:** `handleSessionsCompare` (Line 3417-3478)
- **Service Method:** Direct DB query to `v_session_summaries` view, uses `formatSessionComparison()`
- **Request:** `{ sessionId1: string, sessionId2: string }`
- **Response:** Side-by-side comparison with metrics diff
- **New Endpoint:** `GET /api/v2/sessions/compare?sessionId1=&sessionId2=`

---

## 3. AUTOMATION HOOK POINTS

### Required: Auto-track session activities when MCP tools are called

#### Hook 1: `context_store` (Line 1141-1173)
- **Handler:** `handleContextStore`
- **Service:** `contextHandler.storeContext(...)`
- **Auto-track:** After successful context creation
- **Code Location:** Line ~1170 (after return statement)
- **Hook Code:**
  ```typescript
  // Get active session
  const activeSessionId = await SessionTracker.getActiveSession();
  if (activeSessionId) {
    await SessionTracker.recordActivity(activeSessionId, 'context_stored', {
      context_id: result.id,
      context_type: result.contextType,
      tags: result.tags
    });
  }
  ```

#### Hook 2: `task_create` (Line 1967-2010)
- **Handler:** `handleTaskCreate`
- **Service:** `tasksHandler.createTask(...)`
- **Auto-track:** After successful task creation
- **Code Location:** Line ~2008 (after return statement)
- **Hook Code:**
  ```typescript
  const activeSessionId = await SessionTracker.getActiveSession();
  if (activeSessionId) {
    await SessionTracker.recordActivity(activeSessionId, 'task_created', {
      task_id: task.id,
      task_title: task.title,
      task_type: task.type,
      task_priority: task.priority
    });
  }
  ```

#### Hook 3: `decision_record` (Line 1751-1801)
- **Handler:** `handleDecisionRecord` (exact line to be confirmed)
- **Service:** `decisionsHandler.recordDecision(...)`
- **Auto-track:** After successful decision recording
- **Hook Code:**
  ```typescript
  const activeSessionId = await SessionTracker.getActiveSession();
  if (activeSessionId) {
    await SessionTracker.recordActivity(activeSessionId, 'decision_recorded', {
      decision_id: result.id,
      decision_type: result.type,
      impact_level: result.impactLevel
    });
  }
  ```

#### Hook 4: `naming_register` (Line 1579-1637)
- **Handler:** `handleNamingRegister` (exact line to be confirmed)
- **Service:** `namingHandler.registerName(...)`
- **Auto-track:** After successful naming registration
- **Hook Code:**
  ```typescript
  const activeSessionId = await SessionTracker.getActiveSession();
  if (activeSessionId) {
    await SessionTracker.recordActivity(activeSessionId, 'naming_registered', {
      entity_type: result.entityType,
      canonical_name: result.canonicalName
    });
  }
  ```

### Edit/Write Tool Tracking Challenge
**Problem:** Edit and Write are Claude Code built-in tools, not AIDIS MCP tools
**Solution Options:**
1. **Git-based tracking** - Use existing `gitTracker.ts` service to detect file changes
2. **File system watcher** - Add fs.watch() for session file tracking
3. **Manual tracking** - Require explicit `session_record_file_edit` calls
4. **Hybrid approach** - Git tracker + manual tool tracking

**Recommendation:** Use Git tracker for automated LOC detection since it's already implemented in `/home/ridgetop/aidis/mcp-server/src/services/gitTracker.ts`

---

## 4. PROPOSED REST API ARCHITECTURE

### Clean Structure
```
src/api/
├── v2/
│   ├── mcpRoutes.ts (existing - 391 lines)
│   └── sessionRoutes.ts (NEW - all 8 session analytics endpoints)
├── controllers/
│   └── sessionAnalyticsController.ts (NEW - extracted handler logic)
└── middleware/
    └── sessionTracking.ts (NEW - automation hooks for MCP tools)
```

### REST Endpoint Specification

#### Session Activity Endpoints (Phase 2D/2E)

**POST /api/v2/sessions/:sessionId/activities**
```json
Request: { "activityType": "context_stored", "activityData": {...} }
Response: {
  "success": true,
  "data": {
    "sessionId": "abc123",
    "activityType": "context_stored",
    "occurredAt": "2025-10-05T..."
  }
}
```

**GET /api/v2/sessions/:sessionId/activities?type=&limit=100**
```json
Response: {
  "success": true,
  "data": {
    "sessionId": "abc123",
    "activities": [
      { "id": 1, "activityType": "...", "activityData": {...}, "occurredAt": "..." }
    ],
    "count": 25
  }
}
```

**POST /api/v2/sessions/:sessionId/files**
```json
Request: {
  "filePath": "/path/to/file.ts",
  "linesAdded": 50,
  "linesDeleted": 10,
  "source": "tool"
}
Response: {
  "success": true,
  "data": {
    "sessionId": "abc123",
    "filePath": "/path/to/file.ts",
    "linesAdded": 50,
    "linesDeleted": 10,
    "netChange": 40
  }
}
```

**GET /api/v2/sessions/:sessionId/files**
```json
Response: {
  "success": true,
  "data": {
    "sessionId": "abc123",
    "files": [
      {
        "filePath": "/path/to/file.ts",
        "linesAdded": 50,
        "linesDeleted": 10,
        "source": "tool",
        "firstModified": "...",
        "lastModified": "..."
      }
    ],
    "totalAdded": 150,
    "totalDeleted": 30,
    "totalNet": 120
  }
}
```

**POST /api/v2/sessions/:sessionId/productivity**
```json
Request: { "configName": "default" }
Response: {
  "success": true,
  "data": {
    "sessionId": "abc123",
    "productivityScore": 87.5,
    "configName": "default",
    "calculatedAt": "..."
  }
}
```

#### Session Analytics Endpoints (Phase 3)

**GET /api/v2/sessions?filters...**
```json
Query Params: projectId, dateFrom, dateTo, tags[], status, agentType, hasGoal, minProductivity, sortBy, sortOrder, limit, offset
Response: {
  "success": true,
  "data": {
    "sessions": [...],
    "totalCount": 150,
    "page": 1,
    "limit": 25,
    "offset": 0
  }
}
```

**GET /api/v2/sessions/stats?filters...**
```json
Query Params: projectId, period, groupBy, phase2Only
Response: {
  "success": true,
  "data": {
    "overall": {
      "totalSessions": 150,
      "avgDuration": 45.5,
      "avgProductivity": 72.3,
      "totalTasksCreated": 500,
      "totalContextsCreated": 1200
    },
    "groups": [...],
    "timeSeries": [...],
    "topTags": ["bug-fix", "feature", "refactor"]
  }
}
```

**GET /api/v2/sessions/compare?sessionId1=&sessionId2=**
```json
Response: {
  "success": true,
  "data": {
    "session1": { "id": "...", "duration": 60, "productivity": 85, ... },
    "session2": { "id": "...", "duration": 45, "productivity": 72, ... },
    "comparison": {
      "durationDiff": 15,
      "productivityDiff": 13,
      "tasksCreatedDiff": 5,
      "winner": "session1"
    }
  }
}
```

### Error Handling Strategy
- **400 Bad Request:** Validation errors (missing required params, invalid types)
- **404 Not Found:** Session not found
- **500 Internal Server Error:** Database errors, unexpected failures
- **Standard Format:**
  ```json
  {
    "success": false,
    "error": "Session not found",
    "details": "Session abc123 does not exist or has been deleted",
    "timestamp": "2025-10-05T..."
  }
  ```

### Authentication/Authorization
- **Current:** None (localhost only, trusted environment)
- **Future Consideration:** API key validation for external access
- **Recommendation:** Keep auth-free for now, add when exposing publicly

---

## 5. FILE-BY-FILE CHANGE PLAN

### File 1: `/home/ridgetop/aidis/mcp-server/src/server.ts` (3529 lines)

**Remove MCP Handlers (Lines 3140-3478):**
```
Line 3140-3156: handleSessionRecordActivity (17 lines)
Line 3162-3182: handleSessionGetActivities (21 lines)
Line 3184-3206: handleSessionRecordFileEdit (23 lines)
Line 3208-3226: handleSessionGetFiles (19 lines)
Line 3228-3247: handleSessionCalculateProductivity (20 lines)
Line 3249-3375: handleSessionsList (127 lines)
Line 3377-3415: handleSessionsStats (39 lines)
Line 3417-3478: handleSessionsCompare (62 lines)
Total: ~328 lines removed
```

**Remove Case Statements (Lines 883-905):**
```
Line 883-884: case 'session_record_activity'
Line 886-887: case 'session_get_activities'
Line 889-890: case 'session_record_file_edit'
Line 892-893: case 'session_get_files'
Line 895-896: case 'session_calculate_productivity'
Line 898-899: case 'sessions_list'
Line 901-902: case 'sessions_stats'
Line 904-905: case 'sessions_compare'
Total: ~24 lines removed
```

**Add Automation Hooks (4 locations):**
```
After Line ~1170 (handleContextStore):
  + 6 lines: SessionTracker.recordActivity for context_stored

After Line ~2008 (handleTaskCreate):
  + 6 lines: SessionTracker.recordActivity for task_created

After Line ~1801 (handleDecisionRecord - estimate):
  + 6 lines: SessionTracker.recordActivity for decision_recorded

After Line ~1637 (handleNamingRegister - estimate):
  + 6 lines: SessionTracker.recordActivity for naming_registered
Total: ~24 lines added
```

**Net Change for server.ts:** -328 lines removed, +24 lines added = **-304 lines**

---

### File 2: `/home/ridgetop/aidis/mcp-server/src/config/toolDefinitions.ts` (1154 lines)

**Remove Tool Definitions (Lines to be confirmed by search):**
```
session_record_activity definition (~40 lines)
session_get_activities definition (~40 lines)
session_record_file_edit definition (~40 lines)
session_get_files definition (~30 lines)
session_calculate_productivity definition (~30 lines)
sessions_list definition (~50 lines)
sessions_stats definition (~40 lines)
sessions_compare definition (~30 lines)
Total: ~300 lines removed
```

**Update Tool Count:**
```
Line 29: export const AIDIS_TOOL_DEFINITIONS: ToolDefinition[] = [
  Change comment: "Complete array of all 41 AIDIS tool definitions"
  → "Complete array of all 33 AIDIS tool definitions"
```

**Net Change for toolDefinitions.ts:** **-300 lines**

---

### File 3: `/home/ridgetop/aidis/mcp-server/src/api/v2/sessionRoutes.ts` (NEW FILE)

**Create:** ~300 lines
```typescript
/**
 * Session Analytics REST API Routes
 * Migrated from MCP to reduce AI context and enable automation
 */

import express from 'express';
import { SessionManagementHandler } from '../../handlers/sessionAnalytics.js';
import { SessionTracker } from '../../services/sessionTracker.js';
import { db } from '../../config/database.js';
import { formatSessionsList, formatSessionStats, formatSessionComparison } from '../../utils/sessionFormatters.js';
import { logger } from '../../utils/logger.js';

export class SessionAnalyticsRouter {
  private router: express.Router;

  constructor() {
    this.router = express.Router();
    this.setupRoutes();
    this.setupMiddleware();
  }

  private setupMiddleware(): void {
    this.router.use(express.json({ limit: '1mb' }));
  }

  private setupRoutes(): void {
    // Phase 2D/2E: Activity Tracking
    this.router.post('/:sessionId/activities', this.recordActivity);
    this.router.get('/:sessionId/activities', this.getActivities);

    // Phase 2D/2E: File Tracking
    this.router.post('/:sessionId/files', this.recordFileEdit);
    this.router.get('/:sessionId/files', this.getFiles);

    // Phase 2D/2E: Productivity
    this.router.post('/:sessionId/productivity', this.calculateProductivity);

    // Phase 3: Analytics
    this.router.get('/', this.listSessions);
    this.router.get('/stats', this.getStats);
    this.router.get('/compare', this.compareSessions);
  }

  // Route handlers (8 methods, ~30 lines each)
  private recordActivity = async (req, res) => { ... };
  private getActivities = async (req, res) => { ... };
  private recordFileEdit = async (req, res) => { ... };
  private getFiles = async (req, res) => { ... };
  private calculateProductivity = async (req, res) => { ... };
  private listSessions = async (req, res) => { ... };
  private getStats = async (req, res) => { ... };
  private compareSessions = async (req, res) => { ... };

  getRouter(): express.Router {
    return this.router;
  }
}

export default SessionAnalyticsRouter;
```

---

### File 4: `/home/ridgetop/aidis/mcp-server/src/api/controllers/sessionAnalyticsController.ts` (NEW FILE)

**Create:** ~200 lines
```typescript
/**
 * Session Analytics Controller
 * Business logic extracted from MCP handlers
 */

import { SessionManagementHandler } from '../../handlers/sessionAnalytics.js';
import { SessionTracker } from '../../services/sessionTracker.js';
import { db } from '../../config/database.js';

export class SessionAnalyticsController {
  // 8 static methods corresponding to 8 endpoints
  static async recordActivity(sessionId: string, activityType: string, activityData: any) { ... }
  static async getActivities(sessionId: string, activityType?: string, limit?: number) { ... }
  static async recordFileEdit(sessionId: string, filePath: string, linesAdded: number, linesDeleted: number, source: string) { ... }
  static async getFiles(sessionId: string) { ... }
  static async calculateProductivity(sessionId: string, configName?: string) { ... }
  static async listSessions(filters: any) { ... }
  static async getStats(options: any) { ... }
  static async compareSessions(sessionId1: string, sessionId2: string) { ... }
}
```

---

### File 5: `/home/ridgetop/aidis/mcp-server/src/middleware/sessionTracking.ts` (NEW FILE)

**Create:** ~100 lines
```typescript
/**
 * Session Tracking Middleware
 * Automatically records session activities for MCP tool calls
 */

import { SessionTracker } from '../services/sessionTracker.js';
import { logger } from '../utils/logger.js';

export class SessionTrackingMiddleware {
  /**
   * Auto-track context creation
   */
  static async trackContextStored(contextId: string, contextType: string, tags: string[]): Promise<void> {
    const activeSessionId = await SessionTracker.getActiveSession();
    if (!activeSessionId) return;

    await SessionTracker.recordActivity(activeSessionId, 'context_stored', {
      context_id: contextId,
      context_type: contextType,
      tags
    });
  }

  /**
   * Auto-track task creation
   */
  static async trackTaskCreated(taskId: string, taskTitle: string, taskType: string, taskPriority: string): Promise<void> {
    const activeSessionId = await SessionTracker.getActiveSession();
    if (!activeSessionId) return;

    await SessionTracker.recordActivity(activeSessionId, 'task_created', {
      task_id: taskId,
      task_title: taskTitle,
      task_type: taskType,
      task_priority: taskPriority
    });
  }

  /**
   * Auto-track decision recording
   */
  static async trackDecisionRecorded(decisionId: string, decisionType: string, impactLevel: string): Promise<void> {
    const activeSessionId = await SessionTracker.getActiveSession();
    if (!activeSessionId) return;

    await SessionTracker.recordActivity(activeSessionId, 'decision_recorded', {
      decision_id: decisionId,
      decision_type: decisionType,
      impact_level: impactLevel
    });
  }

  /**
   * Auto-track naming registration
   */
  static async trackNamingRegistered(entityType: string, canonicalName: string): Promise<void> {
    const activeSessionId = await SessionTracker.getActiveSession();
    if (!activeSessionId) return;

    await SessionTracker.recordActivity(activeSessionId, 'naming_registered', {
      entity_type: entityType,
      canonical_name: canonicalName
    });
  }
}
```

---

### File 6: `/home/ridgetop/aidis/mcp-server/src/api/v2/mcpRoutes.ts` (MODIFY - 391 lines)

**Add Session Router Integration:**
```typescript
// After line 16:
import { SessionAnalyticsRouter } from './sessionRoutes.js';

// In constructor() after line 53:
private sessionRouter: SessionAnalyticsRouter;

// In constructor() after setupMiddleware():
this.sessionRouter = new SessionAnalyticsRouter();

// Add method to get session router:
getSessionRouter(): express.Router {
  return this.sessionRouter.getRouter();
}
```

**Net Change for mcpRoutes.ts:** **+10 lines**

---

### File 7: `/home/ridgetop/aidis/mcp-server/src/services/healthCheck.ts` (MODIFY)

**Add REST endpoint registration:**
```typescript
// Register session analytics REST endpoints in health check
'/api/v2/sessions' endpoints (8 total)
```

---

### Summary of Changes

| File | Action | Lines Changed |
|------|--------|---------------|
| `src/server.ts` | Remove handlers + case statements, add hooks | -304 |
| `src/config/toolDefinitions.ts` | Remove 8 tool definitions | -300 |
| `src/api/v2/sessionRoutes.ts` | Create new file | +300 |
| `src/api/controllers/sessionAnalyticsController.ts` | Create new file | +200 |
| `src/middleware/sessionTracking.ts` | Create new file | +100 |
| `src/api/v2/mcpRoutes.ts` | Add session router integration | +10 |
| **TOTAL** | | **-294 lines** |

**Net Result:** ~294 lines removed from codebase while adding clean REST API architecture

---

## 6. RISK ASSESSMENT

### Backward Compatibility Concerns

**CRITICAL: MCP tools will be completely removed**
- ✅ **Low Risk** - These are analytics/tracking tools, not core functionality
- ✅ **Low Risk** - No existing automations depend on these MCP tools
- ⚠️ **Medium Risk** - Any external scripts calling these MCP tools will break
- ✅ **Mitigation** - Provide REST API equivalents before removing MCP tools

**Recommendation:** Implement REST endpoints first, then deprecate MCP tools in phases:
1. Phase 1: Add REST endpoints (no breaking changes)
2. Phase 2: Log warnings when MCP tools are used (deprecation notice)
3. Phase 3: Remove MCP tools after 2-week grace period

### Database Migration Needs

**Assessment:** ✅ **No database changes required**
- All database tables already exist (`session_activities`, `session_files`, `productivity_config`, `v_session_summaries`)
- SessionTracker service methods work with existing schema
- No new columns or indexes needed

### Testing Requirements

#### Unit Tests Required
1. **Controller tests** - 8 controller methods
2. **Router tests** - 8 REST endpoints
3. **Middleware tests** - 4 auto-tracking functions

#### Integration Tests Required
1. **End-to-end API tests** - All 8 REST endpoints
2. **Automation tests** - Verify hooks trigger correctly
3. **Session lifecycle tests** - Full session tracking flow

#### Manual Testing Checklist
- [ ] POST /api/v2/sessions/:id/activities - Record activity
- [ ] GET /api/v2/sessions/:id/activities - List activities
- [ ] POST /api/v2/sessions/:id/files - Record file edit
- [ ] GET /api/v2/sessions/:id/files - List files
- [ ] POST /api/v2/sessions/:id/productivity - Calculate score
- [ ] GET /api/v2/sessions - List sessions with filters
- [ ] GET /api/v2/sessions/stats - Aggregate statistics
- [ ] GET /api/v2/sessions/compare - Compare two sessions
- [ ] Auto-tracking: context_store → activity recorded
- [ ] Auto-tracking: task_create → activity recorded
- [ ] Auto-tracking: decision_record → activity recorded
- [ ] Auto-tracking: naming_register → activity recorded

---

## 7. IMPLEMENTATION ROADMAP

### Phase 1: Foundation (1 day)
- [ ] Create `src/api/controllers/sessionAnalyticsController.ts`
- [ ] Create `src/middleware/sessionTracking.ts`
- [ ] Write unit tests for controller and middleware
- [ ] Code review and approval

### Phase 2: REST API Router (1 day)
- [ ] Create `src/api/v2/sessionRoutes.ts` with 8 endpoints
- [ ] Integrate session router into V2 MCP router
- [ ] Write integration tests for all 8 endpoints
- [ ] Test with curl/Postman

### Phase 3: Automation Hooks (1 day)
- [ ] Add SessionTrackingMiddleware calls to 4 MCP handlers
- [ ] Test auto-tracking for context, task, decision, naming
- [ ] Verify session activities are recorded correctly
- [ ] Load testing for hook performance

### Phase 4: MCP Tool Deprecation (1 day)
- [ ] Add deprecation warnings to 8 MCP tool handlers
- [ ] Update CLAUDE.md documentation with new REST endpoints
- [ ] Create migration guide for any external consumers
- [ ] Monitor usage logs for 2 weeks

### Phase 5: Cleanup (1 day)
- [ ] Remove 8 MCP handlers from server.ts
- [ ] Remove 8 tool definitions from toolDefinitions.ts
- [ ] Update tool count in documentation (41 → 33 tools)
- [ ] Final testing and production deployment

**Total Estimated Time:** 5 days

---

## 8. AUTOMATION STRATEGY DETAIL

### Git-Based File Tracking (Recommended)

**Existing Service:** `/home/ridgetop/aidis/mcp-server/src/services/gitTracker.ts`

**How It Works:**
1. Git tracker monitors repository for file changes
2. On commit detected, extract LOC changes per file
3. Call `SessionTracker.recordFileModification()` for each file
4. Aggregate LOC changes at session level

**Advantages:**
- ✅ Accurate LOC tracking from actual commits
- ✅ No manual intervention required
- ✅ Works retroactively on existing sessions
- ✅ Captures all file changes, including non-tool edits

**Disadvantages:**
- ⚠️ Requires git repository (fails for non-git projects)
- ⚠️ LOC only recorded after commit (not real-time)
- ⚠️ Doesn't track uncommitted changes

### Hybrid Approach (Ideal)

**Combination:**
1. **Primary:** Git tracker for committed changes
2. **Fallback:** Manual `session_record_file_edit` REST endpoint for real-time tracking
3. **Future:** File system watcher for non-git projects

**Implementation:**
```typescript
// In gitTracker.ts service:
async function onCommitDetected(commitData: any) {
  const activeSessionId = await SessionTracker.getActiveSession();
  if (!activeSessionId) return;

  // Extract file changes from commit
  const fileChanges = parseGitDiff(commitData);

  // Record each file modification
  for (const file of fileChanges) {
    await SessionTracker.recordFileModification(
      activeSessionId,
      file.path,
      file.linesAdded,
      file.linesDeleted,
      'git' // source
    );
  }
}
```

---

## 9. ADDITIONAL FINDINGS

### Express Dependencies
✅ **Already installed** - No new dependencies required
- `express`: ^5.0.3 (devDependencies: @types/express)
- `cors`: ^2.8.19 (devDependencies: @types/cors)

### Port Configuration
- **Health Server:** `process.env.AIDIS_HEALTH_PORT || 8080` (Line 52 in core-server.ts)
- **MCP HTTP Bridge:** `process.env.AIDIS_HTTP_PORT || 8080` (httpMcpBridge.ts - unused)
- **V2 MCP Router:** Uses Health Server port (shared Express instance)

**Recommendation:** Continue using port 8080 for all REST endpoints

### Session Analytics Handler
**File:** `/home/ridgetop/aidis/mcp-server/src/handlers/sessionAnalytics.ts` (1360 lines)
- ✅ Already contains `SessionManagementHandler` with all needed methods
- ✅ Can reuse existing methods in new REST controller
- ✅ No need to rewrite business logic

### Session Formatters
**File:** `/home/ridgetop/aidis/mcp-server/src/utils/sessionFormatters.ts`
- ✅ Already has `formatSessionsList()`, `formatSessionStats()`, `formatSessionComparison()`
- ⚠️ **Adaptation Needed:** These format MCP text responses, REST needs JSON
- **Solution:** Extract core formatting logic, create separate JSON formatters

---

## 10. RECOMMENDED NEXT STEPS

### Immediate Actions
1. ✅ **Approve this investigation report**
2. ✅ **Create GitHub issue/task for migration**
3. ✅ **Schedule Phase 1 implementation (2 days)**

### Implementation Priorities
1. **High Priority:** Create REST endpoints (Phases 1-2)
2. **Medium Priority:** Add automation hooks (Phase 3)
3. **Low Priority:** Remove MCP tools (Phases 4-5)

### Questions for Partner Review
1. **Deprecation Timeline:** 2 weeks acceptable? Or immediate removal?
2. **Authentication:** Add API key validation now or later?
3. **Git Tracker:** Enable automatic file tracking by default?
4. **Monitoring:** Add Prometheus metrics for REST endpoints?

---

## APPENDICES

### A. Complete Handler Locations

| Tool Name | Handler Method | Line Number | Service Method |
|-----------|---------------|-------------|----------------|
| session_record_activity | handleSessionRecordActivity | 3140-3156 | SessionManagementHandler.recordSessionActivity |
| session_get_activities | handleSessionGetActivities | 3162-3182 | SessionManagementHandler.getSessionActivitiesHandler |
| session_record_file_edit | handleSessionRecordFileEdit | 3184-3206 | SessionManagementHandler.recordFileEdit |
| session_get_files | handleSessionGetFiles | 3208-3226 | SessionManagementHandler.getSessionFilesHandler |
| session_calculate_productivity | handleSessionCalculateProductivity | 3228-3247 | SessionManagementHandler.calculateSessionProductivity |
| sessions_list | handleSessionsList | 3249-3375 | Direct DB query + formatSessionsList |
| sessions_stats | handleSessionsStats | 3377-3415 | SessionTracker.getSessionStatsEnhanced |
| sessions_compare | handleSessionsCompare | 3417-3478 | Direct DB query + formatSessionComparison |

### B. Case Statement Locations

| Tool Name | Case Statement Line |
|-----------|-------------------|
| session_record_activity | 883-884 |
| session_get_activities | 886-887 |
| session_record_file_edit | 889-890 |
| session_get_files | 892-893 |
| session_calculate_productivity | 895-896 |
| sessions_list | 898-899 |
| sessions_stats | 901-902 |
| sessions_compare | 904-905 |

### C. Service Dependencies

| Service | File Path | Status |
|---------|-----------|--------|
| SessionTracker | /src/services/sessionTracker.ts | ✅ Operational |
| SessionManagementHandler | /src/handlers/sessionAnalytics.ts | ✅ Operational |
| Database (db) | /src/config/database.ts | ✅ Operational |
| Git Tracker | /src/services/gitTracker.ts | ✅ Operational |
| Session Formatters | /src/utils/sessionFormatters.ts | ✅ Operational |

### D. Database Views

| View Name | Purpose | Status |
|-----------|---------|--------|
| v_session_summaries | Session list with aggregates | ✅ Exists |
| sessions | Base table | ✅ Exists |
| session_activities | Activity timeline | ✅ Exists |
| session_files | File modifications | ✅ Exists |
| productivity_config | Productivity formulas | ✅ Exists |

---

**End of Report**

**Generated:** 2025-10-05
**Investigator:** Claude Code
**Status:** Ready for Implementation
**Estimated LOE:** 5 days
**Token Savings:** ~6,000 tokens (8 tool definitions × 750 tokens average)
