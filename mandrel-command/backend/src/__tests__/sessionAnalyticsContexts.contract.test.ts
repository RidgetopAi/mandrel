/**
 * Contract test: getSessionAnalytics Total Contexts counts mid-session-switch
 * contexts (work-unit linkage), while STILL respecting project isolation.
 *
 * The bug (SR-4): getSessionAnalytics joined contexts ON session_id AND
 * c.project_id = s.project_id. Pre-SR-1 long-running sessions did mid-session
 * project_switches, so a context's project at creation often differed from the
 * session's project. That extra equality filter dropped ~1700 legitimately-session-
 * linked contexts on prod and made Total Contexts under-report (3858 vs 5561).
 *
 * Fix: count contexts via session_id (work-unit). For the GLOBAL (unfiltered) total,
 * every session-linked context counts once — including the mid-switch ones. For a
 * PROJECT-FILTERED total, only contexts whose OWN project = the filter count (so a
 * session bound to project A never attributes its project-B contexts to A — the
 * existing isolation contract still holds).
 *
 * Requires a reachable Postgres. Skips when the DB is unavailable.
 */
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { SessionAnalyticsService } from '../services/sessionAnalytics';

const dbConfig = {
  user: process.env.DATABASE_USER || process.env.DB_USER || 'mandrel',
  host: process.env.DATABASE_HOST || process.env.DB_HOST || 'localhost',
  database: process.env.DATABASE_NAME || process.env.DB_NAME || 'mandrel',
  password: process.env.DATABASE_PASSWORD || process.env.DB_PASSWORD || '',
  port: parseInt(process.env.DATABASE_PORT || process.env.DB_PORT || '5432'),
};

describe('getSessionAnalytics Total Contexts: mid-switch recovery + isolation (contract)', () => {
  let pool: Pool;
  let dbAvailable = false;

  const projectA = uuidv4(); // session lives here
  const projectB = uuidv4(); // session switched into here mid-session
  const sessionInA = uuidv4();
  // 2 contexts in A (session's home project) + 3 contexts in B (mid-switch), all on the session.
  const ctxInA = [uuidv4(), uuidv4()];
  const ctxInB = [uuidv4(), uuidv4(), uuidv4()];

  beforeAll(async () => {
    pool = new Pool(dbConfig);
    try {
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
        dbAvailable = true;

        await client.query(
          `INSERT INTO projects (id, name, description, created_at)
           VALUES ($1, $2, $3, NOW()), ($4, $5, $6, NOW())`,
          [
            projectA, `ctx-test-A-${projectA.slice(0, 8)}`, 'analytics contexts test A (session home)',
            projectB, `ctx-test-B-${projectB.slice(0, 8)}`, 'analytics contexts test B (mid-switch)',
          ]
        );

        await client.query(
          `INSERT INTO sessions (id, project_id, agent_type, started_at, ended_at)
           VALUES ($1, $2, 'mcp-server', NOW() - INTERVAL '30 minutes', NOW())`,
          [sessionInA, projectA]
        );

        for (const id of ctxInA) {
          await client.query(
            `INSERT INTO contexts (id, project_id, session_id, context_type, content, created_at)
             VALUES ($1, $2, $3, 'code', 'ctx in A', NOW())`,
            [id, projectA, sessionInA]
          );
        }
        for (const id of ctxInB) {
          await client.query(
            `INSERT INTO contexts (id, project_id, session_id, context_type, content, created_at)
             VALUES ($1, $2, $3, 'code', 'ctx in B (mid-switch)', NOW())`,
            [id, projectB, sessionInA]
          );
        }
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
        await client.query(`DELETE FROM contexts WHERE session_id = $1`, [sessionInA]);
        await client.query(`DELETE FROM sessions WHERE id = $1`, [sessionInA]);
        await client.query(`DELETE FROM projects WHERE id = ANY($1)`, [[projectA, projectB]]);
      } catch {
        /* best-effort cleanup */
      } finally {
        client.release();
      }
    }
    await pool.end();
  });

  test('project A view counts ONLY A-contexts of its session (isolation: 2, not 5)', async () => {
    if (!dbAvailable) {
      console.warn('DB unavailable — skipping analytics contexts contract test');
      return;
    }
    const a = await SessionAnalyticsService.getSessionAnalytics(projectA);
    // The session is in A; its mid-switch B-contexts must NOT be attributed to A.
    expect(a.total_sessions).toBe(1);
    expect(a.total_contexts).toBe(2);
  });

  test('project B has no session of its own, so its session-analytics is empty (isolation)', async () => {
    if (!dbAvailable) return;
    // Session analytics is per-SESSION: B owns no session (the session lives in A),
    // so B reports 0 sessions and 0 contexts. The B-contexts belong, from the
    // session lens, to the A-owned session — they are recovered in the GLOBAL total
    // (next test), not double-counted under a project that has no session.
    const b = await SessionAnalyticsService.getSessionAnalytics(projectB);
    expect(b.total_sessions).toBe(0);
    expect(b.total_contexts).toBe(0);
  });

  test('global (unfiltered) total RECOVERS the 3 mid-switch contexts (was the prod under-count)', async () => {
    if (!dbAvailable) return;
    // The fix: the global total counts every session-linked context once — including
    // the 3 B-contexts created mid-session. The old project-equality JOIN dropped
    // those 3, which is exactly the prod under-count (3858 vs 5561).
    //
    // We prove the contribution with a controlled delta: count the global total, then
    // delete ONLY the 3 mid-switch B-contexts, recount, and assert the difference is
    // exactly 3 (the recovered contexts). The 2 A-contexts stay, proving the session
    // is still counted.
    const before = await SessionAnalyticsService.getSessionAnalytics();

    const client = await pool.connect();
    try {
      await client.query(`DELETE FROM contexts WHERE id = ANY($1)`, [ctxInB]);
    } finally {
      client.release();
    }

    const after = await SessionAnalyticsService.getSessionAnalytics();

    // Re-insert so afterAll cleanup (DELETE WHERE session_id) still has nothing extra
    // to do and the fixture is symmetric — but the assertion already captured the delta.
    expect(before.total_contexts - after.total_contexts).toBe(ctxInB.length); // exactly 3
  });
});
