import React, { useMemo } from 'react';
import { Card, Alert, Spin, Button, Space, Typography, List } from 'antd';
import { Line, Column } from '@ant-design/plots';
import { ReloadOutlined } from '@ant-design/icons';
import { useProjectContext } from '../../contexts/ProjectContext';
import { useEmbeddingUsagePatternsQuery } from '../../hooks/useEmbeddings';

const { Text, Title } = Typography;

const UsagePatterns: React.FC = () => {
  const { currentProject } = useProjectContext();
  const projectId = currentProject?.id;

  const usageQuery = useEmbeddingUsagePatternsQuery(projectId, {
    enabled: Boolean(projectId),
    refetchOnWindowFocus: false,
  });

  const loading = usageQuery.isLoading;
  const fetching = usageQuery.isFetching;
  const error = usageQuery.error as Error | null;
  const usage = usageQuery.data ?? null;

  const handleRefresh = () => {
    void usageQuery.refetch();
  };

  const dailyConfig = useMemo(() => ({
    data: usage?.dailyActivity ?? [],
    xField: 'date',
    yField: 'contexts',
    height: 280,
    smooth: true,
    meta: {
      date: { alias: 'Date' },
      contexts: { alias: 'Contexts Created' },
    },
    yAxis: {
      min: 0,
    },
    tooltip: {
      title: (_: unknown, __: unknown, data: Record<string, unknown>) => String(data?.date ?? ''),
      formatter: (datum: Record<string, unknown>) => ({
        name: 'Contexts',
        value: datum.contexts ?? 0,
      }),
    },
  }), [usage?.dailyActivity]);

  const hourlyConfig = useMemo(() => ({
    data: usage?.hourlyDistribution ?? [],
    xField: 'hour',
    yField: 'contexts',
    columnWidthRatio: 0.6,
    height: 280,
    meta: {
      hour: { alias: 'Hour' },
      contexts: { alias: 'Contexts' },
    },
    tooltip: {
      title: (_: unknown, __: unknown, data: Record<string, unknown>) => `${data?.hour ?? 0}:00`,
      formatter: (datum: Record<string, unknown>) => ({
        name: 'Contexts',
        value: datum.contexts ?? 0,
      }),
    },
  }), [usage?.hourlyDistribution]);

  const typeConfig = useMemo(() => ({
    data: usage?.contextsByType ?? [],
    xField: 'type',
    yField: 'count',
    height: 280,
    columnWidthRatio: 0.6,
    meta: {
      type: { alias: 'Context Type' },
      count: { alias: 'Contexts' },
    },
    tooltip: {
      title: (_: unknown, __: unknown, data: Record<string, unknown>) =>
        String(data?.type ?? 'unknown').toUpperCase(),
      formatter: (datum: Record<string, unknown>) => {
        const percentage = Number(datum.percentage ?? 0);
        return {
          name: `${percentage.toFixed(1)}%`,
          value: datum.count ?? 0,
        };
      },
    },
  }), [usage?.contextsByType]);

  if (!projectId) {
    return (
      <Card title="Usage Patterns">
        <Alert
          message="Select a project"
          description="Choose a project to review activity trends."
          type="info"
          showIcon
        />
      </Card>
    );
  }

  if (loading && !usage) {
    return (
      <Card title="Usage Patterns">
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Loading usage analytics...</div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="Usage Patterns">
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

  if (!usage) {
    return null;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card bordered={false}>
        <Space size="large" align="start" wrap>
          <div>
            <Title level={4} style={{ marginBottom: 0 }}>
              {usage.summary.totalContexts} contexts captured overall
            </Title>
            <Text type="secondary">
              {usage.summary.contextsLast7Days} in last 7 days • {usage.summary.contextsLast30Days} in last 30 days
            </Text>
          </div>
          <div>
            <Text strong>{usage.summary.uniqueTags}</Text>
            <Text type="secondary"> active tags</Text>
          </div>
          <div>
            <Text type="secondary">
              Last context:{' '}
              {usage.summary.lastContextAt ? new Date(usage.summary.lastContextAt).toLocaleString() : 'N/A'}
            </Text>
          </div>
          <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={fetching}>
            Refresh
          </Button>
        </Space>
      </Card>

      <Card title="Daily Activity (30 days)" bordered={false}>
        {usage.dailyActivity.length > 0 ? (
          <Line {...dailyConfig} />
        ) : (
          <Alert
            message="No recent activity"
            description="Create contexts to populate daily activity insights."
            type="info"
            showIcon
          />
        )}
      </Card>

      <Card title="Activity by Hour" bordered={false}>
        {usage.hourlyDistribution.length > 0 ? (
          <Column {...hourlyConfig} />
        ) : (
          <Alert
            message="Insufficient data"
            description="Hourly breakdown requires recent context activity."
            type="info"
            showIcon
          />
        )}
      </Card>

      <Card title="Context Types" bordered={false}>
        {usage.contextsByType.length > 0 ? (
          <Column {...typeConfig} />
        ) : (
          <Alert
            message="No contexts captured"
            description="Add contexts to evaluate type distribution."
            type="info"
            showIcon
          />
        )}
      </Card>

      <Card title="Top Tags" bordered={false}>
        {usage.topTags.length > 0 ? (
          <List
            dataSource={usage.topTags}
            renderItem={item => (
              <List.Item>
                <Space size="large">
                  <Text strong>{item.tag}</Text>
                  <Text type="secondary">{item.count} contexts</Text>
                </Space>
              </List.Item>
            )}
          />
        ) : (
          <Alert
            message="No tag activity yet"
            description="Tag contexts to expose top themes for this project."
            type="info"
            showIcon
          />
        )}
      </Card>
    </Space>
  );
};

export default UsagePatterns;
