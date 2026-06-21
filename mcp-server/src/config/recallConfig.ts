/**
 * Mandrel Core Redesign — T1 fluidity config (Mandrel task f54e6cf5).
 *
 * STANDING PRINCIPLE (Brian, binds this + all future builds): NO HARDCODED VARIABLES.
 * Every tunable T1 introduces lives HERE — a named value with a sane default + a
 * one-line comment + an env override — never a literal buried in a route/handler. This
 * mirrors the existing config-driven patterns already in the tree (RANK_WEIGHTS /
 * SEARCH_MIN_SIMILARITY in handlers/context.ts; MIN_SHORT_ID_LENGTH in utils/idResolver.ts).
 *
 * Reads env at module load with a safe fallback (bad/missing → the default), exactly
 * like handlers/context.ts:envFloat.
 */

/** Read a positive-integer env var, falling back to `fallback` on missing/garbage. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const v = Number(raw);
  return Number.isInteger(v) && v > 0 ? v : fallback;
}

/**
 * RECALL payload control (redesign §4 Capability 5 / item 1).
 *
 * RECALL_CONCISE_MAXLEN — the max number of characters of a context's `content` that the
 * DEFAULT ('concise') response format returns per row. The boot/recall path renders
 * full content ×N with no cap today (a 10-row search can dump hundreds of KB into the
 * model window); concise truncates each row to this length with a clear "fetch full"
 * affordance. `detailed` returns the untruncated content. ~500 chars ≈ a few sentences —
 * enough to recognise a record, small enough to keep a multi-row recall lean. Tunable so
 * the eval gate can sweep it without a code edit (env: MANDREL_RECALL_CONCISE_MAXLEN).
 */
export const RECALL_CONCISE_MAXLEN = envInt('MANDREL_RECALL_CONCISE_MAXLEN', 500);

/**
 * The two recall response formats (redesign §4 Capability 5 — maps to recall_thread
 * altitude later). 'concise' is the DEFAULT (lean), 'detailed' is full content. Defined
 * once here so the zod enum, the route logic, and the docs all reference one source.
 */
export const RECALL_RESPONSE_FORMATS = ['concise', 'detailed'] as const;
export type RecallResponseFormat = (typeof RECALL_RESPONSE_FORMATS)[number];

/** The default response format when the caller omits `response_format`. */
export const RECALL_DEFAULT_FORMAT: RecallResponseFormat = 'concise';

/** Result of truncating a content body for a recall row. */
export interface TruncatedContent {
  /** The value to render/return: original when within budget or detailed, else clipped + affordance. */
  content: string;
  /** True when the value was clipped (i.e. the original exceeded RECALL_CONCISE_MAXLEN under concise). */
  truncated: boolean;
}

/**
 * Apply the recall payload policy to one context's content.
 *
 * - `detailed` (or content already within the budget) → returns the content untouched,
 *   truncated:false.
 * - `concise` AND content longer than RECALL_CONCISE_MAXLEN → clips to the budget and
 *   appends a clear, actionable affordance telling the agent HOW to get the full body
 *   (mirrors how decision_search already appends '...'), and truncated:true.
 *
 * The affordance names the exact tool call (`context_search id:<id>`, which returns the
 * full body regardless of format) so a tool-only agent can always zoom in. `id` is
 * required for the affordance; pass the row's id.
 */
export function applyRecallPayload(
  content: string,
  format: RecallResponseFormat,
  id: string,
): TruncatedContent {
  if (format === 'detailed') return { content, truncated: false };
  if (content.length <= RECALL_CONCISE_MAXLEN) return { content, truncated: false };
  const clipped = content.slice(0, RECALL_CONCISE_MAXLEN);
  return {
    content: `${clipped}…[truncated; fetch full via context_search id:${id}]`,
    truncated: true,
  };
}
