/**
 * OUTPUT-SCHEMA ERROR/EDGE-PATH CONTRACT GUARD (task df4c3745 — the customer
 * outputSchema-rejection bug class).
 *
 * THE BUG CLASS THIS LOCKS SHUT
 *   A strict MCP client (e.g. customer dmclark's Claude Code) validates a tool's
 *   `structuredContent` against the tool's advertised `outputSchema` and DISCARDS any
 *   response that fails. Our outputSchemas (config/outputSchemas.ts) marked descriptive
 *   fields REQUIRED — but the handlers' ERROR / not-found / ambiguous / empty paths (and
 *   several thread_* SUCCESS paths) DON'T include those fields. So legitimate responses
 *   were rejected: recall_thread unresolvable-anchor ({ok:false,found:false}) was missing
 *   anchor/altitude/depthUsed/nodes/edges/abstain/truncated/truncatedCount/total;
 *   thread_set was missing action/activeThread; task_create error was missing action.
 *
 *   The pre-existing dualChannelOutput.contract.test.ts only validated HAPPY paths, so the
 *   whole class slipped through. THIS test closes that gap: for the tools dmclark hit (and
 *   the broader error-shape set), it drives REAL error/not-found/ambiguous/empty responses
 *   through the public tool path and validates the resulting structuredContent against the
 *   tool's DECLARED outputSchema using the SAME JSON-Schema validator an MCP client uses —
 *   ajv against buildOutputSchema(toolName), NOT just zod.
 *
 *   PROOF OF VALUE: against the OLD (over-strict) schemas these cases FAIL (the required
 *   set included action/activeThread/anchor/etc.); against the FIXED schemas (required =
 *   `ok` only) they PASS. See the C0 meta-guard below which asserts the required set is
 *   minimal, so a future tightening that re-introduces the break is caught immediately.
 *
 * DRIVEN through validate → routeExecutor (the EXACT path the HTTP bridge / MCP client
 * uses), so the dual-channel SEAM (ensureStructuredContent, which stamps `ok`) is applied
 * — the test sees EXACTLY the structuredContent the client receives. Embeddings mocked so
 * the suite is offline + deterministic.
 */

import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import Ajv from 'ajv';

// Deterministic, offline embeddings (mirrors the other DB-backed contract tests).
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
import {
  buildOutputSchema,
  outputZodSchemas,
  type OutputSchemaToolName,
} from '../config/outputSchemas.js';

const ajv = new Ajv({ allErrors: true, strict: false });

const STAMP = Date.now();
const CONN = `outputschema-errpaths-${STAMP}`;
const PROJ_NAME = `outputschema-errpaths-P-${STAMP}`;

let projectId: string;

/** Run a tool through the FULL public path: validate THEN routeExecutor (the seam runs). */
async function viaTool(toolName: string, rawArgs: any): Promise<any> {
  const validated = validateToolArguments(toolName, rawArgs);
  return routeExecutor(toolName, validated, { connectionId: CONN });
}

/**
 * Validate a tool's structuredContent against its DECLARED outputSchema — the EXACT JSON
 * Schema the MCP SDK advertises (buildOutputSchema), via ajv (the MCP client's validator).
 * Returns ajv's verdict + errors so a failure prints the precise mismatch.
 */
function validateAgainstDeclaredSchema(
  toolName: OutputSchemaToolName,
  structuredContent: any
): { ok: boolean; errors: string } {
  const schema = buildOutputSchema(toolName);
  const validate = ajv.compile(schema);
  const ok = validate(structuredContent) as boolean;
  return { ok, errors: JSON.stringify(validate.errors) };
}

/** Assert a tool's structuredContent validates against its declared (advertised) schema. */
function expectConformant(toolName: OutputSchemaToolName, resp: any, label: string) {
  expect(resp.structuredContent, `${toolName} [${label}] must carry structuredContent`).toBeTruthy();
  const { ok, errors } = validateAgainstDeclaredSchema(toolName, resp.structuredContent);
  expect(
    ok,
    `${toolName} [${label}] structuredContent must validate against its advertised outputSchema ` +
      `(an MCP client would otherwise DISCARD it). ajv errors: ${errors} | ` +
      `got: ${JSON.stringify(resp.structuredContent)}`
  ).toBe(true);
}

describe('outputSchema error/edge-path conformance (task df4c3745)', () => {
  beforeAll(async () => {
    projectId = (
      await db.query(
        `INSERT INTO projects (name, description) VALUES ($1, 'outputschema err-path fuse') RETURNING id`,
        [PROJ_NAME]
      )
    ).rows[0].id;
    // Pin this connection to the project so task tools resolve a project (their
    // "no current project" error is a SEPARATE legitimate path covered explicitly below).
    await viaTool('project_switch', { project: projectId });
  });

  afterAll(async () => {
    if (projectId) {
      try { await db.query('DELETE FROM contexts WHERE project_id = $1', [projectId]); } catch { /* ignore */ }
      try { await db.query('DELETE FROM tasks WHERE project_id = $1', [projectId]); } catch { /* ignore */ }
      try { await db.query('DELETE FROM sessions WHERE project_id = $1', [projectId]); } catch { /* ignore */ }
      try { await db.query('DELETE FROM projects WHERE id = $1', [projectId]); } catch { /* ignore */ }
    }
    await db.end();
  });

  // ── C0: META-GUARD — the required set is MINIMAL (the root-cause invariant) ───────────
  // This is the structural assertion that, had it existed, would have caught the bug at
  // build time: a field is `required` ONLY if it is on EVERY path. The seam guarantees ONLY
  // `ok`, so for the shapes whose error paths drop their descriptive fields, the required
  // set must be exactly ['ok'] (or a subset thereof). This fails against the OLD schemas
  // (which required action/activeThread/anchor/found/results/total/...).
  test('C0: declared outputSchemas require only universally-present fields (≈ just `ok`)', () => {
    // The seam stamps `ok` on every response; nothing else is guaranteed on error paths.
    // These tools have error/edge paths that drop ALL descriptive fields → required ⊆ {ok}.
    const minimalRequiredTools: OutputSchemaToolName[] = [
      'recall_thread',
      'thread_set', 'thread_current', 'thread_clear',
      'task_create', 'task_update', 'task_details', 'task_delete', 'task_restore', 'task_list',
      'context_store', 'context_update', 'context_delete', 'context_restore',
      'context_search', 'context_get_recent',
      'project_create', 'project_update', 'project_delete', 'project_switch',
      'project_current', 'project_info', 'project_list',
      'decision_record', 'decision_search', 'decision_get', 'decision_update',
      'decision_delete', 'decision_restore',
      'smart_search', 'get_recommendations',
      'link', 'unlink', 'get_links',
    ];
    for (const tool of minimalRequiredTools) {
      const schema = buildOutputSchema(tool);
      const required = schema.required ?? [];
      const extra = required.filter((f) => f !== 'ok');
      expect(
        extra,
        `${tool}: required must be ⊆ {ok} (the only field the seam guarantees on EVERY path). ` +
          `Marking ${JSON.stringify(extra)} required will make an MCP client DISCARD the ` +
          `error/not-found/empty path that omits it (task df4c3745).`
      ).toEqual([]);
    }
  });

  test('C0b: EVERY registered outputSchema is a well-formed object schema that compiles', () => {
    for (const tool of Object.keys(outputZodSchemas) as OutputSchemaToolName[]) {
      const schema = buildOutputSchema(tool);
      expect(schema.type, `${tool}.outputSchema.type`).toBe('object');
      expect(() => ajv.compile(schema), `${tool}.outputSchema compiles`).not.toThrow();
    }
  });

  // ── C1: recall_thread — unresolvable anchor (dmclark's exact case) ───────────────────
  test('C1: recall_thread unresolvable-anchor {ok:false,found:false} conforms', async () => {
    const resp = await viaTool('recall_thread', {
      anchor: `no-such-anchor-${STAMP}`,
      projectId,
    });
    // The handler's AnchorUnresolvableError path: {ok:false, found:false} — no thread fields.
    expect(resp.isError).toBe(true);
    expect(resp.structuredContent.ok).toBe(false);
    expect(resp.structuredContent.found).toBe(false);
    expect(resp.structuredContent.anchor, 'error path omits anchor').toBeUndefined();
    expectConformant('recall_thread', resp, 'unresolvable-anchor error');
  });

  // ── C2: thread_set — SUCCESS and REJECTED (dmclark's exact case) ─────────────────────
  test('C2a: thread_set SUCCESS {ok,action,activeThread} conforms', async () => {
    // Need a real task to anchor on.
    const created = await viaTool('task_create', { title: `errpath-anchor-${STAMP}`, type: 'feature', projectId });
    const taskId = created.structuredContent.task.id as string;

    const resp = await viaTool('thread_set', { task: taskId, projectId });
    expect(resp.structuredContent.ok).toBe(true);             // handler now emits ok:true
    expect(resp.structuredContent.action).toBe('set');
    expect(resp.structuredContent.activeThread.taskId).toBe(taskId);
    expectConformant('thread_set', resp, 'success');
  });

  test('C2b: thread_set REJECTED (neither task nor decision) {ok:false,action:rejected} conforms', async () => {
    const resp = await viaTool('thread_set', { projectId });
    expect(resp.isError).toBe(true);
    expect(resp.structuredContent.ok).toBe(false);
    expect(resp.structuredContent.action).toBe('rejected');
    expect(resp.structuredContent.activeThread, 'rejected path omits activeThread').toBeUndefined();
    expectConformant('thread_set', resp, 'rejected');
  });

  // ── C3: task_create — error path (dmclark's exact case) ──────────────────────────────
  test('C3: task_create error (handler throw) {ok:false} conforms', async () => {
    // A bogus (non-existent) projectId makes createTask throw "Project does not exist" →
    // caught → formatMcpError → the seam returns a BARE {ok:false} with NO `action`. This
    // is exactly the task_create error shape dmclark's client rejected under the old schema.
    const resp = await viaTool('task_create', {
      title: `errpath-badproj-${STAMP}`,
      type: 'feature',
      projectId: '00000000-0000-0000-0000-000000000000',
    });
    expect(resp.isError).toBe(true);
    expect(resp.structuredContent.ok).toBe(false);
    expect(resp.structuredContent.action, 'error path omits action').toBeUndefined();
    expectConformant('task_create', resp, 'error (bogus project)');
  });

  // ── C4: task_update — not-found and ambiguous edge shapes ────────────────────────────
  test('C4a: task_update not-found {ok:false,found:false} conforms', async () => {
    // A non-existent SHORT id (8-hex) forces a DB resolution → IdNotFoundError → the
    // {ok:false,found:false} mutate-error path. (A full UUID is short-circuited by the
    // resolver WITHOUT an existence check, so use a short id to actually hit not-found.)
    const resp = await viaTool('task_update', {
      taskId: 'deadbeef',
      status: 'completed',
      projectId,
    });
    expect(resp.isError).toBe(true);
    expect(resp.structuredContent.ok).toBe(false);
    expect(resp.structuredContent.found).toBe(false);
    expect(resp.structuredContent.action, 'mutate error omits action').toBeUndefined();
    expectConformant('task_update', resp, 'not-found');
  });

  // ── C4b: task_update — AMBIGUOUS short-id prefix {ok:false,ambiguous:true} ────────────
  test('C4b: task_update ambiguous short-id {ok:false,ambiguous:true} conforms', async () => {
    // Create two tasks, then force-collide their ids on a shared 8-hex prefix so a
    // short-id resolution is AMBIGUOUS → the {ok:false,ambiguous:true,candidates:[...]} path.
    const prefix = 'abcd1234';
    const idA = `${prefix}-0000-4000-8000-000000000001`;
    const idB = `${prefix}-0000-4000-8000-000000000002`;
    await db.query(
      `INSERT INTO tasks (id, project_id, title, type, status, priority)
       VALUES ($1,$3,'ambig-A','feature','todo','medium'),
              ($2,$3,'ambig-B','feature','todo','medium')`,
      [idA, idB, projectId]
    );
    try {
      const resp = await viaTool('task_update', { taskId: prefix, status: 'completed', projectId });
      expect(resp.isError).toBe(true);
      expect(resp.structuredContent.ok).toBe(false);
      expect(resp.structuredContent.ambiguous).toBe(true);
      expect(resp.structuredContent.action, 'ambiguous path omits action').toBeUndefined();
      expectConformant('task_update', resp, 'ambiguous');
    } finally {
      await db.query('DELETE FROM tasks WHERE id = ANY($1::uuid[])', [[idA, idB]]);
    }
  });

  // ── C5: task_list — EMPTY (project with no tasks) ────────────────────────────────────
  test('C5: task_list empty {ok:true,results:[],total:0} conforms', async () => {
    // A fresh empty project so the list is genuinely empty.
    const emptyProj = (
      await db.query(
        `INSERT INTO projects (name, description) VALUES ($1, 'empty list fuse') RETURNING id`,
        [`outputschema-empty-${STAMP}`]
      )
    ).rows[0].id;
    try {
      const resp = await viaTool('task_list', { projectId: emptyProj });
      expect(resp.structuredContent.ok).toBe(true);
      expect(resp.structuredContent.results).toEqual([]);
      expect(resp.structuredContent.total).toBe(0);
      expectConformant('task_list', resp, 'empty');
    } finally {
      await db.query('DELETE FROM projects WHERE id = $1', [emptyProj]);
    }
  });

  // ── C6: project_info / project_current — not-found GET shape ─────────────────────────
  test('C6: project_info not-found GET shape conforms', async () => {
    const resp = await viaTool('project_info', { project: `no-such-project-${STAMP}` });
    // Whatever the handler's not-found shape is, it MUST validate against the declared schema.
    expectConformant('project_info', resp, 'not-found');
  });

  // ── C7: thread_current / thread_clear with NO active thread (empty success shapes) ───
  test('C7: thread_current + thread_clear with no active thread conform', async () => {
    const freshConn = `outputschema-nothread-${STAMP}`;
    const cur: any = await routeExecutor(
      'thread_current',
      validateToolArguments('thread_current', {}),
      { connectionId: freshConn }
    );
    expect(cur.structuredContent.ok).toBe(true);
    expect(cur.structuredContent.activeThread).toBeNull();
    expectConformant('thread_current', cur, 'no active thread');

    const clr: any = await routeExecutor(
      'thread_clear',
      validateToolArguments('thread_clear', {}),
      { connectionId: freshConn }
    );
    expect(clr.structuredContent.ok).toBe(true);
    expectConformant('thread_clear', clr, 'nothing to clear');
  });
});
