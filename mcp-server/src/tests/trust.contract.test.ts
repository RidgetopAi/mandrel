/**
 * TRUST MODEL v1 — integration + adversarial contract tests (Mandrel Core Redesign T2b,
 * task 20e71fca). THE MOAT, surfaced default-on in recall.
 *
 * Tests are armor (spec §6). The pure math is covered by trustModel.unit.test.ts; THIS
 * suite drives the REAL recall tools through validate → routeExecutor (the EXACT path the
 * HTTP bridge uses) against the CI Postgres, and asserts:
 *   - context_search / context_get_recent / decision_search each return a WELL-FORMED
 *     trust object on every result row (default-on, structuredContent + text hint),
 *   - the moat path works end-to-end: a context that `informs` a SUCCESSFUL decision
 *     earns a high outcome score; a FAILED downstream sinks it,
 *   - ADVERSARIAL (the spec's hostile cases):
 *       · a record whose ONLY downstream outcome is too_early → `unproven`, NOT failed,
 *       · a SUPERSEDED decision → abstain even WITH good outcomes,
 *       · a record with NO edges → `unproven` (cold-start, not distrusted).
 *
 * Embedding service mocked → deterministic + offline (mirrors typedEdges.contract).
 */

import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';

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

const STAMP = Date.now();
const CONN = `trust-conn-${STAMP}`;
const PROJ_NAME = `trust-P-${STAMP}`;

let projectId: string;

function responseText(resp: any): string {
  return resp?.content?.map((c: any) => c.text).join('\n') ?? '';
}
const id8 = (uuid: string) => uuid.replace(/-/g, '').slice(0, 8);

async function viaTool(toolName: string, rawArgs: any): Promise<any> {
  const validated = validateToolArguments(toolName, rawArgs);
  return routeExecutor(toolName, validated, { connectionId: CONN });
}

/** Assert the shape of a trust object (the §8.1 output contract). */
function assertWellFormedTrust(trust: any) {
  expect(trust, 'trust object present').toBeTruthy();
  expect(typeof trust.band).toBe('string');
  expect(['trusted', 'ok', 'unproven', 'stale', 'superseded', 'contradicted']).toContain(trust.band);
  // score is a number or null (null only at cold-start outcome; the blended score is set).
  expect(trust.score === null || typeof trust.score === 'number').toBe(true);
  expect(trust.outcome).toBeTruthy();
  expect(trust.outcome.score === null || typeof trust.outcome.score === 'number').toBe(true);
  expect(typeof trust.outcome.samples).toBe('number');
  expect(typeof trust.freshness).toBe('number');
  expect(typeof trust.superseded).toBe('boolean');
  expect(typeof trust.abstain).toBe('boolean');
}

describe('trust model (T2b) — surfaced default-on in recall', () => {
  beforeAll(async () => {
    projectId = (
      await db.query(
        `INSERT INTO projects (name, description) VALUES ($1, 'trust contract') RETURNING id`,
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

  // ── DEFAULT-ON shape on all three recall tools ──────────────────────────────
  test('context_search returns a well-formed trust object on every row (default-on)', async () => {
    await viaTool('context_store', { content: 'searchable trust row', type: 'planning' });
    const resp = await viaTool('context_search', { query: 'searchable trust row' });
    expect(resp.structuredContent.results.length).toBeGreaterThan(0);
    for (const row of resp.structuredContent.results) assertWellFormedTrust(row.trust);
    // The compact human hint rides the text channel too.
    expect(responseText(resp)).toMatch(/🔐 Trust:/);
  });

  test('context_get_recent returns a well-formed trust object on every row (default-on, boot path)', async () => {
    await viaTool('context_store', { content: 'recent trust row', type: 'milestone' });
    const resp = await viaTool('context_get_recent', { limit: 5 });
    expect(resp.structuredContent.results.length).toBeGreaterThan(0);
    for (const row of resp.structuredContent.results) assertWellFormedTrust(row.trust);
    expect(responseText(resp)).toMatch(/🔐 Trust:/);
  });

  test('decision_search returns a well-formed trust object on every row (default-on)', async () => {
    await viaTool('decision_record', {
      decisionType: 'architecture', title: 'trust-search decision', description: 'd',
      rationale: 'r', impactLevel: 'medium',
    });
    const resp = await viaTool('decision_search', { query: 'trust-search decision' });
    // decision_search uses `data` → promoted to structuredContent by the route executor.
    const rows = resp.structuredContent.results;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) assertWellFormedTrust(row.trust);
    expect(responseText(resp)).toMatch(/🔐 Trust:/);
  });

  // ── THE MOAT: outcome propagates along edges ────────────────────────────────
  test('a context informing a SUCCESSFUL decision earns outcome evidence (the moat path)', async () => {
    // A decision scored successful by the loop.
    const decResp = await viaTool('decision_record', {
      decisionType: 'pattern', title: 'the successful decision', description: 'd',
      rationale: 'r', impactLevel: 'high', outcomeStatus: 'successful',
    });
    const decId = decResp.structuredContent.decision.id;

    // A context that `decided_by` that decision (auto-mints a decided_by edge — an outcome
    // edge type) → it inherits the decision's successful outcome.
    const ctxResp = await viaTool('context_store', {
      content: 'context that laddered up to the successful decision',
      type: 'discussion',
      tags: [`decision:${id8(decId)}`],
    });
    const ctxId = ctxResp.structuredContent.context.id;

    const search = await viaTool('context_search', { query: 'laddered up to the successful decision' });
    const row = search.structuredContent.results.find((r: any) => r.id === ctxId);
    expect(row, 'the context is in the results').toBeTruthy();
    assertWellFormedTrust(row.trust);
    // It has counted outcome evidence (the successful decision) → outcome.score = 1, samples ≥ 1.
    expect(row.trust.outcome.samples).toBeGreaterThanOrEqual(1);
    expect(row.trust.outcome.score).toBe(1);
    // With a successful outcome + (fresh) it should be trusted, and NOT abstain.
    expect(row.trust.band).toBe('trusted');
    expect(row.trust.abstain).toBe(false);
  });

  test('a context informing a FAILED decision sinks its outcome score', async () => {
    const decResp = await viaTool('decision_record', {
      decisionType: 'pattern', title: 'the failed decision', description: 'd',
      rationale: 'r', impactLevel: 'high', outcomeStatus: 'failed',
    });
    const decId = decResp.structuredContent.decision.id;
    const ctxResp = await viaTool('context_store', {
      content: 'context tied to the failed decision', type: 'discussion',
      tags: [`decision:${id8(decId)}`],
    });
    const ctxId = ctxResp.structuredContent.context.id;

    const search = await viaTool('context_search', { query: 'context tied to the failed decision' });
    const row = search.structuredContent.results.find((r: any) => r.id === ctxId);
    expect(row).toBeTruthy();
    expect(row.trust.outcome.samples).toBeGreaterThanOrEqual(1);
    expect(row.trust.outcome.score).toBe(0); // failed → 0
    // Failed outcome → low blended score → abstain.
    expect(row.trust.abstain).toBe(true);
  });

  // ── ADVERSARIAL ─────────────────────────────────────────────────────────────
  test('adversarial: a record whose ONLY downstream outcome is too_early → unproven, NOT failed', async () => {
    const decResp = await viaTool('decision_record', {
      decisionType: 'pattern', title: 'a too-early decision', description: 'd',
      rationale: 'r', impactLevel: 'low', outcomeStatus: 'too_early',
    });
    const decId = decResp.structuredContent.decision.id;
    const ctxResp = await viaTool('context_store', {
      content: 'context tied only to a too-early decision', type: 'discussion',
      tags: [`decision:${id8(decId)}`],
    });
    const ctxId = ctxResp.structuredContent.context.id;

    const search = await viaTool('context_search', { query: 'context tied only to a too-early decision' });
    const row = search.structuredContent.results.find((r: any) => r.id === ctxId);
    expect(row).toBeTruthy();
    // too_early is IGNORED → 0 counted outcomes → cold-start.
    expect(row.trust.outcome.samples).toBe(0);
    expect(row.trust.outcome.score).toBeNull();
    expect(row.trust.band).toBe('unproven'); // crucially NOT a failed/low band
    expect(row.trust.abstain).toBe(false); // fresh → not distrusted
  });

  test('adversarial: a SUPERSEDED decision abstains even WITH a good outcome', async () => {
    // The decision being superseded — give it a SUCCESSFUL outcome so only supersession
    // can drive the abstain.
    const oldResp = await viaTool('decision_record', {
      decisionType: 'pattern', title: 'the superseded-but-successful decision', description: 'd',
      rationale: 'r', impactLevel: 'high', outcomeStatus: 'successful',
    });
    const oldId = oldResp.structuredContent.decision.id;
    // A newer decision that supersedes it (auto-mints a supersedes edge → reverse-points at old).
    const newResp = await viaTool('decision_record', {
      decisionType: 'pattern', title: 'the replacement decision', description: 'd',
      rationale: 'r', impactLevel: 'high',
    });
    const newId = newResp.structuredContent.decision.id;
    await viaTool('decision_update', { decisionId: newId, supersededBy: oldId, status: 'superseded' });

    const search = await viaTool('decision_search', { query: 'the superseded-but-successful decision' });
    const row = search.structuredContent.results.find((r: any) => r.id === oldId);
    expect(row, 'the superseded decision is in the results').toBeTruthy();
    assertWellFormedTrust(row.trust);
    expect(row.trust.superseded).toBe(true);
    expect(row.trust.band).toBe('superseded'); // override caps the band
    expect(row.trust.abstain).toBe(true); // abstain DESPITE the successful outcome
  });

  test('adversarial: a record with NO edges → unproven (cold-start, not distrusted)', async () => {
    const ctxResp = await viaTool('context_store', {
      content: 'a lonely context with no edges at all', type: 'planning',
    });
    const ctxId = ctxResp.structuredContent.context.id;

    const search = await viaTool('context_search', { query: 'a lonely context with no edges at all' });
    const row = search.structuredContent.results.find((r: any) => r.id === ctxId);
    expect(row).toBeTruthy();
    expect(row.trust.outcome.samples).toBe(0);
    expect(row.trust.outcome.score).toBeNull();
    expect(row.trust.band).toBe('unproven'); // cold-start — NOT distrusted
    expect(row.trust.superseded).toBe(false);
    expect(row.trust.abstain).toBe(false); // freshly stored → fresh → lean on freshness
  });
});
