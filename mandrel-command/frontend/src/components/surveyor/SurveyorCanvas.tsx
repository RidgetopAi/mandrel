/**
 * Surveyor Canvas
 * React Flow visualization for codebase structure
 * Part of MandrelV2 Surveyor Integration - Phase 3
 */

import React, { useMemo, useCallback, useState } from 'react';
import { Card, Spin, Empty, Typography, Space, Tag, Tooltip } from 'antd';
import ReactFlow, {
  Controls,
  Background,
  MiniMap,
  type Node,
  type Edge,
  Position,
  useNodesState,
  useEdgesState,
  type OnNodesChange,
  type OnEdgesChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useScan } from '../../hooks/useSurveyorData';

const { Text, Title } = Typography;

// Node type colors
const NODE_COLORS = {
  file: '#1890ff',
  function: '#52c41a',
  class: '#722ed1',
  cluster: '#fa8c16',
};

// Layout configuration
const LAYOUT_CONFIG = {
  fileSpacing: 300,
  functionSpacing: 150,
  classSpacing: 200,
  verticalGap: 100,
};

interface SurveyorCanvasProps {
  scanId: string | undefined;
  onNodeClick?: (nodeId: string, nodeData: any) => void;
}

/**
 * Transform scan nodes to React Flow format
 */
function transformToFlowNodes(nodes: Record<string, any>): { nodes: Node[]; edges: Edge[] } {
  if (!nodes || Object.keys(nodes).length === 0) {
    return { nodes: [], edges: [] };
  }

  const flowNodes: Node[] = [];
  const flowEdges: Edge[] = [];
  const filePositions: Record<string, { x: number; y: number }> = {};

  // First pass: position file nodes
  const fileNodes = Object.values(nodes).filter((n: any) => n.type === 'file');
  let fileIndex = 0;
  const filesPerRow = 4;

  fileNodes.forEach((node: any) => {
    const row = Math.floor(fileIndex / filesPerRow);
    const col = fileIndex % filesPerRow;
    const x = col * LAYOUT_CONFIG.fileSpacing;
    const y = row * (LAYOUT_CONFIG.verticalGap * 4);

    filePositions[node.id] = { x, y };

    flowNodes.push({
      id: node.id,
      type: 'default',
      position: { x, y },
      data: {
        label: (
          <Space direction="vertical" size={0} style={{ width: '100%' }}>
            <Text strong style={{ color: '#fff', fontSize: '12px' }}>
              {node.name}
            </Text>
            <Text style={{ color: '#fff', opacity: 0.8, fontSize: '10px' }}>
              {node.functions?.length || 0} functions, {node.classes?.length || 0} classes
            </Text>
          </Space>
        ),
        nodeType: 'file',
        raw: node,
      },
      style: {
        background: NODE_COLORS.file,
        color: '#fff',
        borderRadius: 8,
        padding: '8px 12px',
        minWidth: 180,
        border: '2px solid #40a9ff',
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });

    fileIndex++;
  });

  // Second pass: position function nodes (limited to avoid overwhelming)
  const functionNodes = Object.values(nodes).filter((n: any) => n.type === 'function');
  const maxFunctionsShown = 50; // Limit for performance

  functionNodes.slice(0, maxFunctionsShown).forEach((node: any, index) => {
    const parentFile = filePositions[node.parentFileId];
    if (!parentFile) return;

    const x = parentFile.x + LAYOUT_CONFIG.functionSpacing;
    const y = parentFile.y + (index % 5) * 40;

    flowNodes.push({
      id: node.id,
      type: 'default',
      position: { x, y },
      data: {
        label: (
          <Tooltip title={node.behavioral?.summary || 'No summary'}>
            <Text style={{ color: '#fff', fontSize: '11px' }}>
              {node.name}
            </Text>
          </Tooltip>
        ),
        nodeType: 'function',
        raw: node,
      },
      style: {
        background: NODE_COLORS.function,
        color: '#fff',
        borderRadius: 4,
        padding: '4px 8px',
        fontSize: '11px',
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });

    // Edge from file to function
    flowEdges.push({
      id: `${node.parentFileId}-${node.id}`,
      source: node.parentFileId,
      target: node.id,
      style: { stroke: '#52c41a', strokeWidth: 1 },
    });
  });

  // Third pass: position class nodes
  const classNodes = Object.values(nodes).filter((n: any) => n.type === 'class');

  classNodes.forEach((node: any, index) => {
    const parentFile = filePositions[node.parentFileId];
    if (!parentFile) return;

    const x = parentFile.x - LAYOUT_CONFIG.classSpacing;
    const y = parentFile.y + index * 50;

    flowNodes.push({
      id: node.id,
      type: 'default',
      position: { x, y },
      data: {
        label: (
          <Space direction="vertical" size={0}>
            <Text strong style={{ color: '#fff', fontSize: '11px' }}>
              {node.name}
            </Text>
            <Text style={{ color: '#fff', opacity: 0.8, fontSize: '10px' }}>
              {node.methods?.length || 0} methods
            </Text>
          </Space>
        ),
        nodeType: 'class',
        raw: node,
      },
      style: {
        background: NODE_COLORS.class,
        color: '#fff',
        borderRadius: 8,
        padding: '6px 10px',
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });

    // Edge from file to class
    flowEdges.push({
      id: `${node.parentFileId}-${node.id}`,
      source: node.parentFileId,
      target: node.id,
      style: { stroke: '#722ed1', strokeWidth: 1 },
    });
  });

  return { nodes: flowNodes, edges: flowEdges };
}

/**
 * Surveyor Canvas Component
 */
export const SurveyorCanvas: React.FC<SurveyorCanvasProps> = ({ scanId, onNodeClick }) => {
  const { data: scan, isLoading, error } = useScan(scanId, true);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const { nodes: flowNodes, edges: flowEdges } = useMemo(() => {
    if (!scan?.nodes) return { nodes: [], edges: [] };
    return transformToFlowNodes(scan.nodes);
  }, [scan?.nodes]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  // Update nodes when scan changes
  React.useEffect(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowNodes, flowEdges, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id);
      if (onNodeClick) {
        onNodeClick(node.id, node.data.raw);
      }
    },
    [onNodeClick]
  );

  if (isLoading) {
    return (
      <Card style={{ height: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" tip="Loading codebase visualization..." />
      </Card>
    );
  }

  if (error) {
    return (
      <Card style={{ height: 500 }}>
        <Empty description={`Error loading scan: ${(error as Error).message}`} />
      </Card>
    );
  }

  if (!scan || !scan.nodes || Object.keys(scan.nodes).length === 0) {
    return (
      <Card style={{ height: 500 }}>
        <Empty description="No nodes to display. Run a scan to visualize your codebase." />
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <Title level={5} style={{ margin: 0 }}>Codebase Structure</Title>
          <Tag color="blue">{scan.stats.totalFiles} files</Tag>
          <Tag color="green">{scan.stats.totalFunctions} functions</Tag>
          <Tag color="purple">{scan.stats.totalClasses} classes</Tag>
        </Space>
      }
      style={{ height: 600 }}
      bodyStyle={{ height: 'calc(100% - 57px)', padding: 0 }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        fitView
        attributionPosition="bottom-right"
        minZoom={0.1}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 0.5 }}
      >
        <Controls />
        <Background color="#f0f0f0" gap={16} />
        <MiniMap
          nodeColor={(node) => NODE_COLORS[node.data?.nodeType as keyof typeof NODE_COLORS] || '#999'}
          maskColor="rgba(0, 0, 0, 0.1)"
        />
      </ReactFlow>
    </Card>
  );
};

export default SurveyorCanvas;
