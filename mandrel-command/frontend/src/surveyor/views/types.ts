/**
 * ViewStrategy seam types.
 *
 * A view is a PURE function of (scan, navState) → {nodes, edges}. The Canvas is
 * a dumb renderer of this output: it knows nothing about folders, dependencies
 * or effects — it only renders GraphNode/GraphEdge and applies generic
 * interaction styling (hover/search/highlight).
 */

import type { ScanResult } from '../core-types';
import type { ViewId } from '../config/view.config';

export type { ViewId };

/** Navigation state the views need (currently just folder drilldown). */
export interface NavState {
  /** null = root/overview; a folder path = drilled into that folder. */
  currentFolder: string | null;
}

/**
 * Framework-agnostic node. Maps 1:1 to a React Flow node. `type` selects the
 * registered RF node component ('folder' | 'file' | 'effect').
 */
export interface GraphNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

/** Framework-agnostic edge. Maps 1:1 to a React Flow edge. */
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  animated?: boolean;
  data?: Record<string, unknown>;
  style?: Record<string, unknown>;
}

export interface BuiltGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /**
   * View-level metadata (e.g. whether AI behavioral data was available so the
   * data-flow view can degrade gracefully instead of faking it).
   */
  meta: Record<string, unknown>;
}

/** A pure view strategy. */
export interface ViewStrategy {
  id: ViewId;
  build(scan: ScanResult, nav: NavState): BuiltGraph;
}
