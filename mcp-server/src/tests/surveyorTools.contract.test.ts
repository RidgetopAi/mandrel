/**
 * Surveyor TOOLS — surveyor_scan / surveyor_get_graph end-to-end contract tests (P4b, 8ed9e216).
 *
 * Drives the tools through the EXACT public path the HTTP bridge uses (validate → routeExecutor),
 * with the Surveyor service client swapped for a FAITHFUL FAKE (contract-shaped ScanResult, no
 * network) via surveyorRoutes.setClient. Pins:
 *   (1) surveyor_scan calls the service, PERSISTS, and returns a counts summary (structuredContent);
 *   (2) surveyor_get_graph reads the stored graph back (nodes + connections + scan header);
 *   (3) get_graph on a project with no scan returns found:false (not an error);
 *   (4) a service/client failure surfaces as an actionable error and persists NOTHING;
 *   (5) validation rejects a missing path.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../config/database.js';
import { routeExecutor } from '../routes/index.js';
import { validateToolArguments } from '../middleware/validation.js';
import { surveyorRoutes } from '../routes/surveyor.routes.js';
import { FakeSurveyorClient, makeScanResult, makeFindingsScanResult } from './surveyorFixtures.js';
import { SurveyorClientError, type ISurveyorClient } from '../services/surveyorClient.js';

const STAMP = Date.now();
const CONN = `surveyor-tools-conn-${STAMP}`;
const PROJ_NAME = `surveyor-tools-P-${STAMP}`;
const EMPTY_NAME = `surveyor-tools-EMPTY-${STAMP}`;

let projectId: string;
let emptyProjectId: string;

function responseText(resp: any): string {
  return resp?.content?.map((c: any) => c.text).join('\n') ?? '';
}
async function viaTool(toolName: string, rawArgs: any): Promise<any> {
  const validated = validateToolArguments(toolName, rawArgs);
  return routeExecutor(toolName, validated, { connectionId: CONN });
}

describe('surveyor_scan / surveyor_get_graph (P4b tools)', () => {
  beforeAll(async () => {
    projectId = (
      await db.query(`INSERT INTO projects (name, description) VALUES ($1, 'surveyor tools contract') RETURNING id`, [PROJ_NAME])
    ).rows[0].id;
    emptyProjectId = (
      await db.query(`INSERT INTO projects (name) VALUES ($1) RETURNING id`, [EMPTY_NAME])
    ).rows[0].id;
    await routeExecutor('project_switch', { project: projectId }, { connectionId: CONN });
    // Default: faithful fake client (overridden per-test where needed).
    surveyorRoutes.setClient(new FakeSurveyorClient());
  });

  afterAll(async () => {
    try {
      await db.query('DELETE FROM projects WHERE id = ANY($1)', [[projectId, emptyProjectId]]);
    } catch { /* ignore */ }
    await db.end();
  });

  test('surveyor_scan calls the service, persists, and returns a counts summary', async () => {
    const fake = new FakeSurveyorClient();
    surveyorRoutes.setClient(fake);

    const resp = await viaTool('surveyor_scan', { path: '/srv/code/demo' });
    expect(resp.isError).not.toBe(true);
    expect(fake.lastPath).toBe('/srv/code/demo');

    const sc = resp.structuredContent;
    expect(sc.ok).toBe(true);
    expect(sc.action).toBe('scanned');
    expect(sc.scan.scanId).toMatch(/[0-9a-f-]{36}/i);
    expect(sc.scan.totals).toMatchObject({ files: 1, functions: 2, classes: 1, connections: 2, warnings: 1, functionSummaries: 1 });
    expect(responseText(resp)).toContain('Surveyor scan stored');

    // It actually landed in Postgres under this project.
    const rows = await db.query('SELECT count(*)::int c FROM surveyor_scans WHERE project_id=$1', [projectId]);
    expect(rows.rows[0].c).toBeGreaterThanOrEqual(1);
  });

  test('surveyor_get_graph reads the stored graph back', async () => {
    const resp = await viaTool('surveyor_get_graph', {});
    expect(resp.isError).not.toBe(true);
    const sc = resp.structuredContent;
    expect(sc.ok).toBe(true);
    expect(sc.found).toBe(true);
    expect(sc.nodes.length).toBe(4);
    expect(sc.connections.length).toBe(2);
    expect(sc.scan.projectName).toBe('demo');
    expect(responseText(resp)).toContain('Surveyor graph');
  });

  test('surveyor_get_graph with a nodeTypes filter narrows the result', async () => {
    const resp = await viaTool('surveyor_get_graph', { nodeTypes: ['class'] });
    const sc = resp.structuredContent;
    expect(sc.found).toBe(true);
    expect(sc.nodes.every((n: any) => n.type === 'class')).toBe(true);
    expect(sc.nodes.length).toBe(1);
    expect(sc.truncated).toBe(true);
  });

  test('surveyor_get_graph on a project with no scan → found:false (not an error)', async () => {
    await routeExecutor('project_switch', { project: emptyProjectId }, { connectionId: CONN });
    const resp = await viaTool('surveyor_get_graph', {});
    expect(resp.isError).not.toBe(true);
    expect(resp.structuredContent.ok).toBe(true);
    expect(resp.structuredContent.found).toBe(false);
    expect(responseText(resp)).toContain('No stored Surveyor scan');
    await routeExecutor('project_switch', { project: projectId }, { connectionId: CONN });
  });

  test('a service failure surfaces an actionable error and persists nothing', async () => {
    const before = (await db.query('SELECT count(*)::int c FROM surveyor_scans WHERE project_id=$1', [projectId])).rows[0].c;

    const failing: ISurveyorClient = {
      async scan() {
        throw new SurveyorClientError('service_down', 'connection refused');
      },
    };
    surveyorRoutes.setClient(failing);

    const resp = await viaTool('surveyor_scan', { path: '/srv/code/demo' });
    expect(resp.isError).toBe(true);
    expect(resp.structuredContent.ok).toBe(false);
    expect(resp.structuredContent.errorKind).toBe('service_down');
    expect(responseText(resp)).toContain('Could not reach the Surveyor service');

    const after = (await db.query('SELECT count(*)::int c FROM surveyor_scans WHERE project_id=$1', [projectId])).rows[0].c;
    expect(after).toBe(before); // nothing persisted on failure

    surveyorRoutes.setClient(new FakeSurveyorClient()); // restore
  });

  test('validation rejects a scan with no path', async () => {
    expect(() => validateToolArguments('surveyor_scan', {})).toThrow();
  });

  test('the persisted scan is queryable via a fresh fake result shape (idempotent re-scan adds history)', async () => {
    surveyorRoutes.setClient(new FakeSurveyorClient(makeScanResult({ id: 'tools-rescan', projectName: 'demo-rescan' })));
    const resp = await viaTool('surveyor_scan', { path: '/srv/code/demo' });
    expect(resp.structuredContent.ok).toBe(true);
    const graph = await viaTool('surveyor_get_graph', {});
    // Latest scan is the re-scan.
    expect(graph.structuredContent.scan.projectName).toBe('demo-rescan');
  });

  test('surveyor_get_file reads a file card back (imports/exports/functions[+summary]/classes)', async () => {
    surveyorRoutes.setClient(new FakeSurveyorClient(makeScanResult({ id: 'tools-file' })));
    await viaTool('surveyor_scan', { path: '/srv/code/demo' });

    const resp = await viaTool('surveyor_get_file', { file: 'src/app.ts' });
    expect(resp.isError).not.toBe(true);
    const sc = resp.structuredContent;
    expect(sc.ok).toBe(true);
    expect(sc.found).toBe(true);
    expect(sc.file.node.key).toBe('file:src/app.ts');
    expect(sc.file.functions.length).toBe(2);
    expect(sc.file.classes.length).toBe(1);
    const handle = sc.file.functions.find((f: any) => f.key === 'fn:handleRequest');
    expect(handle.summary.source).toBe('ai');
    expect(responseText(resp)).toContain('Surveyor file');

    // The file argument also accepts the node key.
    const byKey = await viaTool('surveyor_get_file', { file: 'file:src/app.ts' });
    expect(byKey.structuredContent.file.node.key).toBe('file:src/app.ts');
  });

  test('surveyor_get_file: a non-existent file → found:false (not an error)', async () => {
    const resp = await viaTool('surveyor_get_file', { file: 'src/nope.ts' });
    expect(resp.isError).not.toBe(true);
    expect(resp.structuredContent.ok).toBe(true);
    expect(resp.structuredContent.found).toBe(false);
    expect(responseText(resp)).toContain('No file matching');
  });

  test('surveyor_get_file on a project with no scan → found:false', async () => {
    await routeExecutor('project_switch', { project: emptyProjectId }, { connectionId: CONN });
    const resp = await viaTool('surveyor_get_file', { file: 'src/app.ts' });
    expect(resp.structuredContent.found).toBe(false);
    expect(responseText(resp)).toContain('No stored Surveyor scan');
    await routeExecutor('project_switch', { project: projectId }, { connectionId: CONN });
  });

  test('surveyor_findings reads warnings back, severity-ordered, with confidence + category filters', async () => {
    surveyorRoutes.setClient(new FakeSurveyorClient(makeFindingsScanResult()));
    await viaTool('surveyor_scan', { path: '/srv/code/demo' });

    const all = await viaTool('surveyor_findings', {});
    expect(all.isError).not.toBe(true);
    const sc = all.structuredContent;
    expect(sc.ok).toBe(true);
    expect(sc.found).toBe(true);
    expect(sc.totalInScan).toBe(3);
    expect(sc.warnings.map((w: any) => w.level)).toEqual(['error', 'warning', 'info']);
    expect(responseText(all)).toContain('Surveyor findings');

    // minConfidence floor.
    const high = await viaTool('surveyor_findings', { minConfidence: 0.5 });
    expect(high.structuredContent.warnings.map((w: any) => w.key)).toEqual(['w-large']);
    expect(high.structuredContent.filtered).toBe(true);

    // category filter.
    const cat = await viaTool('surveyor_findings', { category: 'orphan' });
    expect(cat.structuredContent.warnings.map((w: any) => w.key)).toEqual(['w-orphan']);

    // bridge string coercion: minConfidence "0.5" and limit "1" arrive as strings.
    const coerced = await viaTool('surveyor_findings', { minConfidence: '0.5', limit: '1' });
    expect(coerced.structuredContent.warnings).toHaveLength(1);
  });

  test('surveyor_findings on a project with no scan → found:false', async () => {
    await routeExecutor('project_switch', { project: emptyProjectId }, { connectionId: CONN });
    const resp = await viaTool('surveyor_findings', {});
    expect(resp.structuredContent.ok).toBe(true);
    expect(resp.structuredContent.found).toBe(false);
    expect(responseText(resp)).toContain('No stored Surveyor scan');
    await routeExecutor('project_switch', { project: projectId }, { connectionId: CONN });
  });
});
