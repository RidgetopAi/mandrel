/**
 * SESSION ACTIVE-THREAD ANCHOR — contract + robustness tests (Mandrel Core Redesign T5b,
 * task ce5d119c, decision 9fbbcd08).
 *
 * Tests are armor (spec §6). This locks THE deterministic auto-threading layer: while a
 * session has an active thread set, a context_store carrying NO threading tags auto-mints
 * the anchor edges — so a capture made during an active thread structurally CANNOT be born
 * a graph leaf. The seven required proofs:
 *   (1) thread_set(task) + a context_store with NO threading tags auto-mints EXACTLY ONE
 *       `informs` edge to the active task — THE determinism proof.
 *   (2) an active decision → a `decided_by` edge.
 *   (3) the opt-out flag (config-named) → no auto-thread.
 *   (4) an explicit `links` arg present → auto-thread SKIPPED (override).
 *   (5) thread_clear → a subsequent context_store mints nothing.
 *   (6) thread_current reports the resolved anchor (titles).
 *   (7) ROBUSTNESS: an auto-thread mint failure does NOT break the write (record saves).
 *
 * Driven through validate → routeExecutor (the EXACT path the HTTP bridge uses), same
 * idiom as linksParam / typedEdges. Embeddings are mocked so the suite is offline +
 * deterministic.
 */

import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';

// Deterministic, offline embeddings (mirrors linksParam/typedEdges).
vi.mock('../services/embedding.js', () => ({
  embeddingService: {
    generateEmbedding: vi.fn(async () => ({
      embedding: new Array(1536).fill(0),
      model: 'stub',
    })),
  },
}));

import { db } from '../config/database.js';
import { routeExecutor } from '../routes/index.js';
import { validateToolArguments } from '../middleware/validation.js';
import { autoThreadFromActiveAnchor } from '../services/links.js';
import { AUTO_THREAD_OPT_OUT_FLAG, AUTO_THREAD_CONFIG } from '../config/autoThreadConfig.js';

const STAMP = Date.now();
const CONN = `active-thread-conn-${STAMP}`;
const PROJ_NAME = `active-thread-P-${STAMP}`;

let projectId: string;

function responseText(resp: any): string {
  return resp?.content?.map((c: any) => c.text).join('\n') ?? '';
}
function parseId(resp: any): string {
  const m = responseText(resp).match(/ID:\s*([0-9a-f-]{36})/i);
  if (!m) throw new Error(`Could not parse id from response: ${responseText(resp).slice(0, 200)}`);
  return m[1];
}
const id8 = (uuid: string) => uuid.replace(/-/g, '').slice(0, 8);

/** Run a tool through the FULL public path: validate THEN routeExecutor. */
async function viaTool(toolName: string, rawArgs: any): Promise<any> {
  const validated = validateToolArguments(toolName, rawArgs);
  return routeExecutor(toolName, validated, { connectionId: CONN });
}

async function edgesFromTo(fromId: string, toId: string): Promise<string[]> {
  const r = await db.query(
    `SELECT edge_type FROM links WHERE from_id = $1 AND to_id = $2`,
    [fromId, toId]
  );
  return r.rows.map((x) => x.edge_type);
}
async function edgeCount(recordId: string): Promise<number> {
  const r = await db.query(
    `SELECT count(*)::int AS c FROM links WHERE from_id = $1 OR to_id = $1`,
    [recordId]
  );
  return r.rows[0].c;
}

describe('session active-thread anchor (T5b — the deterministic auto-threading layer)', () => {
  beforeAll(async () => {
    projectId = (
      await db.query(
        `INSERT INTO projects (name, description) VALUES ($1, 'active-thread contract') RETURNING id`,
        [PROJ_NAME]
      )
    ).rows[0].id;
    await routeExecutor('project_switch', { project: projectId }, { connectionId: CONN });
  });

  afterAll(async () => {
    try {
      await db.query('DELETE FROM links WHERE project_id = $1', [projectId]);
      await db.query('DELETE FROM contexts WHERE project_id = $1', [projectId]);
      await db.query('DELETE FROM technical_decisions WHERE project_id = $1', [projectId]);
      await db.query('DELETE FROM tasks WHERE project_id = $1', [projectId]);
      await db.query('DELETE FROM sessions WHERE project_id = $1', [projectId]);
      await db.query('DELETE FROM projects WHERE id = $1', [projectId]);
    } catch { /* ignore */ }
    await db.end();
  });

  // ── (1) THE DETERMINISM PROOF: active task → exactly one `informs`, ZERO tags ──
  test('thread_set(task) → a no-tag context_store auto-mints exactly one `informs` edge to the active task', async () => {
    const task = parseId(await viaTool('task_create', { title: 'anchor task #1', type: 'feature' }));

    const setResp = await viaTool('thread_set', { task: id8(task) });
    expect(setResp.isError).not.toBe(true);
    expect(setResp.structuredContent.activeThread.taskId).toBe(task);

    // A capture with NO threading tags at all.
    const ctxResp = await viaTool('context_store', {
      content: 'a capture made during an active thread — no tags',
      type: 'discussion',
    });
    expect(ctxResp.isError).not.toBe(true);
    const ctxId = ctxResp.structuredContent.context.id;

    // EXACTLY ONE edge for this capture, and it is ctx → task `informs`.
    expect(await edgeCount(ctxId)).toBe(1);
    expect(await edgesFromTo(ctxId, task)).toEqual(['informs']);

    // Surfaced in both channels (mirrors T5a linksMinted).
    expect(ctxResp.structuredContent.context.autoThreaded).toHaveLength(1);
    expect(ctxResp.structuredContent.context.autoThreaded[0]).toMatchObject({
      edgeType: 'informs', toType: 'task', toId: task, created: true,
    });
    expect(responseText(ctxResp)).toMatch(/Auto-threaded/);

    await viaTool('thread_clear', {});
  });

  // ── (2) active decision → a `decided_by` edge ───────────────────────────────
  test('thread_set(decision) → a no-tag context_store auto-mints a `decided_by` edge to the active decision', async () => {
    const decResp = await viaTool('decision_record', {
      decisionType: 'architecture', title: 'anchor decision #2', description: 'd',
      rationale: 'r', impactLevel: 'medium',
    });
    const decId = decResp.structuredContent.decision.id;

    await viaTool('thread_set', { decision: id8(decId) });

    const ctxResp = await viaTool('context_store', {
      content: 'capture under an active decision', type: 'planning',
    });
    const ctxId = ctxResp.structuredContent.context.id;

    expect(await edgesFromTo(ctxId, decId)).toEqual(['decided_by']);
    expect(await edgeCount(ctxId)).toBe(1);
    expect(ctxResp.structuredContent.context.autoThreaded[0]).toMatchObject({
      edgeType: 'decided_by', toType: 'decision', toId: decId,
    });

    await viaTool('thread_clear', {});
  });

  // ── set BOTH: task + decision accumulate (merge) → two edges ─────────────────
  test('thread_set(task) then thread_set(decision) accumulates BOTH → a capture gets two edges', async () => {
    const task = parseId(await viaTool('task_create', { title: 'both task', type: 'feature' }));
    const decResp = await viaTool('decision_record', {
      decisionType: 'pattern', title: 'both decision', description: 'd', rationale: 'r', impactLevel: 'low',
    });
    const decId = decResp.structuredContent.decision.id;

    await viaTool('thread_set', { task: id8(task) });
    await viaTool('thread_set', { decision: id8(decId) }); // merge — keeps the task

    const cur = await viaTool('thread_current', {});
    expect(cur.structuredContent.activeThread.taskId).toBe(task);
    expect(cur.structuredContent.activeThread.decisionId).toBe(decId);

    const ctxResp = await viaTool('context_store', { content: 'capture under both', type: 'discussion' });
    const ctxId = ctxResp.structuredContent.context.id;
    expect(await edgeCount(ctxId)).toBe(2);
    expect(await edgesFromTo(ctxId, task)).toEqual(['informs']);
    expect(await edgesFromTo(ctxId, decId)).toEqual(['decided_by']);

    await viaTool('thread_clear', {});
  });

  // ── (3) opt-out flag → no auto-thread ───────────────────────────────────────
  test('the opt-out flag SKIPS auto-thread (config-named) — write succeeds, mints nothing', async () => {
    const task = parseId(await viaTool('task_create', { title: 'opt-out task', type: 'feature' }));
    await viaTool('thread_set', { task: id8(task) });

    const ctxResp = await viaTool('context_store', {
      content: 'deliberately not threaded onto the active task',
      type: 'discussion',
      [AUTO_THREAD_OPT_OUT_FLAG]: true,
    });
    expect(ctxResp.isError).not.toBe(true);
    const ctxId = ctxResp.structuredContent.context.id;

    expect(await edgeCount(ctxId)).toBe(0);
    expect(ctxResp.structuredContent.context.autoThreaded).toEqual([]);

    await viaTool('thread_clear', {});
  });

  // ── (4) explicit `links` arg present → auto-thread SKIPPED (override) ────────
  test('an explicit `links` arg SKIPS auto-thread (the writer is being explicit) — only the explicit link mints', async () => {
    const activeTask = parseId(await viaTool('task_create', { title: 'active task (should NOT be threaded)', type: 'feature' }));
    const explicitTask = parseId(await viaTool('task_create', { title: 'explicit link target', type: 'feature' }));

    await viaTool('thread_set', { task: id8(activeTask) });

    const ctxResp = await viaTool('context_store', {
      content: 'capture with an explicit link while a thread is active',
      type: 'discussion',
      links: [{ task: id8(explicitTask) }],
    });
    const ctxId = ctxResp.structuredContent.context.id;

    // The explicit link minted...
    expect(await edgesFromTo(ctxId, explicitTask)).toEqual(['informs']);
    // ...but auto-thread was SKIPPED: NO edge to the active task.
    expect(await edgesFromTo(ctxId, activeTask)).toEqual([]);
    // Exactly one edge total (the explicit one).
    expect(await edgeCount(ctxId)).toBe(1);
    expect(ctxResp.structuredContent.context.autoThreaded).toEqual([]);

    await viaTool('thread_clear', {});
  });

  // ── (5) thread_clear → a subsequent store mints nothing ─────────────────────
  test('thread_clear → a subsequent no-tag context_store auto-threads NOTHING', async () => {
    const task = parseId(await viaTool('task_create', { title: 'cleared task', type: 'feature' }));
    await viaTool('thread_set', { task: id8(task) });

    const clearResp = await viaTool('thread_clear', {});
    expect(clearResp.structuredContent.action).toBe('cleared');
    expect(clearResp.structuredContent.activeThread).toBeNull();

    const ctxResp = await viaTool('context_store', { content: 'after clear', type: 'discussion' });
    const ctxId = ctxResp.structuredContent.context.id;
    expect(await edgeCount(ctxId)).toBe(0);
    expect(ctxResp.structuredContent.context.autoThreaded).toEqual([]);

    // thread_clear is idempotent: a second clear reports "absent", not an error.
    const again = await viaTool('thread_clear', {});
    expect(again.isError).not.toBe(true);
    expect(again.structuredContent.action).toBe('absent');
  });

  // ── (6) thread_current reports the resolved anchor ──────────────────────────
  test('thread_current reports the resolved anchor (ids + titles); "no active thread" when unset', async () => {
    // Unset state first.
    await viaTool('thread_clear', {});
    const none = await viaTool('thread_current', {});
    expect(none.structuredContent.activeThread).toBeNull();
    expect(responseText(none)).toMatch(/No active thread/i);

    const task = parseId(await viaTool('task_create', { title: 'current-report task', type: 'feature' }));
    await viaTool('thread_set', { task: id8(task) });

    const cur = await viaTool('thread_current', {});
    expect(cur.structuredContent.activeThread.taskId).toBe(task);
    expect(cur.structuredContent.activeThread.taskTitle).toBe('current-report task');
    expect(responseText(cur)).toContain(task);

    await viaTool('thread_clear', {});
  });

  // ── thread_set requires at least one of task/decision ───────────────────────
  test('thread_set with neither task nor decision is an actionable error (mutates nothing)', async () => {
    const resp = await viaTool('thread_set', {});
    expect(resp.isError).toBe(true);
    expect(responseText(resp)).toMatch(/at least one of/i);
    expect(resp.structuredContent.action).toBe('rejected');
  });

  // ── (7) ROBUSTNESS: an auto-thread mint failure does NOT break the write ─────
  test('ROBUSTNESS: autoThreadFromActiveAnchor never throws + the write still saves when a mint fails', async () => {
    // (a) Service contract: a failing pool (every query throws) yields no edges, NO throw.
    const failingPool: any = { query: async () => { throw new Error('simulated DB failure'); } };
    const res = await autoThreadFromActiveAnchor(
      {
        fromId: '11111111-1111-4111-8111-111111111111',
        fromType: 'context',
        anchor: { taskId: '22222222-2222-4222-8222-222222222222', decisionId: null },
        activeTaskEdgeType: AUTO_THREAD_CONFIG.activeTaskEdgeType,
        activeDecisionEdgeType: AUTO_THREAD_CONFIG.activeDecisionEdgeType,
        projectId,
        createdBy: 'auto:test',
      },
      failingPool
    );
    expect(res.minted).toBe(0);
    expect(res.items).toEqual([]); // mint failed → nothing recorded, but NO exception

    // (b) End-to-end: a STALE anchor (active task id that no longer exists) cannot break
    // the write. We point the anchor at a deleted task; the auto-thread mint of an edge to
    // a non-existent referent must not roll back the store — the context still persists.
    const tmpTask = parseId(await viaTool('task_create', { title: 'to-be-deleted', type: 'feature' }));
    await viaTool('thread_set', { task: id8(tmpTask) });
    // Delete the task out from under the anchor (the in-memory anchor still points at it).
    await db.query('DELETE FROM tasks WHERE id = $1', [tmpTask]);

    const ctxResp = await viaTool('context_store', { content: 'write with a stale anchor', type: 'error' });
    // The write SUCCEEDED despite the stale anchor.
    expect(ctxResp.isError).not.toBe(true);
    const ctxId = ctxResp.structuredContent.context.id;
    const row = await db.query('SELECT id FROM contexts WHERE id = $1', [ctxId]);
    expect(row.rows.length).toBe(1);

    await viaTool('thread_clear', {});
  });

  // ── CONFIG: the auto-thread layer is config-driven (no hardcoded vars) ───────
  test('CONFIG: edge mappings + opt-out flag come from autoThreadConfig (sourced from edgeTypes.ts)', () => {
    expect(AUTO_THREAD_CONFIG.activeTaskEdgeType).toBe('informs');
    expect(AUTO_THREAD_CONFIG.activeDecisionEdgeType).toBe('decided_by');
    expect(AUTO_THREAD_CONFIG.optOutFlag).toBe(AUTO_THREAD_OPT_OUT_FLAG);
    expect(typeof AUTO_THREAD_CONFIG.enabled).toBe('boolean');
  });
});
