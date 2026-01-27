/**
 * Surveyor Page
 * Codebase analysis and visualization with React Flow
 * Dark theme UI matching original Surveyor
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  Switch,
  Tooltip,
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
  Brain,
  Sparkles,
} from 'lucide-react';
import { useProjectContext } from '../contexts/ProjectContext';
import { useLatestScan, useProjectStats, useTriggerScan, useAnalyzeStatus, useTriggerAnalysis, useScans, useScan } from '../hooks/useSurveyorData';
import { SurveyorCanvas } from '../components/surveyor/SurveyorCanvas';
import { SurveyorWarningList } from '../components/surveyor/SurveyorWarningList';
import { COLORS } from '../components/surveyor/utils/colors';
import { fadeInVariants, slideUpVariants } from '../components/surveyor/utils/animations';
import { useScanStore } from '../components/surveyor/stores/scan-store';
import type { Warning } from '../api/surveyorClient';
import { apiClient } from '../services/api';

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
  const { data: latestScan, isLoading: scanLoading, refetch: refetchLatestScan } = useLatestScan(projectId);
  const { data: scanWithNodes } = useScan(latestScan?.id, true); // Fetch with nodes for warning navigation
  const { data: statsData, isLoading: statsLoading } = useProjectStats(projectId);
  const { data: analyzeStatus } = useAnalyzeStatus();
  const triggerScanMutation = useTriggerScan();
  const triggerAnalysisMutation = useTriggerAnalysis();

  // Scan store for canvas navigation
  const drillInto = useScanStore((state) => state.drillInto);
  const reset = useScanStore((state) => state.reset);
  const setHighlightedNodes = useScanStore((state) => state.setHighlightedNodes);

  // UI state
  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [scanNodes, setScanNodes] = useState<Record<string, any> | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('canvas');
  const [aiAnalysisEnabled, setAiAnalysisEnabled] = useState(true); // Default ON
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Ref to prevent duplicate analysis triggers
  const analysisTriggeredRef = useRef<string | null>(null);

  // Handlers
  const handleNodeClick = useCallback((nodeId: string, nodeData: any, nodes: Record<string, any>) => {
    setSelectedNode(nodeData);
    setScanNodes(nodes);
    setDrawerVisible(true);
  }, []);

  const handleWarningClick = useCallback((warning: Warning) => {
    // Navigate to the file in the canvas view
    if (!warning.filePath || !scanWithNodes?.nodes) {
      console.log('Warning clicked but no filePath or nodes:', warning);
      return;
    }

    // Extract folder path from file path (e.g., "mcp-server/src/main.ts" -> "mcp-server/src")
    const parts = warning.filePath.split('/');
    const folderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';

    // Find the file node - look through affected nodes first, then fall back to matching by filePath
    let fileNode: any = null;
    let fileNodeId: string | null = null;

    // Try affected nodes first
    for (const nodeId of warning.affectedNodes) {
      const node = scanWithNodes.nodes[nodeId];
      if (node && node.type === 'file') {
        fileNode = node;
        fileNodeId = nodeId;
        break;
      }
    }

    // Fall back: find any file node matching the filePath
    if (!fileNode) {
      for (const [nodeId, node] of Object.entries(scanWithNodes.nodes)) {
        if (node.type === 'file' && node.filePath === warning.filePath) {
          fileNode = node;
          fileNodeId = nodeId;
          break;
        }
      }
    }

    // Reset navigation first, then drill into the folder
    reset();

    // Navigate through the folder hierarchy
    const folderParts = folderPath.split('/');
    let currentPath = '';
    for (const part of folderParts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      drillInto(currentPath);
    }

    // Switch to canvas tab
    setActiveTab('canvas');

    // If we found the file node, highlight it and open the detail drawer
    if (fileNode && fileNodeId) {
      // Highlight the file node - Canvas will auto-zoom to it
      setHighlightedNodes([fileNodeId]);

      // Build node data for drawer (mimic what handleNodeClick does)
      const nodeData = {
        id: fileNodeId,
        label: fileNode.name || warning.filePath.split('/').pop(),
        filePath: warning.filePath,
        fileData: {
          functions: fileNode.functions || [],
          exports: fileNode.exports || [],
          imports: fileNode.imports || [],
        },
      };
      setSelectedNode(nodeData);
      setScanNodes(scanWithNodes.nodes);
      setDrawerVisible(true);
    }
  }, [scanWithNodes?.nodes, drillInto, reset, setHighlightedNodes]);

  // Open file in nvim via local surveyor server
  // Calls localhost:4000 directly - surveyor server handles path mapping
  const handleOpenInEditor = useCallback(async (filePath: string, line?: number) => {
    try {
      const response = await fetch('http://localhost:4000/api/v1/open-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, line }),
      });
      const result = await response.json();
      if (result.success) {
        message.success('Opened in nvim');
      } else {
        message.error(result.error || 'Failed to open file');
      }
    } catch (err) {
      message.error('Local editor service not running. Start: cd ~/projects/surveyor && npm run dev');
      console.error('Editor open error:', err);
    }
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

  // Handler for triggering AI analysis manually
  const handleTriggerAnalysis = useCallback(() => {
    if (!latestScan?.id) {
      message.warning('No scan available to analyze');
      return;
    }
    if (isAnalyzing) {
      message.info('Analysis already in progress');
      return;
    }
    setIsAnalyzing(true);
    analysisTriggeredRef.current = latestScan.id;
    message.loading('Running AI analysis...', 0);

    triggerAnalysisMutation.mutate(
      { scanId: latestScan.id, options: { skipAnalyzed: true } },
      {
        onSuccess: (data) => {
          message.destroy();
          message.success(`AI analysis complete: ${data.analyzedCount} functions analyzed`);
          setIsAnalyzing(false);
          refetchLatestScan();
        },
        onError: (error) => {
          message.destroy();
          message.error(`Analysis failed: ${error.message}`);
          setIsAnalyzing(false);
          // Note: Do NOT reset analysisTriggeredRef - that causes retry loops
          // User can click the button again to retry
        },
      }
    );
  }, [latestScan?.id, isAnalyzing, triggerAnalysisMutation, refetchLatestScan]);

  // Show feedback when scan mutation completes
  useEffect(() => {
    if (triggerScanMutation.isSuccess) {
      message.success('Scan completed successfully');
    }
    if (triggerScanMutation.isError) {
      message.error(`Scan failed: ${triggerScanMutation.error?.message || 'Unknown error'}`);
    }
  }, [triggerScanMutation.isSuccess, triggerScanMutation.isError, triggerScanMutation.error]);

  // Auto-trigger analysis after successful scan (separate effect to avoid loops)
  useEffect(() => {
    // Only trigger if: scan succeeded, analysis enabled, API available, scan ID exists, not already triggered for this scan
    if (
      triggerScanMutation.isSuccess &&
      aiAnalysisEnabled &&
      analyzeStatus?.available &&
      latestScan?.id &&
      analysisTriggeredRef.current !== latestScan.id &&
      !isAnalyzing
    ) {
      // Mark as triggered to prevent duplicates - keep set even on error to prevent retry loops
      analysisTriggeredRef.current = latestScan.id;
      setIsAnalyzing(true);
      message.loading('Running AI analysis...', 0);

      triggerAnalysisMutation.mutate(
        { scanId: latestScan.id, options: { skipAnalyzed: true } },
        {
          onSuccess: (data) => {
            message.destroy();
            message.success(`AI analysis complete: ${data.analyzedCount} functions analyzed`);
            setIsAnalyzing(false);
            refetchLatestScan();
          },
          onError: (error) => {
            message.destroy();
            message.error(`Analysis failed: ${error.message}`);
            setIsAnalyzing(false);
            // Note: Do NOT reset analysisTriggeredRef here - that causes retry loops
            // User can still retry manually using the "Run AI Analysis" button
          },
        }
      );
    }
  }, [triggerScanMutation.isSuccess, aiAnalysisEnabled, analyzeStatus?.available, latestScan?.id, isAnalyzing, triggerAnalysisMutation, refetchLatestScan]);

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* AI Analysis Toggle */}
          {analyzeStatus?.available && (
            <Tooltip title={aiAnalysisEnabled ? 'AI analysis will run after scan' : 'AI analysis disabled'}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                background: COLORS.surface[1],
                borderRadius: 8,
                border: `1px solid ${COLORS.surface[3]}`,
              }}>
                <Brain size={16} color={aiAnalysisEnabled ? COLORS.accent.secondary : COLORS.text.muted} />
                <span style={{ color: COLORS.text.secondary, fontSize: 13 }}>AI Analysis</span>
                <Switch
                  size="small"
                  checked={aiAnalysisEnabled}
                  onChange={setAiAnalysisEnabled}
                  style={{ marginLeft: 4 }}
                />
              </div>
            </Tooltip>
          )}

          {/* Manual Analyze Button - show if scan exists but has pending analysis */}
          {latestScan && analyzeStatus?.available && (latestScan.stats?.pendingAnalysis ?? 0) > 0 && (
            <Tooltip title={`${latestScan.stats?.pendingAnalysis || 0} functions pending analysis`}>
              <motion.button
                onClick={handleTriggerAnalysis}
                disabled={isAnalyzing}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 16px',
                  background: COLORS.accent.secondary,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: isAnalyzing ? 'not-allowed' : 'pointer',
                  opacity: isAnalyzing ? 0.7 : 1,
                }}
              >
                <Sparkles
                  size={16}
                  style={{
                    animation: isAnalyzing ? 'pulse 1s ease-in-out infinite' : 'none',
                  }}
                />
                {isAnalyzing ? 'Analyzing...' : 'Run AI Analysis'}
              </motion.button>
            </Tooltip>
          )}

          {/* Scan Button */}
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
      </div>

      {/* Health Score & Stats Row */}
      {isLoading || triggerScanMutation.isPending || isAnalyzing ? (
        <Card style={{
          background: COLORS.surface[1],
          border: `1px solid ${COLORS.surface[3]}`,
          marginBottom: 24,
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 48,
            gap: 16,
          }}>
            <Spin size="large" />
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: COLORS.text.primary, fontSize: 16, fontWeight: 500, marginBottom: 8 }}>
                {triggerScanMutation.isPending ? 'Scanning Codebase...' :
                 isAnalyzing ? 'Running AI Analysis...' :
                 'Loading Scan Data...'}
              </div>
              <div style={{ color: COLORS.text.secondary, fontSize: 13 }}>
                {triggerScanMutation.isPending ? 'Parsing files, analyzing structure, detecting warnings' :
                 isAnalyzing ? 'AI is analyzing functions to generate behavioral summaries' :
                 'Fetching latest scan results from server'}
              </div>
              {isAnalyzing && (
                <div style={{ color: COLORS.text.muted, fontSize: 12, marginTop: 8 }}>
                  This may take a few minutes for large codebases
                </div>
              )}
            </div>
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
        title={<span style={{ color: COLORS.text.primary }}>{selectedNode?.label || 'File Details'}</span>}
        placement="right"
        width={520}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        styles={{
          header: {
            background: COLORS.surface[1],
            borderBottom: `1px solid ${COLORS.surface[3]}`,
          },
          body: {
            background: COLORS.surface[1],
            padding: '16px',
          },
        }}
      >
        {selectedNode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* File Path - Click to open in nvim */}
            <section>
              <div style={{ color: COLORS.text.secondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Path <span style={{ opacity: 0.6, fontWeight: 400 }}>(click to open)</span>
              </div>
              <Text
                code
                style={{
                  fontSize: '12px',
                  color: COLORS.accent.primary,
                  wordBreak: 'break-all',
                  cursor: 'pointer',
                  display: 'inline-block',
                  padding: '4px 8px',
                  borderRadius: 4,
                  transition: 'background 0.2s ease',
                }}
                onClick={() => handleOpenInEditor(selectedNode.filePath)}
                onMouseEnter={(e) => e.currentTarget.style.background = COLORS.surface[3]}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                {selectedNode.filePath}
              </Text>
            </section>

            {/* Summary Stats */}
            <section>
              <div style={{ display: 'flex', gap: 16 }}>
                <Tag color="blue">{selectedNode.fileData?.functions?.length || 0} functions</Tag>
                <Tag color="green">{selectedNode.fileData?.exports?.length || 0} exports</Tag>
                <Tag color="purple">{selectedNode.fileData?.imports?.length || 0} imports</Tag>
              </div>
            </section>

            {/* Functions with AI Analysis */}
            {selectedNode.fileData?.functions?.length > 0 && (
              <section>
                <div style={{ color: COLORS.text.secondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                  Functions ({selectedNode.fileData.functions.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedNode.fileData.functions.map((fnIdOrObj: string | any, idx: number) => {
                    // Handle both ID strings and full function objects
                    const fnNode = typeof fnIdOrObj === 'string'
                      ? scanNodes?.[fnIdOrObj]
                      : fnIdOrObj;
                    const fnName = fnNode?.name || (typeof fnIdOrObj === 'string' ? fnIdOrObj : 'Unknown');
                    const behavioral = fnNode?.behavioral;

                    return (
                      <div
                        key={idx}
                        style={{
                          background: COLORS.surface[2],
                          borderRadius: 8,
                          padding: 12,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: behavioral ? 8 : 0 }}>
                          <span style={{ fontFamily: 'monospace', color: COLORS.text.primary, fontWeight: 500 }}>
                            {fnName}()
                          </span>
                          {fnNode?.isAsync && (
                            <Tag color="cyan" style={{ margin: 0, fontSize: 10 }}>async</Tag>
                          )}
                        </div>

                        {/* Behavioral Summary (AI Analysis) */}
                        {behavioral && (
                          <>
                            <div style={{ color: COLORS.text.secondary, fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>
                              {behavioral.summary}
                            </div>

                            {/* Side Effect Flags */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                              {behavioral.flags?.databaseRead && <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>DB Read</Tag>}
                              {behavioral.flags?.databaseWrite && <Tag color="orange" style={{ fontSize: 10, margin: 0 }}>DB Write</Tag>}
                              {behavioral.flags?.httpCall && <Tag color="purple" style={{ fontSize: 10, margin: 0 }}>HTTP</Tag>}
                              {behavioral.flags?.fileRead && <Tag color="cyan" style={{ fontSize: 10, margin: 0 }}>File Read</Tag>}
                              {behavioral.flags?.fileWrite && <Tag color="gold" style={{ fontSize: 10, margin: 0 }}>File Write</Tag>}
                              {behavioral.flags?.sendsNotification && <Tag color="magenta" style={{ fontSize: 10, margin: 0 }}>Notification</Tag>}
                              {behavioral.flags?.modifiesGlobalState && <Tag color="red" style={{ fontSize: 10, margin: 0 }}>Global State</Tag>}
                            </div>

                            {/* Source Indicator */}
                            <div style={{ color: COLORS.text.muted, fontSize: 10 }}>
                              {behavioral.source === 'ai' ? '🤖 AI-generated' :
                               behavioral.source === 'docstring' ? '📝 From docstring' :
                               '✏️ Manual'}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Exports */}
            {selectedNode.fileData?.exports?.length > 0 && (
              <section>
                <div style={{ color: COLORS.text.secondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                  Exports ({selectedNode.fileData.exports.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {selectedNode.fileData.exports.map((exp: any, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        background: COLORS.surface[2],
                        borderRadius: 6,
                        padding: '6px 10px',
                      }}
                    >
                      <Tag
                        color={exp.isDefault ? 'blue' : 'default'}
                        style={{ margin: 0, fontSize: 10 }}
                      >
                        {exp.kind || 'export'}
                      </Tag>
                      <span style={{ fontFamily: 'monospace', color: COLORS.text.primary, fontSize: 13 }}>
                        {exp.name}
                      </span>
                      {exp.isDefault && (
                        <span style={{ color: COLORS.text.muted, fontSize: 10 }}>(default)</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Imports */}
            {selectedNode.fileData?.imports?.length > 0 && (
              <section>
                <div style={{ color: COLORS.text.secondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                  Imports ({selectedNode.fileData.imports.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedNode.fileData.imports.map((imp: any, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        background: COLORS.surface[2],
                        borderRadius: 6,
                        padding: '8px 10px',
                      }}
                    >
                      <div style={{ fontFamily: 'monospace', color: COLORS.accent.primary, fontSize: 12, marginBottom: imp.items?.length > 0 ? 6 : 0 }}>
                        {imp.source}
                      </div>
                      {imp.items?.length > 0 && (
                        <div style={{ marginLeft: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {imp.items.map((item: any, itemIdx: number) => (
                            <div key={itemIdx} style={{ fontFamily: 'monospace', color: COLORS.text.secondary, fontSize: 11 }}>
                              {item.isDefault && <span style={{ color: COLORS.text.muted }}>(default) </span>}
                              {item.name}
                              {item.alias && <span style={{ color: COLORS.text.muted }}> as {item.alias}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
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
