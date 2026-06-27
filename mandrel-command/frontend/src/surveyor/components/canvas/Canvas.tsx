/**
 * Main canvas component — a DUMB renderer of the active ViewStrategy's output.
 *
 * Canvas knows nothing about folders / dependencies / effects. It:
 *   1. asks `buildGraph(activeView, scan, nav)` for {nodes, edges}
 *   2. registers the RF node components
 *   3. applies GENERIC, cross-view interaction styling (hover / search /
 *      warning-highlight) and wires generic click/hover handlers
 *
 * All view-specific graph construction + layout lives behind the seam
 * (src/surveyor/views). Adding a view never touches this file. Ported from the
 * surveyor UI (Tailwind class chrome → inline styles; uses the trimmed stores).
 */

import { useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { ScanResult } from '../../core-types';
import { FileNode } from './FileNode';
import { FolderNode } from './FolderNode';
import { EffectNode } from './EffectNode';
import { buildGraph } from '../../views';
import { useScanStore } from '../../stores/scan-store';
import { useUIStore, viewModeToId } from '../../stores/ui-store';
import { EDGE_STYLE } from '../../config/view.config';
import { COLORS } from '../../config/colors';

export interface CanvasProps {
  scanData: ScanResult | null;
}

const nodeTypes: NodeTypes = {
  file: FileNode,
  folder: FolderNode,
  effect: EffectNode,
};

function CanvasInner({ scanData }: CanvasProps) {
  const { fitView } = useReactFlow();
  const currentFolder = useScanStore((state) => state.currentFolder);
  const hoveredNodeId = useScanStore((state) => state.hoveredNodeId);
  const highlightedNodeIds = useScanStore((state) => state.highlightedNodeIds);
  const hoverNode = useScanStore((state) => state.hoverNode);
  const selectNode = useScanStore((state) => state.selectNode);
  const drillInto = useScanStore((state) => state.drillInto);
  const searchQuery = useScanStore((state) => state.searchQuery);
  const viewMode = useUIStore((state) => state.viewMode);

  // Build the graph for the active view — the ONLY view-aware call in Canvas.
  const built = useMemo(
    () => buildGraph(viewModeToId(viewMode), scanData, { currentFolder }),
    [viewMode, scanData, currentFolder],
  );

  // Map the pure graph to React Flow nodes/edges and build an undirected
  // adjacency map for hover highlighting (generic, view-agnostic).
  const { displayNodes, displayEdges, edgeMap } = useMemo(() => {
    const nodes = built.nodes as unknown as Node[];
    const edges = built.edges as unknown as Edge[];
    const connectionMap = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (!connectionMap.has(edge.source)) connectionMap.set(edge.source, new Set());
      if (!connectionMap.has(edge.target)) connectionMap.set(edge.target, new Set());
      connectionMap.get(edge.source)!.add(edge.target);
      connectionMap.get(edge.target)!.add(edge.source);
    }
    return { displayNodes: nodes, displayEdges: edges, edgeMap: connectionMap };
  }, [built]);

  const [nodes, setNodes, onNodesChange] = useNodesState(displayNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(displayEdges);

  useEffect(() => {
    setNodes(displayNodes);
  }, [displayNodes, setNodes]);

  useEffect(() => {
    setEdges(displayEdges);
  }, [displayEdges, setEdges]);

  // Fit the view whenever the graph identity changes (folder/view switch).
  const prevKeyRef = useRef<string>('');
  const lastFocusedHighlights = useRef<string>('');
  useEffect(() => {
    const key = `${viewMode}|${currentFolder ?? ''}`;
    if (prevKeyRef.current !== key) {
      prevKeyRef.current = key;
      if (highlightedNodeIds.length === 0) {
        setTimeout(() => fitView({ padding: 0.2, duration: 200 }), 50);
      }
    }
  }, [viewMode, currentFolder, fitView, highlightedNodeIds.length]);

  // Focus on highlighted nodes whenever they change.
  useEffect(() => {
    if (highlightedNodeIds.length === 0) {
      lastFocusedHighlights.current = '';
      return;
    }
    const highlightKey = [...highlightedNodeIds].sort().join(',');
    if (highlightKey === lastFocusedHighlights.current) return;
    setTimeout(() => {
      const nodesToFocus = displayNodes.filter((n) => highlightedNodeIds.includes(n.id));
      if (nodesToFocus.length > 0) {
        lastFocusedHighlights.current = highlightKey;
        fitView({ nodes: nodesToFocus, padding: 0.5, duration: 300, maxZoom: 1.2, minZoom: 1.0 });
      }
    }, 100);
  }, [highlightedNodeIds, displayNodes, fitView]);

  // Connected node ids for hover highlighting.
  const connectedNodeIds = useMemo(() => {
    if (!hoveredNodeId) return new Set<string>();
    const connected = edgeMap.get(hoveredNodeId) || new Set();
    return new Set([hoveredNodeId, ...connected]);
  }, [hoveredNodeId, edgeMap]);

  // Apply hover highlighting to edges (generic). Circular edges keep their style.
  const styledEdges = useMemo(() => {
    if (!hoveredNodeId) {
      return edges.map((edge) => ({
        ...edge,
        style: edge.data?.circular ? EDGE_STYLE.circular : EDGE_STYLE.normal,
      }));
    }
    return edges.map((edge) => {
      const isConnected = edge.source === hoveredNodeId || edge.target === hoveredNodeId;
      const base = edge.data?.circular ? EDGE_STYLE.circular : EDGE_STYLE.normal;
      return {
        ...edge,
        style: isConnected ? EDGE_STYLE.highlighted : { ...base, opacity: EDGE_STYLE.faded.opacity },
        zIndex: isConnected ? 10 : 0,
      };
    });
  }, [edges, hoveredNodeId]);

  // Search matcher (generic over the data fields views populate).
  const matchesSearch = useCallback(
    (node: Node) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      const label = ((node.data.label as string) || '').toLowerCase();
      const folderPath = ((node.data.folderPath as string) || '').toLowerCase();
      const filePath = ((node.data.filePath as string) || '').toLowerCase();
      return label.includes(query) || folderPath.includes(query) || filePath.includes(query);
    },
    [searchQuery],
  );

  // Apply hover / search / warning highlighting to nodes (generic).
  const styledNodes = useMemo(() => {
    const highlightSet = new Set(highlightedNodeIds);
    const hasWarningHighlight = highlightedNodeIds.length > 0;

    return nodes.map((node) => {
      if (hasWarningHighlight) {
        const isWarningHighlighted = highlightSet.has(node.id);
        return {
          ...node,
          data: { ...node.data, isFaded: !isWarningHighlighted, isHighlighted: isWarningHighlighted },
        };
      }
      if (searchQuery.length > 0) {
        const isSearchMatch = matchesSearch(node);
        return {
          ...node,
          data: { ...node.data, isFaded: !isSearchMatch, isHighlighted: isSearchMatch },
        };
      }
      if (!hoveredNodeId) {
        return { ...node, data: { ...node.data, isFaded: false, isHighlighted: false } };
      }
      const isConnected = connectedNodeIds.has(node.id);
      return {
        ...node,
        data: { ...node.data, isFaded: !isConnected, isHighlighted: node.id === hoveredNodeId },
      };
    });
  }, [nodes, hoveredNodeId, connectedNodeIds, searchQuery, matchesSearch, highlightedNodeIds]);

  // Single click selects ANY node (file or folder) → opens its detail/summary card.
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      selectNode(node.id);
    },
    [selectNode],
  );

  // Double click on a folder drills into it.
  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === 'folder') {
        const folderPath = (node.data as { folderPath: string }).folderPath;
        drillInto(folderPath);
      }
    },
    [drillInto],
  );

  const onNodeMouseEnter: NodeMouseHandler = useCallback(
    (_event, node) => hoverNode(node.id),
    [hoverNode],
  );
  const onNodeMouseLeave: NodeMouseHandler = useCallback(() => hoverNode(null), [hoverNode]);

  if (!scanData) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: COLORS.surface[1],
          color: COLORS.text.secondary,
        }}
      >
        No scan data loaded
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={styledNodes}
      edges={styledEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      onNodeDoubleClick={onNodeDoubleClick}
      onNodeMouseEnter={onNodeMouseEnter}
      onNodeMouseLeave={onNodeMouseLeave}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      maxZoom={2}
      defaultEdgeOptions={{ style: EDGE_STYLE.normal, type: 'smoothstep' }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={COLORS.surface[3]} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

/**
 * Main visualization canvas using React Flow.
 * Renders whatever the active ViewStrategy produces.
 */
export function Canvas({ scanData }: CanvasProps) {
  return (
    <div style={{ width: '100%', height: '100%', background: COLORS.surface[0] }}>
      <ReactFlowProvider>
        <CanvasInner scanData={scanData} />
      </ReactFlowProvider>
    </div>
  );
}
