/**
 * Surveyor Page
 * Codebase analysis and visualization with React Flow
 * Part of MandrelV2 Surveyor Integration - Phase 3
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Typography,
  Space,
  Card,
  Row,
  Col,
  Statistic,
  Progress,
  Button,
  Tabs,
  Drawer,
  Descriptions,
  Tag,
  Alert,
  Spin,
  Empty,
  message,
} from 'antd';
import {
  RadarChartOutlined,
  SyncOutlined,
  FileOutlined,
  CodeOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useProjectContext } from '../contexts/ProjectContext';
import { useScans, useLatestScan, useProjectStats, useTriggerScan } from '../hooks/useSurveyorData';
import { SurveyorCanvas } from '../components/surveyor/SurveyorCanvas';
import { SurveyorWarningList } from '../components/surveyor/SurveyorWarningList';
import type { Warning } from '../api/surveyorClient';

const { Title, Paragraph, Text } = Typography;
const { TabPane } = Tabs;

// Health score colors
const getHealthColor = (score: number | null): string => {
  if (score === null) return '#999';
  if (score >= 90) return '#52c41a';
  if (score >= 70) return '#1890ff';
  if (score >= 50) return '#faad14';
  return '#f5222d';
};

// Health score label
const getHealthLabel = (score: number | null): string => {
  if (score === null) return 'Unknown';
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Moderate';
  return 'Needs Attention';
};

const Surveyor: React.FC = () => {
  const { currentProject } = useProjectContext();
  const projectId = currentProject?.id;

  // Data hooks
  const { data: latestScan, isLoading: scanLoading } = useLatestScan(projectId);
  const { data: statsData, isLoading: statsLoading } = useProjectStats(projectId);
  const triggerScanMutation = useTriggerScan();

  // UI state
  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('canvas');

  // Handlers
  const handleNodeClick = useCallback((nodeId: string, nodeData: any) => {
    setSelectedNode(nodeData);
    setDrawerVisible(true);
  }, []);

  const handleWarningClick = useCallback((warning: Warning) => {
    // Could navigate to the file or highlight in canvas
    console.log('Warning clicked:', warning);
  }, []);

  const handleTriggerScan = useCallback(() => {
    if (!projectId) {
      message.warning('Please select a project first');
      return;
    }
    console.log('Triggering scan for:', projectId, currentProject?.root_directory);
    triggerScanMutation.mutate({
      projectPath: currentProject?.root_directory || '/unknown',
      projectId,
    });
  }, [projectId, currentProject, triggerScanMutation]);

  // Show feedback when mutation completes
  useEffect(() => {
    if (triggerScanMutation.isSuccess) {
      message.success('Scan request submitted. Run surveyor CLI to complete the scan.');
    }
    if (triggerScanMutation.isError) {
      message.error(`Scan failed: ${triggerScanMutation.error?.message || 'Unknown error'}`);
    }
  }, [triggerScanMutation.isSuccess, triggerScanMutation.isError, triggerScanMutation.error]);

  // Loading state
  if (!projectId) {
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={2}>
            <RadarChartOutlined style={{ marginRight: 8 }} />
            Surveyor
          </Title>
        </div>
        <Card>
          <Empty description="Select a project to view codebase analysis" />
        </Card>
      </Space>
    );
  }

  const isLoading = scanLoading || statsLoading;
  const healthScore = latestScan?.healthScore ?? null;
  const stats = latestScan?.stats;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={2}>
            <RadarChartOutlined style={{ marginRight: 8 }} />
            Surveyor
          </Title>
          <Paragraph type="secondary">
            Codebase analysis and visualization for {currentProject?.name || 'current project'}
          </Paragraph>
        </div>
        <Button
          type="primary"
          icon={<SyncOutlined spin={triggerScanMutation.isPending} />}
          onClick={handleTriggerScan}
          loading={triggerScanMutation.isPending}
        >
          {latestScan ? 'Re-scan' : 'Start Scan'}
        </Button>
      </div>

      {/* Health Score & Stats Row */}
      {isLoading ? (
        <Card>
          <Spin tip="Loading scan data..." />
        </Card>
      ) : latestScan ? (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Health Score"
                value={healthScore ?? 'N/A'}
                suffix={healthScore !== null ? '/100' : ''}
                valueStyle={{ color: getHealthColor(healthScore) }}
                prefix={
                  healthScore !== null && healthScore >= 70 ? (
                    <CheckCircleOutlined />
                  ) : (
                    <WarningOutlined />
                  )
                }
              />
              <Progress
                percent={healthScore ?? 0}
                strokeColor={getHealthColor(healthScore)}
                showInfo={false}
                size="small"
                style={{ marginTop: 8 }}
              />
              <Text type="secondary">{getHealthLabel(healthScore)}</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Total Files"
                value={stats?.totalFiles || 0}
                prefix={<FileOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Functions"
                value={stats?.totalFunctions || 0}
                prefix={<CodeOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Warnings"
                value={stats?.totalWarnings || 0}
                prefix={<WarningOutlined />}
                valueStyle={{
                  color: (stats?.totalWarnings || 0) > 0 ? '#faad14' : '#52c41a',
                }}
              />
              {stats?.warningsByLevel && (
                <Space style={{ marginTop: 8 }}>
                  {(stats.warningsByLevel.error || 0) > 0 && (
                    <Tag color="red">{stats.warningsByLevel.error} errors</Tag>
                  )}
                  {(stats.warningsByLevel.warning || 0) > 0 && (
                    <Tag color="orange">{stats.warningsByLevel.warning} warnings</Tag>
                  )}
                </Space>
              )}
            </Card>
          </Col>
        </Row>
      ) : (
        <Alert
          message="No scan available"
          description="Click 'Start Scan' to analyze your codebase structure and detect potential issues."
          type="info"
          showIcon
          icon={<ClockCircleOutlined />}
        />
      )}

      {/* Main Content Tabs */}
      {latestScan && (
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane
            tab={
              <span>
                <RadarChartOutlined />
                Visualization
              </span>
            }
            key="canvas"
          >
            <SurveyorCanvas scanId={latestScan.id} onNodeClick={handleNodeClick} />
          </TabPane>
          <TabPane
            tab={
              <span>
                <WarningOutlined />
                Warnings ({stats?.totalWarnings || 0})
              </span>
            }
            key="warnings"
          >
            <SurveyorWarningList scanId={latestScan.id} onWarningClick={handleWarningClick} />
          </TabPane>
        </Tabs>
      )}

      {/* Node Detail Drawer */}
      <Drawer
        title="Node Details"
        placement="right"
        width={500}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
      >
        {selectedNode && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Name">
              <Text strong>{selectedNode.name}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Type">
              <Tag>{selectedNode.type}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="File Path">
              <Text code style={{ fontSize: '12px' }}>
                {selectedNode.filePath}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Lines">
              {selectedNode.line} - {selectedNode.endLine}
            </Descriptions.Item>

            {selectedNode.type === 'function' && (
              <>
                {selectedNode.behavioral?.summary && (
                  <Descriptions.Item label="Summary">
                    {selectedNode.behavioral.summary}
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="Async">
                  {selectedNode.isAsync ? 'Yes' : 'No'}
                </Descriptions.Item>
                <Descriptions.Item label="Exported">
                  {selectedNode.isExported ? 'Yes' : 'No'}
                </Descriptions.Item>
                {selectedNode.params?.length > 0 && (
                  <Descriptions.Item label="Parameters">
                    {selectedNode.params.map((p: any) => p.name).join(', ')}
                  </Descriptions.Item>
                )}
              </>
            )}

            {selectedNode.type === 'class' && (
              <>
                {selectedNode.extends && (
                  <Descriptions.Item label="Extends">
                    {selectedNode.extends}
                  </Descriptions.Item>
                )}
                {selectedNode.implements?.length > 0 && (
                  <Descriptions.Item label="Implements">
                    {selectedNode.implements.join(', ')}
                  </Descriptions.Item>
                )}
                {selectedNode.methods?.length > 0 && (
                  <Descriptions.Item label="Methods">
                    {selectedNode.methods.length}
                  </Descriptions.Item>
                )}
              </>
            )}

            {selectedNode.type === 'file' && (
              <>
                {selectedNode.imports?.length > 0 && (
                  <Descriptions.Item label="Imports">
                    {selectedNode.imports.length} modules
                  </Descriptions.Item>
                )}
                {selectedNode.exports?.length > 0 && (
                  <Descriptions.Item label="Exports">
                    {selectedNode.exports.length} items
                  </Descriptions.Item>
                )}
              </>
            )}
          </Descriptions>
        )}
      </Drawer>
    </Space>
  );
};

export default Surveyor;
