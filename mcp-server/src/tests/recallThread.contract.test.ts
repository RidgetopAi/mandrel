/**
 * recall_thread — integration + adversarial contract tests (Mandrel Core Redesign T3,
 * task 73f9d280). THE headline pull tool, driven end-to-end.
 *
 * Tests are armor (spec §6). The pure ordering/altitude/causal logic is covered by
 * recallThread.unit.test.ts; THIS suite drives the REAL tool through validate →
 * routeExecutor (the EXACT path the HTTP bridge uses) against the CI Postgres, building
 * the graph with the PUBLIC tools (context_store/decision_record auto-mint edges from
 * threading tags; the `link` tool mints arbitrary typed edges), and asserts:
 *   - ANCHOR RESOLUTION: ref:<slug>, id8, and full uuid all resolve to the right node,
 *   - BFS to depth, BOTH directions, dedupe,
 *   - CYCLE-SAFETY: a self/loop edge does NOT hang and returns a finite thread,
 *   - edgeTypes filter restricts the walk,
 *   - minTrust filter drops low-trust nodes (never the anchor),
 *   - altitude content levels (headline/summary/full) DIFFER correctly,
 *   - trust annotation present on every node + the abstain list is correct,
 *   - max-nodes truncation signal is honest (truncated:true + a count),
 *   - ADVERSARIAL: unresolvable anchor → actionable error (no crash); anchor with NO
 *     edges → just the anchor node (not an error); a deep cycle; a huge fan-out hits the cap.
 *   - NO server-side LLM is invoked.
 *
 * Embedding service mocked → deterministic + offline (mirrors trust.contract).
 */

import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';

vi.unmock('crypto');
vi.unmock('node:crypto');

vi.mock('../services/embedding.js', () => ({
  embeddingService: {
    generateEmbedding: vi.fn(async () => ({
      embedding: new Array(1536).fill(0),
      dimensions: 1536,
      model: 'stub',
    })),
  },
}));

import { db } from '../config/database.js';
import { routeExecutor } from '../routes/index.js';
import { validateToolArguments } from '../middleware/validation.js';
import { buildThread } from '../services/recallThread.js';
import { THREAD_CONFIG, type ThreadConfig } from '../config/threadConfig.js';

const STAMP = Date.now();
const CONN = `recall-thread-conn-${STAMP}`;
const PROJ_NAME = `recall-thread-P-${STAMP}`;

let projectId: string;

function responseText(resp: any): string {
  return resp?.content?.map((c: any) => c.text).join('\n') ?? '';
}
const id8 = (uuid: string) => uuid.replace(/-/g, '').slice(0, 8);

async function viaTool(toolName: string, rawArgs: any): Promise<any> {
  const validated = validateToolArguments(toolName, rawArgs);
  return routeExecutor(toolName, validated, { connectionId: CONN });
}

async function storeContext(content: string, tags?: string[]): Promise<string> {
  const r = await viaTool('context_store', { content, type: 'planning', tags });
  return r.structuredContent.context.id;
}
async function recordDecision(title: string, outcomeStatus?: string): Promise<string> {
  const r = await viaTool('decision_record', {
    decisionType: 'architecture',
    title,
    description: 'd',
    rationale: 'r',
    impactLevel: 'medium',
    ...(outcomeStatus ? { outcomeStatus } : {}),
  });
  return r.structuredContent.decision.id;
}
async function link(from: string, fromType: string, to: string, toType: string, edgeType: string) {
  return viaTool('link', { from, fromType, to, toType, edgeType });
}

describe('recall_thread (T3) — traverse + trust + narrate, one call', () => {
  beforeAll(async () => {
    projectId = (
      await db.query(
        `INSERT INTO projects (name, description) VALUES ($1, 'recall_thread contract') RETURNING id`,
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

  // ── ANCHOR RESOLUTION ───────────────────────────────────────────────────────
  test('anchor resolution: ref:<slug> resolves to the tagged context', async () => {
    const slug = `ref:rt-resume-${STAMP}`;
    const ctxId = await storeContext('the resume handoff context', [slug]);
    const resp = await viaTool('recall_thread', { anchor: slug, altitude: 'headline' });
    expect(resp.structuredContent.ok).toBe(true);
    expect(resp.structuredContent.anchor).toBe(ctxId);
    expect(resp.structuredContent.nodes[0].id).toBe(ctxId); // anchor pinned first
  });

  test('anchor resolution: id8 and full uuid both resolve to the same node', async () => {
    const ctxId = await storeContext('anchor by id context');
    const byId8 = await viaTool('recall_thread', { anchor: id8(ctxId), altitude: 'headline' });
    const byUuid = await viaTool('recall_thread', { anchor: ctxId, altitude: 'headline' });
    expect(byId8.structuredContent.anchor).toBe(ctxId);
    expect(byUuid.structuredContent.anchor).toBe(ctxId);
  });

  // ── BFS / BOTH-DIRECTION / DEDUPE ───────────────────────────────────────────
  test('BFS both directions to depth: pulls the connected story; reads top-to-bottom', async () => {
    // evidence(ctx) --learned_from--> decision --caused--> outcome(ctx)
    const ev = await storeContext('evidence context for the story');
    const dec = await recordDecision(`the central decision ${STAMP}`, 'successful');
    const out = await storeContext('the outcome context of the story');
    await link(dec, 'decision', ev, 'context', 'learned_from');
    await link(dec, 'decision', out, 'context', 'caused');

    // Anchor on the DECISION; depth 1 reaches both neighbors (one in, one out direction).
    const resp = await viaTool('recall_thread', { anchor: id8(dec), altitude: 'summary', depth: 1 });
    const ids = resp.structuredContent.nodes.map((n: any) => n.id);
    expect(ids).toContain(dec);
    expect(ids).toContain(ev);
    expect(ids).toContain(out);
    expect(resp.structuredContent.nodes[0].id).toBe(dec); // anchor first
    // causal order: evidence (precedes dec) ranks earlier than the outcome (dec caused it).
    expect(ids.indexOf(ev)).toBeLessThan(ids.indexOf(out));
    // No duplicate nodes.
    expect(new Set(ids).size).toBe(ids.length);
    // The text channel reads as a numbered story.
    expect(responseText(resp)).toMatch(/📖 Thread for/);
  });

  test('depth bounds the walk: depth 1 excludes a 2-hop node that depth 2 includes', async () => {
    const a = await storeContext('chain node A');
    const b = await storeContext('chain node B');
    const c = await storeContext('chain node C (two hops from A)');
    await link(a, 'context', b, 'context', 'caused');
    await link(b, 'context', c, 'context', 'caused');

    const d1 = await viaTool('recall_thread', { anchor: id8(a), altitude: 'headline', depth: 1 });
    const d1ids = d1.structuredContent.nodes.map((n: any) => n.id);
    expect(d1ids).toContain(b);
    expect(d1ids).not.toContain(c); // 2 hops away — beyond depth 1

    const d2 = await viaTool('recall_thread', { anchor: id8(a), altitude: 'headline', depth: 2 });
    const d2ids = d2.structuredContent.nodes.map((n: any) => n.id);
    expect(d2ids).toContain(c); // now reached
  });

  // ── edgeTypes FILTER ────────────────────────────────────────────────────────
  test('edgeTypes filter restricts the walk', async () => {
    const root = await storeContext('filter root context');
    const viaCaused = await storeContext('reached via caused');
    const viaLearned = await storeContext('reached via learned_from');
    await link(root, 'context', viaCaused, 'context', 'caused');
    await link(root, 'context', viaLearned, 'context', 'learned_from');

    const onlyCaused = await viaTool('recall_thread', {
      anchor: id8(root), altitude: 'headline', edgeTypes: ['caused'],
    });
    const ids = onlyCaused.structuredContent.nodes.map((n: any) => n.id);
    expect(ids).toContain(viaCaused);
    expect(ids).not.toContain(viaLearned); // filtered out
  });

  // ── ALTITUDE content levels ─────────────────────────────────────────────────
  test('altitude content levels (headline/summary/full) differ correctly', async () => {
    // NB: context_store trims content, so use an already-trimmed body for the exact-length
    // assertion below (a trailing space would be stripped → off-by-one).
    const longBody =
      ('A long-form context body. ' + 'lorem ipsum dolor sit amet '.repeat(40)).trim();
    const ctxId = await storeContext(longBody);

    const headline = await viaTool('recall_thread', { anchor: id8(ctxId), altitude: 'headline' });
    const summary = await viaTool('recall_thread', { anchor: id8(ctxId), altitude: 'summary' });
    const full = await viaTool('recall_thread', { anchor: id8(ctxId), altitude: 'full' });

    const hNode = headline.structuredContent.nodes[0];
    const sNode = summary.structuredContent.nodes[0];
    const fNode = full.structuredContent.nodes[0];

    expect(hNode.content).toBeUndefined(); // headline = 1-liner, no content
    expect(sNode.content).toBeTruthy();
    expect(fNode.content).toBeTruthy();
    expect(sNode.content.length).toBeLessThan(fNode.content.length); // summary clipped
    expect(fNode.content.length).toBe(longBody.length); // full = whole body
    expect(summary.structuredContent.altitude).toBe('summary');
  });

  test('altitude defaults to summary when omitted', async () => {
    const ctxId = await storeContext('default altitude probe');
    const resp = await viaTool('recall_thread', { anchor: id8(ctxId) });
    expect(resp.structuredContent.altitude).toBe('summary');
  });

  // ── TRUST annotation + ABSTAIN list ─────────────────────────────────────────
  test('every node carries a well-formed trust object; abstain list is correct', async () => {
    // A context tied to a FAILED decision → it abstains; a fresh lonely context → it does not.
    const failDec = await recordDecision(`a failed decision ${STAMP}`, 'failed');
    const sinking = await storeContext('context tied to a failed decision', [`decision:${id8(failDec)}`]);
    const fresh = await storeContext('a fresh trustworthy context');
    await link(fresh, 'context', sinking, 'context', 'caused'); // thread them so both appear

    const resp = await viaTool('recall_thread', { anchor: id8(fresh), altitude: 'headline', depth: 2 });
    const nodes = resp.structuredContent.nodes;
    for (const n of nodes) {
      expect(n.trust).toBeTruthy();
      expect(['trusted', 'ok', 'unproven', 'stale', 'superseded', 'contradicted']).toContain(n.trust.band);
      expect(typeof n.trust.abstain).toBe('boolean');
    }
    const sinkNode = nodes.find((n: any) => n.id === sinking);
    expect(sinkNode.trust.abstain).toBe(true); // failed downstream → abstain
    expect(resp.structuredContent.abstain).toContain(sinking);
    expect(resp.structuredContent.abstain).not.toContain(fresh);
  });

  // ── minTrust FILTER ─────────────────────────────────────────────────────────
  test('minTrust filter drops low-trust nodes but NEVER the anchor', async () => {
    const failDec = await recordDecision(`mintrust failed decision ${STAMP}`, 'failed');
    const lowTrust = await storeContext('a low-trust (abstaining) context', [`decision:${id8(failDec)}`]);
    const anchor = await storeContext('the mintrust anchor context');
    await link(anchor, 'context', lowTrust, 'context', 'caused');

    // Floor at 'ok' band → the failed/abstaining low-trust node is dropped; anchor stays.
    const resp = await viaTool('recall_thread', {
      anchor: id8(anchor), altitude: 'headline', depth: 2, minTrust: 'ok',
    });
    const ids = resp.structuredContent.nodes.map((n: any) => n.id);
    expect(ids).toContain(anchor); // anchor never dropped
    expect(ids).not.toContain(lowTrust); // below the floor → hidden
  });

  // ── CYCLE-SAFETY ────────────────────────────────────────────────────────────
  test('CYCLE-SAFE: a 2-node loop edge does not hang and returns a finite thread', async () => {
    const x = await storeContext('cycle node X');
    const y = await storeContext('cycle node Y');
    await link(x, 'context', y, 'context', 'caused');
    await link(y, 'context', x, 'context', 'caused'); // the loop back

    const resp = await viaTool('recall_thread', { anchor: id8(x), altitude: 'headline', depth: 5 });
    const ids = resp.structuredContent.nodes.map((n: any) => n.id);
    expect(ids).toContain(x);
    expect(ids).toContain(y);
    expect(new Set(ids).size).toBe(ids.length); // each node once despite the cycle
  });

  test('CYCLE-SAFE: a deeper 3-node cycle terminates with a finite thread', async () => {
    const a = await storeContext('deep cycle A');
    const b = await storeContext('deep cycle B');
    const c = await storeContext('deep cycle C');
    await link(a, 'context', b, 'context', 'caused');
    await link(b, 'context', c, 'context', 'caused');
    await link(c, 'context', a, 'context', 'caused');

    const resp = await viaTool('recall_thread', { anchor: id8(a), altitude: 'headline', depth: 6 });
    const ids = resp.structuredContent.nodes.map((n: any) => n.id);
    expect(ids.sort()).toEqual([a, b, c].sort());
  });

  // ── ADVERSARIAL ─────────────────────────────────────────────────────────────
  test('adversarial: unresolvable anchor → actionable error, not a crash', async () => {
    const resp = await viaTool('recall_thread', { anchor: 'ref:does-not-exist-anywhere' });
    expect(resp.isError).toBe(true);
    expect(resp.structuredContent.ok).toBe(false);
    expect(responseText(resp)).toMatch(/recall_thread:/);
  });

  test('adversarial: a non-id, non-ref garbage anchor → actionable error', async () => {
    const resp = await viaTool('recall_thread', { anchor: 'not-a-valid-anchor-zzz' });
    expect(resp.isError).toBe(true);
    expect(responseText(resp)).toMatch(/not a ref|short id|UUID/i);
  });

  test('adversarial: an anchor with NO edges → just the anchor node (NOT an error)', async () => {
    const lonely = await storeContext('a lonely context with zero edges');
    const resp = await viaTool('recall_thread', { anchor: id8(lonely), altitude: 'summary' });
    expect(resp.isError).toBeFalsy();
    expect(resp.structuredContent.ok).toBe(true);
    expect(resp.structuredContent.nodes.length).toBe(1);
    expect(resp.structuredContent.nodes[0].id).toBe(lonely);
    expect(resp.structuredContent.edges.length).toBe(0);
    expect(resp.structuredContent.truncated).toBe(false);
  });

  test('adversarial: a huge fan-out hits the node cap with an HONEST truncation signal', async () => {
    // A hub with many neighbors. The cap (THREAD_MAX_NODES) is config-driven; to make the
    // assertion deterministic without depending on a process-wide env (config is read once
    // at module load), inject a TINY maxNodes config straight into the engine. This drives
    // the SAME traverse() cap path the tool uses, just with a small ceiling.
    const hub = await storeContext('the fan-out hub');
    const neighborCount = 6;
    for (let i = 0; i < neighborCount; i++) {
      const n = await storeContext(`fan-out neighbor ${i}`);
      await link(hub, 'context', n, 'context', 'caused');
    }
    const tinyCap: ThreadConfig = { ...THREAD_CONFIG, maxNodes: 3 };
    const result = await buildThread(
      { anchor: id8(hub), altitude: 'headline', depth: 1, projectId },
      tinyCap
    );
    // hub + (cap-1) neighbors = 3 nodes; the rest are reported truncated, never silently cut.
    expect(result.nodes.length).toBeLessThanOrEqual(3);
    expect(result.truncated).toBe(true);
    expect(result.truncatedCount).toBeGreaterThan(0);
    expect(result.nodes.some((n) => n.id === hub)).toBe(true); // anchor survives the cap
  });

  test('no server-side LLM: the engine + route source contain no LLM/API call', async () => {
    // Belt-and-braces with the grep proof in the report: assert at runtime that a thread
    // builds with NO network/LLM dependency available (the suite mocks embeddings only; if
    // recall_thread reached for an LLM it would need a key/client we never provide).
    const ctxId = await storeContext('llm-free probe context');
    const result = await buildThread(
      { anchor: id8(ctxId), altitude: 'summary', projectId },
      THREAD_CONFIG
    );
    expect(result.anchor).toBe(ctxId);
    expect(result.nodes.length).toBe(1);
  });
});
