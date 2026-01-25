import React from 'react';
import { Typography, Tabs, Card, Space, Alert } from 'antd';
import {
  HeatMapOutlined,
  DotChartOutlined,
  GroupOutlined,
  ThunderboltOutlined,
  BarChartOutlined,
  SettingOutlined,
  ClusterOutlined,
  AlertOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import { useEmbeddingStore } from '../stores/embeddingStore';
import SimilarityHeatmap from '../components/embedding/SimilarityHeatmap';
import ScatterProjection from '../components/embedding/ScatterProjection';
import ClusterAnalysis from '../components/embedding/ClusterAnalysis';
import QualityMetrics from '../components/embedding/QualityMetrics';
import ProjectRelationshipMap from '../components/embedding/ProjectRelationshipMap';
import KnowledgeGapInsights from '../components/embedding/KnowledgeGapInsights';
import UsagePatterns from '../components/embedding/UsagePatterns';

const { Title, Text } = Typography;

const Embedding: React.FC = () => {
  const { activeTab, setActiveTab } = useEmbeddingStore();

  const tabItems = [
    {
      key: 'heatmap',
      label: (
        <Space>
          <HeatMapOutlined />
          Similarity Heatmap
        </Space>
      ),
      children: <SimilarityHeatmap />,
    },
    {
      key: 'scatter',
      label: (
        <Space>
          <DotChartOutlined />
          2D Projection
        </Space>
      ),
      children: <ScatterProjection />,
    },
    {
      key: 'cluster',
      label: (
        <Space>
          <GroupOutlined />
          Clustering
        </Space>
      ),
      children: <ClusterAnalysis />,
    },
    {
      key: 'relationships',
      label: (
        <Space>
          <ClusterOutlined />
          Relationships
        </Space>
      ),
      children: <ProjectRelationshipMap />,
    },
    {
      key: 'knowledge',
      label: (
        <Space>
          <AlertOutlined />
          Knowledge Gaps
        </Space>
      ),
      children: <KnowledgeGapInsights />,
    },
    {
      key: 'usage',
      label: (
        <Space>
          <LineChartOutlined />
          Usage Patterns
        </Space>
      ),
      children: <UsagePatterns />,
    },
    {
      key: '3d',
      label: (
        <Space>
          <ThunderboltOutlined />
          3D View
        </Space>
      ),
      children: (
        <Card title="3D Embedding Space" bordered={false}>
          <Alert
            message="Phase 4: 3D Toggle with Plotly"
            description="Interactive 3D visualization using react-plotly.js for immersive exploration."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Text type="secondary">
            Explore embeddings in 3D space with interactive rotation, zoom, and hover details
            for a more immersive understanding of the embedding space.
          </Text>
        </Card>
      ),
    },
    {
      key: 'metrics',
      label: (
        <Space>
          <BarChartOutlined />
          Metrics
        </Space>
      ),
      children: <QualityMetrics />,
    },
    {
      key: 'settings',
      label: (
        <Space>
          <SettingOutlined />
          Settings
        </Space>
      ),
      children: (
        <Card title="Visualization Settings" bordered={false}>
          <Alert
            message="Phase 6: Performance & Polish"
            description="Configuration options, performance optimizations, and export capabilities."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Text type="secondary">
            Configure visualization parameters, performance settings, 
            and export options for sharing insights.
          </Text>
        </Card>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={2}>Embedding Visualization System</Title>
        <Text type="secondary">
          Interactive visualization and analysis of embedding vectors from your AIDIS context data.
          Explore similarities, clusters, and patterns in high-dimensional space.
        </Text>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size="large"
        tabPosition="top"
      />
    </div>
  );
};

export default Embedding;
