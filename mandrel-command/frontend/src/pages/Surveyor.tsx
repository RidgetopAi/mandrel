/**
 * Surveyor page — scan + explore a codebase on the server (Surveyor P4c-frontend,
 * Mandrel task 7aaa4509, decision 8f330f96).
 *
 * Wires the ported, pure surveyor view layer to the command-backend REST surface:
 *   - PROJECT PICKER (Mandrel projects) selects the scope.
 *   - GET /graph + /findings → adapter → core ScanResult → Canvas (+ ViewToggle).
 *
 * The interaction state (selection/hover/drill/highlight) lives in the surveyor
 * scan-store; the fetched scan is pushed into it so the Canvas, node badges, and
 * panels all read one source of truth. Data fetching uses React Query (the app's
 * standard) — loading/empty/error states are owned here, not in the stores.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Typography,
  Space,
  Card,
  Select,
  Empty,
  Alert,
  Spin,
  Tag,
  Button,
  Tooltip,
} from 'antd';
import { RadarChartOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useProjectContext } from '../contexts/ProjectContext';
import { surveyorClient } from '../surveyor/api/surveyorClient';
import { storedGraphToScan } from '../surveyor/adapter/storedGraphToScan';
import { Canvas } from '../surveyor/components/canvas/Canvas';
import { ViewToggle } from '../surveyor/components/controls/ViewToggle';
import { NodeDetailPanel } from '../surveyor/components/panels/NodeDetailPanel';
import { FindingsPanel } from '../surveyor/components/panels/FindingsPanel';
import { useScanStore } from '../surveyor/stores/scan-store';

const { Title, Paragraph, Text } = Typography;

const surveyorKeys = {
  graph: (projectId: string) => ['surveyor', 'graph', projectId] as const,
  findings: (projectId: string) => ['surveyor', 'findings', projectId] as const,
};

const Surveyor: React.FC = () => {
  const { allProjects, currentProject } = useProjectContext();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [findingsOpen, setFindingsOpen] = useState(false);

  const setScan = useScanStore((s) => s.setScan);
  const selectedNodeId = useScanStore((s) => s.selectedNodeId);

  // Default the picker to the app's current project once projects are available.
  useEffect(() => {
    if (!projectId && currentProject?.id) {
      setProjectId(currentProject.id);
    }
  }, [projectId, currentProject]);

  const graphQuery = useQuery({
    queryKey: projectId ? surveyorKeys.graph(projectId) : ['surveyor', 'graph', 'none'],
    queryFn: () => surveyorClient.getGraph(projectId as string),
    enabled: !!projectId,
  });

  const findingsQuery = useQuery({
    queryKey: projectId ? surveyorKeys.findings(projectId) : ['surveyor', 'findings', 'none'],
    queryFn: () => surveyorClient.getFindings(projectId as string),
    enabled: !!projectId,
  });

  // Build the core ScanResult the views consume (graph + findings folded in).
  const scan = useMemo(() => {
    if (!graphQuery.data) return null;
    return storedGraphToScan(graphQuery.data, findingsQuery.data ?? null);
  }, [graphQuery.data, findingsQuery.data]);

  // Push the fetched scan into the interaction store (single source of truth for
  // the Canvas badges + panels). Reset when the project changes / clears.
  useEffect(() => {
    setScan(scan);
  }, [scan, setScan]);

  const refetchAll = () => {
    graphQuery.refetch();
    findingsQuery.refetch();
  };

  const hasScan = !!scan;
  const isLoading = graphQuery.isLoading || findingsQuery.isLoading;
  const error = graphQuery.error || findingsQuery.error;
  const findingsCount = scan?.warnings.length ?? 0;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Header */}
      <div>
        <Title level={2} style={{ marginBottom: 0 }}>
          <RadarChartOutlined style={{ marginRight: 8 }} />
          Surveyor
        </Title>
        <Paragraph type="secondary">
          Scan a codebase on the server and explore its structure, dependencies, and findings.
        </Paragraph>
      </div>

      {/* Controls */}
      <Card size="small">
        <Space wrap align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap align="center">
            <Text strong>Project</Text>
            <Select
              showSearch
              placeholder="Select a project"
              style={{ minWidth: 240 }}
              value={projectId ?? undefined}
              onChange={(value) => setProjectId(value)}
              optionFilterProp="label"
              options={allProjects.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Space>

          <Space wrap align="center">
            {hasScan && <ViewToggle />}
            {hasScan && (
              <Button onClick={() => setFindingsOpen(true)}>
                Findings{findingsCount > 0 ? ` (${findingsCount})` : ''}
              </Button>
            )}
            <Tooltip title="Refresh">
              <Button
                icon={<ReloadOutlined />}
                onClick={refetchAll}
                disabled={!projectId}
                loading={graphQuery.isFetching || findingsQuery.isFetching}
              />
            </Tooltip>
          </Space>
        </Space>
      </Card>

      {error && (
        <Alert
          type="error"
          showIcon
          message="Failed to load Surveyor data"
          description={error instanceof Error ? error.message : String(error)}
        />
      )}

      {/* Canvas + detail panel */}
      <Card styles={{ body: { padding: 0 } }} style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', height: '70vh', minHeight: 480 }}>
          <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
            {isLoading ? (
              <Centered>
                <Spin tip="Loading scan…" size="large" />
              </Centered>
            ) : !projectId ? (
              <Centered>
                <Empty description="Pick a project to begin." />
              </Centered>
            ) : !hasScan ? (
              <Centered>
                <Empty
                  description={
                    <Space direction="vertical">
                      <Text>No scan stored for this project yet.</Text>
                      <Text type="secondary">
                        Run a scan with a server-side path to populate the graph.
                      </Text>
                    </Space>
                  }
                />
              </Centered>
            ) : (
              <Canvas scanData={scan} />
            )}
          </div>

          {hasScan && selectedNodeId && projectId && (
            <NodeDetailPanel projectId={projectId} />
          )}
        </div>
      </Card>

      {hasScan && graphQuery.data?.truncated && (
        <Tag color="warning">
          Graph truncated — showing a capped subset of nodes for this scan.
        </Tag>
      )}

      <FindingsPanel isOpen={findingsOpen} onClose={() => setFindingsOpen(false)} />
    </Space>
  );
};

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    {children}
  </div>
);

export default Surveyor;
