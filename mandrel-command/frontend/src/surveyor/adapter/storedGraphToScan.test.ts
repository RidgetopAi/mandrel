/**
 * Tests for storedGraphToScan — the backend-DTO → core-ScanResult seam.
 *
 * This adapter is the ONLY place that bridges the command-backend's stored graph
 * shape to the ScanResult the ported pure views/cards/findings consume. The DTO
 * interfaces here are a hand-mirror of the backend (separate package), so this
 * test pins the mapping: if the mapping (or an assumed field) drifts, it fails
 * here rather than silently mis-rendering the canvas.
 */

import { storedGraphToScan } from './storedGraphToScan';
import type {
  GraphDto,
  FindingsDto,
  ScanHeaderDto,
  NodeDto,
  ConnectionDto,
} from '../api/surveyorClient';

const header: ScanHeaderDto = {
  scanId: 'scan-1',
  projectId: 'proj-1',
  projectName: 'demo',
  projectPath: '/srv/demo',
  status: 'complete',
  sourceScanId: 'svc-job-1',
  stats: {},
  totals: { files: 1, functions: 1, classes: 0, connections: 1, warnings: 1 },
  createdAt: '2026-06-27T00:00:00Z',
  completedAt: '2026-06-27T00:01:00Z',
};

const fileNode: NodeDto = {
  key: 'file:src/a.ts',
  type: 'file',
  name: 'a.ts',
  filePath: 'src/a.ts',
  line: 1,
  endLine: 40,
  // .data carries the original core payload; arrays present here should survive.
  data: { imports: [{ source: './b' }], exports: [], functions: ['fn:foo'], classes: [] },
};

const fnNode: NodeDto = {
  key: 'fn:foo',
  type: 'function',
  name: 'foo',
  filePath: 'src/a.ts',
  line: 5,
  endLine: 10,
  data: { isExported: true },
};

const conn: ConnectionDto = {
  key: 'conn:imp:a-b',
  sourceKey: 'file:src/a.ts',
  targetKey: 'file:src/b.ts',
  type: 'import',
  weight: 2,
  metadata: { isCircular: true, callCount: 3, locations: [] },
};

function graph(overrides: Partial<GraphDto> = {}): GraphDto {
  return {
    found: true,
    scan: header,
    nodes: [fileNode, fnNode],
    connections: [conn],
    truncated: false,
    ...overrides,
  };
}

describe('storedGraphToScan', () => {
  it('returns null when the graph is not found or has no scan', () => {
    expect(storedGraphToScan({ ...graph(), found: false })).toBeNull();
    expect(storedGraphToScan({ ...graph(), scan: null })).toBeNull();
  });

  it('maps nodes keyed by node_key, pinning identity from the extracted columns', () => {
    const scan = storedGraphToScan(graph())!;
    expect(scan).not.toBeNull();
    expect(Object.keys(scan.nodes).sort()).toEqual(['file:src/a.ts', 'fn:foo']);

    const file = scan.nodes['file:src/a.ts'] as Record<string, unknown>;
    // id is the store key (so connections/members resolve), identity overlaid on .data
    expect(file.id).toBe('file:src/a.ts');
    expect(file.type).toBe('file');
    expect(file.name).toBe('a.ts');
    expect(file.filePath).toBe('src/a.ts');
    expect(file.endLine).toBe(40);
    // .data payload preserved
    expect(file.functions).toEqual(['fn:foo']);
    expect((file.imports as unknown[]).length).toBe(1);
  });

  it('defaults a file node\'s array fields when .data omits them (forward-compat)', () => {
    const bareFile: NodeDto = {
      key: 'file:src/c.ts',
      type: 'file',
      name: 'c.ts',
      filePath: 'src/c.ts',
      line: 1,
      endLine: 2,
      data: {}, // no imports/exports/functions/classes
    };
    const scan = storedGraphToScan(graph({ nodes: [bareFile] }))!;
    const c = scan.nodes['file:src/c.ts'] as Record<string, unknown>;
    expect(c.imports).toEqual([]);
    expect(c.exports).toEqual([]);
    expect(c.functions).toEqual([]);
    expect(c.classes).toEqual([]);
    expect(c.topLevelReferences).toEqual([]);
  });

  it('maps connections sourceKey/targetKey -> sourceId/targetId with coerced metadata', () => {
    const scan = storedGraphToScan(graph())!;
    expect(scan.connections).toHaveLength(1);
    const c = scan.connections[0];
    expect(c.id).toBe('conn:imp:a-b');
    expect(c.sourceId).toBe('file:src/a.ts');
    expect(c.targetId).toBe('file:src/b.ts');
    expect(c.type).toBe('import');
    expect(c.weight).toBe(2);
    expect(c.metadata.isCircular).toBe(true);
    expect(c.metadata.callCount).toBe(3);
    expect(c.metadata.locations).toEqual([]);
  });

  it('folds findings warnings into scan.warnings, defaulting optional fields', () => {
    const findings: FindingsDto = {
      found: true,
      scan: header,
      warnings: [
        {
          key: 'w1',
          category: 'circular_dependency',
          level: 'warning',
          title: 'Cycle: a -> b -> a',
          description: null,
          affectedNodes: ['file:src/a.ts', 'file:src/b.ts'],
          suggestion: null,
          source: 'dependency-cruiser',
          confidence: 0.6,
          dismissible: true,
          detectedAt: null,
        },
      ],
      totalInScan: 1,
      filtered: false,
    };
    const scan = storedGraphToScan(graph(), findings)!;
    expect(scan.warnings).toHaveLength(1);
    const w = scan.warnings[0];
    expect(w.id).toBe('w1');
    expect(w.category).toBe('circular_dependency');
    expect(w.source).toBe('dependency-cruiser');
    expect(w.confidence).toBe(0.6);
    expect(w.dismissible).toBe(true);
    expect(w.description).toBe(''); // null -> ''
    expect(w.detectedAt).toBe(''); // null -> ''
  });

  it('renders graph-only (no findings) with an empty warnings list and header-derived stats', () => {
    const scan = storedGraphToScan(graph())!;
    expect(scan.warnings).toEqual([]);
    expect(scan.id).toBe('scan-1');
    expect(scan.projectName).toBe('demo');
    expect(scan.status).toBe('complete');
    expect(scan.stats.totalFiles).toBe(1);
    expect(scan.stats.totalFunctions).toBe(1);
    expect(scan.stats.totalConnections).toBe(1);
    expect(scan.stats.totalWarnings).toBe(1);
  });

  it('defaults a warning confidence/source when the backend omits them', () => {
    const findings: FindingsDto = {
      found: true,
      scan: header,
      warnings: [
        {
          key: 'w2',
          category: 'large_file',
          level: 'info',
          title: 'Large file',
          description: 'big',
          affectedNodes: [],
          suggestion: null,
          source: null,
          confidence: null,
          dismissible: false,
          detectedAt: null,
        },
      ],
      totalInScan: 1,
      filtered: false,
    };
    const w = storedGraphToScan(graph(), findings)!.warnings[0];
    expect(w.source).toBe('surveyor'); // null -> default
    expect(w.confidence).toBe(0); // null -> 0
  });
});
