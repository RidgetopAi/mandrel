/**
 * DB-integration tests for id-lookup + partial-tag search across the direct-SQL
 * Command search services (contexts + tasks). Proves the shared predicate returns
 * the EXACT rows for: full UUID, hex id-prefix, partial-tag substring — and that
 * content search still works (no regression).
 *
 * Inserts its own rows into a throwaway test project and cleans them up. Skipped
 * when MANDREL_SKIP_DB_TESTS=true (no live Postgres).
 *
 * Run against the real DB locally:
 *   DATABASE_NAME=mandrel DATABASE_USER=mandrel npm test -- searchIdTagLookup
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { ContextService } from '../services/context';
import { TaskService } from '../services/task';

const SKIP = process.env.MANDREL_SKIP_DB_TESTS === 'true';
const d = SKIP ? describe.skip : describe;

d('id-lookup + partial-tag search (DB integration)', () => {
  let pool: Pool;
  let projectId: string;

  // Known fixture ids — we generate them so we can assert exact-id lookup.
  let ctxIdA: string; // tagged ['ref:resume','bucket:alpha'], content 'CANONICAL anchor'
  let ctxIdB: string; // tagged ['ref:other'], content 'unrelated body'
  let taskIdA: string; // tagged ['bucket:alpha','quick-win'], title 'Build the thing'

  beforeAll(async () => {
    pool = new Pool({
      user: process.env.DATABASE_USER || 'mandrel',
      host: process.env.DATABASE_HOST || 'localhost',
      database: process.env.DATABASE_NAME || 'mandrel',
      password: process.env.DATABASE_PASSWORD || '',
      port: parseInt(process.env.DATABASE_PORT || '5432'),
    });

    projectId = uuidv4();
    ctxIdA = uuidv4();
    ctxIdB = uuidv4();
    taskIdA = uuidv4();

    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO projects (id, name, description, status, created_at)
         VALUES ($1,$2,$3,$4,NOW())`,
        [projectId, `search-test-${projectId.slice(0, 8)}`, 'id/tag search test', 'active'],
      );

      await client.query(
        `INSERT INTO contexts (id, project_id, context_type, content, tags, created_at)
         VALUES ($1,$2,$3,$4,$5,NOW())`,
        [ctxIdA, projectId, 'milestone', 'CANONICAL anchor body', ['ref:resume', 'bucket:alpha']],
      );
      await client.query(
        `INSERT INTO contexts (id, project_id, context_type, content, tags, created_at)
         VALUES ($1,$2,$3,$4,$5,NOW())`,
        [ctxIdB, projectId, 'discussion', 'unrelated body text', ['ref:other']],
      );

      await client.query(
        `INSERT INTO tasks (id, project_id, title, description, type, status, priority, tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [taskIdA, projectId, 'Build the thing', 'a description', 'general', 'todo', 'medium', ['bucket:alpha', 'quick-win']],
      );
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (SKIP) return;
    const client = await pool.connect();
    try {
      await client.query('DELETE FROM contexts WHERE project_id = $1', [projectId]);
      await client.query('DELETE FROM tasks WHERE project_id = $1', [projectId]);
      await client.query('DELETE FROM projects WHERE id = $1', [projectId]);
    } finally {
      client.release();
    }
    await pool.end();
  });

  // ---- CONTEXTS ----------------------------------------------------------

  it('context: full UUID returns the exact record', async () => {
    const res = await ContextService.searchContexts({ query: ctxIdA, project_id: projectId });
    const ids = res.contexts.map((c) => c.id);
    expect(ids).toContain(ctxIdA);
    expect(ids).not.toContain(ctxIdB);
  });

  it('context: hex id-prefix (8 chars) returns the exact record', async () => {
    const prefix = ctxIdA.slice(0, 8);
    const res = await ContextService.searchContexts({ query: prefix, project_id: projectId });
    expect(res.contexts.map((c) => c.id)).toContain(ctxIdA);
  });

  it('context: partial-tag substring returns every record carrying it', async () => {
    // 'ref:' is a substring of both 'ref:resume' and 'ref:other'
    const res = await ContextService.searchContexts({ query: 'ref:', project_id: projectId });
    const ids = res.contexts.map((c) => c.id);
    expect(ids).toContain(ctxIdA);
    expect(ids).toContain(ctxIdB);
  });

  it('context: partial-tag "bucket" matches the bucket-tagged record (case-insensitive)', async () => {
    const res = await ContextService.searchContexts({ query: 'BUCKET', project_id: projectId });
    const ids = res.contexts.map((c) => c.id);
    expect(ids).toContain(ctxIdA);
    expect(ids).not.toContain(ctxIdB);
  });

  it('context: content search still works (no regression)', async () => {
    const res = await ContextService.searchContexts({ query: 'CANONICAL', project_id: projectId });
    const ids = res.contexts.map((c) => c.id);
    expect(ids).toContain(ctxIdA);
    expect(ids).not.toContain(ctxIdB);
  });

  it('context: exact context_type match still works (no regression)', async () => {
    const res = await ContextService.searchContexts({ query: 'milestone', project_id: projectId });
    expect(res.contexts.map((c) => c.id)).toContain(ctxIdA);
  });

  // ---- TASKS -------------------------------------------------------------

  it('task: full UUID returns the exact task', async () => {
    const res = await TaskService.getTasks({ search: taskIdA, project_id: projectId });
    expect(res.map((t) => t.id)).toContain(taskIdA);
  });

  it('task: hex id-prefix returns the exact task', async () => {
    const res = await TaskService.getTasks({ search: taskIdA.slice(0, 8), project_id: projectId });
    expect(res.map((t) => t.id)).toContain(taskIdA);
  });

  it('task: partial-tag "bucket" returns the bucket-tagged task', async () => {
    const res = await TaskService.getTasks({ search: 'bucket', project_id: projectId });
    expect(res.map((t) => t.id)).toContain(taskIdA);
  });

  it('task: title content search still works (no regression)', async () => {
    const res = await TaskService.getTasks({ search: 'Build the thing', project_id: projectId });
    expect(res.map((t) => t.id)).toContain(taskIdA);
  });
});
