/**
 * Main canvas component - React Flow wrapper
 * Dark theme with folder drill-down navigation
 */

import { useCallback, useMemo, useEffect, useRef } from 'react';
import ReactFlow, {
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type NodeTypes,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Spin, Empty } from 'antd';

import { FileNode } from './FileNode';
import { FolderNode } from './FolderNode';
import { COLORS } from '../utils/colors';
import {
  groupFilesByFolder,
  calculateFolderLayout,
  type FolderGroup,
} from '../utils/layout';
import { generateImportEdges } from '../utils/connections';
import {
  useScanStore,
  buildFolderWarningCounts,
  buildFileWarningCounts,
  getFilesWithWarningsInFolder,
} from '../stores/scan-store';
import type { ScanDetail, Warning } from '../../../api/surveyorClient';

export interface CanvasProps {
  scanData: ScanDetail | null;
  warnings: Warning[];
  onNodeClick?: (nodeId: string, nodeData: any) => void;
}

const nodeTypes: NodeTypes = {
  file: FileNode as any,
  folder: FolderNode as any,
};

// Style constants
const EDGE_NORMAL = { stroke: COLORS.connection.normal, strokeWidth: 1, opacity: 1 };
const EDGE_HIGHLIGHTED = { stroke: COLORS.connection.highlighted, strokeWidth: 2, opacity: 1 };
const EDGE_FADED = { stroke: COLORS.connection.normal, strokeWidth: 1, opacity: 0.2 };

// Layout constants for folder view
const FOLDER_LAYOUT = {
  nodeWidth: 200,
  nodeHeight: 70,
  horizontalGap: 80,
  verticalGap: 40,
  columns: 4,
};

interface FolderLayoutNode {
  id: string;
  type: 'folder';
  position: { x: number; y: number };
  data: {
    label: string;
    folderPath: string;
    fileCount: number;
    functionCount: number;
    warningCount: number;
    onWarningBadgeClick?: (folderPath: string) => void;
  };
}

/**
 * Calculate layout for folder nodes in a grid
 */
function calculateFolderGridLayout(
  groups: FolderGroup[],
  warnings: Warning[],
  nodes: Record<string, any>,
  onWarningBadgeClick?: (folderPath: string) => void
): FolderLayoutNode[] {
  const warningCounts = buildFolderWarningCounts(groups, warnings, nodes);

  return groups.map((group, index) => {
    const col = index % FOLDER_LAYOUT.columns;
    const row = Math.floor(index / FOLDER_LAYOUT.columns);

    const totalFunctions = group.files.reduce((sum, f) => sum + (f.functions?.length || 0), 0);

    return {
      id: `folder:${group.path}`,
      type: 'folder' as const,
      position: {
        x: col * (FOLDER_LAYOUT.nodeWidth + FOLDER_LAYOUT.horizontalGap) + 40,
        y: row * (FOLDER_LAYOUT.nodeHeight + FOLDER_LAYOUT.verticalGap) + 40,
      },
      data: {
        label: group.path.split('/').pop() || group.path,
        folderPath: group.path,
        fileCount: group.files.length,
        functionCount: totalFunctions,
        warningCount: warningCounts.get(group.path) || 0,
        onWarningBadgeClick,
      },
    };
  });
}

/**
 * Inner canvas component that uses React Flow hooks
 */
function CanvasInner({ scanData, warnings, onNodeClick }: CanvasProps) {
  const { fitView } = useReactFlow();
  const currentFolder = useScanStore((state) => state.currentFolder);
  const hoveredNodeId = useScanStore((state) => state.hoveredNodeId);
  const highlightedNodeIds = useScanStore((state) => state.highlightedNodeIds);
  const hoverNode = useScanStore((state) => state.hoverNode);
  const selectNode = useScanStore((state) => state.selectNode);
  const drillInto = useScanStore((state) => state.drillInto);
  const setHighlightedNodes = useScanStore((state) => state.setHighlightedNodes);
  const searchQuery = useScanStore((state) => state.searchQuery);

  const nodes_map = scanData?.nodes || {};

  // Handle warning badge click on folder nodes
  const handleWarningBadgeClick = useCallback((folderPath: string) => {
    if (!scanData?.nodes) return;
    // Get files with warnings in this folder
    const filesWithWarnings = getFilesWithWarningsInFolder(
      folderPath,
      warnings,
      scanData.nodes
    );
    // Drill into the folder and highlight files with warnings
    drillInto(folderPath);
    setHighlightedNodes(filesWithWarnings);
  }, [scanData?.nodes, warnings, drillInto, setHighlightedNodes]);

  // Track previous folder for fitView on change
  const prevFolderRef = useRef(currentFolder);

  const { displayNodes, displayEdges, edgeMap } = useMemo(() => {
    if (!scanData?.nodes || Object.keys(scanData.nodes).length === 0) {
      return {
        displayNodes: [] as Node[],
        displayEdges: [] as Edge[],
        edgeMap: new Map<string, Set<string>>(),
      };
    }

    const groups = groupFilesByFolder(scanData.nodes);

    // Root view: show folders
    if (currentFolder === null) {
      const folderNodes = calculateFolderGridLayout(
        groups,
        warnings,
        scanData.nodes,
        handleWarningBadgeClick
      );
      return {
        displayNodes: folderNodes as Node[],
        displayEdges: [] as Edge[],
        edgeMap: new Map<string, Set<string>>(),
      };
    }

    // Drilled-in view: show files in current folder
    const currentGroup = groups.find(g => g.path === currentFolder);
    if (!currentGroup) {
      return {
        displayNodes: [] as Node[],
        displayEdges: [] as Edge[],
        edgeMap: new Map<string, Set<string>>(),
      };
    }

    // Filter nodes to only include files in current folder
    const filteredNodes: Record<string, any> = {};
    currentGroup.files.forEach(file => {
      filteredNodes[file.id] = file;
    });

    // Build file warning counts
    const fileWarningCounts = buildFileWarningCounts(warnings);

    const layoutNodes = calculateFolderLayout(filteredNodes);
    const nodes: Node[] = layoutNodes.map(ln => ({
      id: ln.id,
      type: 'file',
      position: ln.position,
      data: {
        ...ln.data,
        warningCount: fileWarningCounts.get(ln.id) || 0,
      },
    }));

    // Generate edges only between files in current folder
    const edges: Edge[] = generateImportEdges(filteredNodes, {
      animated: false,
      strokeWidth: 1,
    });

    // Build connection map for hover highlighting
    const connectionMap = new Map<string, Set<string>>();
    edges.forEach(edge => {
      if (!connectionMap.has(edge.source)) {
        connectionMap.set(edge.source, new Set());
      }
      if (!connectionMap.has(edge.target)) {
        connectionMap.set(edge.target, new Set());
      }
      connectionMap.get(edge.source)!.add(edge.target);
      connectionMap.get(edge.target)!.add(edge.source);
    });

    return {
      displayNodes: nodes,
      displayEdges: edges,
      edgeMap: connectionMap,
    };
  }, [scanData?.nodes, currentFolder, warnings, handleWarningBadgeClick]);

  const [nodes, setNodes, onNodesChange] = useNodesState(displayNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(displayEdges);

  // Update nodes when displayNodes changes
  useEffect(() => {
    setNodes(displayNodes);
  }, [displayNodes, setNodes]);

  // Update edges when displayEdges changes
  useEffect(() => {
    setEdges(displayEdges);
  }, [displayEdges, setEdges]);

  // Track last focused highlights to avoid duplicate focus
  const lastFocusedHighlights = useRef<string>('');

  // Fit view when folder changes (without highlights)
  useEffect(() => {
    if (prevFolderRef.current !== currentFolder) {
      prevFolderRef.current = currentFolder;
      // Only do generic fitView if no highlights pending
      if (highlightedNodeIds.length === 0) {
        setTimeout(() => {
          fitView({ padding: 0.2, duration: 200 });
        }, 50);
      }
    }
  }, [currentFolder, fitView, highlightedNodeIds.length]);

  // Focus on highlighted nodes whenever they change
  useEffect(() => {
    if (highlightedNodeIds.length === 0) {
      lastFocusedHighlights.current = '';
      return;
    }

    // Create a key to track if we've already focused on this exact set
    const highlightKey = highlightedNodeIds.sort().join(',');
    if (highlightKey === lastFocusedHighlights.current) {
      return; // Already focused on these
    }

    // Wait for nodes to render after folder navigation
    setTimeout(() => {
      const nodesToFocus = displayNodes.filter(n => highlightedNodeIds.includes(n.id));
      if (nodesToFocus.length > 0) {
        lastFocusedHighlights.current = highlightKey;
        fitView({
          nodes: nodesToFocus,
          padding: 0.5,
          duration: 300,
          maxZoom: 1.2,
          minZoom: 1.0,
        });
      }
    }, 100);
  }, [highlightedNodeIds, displayNodes, fitView]);

  // Get connected node IDs for highlighting
  const connectedNodeIds = useMemo(() => {
    if (!hoveredNodeId) return new Set<string>();
    const connected = edgeMap.get(hoveredNodeId) || new Set();
    return new Set([hoveredNodeId, ...connected]);
  }, [hoveredNodeId, edgeMap]);

  // Apply hover highlighting to edges
  const styledEdges = useMemo(() => {
    if (!hoveredNodeId || currentFolder === null) {
      return edges.map(edge => ({
        ...edge,
        style: EDGE_NORMAL,
      }));
    }

    return edges.map(edge => {
      const isConnected = edge.source === hoveredNodeId || edge.target === hoveredNodeId;
      return {
        ...edge,
        style: isConnected ? EDGE_HIGHLIGHTED : EDGE_FADED,
        zIndex: isConnected ? 10 : 0,
      };
    });
  }, [edges, hoveredNodeId, currentFolder]);

  // Check if node matches search query
  const matchesSearch = useCallback((node: Node) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const label = (node.data.label as string || '').toLowerCase();
    const folderPath = (node.data.folderPath as string || '').toLowerCase();
    const filePath = (node.data.filePath as string || '').toLowerCase();
    return label.includes(query) || folderPath.includes(query) || filePath.includes(query);
  }, [searchQuery]);

  // Apply hover, search, and warning highlighting to nodes
  const styledNodes = useMemo(() => {
    const highlightSet = new Set(highlightedNodeIds);
    const hasWarningHighlight = highlightedNodeIds.length > 0;

    return nodes.map(node => {
      const isSearchMatch = matchesSearch(node);
      const hasSearchQuery = searchQuery.length > 0;
      const isWarningHighlighted = highlightSet.has(node.id);

      // Warning highlighting takes top precedence
      if (hasWarningHighlight) {
        return {
          ...node,
          data: {
            ...node.data,
            isFaded: !isWarningHighlighted,
            isHighlighted: isWarningHighlighted,
          },
        };
      }

      // Search takes precedence over hover
      if (hasSearchQuery) {
        return {
          ...node,
          data: {
            ...node.data,
            isFaded: !isSearchMatch,
            isHighlighted: isSearchMatch,
          },
        };
      }

      // No search - use hover highlighting
      if (!hoveredNodeId) {
        return {
          ...node,
          data: { ...node.data, isFaded: false, isHighlighted: false },
        };
      }

      const isConnected = connectedNodeIds.has(node.id);
      return {
        ...node,
        data: {
          ...node.data,
          isFaded: !isConnected,
          isHighlighted: node.id === hoveredNodeId,
        },
      };
    });
  }, [nodes, hoveredNodeId, connectedNodeIds, searchQuery, matchesSearch, highlightedNodeIds]);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    // If it's a folder node, drill into it
    if (node.type === 'folder') {
      const folderPath = (node.data as { folderPath: string }).folderPath;
      drillInto(folderPath);
    } else {
      // File node - select it
      selectNode(node.id);
      if (onNodeClick) {
        onNodeClick(node.id, node.data);
      }
    }
  }, [selectNode, drillInto, onNodeClick]);

  const onNodeMouseEnter: NodeMouseHandler = useCallback((_event, node) => {
    hoverNode(node.id);
  }, [hoverNode]);

  const onNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    hoverNode(null);
  }, [hoverNode]);

  if (!scanData) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: COLORS.surface[1],
        color: COLORS.text.secondary,
      }}>
        <Empty description="No scan data loaded" />
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={styledNodes}
      edges={styledEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      onNodeMouseEnter={onNodeMouseEnter}
      onNodeMouseLeave={onNodeMouseLeave}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      maxZoom={2}
      defaultEdgeOptions={{
        style: { stroke: COLORS.connection.normal, strokeWidth: 1 },
        type: 'smoothstep',
      }}
      style={{ background: COLORS.surface[0] }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color={COLORS.surface[3]}
      />
      <Controls
        showInteractive={false}
        style={{
          background: COLORS.surface[2],
          border: `1px solid ${COLORS.surface[3]}`,
          borderRadius: 8,
        }}
      />
    </ReactFlow>
  );
}

/**
 * Main visualization canvas using React Flow
 * Displays folder clusters or file nodes with import connections
 */
export function Canvas({ scanData, warnings, onNodeClick }: CanvasProps) {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlowProvider>
        <CanvasInner scanData={scanData} warnings={warnings} onNodeClick={onNodeClick} />
      </ReactFlowProvider>
    </div>
  );
}

export default Canvas;
