import { buildGraph } from './build-graph';
import { makeScan } from './__fixtures__/scan.fixture';
import { EFFECT_GROUP_STYLES } from '../config/view.config';

const ids = (arr: { id: string }[]) => arr.map((n) => n.id).sort();

describe('buildGraph dispatch', () => {
  it('returns an empty graph for a null scan', () => {
    const g = buildGraph('dependency', null, { currentFolder: null });
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
  });
});

describe('file-structure view', () => {
  const scan = makeScan();

  it('root: one folder node per folder, no edges, with counts + warning counts', () => {
    const g = buildGraph('file-structure', scan, { currentFolder: null });
    expect(ids(g.nodes)).toEqual(['folder:src', 'folder:src/util']);
    expect(g.edges).toEqual([]);
    expect(g.nodes.every((n) => n.type === 'folder')).toBe(true);

    const src = g.nodes.find((n) => n.id === 'folder:src')!;
    expect(src.data.fileCount).toBe(2);
    expect(src.data.functionCount).toBe(3); // a.ts(2) + b.ts(1)
    expect(src.data.warningCount).toBe(1); // circular dep affects src

    const util = g.nodes.find((n) => n.id === 'folder:src/util')!;
    expect(util.data.fileCount).toBe(2);
    expect(util.data.warningCount).toBe(1); // large-file affects util/c.ts
  });

  it('drilled into src: file nodes wired by the REAL import connections', () => {
    const g = buildGraph('file-structure', scan, { currentFolder: 'src' });
    expect(ids(g.nodes)).toEqual(['file:a', 'file:b']);
    expect(g.nodes.every((n) => n.type === 'file')).toBe(true);
    // a→b and b→a both live within src
    expect(ids(g.edges)).toEqual(['conn:imp:a-b', 'conn:imp:b-a']);
  });

  it('drilled into src/util: cross-folder imports are excluded (c→a leaves the folder)', () => {
    const g = buildGraph('file-structure', scan, { currentFolder: 'src/util' });
    expect(ids(g.nodes)).toEqual(['file:c', 'file:d']);
    expect(g.edges).toEqual([]);
  });
});

describe('dependency view', () => {
  const scan = makeScan();
  const g = buildGraph('dependency', scan, { currentFolder: null });

  it('includes only files that participate in imports (isolated d.ts excluded)', () => {
    expect(ids(g.nodes)).toEqual(['file:a', 'file:b', 'file:c']);
  });

  it('renders edges straight from scan.connections (real graph, same ids)', () => {
    expect(ids(g.edges)).toEqual(['conn:imp:a-b', 'conn:imp:b-a', 'conn:imp:c-a']);
  });

  it('detects the import cycle and flags nodes + edges', () => {
    const a = g.nodes.find((n) => n.id === 'file:a')!;
    const c = g.nodes.find((n) => n.id === 'file:c')!;
    expect(a.data.inCycle).toBe(true);
    expect(c.data.inCycle).toBe(false);

    const ab = g.edges.find((e) => e.id === 'conn:imp:a-b')!;
    const ca = g.edges.find((e) => e.id === 'conn:imp:c-a')!;
    expect(ab.data?.circular).toBe(true);
    expect(ca.data?.circular).toBe(false);

    expect(g.meta.cycleCount).toBe(1);
    expect(g.meta.nodesInCycles).toBe(2);
  });

  it('lays nodes out (layout engine ran → numeric positions)', () => {
    expect(g.nodes.every((n) => Number.isFinite(n.position.x) && Number.isFinite(n.position.y))).toBe(true);
  });
});

describe('data-flow view', () => {
  it('groups + colors functions by behavioral effect, using real call edges', () => {
    const scan = makeScan();
    const g = buildGraph('data-flow', scan, { currentFolder: null });

    expect(g.nodes).toHaveLength(4);
    expect(g.nodes.every((n) => n.type === 'effect')).toBe(true);

    const byId = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
    expect(byId['fn:a1']!.data.effectGroup).toBe('database');
    expect(byId['fn:a1']!.data.color).toBe(EFFECT_GROUP_STYLES.database.color);
    expect(byId['fn:b1']!.data.effectGroup).toBe('network');
    expect(byId['fn:a2']!.data.effectGroup).toBe('state');
    expect(byId['fn:c1']!.data.effectGroup).toBe('unknown');

    // real function-call edge, taken from scan.connections
    expect(ids(g.edges)).toEqual(['conn:call:a1-b1']);

    expect(g.meta.hasBehavioralData).toBe(true);
    expect(g.meta.groupCounts).toMatchObject({ database: 1, network: 1, state: 1, unknown: 1 });
  });

  it('degrades gracefully with no AI behavioral data (all unknown, never faked)', () => {
    const scan = makeScan({ noBehavioral: true });
    const g = buildGraph('data-flow', scan, { currentFolder: null });

    expect(g.nodes).toHaveLength(4);
    expect(g.nodes.every((n) => n.data.effectGroup === 'unknown')).toBe(true);
    expect(g.meta.hasBehavioralData).toBe(false);
    expect(g.meta.laneCount).toBe(1);
    expect(g.meta.groupCounts).toMatchObject({ unknown: 4 });
  });

  it('lanes are separated horizontally (lane layout ran)', () => {
    const scan = makeScan();
    const g = buildGraph('data-flow', scan, { currentFolder: null });
    const xs = new Set(g.nodes.map((n) => n.position.x));
    // 4 distinct effect groups → 4 distinct lane x-positions
    expect(xs.size).toBe(4);
  });
});
