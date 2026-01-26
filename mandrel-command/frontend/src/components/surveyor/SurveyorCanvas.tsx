/**
 * Surveyor Canvas
 * React Flow visualization for codebase structure
 * Now using the ported dark theme Canvas component
 */

import React, { useEffect, useCallback } from 'react';
import { Card, Spin, Empty, Space, Tag, Input } from 'antd';
import { Search } from 'lucide-react';
import { useScan, useWarnings } from '../../hooks/useSurveyorData';
import { Canvas, Breadcrumb } from './canvas';
import { useScanStore } from './stores/scan-store';
import { COLORS } from './utils/colors';

const { Search: AntSearch } = Input;

interface SurveyorCanvasProps {
  scanId: string | undefined;
  onNodeClick?: (nodeId: string, nodeData: any, scanNodes: Record<string, any>) => void;
}

/**
 * Surveyor Canvas Component
 * Wraps the Canvas with loading states and controls
 */
export const SurveyorCanvas: React.FC<SurveyorCanvasProps> = ({ scanId, onNodeClick }) => {
  const { data: scan, isLoading, error } = useScan(scanId, true);
  const { data: warningsData } = useWarnings(scanId);
  const setSearchQuery = useScanStore((state) => state.setSearchQuery);
  const reset = useScanStore((state) => state.reset);

  // Reset store when scanId changes
  useEffect(() => {
    reset();
  }, [scanId, reset]);

  const warnings = warningsData?.warnings || [];

  // Wrap onNodeClick to include scan nodes for drawer lookup
  // Must be defined before early returns to satisfy React hooks rules
  const handleNodeClick = useCallback((nodeId: string, nodeData: any) => {
    if (onNodeClick && scan?.nodes) {
      onNodeClick(nodeId, nodeData, scan.nodes);
    }
  }, [onNodeClick, scan?.nodes]);

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
  }, [setSearchQuery]);

  if (isLoading) {
    return (
      <Card
        style={{
          height: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: COLORS.surface[1],
          border: `1px solid ${COLORS.surface[3]}`,
        }}
      >
        <Spin size="large" tip="Loading codebase visualization..." />
      </Card>
    );
  }

  if (error) {
    return (
      <Card
        style={{
          height: 600,
          background: COLORS.surface[1],
          border: `1px solid ${COLORS.surface[3]}`,
        }}
      >
        <Empty description={`Error loading scan: ${(error as Error).message}`} />
      </Card>
    );
  }

  if (!scan || !scan.nodes || Object.keys(scan.nodes).length === 0) {
    return (
      <Card
        style={{
          height: 600,
          background: COLORS.surface[1],
          border: `1px solid ${COLORS.surface[3]}`,
        }}
      >
        <Empty description="No nodes to display. Run a scan to visualize your codebase." />
      </Card>
    );
  }

  return (
    <Card
      title={
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: COLORS.surface[1],
          margin: '-12px -24px',
          padding: '12px 24px',
        }}>
          <Space>
            <span style={{ color: COLORS.text.primary, fontWeight: 500 }}>
              Codebase Structure
            </span>
            <Tag color="blue">{scan.stats.totalFiles} files</Tag>
            <Tag color="green">{scan.stats.totalFunctions} functions</Tag>
            <Tag color="purple">{scan.stats.totalClasses || 0} classes</Tag>
          </Space>
          <AntSearch
            placeholder="Search nodes..."
            allowClear
            onChange={(e) => handleSearch(e.target.value)}
            style={{ width: 200 }}
            size="small"
          />
        </div>
      }
      style={{
        height: 650,
        background: COLORS.surface[1],
        border: `1px solid ${COLORS.surface[3]}`,
      }}
      styles={{
        header: {
          background: COLORS.surface[1],
          borderBottom: `1px solid ${COLORS.surface[3]}`,
          color: COLORS.text.primary,
        },
        body: {
          height: 'calc(100% - 57px)',
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* Breadcrumb Navigation */}
      <div style={{
        padding: '0 16px',
        borderBottom: `1px solid ${COLORS.surface[3]}`,
        background: COLORS.surface[1],
      }}>
        <Breadcrumb projectName={scan.projectName} />
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Canvas
          scanData={scan}
          warnings={warnings}
          onNodeClick={handleNodeClick}
        />
      </div>
    </Card>
  );
};

export default SurveyorCanvas;
