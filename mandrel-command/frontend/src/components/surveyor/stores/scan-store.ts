/**
 * Scan UI state store - Zustand v5
 * For managing UI state like folder navigation, hover, selection
 * (Data fetching is handled by React Query in useSurveyorData.ts)
 */

import { create } from 'zustand';
import type { Warning } from '../../../api/surveyorClient';

export interface ScanUIState {
  /** Currently selected node ID */
  selectedNodeId: string | null;
  /** Currently hovered node ID */
  hoveredNodeId: string | null;
  /** Nodes highlighted by warning selection */
  highlightedNodeIds: string[];
  /** Current folder path (null = root view showing all folders) */
  currentFolder: string | null;
  /** Breadcrumb navigation path */
  navigationPath: string[];
  /** Search filter for nodes */
  searchQuery: string;
}

export interface ScanUIActions {
  selectNode: (nodeId: string | null) => void;
  hoverNode: (nodeId: string | null) => void;
  setHighlightedNodes: (nodeIds: string[]) => void;
  drillInto: (folder: string) => void;
  drillOut: () => void;
  drillToPath: (pathIndex: number) => void;
  setSearchQuery: (query: string) => void;
  reset: () => void;
}

export type ScanUIStore = ScanUIState & ScanUIActions;

const initialState: ScanUIState = {
  selectedNodeId: null,
  hoveredNodeId: null,
  highlightedNodeIds: [],
  currentFolder: null,
  navigationPath: [],
  searchQuery: '',
};

export const useScanStore = create<ScanUIStore>((set, get) => ({
  // State
  ...initialState,

  // Actions
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  hoverNode: (nodeId) => set({ hoveredNodeId: nodeId }),

  setHighlightedNodes: (nodeIds) => set({ highlightedNodeIds: nodeIds }),

  drillInto: (folder) => {
    const { navigationPath } = get();
    set({
      currentFolder: folder,
      navigationPath: [...navigationPath, folder],
      selectedNodeId: null, // Clear selection when drilling
      highlightedNodeIds: [], // Clear highlights when navigating
    });
  },

  drillOut: () => {
    const { navigationPath } = get();
    const newPath = navigationPath.slice(0, -1);
    set({
      currentFolder: newPath.length > 0 ? newPath[newPath.length - 1] : null,
      navigationPath: newPath,
      highlightedNodeIds: [], // Clear highlights when navigating
    });
  },

  drillToPath: (pathIndex) => {
    const { navigationPath } = get();
    if (pathIndex < 0) {
      set({ currentFolder: null, navigationPath: [], highlightedNodeIds: [] });
    } else {
      const newPath = navigationPath.slice(0, pathIndex + 1);
      set({
        currentFolder: newPath[newPath.length - 1],
        navigationPath: newPath,
        highlightedNodeIds: [],
      });
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  reset: () => set(initialState),
}));

/**
 * Helper to get files with warnings in a specific folder
 */
export function getFilesWithWarningsInFolder(
  folderPath: string,
  warnings: Warning[],
  nodes: Record<string, any>
): string[] {
  const fileIds = new Set<string>();

  for (const warning of warnings) {
    for (const nodeId of warning.affectedNodes) {
      const node = nodes[nodeId];
      if (node) {
        // Extract folder path from file path
        const parts = node.filePath.split('/');
        const nodeFolderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
        if (nodeFolderPath === folderPath) {
          fileIds.add(nodeId);
        }
      }
    }
  }

  return Array.from(fileIds);
}

/**
 * Build a map of file ID -> warning count
 */
export function buildFileWarningCounts(
  warnings: Warning[]
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const warning of warnings) {
    for (const nodeId of warning.affectedNodes) {
      counts.set(nodeId, (counts.get(nodeId) || 0) + 1);
    }
  }

  return counts;
}

/**
 * Build a map of folder path -> warning count
 */
export function buildFolderWarningCounts(
  groups: Array<{ path: string; files: any[] }>,
  warnings: Warning[],
  nodes: Record<string, any>
): Map<string, number> {
  const counts = new Map<string, number>();

  // Initialize all folders with 0
  for (const group of groups) {
    counts.set(group.path, 0);
  }

  // Count warnings per folder based on affected nodes
  for (const warning of warnings) {
    const foldersAffected = new Set<string>();

    for (const nodeId of warning.affectedNodes) {
      const node = nodes[nodeId];
      if (node) {
        // Extract folder path from file path
        const parts = node.filePath.split('/');
        const folderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
        foldersAffected.add(folderPath);
      }
    }

    // Increment count for each affected folder (once per warning)
    for (const folder of foldersAffected) {
      counts.set(folder, (counts.get(folder) || 0) + 1);
    }
  }

  return counts;
}
