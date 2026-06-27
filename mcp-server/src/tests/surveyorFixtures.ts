/**
 * Surveyor test fixtures — a FAITHFUL FAKE of the Surveyor service, contract-pinned to the
 * real P4a job-API wire shapes (Surveyor P4b, task 8ed9e216).
 *
 * NOT a *.test.ts file (so vitest does not run it as a suite) — a shared helper for the
 * surveyor client/store/tool suites.
 *
 * The fixture ScanResult mirrors @surveyor/core types EXACTLY (the shapes the real service
 * returns: nodes map keyed by id, connections[], warnings[], stats; per-function behavioral
 * summary). The fake fetch reproduces the real endpoints' STATUS CODES and BODIES, including
 * the crucial WRAPPED result: GET /:jobId/result → { result: ScanResult }. If the real
 * contract drifts, the client's unwrap (.result) is the thing these pin.
 */

import type {
  SurveyorScanResult,
  SurveyorNode,
} from '../types/surveyor.js';
import type { ISurveyorClient, SurveyorScanOptions } from '../services/surveyorClient.js';

/** Build a small but faithful ScanResult: 1 file, 2 functions (one with an AI summary), 1 class, 2 connections, 1 warning. */
export function makeScanResult(overrides: Partial<SurveyorScanResult> = {}): SurveyorScanResult {
  const nodes: Record<string, SurveyorNode> = {
    'file:src/app.ts': {
      id: 'file:src/app.ts',
      type: 'file',
      name: 'app.ts',
      filePath: 'src/app.ts',
      line: 1,
      endLine: 120,
      imports: [],
      exports: [],
      functions: ['fn:handleRequest', 'fn:helper'],
      classes: ['cls:Server'],
      topLevelReferences: [],
    },
    'fn:handleRequest': {
      id: 'fn:handleRequest',
      type: 'function',
      name: 'handleRequest',
      filePath: 'src/app.ts',
      line: 10,
      endLine: 40,
      parentFileId: 'file:src/app.ts',
      parentClassId: null,
      params: [{ name: 'req', type: 'Request', isOptional: false, defaultValue: null }],
      returnType: 'Response',
      isExported: true,
      isAsync: true,
      references: ['helper'],
      // The AI/behavioral summary the integration must persist into surveyor_function_summaries.
      behavioral: {
        summary: 'Handles an inbound HTTP request and writes a row to the database.',
        source: 'ai',
        analyzedAt: '2026-06-27T00:00:00.000Z',
        flags: {
          databaseRead: true,
          databaseWrite: true,
          httpCall: false,
          fileRead: false,
          fileWrite: false,
          sendsNotification: false,
          modifiesGlobalState: false,
          hasSideEffects: true,
        },
      },
    },
    'fn:helper': {
      id: 'fn:helper',
      type: 'function',
      name: 'helper',
      filePath: 'src/app.ts',
      line: 42,
      endLine: 50,
      parentFileId: 'file:src/app.ts',
      parentClassId: null,
      params: [],
      returnType: 'void',
      isExported: false,
      isAsync: false,
      references: [],
      behavioral: null, // no summary → must NOT produce a function-summary row
    },
    'cls:Server': {
      id: 'cls:Server',
      type: 'class',
      name: 'Server',
      filePath: 'src/app.ts',
      line: 60,
      endLine: 118,
      parentFileId: 'file:src/app.ts',
      methods: [],
      properties: [],
      isExported: true,
      extends: null,
      implements: [],
    },
  };

  return {
    id: 'scan-fixture-0001',
    projectPath: '/srv/code/demo',
    projectName: 'demo',
    status: 'complete',
    createdAt: '2026-06-27T00:00:00.000Z',
    completedAt: '2026-06-27T00:00:05.000Z',
    stats: {
      totalFiles: 1,
      totalFunctions: 2,
      totalClasses: 1,
      totalConnections: 2,
      totalWarnings: 1,
      warningsByLevel: { info: 0, warning: 1, error: 0 },
      nodesByType: { file: 1, function: 2, class: 1 },
      analyzedCount: 1,
      pendingAnalysis: 1,
    },
    nodes,
    connections: [
      {
        id: 'conn:1',
        sourceId: 'fn:handleRequest',
        targetId: 'fn:helper',
        type: 'function_call',
        weight: 1,
        metadata: { isCircular: false, callCount: 1, locations: [] },
      },
      {
        id: 'conn:2',
        sourceId: 'cls:Server',
        targetId: 'fn:handleRequest',
        type: 'function_call',
        weight: 1,
        metadata: { isCircular: false, callCount: 1, locations: [] },
      },
    ],
    warnings: [
      {
        id: 'warn:1',
        category: 'large_file',
        level: 'warning',
        title: 'Large file: app.ts',
        description: 'app.ts is large; consider splitting.',
        affectedNodes: ['file:src/app.ts'],
        suggestion: { summary: 'Split the file', reasoning: '...', codeExample: null, autoFixable: false },
        detectedAt: '2026-06-27T00:00:04.000Z',
        source: 'surveyor',
        confidence: 0.9,
        dismissible: true,
      },
    ],
    clusters: [],
    errors: [],
    ...overrides,
  };
}

/**
 * A ScanResult carrying THREE warnings of varied level/category/confidence (one unscored) so
 * the findings read tool's severity ordering + confidence/category filters are exercised
 * end-to-end. Shared by the store + tools suites (one fixture, no drift). The stats' totalWarnings
 * is set to 3 so the persisted denormalized count matches.
 */
export function makeFindingsScanResult(overrides: Partial<SurveyorScanResult> = {}): SurveyorScanResult {
  const base = makeScanResult();
  return makeScanResult({
    id: 'findings-fixture-0001',
    stats: { ...base.stats, totalWarnings: 3, warningsByLevel: { info: 1, warning: 1, error: 1 } },
    warnings: [
      {
        id: 'w-large', category: 'large_file', level: 'warning', title: 'Large file',
        description: 'app.ts is large', affectedNodes: ['file:src/app.ts'],
        suggestion: { summary: 'Split it', autoFixable: false }, source: 'surveyor',
        confidence: 0.9, dismissible: true, detectedAt: '2026-06-27T00:00:00.000Z',
      },
      {
        id: 'w-circular', category: 'circular_dependency', level: 'error', title: 'Circular dep',
        description: 'cycle', affectedNodes: ['fn:helper', 'fn:handleRequest'],
        source: 'dependency-cruiser', confidence: 0.4, dismissible: false,
        detectedAt: '2026-06-27T00:00:01.000Z',
      },
      {
        id: 'w-orphan', category: 'orphan', level: 'info', title: 'Orphaned export',
        description: 'unused', affectedNodes: [], source: 'knip', dismissible: true,
        detectedAt: '2026-06-27T00:00:02.000Z',
        // no confidence → unscored
      },
    ],
    ...overrides,
  });
}

/** A JSON Response with a given status (uses the global undici Response). */
function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export interface FakeFetchOptions {
  /** The ScanResult the /result endpoint returns (WRAPPED). */
  result?: SurveyorScanResult;
  /** How many polls report 'running' before the job reports 'done'. Default 1. */
  runningPolls?: number;
  /** Force the job into 'error' state (status poll returns error). */
  jobError?: string;
}

/**
 * A faithful fake `fetch` reproducing the real job-API endpoints + status codes + bodies:
 *   POST /api/v1/scans               -> 202 { jobId, status:'queued' }
 *   GET  /api/v1/scans/:jobId        -> { jobId, status, progress } (running×N then done|error)
 *   GET  /api/v1/scans/:jobId/result -> 200 { result: ScanResult }   ← WRAPPED
 * Asserts the bearer auth header is present (401 otherwise), matching the service's bearerAuth.
 */
export function makeFakeFetch(opts: FakeFetchOptions = {}): typeof fetch {
  const result = opts.result ?? makeScanResult();
  const runningPolls = opts.runningPolls ?? 1;
  let polls = 0;
  const jobId = 'job-fixture-abc';

  const fake = async (input: any, init?: any): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const auth = (init?.headers?.Authorization ?? init?.headers?.authorization) as string | undefined;
    if (!auth || !/^Bearer\s+.+/i.test(auth)) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    if (method === 'POST' && /\/api\/v1\/scans$/.test(url)) {
      return jsonResponse({ jobId, status: 'queued' }, 202);
    }
    const resultMatch = /\/api\/v1\/scans\/([^/]+)\/result$/.exec(url);
    if (method === 'GET' && resultMatch) {
      // WRAPPED: { result: ScanResult }
      return jsonResponse({ result }, 200);
    }
    const statusMatch = /\/api\/v1\/scans\/([^/]+)$/.exec(url);
    if (method === 'GET' && statusMatch) {
      if (opts.jobError) {
        return jsonResponse({ jobId, status: 'error', error: opts.jobError }, 200);
      }
      polls += 1;
      const status = polls > runningPolls ? 'done' : 'running';
      return jsonResponse({ jobId, status, progress: null }, 200);
    }
    return jsonResponse({ error: `unexpected ${method} ${url}` }, 500);
  };
  return fake as unknown as typeof fetch;
}

/** A faithful FAKE client (implements ISurveyorClient) for the store/tool suites — returns a contract-shaped ScanResult with no network. */
export class FakeSurveyorClient implements ISurveyorClient {
  public lastPath?: string;
  public lastOptions?: SurveyorScanOptions;
  constructor(private readonly result: SurveyorScanResult = makeScanResult()) {}
  async scan(projectPath: string, options?: SurveyorScanOptions): Promise<SurveyorScanResult> {
    this.lastPath = projectPath;
    this.lastOptions = options;
    return { ...this.result, projectPath };
  }
}
