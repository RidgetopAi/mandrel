/**
 * Dependency view — the module import DAG.
 *
 * Nodes = files that participate in at least one import relationship.
 * Edges = the REAL import connections (scan.connections of type Import).
 * Layout = dagre layered DAG (left→right). Import cycles are detected (Tarjan
 * SCC) and the edges/nodes inside a cycle are flagged so the renderer can
 * highlight them.
 */

import type { ScanResult, FileNode } from '../core-types';
import type { BuiltGraph, GraphEdge, GraphNode } from './types';
import { NODE_TYPE, CONNECTION_TYPE } from '../config/contract';
import { computeCycles, isCircularEdge } from './graph-utils';
import { layoutDagre } from './layout';
import { NODE_SIZE } from '../config/layout.config';
import { EDGE_STYLE } from '../config/view.config';

export function buildDependencyView(scan: ScanResult): BuiltGraph {
  const fileById = new Map<string, FileNode>();
  for (const n of Object.values(scan.nodes)) {
    if (n.type === NODE_TYPE.File) fileById.set(n.id, n as FileNode);
  }

  const importEdges = scan.connections.filter(
    (c) =>
      c.type === CONNECTION_TYPE.Import &&
      fileById.has(c.sourceId) &&
      fileById.has(c.targetId)
  );

  // Only include files that take part in the dependency graph.
  const participating = new Set<string>();
  for (const e of importEdges) {
    participating.add(e.sourceId);
    participating.add(e.targetId);
  }

  const nodeIds = Array.from(participating).sort();
  const cycles = computeCycles(
    nodeIds,
    importEdges.map((c) => ({ source: c.sourceId, target: c.targetId }))
  );

  const positions = layoutDagre(
    nodeIds.map((id) => ({ id, ...NODE_SIZE.file })),
    importEdges.map((c) => ({ source: c.sourceId, target: c.targetId }))
  );

  const nodes: GraphNode[] = nodeIds.map((id) => {
    const file = fileById.get(id)!;
    const inCycle = cycles.inCycle.has(id);
    return {
      id,
      type: 'file',
      position: positions.get(id) ?? { x: 0, y: 0 },
      data: {
        label: file.name,
        filePath: file.filePath,
        fileData: file,
        inCycle,
      },
    };
  });

  const edges: GraphEdge[] = importEdges.map((c) => {
    const circular = isCircularEdge(
      { source: c.sourceId, target: c.targetId },
      cycles
    );
    return {
      id: c.id,
      source: c.sourceId,
      target: c.targetId,
      type: 'smoothstep',
      data: { circular, weight: c.weight },
      ...(circular ? { animated: true, style: { ...EDGE_STYLE.circular } } : {}),
    };
  });

  return {
    nodes,
    edges,
    meta: {
      moduleCount: nodeIds.length,
      importCount: importEdges.length,
      cycleCount: cycles.cyclicSccs.size,
      nodesInCycles: cycles.inCycle.size,
    },
  };
}
