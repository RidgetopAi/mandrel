/**
 * Tool-Contract-Drift Bug-Fix Acceptance Tests (branch fix/tool-contract-drift)
 *
 * Drives the EXACT public bridge path (validateToolArguments → route handler →
 * real migrated disposable Postgres, the ci_* DB from scripts/ci.sh — NEVER prod)
 * to prove each contract-drift bug is fixed, observed == expected, ZERO SQL on the
 * write path (project scaffolding only is set up/torn down via SQL).
 *
 * Bugs covered:
 *   A1  decision_record persists outcome_status/outcome_notes/lessons_learned on CREATE.
 *   A2  decision_update with status:'superseded' + supersededBy together no longer
 *       throws "multiple assignments to column status".
 *   A3  task_update / task_create / task_list accept status:'cancelled'.
 *   A4  task_update actually WRITES priority + progress (was a silent no-op).
 *   A5  task_update.assignedTo accepts a free-form (non-UUID) string.
 *   A7  task_list honors offset (pagination).
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../config/database.js';
import { tasksRoutes } from '../routes/tasks.routes.js';
import { decisionsRoutes } from '../routes/decisions.routes.js';
import { validateToolArguments } from '../middleware/validation.js';

const STAMP = Date.now();
const PROJ_NAME = `contract-drift-fixes-${STAMP}`;
let projectId: string;

function textOf(resp: any): string {
  return resp?.content?.map((c: any) => c.text).join('\n') ?? '';
}
function idFrom(text: string): string {
  const m = text.match(/🆔 ID:\s*([0-9a-f-]{36})/i);
  expect(m, 'response must include a UUID').toBeTruthy();
  return m![1];
}
async function viaPublicTool(toolName: string, rawArgs: any, handler: (a: any) => Promise<any>) {
  return handler(validateToolArguments(toolName, rawArgs));
}

describe('tool-contract-drift fixes (public-tool path, real DB, zero SQL on writes)', () => {
  beforeAll(async () => {
    projectId = (await db.query(
      `INSERT INTO projects (name, description) VALUES ($1, 'contract drift fixes') RETURNING id`,
      [PROJ_NAME]
    )).rows[0].id;
  });

  afterAll(async () => {
    if (projectId) {
      try { await db.query('DELETE FROM tasks WHERE project_id = $1', [projectId]); } catch { /* ignore */ }
      try { await db.query('DELETE FROM technical_decisions WHERE project_id = $1', [projectId]); } catch { /* ignore */ }
      try { await db.query('DELETE FROM sessions WHERE project_id = $1', [projectId]); } catch { /* ignore */ }
      try { await db.query('DELETE FROM projects WHERE id = $1', [projectId]); } catch { /* ignore */ }
    }
    await db.end();
  });

  // ---- A1: outcome fields persist on CREATE --------------------------------
  test("A1: decision_record persists outcome_status/notes/lessons on CREATE", async () => {
    const resp = await viaPublicTool('decision_record', {
      decisionType: 'tooling',
      title: `A1 outcome-on-create ${STAMP}`,
      description: 'Recorded with an outcome already known',
      rationale: 'retroactive capture',
      impactLevel: 'low',
      outcomeStatus: 'too_early',
      outcomeNotes: 'noted at creation',
      lessonsLearned: 'capture outcomes early',
      projectId,
    }, (a) => decisionsRoutes.handleRecord(a));
    const id = idFrom(textOf(resp));
    const row = (await db.query(
      'SELECT outcome_status, outcome_notes, lessons_learned FROM technical_decisions WHERE id = $1', [id]
    )).rows[0];
    expect(row.outcome_status).toBe('too_early');
    expect(row.outcome_notes).toBe('noted at creation');
    expect(row.lessons_learned).toBe('capture outcomes early');
  });

  test("A1: omitting outcome on create defaults outcome_status to 'unknown'", async () => {
    const resp = await viaPublicTool('decision_record', {
      decisionType: 'tooling',
      title: `A1 default-unknown ${STAMP}`,
      description: 'No outcome supplied',
      rationale: 'default path',
      impactLevel: 'low',
      projectId,
    }, (a) => decisionsRoutes.handleRecord(a));
    const id = idFrom(textOf(resp));
    const row = (await db.query('SELECT outcome_status FROM technical_decisions WHERE id = $1', [id])).rows[0];
    expect(row.outcome_status).toBe('unknown');
  });

  // ---- A2: superseded + supersededBy together no longer double-assigns ------
  // Helper: record a real successor decision and return its id (superseded_by has an
  // FK to technical_decisions.id, so the successor MUST exist — all via the tool).
  async function recordSuccessor(label: string): Promise<string> {
    const r = await viaPublicTool('decision_record', {
      decisionType: 'architecture', title: `A2 successor ${label} ${STAMP}`,
      description: 'the replacement', rationale: 'r', impactLevel: 'low', projectId,
    }, (a) => decisionsRoutes.handleRecord(a));
    return idFrom(textOf(r));
  }

  test("A2: decision_update status:'superseded' + supersededBy together succeeds (no double-assign)", async () => {
    const rec = await viaPublicTool('decision_record', {
      decisionType: 'architecture',
      title: `A2 supersede ${STAMP}`,
      description: 'will be superseded',
      rationale: 'r',
      impactLevel: 'medium',
      projectId,
    }, (a) => decisionsRoutes.handleRecord(a));
    const id = idFrom(textOf(rec));
    const successorId = await recordSuccessor('explicit');

    const resp = await viaPublicTool('decision_update', {
      decisionId: id,
      status: 'superseded',     // explicit status...
      supersededBy: successorId, // ...AND supersededBy → previously a double-assign SQL error
      supersededReason: 'replaced by a better approach',
    }, (a) => decisionsRoutes.handleUpdate(a));
    const text = textOf(resp);
    expect(text).toContain('Decision updated successfully');
    expect(text).not.toMatch(/multiple assignments to column/i);

    const row = (await db.query(
      'SELECT status, superseded_by, superseded_reason FROM technical_decisions WHERE id = $1', [id]
    )).rows[0];
    expect(row.status).toBe('superseded');
    expect(row.superseded_by).toBe(successorId);
    expect(row.superseded_reason).toBe('replaced by a better approach');
  });

  test("A2: supersededBy WITHOUT explicit status still implies status='superseded'", async () => {
    const rec = await viaPublicTool('decision_record', {
      decisionType: 'architecture',
      title: `A2 implicit-supersede ${STAMP}`,
      description: 'd', rationale: 'r', impactLevel: 'low', projectId,
    }, (a) => decisionsRoutes.handleRecord(a));
    const id = idFrom(textOf(rec));
    const successorId = await recordSuccessor('implicit');
    await viaPublicTool('decision_update', {
      decisionId: id,
      supersededBy: successorId,
    }, (a) => decisionsRoutes.handleUpdate(a));
    const row = (await db.query('SELECT status FROM technical_decisions WHERE id = $1', [id])).rows[0];
    expect(row.status).toBe('superseded');
  });

  // ---- A3: 'cancelled' accepted on the single-task path --------------------
  test("A3: task_update accepts status:'cancelled' (advertised + DB-allowed)", async () => {
    const created = await viaPublicTool('task_create',
      { title: `A3 cancel ${STAMP}`, projectId }, (a) => tasksRoutes.handleCreate(a));
    const id = idFrom(textOf(created));
    const resp = await viaPublicTool('task_update',
      { taskId: id, status: 'cancelled' }, (a) => tasksRoutes.handleUpdate(a));
    expect(textOf(resp)).toContain('Task updated successfully');
    const row = (await db.query('SELECT status FROM tasks WHERE id = $1', [id])).rows[0];
    expect(row.status).toBe('cancelled');
  });

  test("A3: task_create accepts initial status:'cancelled'", async () => {
    const created = await viaPublicTool('task_create',
      { title: `A3 create-cancel ${STAMP}`, status: 'cancelled', projectId },
      (a) => tasksRoutes.handleCreate(a));
    const id = idFrom(textOf(created));
    const row = (await db.query('SELECT status FROM tasks WHERE id = $1', [id])).rows[0];
    expect(row.status).toBe('cancelled');
  });

  // ---- A4 + A5: priority/progress WRITE; non-UUID assignee accepted ---------
  test('A4+A5: task_update writes priority + progress, accepts free-form assignee', async () => {
    const created = await viaPublicTool('task_create',
      { title: `A4 write ${STAMP}`, priority: 'low', projectId }, (a) => tasksRoutes.handleCreate(a));
    const id = idFrom(textOf(created));

    // Update ONLY priority+progress+assignee (no status) — the exact previously-no-op path.
    const resp = await viaPublicTool('task_update',
      { taskId: id, priority: 'urgent', progress: 73, assignedTo: 'foreman-agent' },
      (a) => tasksRoutes.handleUpdate(a));
    expect(textOf(resp)).toContain('Task updated successfully');

    const row = (await db.query('SELECT priority, progress, assigned_to, status FROM tasks WHERE id = $1', [id])).rows[0];
    expect(row.priority).toBe('urgent');   // A4: actually written (was dropped)
    expect(Number(row.progress)).toBe(73); // A4: actually written (was dropped)
    expect(row.assigned_to).toBe('foreman-agent'); // A5: free-form string accepted
    expect(row.status).toBe('todo');       // untouched (status optional now)
  });

  test('A5: a UUID-shaped assignee still validates (superset, not a regression)', () => {
    const validated = validateToolArguments('task_update', {
      taskId: '00000000-0000-0000-0000-000000000000',
      assignedTo: '33333333-3333-3333-3333-333333333333',
    });
    expect((validated as any).assignedTo).toBe('33333333-3333-3333-3333-333333333333');
  });

  test('A4: an empty task_update (no updatable field) is rejected with a clear error', () => {
    expect(() => validateToolArguments('task_update', {
      taskId: '00000000-0000-0000-0000-000000000000',
    })).toThrow(/At least one field/i);
  });

  // ---- A6: decision_search forwards the status filter ----------------------
  test('A6: decision_search status filter is forwarded (not silently dropped)', async () => {
    // Two decisions with the SAME searchable title token; one will be superseded.
    const token = `A6filter${STAMP}`;
    const activeRec = await viaPublicTool('decision_record', {
      decisionType: 'process', title: `${token} active`,
      description: 'stays active', rationale: 'r', impactLevel: 'low', projectId,
    }, (a) => decisionsRoutes.handleRecord(a));
    const supRec = await viaPublicTool('decision_record', {
      decisionType: 'process', title: `${token} superseded`,
      description: 'will be superseded', rationale: 'r', impactLevel: 'low', projectId,
    }, (a) => decisionsRoutes.handleRecord(a));
    const activeId = idFrom(textOf(activeRec));
    const supId = idFrom(textOf(supRec));

    await viaPublicTool('decision_update', {
      decisionId: supId, status: 'superseded',
    }, (a) => decisionsRoutes.handleUpdate(a));

    // Search WITH status:'active' must return the active one and EXCLUDE the superseded one.
    const resp = await viaPublicTool('decision_search', {
      query: token, status: 'active', projectId,
    }, (a) => decisionsRoutes.handleSearch(a));
    const ids = ((resp as any).data?.results ?? []).map((r: any) => r.id);
    expect(ids).toContain(activeId);
    expect(ids).not.toContain(supId); // the filter actually arrived at the handler
  });

  // ---- A7: task_list offset pagination -------------------------------------
  test('A7: task_list honors offset (pagination) — page 2 is a disjoint window', async () => {
    // DEDICATED project so the listed set is EXACTLY these 5 rows (no interference
    // from other tests' tasks under parallel CI). Created + listed entirely via tools.
    const a7Proj = (await db.query(
      `INSERT INTO projects (name, description) VALUES ($1, 'A7 pagination') RETURNING id`,
      [`a7-pagination-${STAMP}`]
    )).rows[0].id;

    const ids = (regex: RegExp, text: string) => [...text.matchAll(regex)].map(m => m[1]);
    const ID_RE = /🆔 ID:\s*([0-9a-f-]{36})/gi;

    // task_list scopes via the route's args.projectId (resolveProjectId). NOTE: the
    // task_list zod schema does not itself declare projectId (a separate, pre-existing
    // gap — flagged to Ridge, out of A1–A8 scope), so we VALIDATE the pagination params
    // (limit/offset — the thing under test here) and supply the project scope the route
    // reads, instead of relying on the ambient current-project (which is non-deterministic
    // under parallel CI). The offset value still flows validate→route→handler→SQL.
    const listScoped = (raw: any) => {
      const validated = validateToolArguments('task_list', raw) as any;
      return tasksRoutes.handleList({ ...validated, projectId: a7Proj });
    };

    // Seed 5 tasks; assert each create actually succeeded (no silent route failure).
    for (let i = 0; i < 5; i++) {
      const created = await viaPublicTool('task_create',
        { title: `A7 page ${i} ${STAMP}`, projectId: a7Proj }, (a) => tasksRoutes.handleCreate(a));
      expect(textOf(created), `A7 task ${i} must be created`).toContain('Task created successfully');
    }

    // Full list (limit high enough to capture all 5) establishes the canonical order.
    const allResp = await listScoped({ limit: 50, offset: 0 });
    const all = ids(ID_RE, textOf(allResp));
    expect(all.length, 'all 5 seeded tasks must be listed').toBe(5);

    // offset:2 must return exactly the tail after skipping the first 2 of that same order.
    const offsetResp = await listScoped({ limit: 50, offset: 2 });
    const tail = ids(ID_RE, textOf(offsetResp));

    // OFFSET semantics: skipping 2 leaves 3, equal to all.slice(2), and excludes the
    // first 2. If offset were silently dropped (the bug), tail would equal all (length 5).
    expect(tail).toEqual(all.slice(2));
    expect(tail.length).toBe(3);
    expect(tail).not.toContain(all[0]);
    expect(tail).not.toContain(all[1]);

    // cleanup A7's dedicated project.
    try { await db.query('DELETE FROM tasks WHERE project_id = $1', [a7Proj]); } catch { /* ignore */ }
    try { await db.query('DELETE FROM sessions WHERE project_id = $1', [a7Proj]); } catch { /* ignore */ }
    try { await db.query('DELETE FROM projects WHERE id = $1', [a7Proj]); } catch { /* ignore */ }
  });
});
