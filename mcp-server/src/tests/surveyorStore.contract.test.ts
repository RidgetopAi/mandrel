/**
 * Surveyor STORE — persistence contract tests (Surveyor P4b, task 8ed9e216).
 *
 * Proves the durable system-of-record half against a REAL Postgres (the disposable CI DB):
 *   (1) migration 053 applied — the surveyor_* tables exist;
 *   (2) persistScan writes the scan row + nodes + connections + warnings + per-function
 *       summaries (and only function nodes WITH a behavioral summary produce a summary row);
 *   (3) getStoredGraph reads the LATEST scan back faithfully (nodes + connections + stats);
 *   (4) a node-type filter + limit narrows the nodes AND scopes the connections to them;
 *   (5) project scoping — a scanId from another project is not returned;
 *   (6) deleting the project CASCADEs the whole scan subtree away (no orphans).
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../config/database.js';
import { persistScan, getStoredGraph } from '../services/surveyorStore.js';
import { makeScanResult } from './surveyorFixtures.js';

const STAMP = Date.now();
const PROJ_NAME = `surveyor-store-P-${STAMP}`;
const OTHER_NAME = `surveyor-store-OTHER-${STAMP}`;

let projectId: string;
let otherProjectId: string;

describe('surveyorStore persistence (P4b)', () => {
  beforeAll(async () => {
    projectId = (
      await db.query(`INSERT INTO projects (name, description) VALUES ($1, 'surveyor store contract') RETURNING id`, [PROJ_NAME])
    ).rows[0].id;
    otherProjectId = (
      await db.query(`INSERT INTO projects (name, description) VALUES ($1, 'other') RETURNING id`, [OTHER_NAME])
    ).rows[0].id;
  });

  afterAll(async () => {
    try {
      // surveyor_* CASCADE from projects; delete projects to reap everything.
      await db.query('DELETE FROM projects WHERE id = ANY($1)', [[projectId, otherProjectId]]);
    } catch { /* ignore */ }
    await db.end();
  });

  test('the surveyor_* tables exist (migration 053 applied)', async () => {
    const r = await db.query(
      `SELECT to_regclass('public.surveyor_scans') AS s,
              to_regclass('public.surveyor_nodes') AS n,
              to_regclass('public.surveyor_connections') AS c,
              to_regclass('public.surveyor_warnings') AS w,
              to_regclass('public.surveyor_function_summaries') AS f`,
    );
    expect(r.rows[0].s).not.toBeNull();
    expect(r.rows[0].n).not.toBeNull();
    expect(r.rows[0].c).not.toBeNull();
    expect(r.rows[0].w).not.toBeNull();
    expect(r.rows[0].f).not.toBeNull();
  });

  test('persistScan writes scan + nodes + connections + warnings + fn summaries', async () => {
    const scan = makeScanResult();
    const summary = await persistScan(projectId, scan);

    expect(summary.scanId).toMatch(/[0-9a-f-]{36}/i);
    expect(summary.sourceScanId).toBe('scan-fixture-0001');
    expect(summary.totals).toMatchObject({
      files: 1,
      functions: 2,
      classes: 1,
      connections: 2,
      warnings: 1,
      functionSummaries: 1, // only handleRequest has behavioral; helper does NOT
    });

    const nodeCount = await db.query('SELECT count(*)::int c FROM surveyor_nodes WHERE scan_id=$1', [summary.scanId]);
    expect(nodeCount.rows[0].c).toBe(4); // 1 file + 2 fns + 1 class

    const connCount = await db.query('SELECT count(*)::int c FROM surveyor_connections WHERE scan_id=$1', [summary.scanId]);
    expect(connCount.rows[0].c).toBe(2);

    const warnCount = await db.query('SELECT count(*)::int c FROM surveyor_warnings WHERE scan_id=$1', [summary.scanId]);
    expect(warnCount.rows[0].c).toBe(1);

    // Exactly ONE function summary (handleRequest), and it carries the AI summary + flags.
    const sums = await db.query(
      'SELECT node_key, summary, summary_source, flags FROM surveyor_function_summaries WHERE scan_id=$1',
      [summary.scanId],
    );
    expect(sums.rows).toHaveLength(1);
    expect(sums.rows[0].node_key).toBe('fn:handleRequest');
    expect(sums.rows[0].summary_source).toBe('ai');
    const flags = typeof sums.rows[0].flags === 'string' ? JSON.parse(sums.rows[0].flags) : sums.rows[0].flags;
    expect(flags.databaseWrite).toBe(true);
  });

  test('getStoredGraph reads the latest scan back faithfully', async () => {
    const graph = await getStoredGraph(projectId);
    expect(graph).not.toBeNull();
    expect(graph!.scan.projectName).toBe('demo');
    expect(graph!.scan.totals.functions).toBe(2);
    expect(graph!.nodes).toHaveLength(4);
    expect(graph!.connections).toHaveLength(2);
    expect(graph!.truncated).toBe(false);

    // A node carries its extracted columns AND its full original payload.
    const fn = graph!.nodes.find((n) => n.key === 'fn:handleRequest')!;
    expect(fn.type).toBe('function');
    expect(fn.filePath).toBe('src/app.ts');
    expect((fn.data as any).isAsync).toBe(true);
  });

  test('getStoredGraph filters by node type + limit, scoping connections to the returned nodes', async () => {
    const graph = await getStoredGraph(projectId, { nodeTypes: ['function'] });
    expect(graph).not.toBeNull();
    expect(graph!.nodes.every((n) => n.type === 'function')).toBe(true);
    expect(graph!.nodes).toHaveLength(2);
    // conn:1 (fn→fn) is between two functions; conn:2 (class→fn) touches a function too.
    // Both reference a function key, so both are in scope.
    expect(graph!.connections.length).toBe(2);
    expect(graph!.truncated).toBe(true); // 2 of 4 nodes returned

    const limited = await getStoredGraph(projectId, { limit: 1 });
    expect(limited!.nodes).toHaveLength(1);
    expect(limited!.truncated).toBe(true);
  });

  test('latest-scan resolution: a second scan becomes the one returned', async () => {
    const second = makeScanResult({ id: 'scan-fixture-0002', projectName: 'demo-v2' });
    const summary = await persistScan(projectId, second);
    const graph = await getStoredGraph(projectId);
    expect(graph!.scan.scanId).toBe(summary.scanId);
    expect(graph!.scan.projectName).toBe('demo-v2');

    // A specific (older) scanId still reads that scan, not the latest.
    const firstScanId = (
      await db.query(`SELECT id FROM surveyor_scans WHERE project_id=$1 AND source_scan_id='scan-fixture-0001'`, [projectId])
    ).rows[0].id;
    const older = await getStoredGraph(projectId, { scanId: firstScanId });
    expect(older!.scan.projectName).toBe('demo');
  });

  test('project scoping: a scanId from another project is NOT returned', async () => {
    const otherSummary = await persistScan(otherProjectId, makeScanResult({ id: 'other-scan' }));
    const cross = await getStoredGraph(projectId, { scanId: otherSummary.scanId });
    expect(cross).toBeNull();
  });

  test('deleting the project CASCADEs the scan subtree (no orphans)', async () => {
    const tmp = (
      await db.query(`INSERT INTO projects (name) VALUES ($1) RETURNING id`, [`surveyor-cascade-${STAMP}`])
    ).rows[0].id;
    const s = await persistScan(tmp, makeScanResult({ id: 'cascade-scan' }));
    await db.query('DELETE FROM projects WHERE id=$1', [tmp]);
    const left = await db.query('SELECT count(*)::int c FROM surveyor_nodes WHERE scan_id=$1', [s.scanId]);
    expect(left.rows[0].c).toBe(0);
  });
});
