# AIDIS Sessions - Comprehensive Implementation Plan

**Date:** 2025-10-05
**Branch:** aidis-alpha
**Current Sessions:** 86 total (22 active, 64 inactive)
**Documents Analyzed:**
- Investigation Report: SESSIONS_ARCHITECTURE_INVESTIGATION_REPORT.md
- Partner Vision: mcp-server/session-tracking-action-plan.md

---

## Executive Summary

### The Situation
**What We Have:** A working session tracking system (SessionTracker + SessionTimeout) that successfully tracks 86 sessions, with automatic 2-hour timeouts and project assignment.

**What Partner Wants:** Enhanced session tracking with productivity metrics (LOC, tasks, decisions, context), session goals, tags, AI model tracking, detailed reporting, and timeline views.

**The Spaghetti:** 6 files (2,674 lines) of dead/fake/dormant code that needs cleanup.

**The Good News:** ~60% of what partner wants already exists! The core infrastructure is solid.

### Recommendation
**Incremental enhancement approach:** Clean up spaghetti first, then enhance existing working code with missing features. Low risk, high value.

**Success Metrics:**
- Delete 2,674 lines of dead code
- Add LOC tracking, session goals, tags
- Create session_activities and session_files tables
- Build reporting and analytics views
- **All while preserving the 86 existing sessions!**

---

## Section 1: What We Have (The Good)

### Working Features ✅

#### 1. Session Lifecycle (SessionTracker.ts - 966 lines)
**Location:** `/home/ridgetop/aidis/mcp-server/src/services/sessionTracker.ts`

**What Works:**
- ✅ Auto-start sessions on MCP connect
- ✅ UUID-based session identification
- ✅ Session start/end with database persistence
- ✅ Active session detection (memory + DB fallback)
- ✅ Session metadata (title, description)
- ✅ Agent type auto-detection (claude-code, cline, etc.)

**Database Integration:**
- Writes to `sessions` table
- Logs to `analytics_events` table
- Tracks 86 sessions successfully

#### 2. Project Assignment (SessionTracker - TS010 hierarchy)
**What Works:**
- ✅ Smart project resolution (current → primary → default → create fallback)
- ✅ Manual project assignment via `session_assign` MCP tool
- ✅ Project foreign key constraints
- ✅ Auto-assignment on session start

**Partner Wants:** Same thing! ✅ ALREADY HAVE IT

#### 3. Automatic 2-Hour Timeout (SessionTimeout.ts - 167 lines)
**Location:** `/home/ridgetop/aidis/mcp-server/src/services/sessionTimeout.ts`

**What Works:**
- ✅ Runs every 5 minutes
- ✅ Database function `timeout_inactive_sessions()`
- ✅ Marks sessions inactive after 2 hours of no activity
- ✅ Updates status + ended_at timestamp
- ✅ Clean logging (only logs when timeouts occur)

**Partner Wants:** Same thing! ✅ ALREADY HAVE IT

#### 4. Token Tracking (TS006-2 - In-Memory)
**What Works:**
- ✅ In-memory token tracking (input/output/total)
- ✅ Batched writes on session end (performance optimization)
- ✅ Database columns: `input_tokens`, `output_tokens`, `total_tokens` (BIGINT)
- ✅ `SessionTracker.recordTokenUsage()` method

**Partner Wants:** Same thing! ✅ ALREADY HAVE IT

#### 5. Activity Tracking (TS007-2 - Partial)
**What Works:**
- ✅ In-memory activity tracking (tasks_created, tasks_updated, tasks_completed, contexts_created)
- ✅ Database columns exist in `sessions` table
- ✅ `SessionTracker.recordTaskCreated()`, `recordTaskUpdated()`, `recordContextCreated()` methods
- ✅ Batched writes on session end

**Partner Wants:** More granular tracking with timeline + file tracking

#### 6. Session Status & Reporting (SessionManagementHandler)
**What Works:**
- ✅ `session_status` MCP tool - shows current session details
- ✅ Returns: id, project_name, duration, tokens, tasks, contexts, decisions
- ✅ Joins to projects, contexts, technical_decisions tables
- ✅ Displays active session information

**Partner Wants:** More detailed reports + historical statistics

#### 7. Database Schema (Solid Foundation)
**Current `sessions` Table (27 columns):**
```
✅ id (UUID)
✅ project_id (UUID FK → projects)
✅ agent_type (VARCHAR)
✅ started_at (TIMESTAMP)
✅ ended_at (TIMESTAMP)
✅ status (enum: active/inactive/disconnected)
✅ last_activity_at (TIMESTAMP) -- for timeout tracking
✅ title (VARCHAR 255)
✅ description (TEXT)
✅ input_tokens (BIGINT)
✅ output_tokens (BIGINT)
✅ total_tokens (BIGINT)
✅ tasks_created (INT)
✅ tasks_updated (INT)
✅ tasks_completed (INT)
✅ contexts_created (INT)
✅ metadata (JSONB) -- flexible storage
✅ display_id (VARCHAR 20 UNIQUE) -- human-readable ID
✅ agent_display_name (VARCHAR 100)
... and 8 more columns
```

**16 indexes for performance**
**Foreign key to projects table**
**Check constraints for data integrity**

### What's Already Tracked
| Feature | Status | Evidence |
|---------|--------|----------|
| Project assignment | ✅ Working | 86 sessions have project_id |
| Tasks created/completed | ✅ Working | Columns exist + tracking methods |
| Context items added | ✅ Working | contexts_created column + tracking |
| Decisions made | ✅ Tracked | JOIN to technical_decisions table |
| Token usage | ✅ Working | input/output/total columns |
| Session duration | ✅ Calculated | started_at → ended_at |
| Agent type | ✅ Detected | claude-code, cline auto-detected |
| 2-hour timeout | ✅ Working | SessionTimeout runs every 5 min |

---

## Section 2: What We're Deleting (The Spaghetti)

### Files to Delete (6 files, 2,674 lines)

#### DELETE #1: unifiedSessionManager.ts (586 lines) 🗑️
**Location:** `/home/ridgetop/aidis/mcp-server/src/services/unifiedSessionManager.ts`

**Why Delete:**
- 🚨 Returns FAKE data (id: 'v2-' + Date.now(), no DB writes)
- 🚨 All V2/legacy methods are placeholders
- 🚨 Only imported by other dead code (sessionMigrationManager)
- ⚠️ Circular dependency with sessionRouter
- ⚠️ No real implementation, just infrastructure skeleton

**Impact:** ZERO - Not used in production

**Lines Saved:** 586

#### DELETE #2: sessionRouter.ts (409 lines) 🗑️
**Location:** `/home/ridgetop/aidis/mcp-server/src/services/sessionRouter.ts`

**Why Delete:**
- 🚨 NOT used in production (server.ts calls SessionManagementHandler directly)
- 🚨 Legacy methods return FAKE data
- 🚨 Traffic split = 0 (V2 never used)
- ⚠️ Only imported by unifiedSessionManager and sessionMonitoring (both dead)
- ⚠️ Confusing architecture ("V2" is real, "legacy" is fake - backwards!)

**Impact:** ZERO - Routing layer not in use

**Lines Saved:** 409

#### DELETE #3: sessionMonitoring.ts (455 lines) 🗑️
**Location:** `/home/ridgetop/aidis/mcp-server/src/services/sessionMonitoring.ts`

**Why Delete:**
- 🚨 NEVER STARTED (not imported anywhere)
- 🚨 Monitors sessionRouter which isn't used
- 🚨 Would alert on V2=0, but V2 is disabled by design
- ⚠️ Auto-rollback writes to config file (dangerous, no backup)
- ⚠️ Monitoring infrastructure for feature that never shipped

**Impact:** ZERO - Dormant code

**Lines Saved:** 455

#### DELETE #4: sessionManager.ts (43 lines) 🗑️
**Location:** `/home/ridgetop/aidis/mcp-server/src/services/sessionManager.ts`

**Why Delete:**
- 🚨 UNUSED - No imports found in codebase
- 🚨 INCORRECT LOGIC - getCurrentSession returns wrong session (ORDER BY updated_at vs ended_at IS NULL)
- 🚨 DUPLICATE - SessionTracker.getActiveSession() already does this correctly

**Impact:** ZERO - Never imported

**Lines Saved:** 43

#### ARCHIVE #5: sessionMigrator.ts (561 lines) 📦
**Location:** `/home/ridgetop/aidis/mcp-server/src/services/sessionMigrator.ts`

**Why Archive (Not Delete):**
- ✅ Well-written code with good safety (backup, rollback, transactions)
- ✅ Mission accomplished: 2 backup tables exist (migration already run)
- ⚠️ One-time migration tool, not ongoing service
- ⚠️ Not imported or called by any production code
- ℹ️ New sessions get project_id via TS010 (no more orphans)

**Recommendation:** Move to `/archive/migrations/` folder for historical reference

**Lines Saved:** 561 (but kept in archive)

#### ARCHIVE #6: sessionMigrationManager.ts (640 lines) 📦
**Location:** `/home/ridgetop/aidis/mcp-server/src/services/sessionMigrationManager.ts`

**Why Archive:**
- 🚨 FAKE implementations (dual-write returns placeholder data)
- 🚨 WRONG TABLE (tries to migrate user_sessions auth to sessions development work)
- 🚨 NOT IMPORTED - Nobody calls this code
- ⚠️ Depends on UnifiedSessionManager (fake data)
- ⚠️ Different from sessionMigrator.ts (which was real)

**Recommendation:** Move to `/archive/failed-experiments/` folder

**Lines Saved:** 640 (but kept in archive)

### Total Cleanup Impact
- **Delete:** 4 files, 1,493 lines (unifiedSessionManager, sessionRouter, sessionMonitoring, sessionManager)
- **Archive:** 2 files, 1,201 lines (sessionMigrator, sessionMigrationManager)
- **Total Removed from Production:** 2,694 lines
- **TypeScript errors eliminated:** 0 (these files compile but don't work)
- **Dependencies broken:** 0 (only depend on each other)

---

## Section 3: What We're Building (The New)

### Missing Features Analysis

| Partner Requirement | Status | Implementation Need |
|---------------------|--------|---------------------|
| Auto-assign project | ✅ HAVE | None - TS010 hierarchy works |
| Track tasks (created/completed/in-progress/todo) | 🟡 PARTIAL | Add tasks_in_progress and tasks_todo columns |
| Track context items | ✅ HAVE | None - contexts_created works |
| Track decisions | ✅ HAVE | None - JOIN to technical_decisions |
| Track tokens | ✅ HAVE | None - input/output/total columns exist |
| **Track LOC (added/removed/net)** | ❌ NEED | **NEW: Add columns + git diff integration** |
| 2-hour auto-timeout | ✅ HAVE | None - SessionTimeout works perfectly |
| **Session goals** | ❌ NEED | **NEW: Add session_goals column (TEXT)** |
| **Session notes** | 🟡 PARTIAL | description exists, add session_notes column |
| **Tags** | ❌ NEED | **NEW: Add tags column (TEXT[])** |
| AI model tracking | 🟡 PARTIAL | agent_type exists, enhance with ai_model VARCHAR |
| **Productivity score** | ❌ NEED | **NEW: Add productivity_score DECIMAL + calculation** |
| **Session activities timeline** | ❌ NEED | **NEW: Create session_activities table** |
| **File tracking** | ❌ NEED | **NEW: Create session_files table** |
| **Session reports** | 🟡 PARTIAL | session_status exists, enhance with summary |
| **Session statistics** | ❌ NEED | **NEW: Aggregate queries + views** |
| Duration tracking | ✅ HAVE | None - calculated from started_at/ended_at |
| MCP connection ID | 🟡 PARTIAL | Can add mcp_connection_id column |

### Features to Build

#### Build #1: LOC Tracking (Git Integration)
**Goal:** Track lines of code added/removed per session

**Database Changes:**
```sql
ALTER TABLE sessions
  ADD COLUMN loc_added INTEGER DEFAULT 0,
  ADD COLUMN loc_removed INTEGER DEFAULT 0,
  ADD COLUMN net_loc INTEGER GENERATED ALWAYS AS (loc_added - loc_removed) STORED;

CREATE INDEX idx_sessions_loc ON sessions(loc_added, loc_removed);
```

**Code Changes:**
- Add method to SessionTracker: `calculateGitLOC(sessionId, sinceTimestamp)`
- Use git diff --numstat to count changes
- Call on `endSession()` before finalizing
- Handle cases where no git repo exists (return 0s)

**Complexity:** MEDIUM (git integration + error handling)

#### Build #2: Session Goals & Tags
**Goal:** Let users set session goals and tag sessions

**Database Changes:**
```sql
ALTER TABLE sessions
  ADD COLUMN session_goals TEXT,
  ADD COLUMN session_notes TEXT,
  ADD COLUMN tags TEXT[] DEFAULT '{}';

CREATE INDEX idx_sessions_tags ON sessions USING GIN(tags);
CREATE INDEX idx_sessions_goals ON sessions(session_goals) WHERE session_goals IS NOT NULL;
```

**Code Changes:**
- Add method: `SessionTracker.updateSessionGoals(sessionId, goals, notes?, tags?)`
- Add MCP tool: `session_set_goal` (projectName, goal, tags)
- Add MCP tool: `session_add_tag` (tag)
- Integrate into session start (optional prompt for goal)

**Complexity:** EASY (simple column additions + methods)

#### Build #3: Enhanced Task Tracking
**Goal:** Track full task lifecycle (todo → in_progress → completed)

**Database Changes:**
```sql
ALTER TABLE sessions
  ADD COLUMN tasks_in_progress INTEGER DEFAULT 0,
  ADD COLUMN tasks_todo INTEGER DEFAULT 0;

-- Update existing sessions
UPDATE sessions SET tasks_in_progress = 0, tasks_todo = 0 WHERE tasks_in_progress IS NULL;
```

**Code Changes:**
- Enhance `SessionTracker.recordTaskUpdated()` to track status transitions
- Update in-memory tracking Map to include in_progress and todo counts
- Integrate with existing task system

**Complexity:** EASY (extend existing pattern)

#### Build #4: Session Activities Timeline
**Goal:** Track detailed activity timeline during session

**Database Schema:**
```sql
CREATE TABLE session_activities (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,

  -- Activity details
  activity_type VARCHAR(50) NOT NULL,
    -- task_created, task_completed, context_added, decision_made, file_modified, etc
  activity_description TEXT,

  -- Related entities
  task_id INTEGER REFERENCES tasks(id),
  context_id UUID REFERENCES contexts(id),
  decision_id UUID REFERENCES technical_decisions(id),

  -- Activity metadata
  file_path TEXT,
  ai_interaction BOOLEAN DEFAULT false,

  -- Timing
  occurred_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_session_activities_session ON session_activities(session_id);
CREATE INDEX idx_session_activities_type ON session_activities(activity_type);
CREATE INDEX idx_session_activities_occurred ON session_activities(occurred_at DESC);
```

**Code Changes:**
- Create `SessionActivityTracker` class
- Add method: `recordActivity(sessionId, type, description, metadata)`
- Integrate with existing tracking methods:
  - `recordTaskCreated()` → call `recordActivity('task_created', ...)`
  - `recordContextCreated()` → call `recordActivity('context_added', ...)`
- Add MCP tool: `session_timeline` (shows recent activities)

**Complexity:** MEDIUM (new table + integration points)

#### Build #5: Session File Tracking
**Goal:** Track which files were worked on during session

**Database Schema:**
```sql
CREATE TABLE session_files (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,

  -- File details
  file_path TEXT NOT NULL,

  -- Metrics per file
  times_modified INTEGER DEFAULT 1,
  loc_added INTEGER DEFAULT 0,
  loc_removed INTEGER DEFAULT 0,

  -- File mentions (for @file context tracking)
  mentioned_in_context INTEGER DEFAULT 0,

  -- Timing
  first_modified_at TIMESTAMP DEFAULT NOW(),
  last_modified_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(session_id, file_path)
);

CREATE INDEX idx_session_files_session ON session_files(session_id);
CREATE INDEX idx_session_files_path ON session_files(file_path);
```

**Code Changes:**
- Create `SessionFileTracker` class
- Add method: `trackFileModification(sessionId, filePath, locAdded, locRemoved)`
- Add method: `trackFileMention(sessionId, filePath)` (for @file in context)
- Integrate with Read/Write/Edit tool wrappers
- Add to session summary report

**Complexity:** MEDIUM (new table + tool integration)

#### Build #6: Productivity Scoring Algorithm
**Goal:** Calculate meaningful productivity score (0-100)

**Database Changes:**
```sql
ALTER TABLE sessions
  ADD COLUMN productivity_score DECIMAL(5,2);

CREATE INDEX idx_sessions_productivity ON sessions(productivity_score) WHERE productivity_score IS NOT NULL;
```

**Code Changes:**
- Implement partner's formula from action plan:
  ```typescript
  function calculateProductivityScore(session) {
    let score = 0;

    // Task completion (40 points max)
    const completionRate = session.tasks_completed / (session.tasks_created || 1);
    score += completionRate * 40;

    // Decision making (15 points max)
    score += Math.min(session.decisions_made * 3, 15);

    // Context building (15 points max)
    score += Math.min(session.contexts_created * 2, 15);

    // Code output (20 points max)
    const netLOC = session.loc_added - session.loc_removed;
    if (netLOC > 0 && netLOC < 500) score += 20;
    else if (netLOC >= 500 && netLOC < 1000) score += 15;
    else if (netLOC >= 1000) score += 5;
    else if (netLOC < 0 && netLOC > -200) score += 15; // refactoring

    // Duration bonus (10 points max)
    const hours = session.duration_minutes / 60;
    if (hours >= 1 && hours <= 3) score += 10;
    else if (hours > 3) score += 5;

    return Math.min(100, Math.max(0, score));
  }
  ```
- Call on `endSession()`
- Add to session reports

**Complexity:** EASY (pure calculation)

#### Build #7: Session Reporting & Analytics
**Goal:** Comprehensive session summaries and statistics

**Code Changes:**
- Enhance `SessionTracker.getSessionData()` to include all new fields
- Add method: `generateSessionSummary(sessionId)`
  - Formatted report with all metrics
  - Timeline highlights
  - Top files worked on
  - Productivity score with emoji
- Add method: `getSessionStats(projectId?, period?)`
  - Aggregate statistics (total sessions, avg duration, avg productivity, etc.)
  - Group by day/week/month
  - Top tags, most productive times
- Add MCP tools:
  - `session_summary` (detailed report)
  - `sessions_stats` (aggregate statistics)
  - `sessions_list` (filtered list)

**Complexity:** MEDIUM (complex queries + formatting)

---

## Section 4: Database Migration Strategy

### Current Schema Assessment

**Existing Columns We Keep:**
```
✅ id, project_id, agent_type, started_at, ended_at
✅ status, last_activity_at
✅ title, description
✅ input_tokens, output_tokens, total_tokens
✅ tasks_created, tasks_updated, tasks_completed, contexts_created
✅ metadata (JSONB - super flexible!)
✅ display_id, agent_display_name
```

**Columns We Add:**
```
🆕 session_goals (TEXT)
🆕 session_notes (TEXT)
🆕 tags (TEXT[])
🆕 loc_added (INTEGER)
🆕 loc_removed (INTEGER)
🆕 net_loc (INTEGER GENERATED)
🆕 productivity_score (DECIMAL(5,2))
🆕 tasks_in_progress (INTEGER)
🆕 tasks_todo (INTEGER)
🆕 mcp_connection_id (TEXT) -- optional
🆕 ai_model (VARCHAR(100)) -- optional, more specific than agent_type
🆕 ai_provider (VARCHAR(50)) -- optional, default 'anthropic'
🆕 duration_minutes (INTEGER) -- calculated on end, easier than timestamps
```

**New Tables We Create:**
```
🆕 session_activities (timeline tracking)
🆕 session_files (file modification tracking)
```

### Migration SQL Script

**File:** `/mcp-server/database/migrations/030_enhance_sessions_tracking.sql`

```sql
-- Migration: Enhance Sessions Tracking
-- Date: 2025-10-05
-- Purpose: Add partner-requested features to sessions system

-- Step 1: Add new columns to sessions table
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS session_goals TEXT,
  ADD COLUMN IF NOT EXISTS session_notes TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS loc_added INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loc_removed INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS productivity_score DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS tasks_in_progress INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tasks_todo INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mcp_connection_id TEXT,
  ADD COLUMN IF NOT EXISTS ai_model VARCHAR(100),
  ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(50) DEFAULT 'anthropic',
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

-- Step 2: Add generated column for net LOC
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS net_loc INTEGER
    GENERATED ALWAYS AS (loc_added - loc_removed) STORED;

-- Step 3: Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_sessions_tags ON sessions USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_sessions_goals ON sessions(session_goals)
  WHERE session_goals IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_productivity ON sessions(productivity_score)
  WHERE productivity_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_loc ON sessions(loc_added, loc_removed);
CREATE INDEX IF NOT EXISTS idx_sessions_duration ON sessions(duration_minutes)
  WHERE duration_minutes IS NOT NULL;

-- Step 4: Create session_activities table
CREATE TABLE IF NOT EXISTS session_activities (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,

  activity_type VARCHAR(50) NOT NULL,
  activity_description TEXT,

  task_id INTEGER REFERENCES tasks(id),
  context_id UUID REFERENCES contexts(id),
  decision_id UUID REFERENCES technical_decisions(id),

  file_path TEXT,
  ai_interaction BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,

  occurred_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_activities_session
  ON session_activities(session_id);
CREATE INDEX IF NOT EXISTS idx_session_activities_type
  ON session_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_session_activities_occurred
  ON session_activities(occurred_at DESC);

-- Step 5: Create session_files table
CREATE TABLE IF NOT EXISTS session_files (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,

  file_path TEXT NOT NULL,

  times_modified INTEGER DEFAULT 1,
  loc_added INTEGER DEFAULT 0,
  loc_removed INTEGER DEFAULT 0,
  mentioned_in_context INTEGER DEFAULT 0,

  first_modified_at TIMESTAMP DEFAULT NOW(),
  last_modified_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(session_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_session_files_session
  ON session_files(session_id);
CREATE INDEX IF NOT EXISTS idx_session_files_path
  ON session_files(file_path);

-- Step 6: Backfill existing sessions with default values
UPDATE sessions
SET
  tasks_in_progress = 0,
  tasks_todo = 0,
  tags = '{}'
WHERE tasks_in_progress IS NULL;

-- Step 7: Add check constraints
ALTER TABLE sessions
  ADD CONSTRAINT IF NOT EXISTS reasonable_productivity_score
    CHECK (productivity_score IS NULL OR (productivity_score >= 0 AND productivity_score <= 100));

ALTER TABLE sessions
  ADD CONSTRAINT IF NOT EXISTS reasonable_loc
    CHECK (loc_added >= 0 AND loc_removed >= 0);

-- Migration complete
COMMENT ON TABLE session_activities IS 'Timeline of activities during development sessions';
COMMENT ON TABLE session_files IS 'Tracks files modified during development sessions';
```

### Data Migration for 86 Existing Sessions

**Question for Partner:** How to handle existing sessions?

**Options:**

1. **Leave as-is (RECOMMENDED)**
   - Existing sessions: NULL for new columns
   - New sessions: Track everything
   - Pro: No data loss, safe
   - Con: Historical data incomplete

2. **Backfill from analytics_events**
   - Parse analytics_events for session activities
   - Populate session_activities timeline
   - Pro: Complete historical data
   - Con: Complex, time-consuming

3. **Estimated backfill**
   - Use existing counters (tasks_created, contexts_created)
   - Estimate productivity score from available data
   - Pro: Some historical context
   - Con: Estimates may be inaccurate

**Recommendation:** Option 1 (leave as-is) - Focus on tracking NEW sessions properly.

---

## Section 5: Implementation Plan (4 Phases)

### Phase 0: Cleanup (Week 1)
**Goal:** Remove spaghetti code, clean imports, verify build

**Tasks:**
1. ✅ **Delete 4 files:**
   - unifiedSessionManager.ts
   - sessionRouter.ts
   - sessionMonitoring.ts
   - sessionManager.ts

2. ✅ **Archive 2 files:**
   - Move sessionMigrator.ts → /archive/migrations/
   - Move sessionMigrationManager.ts → /archive/failed-experiments/

3. ✅ **Clean imports:**
   - Remove imports from scripts/backfillSessions.ts
   - Remove imports from scripts/rollbackMigration.ts
   - Check for any other references

4. ✅ **Verify TypeScript compiles:**
   ```bash
   npm run type-check
   ```

5. ✅ **Verify server starts:**
   ```bash
   npx tsx src/server.ts
   ```

6. ✅ **Test existing session functionality:**
   - Start session (auto-start on connect)
   - Assign project
   - Check session status
   - Verify 86 sessions still in DB

**Estimated Time:** 2-4 hours
**Risk Level:** LOW (deleting unused code)
**Rollback Plan:** Git revert if issues found

**Success Criteria:**
- [ ] TypeScript compiles with no errors
- [ ] Server starts without errors
- [ ] session_status MCP tool works
- [ ] session_assign MCP tool works
- [ ] All 86 sessions intact in database
- [ ] 2,674 lines of code removed

---

### Phase 1: Database Enhancement (Week 2)
**Goal:** Add new columns and tables to support partner's vision

**Tasks:**
1. ✅ **Create migration file:**
   - /database/migrations/030_enhance_sessions_tracking.sql
   - All ALTER TABLE statements
   - All CREATE TABLE statements
   - All indexes and constraints

2. ✅ **Run migration:**
   ```bash
   psql -h localhost -p 5432 -d aidis_production -f database/migrations/030_enhance_sessions_tracking.sql
   ```

3. ✅ **Verify schema changes:**
   ```bash
   psql -c "\d sessions" aidis_production
   psql -c "\d session_activities" aidis_production
   psql -c "\d session_files" aidis_production
   ```

4. ✅ **Update TypeScript interfaces:**
   - Add new fields to SessionData interface
   - Create SessionActivity interface
   - Create SessionFile interface

5. ✅ **Test backward compatibility:**
   - Verify existing sessions still work
   - Check NULL handling for new columns
   - Ensure indexes are used efficiently

**Estimated Time:** 1-2 days
**Risk Level:** MEDIUM (modifying production database)
**Rollback Plan:** Have DOWN migration ready to revert changes

**Success Criteria:**
- [ ] Migration runs without errors
- [ ] All new columns added successfully
- [ ] All new tables created successfully
- [ ] All indexes created successfully
- [ ] Existing sessions still queryable
- [ ] TypeScript interfaces updated
- [ ] No breaking changes to existing code

---

### Phase 2: Core Feature Implementation (Week 3-4)
**Goal:** Build missing features (LOC, goals, tags, activities, files)

**Week 3 Tasks:**

1. ✅ **LOC Tracking (Build #1)**
   - Add `calculateGitLOC()` method to SessionTracker
   - Integrate git diff --numstat parsing
   - Call on endSession()
   - Handle non-git repos gracefully
   - Test: Create session, modify files, end session, verify LOC

2. ✅ **Session Goals & Tags (Build #2)**
   - Add `updateSessionGoals()` method to SessionTracker
   - Create MCP tool: `session_set_goal`
   - Create MCP tool: `session_add_tag`
   - Test: Set goal, add tags, verify in database

3. ✅ **Enhanced Task Tracking (Build #3)**
   - Update `recordTaskUpdated()` to track in_progress/todo
   - Update in-memory tracking Map
   - Test: Create tasks, transition states, verify counts

**Week 4 Tasks:**

4. ✅ **Session Activities Timeline (Build #4)**
   - Create SessionActivityTracker class
   - Add `recordActivity()` method
   - Integrate with existing tracking methods
   - Create MCP tool: `session_timeline`
   - Test: Create activities, query timeline

5. ✅ **Session File Tracking (Build #5)**
   - Create SessionFileTracker class
   - Add `trackFileModification()` method
   - Add `trackFileMention()` method
   - Integrate with tool wrappers
   - Test: Modify files, verify tracking

6. ✅ **Productivity Scoring (Build #6)**
   - Implement scoring algorithm
   - Add to endSession()
   - Test: Complete session, verify score

**Estimated Time:** 2 weeks
**Risk Level:** LOW (new features, not breaking existing)
**Rollback Plan:** Can disable new features via feature flags if needed

**Success Criteria:**
- [ ] LOC tracking works with git diff
- [ ] Session goals/tags can be set and queried
- [ ] Task state transitions tracked correctly
- [ ] Activity timeline records all events
- [ ] File modifications tracked accurately
- [ ] Productivity score calculated correctly
- [ ] All new features have tests
- [ ] Documentation updated

---

### Phase 3: Reporting & Analytics (Week 5)
**Goal:** Build comprehensive session reports and statistics

**Tasks:**

1. ✅ **Enhanced Session Summary**
   - Update `getSessionData()` with all new fields
   - Create `generateSessionSummary()` with formatting
   - Include timeline highlights
   - Include top files worked on
   - Include productivity score with emoji
   - Test: End session, verify summary format

2. ✅ **Session Statistics**
   - Create `getSessionStats()` aggregate queries
   - Group by period (day/week/month)
   - Calculate averages, totals, trends
   - Find most productive times/tags
   - Test: Generate stats for last 30 days

3. ✅ **MCP Tools for Reporting**
   - Create tool: `session_summary` (detailed report)
   - Create tool: `sessions_stats` (aggregate statistics)
   - Create tool: `sessions_list` (filtered list)
   - Create tool: `sessions_compare` (compare two sessions)
   - Test: Call each tool, verify output

4. ✅ **Database Views (Optional)**
   - Create view: `v_session_summaries` (pre-joined data)
   - Create view: `v_session_statistics` (aggregated metrics)
   - Add indexes to support views
   - Test: Query views for performance

**Estimated Time:** 1-2 weeks
**Risk Level:** LOW (read-only features)
**Rollback Plan:** Can remove tools if performance issues

**Success Criteria:**
- [ ] Session summary shows all metrics beautifully
- [ ] Statistics aggregate correctly
- [ ] All MCP tools work as expected
- [ ] Reports are readable and actionable
- [ ] Performance is acceptable (<1s for queries)
- [ ] Documentation includes examples

---

### Phase 4: Polish & Testing (Week 6)
**Goal:** Verify all partner requirements met, comprehensive testing

**Tasks:**

1. ✅ **End-to-End Testing**
   - Test full session lifecycle (start → work → end)
   - Verify all tracking mechanisms
   - Test timeout behavior
   - Test project assignment
   - Test all MCP tools
   - Load test with multiple concurrent sessions

2. ✅ **Partner Requirements Verification**
   - Go through partner's action plan line by line
   - Verify each requirement is met
   - Create checklist of features
   - Demo each feature

3. ✅ **Documentation**
   - Update AIDIS_MCP_SERVER_REFERENCE_GUIDE.md
   - Add session tracking section
   - Document all new MCP tools
   - Add usage examples
   - Create troubleshooting guide

4. ✅ **Performance Optimization**
   - Analyze query performance
   - Add missing indexes if needed
   - Optimize in-memory tracking
   - Test with 1000+ sessions

5. ✅ **Backward Compatibility Check**
   - Verify 86 existing sessions still work
   - Test with NULL values in new columns
   - Ensure no breaking changes

**Estimated Time:** 1 week
**Risk Level:** LOW (testing/docs)
**Rollback Plan:** N/A (no code changes)

**Success Criteria:**
- [ ] All partner requirements verified ✅
- [ ] Full test suite passing
- [ ] Documentation complete
- [ ] Performance acceptable
- [ ] Zero breaking changes
- [ ] Ready for production use

---

## Section 6: Partner Requirements Checklist

### From Action Plan - Line by Line Verification

| # | Requirement | Status | Implementation | Phase |
|---|-------------|--------|----------------|-------|
| 1 | Auto-assigns project intelligently | ✅ HAVE | TS010 hierarchy working | - |
| 2 | Tracks LOC (added/removed/net) | ❌ NEED | Add columns + git diff | Phase 2 |
| 3 | Tracks tasks (created/completed/in-progress/todo) | 🟡 PARTIAL | Add in_progress/todo | Phase 2 |
| 4 | Tracks decisions made | ✅ HAVE | JOIN to decisions table | - |
| 5 | Tracks context items | ✅ HAVE | contexts_created column | - |
| 6 | Tracks tokens (input/output/total) | ✅ HAVE | Columns + tracking | - |
| 7 | Records session goals | ❌ NEED | Add session_goals column | Phase 2 |
| 8 | Records session outcomes | 🟡 PARTIAL | Use session_notes | Phase 2 |
| 9 | Monitors AI model usage | 🟡 PARTIAL | Add ai_model column | Phase 1 |
| 10 | Tags and categorization | ❌ NEED | Add tags[] column | Phase 2 |
| 11 | Auto-ends after 2 hours | ✅ HAVE | SessionTimeout working | - |
| 12 | Provides detailed reports | 🟡 PARTIAL | Enhance summaries | Phase 3 |
| 13 | Productivity scoring | ❌ NEED | Add score calculation | Phase 2 |
| 14 | Session timeline | ❌ NEED | Create activities table | Phase 2 |
| 15 | File tracking | ❌ NEED | Create files table | Phase 2 |
| 16 | Session statistics | ❌ NEED | Add aggregate queries | Phase 3 |
| 17 | Historical tracking | ✅ HAVE | 86 sessions in DB | - |

**Summary:**
- ✅ **Have:** 5/17 (29%)
- 🟡 **Partial:** 5/17 (29%)
- ❌ **Need:** 7/17 (41%)

**Confidence:** 60% of functionality already exists! Just needs enhancement.

---

## Section 7: AIDIS Command UI Notes

### What is "AIDIS COMMAND"?

**Search Results:**
- Found references in: gitTracker.ts, portManager.ts, httpMcpBridge.ts, git.ts, serviceMesh.ts
- These files use "AIDIS" in logging/comments, not a separate UI component

**Analysis:**
- "AIDIS COMMAND" likely refers to the **MCP command-line tools** (session_status, session_assign, etc.)
- No separate UI component found in codebase
- Sessions are accessed via MCP tools, not a visual interface

**Partner's Question:** "we aren't changing anything there now so I need to remember to go back after we are done with this refactor and clean up ui, correct?"

**Interpretation:**
- Partner may be thinking of MCP tool interface/output formatting
- OR there's a planned UI in another repo/branch
- OR "UI" means the formatted console output from session tools

**Impact of Our Changes:**
- ✅ All existing MCP tools will continue to work
- ✅ New MCP tools will be added (session_set_goal, session_timeline, etc.)
- ⚠️ Output format of `session_status` will be enhanced (more fields)
- ⚠️ May need to update tool descriptions in server.ts

**Update Plan for Later:**
1. Review all session MCP tool descriptions
2. Ensure output formats are consistent and user-friendly
3. Add help text for new tools
4. Consider adding `session_help` tool that explains all session commands

**No Breaking Changes:** Existing tools will work, just enhanced.

---

## Section 8: Critical Questions for Partner

### Must Answer Before Starting

#### Q1: Database Migration Safety
**Question:** We'll be running ALTER TABLE on the `sessions` table with 86 existing records. Are you comfortable with this, or should we create a new table and migrate data?

**Options:**
- A) ALTER existing table (faster, simpler, in-place updates)
- B) Create new table, copy data, rename (safer, more complex)

**Recommendation:** A (ALTER existing) - It's safe with proper migration script and backups.

**Partner Decision:** [ A ] or [ B ]

---

#### Q2: Existing Session Data
**Question:** How should we handle the 86 existing sessions for new tracking features?

**Options:**
- A) Leave as NULL/0 for new columns (historical data incomplete)
- B) Backfill from analytics_events (complex, time-consuming)
- C) Estimate values from existing data (partial, potentially inaccurate)

**Recommendation:** A (leave as NULL) - Focus on tracking NEW sessions properly.

**Partner Decision:** [ A ] or [ B ] or [ C ]

---

#### Q3: Token Tracking Method
**Question:** How should we estimate token usage per session?

**Current:** We have input_tokens, output_tokens, total_tokens columns already.

**Options:**
- A) Keep current approach (tokens tracked if available, else 0)
- B) Implement rough estimation (count chars * 0.25 for tokens)
- C) Integrate with Claude API to get actual token counts

**Recommendation:** A (keep current) - It's already working!

**Partner Decision:** [ A ] or [ B ] or [ C ]

---

#### Q4: LOC Tracking Strategy
**Question:** How should we track lines of code changes?

**Options:**
- A) Use git diff since session start (only tracks committed changes)
- B) Track uncommitted changes too (use git diff on working tree)
- C) Track file edits directly (monitor Read/Write/Edit tool calls)

**Edge Cases:**
- What if no git repository exists? (return 0s)
- What if no commits during session? (option A = 0 LOC)
- What if session spans multiple commits? (sum all diffs)

**Recommendation:** B (git diff on working tree) - Captures all changes, committed or not.

**Partner Decision:** [ A ] or [ B ] or [ C ]

---

#### Q5: Session Lifecycle
**Question:** When should sessions end?

**Current:** Sessions end when:
- Manual end requested
- 2-hour timeout (auto-end inactive sessions)

**Options:**
- A) Keep current (manual + timeout)
- B) Add auto-end on MCP disconnect
- C) Keep sessions open indefinitely (only manual end)

**Edge Cases:**
- What if user closes Claude Desktop without ending session?
- What if server restarts?

**Recommendation:** A (keep current) - Timeout handles abandoned sessions automatically.

**Partner Decision:** [ A ] or [ B ] or [ C ]

---

#### Q6: Productivity Scoring Formula
**Question:** Should we use the exact formula from your action plan, or simplify?

**Your Formula:** (from action plan)
- Task completion: 40 points
- Decision making: 15 points
- Context building: 15 points
- Code output: 20 points (with LOC thresholds)
- Duration bonus: 10 points

**Options:**
- A) Use exact formula from action plan
- B) Simplify (e.g., just task completion + context + decisions)
- C) Make formula configurable (store in config file)

**Recommendation:** A (exact formula) - You've clearly thought this through!

**Partner Decision:** [ A ] or [ B ] or [ C ]

---

#### Q7: AIDIS Command UI Update
**Question:** What exactly needs to be updated later in "AIDIS COMMAND UI"?

**Clarifications Needed:**
- Is this the MCP tool interface? (session_status, etc.)
- Is this a separate visual UI we haven't seen?
- Is this the formatted console output?

**Impact of Our Changes:**
- Existing tools will work with enhanced data
- New tools will be added
- Output formats may change

**Recommendation:** Review after Phase 3 (reporting) to ensure consistent UX.

**Partner Response:** _____________________

---

#### Q8: File Tracking Integration
**Question:** How should we detect file modifications for session_files tracking?

**Options:**
- A) Track only files touched by Read/Write/Edit tools
- B) Watch filesystem for changes (more complex)
- C) Use git status to detect modified files
- D) Track @file mentions in context only

**Edge Cases:**
- Files modified outside of AIDIS (IDE edits)
- Binary files
- Deleted files

**Recommendation:** A + D (tool tracking + @mentions) - Captures AIDIS-specific activity.

**Partner Decision:** [ A ] or [ B ] or [ C ] or [ D ] or combination

---

#### Q9: Session Activities Granularity
**Question:** How detailed should the activity timeline be?

**Options:**
- A) High granularity (every task change, every context add, every file edit)
- B) Medium granularity (major events only: task created/completed, context batches)
- C) Low granularity (session start/end, project changes only)

**Storage Impact:**
- High: ~100-500 activities per session (large table growth)
- Medium: ~20-50 activities per session
- Low: ~5-10 activities per session

**Recommendation:** B (medium) - Captures meaningful events without overwhelming storage.

**Partner Decision:** [ A ] or [ B ] or [ C ]

---

#### Q10: Timeline Implementation Priority
**Question:** The action plan has 6 phases over 6 weeks. Do you want to follow this timeline, or accelerate?

**Your Timeline:**
- Week 1: Database schema
- Week 2: Session lifecycle
- Week 3: Productivity scoring
- Week 4: CLI commands
- Week 5: Analytics
- Week 6: Goals & AI integration

**Our Proposed Timeline:**
- Week 1: Cleanup (spaghetti removal)
- Week 2-3: Core features (LOC, goals, activities)
- Week 4: Reporting
- Week 5: Polish & testing

**Options:**
- A) Follow your 6-week timeline exactly
- B) Use our 4-5 week accelerated timeline
- C) No rush - take as long as needed to get it right

**Recommendation:** C (no rush) - Quality over speed, partner is nervous about complexity.

**Partner Decision:** [ A ] or [ B ] or [ C ]

---

## Section 9: Success Criteria

### How We'll Know When Done

#### Functional Success ✅
- [ ] Sessions auto-start with correct project on MCP connect
- [ ] All work is tracked automatically (tasks, context, decisions, LOC, tokens)
- [ ] Session timeline shows detailed activity log
- [ ] Sessions auto-end after 2 hours of inactivity
- [ ] Productivity score is calculated and makes sense
- [ ] Can answer: "What did I accomplish in my last 5 sessions?"
- [ ] AI tools can use session data to provide better assistance
- [ ] Can identify patterns (e.g., "I'm most productive on Tuesday mornings")

#### Technical Success ✅
- [ ] All 86 existing sessions still work
- [ ] No TypeScript compilation errors
- [ ] No breaking changes to existing MCP tools
- [ ] Database migrations run cleanly
- [ ] All indexes created successfully
- [ ] Query performance < 1 second for reports
- [ ] Memory usage stable (no leaks from in-memory tracking)

#### Code Quality Success ✅
- [ ] 2,674 lines of dead code removed
- [ ] No circular dependencies
- [ ] Clear separation of concerns
- [ ] Comprehensive error handling
- [ ] All new features have tests
- [ ] Documentation complete and accurate

#### Partner Satisfaction Success ✅
- [ ] All requirements from action plan implemented
- [ ] Partner understands how everything works
- [ ] Partner can use all new features
- [ ] Partner feels confident in system stability
- [ ] Partner sees value in session tracking

---

## Section 10: Risk Assessment & Mitigation

### Risks Identified

#### Risk #1: Database Migration Failure
**Probability:** LOW
**Impact:** HIGH
**Mitigation:**
- Test migration on copy of database first
- Have rollback migration ready
- Backup database before running migration
- Run migration during low-usage window

#### Risk #2: Breaking Existing Sessions
**Probability:** MEDIUM
**Impact:** HIGH
**Mitigation:**
- Test with existing 86 sessions before deployment
- Add NULL checks for all new columns
- Keep backward compatibility in all queries
- Have feature flags to disable new features if needed

#### Risk #3: Performance Degradation
**Probability:** LOW
**Impact:** MEDIUM
**Mitigation:**
- Add indexes for all new columns
- Test queries with 1000+ sessions
- Use EXPLAIN ANALYZE for optimization
- Implement query caching if needed

#### Risk #4: Git Integration Issues
**Probability:** MEDIUM
**Impact:** LOW
**Mitigation:**
- Handle "not a git repo" gracefully (return 0s)
- Catch git command errors
- Have fallback for non-git projects
- Make LOC tracking optional

#### Risk #5: Activity Timeline Growth
**Probability:** HIGH
**Impact:** LOW
**Mitigation:**
- Use medium granularity (not every event)
- Add retention policy (archive old activities)
- Partition table by date if needed
- Monitor table size

#### Risk #6: Complexity Overwhelming Partner
**Probability:** MEDIUM
**Impact:** MEDIUM
**Mitigation:**
- Incremental rollout (phase by phase)
- Clear documentation at each step
- Partner approval before each phase
- Demo features as they're built

---

## Appendix A: File Deletion Checklist

### Deletion Verification

Before deleting each file, verify:

```bash
# Check imports (should be 0 or only from other dead files)
grep -r "from.*unifiedSessionManager" mcp-server/src/ --include="*.ts"
grep -r "from.*sessionRouter" mcp-server/src/ --include="*.ts"
grep -r "from.*sessionMonitoring" mcp-server/src/ --include="*.ts"
grep -r "from.*sessionManager" mcp-server/src/ --include="*.ts"
grep -r "from.*sessionMigrator" mcp-server/src/ --include="*.ts"
grep -r "from.*sessionMigrationManager" mcp-server/src/ --include="*.ts"
```

### Safe Deletion Process

1. **Create deletion branch:**
   ```bash
   git checkout -b cleanup/remove-session-spaghetti
   ```

2. **Delete files:**
   ```bash
   # Delete dead code
   rm mcp-server/src/services/unifiedSessionManager.ts
   rm mcp-server/src/services/sessionRouter.ts
   rm mcp-server/src/services/sessionMonitoring.ts
   rm mcp-server/src/services/sessionManager.ts

   # Archive migration code
   mkdir -p mcp-server/archive/migrations
   mkdir -p mcp-server/archive/failed-experiments
   mv mcp-server/src/services/sessionMigrator.ts mcp-server/archive/migrations/
   mv mcp-server/src/services/sessionMigrationManager.ts mcp-server/archive/failed-experiments/
   ```

3. **Clean up imports:**
   ```bash
   # Check scripts that might import these
   grep -l "unifiedSessionManager\|sessionRouter\|sessionMonitoring\|sessionManager" mcp-server/src/scripts/*.ts

   # Fix any imports found (should be in backfillSessions.ts and rollbackMigration.ts)
   ```

4. **Verify TypeScript compiles:**
   ```bash
   npm run type-check
   ```

5. **Verify server starts:**
   ```bash
   npx tsx src/server.ts
   # Should see: "✅ AIDIS MCP Server running"
   # Should NOT see errors about missing modules
   ```

6. **Test session functionality:**
   ```bash
   # Use MCP tools to verify:
   # - session_status works
   # - session_assign works
   # - Sessions still in database
   ```

7. **Commit deletion:**
   ```bash
   git add -A
   git commit -m "cleanup: remove 2,674 lines of dead session code

   Deleted files:
   - unifiedSessionManager.ts (586 lines) - fake data implementations
   - sessionRouter.ts (409 lines) - unused routing layer
   - sessionMonitoring.ts (455 lines) - dormant monitoring
   - sessionManager.ts (43 lines) - duplicate/incorrect logic

   Archived files:
   - sessionMigrator.ts (561 lines) - one-time migration complete
   - sessionMigrationManager.ts (640 lines) - failed experiment

   Total removed: 2,694 lines
   Impact: ZERO - all deleted code was unused/fake/dormant

   Verified:
   - TypeScript compiles successfully
   - Server starts without errors
   - session_status MCP tool works
   - session_assign MCP tool works
   - All 86 sessions intact in database"
   ```

---

## Appendix B: Feature Comparison Table

| Feature | Current State | Partner Wants | Gap | Implementation |
|---------|---------------|---------------|-----|----------------|
| **Session Start** | Auto-start on connect | Same | None | ✅ Keep |
| **Session End** | Manual + 2hr timeout | Same | None | ✅ Keep |
| **Project Assignment** | TS010 hierarchy | Intelligent auto | None | ✅ Keep |
| **Tasks Created** | ✅ Tracked | Track created | None | ✅ Keep |
| **Tasks Completed** | ✅ Tracked | Track completed | None | ✅ Keep |
| **Tasks In Progress** | ❌ Not tracked | Track in-progress | Missing | Add column |
| **Tasks Todo** | ❌ Not tracked | Track todo | Missing | Add column |
| **Context Items** | ✅ Tracked | Track added | None | ✅ Keep |
| **Decisions** | ✅ Tracked via JOIN | Track made | None | ✅ Keep |
| **Tokens (Input)** | ✅ Tracked | Track input | None | ✅ Keep |
| **Tokens (Output)** | ✅ Tracked | Track output | None | ✅ Keep |
| **Tokens (Total)** | ✅ Tracked | Track total | None | ✅ Keep |
| **LOC Added** | ❌ Not tracked | Track added | Missing | Git diff |
| **LOC Removed** | ❌ Not tracked | Track removed | Missing | Git diff |
| **Net LOC** | ❌ Not tracked | Calculate net | Missing | Generated col |
| **Session Goals** | ❌ Not tracked | Set/view goals | Missing | Add column |
| **Session Notes** | 🟡 description col | Add notes | Rename | Add column |
| **Tags** | ❌ Not tracked | Categorize | Missing | Add array col |
| **AI Model** | 🟡 agent_type | Track model | Partial | Add column |
| **AI Provider** | ❌ Not tracked | Track provider | Missing | Add column |
| **Duration** | ✅ Calculated | Track minutes | None | Add column |
| **Productivity Score** | ❌ Not tracked | Calculate 0-100 | Missing | Algorithm |
| **Activity Timeline** | ❌ No table | Track activities | Missing | New table |
| **File Tracking** | ❌ No table | Track files | Missing | New table |
| **Session Reports** | 🟡 Basic status | Detailed summary | Enhance | Improve format |
| **Session Stats** | ❌ No aggregation | Statistics | Missing | New queries |
| **Session List** | ❌ No filter | Filtered list | Missing | New tool |
| **Session Compare** | ❌ Not supported | Compare 2 sessions | Missing | New tool |

**Legend:**
- ✅ Have it
- 🟡 Partial
- ❌ Need to build

---

## Appendix C: Database Schema Evolution

### Before (Current)
```
sessions (27 columns, 86 rows)
├── Core: id, project_id, agent_type, started_at, ended_at
├── Status: status, last_activity_at
├── Metadata: title, description, metadata (JSONB)
├── Tokens: input_tokens, output_tokens, total_tokens
├── Activity: tasks_created, tasks_updated, tasks_completed, contexts_created
└── Other: display_id, agent_display_name, etc.

analytics_events (tracks session events)
contexts (FK to sessions)
technical_decisions (FK to sessions)
tasks (FK to sessions)
```

### After (Enhanced)
```
sessions (39 columns, 86+ rows)
├── Core: [same as before]
├── Status: [same as before]
├── Metadata: title, description, metadata (JSONB)
├── 🆕 Goals: session_goals, session_notes
├── 🆕 Tags: tags (TEXT[])
├── Tokens: [same as before]
├── Activity: tasks_created, tasks_updated, tasks_completed, contexts_created
├── 🆕 Activity Extended: tasks_in_progress, tasks_todo
├── 🆕 LOC: loc_added, loc_removed, net_loc (generated)
├── 🆕 Scoring: productivity_score
├── 🆕 AI Tracking: ai_model, ai_provider
├── 🆕 Duration: duration_minutes
└── Other: [same as before]

🆕 session_activities (timeline tracking)
├── id, session_id (FK)
├── activity_type, activity_description
├── task_id, context_id, decision_id (FK)
├── file_path, ai_interaction
└── occurred_at, metadata (JSONB)

🆕 session_files (file tracking)
├── id, session_id (FK)
├── file_path
├── times_modified, loc_added, loc_removed
├── mentioned_in_context
└── first_modified_at, last_modified_at

[Existing tables unchanged]
analytics_events
contexts
technical_decisions
tasks
```

**Total New Columns:** 12
**Total New Tables:** 2
**Backward Compatibility:** 100% (all new columns nullable or have defaults)

---

## Summary & Next Steps

### What Partner Gets
1. ✅ **Clean codebase** - 2,674 lines of spaghetti removed
2. ✅ **Enhanced tracking** - LOC, goals, tags, activities, files
3. ✅ **Productivity insights** - Scoring algorithm + statistics
4. ✅ **Detailed reporting** - Session summaries + timelines
5. ✅ **Zero disruption** - All 86 existing sessions preserved
6. ✅ **Low risk** - Incremental rollout, backward compatible

### What Partner Needs to Do
1. **Answer 10 critical questions** (Section 8)
2. **Review and approve** 4-phase plan
3. **Set expectations** for timeline (4-6 weeks?)
4. **Provide feedback** at each phase checkpoint

### Immediate Next Steps
1. **Partner reviews this document**
2. **Partner answers critical questions**
3. **Partner approves Phase 0 (cleanup)**
4. **Execute Phase 0** (2-4 hours, low risk)
5. **Checkpoint:** Verify cleanup succeeded
6. **Partner approves Phase 1** (database)
7. **Continue through phases...**

---

## Final Thoughts

**To the Partner:**

This is a lot to absorb, and it's completely normal to feel nervous about complexity. Here's what you should know:

1. **The core works beautifully.** SessionTracker and SessionTimeout are solid, production-tested code. 86 sessions tracked successfully.

2. **Most of what you want already exists.** ~60% of your vision is implemented. We're enhancing, not rebuilding.

3. **The cleanup is safe.** Those 6 files we're deleting? They're not used anywhere. Removing them fixes nothing because they did nothing.

4. **We're being surgical.** Each phase is independent. We can stop, rollback, or adjust at any point.

5. **Your data is safe.** All 86 sessions will remain intact. We're adding columns, not replacing tables.

6. **Take your time.** There's no rush. We can go phase by phase, checkpoint by checkpoint.

**The plan is comprehensive because I want you to understand everything.** But the execution is actually straightforward:
- Delete dead code (safe)
- Add some columns (safe)
- Add some tracking methods (safe)
- Add some reporting queries (safe)

**You're in control.** Answer the questions when ready. Approve phases when comfortable. We'll build this together, systematically, with zero cutting corners.

---

**Document Version:** 1.0
**Created:** 2025-10-05
**Status:** Awaiting Partner Review
**Location:** `/home/ridgetop/aidis/SESSIONS_IMPLEMENTATION_PLAN.md`
