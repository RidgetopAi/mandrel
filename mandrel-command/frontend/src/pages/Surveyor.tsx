/**
 * Surveyor Page
 * Codebase analysis and visualization with React Flow
 * Dark theme UI matching original Surveyor
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Typography,
  Space,
  Card,
  Row,
  Col,
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
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radar,
  RefreshCw,
  FileCode,
  Code,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { useProjectContext } from '../contexts/ProjectContext';
import { useLatestScan, useProjectStats, useTriggerScan } from '../hooks/useSurveyorData';
import { SurveyorCanvas } from '../components/surveyor/SurveyorCanvas';
import { SurveyorWarningList } from '../components/surveyor/SurveyorWarningList';
import { COLORS } from '../components/surveyor/utils/colors';
import { fadeInVariants, slideUpVariants } from '../components/surveyor/utils/animations';
import type { Warning } from '../api/surveyorClient';

const { Title, Paragraph, Text } = Typography;

// Health score colors
const getHealthColor = (score: number | null): string => {
  if (score === null) return COLORS.text.muted;
  if (score >= 90) return COLORS.status.healthy;
  if (score >= 70) return COLORS.accent.primary;
  if (score >= 50) return COLORS.status.warning;
  return COLORS.status.error;
};

// Health score label
const getHealthLabel = (score: number | null): string => {
  if (score === null) return 'Unknown';
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Moderate';
  return 'Needs Attention';
};

// Stat card component with dark theme
interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color?: string;
  suffix?: string;
  extra?: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color, suffix, extra }) => (
  <motion.div
    initial="hidden"
    animate="visible"
    variants={slideUpVariants}
    style={{
      background: COLORS.surface[1],
      border: `1px solid ${COLORS.surface[3]}`,
      borderRadius: 12,
      padding: 20,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div>
        <div style={{ color: COLORS.text.secondary, fontSize: 13, marginBottom: 8 }}>
          {title}
        </div>
        <div style={{
          color: color || COLORS.text.primary,
          fontSize: 28,
          fontWeight: 600,
          lineHeight: 1,
        }}>
          {value}
          {suffix && <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 4 }}>{suffix}</span>}
        </div>
        {extra && <div style={{ marginTop: 8 }}>{extra}</div>}
      </div>
      <div style={{ color: color || COLORS.accent.primary, opacity: 0.8 }}>
        {icon}
      </div>
    </div>
  </motion.div>
);

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
    console.log('Warning clicked:', warning);
  }, []);

  const handleTriggerScan = useCallback(() => {
    if (!projectId) {
      message.warning('Please select a project first');
      return;
    }
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

  // Loading state - no project selected
  if (!projectId) {
    return (
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInVariants}
        style={{
          background: COLORS.surface[0],
          minHeight: '100vh',
          padding: 24,
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Radar size={28} color={COLORS.accent.primary} />
            <Title level={2} style={{ color: COLORS.text.primary, margin: 0 }}>
              Surveyor
            </Title>
          </div>
        </div>
        <Card style={{
          background: COLORS.surface[1],
          border: `1px solid ${COLORS.surface[3]}`,
        }}>
          <Empty
            description={<span style={{ color: COLORS.text.secondary }}>Select a project to view codebase analysis</span>}
          />
        </Card>
      </motion.div>
    );
  }

  const isLoading = scanLoading || statsLoading;
  const healthScore = latestScan?.healthScore ?? null;
  const stats = latestScan?.stats;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeInVariants}
      style={{
        background: COLORS.surface[0],
        minHeight: '100vh',
        padding: 24,
      }}
    >
      {/* Page Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 24,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Radar size={28} color={COLORS.accent.primary} />
            <Title level={2} style={{ color: COLORS.text.primary, margin: 0 }}>
              Surveyor
            </Title>
          </div>
          <Paragraph style={{ color: COLORS.text.secondary, margin: 0 }}>
            Codebase analysis and visualization for {currentProject?.name || 'current project'}
          </Paragraph>
        </div>
        <motion.button
          onClick={handleTriggerScan}
          disabled={triggerScanMutation.isPending}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            background: COLORS.accent.primary,
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            cursor: triggerScanMutation.isPending ? 'not-allowed' : 'pointer',
            opacity: triggerScanMutation.isPending ? 0.7 : 1,
          }}
        >
          <RefreshCw
            size={16}
            style={{
              animation: triggerScanMutation.isPending ? 'spin 1s linear infinite' : 'none',
            }}
          />
          {latestScan ? 'Re-scan' : 'Start Scan'}
        </motion.button>
      </div>

      {/* Health Score & Stats Row */}
      {isLoading ? (
        <Card style={{
          background: COLORS.surface[1],
          border: `1px solid ${COLORS.surface[3]}`,
          marginBottom: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
            <Spin size="large" tip="Loading scan data..." />
          </div>
        </Card>
      ) : latestScan ? (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} md={6}>
            <StatCard
              title="Health Score"
              value={healthScore ?? 'N/A'}
              suffix={healthScore !== null ? '/100' : ''}
              color={getHealthColor(healthScore)}
              icon={healthScore !== null && healthScore >= 70 ? (
                <CheckCircle size={24} />
              ) : (
                <AlertTriangle size={24} />
              )}
              extra={
                <>
                  <Progress
                    percent={healthScore ?? 0}
                    strokeColor={getHealthColor(healthScore)}
                    trailColor={COLORS.surface[3]}
                    showInfo={false}
                    size="small"
                    style={{ marginBottom: 4 }}
                  />
                  <div style={{ color: COLORS.text.muted, fontSize: 12 }}>
                    {getHealthLabel(healthScore)}
                  </div>
                </>
              }
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <StatCard
              title="Total Files"
              value={stats?.totalFiles || 0}
              icon={<FileCode size={24} />}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <StatCard
              title="Functions"
              value={stats?.totalFunctions || 0}
              icon={<Code size={24} />}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <StatCard
              title="Warnings"
              value={stats?.totalWarnings || 0}
              color={(stats?.totalWarnings || 0) > 0 ? COLORS.status.warning : COLORS.status.healthy}
              icon={<AlertTriangle size={24} />}
              extra={
                stats?.warningsByLevel && (
                  <Space size={4}>
                    {(stats.warningsByLevel.error || 0) > 0 && (
                      <Tag color="red" style={{ margin: 0 }}>
                        {stats.warningsByLevel.error} errors
                      </Tag>
                    )}
                    {(stats.warningsByLevel.warning || 0) > 0 && (
                      <Tag color="orange" style={{ margin: 0 }}>
                        {stats.warningsByLevel.warning} warnings
                      </Tag>
                    )}
                  </Space>
                )
              }
            />
          </Col>
        </Row>
      ) : (
        <Alert
          message={<span style={{ color: COLORS.text.primary }}>No scan available</span>}
          description={
            <span style={{ color: COLORS.text.secondary }}>
              Click 'Start Scan' to analyze your codebase structure and detect potential issues.
            </span>
          }
          type="info"
          showIcon
          icon={<Clock size={20} style={{ color: COLORS.accent.primary }} />}
          style={{
            background: COLORS.surface[1],
            border: `1px solid ${COLORS.surface[3]}`,
            marginBottom: 24,
          }}
        />
      )}

      {/* Main Content Tabs */}
      <AnimatePresence>
        {latestScan && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              style={{
                color: COLORS.text.primary,
              }}
              items={[
                {
                  key: 'canvas',
                  label: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Radar size={16} />
                      Visualization
                    </span>
                  ),
                  children: (
                    <SurveyorCanvas scanId={latestScan.id} onNodeClick={handleNodeClick} />
                  ),
                },
                {
                  key: 'warnings',
                  label: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <AlertTriangle size={16} />
                      Warnings ({stats?.totalWarnings || 0})
                    </span>
                  ),
                  children: (
                    <SurveyorWarningList scanId={latestScan.id} onWarningClick={handleWarningClick} />
                  ),
                },
              ]}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Node Detail Drawer */}
      <Drawer
        title={<span style={{ color: COLORS.text.primary }}>Node Details</span>}
        placement="right"
        width={500}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        styles={{
          header: {
            background: COLORS.surface[1],
            borderBottom: `1px solid ${COLORS.surface[3]}`,
          },
          body: {
            background: COLORS.surface[1],
          },
        }}
      >
        {selectedNode && (
          <Descriptions
            column={1}
            bordered
            size="small"
            labelStyle={{ background: COLORS.surface[2], color: COLORS.text.secondary }}
            contentStyle={{ background: COLORS.surface[1], color: COLORS.text.primary }}
          >
            <Descriptions.Item label="Name">
              <Text strong style={{ color: COLORS.text.primary }}>{selectedNode.label}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Type">
              <Tag>{selectedNode.fileData?.type || 'file'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="File Path">
              <Text code style={{ fontSize: '12px', color: COLORS.text.secondary }}>
                {selectedNode.filePath}
              </Text>
            </Descriptions.Item>

            {selectedNode.fileData && (
              <>
                {selectedNode.fileData.functions?.length > 0 && (
                  <Descriptions.Item label="Functions">
                    {selectedNode.fileData.functions.length}
                  </Descriptions.Item>
                )}
                {selectedNode.fileData.exports?.length > 0 && (
                  <Descriptions.Item label="Exports">
                    {selectedNode.fileData.exports.length}
                  </Descriptions.Item>
                )}
                {selectedNode.fileData.imports?.length > 0 && (
                  <Descriptions.Item label="Imports">
                    {selectedNode.fileData.imports.length} modules
                  </Descriptions.Item>
                )}
              </>
            )}
          </Descriptions>
        )}
      </Drawer>

      {/* CSS for spin animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </motion.div>
  );
};

export default Surveyor;
