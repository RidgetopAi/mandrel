/**
 * Pure graph helpers shared by view strategies.
 *
 * Kept dependency-free and deterministic so the views built on them are easy to
 * unit-test (no layout engine, no React).
 */

/** A directed edge expressed as a source→target id pair. */
export interface DirectedEdge {
  source: string;
  target: string;
}

export interface CycleInfo {
  /** Node ids that participate in a directed cycle (SCC size > 1, or self-loop). */
  inCycle: Set<string>;
  /**
   * SCC id per node id. Two nodes are in the same cycle iff they share an scc id
   * AND that id is in `cyclicSccs`. Bridge edges between two different cyclic
   * SCCs are therefore NOT circular.
   */
  sccId: Map<string, number>;
  /** SCC ids that actually form a cycle. */
  cyclicSccs: Set<number>;
}

/**
 * Strongly-connected-components via iterative Tarjan (no recursion → safe on
 * large graphs). Deterministic: iteration follows `nodeIds` then edge order.
 */
export function computeCycles(
  nodeIds: string[],
  edges: DirectedEdge[]
): CycleInfo {
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  const selfLoops = new Set<string>();
  for (const e of edges) {
    if (!adj.has(e.source) || !adj.has(e.target)) continue;
    if (e.source === e.target) {
      selfLoops.add(e.source);
      continue;
    }
    adj.get(e.source)!.push(e.target);
  }

  let index = 0;
  let nextScc = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccId = new Map<string, number>();
  const cyclicSccs = new Set<number>();
  const inCycle = new Set<string>();

  for (const start of nodeIds) {
    if (indices.has(start)) continue;
    const work: { node: string; childIdx: number }[] = [{ node: start, childIdx: 0 }];
    while (work.length > 0) {
      const frame = work[work.length - 1]!;
      const v = frame.node;
      if (frame.childIdx === 0) {
        indices.set(v, index);
        lowlink.set(v, index);
        index++;
        stack.push(v);
        onStack.add(v);
      }
      const children = adj.get(v)!;
      if (frame.childIdx < children.length) {
        const w = children[frame.childIdx]!;
        frame.childIdx++;
        if (!indices.has(w)) {
          work.push({ node: w, childIdx: 0 });
        } else if (onStack.has(w)) {
          lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
        }
      } else {
        if (lowlink.get(v) === indices.get(v)) {
          const scc: string[] = [];
          let w: string;
          do {
            w = stack.pop()!;
            onStack.delete(w);
            scc.push(w);
            sccId.set(w, nextScc);
          } while (w !== v);
          const isCyclic =
            scc.length > 1 || (scc.length === 1 && selfLoops.has(scc[0]!));
          if (isCyclic) {
            cyclicSccs.add(nextScc);
            for (const id of scc) inCycle.add(id);
          }
          nextScc++;
        }
        work.pop();
        const parent = work[work.length - 1];
        if (parent) {
          lowlink.set(parent.node, Math.min(lowlink.get(parent.node)!, lowlink.get(v)!));
        }
      }
    }
  }

  return { inCycle, sccId, cyclicSccs };
}

/**
 * An edge is circular iff both endpoints belong to the SAME cyclic SCC. (A
 * self-loop is also circular.)
 */
export function isCircularEdge(edge: DirectedEdge, cycles: CycleInfo): boolean {
  if (edge.source === edge.target) return cycles.inCycle.has(edge.source);
  const a = cycles.sccId.get(edge.source);
  const b = cycles.sccId.get(edge.target);
  return a !== undefined && a === b && cycles.cyclicSccs.has(a);
}

/** Extract the parent folder path of a file path ('.' for root-level files). */
export function folderOf(filePath: string): string {
  const parts = filePath.split('/');
  if (parts.length <= 1) return '.';
  return parts.slice(0, -1).join('/');
}
