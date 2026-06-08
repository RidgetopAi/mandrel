/**
 * Global Jest setup for the Mandrel Command backend test suite.
 * Loaded via `setupFilesAfterEnv` — runs once per test file before tests execute.
 */

// Integration / SSE tests can be slow; give them headroom.
jest.setTimeout(30000);

// Default to a test environment.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

// Several suites require a live Postgres + MCP server. When those aren't
// available, set MANDREL_SKIP_DB_TESTS=true to skip the infra-dependent paths
// instead of hanging on connection attempts.
if (process.env.MANDREL_SKIP_DB_TESTS === 'true') {
  // eslint-disable-next-line no-console
  console.warn('[test-setup] MANDREL_SKIP_DB_TESTS=true — DB/SSE integration tests will be skipped.');
}
