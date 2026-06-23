/**
 * Search configuration (named tunables — no magic numbers inline).
 *
 * Governs the id-prefix lookup + partial-tag matching shared by the contexts,
 * tasks (and any future direct-SQL) search services. Mirrors the contract of the
 * Mandrel-core id resolver (mcp-server/src/utils/idResolver.ts) so the Command UI
 * search box behaves the same way the MCP tools do.
 *
 * All values are env-overridable so behavior can be tuned per environment without
 * code changes (Brian's standing rule: tunables live in organized named config,
 * never hardcoded).
 */

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export const searchConfig = {
  /**
   * Minimum length of a hex id-prefix before we treat a query as an id-prefix
   * lookup. Below this, a short alphanumeric query is treated as plain text only
   * (avoids e.g. "ab" matching a flood of ids). The task spec sets this floor at
   * 6 (so `0f3906cd` — 8 chars — qualifies).
   */
  idPrefixMinLength: intFromEnv('SEARCH_ID_PREFIX_MIN_LENGTH', 6),

  /**
   * Hard cap on rows pulled by an ambiguous id-prefix match, so an absurdly short
   * prefix can never pull unbounded rows into the OR predicate. Matches the
   * resolver's LIMIT 25 ambiguity guard.
   */
  idMaxCandidates: intFromEnv('SEARCH_ID_MAX_CANDIDATES', 25),
} as const;

export default searchConfig;
