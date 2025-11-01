import React, { useMemo } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Alert,
  Spin,
  Button,
  Space,
  Progress,
  Typography,
  List,
  Tag,
} from 'antd';
import { Column, Line } from '@ant-design/plots';
import { ReloadOutlined } from '@ant-design/icons';
import { useProjectContext } from '../../contexts/ProjectContext';
import { useEmbeddingRelevanceQuery } from '../../hooks/useEmbeddings';

const { Text } = Typography;

const RelevanceDashboard: React.FC = () => {
  const { currentProject } = useProjectContext();
  const projectId = currentProject?.id;

  const relevanceQuery = useEmbeddingRelevanceQuery(projectId, {
    enabled: Boolean(projectId),
    refetchOnWindowFocus: false,
  });

  const loading = relevanceQuery.isLoading;
  const fetching = relevanceQuery.isFetching;
  const error = relevanceQuery.error as Error | null;
  const metrics = relevanceQuery.data ?? null;

  const distributionData = useMemo(() => {
    if (!metrics) {
      return [];
    }
    return metrics.distribution.map(bucket => ({
      range: bucket.range,
      count: bucket.count,
      percentage: Number((bucket.percentage * 100).toFixed(1)),
    }));
  }, [metrics]);

  const trendData = useMemo(() => {
    if (!metrics) {
      return [];
    }

    return metrics.trend.map(point => ({
      date: point.date,
      averageScore: Number(point.averageScore.toFixed(2)),
      sampleSize: point.sampleSize,
    }));
  }, [metrics]);

  const coveragePercent = metrics ? Number((metrics.coverageRate * 100).toFixed(1)) : 0;
  const highConfidencePercent = metrics ? Number((metrics.highConfidenceRate * 100).toFixed(1)) : 0;
  const lowConfidencePercent = metrics ? Number((metrics.lowConfidenceRate * 100).toFixed(1)) : 0;

  const distributionConfig = {
    data: distributionData,
    xField: 'range',
    yField: 'count',
    columnWidthRatio: 0.6,
    meta: {
      range: { alias: 'Score Bucket' },
      count: { alias: 'Contexts' },
    },
    tooltip: {
      formatter: (datum: { range: string; count: number; percentage: number }) => ({
        name: 'Contexts',
        value: `${datum.count} (${(datum.percentage || 0).toFixed(1)}%)`,
      }),
    },
    label: {
      position: 'top' as const,
      formatter: (datum: { percentage: number }) => `${(datum.percentage || 0).toFixed(1)}%`,
      style: { fill: '#6a6a6a' },
    },
  };

  const trendConfig = {
    data: trendData,
    xField: 'date',
    yField: 'averageScore',
    smooth: true,
    meta: {
      date: { alias: 'Date' },
      averageScore: { alias: 'Average Score' },
    },
    tooltip: {
      formatter: (datum: { date: string; averageScore: number; sampleSize: number }) => ({
        name: `Avg Score (${datum.sampleSize || 0} contexts)`,
        value: (datum.averageScore || 0).toFixed(2),
      }),
    },
    yAxis: {
      min: 0,
      max: 10,
    },
  };

  const handleRefresh = () => {
    void relevanceQuery.refetch();
  };

  if (!projectId) {
    return (
      <Card title="Relevance Dashboard">
        <Alert
          message="Select a project"
          description="Choose a project to review relevance analytics."
          type="info"
          showIcon
        />
      </Card>
    );
  }

  if (loading && !metrics) {
    return (
      <Card title="Relevance Dashboard">
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Loading relevance metrics...</div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="Relevance Dashboard">
        <Alert
          message="Error"
          description={error.message}
          type="error"
          showIcon
        />
        <Button onClick={handleRefresh} style={{ marginTop: 16 }} icon={<ReloadOutlined />}>
          Retry
        </Button>
      </Card>
    );
  }

  if (!metrics || metrics.totalContexts === 0) {
    return (
      <Card
        title="Relevance Dashboard"
        extra={
          <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={fetching}>
            Refresh
          </Button>
        }
      >
        <Alert
          message="No relevance data yet"
          description="This project does not have any contexts with a recorded relevance score. Add scores from the Contexts page to populate the dashboard."
          type="info"
          showIcon
        />
      </Card>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Row gutter={16}>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic title="Contexts (scored)" value={metrics.scoredContexts} suffix={`of ${metrics.totalContexts}`} />
            <Progress
              percent={coveragePercent}
              format={(percent) => `${percent?.toFixed(1)}%`
              }
              strokeColor="#722ed1"
            />
            <Text type="secondary">Coverage of contexts with relevance scores</Text>
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic title="Average Score" value={metrics.averageScore} precision={2} suffix="/ 10" />
            <Text type="secondary">Median {(metrics.medianScore || 0).toFixed(2)} • Range {(metrics.minScore || 0).toFixed(1)} - {(metrics.maxScore || 0).toFixed(1)}</Text>
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic title="High Confidence" value={highConfidencePercent} precision={1} suffix="%" />
            <Progress percent={highConfidencePercent} showInfo={false} strokeColor="#52c41a" size="small" style={{ marginTop: 12 }} />
            <Text type="secondary">Score ≥ 8</Text>
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic title="Low Confidence" value={lowConfidencePercent} precision={1} suffix="%" />
            <Progress percent={lowConfidencePercent} showInfo={false} strokeColor="#ff4d4f" size="small" style={{ marginTop: 12 }} />
            <Text type="secondary">Score &lt; 5</Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card
            title="Score Distribution"
            bordered={false}
            extra={
              <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={fetching}>
                Refresh
              </Button>
            }
          >
            {distributionData.length > 0 ? (
              <Column {...distributionConfig} height={320} />
            ) : (
              <Alert
                message="No scored contexts"
                description="Once contexts have relevance scores, distribution insights will appear here."
                type="info"
                showIcon
              />
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card
            title="30-Day Trend"
            bordered={false}
            extra={
              <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={fetching}>
                Refresh
              </Button>
            }
          >
            {trendData.length > 0 ? (
              <Line {...trendConfig} height={320} />
            ) : (
              <Alert
                message="No recent activity"
                description="Relevance scores haven’t been updated in the last 30 days."
                type="info"
                showIcon
              />
            )}
          </Card>
        </Col>
      </Row>

      <Card title="Top Tags by Relevance" bordered={false}>
        {metrics.topTags.length > 0 ? (
          <List
            dataSource={metrics.topTags}
            renderItem={(item) => (
              <List.Item>
                <Space size="large">
                  <Tag color="processing">{item.tag}</Tag>
                  <Text strong>{(item.averageScore || 0).toFixed(2)}</Text>
                  <Text type="secondary">{item.count} contexts</Text>
                </Space>
              </List.Item>
            )}
          />
        ) : (
          <Alert
            message="No tags scored yet"
            description="Tag contexts and record relevance scores to surface focus areas."
            type="info"
            showIcon
          />
        )}
      </Card>
    </Space>
  );
};

export default RelevanceDashboard;
