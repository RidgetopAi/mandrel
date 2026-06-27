/**
 * View + visual configuration (configs-not-hardcoded).
 *
 * Single source for: the registered views (id/label/description), edge styling
 * colors, and the data-flow effect-group palette/labels. Components and view
 * strategies read from here instead of inlining hex/strings.
 */

import { COLORS } from './colors';

export type ViewId = 'file-structure' | 'dependency' | 'data-flow';

export interface ViewDefinition {
  id: ViewId;
  label: string;
  description: string;
}

/**
 * The views available in the ViewToggle, in display order. The `id` values are
 * passed straight to `buildGraph`.
 */
export const VIEWS: ViewDefinition[] = [
  {
    id: 'file-structure',
    label: 'Files',
    description: 'Folder → file drilldown of the project structure.',
  },
  {
    id: 'dependency',
    label: 'Dependencies',
    description: 'Module import DAG — who imports whom, with cycles highlighted.',
  },
  {
    id: 'data-flow',
    label: 'Data Flow',
    description: 'Where the logic lives: functions grouped by side-effect (DB / HTTP / file).',
  },
];

/**
 * Synthetic folder/group nodes in the file-structure view are id'd
 * `folder:<path>`. Centralized here so the view that mints them, the Canvas that
 * routes clicks, and the detail panel that resolves a selected folder all agree.
 */
export const FOLDER_NODE_PREFIX = 'folder:';
export const folderNodeId = (path: string): string => `${FOLDER_NODE_PREFIX}${path}`;
export const isFolderNodeId = (id: string): boolean => id.startsWith(FOLDER_NODE_PREFIX);
export const folderPathFromNodeId = (id: string): string =>
  id.slice(FOLDER_NODE_PREFIX.length);

/** Edge stroke colors (shared by all views; applied generically by Canvas). */
export const EDGE_COLORS = {
  normal: COLORS.connection.normal,
  highlighted: COLORS.connection.highlighted,
  circular: COLORS.connection.circular,
} as const;

/** Edge style presets the renderer swaps between on hover. */
export const EDGE_STYLE = {
  normal: { stroke: EDGE_COLORS.normal, strokeWidth: 1, opacity: 1 },
  highlighted: { stroke: EDGE_COLORS.highlighted, strokeWidth: 2, opacity: 1 },
  faded: { stroke: EDGE_COLORS.normal, strokeWidth: 1, opacity: 0.2 },
  circular: { stroke: EDGE_COLORS.circular, strokeWidth: 2, opacity: 1 },
} as const;

/**
 * Behavioral effect groups for the data-flow view. Order = lane order, and
 * is also the classification priority (a function with multiple flags lands in
 * the highest-priority group present).
 */
export type EffectGroup =
  | 'database'
  | 'network'
  | 'filesystem'
  | 'notification'
  | 'state'
  | 'pure'
  | 'unknown';

export interface EffectGroupStyle {
  group: EffectGroup;
  label: string;
  /** Node accent color for this effect group. */
  color: string;
}

/** Priority/lane order of effect groups (index = priority, lower wins). */
export const EFFECT_GROUP_ORDER: EffectGroup[] = [
  'database',
  'network',
  'filesystem',
  'notification',
  'state',
  'pure',
  'unknown',
];

export const EFFECT_GROUP_STYLES: Record<EffectGroup, EffectGroupStyle> = {
  database: { group: 'database', label: 'Database', color: '#f472b6' },
  network: { group: 'network', label: 'Network / HTTP', color: '#60a5fa' },
  filesystem: { group: 'filesystem', label: 'File System', color: '#fbbf24' },
  notification: { group: 'notification', label: 'Notifications', color: '#a78bfa' },
  state: { group: 'state', label: 'Global State', color: '#fb923c' },
  pure: { group: 'pure', label: 'Pure', color: COLORS.status.healthy },
  unknown: { group: 'unknown', label: 'Unclassified', color: COLORS.text.muted },
};
