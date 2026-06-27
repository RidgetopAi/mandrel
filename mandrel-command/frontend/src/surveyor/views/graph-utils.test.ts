import { computeCycles, isCircularEdge, folderOf } from './graph-utils';

describe('folderOf', () => {
  it('extracts the parent folder', () => {
    expect(folderOf('src/util/c.ts')).toBe('src/util');
    expect(folderOf('src/a.ts')).toBe('src');
  });
  it('returns "." for root-level files', () => {
    expect(folderOf('index.ts')).toBe('.');
  });
});

describe('computeCycles', () => {
  it('finds a simple two-node cycle', () => {
    const nodes = ['a', 'b', 'c'];
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'a' },
      { source: 'c', target: 'a' },
    ];
    const cycles = computeCycles(nodes, edges);
    expect(cycles.inCycle).toEqual(new Set(['a', 'b']));
    expect(cycles.inCycle.has('c')).toBe(false);
    expect(cycles.cyclicSccs.size).toBe(1);
  });

  it('treats a self-loop as a cycle', () => {
    const cycles = computeCycles(['x', 'y'], [{ source: 'x', target: 'x' }]);
    expect(cycles.inCycle.has('x')).toBe(true);
    expect(cycles.inCycle.has('y')).toBe(false);
  });

  it('reports no cycles for a DAG', () => {
    const cycles = computeCycles(
      ['a', 'b', 'c'],
      [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
      ]
    );
    expect(cycles.inCycle.size).toBe(0);
    expect(cycles.cyclicSccs.size).toBe(0);
  });
});

describe('isCircularEdge', () => {
  it('marks an edge inside a cycle and not a bridge between two cyclic SCCs', () => {
    // Two independent 2-cycles A<->B and C<->D, bridged by B->C.
    const nodes = ['A', 'B', 'C', 'D'];
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'B', target: 'A' },
      { source: 'C', target: 'D' },
      { source: 'D', target: 'C' },
      { source: 'B', target: 'C' },
    ];
    const cycles = computeCycles(nodes, edges);
    expect(isCircularEdge({ source: 'A', target: 'B' }, cycles)).toBe(true);
    expect(isCircularEdge({ source: 'C', target: 'D' }, cycles)).toBe(true);
    // bridge: both endpoints are "in a cycle" but NOT the same SCC.
    expect(isCircularEdge({ source: 'B', target: 'C' }, cycles)).toBe(false);
  });
});
