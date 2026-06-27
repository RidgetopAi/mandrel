/**
 * Deterministic ScanResult fixtures for view-strategy unit tests.
 *
 * Topology:
 *   Files:    src/a.ts, src/b.ts, src/util/c.ts, src/util/d.ts
 *   Imports:  a→b, b→a (cycle), c→a            (d.ts is isolated)
 *   Functions:
 *     fnA1 (a.ts) databaseRead   → 'database'
 *     fnA2 (a.ts) hasSideEffects → 'state'
 *     fnB1 (b.ts) httpCall       → 'network'
 *     fnC1 (c.ts) behavioral=null→ 'unknown'
 *   Calls:    fnA1→fnB1
 *   Warnings: circular-dep on a.ts; large-file on util/c.ts
 */

import type {
  ScanResult,
  FileNode,
  FunctionNode,
  ClassNode,
  Connection,
  Warning,
  BehavioralFlags,
  BehavioralSummary,
} from '../../core-types';
import {
  NodeType,
  ConnectionType,
  ScanStatus,
  SummarySource,
  WarningLevel,
  WarningCategory,
  WarningSource,
} from '../../core-types';

const NO_FLAGS: BehavioralFlags = {
  databaseRead: false,
  databaseWrite: false,
  httpCall: false,
  fileRead: false,
  fileWrite: false,
  sendsNotification: false,
  modifiesGlobalState: false,
  hasSideEffects: false,
};

export function flags(overrides: Partial<BehavioralFlags>): BehavioralFlags {
  return { ...NO_FLAGS, ...overrides };
}

function behavioral(f: BehavioralFlags): BehavioralSummary {
  return {
    summary: 'fixture',
    source: SummarySource.AI,
    analyzedAt: '2026-01-01T00:00:00.000Z',
    flags: f,
  };
}

function file(id: string, filePath: string, imports: string[], functions: string[]): FileNode {
  return {
    id,
    type: NodeType.File,
    name: filePath.split('/').pop()!,
    filePath,
    line: 1,
    endLine: 100,
    imports: imports.map((source) => ({ source, items: [], isTypeOnly: false })),
    exports: [],
    functions,
    classes: [],
    topLevelReferences: [],
  };
}

function fn(
  id: string,
  name: string,
  filePath: string,
  parentFileId: string,
  b: BehavioralSummary | null,
  isAsync = false
): FunctionNode {
  return {
    id,
    type: NodeType.Function,
    name,
    filePath,
    line: 1,
    endLine: 10,
    parentFileId,
    parentClassId: null,
    params: [],
    returnType: null,
    isExported: true,
    isAsync,
    behavioral: b,
    references: [],
  };
}

function cls(
  id: string,
  name: string,
  filePath: string,
  parentFileId: string,
  methods: string[],
  ext: string | null,
  impl: string[]
): ClassNode {
  return {
    id,
    type: NodeType.Class,
    name,
    filePath,
    line: 1,
    endLine: 40,
    parentFileId,
    methods,
    properties: [],
    isExported: true,
    extends: ext,
    implements: impl,
  };
}

function importConn(id: string, sourceId: string, targetId: string): Connection {
  return {
    id,
    sourceId,
    targetId,
    type: ConnectionType.Import,
    weight: 1,
    metadata: { isCircular: false, callCount: 1, locations: [] },
  };
}

function callConn(id: string, sourceId: string, targetId: string): Connection {
  return {
    id,
    sourceId,
    targetId,
    type: ConnectionType.FunctionCall,
    weight: 1,
    metadata: { isCircular: false, callCount: 1, locations: [] },
  };
}

export interface FixtureOptions {
  /** When true, strip behavioral data from ALL functions (no-AI-scan case). */
  noBehavioral?: boolean;
  /**
   * When true, add a ClassNode to src/a.ts (id `class:a1`, two methods,
   * extends/implements) and wire it into fileA.classes. Default off so the
   * baseline view tests are unaffected.
   */
  withClasses?: boolean;
}

export function makeScan(opts: FixtureOptions = {}): ScanResult {
  const fileA = file('file:a', 'src/a.ts', ['./b'], ['fn:a1', 'fn:a2']);
  const fileB = file('file:b', 'src/b.ts', ['./a'], ['fn:b1']);
  const fileC = file('file:c', 'src/util/c.ts', ['../a'], ['fn:c1']);
  const fileD = file('file:d', 'src/util/d.ts', [], []);

  const fnA1 = fn('fn:a1', 'readUser', 'src/a.ts', 'file:a', opts.noBehavioral ? null : behavioral(flags({ databaseRead: true })));
  const fnA2 = fn('fn:a2', 'mutateGlobal', 'src/a.ts', 'file:a', opts.noBehavioral ? null : behavioral(flags({ hasSideEffects: true })));
  const fnB1 = fn('fn:b1', 'fetchRemote', 'src/b.ts', 'file:b', opts.noBehavioral ? null : behavioral(flags({ httpCall: true })), true);
  const fnC1 = fn('fn:c1', 'pureHelper', 'src/util/c.ts', 'file:c', null);

  const classA1 = opts.withClasses
    ? cls('class:a1', 'Widget', 'src/a.ts', 'file:a', ['render', 'dispose'], 'Component', ['Disposable'])
    : null;
  if (classA1) fileA.classes = [classA1.id];

  const nodes = {
    [fileA.id]: fileA,
    [fileB.id]: fileB,
    [fileC.id]: fileC,
    [fileD.id]: fileD,
    [fnA1.id]: fnA1,
    [fnA2.id]: fnA2,
    [fnB1.id]: fnB1,
    [fnC1.id]: fnC1,
    ...(classA1 ? { [classA1.id]: classA1 } : {}),
  };

  const connections: Connection[] = [
    importConn('conn:imp:a-b', 'file:a', 'file:b'),
    importConn('conn:imp:b-a', 'file:b', 'file:a'),
    importConn('conn:imp:c-a', 'file:c', 'file:a'),
    callConn('conn:call:a1-b1', 'fn:a1', 'fn:b1'),
  ];

  const warnings: Warning[] = [
    {
      id: 'warn:cycle',
      category: WarningCategory.CircularDependency,
      level: WarningLevel.Warning,
      title: 'Circular dependency',
      description: 'a.ts <-> b.ts',
      affectedNodes: ['file:a', 'file:b'],
      suggestion: null,
      detectedAt: '2026-01-01T00:00:00.000Z',
      source: WarningSource.DependencyCruiser,
      confidence: 0.95,
      dismissible: false,
    },
    {
      id: 'warn:large',
      category: WarningCategory.LargeFile,
      level: WarningLevel.Info,
      title: 'Large file',
      description: 'util/c.ts is large',
      affectedNodes: ['file:c'],
      suggestion: null,
      detectedAt: '2026-01-01T00:00:00.000Z',
      source: WarningSource.Surveyor,
      confidence: 0.9,
      dismissible: true,
    },
  ];

  return {
    id: 'scan:fixture',
    projectPath: '/fixture',
    projectName: 'fixture',
    status: ScanStatus.Complete,
    createdAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:00.000Z',
    stats: {
      totalFiles: 4,
      totalFunctions: 4,
      totalClasses: classA1 ? 1 : 0,
      totalConnections: connections.length,
      totalWarnings: warnings.length,
      warningsByLevel: {
        [WarningLevel.Info]: 1,
        [WarningLevel.Warning]: 1,
        [WarningLevel.Error]: 0,
      },
      nodesByType: classA1 ? { file: 4, function: 4, class: 1 } : { file: 4, function: 4 },
      analyzedCount: opts.noBehavioral ? 0 : 3,
      pendingAnalysis: opts.noBehavioral ? 4 : 1,
    },
    nodes,
    connections,
    warnings,
    clusters: [],
    errors: [],
  };
}
