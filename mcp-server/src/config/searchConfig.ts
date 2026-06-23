/**
 * Mandrel Core — SEARCH id-prefix / partial-tag config (Mandrel task f29bbd44).
 *
 * STANDING PRINCIPLE (Brian, binds this + all future builds): NO HARDCODED VARIABLES.
 * Every tunable lives HERE — a named value with a sane default + a one-line comment +
 * an env override — never a literal buried in a handler. Mirrors the existing
 * config-driven patterns in the tree (RECALL_CONCISE_MAXLEN in config/recallConfig.ts;
 * MIN_SHORT_ID_LENGTH in utils/idResolver.ts).
 *
 * Governs the id-prefix lookup + partial-tag matching that decision_search (and any
 * future search caller) layers onto its free-text query. The contract intentionally
 * MIRRORS the in-package idResolver (utils/idResolver.ts) so the search box behaves
 * the same way the by-id mutate/detail tools do — the difference is search ADMITS many
 * matches (a prefix legitimately returns a result set) where resolveEntityId demands
 * exactly one.
 *
 * Reads env at module load with a safe fallback (bad/missing → the default), exactly
 * like config/recallConfig.ts:envInt.
 */

/**
 * The id-prefix floor DEFAULT. This is the SAME value as idResolver.MIN_SHORT_ID_LENGTH
 * (8) — the floor the by-id resolver enforces — held as a local literal ONLY to avoid a
 * module-init cycle (idResolver imports this config; this config importing idResolver back
 * would read MIN_SHORT_ID_LENGTH inside its TDZ → ReferenceError). The id-resolution
 * LOGIC is not duplicated (idResolver remains the single source); only this one integer
 * default is mirrored. Keep the two in step if MIN_SHORT_ID_LENGTH ever changes.
 */
const ID_PREFIX_FLOOR_DEFAULT = 8;

/** Read a positive-integer env var, falling back to `fallback` on missing/garbage. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const v = Number(raw);
  return Number.isInteger(v) && v > 0 ? v : fallback;
}

/**
 * Minimum length of a DASH-STRIPPED hex prefix before a search query is treated as an
 * id-prefix lookup at all. Below this floor a short alphanumeric query is plain text
 * only (so e.g. "ab" never floods the predicate with id matches).
 *
 * DEFAULT mirrors idResolver.MIN_SHORT_ID_LENGTH (8) — the SAME floor the by-id resolver
 * enforces (see ID_PREFIX_FLOOR_DEFAULT above for why it's a local literal, not an import).
 * The task allows tuning this down to 6; do it via the env override below, never a code edit.
 * env: SEARCH_ID_PREFIX_MIN_LENGTH
 */
export const SEARCH_ID_PREFIX_MIN_LENGTH = envInt(
  'SEARCH_ID_PREFIX_MIN_LENGTH',
  ID_PREFIX_FLOOR_DEFAULT,
);

/**
 * Hard cap on rows an ambiguous id-prefix match may pull, so an absurdly short prefix
 * can never drag unbounded rows into the OR predicate. Mirrors the resolver's LIMIT 25
 * ambiguity guard. env: SEARCH_ID_MAX_CANDIDATES
 */
export const SEARCH_ID_MAX_CANDIDATES = envInt('SEARCH_ID_MAX_CANDIDATES', 25);
