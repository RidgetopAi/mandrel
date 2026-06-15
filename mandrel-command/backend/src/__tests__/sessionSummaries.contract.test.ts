/**
 * Contract test: SessionDetailService.getSessionSummaries works against the
 * REAL migrated schema.
 *
 * Schematic fuse for the customer-reported (dmclark), fleet-wide bug:
 *   "Error loading sessions / Failed to load session summaries"
 * Root cause: getSessionSummaries queried `FROM user_sessions`, a relation that
 * does not exist in any tenant DB (the legacy web-sessions table was consolidated
 * into the single `sessions` table). Every call threw
 *   'relation "user_sessions" does not exist'.
 *
 * This test inserts a real session into the `sessions` table and asserts the
 * service returns it WITHOUT throwing — i.e. the query targets a table that
 * actually exists in the migrated schema. If anyone reintroduces `user_sessions`
 * (or another non-existent relation) this test fails with that exact Postgres
 * error rather than shipping a dead dashboard panel.
 *
 * Requires a reachable Postgres (the CI disposable migrated DB). When the DB is
 * not available the suite skips rather than failing CI.
 */
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { SessionDetailService } from '../services/sessionDetail';

const dbConfig = {
  user: process.env.DATABASE_USER || process.env.DB_USER || 'mandrel',
  host: process.env.DATABASE_HOST || process.env.DB_HOST || 'localhost',
  database: process.env.DATABASE_NAME || process.env.DB_NAME || 'mandrel',
  password: process.env.DATABASE_PASSWORD || process.env.DB_PASSWORD || '',
  port: parseInt(process.env.DATABASE_PORT || process.env.DB_PORT || '5432'),
};

describe('getSessionSummaries against real migrated schema (contract)', () => {
  let pool: Pool;
  let dbAvailable = false;

  const projectId = uuidv4();
  const sessionId = uuidv4();

  beforeAll(async () => {
    pool = new Pool(dbConfig);
    try {
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
        dbAvailable = true;

        await client.query(
          `INSERT INTO projects (id, name, description, created_at)
           VALUES ($1, $2, $3, NOW())`,
          [projectId, `sum-test-${projectId.slice(0, 8)}`, 'session summaries contract test project']
        );

        // A real session row in the (single, consolidated) sessions table, with
        // the denormalized counters the summary query reads.
        await client.query(
          `INSERT INTO sessions
             (id, project_id, agent_type, started_at, ended_at,
              total_tokens, contexts_created, decisions_created, tasks_created)
           VALUES ($1, $2, 'claude-code', NOW() - INTERVAL '30 minutes', NOW(),
                   1234, 3, 2, 1)`,
          [sessionId, projectId]
        );
      } finally {
        client.release();
      }
    } catch {
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      const client = await pool.connect();
      try {
        await client.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
        await client.query(`DELETE FROM projects WHERE id = $1`, [projectId]);
      } catch {
        /* best-effort cleanup */
      } finally {
        client.release();
      }
    }
    await pool.end();
  });

  test('returns summaries for a project WITHOUT throwing (no user_sessions relation)', async () => {
    if (!dbAvailable) {
      console.warn('DB unavailable — skipping getSessionSummaries contract test');
      return;
    }

    // The fuse: before the fix this rejected with
    // 'relation "user_sessions" does not exist'. It must now resolve.
    const summaries = await SessionDetailService.getSessionSummaries(projectId, 20, 0);

    expect(Array.isArray(summaries)).toBe(true);
    const ours = summaries.find((s) => s.id === sessionId);
    expect(ours).toBeDefined();
    // Counters come straight off the sessions row.
    expect(ours!.total_tokens).toBe(1234);
    expect(ours!.contexts_created).toBe(3);
    expect(ours!.decisions_created).toBe(2);
    expect(ours!.tasks_created).toBe(1);
    expect(ours!.session_type).toBe('claude-code');
  });

  test('also returns WITHOUT throwing when no projectId filter is given', async () => {
    if (!dbAvailable) return;
    // Exercises the no-WHERE-clause branch of the same query.
    const summaries = await SessionDetailService.getSessionSummaries(undefined, 5, 0);
    expect(Array.isArray(summaries)).toBe(true);
  });
});
