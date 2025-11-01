import React from 'react';
import { Card, Statistic, Row, Col, Spin, Alert, Button, Space, Typography, Tooltip } from 'antd';
import { CheckCircleOutlined, WarningOutlined, CloseCircleOutlined, BarChartOutlined } from '@ant-design/icons';
import { useMonitoringStatsQuery } from '../../hooks/useMonitoring';

const { Text } = Typography;

interface MonitoringStatsProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

const MonitoringStats: React.FC<MonitoringStatsProps> = ({
  autoRefresh = true,
  refreshInterval = 60_000,
  className,
}) => {
  const statsQuery = useMonitoringStatsQuery({
    refetchInterval: autoRefresh ? refreshInterval : false,
    refetchOnWindowFocus: false,
  });

  const { data: stats, isLoading, isFetching, error, refetch } = statsQuery;

  if (isLoading && !stats) {
    return (
      <Card className={className} title="Monitoring Overview">
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Loading monitoring statistics...</div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className} title="Monitoring Overview">
        <Alert
          type="error"
          message="Failed to load monitoring statistics"
          description={(error as Error).message}
          action={
            <Button size="small" onClick={() => refetch()} loading={isFetching}>
              Retry
            </Button>
          }
          showIcon
        />
      </Card>
    );
  }

  return (
    <Card
      className={className}
      title="Monitoring Overview"
      extra={
        <Button size="small" onClick={() => refetch()} loading={isFetching}>
          Refresh
        </Button>
      }
    >
      <Row gutter={[16, 16]}>
        <Col span={12}>
          <Statistic
            title="Total Services"
            value={stats?.totalServices ?? 0}
            prefix={<BarChartOutlined style={{ color: '#1890ff' }} />}
          />
        </Col>
        <Col span={12}>
          <Statistic
            title="SLA Compliance"
            value={stats?.slaCompliance ?? 0}
            suffix="%"
            precision={1}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={8}>
          <Statistic
            title="Healthy"
            value={stats?.healthyServices ?? 0}
            prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
          />
        </Col>
        <Col span={8}>
          <Statistic
            title="Degraded"
            value={stats?.degradedServices ?? 0}
            prefix={<WarningOutlined style={{ color: '#fa8c16' }} />}
          />
        </Col>
        <Col span={8}>
          <Statistic
            title="Down"
            value={stats?.downServices ?? 0}
            prefix={<CloseCircleOutlined style={{ color: '#f5222d' }} />}
          />
        </Col>
      </Row>

      <Space direction="vertical" size={4} style={{ marginTop: 16 }}>
        <Tooltip title="Average response time across monitored services">
          <Text type="secondary">
            Avg Response Time: {(stats?.averageResponseTime ?? 0).toFixed(2)} ms
          </Text>
        </Tooltip>
        {stats?.lastUpdate && (
          <Text type="secondary" style={{ fontSize: '12px' }}>
            Last Update: {new Date(stats.lastUpdate).toLocaleString()}
            {autoRefresh && ` • Auto-refresh ${Math.round(refreshInterval / 1000)}s`}
          </Text>
        )}
      </Space>
    </Card>
  );
};

export default MonitoringStats;
