/**
 * Surveyor command-backend config (Surveyor P4c-backend, Mandrel task e5a650e4, decision 8f330f96).
 *
 * STANDING PRINCIPLE (Brian — binds this + all future builds): NO HARDCODED VARIABLES.
 * Every knob the Surveyor REST layer touches — the findings read-tool filter DEFAULTS and
 * the hard result cap — lives HERE: a named value with a documented default and an env
 * override. Never a literal buried in a controller/service. Mirrors the mcp-server's
 * config/surveyorConfig.ts so the two surfaces read the SAME contract (same env vars, same
 * defaults) and cannot drift.
 *
 * WHY only the findings tunables live here (and NOT the Surveyor service base_url/auth_token):
 * the command-backend does NOT call the P4a @surveyor/server directly. The SCAN trigger
 * PROXIES to the mcp-server `surveyor_scan` MCP tool (via McpService, which already centralizes
 * the MCP target in ONE place — MANDREL_MCP_URL / MANDREL_MCP_PORT). The P4a service URL +
 * bearer token are therefore held mcp-server-side (its config/surveyorConfig.ts) — the single
 * place the actual service call happens. So the command-backend never needs (and must never
 * duplicate) those secrets. The READ endpoints query the surveyor_* Postgres tables directly,
 * exactly like every other command-backend data controller (task/git/project/decision); the
 * only tunables they expose are the findings filter defaults below.
 *
 * Env reads happen at module load with a safe fallback (bad/missing → the default).
 */

/** Read a positive-integer env var, falling back to `fallback` on missing/garbage. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const v = Number(raw);
  return Number.isInteger(v) && v > 0 ? v : fallback;
}

/** Read a non-negative float env var, falling back to `fallback` on missing/garbage. */
function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

/**
 * surveyor findings READ tunables. The findings endpoint exposes optional min-confidence +
 * category filters; their DEFAULTS live here (NO hardcoded literals in the service/controller —
 * Brian's standing rule). Every one is env-overridable and shares the mcp-server's env var
 * names + defaults so both surfaces behave identically.
 */
export interface SurveyorFindingsConfig {
  /**
   * default_min_confidence — the confidence FLOOR applied when the caller passes none.
   * 0 => NO floor (unscored/null-confidence warnings are still included). A value in (0,1]
   * filters to warnings whose confidence is >= it (unscored excluded). Env:
   * SURVEYOR_FINDINGS_MIN_CONFIDENCE. Default 0 (return everything).
   */
  defaultMinConfidence: number;
  /**
   * default_limit — max warnings returned when the caller doesn't specify a limit. Env:
   * SURVEYOR_FINDINGS_DEFAULT_LIMIT. Default 500.
   */
  defaultLimit: number;
  /**
   * max_limit — the HARD ceiling on a single findings read (a caller limit is clamped to it).
   * Env: SURVEYOR_FINDINGS_MAX_LIMIT. Default 5000.
   */
  maxLimit: number;
}

/**
 * graph READ tunables. The graph endpoint caps how many nodes a single read returns so an
 * enormous scan can't OOM the canvas; a caller `limit` is clamped to this ceiling.
 */
export interface SurveyorGraphConfig {
  /**
   * max_nodes — the HARD ceiling on nodes returned by a single graph read (a caller limit is
   * clamped to it; with no caller limit the full graph up to this cap is returned). Env:
   * SURVEYOR_GRAPH_MAX_NODES. Default 5000.
   */
  maxNodes: number;
}

export interface SurveyorConfig {
  /** Read-tool tunables for the findings endpoint (filter defaults + caps). */
  findings: SurveyorFindingsConfig;
  /** Read-tool tunables for the graph endpoint (node cap). */
  graph: SurveyorGraphConfig;
}

/**
 * THE LIVE CONFIG — read once at module load. Defaults match the mcp-server surveyorConfig so
 * the two surfaces are identical; every one is env-overridable.
 */
export const SURVEYOR_CONFIG: SurveyorConfig = {
  findings: {
    defaultMinConfidence: envFloat('SURVEYOR_FINDINGS_MIN_CONFIDENCE', 0),
    defaultLimit: envInt('SURVEYOR_FINDINGS_DEFAULT_LIMIT', 500),
    maxLimit: envInt('SURVEYOR_FINDINGS_MAX_LIMIT', 5000),
  },
  graph: {
    maxNodes: envInt('SURVEYOR_GRAPH_MAX_NODES', 5000),
  },
};
