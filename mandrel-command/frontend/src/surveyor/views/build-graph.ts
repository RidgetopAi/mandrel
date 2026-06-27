/**
 * The ViewStrategy seam entry point.
 *
 * `buildGraph(viewId, scan, nav)` is the single, pure function the Canvas calls.
 * It dispatches to the active view strategy and returns a framework-agnostic
 * {nodes, edges, meta}. All view-specific logic lives behind this seam; the
 * Canvas never branches on view.
 */

import type { ScanResult } from '../core-types';
import type { ViewId } from '../config/view.config';
import type { BuiltGraph, NavState } from './types';
import { buildFileStructureView } from './file-structure-view';
import { buildDependencyView } from './dependency-view';
import { buildDataFlowView } from './data-flow-view';

const EMPTY: BuiltGraph = { nodes: [], edges: [], meta: {} };

export function buildGraph(
  viewId: ViewId,
  scan: ScanResult | null,
  nav: NavState
): BuiltGraph {
  if (!scan) return EMPTY;
  switch (viewId) {
    case 'file-structure':
      return buildFileStructureView(scan, nav);
    case 'dependency':
      return buildDependencyView(scan);
    case 'data-flow':
      return buildDataFlowView(scan);
    default: {
      // Exhaustiveness guard — a new ViewId must be handled here.
      const _never: never = viewId;
      return _never;
    }
  }
}
