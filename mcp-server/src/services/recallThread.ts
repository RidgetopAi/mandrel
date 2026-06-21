/**
 * recall_thread — THE traversal-narrative engine (Mandrel Core Redesign T3, task 73f9d280).
 * THE HEADLINE PULL TOOL: "read me in on the story of X, at altitude Y, and what to trust."
 *
 * DESIGN (Ridge, LOCKED): v1 is DETERMINISTIC — NO server-side LLM. Mandrel is a product
 * that runs in customer containers; it must not depend on an LLM/API key. This engine does
 * the hard part — traverse + order + trust-annotate + altitude-prune — and returns a clean,
 * trust-ranked, causally+temporally ordered thread. The CONSUMING agent narrates it (it has
 * its own model). Nothing here calls claude/any LLM.
 *
 * REUSE, don't reimplement (the two shipped foundations):
 *   - the typed-edge graph: services/links.ts:getLinks() walks edges in BOTH directions
 *     with the connected node already hydrated (id/type/title). The BFS below calls it per
 *     frontier node — zero raw graph SQL in this engine.
 *   - trust: services/trust.ts:trustForRecords() computes the band/score/abstain per node
 *     from the loop's outcomes (the moat). We annotate every collected node with it and
 *     derive the abstain list from it. The trust MATH is not re-implemented here.
 *
 * The engine is two layers (Lesson 011 — one definition, testable in isolation):
 *   1. PURE ordering + altitude shaping (orderThread / shapeNode) — no DB, unit-tested.
 *   2. buildThread() — gather (BFS via getLinks) + hydrate + trust (trustForRecords) +
 *      order + shape. Contract-tested against the disposable DB.
 *
 * SECURITY: every DB read binds ids as PARAMETERS — never string-built.
 */

import type { Pool } from 'pg';
import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { getLinks } from './links.js';
import { trustForRecords, type RecordRef } from './trust.js';
import type { Trust } from './trustModel.js';
import { type TrustBand } from '../config/trustConfig.js';
import {
  THREAD_CONFIG,
  type ThreadConfig,
  type ThreadAltitude,
} from '../config/threadConfig.js';
import { EDGE_NODE_TYPES, type EdgeNodeType, type EdgeType } from '../config/edgeTypes.js';
import {
  orderThread,
  shapeNode,
  clearsMinTrust,
  type ThreadNode,
  type ThreadEdge,
} from './recallThreadCore.js';

// Re-export the PURE core surface so existing import sites keep working — the pure
// functions/types LIVE in recallThreadCore.ts (DB-free, unit-testable in isolation) and
// are re-exported here for ergonomics (mirrors trust.ts re-exporting trustModel.ts).
export { computeCausalRanks, orderThread, shapeNode } from './recallThreadCore.js';
export type { ThreadNode, ThreadEdge } from './recallThreadCore.js';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** A raw node as gathered from the graph (before trust + altitude shaping). */
interface RawNode {
  id: string;
  type: EdgeNodeType;
  /** Title (tasks/decisions) or a content-derived label (contexts). */
  title: string | null;
  /** Full content body (contexts: content; decisions: rationale/description; tasks: desc). */
  content: string | null;
  createdAt: Date | null;
  /** The BFS depth at which this node was first reached (anchor = 0). */
  depth: number;
}

/** The full result the route renders into structuredContent + the text channel. */
export interface ThreadResult {
  anchor: string;
  altitude: ThreadAltitude;
  /** Ordered nodes (top-to-bottom reads as the story). */
  nodes: ThreadNode[];
  edges: ThreadEdge[];
  /** Ids the agent should NOT rely on (trust.abstain) — pulled out for a quick scan. */
  abstain: string[];
  /** True when the node cap was hit (more was reachable). Honest, never silent. */
  truncated: boolean;
  /** How many MORE distinct nodes were reachable but dropped by the cap (0 when !truncated). */
  truncatedCount: number;
  /** The effective depth actually walked (after clamping to maxDepth). */
  depthUsed: number;
}

/** Anchor resolution failures (actionable; surfaced as a tool error, not a crash). */
export class AnchorUnresolvableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnchorUnresolvableError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANCHOR RESOLUTION — ref:<slug> | id8 | uuid → a concrete (id, type) node
// ─────────────────────────────────────────────────────────────────────────────

/** A resolved anchor: the concrete record the walk starts from. */
export interface ResolvedAnchor {
  id: string;
  type: EdgeNodeType;
}

/**
 * Resolve the `anchor` arg to a concrete (id, type), project-scoped. Three forms:
 *   - "ref:<slug>"      → the context tagged with that exact ref tag (the resume/handle path).
 *   - a full UUID / id8 → matched against contexts, then decisions, then tasks (first
 *                         unambiguous hit wins). Project-scoped so a prefix is collision-safe.
 *
 * Throws AnchorUnresolvableError with an ACTIONABLE message when nothing matches or a
 * ref/short-id is ambiguous (lists what to do) — never a raw DB error.
 */
export async function resolveAnchor(
  anchor: string,
  projectId: string | undefined,
  pool: Pool = db
): Promise<ResolvedAnchor> {
  const raw = (anchor ?? '').trim();
  if (!raw) {
    throw new AnchorUnresolvableError('anchor is empty — pass a ref:<slug>, a short id, or a full UUID.');
  }

  // ── ref:<slug> → the context carrying that exact tag ──────────────────────────
  if (raw.toLowerCase().startsWith('ref:')) {
    const slug = raw; // keep the full `ref:<slug>` — that's exactly what's stored in tags
    const params: any[] = [slug];
    let sql =
      `SELECT id FROM contexts WHERE tags @> ARRAY[$1]::text[] AND archived_at IS NULL`;
    if (projectId) {
      params.push(projectId);
      sql += ` AND project_id = $${params.length}`;
    }
    sql += ` ORDER BY created_at DESC LIMIT 2`;
    const rows = (await pool.query(sql, params)).rows;
    if (rows.length === 0) {
      throw new AnchorUnresolvableError(
        `No context is tagged "${slug}". A ref pointer resolves to the context carrying that ` +
          `exact tag. Check the slug, or use context_search to find the record and pass its id.`
      );
    }
    // A ref pointer (e.g. ref:resume) is MOVING by design — newest wins. Multiple matches
    // is expected (each new handoff carries the tag); take the most recent, not an error.
    return { id: rows[0].id, type: 'context' };
  }

  // ── id8 / full uuid → first unambiguous record across the three entity tables ──
  const isFull = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
  const hexOnly = raw.replace(/-/g, '').toLowerCase();
  if (!isFull && !(hexOnly.length >= 8 && /^[0-9a-f]+$/.test(hexOnly))) {
    throw new AnchorUnresolvableError(
      `"${raw}" is not a ref:<slug>, a full UUID, or an 8+-hex short id. Pass one of those.`
    );
  }

  // Try each entity table by prefix (full uuid → exact). Collect ALL hits so we can report
  // ambiguity honestly (a short id colliding across types/rows is a real, surfaceable case).
  const TABLES: { type: EdgeNodeType; table: string }[] = [
    { type: 'context', table: 'contexts' },
    { type: 'decision', table: 'technical_decisions' },
    { type: 'task', table: 'tasks' },
  ];
  const hits: ResolvedAnchor[] = [];
  for (const { type, table } of TABLES) {
    const params: any[] = [isFull ? raw.toLowerCase() : hexOnly];
    let where = isFull ? `id::text = $1` : `id::text LIKE $1 || '%'`;
    if (projectId) {
      params.push(projectId);
      where += ` AND project_id = $${params.length}`;
    }
    const rows = (
      await pool.query(`SELECT id::text AS id FROM ${table} WHERE ${where} LIMIT 5`, params)
    ).rows;
    for (const r of rows) hits.push({ id: r.id, type });
  }

  if (hits.length === 0) {
    throw new AnchorUnresolvableError(
      `No context/decision/task matches "${raw}" in this project. ` +
        `Use context_search / decision_search / task_list to find it and copy its 🆔 ID.`
    );
  }
  if (hits.length > 1) {
    const list = hits.map((h) => `${h.type} ${h.id}`).join(', ');
    throw new AnchorUnresolvableError(
      `"${raw}" is ambiguous — it matches ${hits.length} records (${list}). ` +
        `Re-run recall_thread with the FULL id of the one you mean.`
    );
  }
  return hits[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE HYDRATION — load title/content/createdAt for a set of (id,type) nodes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hydrate title/content/createdAt for each (id,type). One query per entity table for the
 * whole batch (= ANY($1)) — cheap regardless of thread size. A missing referent (edge to a
 * deleted row) is simply omitted from the map; the caller drops it (never throws).
 */
async function hydrateNodes(
  refs: { id: string; type: EdgeNodeType }[],
  pool: Pool
): Promise<Map<string, { title: string | null; content: string | null; createdAt: Date | null }>> {
  const out = new Map<string, { title: string | null; content: string | null; createdAt: Date | null }>();
  const byType: Record<EdgeNodeType, string[]> = { context: [], decision: [], task: [] };
  for (const r of refs) if (byType[r.type]) byType[r.type].push(r.id);

  // contexts: no title column → derive a label from content; content body is `content`.
  if (byType.context.length) {
    const rows = (
      await pool.query(
        `SELECT id::text AS id, content, created_at FROM contexts WHERE id = ANY($1::uuid[])`,
        [byType.context]
      )
    ).rows;
    for (const r of rows) {
      const body = (r.content ?? '') as string;
      out.set(r.id, {
        title: deriveContextTitle(body),
        content: body,
        createdAt: r.created_at ?? null,
      });
    }
  }
  // decisions: title is `title`; the "content" we surface is the rationale (fallback desc).
  if (byType.decision.length) {
    const rows = (
      await pool.query(
        `SELECT id::text AS id, title, rationale, description, decision_date
           FROM technical_decisions WHERE id = ANY($1::uuid[])`,
        [byType.decision]
      )
    ).rows;
    for (const r of rows) {
      out.set(r.id, {
        title: r.title ?? null,
        content: (r.rationale || r.description || '') as string,
        createdAt: r.decision_date ?? null,
      });
    }
  }
  // tasks: title is `title`; content is the description.
  if (byType.task.length) {
    const rows = (
      await pool.query(
        `SELECT id::text AS id, title, description, created_at FROM tasks WHERE id = ANY($1::uuid[])`,
        [byType.task]
      )
    ).rows;
    for (const r of rows) {
      out.set(r.id, {
        title: r.title ?? null,
        content: (r.description || '') as string,
        createdAt: r.created_at ?? null,
      });
    }
  }
  return out;
}

/** A short, human-readable label for a context (which has no title column). */
function deriveContextTitle(content: string): string | null {
  const trimmed = (content ?? '').trim();
  if (!trimmed) return null;
  const firstLine = trimmed.split('\n')[0].replace(/\s+/g, ' ').trim();
  return firstLine.length > 80 ? firstLine.slice(0, 80) + '…' : firstLine;
}

// ─────────────────────────────────────────────────────────────────────────────
// BFS TRAVERSAL — both directions, cycle-safe, capped, edgeTypes-filtered
// ─────────────────────────────────────────────────────────────────────────────

/** What the BFS returns before trust/ordering. */
interface Traversal {
  nodes: Map<string, RawNode>;
  edges: ThreadEdge[];
  truncated: boolean;
  /** Distinct reachable-but-dropped nodes (best-effort count for the honest signal). */
  truncatedCount: number;
}

/**
 * BFS from the anchor outward in BOTH directions (getLinks handles direction). Cycle-safe
 * via a `visited` set keyed by id (a self-loop or a back-edge re-points at a visited node →
 * recorded as an edge but never re-enqueued). Caps at config.maxNodes DISTINCT nodes; once
 * full it stops ENQUEUEING new nodes but still records edges between already-seen nodes and
 * counts the distinct overflow so the caller can report "N more" honestly.
 */
async function traverse(
  anchor: ResolvedAnchor,
  opts: {
    depth: number;
    edgeTypes?: EdgeType[];
    config: ThreadConfig;
  },
  pool: Pool
): Promise<Traversal> {
  const { depth, edgeTypes, config } = opts;
  const nodes = new Map<string, RawNode>();
  const edges: ThreadEdge[] = [];
  const edgeKeys = new Set<string>(); // dedupe edges (from|to|type)
  const overflow = new Set<string>(); // distinct reachable nodes dropped by the cap
  let truncated = false;

  // Seed with the anchor (depth 0). It always survives (you asked for its story).
  nodes.set(anchor.id, {
    id: anchor.id,
    type: anchor.type,
    title: null,
    content: null,
    createdAt: null,
    depth: 0,
  });

  // The frontier: nodes whose neighbors we still need to expand.
  let frontier: { id: string; type: EdgeNodeType; depth: number }[] = [
    { id: anchor.id, type: anchor.type, depth: 0 },
  ];

  for (let d = 0; d < depth && frontier.length > 0; d++) {
    const next: { id: string; type: EdgeNodeType; depth: number }[] = [];
    for (const node of frontier) {
      // Pull this node's edges (both directions, hydrated) via the REUSED links service.
      let connected;
      try {
        connected = await getLinks(node.id, { direction: 'both', edgeTypes }, pool);
      } catch (e) {
        logger.warn(`recall_thread: getLinks failed for ${node.id} — skipping its edges`, {
          metadata: { error: (e as Error)?.message },
        });
        continue;
      }

      for (const ce of connected) {
        if (!EDGE_NODE_TYPES.includes(ce.connectedType)) continue; // unknown endpoint kind → skip

        // Record the edge in canonical from→to orientation (getLinks gives direction).
        const from = ce.direction === 'out' ? node.id : ce.connectedId;
        const to = ce.direction === 'out' ? ce.connectedId : node.id;
        const ekey = `${from}|${to}|${ce.edgeType}`;
        if (!edgeKeys.has(ekey)) {
          edgeKeys.add(ekey);
          edges.push({ from, to, type: ce.edgeType });
        }

        // CYCLE-SAFE: a connection to an ALREADY-VISITED node is recorded as an edge
        // (above) but NEVER re-enqueued — so a self-loop or a back-edge cannot recurse.
        if (nodes.has(ce.connectedId)) continue;

        // CAP: stop ADDING new nodes once full; count distinct overflow for the honest signal.
        if (nodes.size >= config.maxNodes) {
          truncated = true;
          overflow.add(ce.connectedId);
          continue;
        }

        nodes.set(ce.connectedId, {
          id: ce.connectedId,
          type: ce.connectedType,
          title: ce.connectedTitle, // best-effort label from getLinks; re-hydrated below
          content: null,
          createdAt: null,
          depth: d + 1,
        });
        next.push({ id: ce.connectedId, type: ce.connectedType, depth: d + 1 });
      }
    }
    frontier = next;
  }

  return { nodes, edges, truncated, truncatedCount: overflow.size };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE ENGINE — gather + trust + order + shape
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildThreadArgs {
  anchor: string;
  altitude: ThreadAltitude;
  edgeTypes?: EdgeType[];
  depth?: number;
  minTrust?: TrustBand | number;
  projectId?: string;
}

/**
 * Build the full thread for an anchor (the route's single entry point). Steps:
 *   1. resolve the anchor (ref/id8/uuid) → throws AnchorUnresolvableError if unresolvable.
 *   2. BFS both directions to the effective depth (clamped to maxDepth), capped at maxNodes.
 *   3. hydrate titles/content/createdAt for every collected node (drop dangling referents,
 *      but ALWAYS keep the anchor).
 *   4. trust-annotate every node (REUSE trustForRecords) — the moat signal, default-on.
 *   5. apply minTrust (band/score floor) — NEVER drops the anchor.
 *   6. order (causal + temporal) and shape to the altitude.
 *   7. derive the abstain list from trust.abstain.
 *
 * An anchor with NO edges is NOT an error — it returns just the anchor node (spec).
 */
export async function buildThread(
  args: BuildThreadArgs,
  config: ThreadConfig = THREAD_CONFIG,
  pool: Pool = db
): Promise<ThreadResult> {
  const altitude = args.altitude;
  // Effective depth: caller value (if given) clamped to [1, maxDepth]; else the default.
  const requested = args.depth ?? config.defaultDepth;
  const depthUsed = Math.max(1, Math.min(requested, config.maxDepth));

  const anchor = await resolveAnchor(args.anchor, args.projectId, pool);

  // 2. TRAVERSE.
  const trav = await traverse(
    anchor,
    { depth: depthUsed, edgeTypes: args.edgeTypes, config },
    pool
  );

  // 3. HYDRATE every collected node (one batched query per entity table).
  const refs = [...trav.nodes.values()].map((n) => ({ id: n.id, type: n.type }));
  const hydrated = await hydrateNodes(refs, pool);
  const rawNodes: RawNode[] = [];
  for (const n of trav.nodes.values()) {
    const h = hydrated.get(n.id);
    if (!h) {
      // Dangling referent (edge to a deleted row). Keep the ANCHOR regardless (with what we
      // have); drop other danglers so the thread stays clean.
      if (n.id === anchor.id) {
        rawNodes.push(n);
      }
      continue;
    }
    rawNodes.push({ ...n, title: h.title ?? n.title, content: h.content, createdAt: h.createdAt });
  }

  // 4. TRUST — annotate every node (REUSE the T2b service; the moat).
  const trustRefs: RecordRef[] = rawNodes.map((n) => ({
    id: n.id,
    type: n.type,
    createdAt: n.createdAt ?? undefined,
  }));
  const trusts = await trustForRecords(trustRefs, undefined, pool);
  const trustById = new Map<string, Trust>();
  rawNodes.forEach((n, i) => trustById.set(n.id, trusts[i]));

  // 5. minTrust filter — NEVER drop the anchor.
  const kept = rawNodes.filter(
    (n) => n.id === anchor.id || clearsMinTrust(trustById.get(n.id)!, args.minTrust)
  );
  const keptIds = new Set(kept.map((n) => n.id));
  const keptEdges = trav.edges.filter((e) => keptIds.has(e.from) && keptIds.has(e.to));

  // 6. ORDER (causal + temporal, anchor pinned first) then SHAPE to the altitude.
  const ordered = orderThread(kept, keptEdges, anchor.id);
  const nodes: ThreadNode[] = ordered.map((n) =>
    shapeNode(
      { id: n.id, type: n.type, title: n.title, content: n.content },
      trustById.get(n.id)!,
      altitude,
      config
    )
  );

  // 7. ABSTAIN list — the ids the agent should not rely on.
  const abstain = nodes.filter((n) => n.trust.abstain).map((n) => n.id);

  return {
    anchor: anchor.id,
    altitude,
    nodes,
    edges: keptEdges,
    abstain,
    truncated: trav.truncated,
    truncatedCount: trav.truncatedCount,
    depthUsed,
  };
}
