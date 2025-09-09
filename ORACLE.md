───────────────────────────  AIDIS SESSION TRACKING – END-TO-END FIX PLAN  ───────────────────────────

This plan is ordered so you can ship incremental value quickly while ending with a hardened, fully-tested solution.

======================================================================
0. HIGH-LEVEL GOALS (acceptance criteria)
======================================================================
• Every newly-created session has a non-NULL project_id (or an intentional 'unassigned' UUID).
• All 3 "session_*" MCP tools compile and pass schema validation.
• Session→project JOINs work; UI displays real project names.
• Analytics queries/statistics reflect the correct project mapping.
• Historic NULL sessions are back-filled or clearly marked "orphaned".
• A regression test catches any future break in the lifecycle.

======================================================================
1. QUICK HOTFIX – unblock compilation & tool execution (15 min)
======================================================================
File: src/handlers/sessionAnalytics.ts  
Add missing dependencies so the three failing tools at least load:

```ts
// Top of file – after existing imports
import { db } from '../config/database.js';
import { projectHandler } from './project.js';
```

Run `tsc --noEmit` → should now compile.  
Run `npm run test:tools -- session_assign` → tool should initialise (still fails logic but no ImportError).

======================================================================
2. CORRECT SESSION LIFECYCLE IN SessionTracker (30 min)
======================================================================
Problem: `startSession(projectId)` is called but the implementation ignores projectId, so `sessions.project_id` stays NULL.

Action:
a) Open src/services/sessionTracker.ts  
b) Ensure `startSession` signature is `(projectId?: string | null)` and the INSERT uses that argument:

```ts
export async function startSession(projectId?: string | null): Promise<string> {
  const result = await db.query(`
      INSERT INTO sessions (agent_type, project_id, started_at)
      VALUES ('ai', $1, NOW())
      RETURNING id
  `, [ projectId || null ]);
  activeSession = result.rows[0].id;
  return activeSession;
}
```

c) Verify that `getSessionStats(projectId)` uses `WHERE project_id = $1` when projectId supplied.

======================================================================
3. ADD DB CONSTRAINTS / TRIGGERS (20 min)
======================================================================
Migration `2025_09_09_enforce_session_project_fk.sql`:

```sql
-- Require a project unless explicitly marked 'unassigned'
ALTER TABLE sessions
    ADD CONSTRAINT fk_sessions_project
        FOREIGN KEY (project_id) REFERENCES projects(id);

-- Optional: default to a dedicated UNASSIGNED project row so
--           analytics grouping still works.
INSERT INTO projects (id, name) VALUES
    ('00000000-0000-0000-0000-000000000000', '__unassigned__')
ON CONFLICT DO NOTHING;

ALTER TABLE sessions
    ALTER COLUMN project_id SET DEFAULT '00000000-0000-0000-0000-000000000000';
```

Run migration, re-start server, create a new session → check DB: project_id is no longer NULL.

======================================================================
4. FIX MCP SCHEMA VALIDATION FOR TOOLS (25 min)
======================================================================
Root cause: session tool schemas weren't registered with `validationMiddleware`.

Solution:
a) In `middleware/validation.ts` add:

```ts
import { SessionAssignSchema, SessionStatusSchema, SessionNewSchema }
  from '../schemas/sessionSchemas.js';

registerSchema('session_assign', SessionAssignSchema);
registerSchema('session_status', SessionStatusSchema);
registerSchema('session_new', SessionNewSchema);
```

b) Place the three JSON-Schema files under `src/schemas/` (copy pattern of existing ones).

======================================================================
5. BACKFILL EXISTING ORPHAN SESSIONS (45 min)
======================================================================
Create script `scripts/backfillSessions.ts`:

```ts
/**
 * Attempt to infer project_id for sessions where it is NULL
 * – If every analytics_event for that session has the same project_id, adopt it
 * – else assign __unassigned__ sentinel
 */
import { db } from '../config/database.js';

const orphanRows = await db.query(`SELECT id FROM sessions WHERE project_id IS NULL`);
for (const { id } of orphanRows.rows) {
  const { rows } = await db.query(`
      SELECT DISTINCT project_id FROM analytics_events WHERE session_id = $1
  `,[id]);
  if (rows.length === 1 && rows[0].project_id) {
     await db.query(`UPDATE sessions SET project_id=$1 WHERE id=$2`, [rows[0].project_id, id]);
     console.log(`✓ session ${id} back-filled`);
  } else {
     await db.query(`UPDATE sessions SET project_id='00000000-0000-0000-0000-000000000000' WHERE id=$1`,[id]);
     console.log(`⚠ session ${id} marked unassigned`);
  }
}
process.exit(0);
```

Run once (`tsx scripts/backfillSessions.ts`) then remove NULLs:

```sql
SELECT COUNT(*) FROM sessions WHERE project_id IS NULL;  -- should be 0
```

======================================================================
6. FRONTEND/UI PATCH (20 min)
======================================================================
• Replace `'Unknown Project'` with:
  `session.project_name === '__unassigned__' ? 'Unassigned' : session.project_name`

• Add a filter chip "Unassigned" so PMs can triage.

======================================================================
7. TEST HARNESS & REGRESSION SUITE (60 min)
======================================================================
• New Jest test `session.e2e.test.ts`

```ts
test('new session is auto-assigned', async () => {
  const pj = await projectHandler.createProject({ name: 'QA-Temp' });
  const stats = await SessionAnalyticsHandler.startSession(pj.id);
  expect(stats.success).toBeTruthy();

  const activeId = await SessionTracker.getActiveSession();
  const { rows } = await db.query('SELECT project_id FROM sessions WHERE id=$1', [activeId]);
  expect(rows[0].project_id).toBe(pj.id);
});
```

Add tests for:
– `assignSessionToProject` happy- & sad-path  
– `getSessionStatus` with and without project

CI: `npm run test:tools && npm run test`

======================================================================
8. OBSERVABILITY HARDENING (optional but low-effort)
======================================================================
• Add `NOT NULL` constraint on `sessions.started_at`.  
• Emit OpenTelemetry span in SessionTracker.startSession / assignSessionToProject for visibility.  
• Grafana panel: Sessions per project per day.

======================================================================
9. ROLLOUT / DEPLOY SEQUENCE
======================================================================
1. Merge hotfix branch → run CI → tag `v1.9.0-sessions`.  
2. Stop production AIDIS (`systemctl stop aidis`).  
3. Apply SQL migration.  
4. Deploy new code; run backfill script once.  
5. Start AIDIS; hit `/healthz`.  
6. Manually create a test session via MCP tool – confirm UI shows project.  
7. Announce fix, monitor logs for 24 h; if stable, purge the old NULL data backups.

======================================================================
10. FUTURE-PROOFING CHECKLIST
======================================================================
☐ Add a DB CHECK or BEFORE INSERT trigger refusing NULL project_id in future.  
☐ Document session lifecycle in `ORACLE.md` (diagram + sequence).  
☐ Add `scripts/assert-session-integrity.ts` invoked nightly by cron.  
☐ Refactor duplicate enum values (see ORACLE.md §4).

───────────────────────────  END OF PLAN  ───────────────────────────
