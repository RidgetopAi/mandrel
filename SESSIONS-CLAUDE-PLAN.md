aidis - context_store (MCP)(content: "## Sessions Refactor - Phase 1 Plan Part 1
                             (TS001-1 to TS003-1)\n\n**Phase Goal:** Fix
                             broken/complex logic, implement missing critical
                             features\n\n---\n\n### TS001-1: Rename Sessions Tables
                             for Clarity\n\n**Goal:** Eliminate confusion by
                             renaming `sessions` →
                             `agent_sessions`\n\n**Implementation:**\n1. Create
                             migration
                             `018_rename_sessions_to_agent_sessions.sql`\n2. `ALTER
                             TABLE sessions RENAME TO agent_sessions;`\n3. Update
                             indexes, constraints, foreign keys\n4. Update backend
                             code: SessionTracker, sessionAnalytics\n5. Update
                             frontend code: mcpIntegration, API clients\n6. Document
                              dual architecture in `/home/ridgetop/aidis/docs/refere
                             nce/SESSIONS_ARCHITECTURE.md`\n\n**Files:**
                             sessionTracker.ts, sessionAnalytics.ts,
                             mcpIntegration.ts\n**Risk:** 🟢 LOW\n\n---\n\n###
                             TS002-1: Implement Agent Auto-Detection\n\n**Goal:**
                             Replace hardcoded `'claude-code-agent'` with
                             environment-based detection + user-editable display
                             title\n\n**Current:** `/home/ridgetop/aidis/mcp-server/
                             src/services/sessionTracker.ts:77` - hardcoded
                             string\n\n**Implementation:**\n1. Add field:
                             `agent_display_name VARCHAR(100)`\n2. Create detection
                             function:\n```typescript\nfunction detectAgentType():
                             string {\n  if (process.env.CLAUDE_CODE_SESSION) return
                              'claude-code-agent';\n  if (process.env.WEB_SESSION)
                             return 'web-session';\n  if (process.stdin.isTTY ===
                             false) return 'mcp-client';\n  return
                             'unknown';\n}\n```\n3. Update `startSession()` to use
                             detection\n4. Auto-generate display_name from env or
                             detected type\n5. Add MCP tool:
                             `session_update_agent_name(displayName)`\n6. Test with
                             different environments\n\n**Files:** sessionTracker.ts,
                              sessionAnalytics.ts, migration 019\n**Risk:** 🟢
                             LOW\n\n---\n\n### TS003-1: Simplify Active Session
                             Logic\n\n**Goal:** Strip complexity, implement \"if
                             running → active, else last active\"\n\n**Current:**
                             ~280 lines across getActiveSession(),
                             recoverActiveSessionFromDatabase(),
                             sessionExists()\n\n**Target:**\n```typescript\nstatic
                             async getActiveSession(): Promise<string | null> {\n
                             if (this.activeSessionId) return
                             this.activeSessionId;\n  \n  const sql = `SELECT id
                             FROM agent_sessions WHERE ended_at IS NULL ORDER BY
                             started_at DESC LIMIT 1`;\n  const result = await
                             db.query(sql);\n  \n  if (result.rows.length > 0) {\n
                               this.activeSessionId = result.rows[0].id;\n    return
                              this.activeSessionId;\n  }\n  return
                             null;\n}\n```\n\n**Implementation:**\n1. Replace
                             getActiveSession() with simplified version (~20
                             lines)\n2. DELETE recoverActiveSessionFromDatabase()
                             entirely\n3. DELETE sessionExists() entirely\n4. Update
                              ensureActiveSession()\n5. Test: restart, recovery,
                             multiple sessions\n\n**Files:** sessionTracker.ts
                             (lines 229-334 → ~20 lines)\n**Risk:** 🟢 LOW", type:
                             "planning", tags: "[\"sessions\", \"phase1\",
                             \"ts001-1\", \"ts002-1\", \"ts003-1\"]")
  ⎿  ✅ Context stored successfully!

     📝 ID: 7602c15d-af5c-48b5-9e9a-cd5b52501fc7
     … +10 lines (ctrl+o to expand)

● aidis - context_store (MCP)(content: "## Sessions Refactor - Phase 1 Plan Part 2
                             (TS004-1 to TS005-1)\n\n**Phase Goal:** Session status
                             tracking, timeout mechanism, task linking\n\n---\n\n###
                              TS004-1: Add Session Status Enum + 2-Hour
                             Timeout\n\n**Goal:** Explicit status tracking
                             (active/inactive/disconnected) + auto-end after 2hr
                             inactivity\n\n**Implementation:**\n1. Add
                             fields:\n```sql\nALTER TABLE agent_sessions \n  ADD
                             COLUMN status VARCHAR(20) DEFAULT 'active',\n  ADD
                             COLUMN last_activity_at TIMESTAMP WITH TIME ZONE
                             DEFAULT NOW(),\n  ADD CONSTRAINT valid_status CHECK
                             (status IN ('active', 'inactive',
                             'disconnected'));\n```\n2. Backfill: `UPDATE
                             agent_sessions SET status = CASE WHEN ended_at IS NULL
                             THEN 'active' ELSE 'inactive' END;`\n3. Update
                             startSession() → status='active',
                             last_activity_at=NOW()\n4. Update endSession() →
                             status='inactive'\n5. Add updateLastActivity() called
                             on context_store, task ops\n6. Create timeout
                             checker:\n```typescript\nstatic async
                             checkSessionTimeouts(): Promise<number> {\n  const
                             twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 *
                             1000);\n  const sql = `SELECT id FROM agent_sessions
                             WHERE status = 'active' AND last_activity_at < $1`;\n
                             const result = await db.query(sql, [twoHoursAgo]);\n
                             for (const row of result.rows) await
                             this.endSession(row.id);\n  return
                             result.rows.length;\n}\n```\n7. Add interval:
                             `setInterval(() =>
                             SessionTracker.checkSessionTimeouts(), 5 * 60 * 1000);`
                              in server.ts\n8. Add MCP tool:
                             `session_disconnect(sessionId)` →
                             status='disconnected'\n9. Validate: Prevent writes to
                             disconnected sessions\n\n**Files:** sessionTracker.ts,
                             server.ts, sessionAnalytics.ts, migration
                             020\n**Risk:** 🟡 MEDIUM\n\n---\n\n### TS005-1: Link
                             Tasks to Sessions + Generate Display ID\n\n**Goal:**
                             Enable tasks-per-session tracking + user-readable
                             identifiers\n\n**Implementation:**\n1. Add: `ALTER
                             TABLE tasks ADD COLUMN session_id UUID REFERENCES
                             agent_sessions(id);`\n2. Add: `ALTER TABLE
                             agent_sessions ADD COLUMN display_id VARCHAR(50)
                             UNIQUE;`\n3. Create display_id
                             generator:\n```typescript\nfunction
                             generateDisplayId(): string {\n  const year = new
                             Date().getFullYear();\n  const random =
                             Math.floor(Math.random() * 9000) + 1000;\n  return
                             `SES-${year}-${random}`;\n}\n```\n4. Update
                             startSession() to generate display_id\n5. Update task
                             creation to capture active session\n6. Add session
                             analytics query:\n```sql\nSELECT \n  COUNT(*) FILTER
                             (WHERE status = 'pending') as tasks_pending,\n
                             COUNT(*) FILTER (WHERE status = 'completed') as
                             tasks_completed,\n  COUNT(*) as tasks_total\nFROM tasks
                              WHERE session_id = $1;\n```\n7. Update
                             getSessionStatus() to include task counts\n8. Backfill
                             existing sessions with display_ids\n\n**Files:**
                             sessionTracker.ts, sessionAnalytics.ts, task handlers,
                             migration 021\n**Risk:** 🟢 LOW\n\n---\n\n## Phase 1
                             Summary\n**Tasks:** 5 (TS001-1 to
                             TS005-1)\n**Duration:** 1-2 days\n**Risk:** 🟢 LOW
                             overall\n**Project:** aidis-alpha", type: "planning",
                             tags: "[\"sessions\", \"phase1\", \"ts004-1\",
                             \"ts005-1\"]")
  ⎿  ✅ Context stored successfully!


