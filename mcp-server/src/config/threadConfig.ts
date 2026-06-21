/**
 * recall_thread — the thread/traversal config (Mandrel Core Redesign T3, task 73f9d280).
 *
 * STANDING PRINCIPLE (Brian, binds this + all future builds): NO HARDCODED VARIABLES.
 * Every knob recall_thread touches — BFS depth, the per-node content budget at each
 * altitude, the total-node cap — lives HERE: a named value with a Brian-aligned default,
 * a one-line doc comment, and an env override. Never a literal buried in the service.
 * This mirrors recallConfig.ts (T1), edgeTypes.ts (T2a) and trustConfig.ts (T2b): the
 * config is the contract, the code reads it. The whole point is that the tool is TUNABLE
 * (the eval gate can sweep any knob via env with zero code edit).
 *
 * Env reads happen at module load with a safe fallback (bad/missing → the default),
 * exactly like recallConfig.envInt / trustConfig.envFloat.
 */

/** Read a positive-integer env var, falling back to `fallback` on missing/garbage. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const v = Number(raw);
  return Number.isInteger(v) && v > 0 ? v : fallback;
}

/**
 * THE THREE ALTITUDES (spec §4 Capability 2). The zoom level recall_thread renders each
 * node at — defined ONCE here so the zod enum, the route logic, the content-shaping, and
 * the docs all reference one source (mirrors recallConfig.RECALL_RESPONSE_FORMATS).
 *
 *   headline — title + type + trust only (a 1-liner per node; no content body).
 *   summary  — headline PLUS a short content snippet (default; "digest" altitude).
 *   full     — headline PLUS the full, untruncated content body.
 */
export const THREAD_ALTITUDES = ['headline', 'summary', 'full'] as const;
export type ThreadAltitude = (typeof THREAD_ALTITUDES)[number];

/** The default altitude when the caller omits `altitude` (spec: default `summary`). */
export const THREAD_DEFAULT_ALTITUDE: ThreadAltitude = 'summary';

/**
 * THE THREAD KNOBS (Brian-aligned defaults, spec §4 Capability 2).
 *
 * Each field is env-overridable so the eval gate can sweep the traversal/payload shape
 * without a code edit.
 */
export interface ThreadConfig {
  /**
   * default_depth — the BFS depth (hops from the anchor) walked when the caller omits
   * `depth`. depth 3 reaches a decision's evidence → the decision → what it built/caused
   * → that node's neighbors — enough to tell the story without exploding the subgraph.
   * Env: MANDREL_THREAD_DEFAULT_DEPTH. Default 3 (spec §4).
   */
  defaultDepth: number;
  /**
   * max_depth — a HARD ceiling on `depth` regardless of what the caller asks for, so a
   * caller can't force an unbounded walk of a huge graph. A requested depth above this is
   * clamped DOWN to it (honest: the response reports the effective depth used).
   * Env: MANDREL_THREAD_MAX_DEPTH. Default 6.
   */
  maxDepth: number;
  /**
   * max_nodes — the TOTAL node cap for one thread. BFS stops collecting once this many
   * DISTINCT nodes (anchor included) are gathered; if more were reachable the response
   * sets `truncated:true` with a "N more" signal (no silent cap — spec §2/§4). Protects
   * the model window + the DB from a huge fan-out anchor.
   * Env: MANDREL_THREAD_MAX_NODES. Default 50.
   */
  maxNodes: number;
  /**
   * summary_snippet_maxlen — at the `summary` altitude, the max characters of a node's
   * content returned per node (clipped with an ellipsis when longer). Keeps a multi-node
   * thread lean while still recognisable. `full` returns untruncated; `headline` returns
   * none. Env: MANDREL_THREAD_SUMMARY_SNIPPET_MAXLEN. Default 280 (~a few sentences).
   */
  summarySnippetMaxlen: number;
}

/**
 * THE LIVE CONFIG — read once at module load. Defaults are the Brian-aligned §4 values;
 * every one is env-overridable for the eval sweep.
 */
export const THREAD_CONFIG: ThreadConfig = {
  defaultDepth: envInt('MANDREL_THREAD_DEFAULT_DEPTH', 3),
  maxDepth: envInt('MANDREL_THREAD_MAX_DEPTH', 6),
  maxNodes: envInt('MANDREL_THREAD_MAX_NODES', 50),
  summarySnippetMaxlen: envInt('MANDREL_THREAD_SUMMARY_SNIPPET_MAXLEN', 280),
};
