/**
 * recall_thread — the PURE core (Mandrel Core Redesign T3, task 73f9d280).
 *
 * This module is DB-FREE on purpose (no `pg` / no db import). It holds the deterministic
 * ordering + altitude-shaping + minTrust logic — the part that turns a gathered subgraph
 * into a readable, trust-ranked thread:
 *   - computeCausalRanks() — causal partial order from edge semantics (cycle-safe).
 *   - orderThread()        — causal-then-temporal sort, anchor pinned first.
 *   - shapeNode()          — altitude content shaping (headline/summary/full).
 *   - clearsMinTrust()     — the band/score floor (reuses the T2b band vocabulary).
 *
 * Keeping it here (no db) means the unit tests hammer it with ZERO database — deterministic,
 * offline, fast — exactly like trustModel.ts splits the pure math out of trust.ts (Lesson
 * 011: one definition of the rule, testable in isolation). The DB/graph GATHERING lives in
 * services/recallThread.ts, which imports these.
 */

import type { Trust } from './trustModel.js';
import { TRUST_BANDS, type TrustBand } from '../config/trustConfig.js';
import type { ThreadConfig, ThreadAltitude } from '../config/threadConfig.js';
import { type EdgeNodeType, type EdgeType } from '../config/edgeTypes.js';

/** One ordered, trust-annotated, altitude-shaped node in the returned thread. */
export interface ThreadNode {
  id: string;
  type: EdgeNodeType;
  title: string | null;
  trust: Trust;
  /** Present at `summary` (snippet) / `full` (whole body); omitted at `headline`. */
  content?: string;
}

/** One edge in the collected subgraph (from → to, by type). */
export interface ThreadEdge {
  from: string;
  to: string;
  type: EdgeType;
}

// ─────────────────────────────────────────────────────────────────────────────
// minTrust — band/score floor (REUSES the T2b band vocabulary; no new trust math)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The bands ordered most→least trustworthy (the T2b display order). Used to compare a
 * node's band against a `minTrust` BAND floor. superseded/contradicted are the bottom —
 * a minTrust of any quality band drops them.
 */
const BAND_RANK: Record<TrustBand, number> = TRUST_BANDS.reduce((acc, b, i) => {
  acc[b] = TRUST_BANDS.length - i; // trusted highest
  return acc;
}, {} as Record<TrustBand, number>);

/**
 * Does `trust` clear the `minTrust` floor? `minTrust` may be a BAND name (compare by the
 * display rank) OR a numeric score in [0,1] (compare blended score). Returns true when no
 * floor is set. (The ANCHOR is exempted by the caller, never here.)
 */
export function clearsMinTrust(trust: Trust, minTrust: TrustBand | number | undefined): boolean {
  if (minTrust === undefined) return true;
  if (typeof minTrust === 'number') {
    const s = trust.score ?? 0; // blended score is never null in practice; guard anyway
    return s >= minTrust;
  }
  const floorRank = BAND_RANK[minTrust];
  const nodeRank = BAND_RANK[trust.band as TrustBand];
  if (floorRank === undefined || nodeRank === undefined) return true; // unknown floor → no-op
  return nodeRank >= floorRank;
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDERING — causal-by-edge-semantics, then temporal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Edge causal SEMANTICS → which endpoint comes EARLIER in the story. The intent (spec §4):
 * a decision's evidence/contexts come BEFORE the decision, which comes BEFORE what it
 * caused/built. Each v1 edge type maps to a precedence DIRECTION:
 *   'forward'  → from precedes to.
 *   'reverse'  → to precedes from.
 *   (absent)   → carries no ordering (not in this map).
 *
 * The direction reflects what the edge MEANS (stored from→to per edgeTypes.ts):
 *   - learned_from (from cites to as evidence)      → REVERSE: the evidence (to) came first.
 *   - decided_by   (record → the decision it fed)   → FORWARD: the grounding precedes the decision.
 *   - caused       (from caused to)                 → FORWARD.
 *   - informs      (record → the task it fed)       → FORWARD: the record precedes the task.
 *   - produced_outcome (task → its outcome)         → FORWARD: the task precedes the outcome.
 *   - built_by     (artifact → the task that built it) → REVERSE: the build task came first.
 *   - proposed_by  (proposed → the proposer)        → REVERSE: the proposer came first.
 *   - supersedes   (newer → the one it replaces)    → REVERSE: the superseded came first.
 */
const CAUSAL_DIRECTION: Partial<Record<EdgeType, 'forward' | 'reverse'>> = {
  learned_from: 'reverse',
  decided_by: 'forward',
  caused: 'forward',
  informs: 'forward',
  produced_outcome: 'forward',
  built_by: 'reverse',
  proposed_by: 'reverse',
  supersedes: 'reverse',
};

/**
 * Compute a causal "rank" per node from the edges: a longest-downstream-chain depth in the
 * causal DAG. Higher rank = EARLIER in the story (more flows from it). Cycle-safe (a node on
 * the current DFS stack returns 0 rather than recursing → a causal cycle can't hang). Pure;
 * edges whose endpoints aren't both in the node set are ignored (dangling).
 */
export function computeCausalRanks(nodeIds: string[], edges: ThreadEdge[]): Map<string, number> {
  const idset = new Set(nodeIds);
  const precedes = new Map<string, Set<string>>();
  for (const id of nodeIds) precedes.set(id, new Set());
  for (const e of edges) {
    if (!idset.has(e.from) || !idset.has(e.to)) continue;
    const dir = CAUSAL_DIRECTION[e.type];
    if (!dir) continue; // edge type carries no ordering
    // 'forward' → from precedes to; 'reverse' → to precedes from.
    const [a, b] = dir === 'reverse' ? [e.to, e.from] : [e.from, e.to];
    if (a === b) continue; // self-loop contributes no ordering
    precedes.get(a)!.add(b); // a comes before b
  }

  const rank = new Map<string, number>();
  const onStack = new Set<string>();
  function depthOf(id: string): number {
    if (rank.has(id)) return rank.get(id)!;
    if (onStack.has(id)) return 0; // cycle backstop — break without recursing
    onStack.add(id);
    let best = 0;
    for (const nxt of precedes.get(id) ?? []) best = Math.max(best, depthOf(nxt) + 1);
    onStack.delete(id);
    rank.set(id, best);
    return best;
  }
  for (const id of nodeIds) depthOf(id);
  return rank;
}

/**
 * Order the nodes into the readable thread (PURE). Sort key, in order:
 *   1. ANCHOR pinned FIRST (you asked to be read in ON it).
 *   2. CAUSAL: higher causal rank first (more flows FROM it → earlier in the story).
 *   3. TEMPORAL: older created_at first (tiebreaker — earlier in time reads first).
 *   4. STABLE: id (deterministic for identical-rank, identical-time nodes).
 */
export function orderThread<T extends { id: string; createdAt: Date | null }>(
  nodes: T[],
  edges: ThreadEdge[],
  anchorId: string
): T[] {
  const ranks = computeCausalRanks(nodes.map((n) => n.id), edges);
  const time = (n: T): number => (n.createdAt ? n.createdAt.getTime() : Number.POSITIVE_INFINITY);
  return [...nodes].sort((a, b) => {
    if (a.id === anchorId) return -1;
    if (b.id === anchorId) return 1;
    const ra = ranks.get(a.id) ?? 0;
    const rb = ranks.get(b.id) ?? 0;
    if (ra !== rb) return rb - ra; // higher rank first
    const ta = time(a);
    const tb = time(b);
    if (ta !== tb) return ta - tb; // older first
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ALTITUDE SHAPING — content depth per node
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shape ONE node's content for the requested altitude (PURE):
 *   - headline → no content field at all (title + type + trust is the 1-liner).
 *   - summary  → content clipped to config.summarySnippetMaxlen (ellipsis when longer).
 *   - full     → the whole, untruncated content body.
 * A node with no content body simply omits the field at summary/full too.
 */
export function shapeNode(
  raw: { id: string; type: EdgeNodeType; title: string | null; content: string | null },
  trust: Trust,
  altitude: ThreadAltitude,
  config: ThreadConfig
): ThreadNode {
  const node: ThreadNode = { id: raw.id, type: raw.type, title: raw.title, trust };
  if (altitude === 'headline') return node; // 1-liner: no content
  const body = raw.content ?? '';
  if (!body) return node; // nothing to show
  if (altitude === 'full') {
    node.content = body;
    return node;
  }
  // summary: clip to the thread's own snippet budget (config-driven; no magic number).
  node.content =
    body.length <= config.summarySnippetMaxlen
      ? body
      : body.slice(0, config.summarySnippetMaxlen) + '…';
  return node;
}
