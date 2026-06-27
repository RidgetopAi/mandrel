/**
 * Surveyor scan-interaction store (Zustand).
 *
 * Holds the active `ScanResult` (built from the backend READ payloads by the
 * page) plus the canvas interaction state the Canvas / panels share: selection,
 * hover, folder drilldown, search, and warning-highlight. Selectors resolve
 * nodes/connections/warnings off the current scan.
 *
 * Trimmed vs the standalone surveyor app: the streaming scan-progress machinery
 * is gone — the command-UI's scan is a synchronous REST call whose loading state
 * the page owns (React Query). `setScan` is how the page pushes fetched data in.
 */

import { create } from 'zustand';
import type { ScanResult, Node, Connection, Warning } from '../core-types';

export interface ScanState {
  currentScan: ScanResult | null;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  /** Nodes highlighted by a warning/finding selection. */
  highlightedNodeIds: string[];
  /** null = root view (all folders); string = drilled into that folder. */
  currentFolder: string | null;
  /** Breadcrumb path of drilled folders. */
  navigationPath: string[];
  /** Search filter for nodes. */
  searchQuery: string;
}

export interface ScanActions {
  setScan: (scan: ScanResult | null) => void;
  selectNode: (nodeId: string | null) => void;
  hoverNode: (nodeId: string | null) => void;
  setHighlightedNodes: (nodeIds: string[]) => void;
  drillInto: (folder: string) => void;
  /** Drill into a folder and highlight the files in it that carry warnings. */
  highlightFolderWarnings: (folder: string) => void;
  drillOut: () => void;
  drillToPath: (pathIndex: number) => void;
  setSearchQuery: (query: string) => void;
  getNodeById: (id: string) => Node | undefined;
  getConnectionsForNode: (nodeId: string) => Connection[];
  getWarningsForNode: (nodeId: string) => Warning[];
}

export type ScanStore = ScanState & ScanActions;

export const useScanStore = create<ScanStore>((set, get) => ({
  currentScan: null,
  selectedNodeId: null,
  hoveredNodeId: null,
  highlightedNodeIds: [],
  currentFolder: null,
  navigationPath: [],
  searchQuery: '',

  setScan: (scan) =>
    set({
      currentScan: scan,
      selectedNodeId: null,
      currentFolder: null,
      navigationPath: [],
      searchQuery: '',
      highlightedNodeIds: [],
    }),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  hoverNode: (nodeId) => set({ hoveredNodeId: nodeId }),
  setHighlightedNodes: (nodeIds) => set({ highlightedNodeIds: nodeIds }),
  drillInto: (folder) => {
    const { navigationPath } = get();
    set({
      currentFolder: folder,
      navigationPath: [...navigationPath, folder],
      selectedNodeId: null,
    });
  },
  highlightFolderWarnings: (folder) => {
    const { currentScan, navigationPath } = get();
    const fileIds = new Set<string>();
    if (currentScan) {
      for (const warning of currentScan.warnings) {
        for (const nodeId of warning.affectedNodes) {
          const node = currentScan.nodes[nodeId];
          if (!node) continue;
          const parts = node.filePath.split('/');
          const nodeFolder = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
          if (nodeFolder === folder) fileIds.add(nodeId);
        }
      }
    }
    set({
      currentFolder: folder,
      navigationPath: [...navigationPath, folder],
      selectedNodeId: null,
      highlightedNodeIds: Array.from(fileIds),
    });
  },
  drillOut: () => {
    const { navigationPath } = get();
    const newPath = navigationPath.slice(0, -1);
    set({
      currentFolder: newPath.length > 0 ? newPath[newPath.length - 1] : null,
      navigationPath: newPath,
    });
  },
  drillToPath: (pathIndex) => {
    const { navigationPath } = get();
    if (pathIndex < 0) {
      set({ currentFolder: null, navigationPath: [] });
    } else {
      const newPath = navigationPath.slice(0, pathIndex + 1);
      set({
        currentFolder: newPath[newPath.length - 1],
        navigationPath: newPath,
      });
    }
  },
  setSearchQuery: (query) => set({ searchQuery: query }),

  getNodeById: (id) => get().currentScan?.nodes[id],
  getConnectionsForNode: (nodeId) => {
    const { currentScan } = get();
    if (!currentScan) return [];
    return currentScan.connections.filter(
      (c) => c.sourceId === nodeId || c.targetId === nodeId,
    );
  },
  getWarningsForNode: (nodeId) => {
    const { currentScan } = get();
    if (!currentScan) return [];
    return currentScan.warnings.filter((w) => w.affectedNodes.includes(nodeId));
  },
}));
