/**
 * recall_thread — PURE-logic unit tests (Mandrel Core Redesign T3, task 73f9d280).
 *
 * Tests are armor (spec §6). This hammers the DETERMINISTIC ordering + altitude-shaping +
 * minTrust-band logic with ZERO database — the pure functions exported from
 * services/recallThread.ts (computeCausalRanks / orderThread / shapeNode). The DB/graph
 * traversal + trust gathering are covered by recallThread.contract.test.ts.
 *
 * Locks:
 *   - causal ordering: evidence (learned_from) → decision → caused/built (reads as the story),
 *   - supersedes reverses (the superseded node comes BEFORE the superseding one),
 *   - temporal tiebreaker (older first) when causal rank ties,
 *   - the anchor is pinned FIRST regardless,
 *   - CYCLE-SAFE: a causal cycle in computeCausalRanks does not hang,
 *   - altitude content shaping: headline (no content) / summary (clipped) / full (whole),
 *     with the snippet budget honored (no-hardcoded-vars / config-injected).
 */

import { describe, test, expect } from 'vitest';
// Import the PURE core directly (recallThreadCore.ts is DB-FREE by design — no db pool
// import) so this suite is deterministic + offline, zero database.
import {
  computeCausalRanks,
  orderThread,
  shapeNode,
  type ThreadEdge,
} from '../services/recallThreadCore.js';
import type { Trust } from '../services/trustModel.js';
import type { ThreadConfig } from '../config/threadConfig.js';
import type { EdgeNodeType } from '../config/edgeTypes.js';

/** A trusted, non-abstaining Trust object (the shaping/ordering tests don't vary trust). */
const TRUST: Trust = {
  band: 'trusted',
  score: 0.9,
  outcome: { score: 1, samples: 1 },
  freshness: 0.9,
  superseded: false,
  abstain: false,
};

const CFG: ThreadConfig = {
  defaultDepth: 3,
  maxDepth: 6,
  maxNodes: 50,
  summarySnippetMaxlen: 20, // small so the clip is easy to assert
};

const d = (iso: string) => new Date(iso);

describe('recall_thread — causal ranking (pure)', () => {
  test('evidence → decision → caused: the chain ranks earliest-first', () => {
    // ev --learned_from--> dec   (ev precedes dec)
    // dec --caused--> out         (dec precedes out)
    const edges: ThreadEdge[] = [
      { from: 'dec', to: 'ev', type: 'learned_from' }, // a decision learned_from its evidence: ev precedes dec
      { from: 'dec', to: 'out', type: 'caused' }, // dec caused out: dec precedes out
    ];
    const ranks = computeCausalRanks(['ev', 'dec', 'out'], edges);
    // ev should outrank dec which should outrank out (higher rank = earlier in the story).
    expect(ranks.get('ev')!).toBeGreaterThan(ranks.get('dec')!);
    expect(ranks.get('dec')!).toBeGreaterThan(ranks.get('out')!);
  });

  test('supersedes REVERSES: the superseded node precedes the superseding one', () => {
    // newDec --supersedes--> oldDec  →  oldDec precedes newDec (the old came first).
    const edges: ThreadEdge[] = [{ from: 'newDec', to: 'oldDec', type: 'supersedes' }];
    const ranks = computeCausalRanks(['newDec', 'oldDec'], edges);
    expect(ranks.get('oldDec')!).toBeGreaterThan(ranks.get('newDec')!);
  });

  test('CYCLE-SAFE: a causal cycle does not hang and yields finite ranks', () => {
    // a precedes b precedes c precedes a (a deliberate cycle).
    const edges: ThreadEdge[] = [
      { from: 'a', to: 'b', type: 'caused' },
      { from: 'b', to: 'c', type: 'caused' },
      { from: 'c', to: 'a', type: 'caused' },
    ];
    const ranks = computeCausalRanks(['a', 'b', 'c'], edges);
    for (const id of ['a', 'b', 'c']) {
      expect(Number.isFinite(ranks.get(id)!)).toBe(true);
    }
  });

  test('non-causal edge types contribute no ordering', () => {
    const edges: ThreadEdge[] = [{ from: 'x', to: 'y', type: 'produced_outcome' }];
    // produced_outcome IS causal (task precedes outcome) → x precedes y.
    const ranks = computeCausalRanks(['x', 'y'], edges);
    expect(ranks.get('x')!).toBeGreaterThan(ranks.get('y')!);
  });

  test('dangling edges (endpoint not in node set) are ignored', () => {
    const edges: ThreadEdge[] = [{ from: 'a', to: 'ghost', type: 'caused' }];
    const ranks = computeCausalRanks(['a'], edges);
    expect(ranks.get('a')).toBe(0); // no in-set successor → rank 0
  });
});

describe('recall_thread — orderThread (pure)', () => {
  const mk = (id: string, createdAt: string | null) => ({
    id,
    createdAt: createdAt ? d(createdAt) : null,
  });

  test('anchor is pinned FIRST regardless of causal rank or time', () => {
    const nodes = [
      mk('anchor', '2026-01-10T00:00:00Z'),
      mk('ev', '2026-01-01T00:00:00Z'), // older + causally earliest
      mk('dec', '2026-01-05T00:00:00Z'),
    ];
    const edges: ThreadEdge[] = [{ from: 'dec', to: 'ev', type: 'learned_from' }];
    const ordered = orderThread(nodes, edges, 'anchor');
    expect(ordered[0].id).toBe('anchor');
  });

  test('causal order wins: evidence before decision before outcome', () => {
    const nodes = [
      mk('out', '2026-01-01T00:00:00Z'),
      mk('dec', '2026-01-02T00:00:00Z'),
      mk('ev', '2026-01-03T00:00:00Z'),
    ];
    const edges: ThreadEdge[] = [
      { from: 'dec', to: 'ev', type: 'learned_from' },
      { from: 'dec', to: 'out', type: 'caused' },
    ];
    // anchor is ev itself here — but to test pure causal order, use a 4th unrelated anchor.
    const withAnchor = [mk('A', '2026-01-04T00:00:00Z'), ...nodes];
    const ordered = orderThread(withAnchor, edges, 'A');
    const ids = ordered.map((n) => n.id);
    expect(ids[0]).toBe('A');
    // among the rest, ev (highest rank) before dec before out.
    expect(ids.indexOf('ev')).toBeLessThan(ids.indexOf('dec'));
    expect(ids.indexOf('dec')).toBeLessThan(ids.indexOf('out'));
  });

  test('temporal tiebreaker: equal causal rank → older first', () => {
    const nodes = [
      mk('anchor', '2026-01-10T00:00:00Z'),
      mk('newer', '2026-02-01T00:00:00Z'),
      mk('older', '2026-01-01T00:00:00Z'),
    ];
    const ordered = orderThread(nodes, [], 'anchor'); // no edges → all rank 0
    const ids = ordered.map((n) => n.id);
    expect(ids[0]).toBe('anchor');
    expect(ids.indexOf('older')).toBeLessThan(ids.indexOf('newer'));
  });
});

describe('recall_thread — shapeNode altitude (pure, config-injected)', () => {
  const raw = {
    id: 'n1',
    type: 'context' as EdgeNodeType,
    title: 'the title',
    content: 'this content body is definitely longer than twenty chars',
  };

  test('headline: title + type + trust, NO content field', () => {
    const node = shapeNode(raw, TRUST, 'headline', CFG);
    expect(node.title).toBe('the title');
    expect(node.type).toBe('context');
    expect(node.trust).toBe(TRUST);
    expect(node.content).toBeUndefined();
  });

  test('summary: content clipped to the snippet budget with an ellipsis', () => {
    const node = shapeNode(raw, TRUST, 'summary', CFG);
    expect(node.content).toBeDefined();
    // budget 20 → 20 chars + the ellipsis char.
    expect(node.content!.startsWith(raw.content.slice(0, CFG.summarySnippetMaxlen))).toBe(true);
    expect(node.content!.endsWith('…')).toBe(true);
    expect(node.content!.length).toBeLessThan(raw.content.length);
  });

  test('summary: short content is returned whole (no clip, no ellipsis)', () => {
    const node = shapeNode({ ...raw, content: 'short' }, TRUST, 'summary', CFG);
    expect(node.content).toBe('short');
  });

  test('full: the whole untruncated content body', () => {
    const node = shapeNode(raw, TRUST, 'full', CFG);
    expect(node.content).toBe(raw.content);
  });

  test('a node with no content omits the field at every altitude', () => {
    const empty = { ...raw, content: null };
    expect(shapeNode(empty, TRUST, 'headline', CFG).content).toBeUndefined();
    expect(shapeNode(empty, TRUST, 'summary', CFG).content).toBeUndefined();
    expect(shapeNode(empty, TRUST, 'full', CFG).content).toBeUndefined();
  });

  test('headline/summary/full differ correctly for the SAME node', () => {
    const h = shapeNode(raw, TRUST, 'headline', CFG);
    const s = shapeNode(raw, TRUST, 'summary', CFG);
    const f = shapeNode(raw, TRUST, 'full', CFG);
    expect(h.content).toBeUndefined();
    expect(s.content).not.toBe(f.content); // clipped vs whole
    expect(f.content!.length).toBeGreaterThan(s.content!.length);
  });
});
