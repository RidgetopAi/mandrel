/**
 * Surveyor service client config (Surveyor P4b integration, Mandrel task 8ed9e216).
 *
 * STANDING PRINCIPLE (Brian — binds this + all future builds): NO HARDCODED VARIABLES.
 * Every knob the Surveyor client touches — the service base URL, the bearer auth token,
 * the poll interval, the poll timeout, and the per-request HTTP timeout — lives HERE: a
 * named value with a documented default and an env override. Never a literal buried in the
 * client. Mirrors threadConfig.ts / recallConfig.ts: the config is the contract, the code
 * reads it; the integration is TUNABLE without a code edit.
 *
 * The auth token is FAIL-CLOSED at call time (not here): the config simply carries whatever
 * SURVEYOR_AUTH_TOKEN is set to (empty string if unset). The client refuses to call the
 * service without a token, surfacing an actionable "service not configured" error — the
 * same fail-closed posture the P4a server's bearerAuth uses on its side.
 *
 * Env reads happen at module load with a safe fallback (bad/missing → the default), exactly
 * like threadConfig.envInt.
 */

/** Read a positive-integer env var, falling back to `fallback` on missing/garbage. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const v = Number(raw);
  return Number.isInteger(v) && v > 0 ? v : fallback;
}

/** Read a string env var, falling back to `fallback` on missing/empty. */
function envStr(name: string, fallback: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw.trim();
}

export interface SurveyorConfig {
  /**
   * base_url — the Surveyor shared service origin Mandrel calls (the P4a @surveyor/server).
   * The job API lives under `${baseUrl}/api/v1/scans`. Env: SURVEYOR_BASE_URL.
   * Default: the conventional internal port (4000) on localhost — the service runs alongside
   * Mandrel on the box; override per-environment.
   */
  baseUrl: string;
  /**
   * auth_token — the bearer token sent on every request (matches the service's
   * SURVEYOR_AUTH_TOKEN). Empty => the client fails closed (refuses to call) with an
   * actionable error. Env: SURVEYOR_AUTH_TOKEN. NEVER hardcoded; NEVER logged.
   */
  authToken: string;
  /**
   * poll_interval_ms — how often to poll GET /:jobId for terminal status while a scan runs.
   * Env: SURVEYOR_POLL_INTERVAL_MS. Default 1000 (1s).
   */
  pollIntervalMs: number;
  /**
   * poll_timeout_ms — the HARD ceiling on total time spent waiting for a scan to reach a
   * terminal state. Exceeding it aborts with a timeout error (the job may still finish
   * service-side). Env: SURVEYOR_POLL_TIMEOUT_MS. Default 600000 (10 min — matches the
   * service's own scanTimeoutMs).
   */
  pollTimeoutMs: number;
  /**
   * request_timeout_ms — per-HTTP-request timeout (connect+response) for each individual
   * call (POST / status GET / result GET), so a hung socket can't wedge the tool. Env:
   * SURVEYOR_REQUEST_TIMEOUT_MS. Default 30000 (30s).
   */
  requestTimeoutMs: number;
}

/**
 * THE LIVE CONFIG — read once at module load. Defaults are conservative + box-local; every
 * one is env-overridable.
 */
export const SURVEYOR_CONFIG: SurveyorConfig = {
  baseUrl: envStr('SURVEYOR_BASE_URL', 'http://localhost:4000'),
  authToken: envStr('SURVEYOR_AUTH_TOKEN', ''),
  pollIntervalMs: envInt('SURVEYOR_POLL_INTERVAL_MS', 1000),
  pollTimeoutMs: envInt('SURVEYOR_POLL_TIMEOUT_MS', 10 * 60 * 1000),
  requestTimeoutMs: envInt('SURVEYOR_REQUEST_TIMEOUT_MS', 30 * 1000),
};
