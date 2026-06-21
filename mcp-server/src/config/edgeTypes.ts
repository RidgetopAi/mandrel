/**
 * TYPED-EDGE GRAPH — the edge-type domain (single source of truth).
 *
 * Mandrel Core Redesign T2a (task 8a296229), spec §4 Capability 1 + §8.1 Q1/Q3.
 *
 * THE PRINCIPLE (Brian, standing rule): NO HARDCODED VARIABLES. The edge-type
 * vocabulary lives here, ONCE. Both the database CHECK constraint (migration 049) and
 * the zod validation (link/unlink/get_links) derive from THIS module — they can never
 * drift. A new edge type is added here and everywhere else follows.
 *
 * EDGES CARRY STRUCTURE; TAGS CARRY LABELS (spec §8.1 Q1 LOCKED). The `links` table is
 * the real, bidirectional, repairable replacement for string-tag threading. Tags stay,
 * demoted to the human-viewable lens/label path (`scope:`/`owner:`/`ref:`).
 *
 * DIRECTION CONVENTION: every edge is stored from `from_id` → `to_id`. The semantic
 * direction of each edge type is documented below so a reader (and the future
 * recall_thread traversal in T3) knows which way the arrow points. The store indexes
 * BOTH (from_id, edge_type) and (to_id, edge_type) so the graph can be walked in either
 * direction regardless of how an edge was minted.
 */

/** The kind of record an edge endpoint refers to. Matches the resolvable entity set. */
export const EDGE_NODE_TYPES = ['context', 'decision', 'task'] as const;
export type EdgeNodeType = (typeof EDGE_NODE_TYPES)[number];

/**
 * A v1 edge-type spec — the value, its semantic direction, and a human description.
 * `from`/`to` document the EXPECTED endpoint kinds (advisory for readers/traversal;
 * the DB does not FK-constrain endpoint type because endpoints span three tables).
 */
export interface EdgeTypeSpec {
  /** The canonical edge-type value (lowercase snake; stored in links.edge_type). */
  readonly type: string;
  /** Human-readable semantic direction of the from→to arrow. */
  readonly direction: string;
  /** What this edge means. */
  readonly description: string;
  /** The reverse-reading label (how to read the edge to→from), for surfacing. */
  readonly reverse: string;
}

/**
 * THE v1 EDGE-TYPE DOMAIN (spec §4 Capability 1). Ordered as the spec lists them.
 *
 * Stored from→to. Read each `direction` as "from {description}".
 */
export const EDGE_TYPE_SPECS: readonly EdgeTypeSpec[] = [
  {
    type: 'decided_by',
    direction: 'record → decision',
    description: 'this record (context/task) was decided by the target decision',
    reverse: 'decides',
  },
  {
    type: 'caused',
    direction: 'record → record',
    description: 'the source caused / led to the target (causal/temporal link)',
    reverse: 'caused_by',
  },
  {
    type: 'built_by',
    direction: 'record → task',
    description: 'this record (decision/context) was built by the target task',
    reverse: 'builds',
  },
  {
    type: 'supersedes',
    direction: 'record → record',
    description: 'the source supersedes (replaces) the target — the target is demoted',
    reverse: 'superseded_by',
  },
  {
    type: 'learned_from',
    direction: 'record → record',
    description: 'the source was learned from / cites the target as evidence',
    reverse: 'informed_learning',
  },
  {
    type: 'proposed_by',
    direction: 'record → record',
    description: 'this record was proposed by the target (e.g. an agent/decision)',
    reverse: 'proposes',
  },
  {
    type: 'informs',
    direction: 'record → task',
    description: 'this record (context/decision) informs the target task — the moat edge for outcome trust',
    reverse: 'informed_by',
  },
  {
    type: 'produced_outcome',
    direction: 'task → outcome',
    description: 'the task produced the target outcome record (closes the learning loop)',
    reverse: 'outcome_of',
  },
] as const;

/** The flat list of allowed edge-type values — the SINGLE source the DB + zod derive from. */
export const EDGE_TYPES: readonly string[] = EDGE_TYPE_SPECS.map((s) => s.type);

/** A literal-union type of the v1 edge types (for typed call sites). */
export type EdgeType = (typeof EDGE_TYPE_SPECS)[number]['type'];

/** Fast membership lookup. */
const EDGE_TYPE_SET: ReadonlySet<string> = new Set(EDGE_TYPES);

/** True iff `value` is a known v1 edge type. */
export function isEdgeType(value: unknown): value is EdgeType {
  return typeof value === 'string' && EDGE_TYPE_SET.has(value);
}

/** True iff `value` is a known edge node type (context|decision|task). */
export function isEdgeNodeType(value: unknown): value is EdgeNodeType {
  return typeof value === 'string' && (EDGE_NODE_TYPES as readonly string[]).includes(value);
}

/** Look up the spec for an edge type (or undefined). */
export function edgeTypeSpec(type: string): EdgeTypeSpec | undefined {
  return EDGE_TYPE_SPECS.find((s) => s.type === type);
}

/**
 * The SQL fragment for the DB CHECK constraint's allowed-value list, derived from
 * EDGE_TYPES so the migration and this module cannot drift. Emits a quoted,
 * comma-separated list: 'decided_by', 'caused', … Each value is a fixed identifier
 * from this module (never user input), so this is safe to inline in the migration SQL.
 */
export function edgeTypeCheckSqlList(): string {
  return EDGE_TYPES.map((t) => `'${t}'`).join(', ');
}
