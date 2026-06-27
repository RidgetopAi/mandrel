/**
 * Surveyor REST endpoints — contract tests (Surveyor P4c-backend, Mandrel task e5a650e4).
 *
 * Covers the four endpoints the Surveyor panel (P4c-frontend) will call:
 *   POST /surveyor/projects/:projectId/scan      — trigger a scan (proxy to surveyor_scan tool)
 *   GET  /surveyor/projects/:projectId/graph     — nodes + connections (canvas)
 *   GET  /surveyor/projects/:projectId/file      — one file card
 *   GET  /surveyor/projects/:projectId/findings  — findings, with filters
 *
 * Two faithful test surfaces, no fakes-that-lie:
 *   - READS run against a REAL migrated Postgres (surveyor_* tables, migration 053). We insert
 *     a known scan + nodes/connections/warnings/summaries, then assert the exact shape the
 *     endpoint returns. Gated on a reachable DB (like the other *.contract.test.ts suites): when
 *     Postgres is unavailable the DB assertions self-skip rather than hang.
 *   - The SCAN trigger is exercised with a CONTRACT-PINNED faithful fake of the surveyor_scan
 *     MCP tool: McpService.callMcpEndpoint is stubbed to return the EXACT bridge envelope the
 *     real tool returns ({ success, result:{ content, structuredContent } }), so the controller's
 *     unwrap is tested against the real contract — the live P4a call is a post-deploy smoke.
 *
 * Auth is bypassed (the auth middleware is unit-tested elsewhere); these tests pin the surveyor
 * routing, validation, project-scoping, not-found behavior, filter behavior, and scan unwrap.
 */

import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// Bypass auth for routing/validation tests (auth is covered by its own suite).
jest.mock('../middleware/auth', () => ({
  authenticateToken: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import surveyorRoutes from '../routes/surveyor';
import { SurveyorService } from '../services/surveyor';
import { McpService } from '../services/mcp';

const dbConfig = {
  user: process.env.DATABASE_USER || process.env.DB_USER || 'mandrel',
  host: process.env.DATABASE_HOST || process.env.DB_HOST || 'localhost',
  database: process.env.DATABASE_NAME || process.env.DB_NAME || 'mandrel',
  password: process.env.DATABASE_PASSWORD || process.env.DB_PASSWORD || '',
  port: parseInt(process.env.DATABASE_PORT || process.env.DB_PORT || '5432'),
};

const app = express();
app.use(express.json());
app.use('/surveyor', surveyorRoutes);

const VALID_UUID = 'c875b2af-9020-41b7-9595-d70221603464';

describe('Surveyor REST endpoints (contract)', () => {
  let pool: Pool;
  let dbAvailable = false;

  // Fixture ids.
  const projectId = uuidv4(); // has a scan
  const emptyProjectId = uuidv4(); // exists, NO scan
  let scanId: string;

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
            projectId, `surveyor-test-${projectId.slice(0, 8)}`, 'surveyor endpoints test (with scan)',
            emptyProjectId, `surveyor-empty-${emptyProjectId.slice(0, 8)}`, 'surveyor endpoints test (no scan)',
          ],
        );

        // The scan row. Totals: 2 files, 2 functions, 1 class, 1 connection, 3 warnings.
        const scanRes = await client.query(
          `INSERT INTO surveyor_scans
             (project_id, source_scan_id, project_path, project_name, status, stats,
              total_files, total_functions, total_classes, total_connections, total_warnings,
              completed_at)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11, NOW())
           RETURNING id`,
          [
            projectId,
            'src-scan-001',
            '/srv/code/app',
            'app',
            'complete',
            JSON.stringify({ totalFiles: 2, totalFunctions: 2, totalClasses: 1 }),
            2, 2, 1, 1, 3,
          ],
        );
        scanId = scanRes.rows[0].id;

        // Nodes: 2 files, 2 functions (in app.ts), 1 class (in app.ts).
        const fileAppData = JSON.stringify({
          type: 'file',
          id: 'f_app',
          name: 'app.ts',
          filePath: 'src/app.ts',
          imports: [{ source: './util', names: ['helper'] }],
          exports: [{ name: 'App', kind: 'class' }],
        });
        const fileUtilData = JSON.stringify({
          type: 'file', id: 'f_util', name: 'util.ts', filePath: 'src/util.ts', imports: [], exports: [{ name: 'helper' }],
        });
        await client.query(
          `INSERT INTO surveyor_nodes (scan_id, node_key, node_type, name, file_path, line, end_line, data)
           VALUES
             ($1,'f_app','file','app.ts','src/app.ts',1,100,$2::jsonb),
             ($1,'f_util','file','util.ts','src/util.ts',1,40,$3::jsonb),
             ($1,'fn_main','function','main','src/app.ts',10,20,$4::jsonb),
             ($1,'fn_init','function','init','src/app.ts',22,30,$5::jsonb),
             ($1,'cls_app','class','App','src/app.ts',40,90,$6::jsonb)`,
          [
            scanId,
            fileAppData,
            fileUtilData,
            JSON.stringify({ type: 'function', id: 'fn_main', name: 'main', filePath: 'src/app.ts' }),
            JSON.stringify({ type: 'function', id: 'fn_init', name: 'init', filePath: 'src/app.ts' }),
            JSON.stringify({ type: 'class', id: 'cls_app', name: 'App', filePath: 'src/app.ts' }),
          ],
        );

        // One connection: app.ts imports util.ts (file → file edge).
        await client.query(
          `INSERT INTO surveyor_connections
             (scan_id, connection_key, source_key, target_key, connection_type, weight, metadata)
           VALUES ($1,'conn_1','f_app','f_util','import',1,'{}'::jsonb)`,
          [scanId],
        );

        // Warnings: error(0.9, circular-dependency), warning(0.5, orphan), info(null, orphan).
        await client.query(
          `INSERT INTO surveyor_warnings
             (scan_id, warning_key, category, level, title, description, affected_nodes,
              suggestion, source, confidence, dismissible, detected_at)
           VALUES
             ($1,'w_err','circular-dependency','error','Circular dependency','a→b→a',
              $2::jsonb, $3::jsonb, 'surveyor', 0.9, false, NOW()),
             ($1,'w_warn','orphan','warning','Orphan module','no importers',
              '[]'::jsonb, NULL, 'knip', 0.5, true, NOW()),
             ($1,'w_info','orphan','info','Possibly unused','low signal',
              '[]'::jsonb, NULL, 'knip', NULL, true, NOW())`,
          [
            scanId,
            JSON.stringify(['f_app', 'f_util']),
            JSON.stringify({ action: 'break-cycle', detail: 'extract shared module' }),
          ],
        );

        // One function summary (for fn_main).
        await client.query(
          `INSERT INTO surveyor_function_summaries
             (scan_id, node_key, summary, summary_source, flags, analyzed_at)
           VALUES ($1,'fn_main','Entry point; wires the app.', 'ai', $2::jsonb, NOW())`,
          [scanId, JSON.stringify({ hasSideEffects: true, httpCall: false })],
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
        // CASCADE from projects reaps scans → nodes/connections/warnings/summaries (migration 053).
        await client.query('DELETE FROM projects WHERE id = ANY($1)', [[projectId, emptyProjectId]]);
      } finally {
        client.release();
      }
    }
    await pool.end();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── Validation / not-found (no DB needed) ────────────────────────────────────────────────

  test('GET graph — malformed projectId returns 400 (never reaches the handler)', async () => {
    const res = await request(app).get('/surveyor/projects/not-a-uuid/graph');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('GET graph — unknown project returns 404', async () => {
    jest.spyOn(SurveyorService, 'projectExists').mockResolvedValue(false);
    const res = await request(app).get(`/surveyor/projects/${VALID_UUID}/graph`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: 'Project not found' });
  });

  test('GET file — missing ?file returns 400', async () => {
    jest.spyOn(SurveyorService, 'projectExists').mockResolvedValue(true);
    const res = await request(app).get(`/surveyor/projects/${VALID_UUID}/file`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // ── Scan trigger — contract-pinned faithful fake of the surveyor_scan MCP tool ────────────

  test('POST scan — missing path returns 400', async () => {
    const res = await request(app)
      .post(`/surveyor/projects/${VALID_UUID}/scan`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('POST scan — proxies to surveyor_scan and returns the unwrapped summary (201)', async () => {
    jest.spyOn(SurveyorService, 'projectExists').mockResolvedValue(true);

    // The EXACT bridge envelope /mcp/tools/surveyor_scan returns (contract pin).
    const persisted = {
      scanId: uuidv4(),
      projectId: VALID_UUID,
      projectName: 'app',
      projectPath: '/srv/code/app',
      status: 'complete',
      sourceScanId: 'src-scan-xyz',
      totals: { files: 12, functions: 40, classes: 5, connections: 30, warnings: 4, functionSummaries: 38 },
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    const callSpy = jest.spyOn(McpService, 'callMcpEndpoint').mockResolvedValue({
      success: true,
      result: {
        content: [{ type: 'text', text: '🛰️  Surveyor scan stored' }],
        structuredContent: { ok: true, action: 'scanned', scan: persisted },
      },
    });

    const res = await request(app)
      .post(`/surveyor/projects/${VALID_UUID}/scan`)
      .send({ path: '/srv/code/app' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.scan).toEqual(persisted);

    // Proxied to the right tool, project-scoped, with the path.
    expect(callSpy).toHaveBeenCalledWith(
      '/mcp/tools/surveyor_scan',
      'POST',
      { arguments: { projectId: VALID_UUID, path: '/srv/code/app' } },
    );
  });

  test('POST scan — an upstream service failure surfaces as 502 with errorKind', async () => {
    jest.spyOn(SurveyorService, 'projectExists').mockResolvedValue(true);
    jest.spyOn(McpService, 'callMcpEndpoint').mockResolvedValue({
      success: true,
      result: {
        content: [{ type: 'text', text: '❌ Could not reach the Surveyor service.' }],
        structuredContent: { ok: false, action: 'failed', errorKind: 'service_down' },
      },
    });

    const res = await request(app)
      .post(`/surveyor/projects/${VALID_UUID}/scan`)
      .send({ path: '/srv/code/app' });

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.errorKind).toBe('service_down');
  });

  // ── DB-backed reads (real migrated Postgres) ─────────────────────────────────────────────

  test('GET graph — returns the full stored graph for the project', async () => {
    if (!dbAvailable) return;
    const res = await request(app).get(`/surveyor/projects/${projectId}/graph`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.found).toBe(true);
    expect(res.body.data.scan.scanId).toBe(scanId);
    expect(res.body.data.scan.totals).toMatchObject({ files: 2, functions: 2, classes: 1, connections: 1, warnings: 3 });
    expect(res.body.data.nodes).toHaveLength(5);
    expect(res.body.data.connections).toHaveLength(1);
    expect(res.body.data.connections[0]).toMatchObject({ sourceKey: 'f_app', targetKey: 'f_util', type: 'import' });
    expect(res.body.data.truncated).toBe(false);
  });

  test('GET graph — nodeTypes filter narrows nodes + scopes connections + flags truncated', async () => {
    if (!dbAvailable) return;
    const res = await request(app).get(`/surveyor/projects/${projectId}/graph?nodeTypes=function`);
    expect(res.status).toBe(200);
    const nodes = res.body.data.nodes as Array<{ type: string }>;
    expect(nodes).toHaveLength(2);
    expect(nodes.every((n) => n.type === 'function')).toBe(true);
    // The only edge is file→file; neither endpoint is a returned function node → no edges.
    expect(res.body.data.connections).toHaveLength(0);
    expect(res.body.data.truncated).toBe(true);
  });

  test('GET graph — project with no stored scan returns found:false (empty state, 200)', async () => {
    if (!dbAvailable) return;
    const res = await request(app).get(`/surveyor/projects/${emptyProjectId}/graph`);
    expect(res.status).toBe(200);
    expect(res.body.data.found).toBe(false);
    expect(res.body.data.nodes).toEqual([]);
  });

  test('GET file — by file PATH returns the card with functions (+summary), classes, imports/exports', async () => {
    if (!dbAvailable) return;
    const res = await request(app).get(`/surveyor/projects/${projectId}/file?file=src/app.ts`);
    expect(res.status).toBe(200);
    expect(res.body.data.found).toBe(true);
    expect(res.body.data.file.node.filePath).toBe('src/app.ts');
    expect(res.body.data.file.functions).toHaveLength(2);
    expect(res.body.data.file.classes).toHaveLength(1);
    expect(res.body.data.file.imports).toHaveLength(1);
    expect(res.body.data.file.exports).toHaveLength(1);

    const main = (res.body.data.file.functions as Array<any>).find((f) => f.key === 'fn_main');
    const init = (res.body.data.file.functions as Array<any>).find((f) => f.key === 'fn_init');
    expect(main.summary).toMatchObject({ summary: 'Entry point; wires the app.', source: 'ai' });
    expect(init.summary).toBeNull();
  });

  test('GET file — by NODE KEY resolves the same file card', async () => {
    if (!dbAvailable) return;
    const res = await request(app).get(`/surveyor/projects/${projectId}/file?file=f_app`);
    expect(res.status).toBe(200);
    expect(res.body.data.found).toBe(true);
    expect(res.body.data.file.node.key).toBe('f_app');
  });

  test('GET file — a ref matching no node returns found:false with the scan header', async () => {
    if (!dbAvailable) return;
    const res = await request(app).get(`/surveyor/projects/${projectId}/file?file=src/does-not-exist.ts`);
    expect(res.status).toBe(200);
    expect(res.body.data.found).toBe(false);
    expect(res.body.data.scan.scanId).toBe(scanId);
    expect(res.body.data.file).toBeNull();
  });

  test('GET findings — returns all warnings severity-ordered (error→warning→info)', async () => {
    if (!dbAvailable) return;
    const res = await request(app).get(`/surveyor/projects/${projectId}/findings`);
    expect(res.status).toBe(200);
    expect(res.body.data.found).toBe(true);
    expect(res.body.data.totalInScan).toBe(3);
    expect(res.body.data.filtered).toBe(false);
    const levels = (res.body.data.warnings as Array<{ level: string }>).map((w) => w.level);
    expect(levels).toEqual(['error', 'warning', 'info']);
    // The error carries its structured suggestion + affected nodes.
    const err = res.body.data.warnings[0];
    expect(err).toMatchObject({ category: 'circular-dependency', confidence: 0.9, dismissible: false });
    expect(err.affectedNodes).toEqual(['f_app', 'f_util']);
    expect(err.suggestion).toMatchObject({ action: 'break-cycle' });
  });

  test('GET findings — minConfidence floor excludes lower + unscored warnings (filtered)', async () => {
    if (!dbAvailable) return;
    const res = await request(app).get(`/surveyor/projects/${projectId}/findings?minConfidence=0.6`);
    expect(res.status).toBe(200);
    expect(res.body.data.warnings).toHaveLength(1);
    expect(res.body.data.warnings[0].key).toBe('w_err');
    expect(res.body.data.filtered).toBe(true);
  });

  test('GET findings — category filter returns only that category', async () => {
    if (!dbAvailable) return;
    const res = await request(app).get(`/surveyor/projects/${projectId}/findings?category=orphan`);
    expect(res.status).toBe(200);
    const cats = (res.body.data.warnings as Array<{ category: string }>).map((w) => w.category);
    expect(cats).toEqual(['orphan', 'orphan']);
    expect(res.body.data.filtered).toBe(true);
  });

  test('GET findings — project with no scan returns found:false (200)', async () => {
    if (!dbAvailable) return;
    const res = await request(app).get(`/surveyor/projects/${emptyProjectId}/findings`);
    expect(res.status).toBe(200);
    expect(res.body.data.found).toBe(false);
    expect(res.body.data.warnings).toEqual([]);
  });
});
