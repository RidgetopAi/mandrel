/**
 * TYPED-EDGE GRAPH — the links service (Mandrel Core Redesign T2a, task 8a296229).
 *
 * The single home for reading/writing the `links` table (migration 049). Everything
 * that touches edges goes through here so the dedup contract, parameterized SQL, and
 * project scoping live in ONE place (Lesson 011: one definition, not N copies):
 *
 *   - mintEdge()        — insert one typed edge, idempotent via the UNIQUE constraint.
 *   - unlinkEdge()      — remove one typed edge.
 *   - getLinks()        — read a record's edges (both directions), with the connected
 *                         record's id/type/title for traversal.
 *   - autoMintFromTags()/autoMintFromDecision() — the Q3 "near-free" path: derive typed
 *                         edges from signals the writer already gives (threading tags,
 *                         decision evidence, supersession), resolving id8→uuid
 *                         project-scoped and SKIPPING SILENTLY on an unresolvable ref so
 *                         a bad/typo'd tag NEVER breaks the write.
 *
 * SECURITY: every query binds user-derived values as PARAMETERS — never string-built.
 * The edge_type is validated against the named domain (config/edgeTypes.ts) before it
 * reaches SQL, and the DB CHECK is the backstop.
 */

import type { Pool } from 'pg';
import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import {
  EDGE_NODE_TYPES,
  type EdgeNodeType,
  type EdgeType,
  isEdgeType,
  isEdgeNodeType,
} from '../config/edgeTypes.js';
import { resolveEntityId, isFullUuid } from '../utils/idResolver.js';

/** One edge as stored. */
export interface Edge {
  id: string;
  fromId: string;
  fromType: EdgeNodeType;
  toId: string;
  toType: EdgeNodeType;
  edgeType: EdgeType;
  projectId: string | null;
  createdAt: string;
  createdBy: string | null;
  metadata: Record<string, any>;
}

/** A record's edge with the CONNECTED node hydrated (id/type/title) for traversal. */
export interface ConnectedEdge {
  /** The edge type. */
  edgeType: EdgeType;
  /** 'out' = this record is from_id; 'in' = this record is to_id. */
  direction: 'out' | 'in';
  /** The id of the record on the OTHER end of the edge. */
  connectedId: string;
  /** The kind of the connected record. */
  connectedType: EdgeNodeType;
  /** A human-readable title/label for the connected record (best-effort). */
  connectedTitle: string | null;
  /** The edge row id (for unlink/repair). */
  edgeId: string;
  metadata: Record<string, any>;
}

export interface MintEdgeInput {
  fromId: string;
  fromType: EdgeNodeType;
  toId: string;
  toType: EdgeNodeType;
  edgeType: EdgeType;
  projectId?: string | null;
  /** Provenance label (e.g. 'auto:context_store', 'link', 'backfill'). */
  createdBy?: string;
  metadata?: Record<string, any>;
}

export interface MintResult {
  /** True if a NEW edge row was inserted; false if it already existed (dedup). */
  created: boolean;
  /** The edge id (existing or new) when resolvable. */
  edgeId?: string;
}

/** Thrown for a malformed edge request (bad edge_type / node_type / self-link). */
export class InvalidEdgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEdgeError';
  }
}

/**
 * Mint ONE typed edge. Idempotent: the UNIQUE(from_id,to_id,edge_type) constraint +
 * ON CONFLICT DO NOTHING means re-minting the same edge is a no-op (created:false).
 *
 * Validates the shape BEFORE the write (defense in depth; the DB CHECK is the backstop):
 *   - edge_type ∈ the named domain (config/edgeTypes.ts),
 *   - from_type/to_type ∈ the node-type set,
 *   - no self-link (from_id == to_id) — a record cannot edge to itself.
 */
export async function mintEdge(input: MintEdgeInput, pool: Pool = db): Promise<MintResult> {
  if (!isEdgeType(input.edgeType)) {
    throw new InvalidEdgeError(
      `Unknown edge_type "${input.edgeType}". Allowed values are defined in ` +
        `config/edgeTypes.ts (EDGE_TYPES).`
    );
  }
  if (!isEdgeNodeType(input.fromType) || !isEdgeNodeType(input.toType)) {
    throw new InvalidEdgeError(
      `from_type/to_type must each be one of ${EDGE_NODE_TYPES.join(', ')}.`
    );
  }
  if (input.fromId === input.toId) {
    throw new InvalidEdgeError('Self-links are not allowed (from and to are the same record).');
  }

  const result = await pool.query(
    `INSERT INTO links (from_id, from_type, to_id, to_type, edge_type, project_id, created_by, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (from_id, to_id, edge_type) DO NOTHING
     RETURNING id`,
    [
      input.fromId,
      input.fromType,
      input.toId,
      input.toType,
      input.edgeType,
      input.projectId ?? null,
      input.createdBy ?? null,
      JSON.stringify(input.metadata ?? {}),
    ]
  );

  if (result.rows.length > 0) {
    return { created: true, edgeId: result.rows[0].id };
  }
  // Conflict → the edge already exists. Look up its id so the caller still gets one.
  const existing = await pool.query(
    `SELECT id FROM links WHERE from_id = $1 AND to_id = $2 AND edge_type = $3`,
    [input.fromId, input.toId, input.edgeType]
  );
  return { created: false, edgeId: existing.rows[0]?.id };
}

/** Remove ONE typed edge. Returns whether a row was deleted (idempotent). */
export async function unlinkEdge(
  input: { fromId: string; toId: string; edgeType: EdgeType },
  pool: Pool = db
): Promise<{ removed: boolean }> {
  if (!isEdgeType(input.edgeType)) {
    throw new InvalidEdgeError(`Unknown edge_type "${input.edgeType}".`);
  }
  const result = await pool.query(
    `DELETE FROM links WHERE from_id = $1 AND to_id = $2 AND edge_type = $3 RETURNING id`,
    [input.fromId, input.toId, input.edgeType]
  );
  return { removed: result.rows.length > 0 };
}

/** Title/label columns per entity for hydrating a connected node (best-effort). */
const TITLE_SELECT: Record<EdgeNodeType, { table: string; expr: string }> = {
  task: { table: 'tasks', expr: 'title' },
  decision: { table: 'technical_decisions', expr: 'title' },
  // Contexts have no title — use a short content snippet so a connected node is human-readable.
  context: { table: 'contexts', expr: "left(regexp_replace(content, '\\s+', ' ', 'g'), 60)" },
};

/**
 * Read a record's edges in BOTH directions, hydrating the connected record's
 * id/type/title. This is what T2b trust + T3 recall_thread consume (zero raw SQL for
 * the consumer). Optionally restrict to a direction and/or a set of edge types.
 *
 * @param id          the record id (full UUID expected; resolve short ids upstream)
 * @param direction   'out' (record is from), 'in' (record is to), or 'both' (default)
 * @param edgeTypes   restrict to these edge types (default: all)
 */
export async function getLinks(
  id: string,
  opts: { direction?: 'out' | 'in' | 'both'; edgeTypes?: EdgeType[] } = {},
  pool: Pool = db
): Promise<ConnectedEdge[]> {
  const direction = opts.direction ?? 'both';
  const edgeTypes = opts.edgeTypes?.filter(isEdgeType);

  const rows: ConnectedEdge[] = [];

  // Forward edges: this record is from_id; the connected node is to_id/to_type.
  if (direction === 'out' || direction === 'both') {
    rows.push(...(await fetchDirection(id, 'out', edgeTypes, pool)));
  }
  // Reverse edges: this record is to_id; the connected node is from_id/from_type.
  if (direction === 'in' || direction === 'both') {
    rows.push(...(await fetchDirection(id, 'in', edgeTypes, pool)));
  }
  return rows;
}

async function fetchDirection(
  id: string,
  direction: 'out' | 'in',
  edgeTypes: EdgeType[] | undefined,
  pool: Pool
): Promise<ConnectedEdge[]> {
  // Which column is THIS record, which is the CONNECTED node.
  const selfCol = direction === 'out' ? 'from_id' : 'to_id';
  const connIdCol = direction === 'out' ? 'to_id' : 'from_id';
  const connTypeCol = direction === 'out' ? 'to_type' : 'from_type';

  const params: any[] = [id];
  let edgeTypeFilter = '';
  if (edgeTypes && edgeTypes.length > 0) {
    params.push(edgeTypes);
    edgeTypeFilter = ` AND edge_type = ANY($${params.length})`;
  }

  const linkRows = (
    await pool.query(
      `SELECT id, edge_type, ${connIdCol} AS conn_id, ${connTypeCol} AS conn_type, metadata
       FROM links
       WHERE ${selfCol} = $1${edgeTypeFilter}
       ORDER BY created_at ASC`,
      params
    )
  ).rows;

  // Hydrate titles per connected node (best-effort; a missing referent yields null title).
  const out: ConnectedEdge[] = [];
  for (const r of linkRows) {
    const connType = r.conn_type as EdgeNodeType;
    let title: string | null = null;
    if (isEdgeNodeType(connType)) {
      const t = TITLE_SELECT[connType];
      try {
        const titleRow = await pool.query(
          `SELECT ${t.expr} AS label FROM ${t.table} WHERE id = $1`,
          [r.conn_id]
        );
        title = titleRow.rows[0]?.label ?? null;
      } catch {
        title = null; // referent gone / unreadable → leave null, never throw
      }
    }
    out.push({
      edgeType: r.edge_type as EdgeType,
      direction,
      connectedId: r.conn_id,
      connectedType: connType,
      connectedTitle: title,
      edgeId: r.id,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata ?? {},
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-MINT (Q3 — the near-free path that makes the graph dense)
// ─────────────────────────────────────────────────────────────────────────────

/** A parsed threading tag → the edge it should mint (referent still unresolved). */
interface TagEdgeIntent {
  /** The raw referent (id8 or full uuid) parsed from the tag. */
  ref: string;
  /** The kind of record the referent is. */
  toType: EdgeNodeType;
  /** The edge to mint from the writing record → the referent. */
  edgeType: EdgeType;
}

/**
 * Map a single (already ref/threading-normalized) tag to an edge intent, or null if the
 * tag is not a threading tag. The mapping (spec §4 / Q3):
 *   task:<id8>      → `informs`      (record → task)        — the moat edge.
 *   decision:<id8>  → `decided_by`   (record → decision)    — record ladders up to a decision.
 *   context:<uuid>  → `learned_from` (record → context)     — links to the doc/anchor context.
 *
 * scope:/owner:/tranche:/ref: are LENS/LABEL tags (not structure) → no edge.
 */
function tagToEdgeIntent(tag: string): TagEdgeIntent | null {
  const t = tag.trim().toLowerCase();
  if (t.startsWith('task:')) {
    return { ref: t.slice('task:'.length), toType: 'task', edgeType: 'informs' };
  }
  if (t.startsWith('decision:')) {
    return { ref: t.slice('decision:'.length), toType: 'decision', edgeType: 'decided_by' };
  }
  if (t.startsWith('context:')) {
    return { ref: t.slice('context:'.length), toType: 'context', edgeType: 'learned_from' };
  }
  return null;
}

/**
 * Resolve a referent (id8 or full uuid) to a full uuid, project-scoped, returning null
 * (NEVER throwing) when it can't be resolved — a bad/typo'd/ambiguous ref must NOT break
 * the write; it simply doesn't mint that edge. Logged at debug so a missing link is
 * observable without being fatal.
 */
async function resolveRefSafe(
  toType: EdgeNodeType,
  ref: string,
  projectId: string | undefined,
  pool: Pool
): Promise<string | null> {
  try {
    if (isFullUuid(ref)) return ref;
    return await resolveEntityId(toType, ref, projectId, pool);
  } catch (e) {
    logger.debug(
      `🔗 auto-mint: skipped unresolvable ${toType} ref "${ref}" (${(e as Error)?.name ?? 'error'}) — write unaffected`
    );
    return null;
  }
}

/**
 * AUTO-MINT from a record's threading tags (called from context_store / decision_record
 * AFTER the row is persisted). Mints typed edges for every resolvable threading tag.
 *
 * ROBUSTNESS CONTRACT (non-negotiable): this NEVER throws. A bad tag, an unresolvable
 * referent, or a DB hiccup minting one edge must not break (or roll back) the user's
 * write. Each edge is minted independently; failures are logged and swallowed. Returns
 * the count of edges newly created (for observability/tests).
 */
export async function autoMintFromTags(
  args: {
    fromId: string;
    fromType: EdgeNodeType;
    tags: string[] | undefined;
    projectId: string | undefined;
    createdBy: string;
  },
  pool: Pool = db
): Promise<{ minted: number; attempted: number }> {
  let minted = 0;
  let attempted = 0;
  for (const tag of args.tags ?? []) {
    const intent = tagToEdgeIntent(tag);
    if (!intent) continue;
    attempted++;
    try {
      const toId = await resolveRefSafe(intent.toType, intent.ref, args.projectId, pool);
      if (!toId) continue; // unresolvable → skip silently (write unaffected)
      if (toId === args.fromId) continue; // would be a self-link → skip
      const res = await mintEdge(
        {
          fromId: args.fromId,
          fromType: args.fromType,
          toId,
          toType: intent.toType,
          edgeType: intent.edgeType,
          projectId: args.projectId ?? null,
          createdBy: args.createdBy,
          metadata: { source_tag: tag },
        },
        pool
      );
      if (res.created) minted++;
    } catch (e) {
      // A single edge failing must never break the write.
      logger.warn(`🔗 auto-mint: failed to mint edge for tag "${tag}" — write unaffected`, {
        metadata: { error: (e as Error)?.message },
      });
    }
  }
  return { minted, attempted };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPLICIT LINKS (T5a — the first-class `links` write parameter, task 9535d967)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One explicit link spec as it arrives from a context_store / decision_record call.
 * EITHER form is accepted (the zod schema is the authority on shape):
 *   (a) EXPLICIT  — { edgeType, to, toType }
 *   (b) SHORTHAND — { task } | { decision } | { context }  (a single referent ref)
 * The shorthand keys map to the SAME edges the threading-tag path mints, via
 * tagToEdgeIntent (so the two surfaces can never drift): task→informs,
 * decision→decided_by, context→learned_from.
 */
export interface LinkSpec {
  edgeType?: string;
  to?: string;
  toType?: EdgeNodeType;
  task?: string;
  decision?: string;
  context?: string;
}

/** A rejected explicit link, surfaced as a per-link WARNING (the write still succeeds). */
export interface LinkWarning {
  /** Human-readable reason the link was rejected. */
  reason: string;
  /** The offending spec (echoed back so the caller can see what was dropped). */
  spec: LinkSpec;
}

export interface MintExplicitResult {
  /** Edges newly created. */
  minted: number;
  /** Edges attempted (resolved + shape-valid; includes dedup no-ops). */
  attempted: number;
  /** One warning per REJECTED link (bad edge type / unresolvable ref / self-link). */
  warnings: LinkWarning[];
}

/**
 * Normalize one LinkSpec to a concrete edge intent (edgeType + toType + referent), or a
 * rejection reason. The SHORTHAND keys reuse tagToEdgeIntent by constructing the
 * equivalent threading tag (`task:<ref>` etc.) so the shorthand→edge mapping is literally
 * the SAME code path as the tag mapping — it cannot drift (Lesson 011: one definition).
 */
function normalizeLinkSpec(
  spec: LinkSpec
): { edgeType: EdgeType; toType: EdgeNodeType; ref: string } | { reject: string } {
  // SHORTHAND: exactly one of task/decision/context. Reuse tagToEdgeIntent's mapping.
  const shorthandKey = (['task', 'decision', 'context'] as const).find(
    (k) => spec[k] !== undefined && spec[k] !== null && spec[k] !== ''
  );
  if (shorthandKey) {
    const ref = String(spec[shorthandKey]);
    const intent = tagToEdgeIntent(`${shorthandKey}:${ref}`);
    if (!intent) return { reject: `shorthand "${shorthandKey}" did not map to a known edge` };
    return { edgeType: intent.edgeType, toType: intent.toType, ref: intent.ref };
  }

  // EXPLICIT: edgeType + to + toType. (The zod schema already shape-validates the union;
  // this is defense-in-depth so the service is correct even if called directly.)
  if (spec.edgeType && spec.to && spec.toType) {
    if (!isEdgeType(spec.edgeType)) {
      return { reject: `unknown edgeType "${spec.edgeType}" (see config/edgeTypes.ts)` };
    }
    if (!isEdgeNodeType(spec.toType)) {
      return { reject: `unknown toType "${spec.toType}" (must be context|decision|task)` };
    }
    // tagToEdgeIntent lower-cases its ref; do the same for an explicit ref so an id8 with
    // upper-case hex still resolves identically to the tag/shorthand path.
    return { edgeType: spec.edgeType, toType: spec.toType, ref: spec.to.trim().toLowerCase() };
  }

  return { reject: 'link must be either { edgeType, to, toType } or { task|decision|context: <ref> }' };
}

/**
 * MINT EXPLICIT LINKS from a context_store / decision_record `links` parameter (called
 * AFTER the new record is persisted). Each spec is resolved + minted INDEPENDENTLY via
 * mintEdge, reusing resolveRefSafe (project-scoped id8→uuid) so the resolution rules
 * match the tag/shorthand path exactly.
 *
 * ROBUSTNESS CONTRACT (T5a): a bad/unresolvable/typo'd ref or an invalid edgeType must
 * NEVER break or roll back the user's write. UNLIKE the silent tag path, `links` is
 * EXPLICIT user intent — so each rejected link is returned as a WARNING (the caller
 * surfaces it). The record still saves; every GOOD link still mints. This function never
 * throws: a per-link failure becomes a warning, not an exception.
 */
export async function mintExplicitLinks(
  args: {
    fromId: string;
    fromType: EdgeNodeType;
    links: LinkSpec[] | undefined;
    projectId: string | undefined;
    createdBy: string;
  },
  pool: Pool = db
): Promise<MintExplicitResult> {
  const warnings: LinkWarning[] = [];
  let minted = 0;
  let attempted = 0;

  for (const spec of args.links ?? []) {
    const norm = normalizeLinkSpec(spec);
    if ('reject' in norm) {
      warnings.push({ reason: norm.reject, spec });
      continue;
    }
    try {
      const toId = await resolveRefSafe(norm.toType, norm.ref, args.projectId, pool);
      if (!toId) {
        warnings.push({
          reason: `could not resolve ${norm.toType} "${norm.ref}" in this project`,
          spec,
        });
        continue;
      }
      if (toId === args.fromId) {
        warnings.push({ reason: 'self-link skipped (a record cannot link to itself)', spec });
        continue;
      }
      attempted++;
      const res = await mintEdge(
        {
          fromId: args.fromId,
          fromType: args.fromType,
          toId,
          toType: norm.toType,
          edgeType: norm.edgeType,
          projectId: args.projectId ?? null,
          createdBy: args.createdBy,
          metadata: { source: 'links_param' },
        },
        pool
      );
      if (res.created) minted++;
    } catch (e) {
      // A single edge failing must never break the write — surface it as a warning.
      const reason =
        e instanceof InvalidEdgeError
          ? e.message
          : `failed to mint link (${(e as Error)?.message ?? 'error'})`;
      warnings.push({ reason, spec });
      logger.warn(`🔗 links: rejected explicit link — write unaffected`, {
        metadata: { reason, error: (e as Error)?.message },
      });
    }
  }

  return { minted, attempted, warnings };
}

/**
 * AUTO-MINT decision-specific edges (called from decision_record / decision_update):
 *   - evidence/parent ids carried in metadata (metadata.evidence: [id...] and
 *     metadata.learned_from: [id...]) → `learned_from` edges (decision → referent).
 *   - supersededBy (decision.superseded_by) → a `supersedes` edge (this decision →
 *     the decision it supersedes). The superseded_by COLUMN is kept (additive); the
 *     edge mirrors it so the graph carries the supersession structurally too.
 *
 * Same robustness contract as autoMintFromTags: NEVER throws; unresolvable refs skipped.
 */
export async function autoMintFromDecision(
  args: {
    decisionId: string;
    metadata: Record<string, any> | undefined;
    supersededBy?: string | null;
    projectId: string | undefined;
    createdBy: string;
  },
  pool: Pool = db
): Promise<{ minted: number; attempted: number }> {
  let minted = 0;
  let attempted = 0;

  // Collect evidence/parent ids from metadata (tolerant of string-or-array shapes).
  const evidenceRefs = new Set<string>();
  const meta = args.metadata ?? {};
  for (const key of ['evidence', 'learned_from', 'evidence_ids', 'parents']) {
    const v = (meta as any)[key];
    if (Array.isArray(v)) for (const x of v) if (typeof x === 'string') evidenceRefs.add(x);
    else if (typeof v === 'string') evidenceRefs.add(v);
  }

  for (const ref of evidenceRefs) {
    attempted++;
    try {
      // Evidence is most often a decision or context; try decision first, then context.
      let toId: string | null = null;
      let toType: EdgeNodeType = 'decision';
      toId = await resolveRefSafe('decision', ref, args.projectId, pool);
      if (!toId) {
        toId = await resolveRefSafe('context', ref, args.projectId, pool);
        toType = 'context';
      }
      if (!toId || toId === args.decisionId) continue;
      const res = await mintEdge(
        {
          fromId: args.decisionId,
          fromType: 'decision',
          toId,
          toType,
          edgeType: 'learned_from',
          projectId: args.projectId ?? null,
          createdBy: args.createdBy,
          metadata: { source: 'decision_evidence', ref },
        },
        pool
      );
      if (res.created) minted++;
    } catch (e) {
      logger.warn(`🔗 auto-mint: failed learned_from edge for evidence "${ref}"`, {
        metadata: { error: (e as Error)?.message },
      });
    }
  }

  // Supersession: mirror superseded_by → a `supersedes` edge (this → target).
  if (args.supersededBy) {
    attempted++;
    try {
      const toId = await resolveRefSafe('decision', args.supersededBy, args.projectId, pool);
      if (toId && toId !== args.decisionId) {
        const res = await mintEdge(
          {
            fromId: args.decisionId,
            fromType: 'decision',
            toId,
            toType: 'decision',
            edgeType: 'supersedes',
            projectId: args.projectId ?? null,
            createdBy: args.createdBy,
            metadata: { source: 'superseded_by' },
          },
          pool
        );
        if (res.created) minted++;
      }
    } catch (e) {
      logger.warn(`🔗 auto-mint: failed supersedes edge for "${args.supersededBy}"`, {
        metadata: { error: (e as Error)?.message },
      });
    }
  }

  return { minted, attempted };
}
