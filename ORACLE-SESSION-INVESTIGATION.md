# ORACLE SESSION INVESTIGATION REPORT
**Date**: 2025-09-28  
**Project**: aidis-alpha  
**Oracle**: Comprehensive session management system investigation  

## EXECUTIVE SUMMARY

Investigation of AIDIS session system across MCP server, backend APIs, database, and UI components.

**Status per scope item:**
- ✅ Session creation (MCP connection → session created): **WORKING**
- ✅ Project assignment (at session start): **WORKING**, with persistence
- ⚠️ Session naming (change/update session names): **PARTIALLY IMPLEMENTED** (tool exists in MCP; backend UI endpoint missing)
- ⚠️ Stats tracking (visible in AIDIS Command UI): **PARTIAL GAPS** (web sessions only; AI/MCP sessions excluded from most analytics)
- ⚠️ Agent assignment (assign sessions to AI agents or web users): **PARTIALLY IMPLEMENTED** (DB + MCP tool present; no UI/HTTP endpoint)
- ❌ Agent verification ("Amp" exists?): **NOT GUARANTEED** (no auto-registration; requires check and possibly one-time/boot-time registration)

## DETAILED FINDINGS

### 1) Session Creation Flow (MCP connection → session creation)
**Status**: ✅ WORKING

- MCP server auto-creates a session on startup.
  - **Evidence**: `mcp-server/src/server.ts` (start()):
    - Lines 4528–4533: calls `SessionTracker.startSession(currentProject?.id)` after DB init; logs success.
- Additional safeguards: if later operations occur with no active session, code auto-starts new session.
  - **Evidence**: `SessionAnalyticsHandler.recordOperation()` (`mcp-server/src/handlers/sessionAnalytics.ts`, lines 415–424) calls `SessionTracker.startSession` when needed.

**Conclusion**: A session is created when the MCP server starts (equivalent to the "MCP connects" lifecycle). This is working.

### 2) Project Assignment Logic at Session Start
**Status**: ✅ WORKING

- A current project is resolved and attached at session start.
  - **Evidence**: `mcp-server/src/server.ts` (lines 4530–4533) retrieves current project via `projectHandler.getCurrentProject()`, then passes projectId into `SessionTracker.startSession`.
  - `SessionTracker.resolveProjectForSession()` (`mcp-server/src/services/sessionTracker.ts`, lines ~469–570) resolves project using TS010 hierarchy: current project → primary project → "aidis-bootstrap" → create personal project → emergency fallback.
- Project-to-session persistence across restarts:
  - **Evidence**: `session_project_mappings` persistence table created and used by ProjectHandler, with unique(session_id), created_at/updated_at, and indexes. See `mcp-server/src/handlers/project.ts`:
    - `ensureSessionPersistenceTable()` lines 51–80
    - `saveSessionProject()` lines 85–105
    - `getSessionProject()` lines 108–134
    - `initializeSession()` lines 451–482

**Conclusion**: New sessions are assigned to a current project, and mappings persist across restarts. This is working.

### 3) Session Naming (change/update session names)
**Status**: ⚠️ PARTIALLY IMPLEMENTED

- MCP tool exists and is implemented:
  - **Tools**: `session_update` and `session_new` are registered.
    - **Evidence**: `mcp-server/src/server.ts` tool list lines 1490–1524.
  - **Handlers**:
    - `handleSessionUpdate()` (server.ts lines 4854–4919) updates title/description via `SessionManagementHandler.updateSessionDetails()` (`mcp-server/src/handlers/sessionAnalytics.ts` lines 705–844), which writes to sessions table and logs an event.
    - `handleSessionNew()` (server.ts lines 4836–4849) can create a new session with title and optional project.
- **AIDIS Command UI backend endpoint for renaming is missing**:
  - Frontend expects `PUT /sessions/:id` (`ProjectApi.updateSession`) to update titles/descriptions (`aidis-command/frontend/src/services/projectApi.ts` lines 243–254).
  - Backend SessionController does NOT implement `PUT /sessions/:id`; `routes/sessions.ts` lacks such route (only GET analytics/list/stats and POST /assign).
- UI can read current session:
  - AIDIS Command backend `SessionController.getCurrentSession` proxies MCP `session_status` via MCPIntegrationService (`aidis-command/backend/src/controllers/session.ts` lines 183–223), parsing the emoji/text output (fragile, but working for now).

**Conclusion**: The core capability exists via MCP tools, but UI-level update (`PUT /sessions/:id`) is missing. This is the main gap for session naming.

### 4) Stats Tracking (tracked and visible in AIDIS Command UI)
**Status**: ⚠️ PARTIAL GAPS

- Backend analytics exist and are functional, but most metrics **ONLY consider web sessions** (`user_sessions`), excluding AI/MCP sessions (`sessions`).
  - **Evidence**: `aidis-command/backend/src/services/sessionAnalytics.ts`:
    - `getSessionAnalytics()` queries `user_sessions` (lines 63–80).
    - `getSessionTrends()` queries `user_sessions` (lines 126–131).
    - `getProductiveSessions()` queries `user_sessions` (lines 187–207).
    - `getTokenUsagePatterns()`, `getSessionsList()`, `getSessionStats()` query `user_sessions`.
  - Only `getSessionSummaries()` in SessionDetailService merges `user_sessions` and `sessions` via UNION (`aidis-command/backend/src/services/sessionDetail.ts` lines 297–369).
- MCP server has its own session analytics based on `analytics_events` via SessionTracker and SessionAnalyticsHandler; not exposed via AIDIS Command UI.
  - **Evidence**: `mcp-server/src/services/sessionTracker.ts`, `mcp-server/src/handlers/sessionAnalytics.ts`.

**Impact**: The AIDIS Command dashboard and sessions analytics will not reflect AI/MCP sessions today (except for the summaries endpoint). This is why UI "stats" don't show MCP activity.

**Conclusion**: Stats tracking is partially implemented. AI sessions are largely excluded from most UI analytics endpoints. Needs unification.

### 5) Agent Assignment System (sessions assignable to agents or web users)
**Status**: ⚠️ PARTIALLY IMPLEMENTED

- Database tables exist and are healthy:
  - `agents`, `agent_sessions`, `agent_tasks`, `agent_messages`, `agent_collaborations` (`mcp-server/database/migrations/005_create_agent_coordination.sql`).
- MCP server exposes agent registration and assignment (join/leave session):
  - `handleAgentRegister()` (server.ts lines 3601–3620) → `agentsHandler.registerAgent()`
  - `handleAgentJoin()` (server.ts lines 4000–4036) → `agentsHandler.joinProject(agentId, sessionId, projectId)`
- **AIDIS Command backend has agent CRUD and task APIs** (`aidis-command/backend/src/services/agent.ts` + routes/controllers) but **NO endpoint to join/leave an agent to the current session**. Therefore, you can list agents and tasks in UI, but you cannot assign the current session to an agent via UI without calling the MCP tool path.
- Web users operate through `user_sessions` (`aidis-command/backend/src/services/session.ts`) for web session lifecycle; this is separate from agent sessions.

**Conclusion**: Agent system is present. Join/assignment works via MCP tool path, but there is no UI/backend bridge to assign an agent to the current MCP session. This is a missing UI/backend bridge.

### 6) Agent Verification ("Amp" agent)
**Status**: ❌ NOT GUARANTEED

- No evidence of auto-registration for "Amp" or "Claude-Code" agents on startup. `sessions.agent_type` is set to `'claude-code-agent'` for the MCP session record, but that doesn't register an agent in the agents table.
  - **Evidence**: `SessionTracker.startSession()` sets `agent_type='claude-code-agent'` in sessions insert (`mcp-server/src/services/sessionTracker.ts` lines 67–89).
  - `handleAgentRegister` exists but isn't called automatically on boot.
- We need to actively register Amp if we expect it in the agents table.

**Conclusion**: "Amp" likely does not exist by default. You can confirm via `GET /agents`, then register if missing.

## DATABASE SCHEMA VERIFICATION (key tables used)

- **Agent sessions and agents**: `mcp-server/database/migrations/005_create_agent_coordination.sql`
- **MCP sessions and contexts**: `mcp-server/database/migrations/002_create_contexts_and_sessions.sql`
- **Project-session persistence**: `session_project_mappings` created by ProjectHandler (`mcp-server/src/handlers/project.ts`)
- **Web sessions**: `user_sessions` used by AIDIS Command (`aidis-command/backend/src/services/session.ts`, `sessionAnalytics.ts`, `sessionDetail.ts`). Not accompanied by a visible migration here, but existing code expects these to be present.

## APIs AND UI COMPONENTS TOUCHED

### MCP tools (server.ts)
- `session_status`, `session_new`, `session_update`, `session_assign`
- `project_list`/`project_current`/`project_switch`
- `agent_register`, `agent_join`/`agent_leave` (handlers present)

### AIDIS Command backend sessions routes (aidis-command/backend/src/routes/sessions.ts)
- Provides GET analytics/list/stats endpoints, `GET /sessions/current` (no auth), and `POST /sessions/assign`. **Missing `PUT /sessions/:id`**.

### Frontend services:
- `sessionRecovery.ts` regularly calls `ProjectApi.getCurrentSession()` which hits `GET /sessions/current` (works).
- `projectApi.ts` defines `updateSession(sessionId, updates)` → `PUT /sessions/:id`, but backend lacks this route.

## ACTIONABLE IMPLEMENTATION PLAN (minimal, focused)

### Priority 1: Enable session naming/renaming from UI
- Add `PUT /sessions/:id` to aidis-command backend
  - **Controller method** `SessionController.updateSession(req, res)`:
    - Validate body `{ title?: string, description?: string }`.
    - Call MCP tool `session_update` via `McpService.callTool('session_update', { sessionId: id, title, description })`.
    - On success, return updated fields.
  - **Add route** in `aidis-command/backend/src/routes/sessions.ts`:
    - `router.put('/:id', authenticateToken, SessionController.updateSession)`.
  - This reuses MCP's existing logic and logs events; avoids duplication and keeps consistent behavior.
- Optional hardening: have a fallback direct DB update if MCP tool fails, but prefer the tool to ensure analytics/events.

### Priority 2: Show accurate session analytics in AIDIS Command UI
- Extend analytics queries to include AI/MCP sessions (`sessions` table) alongside `user_sessions`:
  - `aidis-command/backend/src/services/sessionAnalytics.ts`: For
    - `getSessionAnalytics`
    - `getSessionTrends`
    - `getProductiveSessions`
    - `getTokenUsagePatterns`
    - `getSessionsList`
    - `getSessionStats`
  - Use `UNION ALL` to incorporate `sessions` table similarly to how `SessionDetailService.getSessionSummaries` already merges both (lines 297–369). For counts of contexts, `LEFT JOIN contexts c ON c.session_id = sessions.id` (MCP session id is UUID).
  - This will make MCP session activity visible on the dashboard and sessions pages without creating parallel code paths.
- Keep existing `user_sessions` logic to support web sessions; unify via UNION-based CTEs.

### Priority 3: Expose agent-session assignment to UI
- Add backend endpoint to call MCP `agent_join`:
  - `POST /agents/:id/join-session`
    - Body: `{ sessionId?: string, projectId?: string }` (default to current: via MCPIntegrationService.getCurrentSession, or ProjectHandler current project)
    - Implementation: call `McpService.callTool('agent_join', { agentId: id | name, sessionId, projectId })`
  - Add `POST /agents/:id/leave-session` similarly calling MCP tool `agent_leave`.
- Add simple UI action (button) to "Assign agent to current session" using the above endpoints.

### Priority 4: Ensure "Amp" agent presence
- On MCP server startup, check/create agent entries:
  - In `mcp-server/src/server.ts` `start()` after DB init, call `agentsHandler.registerAgent('Amp', 'ai_assistant', ...)` and optionally 'Claude-Code' if that agent is a separate logical actor you want listed in agents table.
  - This is idempotent; `registerAgent` updates if exists.
- Alternatively, provide a one-time script or admin UI call to `POST /agents` (AIDIS Command backend already supports agent creation) with `name: 'Amp'`.

### Priority 5: Reduce fragility of MCP → UI session parsing
- `MCPIntegrationService.getCurrentSession` parses emoji/text from `session_status`; this is brittle.
  - Near-term: ensure `session_status` formatting remains stable.
  - Medium-term: add a JSON-returning tool (e.g., `session_details`) and have MCPIntegrationService use that for robust parsing. `session_details` already exists; switch `GET /sessions/current` to call `session_details` for the current/active session, or add a dedicated `session_status_json` tool.

## VALIDATION CHECKLIST AFTER FIXES

- Start MCP server → observe DB sessions row inserted with project_id set (server.ts logs).
- `GET /sessions/current` returns a session with title/description (if set) and correct project.
- `PUT /sessions/:id` updates title, verify via `GET /sessions/current` (and via MCP `session_details`).
- Dashboard/session analytics in UI show MCP sessions (ensure updated queries).
- `POST /agents/:id/join-session` successfully inserts/updates `agent_sessions` linking agent to the session/project; visible from `GET /agents/:id/sessions`.
- `GET /agents` confirms 'Amp' is present; if not, register it (via MCP `agent_register` or backend `/agents`).

## WHAT'S ALREADY WORKING

- Automatic session creation and project assignment at MCP server startup.
- Session assignment to project from UI: `POST /sessions/assign` calls MCP `session_assign` then `project_switch` (`aidis-command/backend/src/controllers/session.ts` lines 228–266).
- Current session detection in UI via `GET /sessions/current` (parses MCP `session_status`).
- Agent infrastructure and CRUD in both DB and backends.

## WHAT'S MISSING/BROKEN

- Missing `PUT /sessions/:id` in AIDIS Command backend for session renaming.
- Analytics endpoints in AIDIS Command exclude AI/MCP sessions (`sessions` table) and only cover `user_sessions`.
- No UI/backend bridge to assign agents to the current session (must go through MCP tool).
- "Amp" agent not auto-registered.

## EFFORT/IMPACT ESTIMATE

- `PUT /sessions/:id` (backend + small UI wire-up): **low effort, high user impact**.
- Analytics UNION updates to include sessions table: **medium effort, high impact** (unlocks visibility for AI activity).
- Agent join/leave endpoints: **low-medium effort, medium impact** (enables operational workflows).
- Auto-register Amp on startup: **very low effort, medium impact** (consistency).

---
**Report Generated**: 2025-09-28T01:45:00Z  
**Investigation Method**: Oracle comprehensive analysis  
**Scope**: End-to-end session lifecycle, no mock data  
**Validation**: Real database, API, and UI component analysis
