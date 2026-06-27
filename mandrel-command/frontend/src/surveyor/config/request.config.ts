/**
 * Surveyor request configuration (configs-not-hardcoded).
 *
 * The shared axios client defaults to a 10s timeout — fine for the READ
 * endpoints, but a SCAN is synchronous from the backend's view (it calls the
 * external analyzer then persists a multi-table transaction) and can take much
 * longer. The scan request therefore overrides the timeout with this value.
 */
export const SURVEYOR_REQUEST = {
  /** Client-side timeout for POST /scan (ms). */
  scanTimeoutMs: 180_000,
} as const;
