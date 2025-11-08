/**
 * VisualizationPanel Component
 * Provides manual run buttons for dependency analysis and visualization
 * Displays results in modal with graph preview
 */

import React, { useState } from 'react';
import {
  Modal,
  Button,
  Space,
  Card,
  Alert,
  Spin,
  Divider,
  Typography,
  List,
  Tag,
  Tooltip,
  message,
  Descriptions,
  Image,
  Empty,
} from 'antd';
import {
  BranchesOutlined,
  WarningOutlined,
  ThunderboltOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileImageOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import visualizationApi, {
  DependencyAnalysisResult,
  CircularDependenciesResult,
  ComplexModulesResult,
} from '../../services/visualizationApi';

const { Title, Text, Paragraph } = Typography;

interface VisualizationPanelProps {
  targetPath?: string;
  extensions?: string[];
  style?: React.CSSProperties;
}

const VisualizationPanel: React.FC<VisualizationPanelProps> = ({
  targetPath = 'src/main.ts',
  extensions = ['ts', 'tsx', 'js', 'jsx'],
  style,
}) => {
  // State management
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('Analysis Results');
  const [analysisResult, setAnalysisResult] = useState<DependencyAnalysisResult | null>(null);
  const [circularResult, setCircularResult] = useState<CircularDependenciesResult | null>(null);
  const [complexResult, setComplexResult] = useState<ComplexModulesResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset state
  const resetState = () => {
    setAnalysisResult(null);
    setCircularResult(null);
    setComplexResult(null);
    setError(null);
  };

  // Handler: Full Dependency Analysis
  const handleFullAnalysis = async () => {
    resetState();
    setLoading(true);
    setModalTitle('Full Dependency Analysis');

    try {
      const result = await visualizationApi.analyzeDependencies({
        targetPath,
        extensions,
        generateGraph: true,
        exportJSON: true,
        graphFormat: 'svg',
      });

      setAnalysisResult(result);
      setModalVisible(true);
      message.success(`Analyzed ${result.summary.filesAnalyzed} files successfully!`);
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to analyze dependencies';
      setError(errorMsg);
      setModalVisible(true);
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Handler: Circular Dependencies Only
  const handleCircularAnalysis = async () => {
    resetState();
    setLoading(true);
    setModalTitle('Circular Dependencies Detection');

    try {
      const result = await visualizationApi.getCircularDependencies(
        targetPath,
        extensions
      );

      setCircularResult(result);
      setModalVisible(true);

      if (result.count === 0) {
        message.success('No circular dependencies found!');
      } else {
        message.warning(`Found ${result.count} circular dependencies`);
      }
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to detect circular dependencies';
      setError(errorMsg);
      setModalVisible(true);
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Handler: Complex Modules Analysis
  const handleComplexAnalysis = async () => {
    resetState();
    setLoading(true);
    setModalTitle('Complex Modules Analysis');

    try {
      const result = await visualizationApi.getComplexModules(targetPath, 10, extensions);

      setComplexResult(result);
      setModalVisible(true);
      message.success(`Found ${result.modules.length} modules with highest complexity`);
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to analyze complex modules';
      setError(errorMsg);
      setModalVisible(true);
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Handler: Download graph
  const handleDownloadGraph = async (filename: string) => {
    try {
      await visualizationApi.triggerDownload(filename);
      message.success('Download started!');
    } catch (err: any) {
      message.error(err?.message || 'Failed to download file');
    }
  };

  // Render: Full Analysis Results
  const renderFullAnalysis = () => {
    if (!analysisResult) return null;

    const { summary, circular, orphans, graphPath } = analysisResult;

    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Summary Statistics */}
        <Card size="default" title={<span style={{ fontSize: '16px', color: '#000' }}>Analysis Summary</span>}>
          <Descriptions column={2} size="middle">
            <Descriptions.Item label={<span style={{ color: '#000' }}>Files Analyzed</span>}>
              <Text strong style={{ color: '#000', fontSize: '15px' }}>{summary.filesAnalyzed}</Text>
            </Descriptions.Item>
            <Descriptions.Item label={<span style={{ color: '#000' }}>Total Dependencies</span>}>
              <Text strong style={{ color: '#000', fontSize: '15px' }}>{summary.totalDependencies}</Text>
            </Descriptions.Item>
            <Descriptions.Item label={<span style={{ color: '#000' }}>Circular Dependencies</span>}>
              <Text strong type={summary.circularDependencies > 0 ? 'warning' : 'success'} style={{ fontSize: '15px' }}>
                {summary.circularDependencies}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label={<span style={{ color: '#000' }}>Orphan Files</span>}>
              <Text strong style={{ color: '#000', fontSize: '15px' }}>{summary.orphanFiles}</Text>
            </Descriptions.Item>
            <Descriptions.Item label={<span style={{ color: '#000' }}>Leaf Modules</span>}>
              <Text strong style={{ color: '#000', fontSize: '15px' }}>{summary.leafModules}</Text>
            </Descriptions.Item>
            <Descriptions.Item label={<span style={{ color: '#000' }}>Execution Time</span>}>
              <Text style={{ color: '#000', fontSize: '14px' }}>{(summary.executionTime / 1000).toFixed(2)}s</Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* Circular Dependencies */}
        {circular && circular.length > 0 && (
          <Card
            size="default"
            title={
              <Space>
                <WarningOutlined style={{ color: '#faad14', fontSize: '18px' }} />
                <Text style={{ fontSize: '16px', color: '#000', fontWeight: 500 }}>Circular Dependencies ({circular.length})</Text>
              </Space>
            }
          >
            <List
              size="default"
              dataSource={circular}
              renderItem={(item, index) => (
                <List.Item>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Text strong style={{ color: '#000', fontSize: '14px' }}>Chain {index + 1} (Length: {item.length})</Text>
                    {item.chain.map((file, i) => (
                      <div key={i} style={{ paddingLeft: i * 20 }}>
                        <Text code style={{ fontSize: '13px', color: '#000' }}>{file}</Text>
                        {i < item.chain.length - 1 && <Text type="secondary" style={{ color: '#666' }}> → </Text>}
                      </div>
                    ))}
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        )}

        {/* Orphan Files */}
        {orphans && orphans.length > 0 && (
          <Card size="default" title={<span style={{ fontSize: '16px', color: '#000', fontWeight: 500 }}>Orphan Files ({orphans.length})</span>}>
            <Space wrap>
              {orphans.map((file, i) => (
                <Tag key={i} color="orange">
                  {file}
                </Tag>
              ))}
            </Space>
          </Card>
        )}

        {/* Dependency Graph */}
        {graphPath && (
          <Card
            size="default"
            title={
              <Space>
                <FileImageOutlined style={{ fontSize: '18px', color: '#000' }} />
                <Text style={{ fontSize: '16px', fontWeight: 500, color: '#000' }}>Dependency Graph</Text>
              </Space>
            }
            extra={
              <Space>
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={() => handleDownloadGraph(graphPath.split('/').pop() || '')}
                >
                  Download SVG
                </Button>
              </Space>
            }
          >
            <Alert
              message="Viewing Tips"
              description="Click the image to open in full-screen viewer. Use zoom controls, mouse wheel to zoom, and drag to pan."
              type="info"
              showIcon
              closable
              style={{ marginBottom: 16 }}
            />
            <div style={{ 
              textAlign: 'center', 
              minHeight: '70vh',
              maxHeight: 'calc(100vh - 200px)', 
              overflow: 'auto', 
              border: '1px solid #d9d9d9', 
              borderRadius: 4, 
              padding: 16,
              backgroundColor: '#fafafa'
            }}>
              <Image
                src={visualizationApi.getVisualizationUrl(graphPath.split('/').pop() || '')}
                alt="Dependency Graph"
                style={{ maxWidth: '100%', cursor: 'pointer', minHeight: '500px' }}
                preview={{
                  mask: (
                    <Space direction="vertical" align="center">
                      <EyeOutlined style={{ fontSize: 32 }} />
                      <Text style={{ color: 'white', fontSize: '16px', fontWeight: 500 }}>Click to view full screen</Text>
                    </Space>
                  ),
                }}
                placeholder={
                  <div style={{ padding: '60px' }}>
                    <Spin size="large" tip="Loading graph..." />
                  </div>
                }
              />
            </div>
          </Card>
        )}
      </Space>
    );
  };

  // Render: Circular Dependencies Results
  const renderCircularResults = () => {
    if (!circularResult) return null;

    if (circularResult.count === 0) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Space direction="vertical">
              <Text strong>No circular dependencies found!</Text>
              <Text type="secondary">Your codebase has a clean dependency tree.</Text>
            </Space>
          }
        />
      );
    }

    return (
      <List
        dataSource={circularResult.circular}
        renderItem={(item, index) => (
          <List.Item>
            <Card size="small" style={{ width: '100%' }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space>
                  <WarningOutlined style={{ color: '#faad14' }} />
                  <Text strong style={{ color: '#000', fontSize: '14px' }}>Circular Chain {index + 1}</Text>
                  <Tag color="orange">Length: {item.length}</Tag>
                </Space>
                <div style={{ paddingLeft: 20 }}>
                  {item.chain.map((file, i) => (
                    <div key={i}>
                      <Text code style={{ fontSize: '13px', color: '#000' }}>{file}</Text>
                      {i < item.chain.length - 1 && (
                        <Text type="secondary" style={{ margin: '0 8px', color: '#666' }}>
                          ↓
                        </Text>
                      )}
                    </div>
                  ))}
                </div>
              </Space>
            </Card>
          </List.Item>
        )}
      />
    );
  };

  // Render: Complex Modules Results
  const renderComplexResults = () => {
    if (!complexResult) return null;

    return (
      <List
        dataSource={complexResult.modules}
        renderItem={(item, index) => (
          <List.Item>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Space>
                <Tag color={index < 3 ? 'red' : index < 7 ? 'orange' : 'default'}>
                  #{index + 1}
                </Tag>
                <Text code style={{ maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '13px', color: '#000' }}>
                  {item.file}
                </Text>
              </Space>
              <Tag color="blue">{item.dependencies} dependencies</Tag>
            </Space>
          </List.Item>
        )}
      />
    );
  };

  // Render modal content
  const renderModalContent = () => {
    if (error) {
      return (
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
        />
      );
    }

    if (analysisResult) return renderFullAnalysis();
    if (circularResult) return renderCircularResults();
    if (complexResult) return renderComplexResults();

    return <Empty description="No results available" />;
  };

  return (
    <div style={style}>
      <Card
        title={
          <Space>
            <BranchesOutlined />
            <Text strong>Dependency Visualizations</Text>
          </Space>
        }
        size="small"
      >
        <Paragraph type="secondary">
          Analyze codebase dependencies, detect circular imports, and visualize module complexity.
        </Paragraph>

        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {/* Full Analysis Button */}
          <Tooltip title="Run comprehensive dependency analysis with graph generation">
            <Button
              type="primary"
              icon={<BranchesOutlined />}
              loading={loading}
              onClick={handleFullAnalysis}
              block
              size="large"
            >
              Analyze Dependencies
            </Button>
          </Tooltip>

          {/* Circular Dependencies Button */}
          <Tooltip title="Detect circular import chains that can cause issues">
            <Button
              icon={<WarningOutlined />}
              loading={loading}
              onClick={handleCircularAnalysis}
              block
              size="large"
              danger={circularResult ? circularResult.count > 0 : undefined}
            >
              Show Circular Dependencies
            </Button>
          </Tooltip>

          {/* Complex Modules Button */}
          <Tooltip title="Find modules with the highest number of dependencies">
            <Button
              icon={<ThunderboltOutlined />}
              loading={loading}
              onClick={handleComplexAnalysis}
              block
              size="large"
            >
              Complex Modules Analysis
            </Button>
          </Tooltip>
        </Space>

        <Divider />

        <Text type="secondary" style={{ fontSize: '12px' }}>
          Target: <Text code>{targetPath}</Text> | Extensions: <Text code>{extensions.join(', ')}</Text>
        </Text>
      </Card>

      {/* Results Modal */}
      <Modal
        title={<span style={{ fontSize: '18px', fontWeight: 500 }}>{modalTitle}</span>}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={[
          <Button key="close" size="large" onClick={() => setModalVisible(false)}>
            Close
          </Button>,
          !error && (
            <Button
              key="refresh"
              size="large"
              icon={<ReloadOutlined />}
              onClick={() => {
                setModalVisible(false);
                if (analysisResult) handleFullAnalysis();
                else if (circularResult) handleCircularAnalysis();
                else if (complexResult) handleComplexAnalysis();
              }}
            >
              Re-run Analysis
            </Button>
          ),
        ]}
        width="95%"
        style={{ top: 10, maxWidth: 1800 }}
        bodyStyle={{ 
          maxHeight: 'calc(100vh - 120px)', 
          overflow: 'auto',
          fontSize: '14px',
          padding: '24px'
        }}
      >
        {renderModalContent()}
      </Modal>
    </div>
  );
};

export default VisualizationPanel;
