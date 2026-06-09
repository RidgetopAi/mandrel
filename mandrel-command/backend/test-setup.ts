/**
 * Global Jest setup for the Mandrel Command backend test suite.
 * Loaded via `setupFilesAfterEnv` — runs once per test file before tests execute.
 */

// Integration / SSE tests can be slow; give them headroom.
jest.setTimeout(30000);

// Default to a test environment.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

// Local-dev DB defaults so `npm test` works without a hand-rolled env line.
// The whole codebase reads a single canonical DB-config convention: DATABASE_*
// (the legacy AIDIS_DB_* alias was removed in D6). The local dev database is
// `aidis_production` owned by the OS user.
//
// CI / other machines should point at a dedicated test DB by exporting
// DATABASE_NAME (e.g. `mandrel_test`) — plus DATABASE_USER/PASSWORD/HOST/PORT as
// needed — before running the suite; these defaults are only a local fallback.
process.env.DATABASE_NAME = process.env.DATABASE_NAME || 'aidis_production';
process.env.DATABASE_USER = process.env.DATABASE_USER || 'ridgetop';
process.env.DATABASE_PASSWORD = process.env.DATABASE_PASSWORD || '';

// Several suites require a live Postgres + MCP server. When those aren't
// available, set MANDREL_SKIP_DB_TESTS=true to skip the infra-dependent paths
// instead of hanging on connection attempts.
if (process.env.MANDREL_SKIP_DB_TESTS === 'true') {
  // eslint-disable-next-line no-console
  console.warn('[test-setup] MANDREL_SKIP_DB_TESTS=true — DB/SSE integration tests will be skipped.');
}
