/**
 * Layout engines behind the view seam.
 *
 * Each engine is a PURE function: given node ids (+ edges, for the DAG) it
 * returns a deterministic position map. Views pick the engine that fits their
 * shape. This replaces the hand-math grid that used to live inside Canvas.
 */

import dagre from '@dagrejs/dagre';
import { DAGRE_LAYOUT, GRID_LAYOUT, LANE_LAYOUT } from '../config/layout.config';

export interface Position {
  x: number;
  y: number;
}

export interface SizedNode {
  id: string;
  width: number;
  height: number;
}

/**
 * Layered DAG layout via dagre (dependency view, drilled-in file view).
 * Returns top-left positions (React Flow uses top-left; dagre uses centers).
 */
export function layoutDagre(
  nodes: SizedNode[],
  edges: { source: string; target: string }[],
  opts: Partial<typeof DAGRE_LAYOUT> = {}
): Map<string, Position> {
  const cfg = { ...DAGRE_LAYOUT, ...opts };
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: cfg.rankdir,
    ranksep: cfg.ranksep,
    nodesep: cfg.nodesep,
    marginx: cfg.marginx,
    marginy: cfg.marginy,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    g.setNode(n.id, { width: n.width, height: n.height });
  }
  const nodeSet = new Set(nodes.map((n) => n.id));
  for (const e of edges) {
    if (nodeSet.has(e.source) && nodeSet.has(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  const positions = new Map<string, Position>();
  for (const n of nodes) {
    const laid = g.node(n.id);
    // dagre gives center coords; convert to top-left for React Flow.
    positions.set(n.id, {
      x: laid.x - n.width / 2,
      y: laid.y - n.height / 2,
    });
  }
  return positions;
}

/**
 * Fixed-column grid layout (file-structure folder overview). Order of `ids`
 * determines placement (row-major).
 */
export function layoutGrid(
  ids: string[],
  size: { width: number; height: number },
  opts: Partial<typeof GRID_LAYOUT> = {}
): Map<string, Position> {
  const cfg = { ...GRID_LAYOUT, ...opts };
  const positions = new Map<string, Position>();
  ids.forEach((id, i) => {
    const col = i % cfg.columns;
    const row = Math.floor(i / cfg.columns);
    positions.set(id, {
      x: cfg.originX + col * (size.width + cfg.hGap),
      y: cfg.originY + row * (size.height + cfg.vGap),
    });
  });
  return positions;
}

/**
 * Lane layout — one column per group, members stacked vertically within the
 * lane (data-flow effect map). `lanes` order = left→right column order; the
 * `ids` order within each lane = top→bottom.
 */
export function layoutLanes(
  lanes: { key: string; ids: string[] }[],
  size: { height: number },
  opts: Partial<typeof LANE_LAYOUT> = {}
): Map<string, Position> {
  const cfg = { ...LANE_LAYOUT, ...opts };
  const positions = new Map<string, Position>();
  lanes.forEach((lane, laneIdx) => {
    const x = cfg.originX + laneIdx * cfg.laneGap;
    lane.ids.forEach((id, rowIdx) => {
      positions.set(id, {
        x,
        y: cfg.originY + rowIdx * (size.height + cfg.rowGap),
      });
    });
  });
  return positions;
}
