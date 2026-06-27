/**
 * Layout configuration for the view/layout engines (configs-not-hardcoded).
 *
 * Every magic number the layout engines use lives here, named and grouped by
 * the layout they drive. Views pick a layout and pass the matching config.
 */

/** Default rendered size of a node, used to seed the layout engines. */
export const NODE_SIZE = {
  /** File / module node footprint (file-structure + dependency views). */
  file: { width: 200, height: 72 },
  /** Folder cluster node footprint (file-structure root view). */
  folder: { width: 200, height: 80 },
  /** Function/effect node footprint (data-flow view). */
  effect: { width: 200, height: 76 },
} as const;

/** Dagre layered-DAG layout knobs (dependency view + drilled-in file view). */
export const DAGRE_LAYOUT = {
  /** 'LR' = left→right layered ranks (good for "who imports whom"). */
  rankdir: 'LR' as 'LR' | 'TB' | 'RL' | 'BT',
  /** Separation between adjacent ranks (px). */
  ranksep: 120,
  /** Separation between nodes in the same rank (px). */
  nodesep: 40,
  /** Separation between disconnected components (px). */
  marginx: 24,
  marginy: 24,
} as const;

/** Grid layout knobs (file-structure root / folder overview). */
export const GRID_LAYOUT = {
  columns: 4,
  hGap: 80,
  vGap: 40,
  originX: 40,
  originY: 40,
} as const;

/** Lane (column-per-group) layout knobs (data-flow effect map). */
export const LANE_LAYOUT = {
  /** Horizontal distance between lane centers (px). */
  laneGap: 280,
  /** Vertical distance between stacked nodes in a lane (px). */
  rowGap: 28,
  originX: 60,
  originY: 80,
} as const;
