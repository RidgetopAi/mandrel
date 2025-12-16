import React from 'react';
import { Card, List, Tag, Typography, Spin, Alert, Button, Empty, Space } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useMonitoringAlertsQuery } from '../../hooks/useMonitoring';
import type { MonitoringAlert } from '../../api/monitoringClient';

const { Text } = Typography;

type Severity = 'critical' | 'warning' | 'info';

const severityColors: Record<Severity, string> = {
  critical: 'error',
  warning: 'warning',
  info: 'processing',
};

interface MonitoringAlertsProps {
  limit?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

const formatTimestamp = (timestamp: string) => {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return timestamp;
  }
};

const MonitoringAlerts: React.FC<MonitoringAlertsProps> = ({
  limit = 10,
  autoRefresh = true,
  refreshInterval = 60_000,
  className,
}) => {
  const alertsQuery = useMonitoringAlertsQuery(limit, {
    refetchInterval: autoRefresh ? refreshInterval : false,
    refetchOnWindowFocus: false,
  });

  const { data: alerts, isLoading, isFetching, error, refetch } = alertsQuery;

  if (isLoading && !alerts) {
    return (
      <Card className={className} title="Recent Alerts">
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Loading monitoring alerts...</div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className} title="Recent Alerts">
        <Alert
          type="error"
          message="Failed to load monitoring alerts"
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

  const items = alerts ?? [];

  return (
    <Card
      className={className}
      title={
        <Space>
          <BellOutlined />
          <span>Recent Alerts</span>
        </Space>
      }
      extra={
        <Button size="small" onClick={() => refetch()} loading={isFetching}>
          Refresh
        </Button>
      }
    >
      {items.length === 0 ? (
        <Empty description="No alerts in the selected window" />
      ) : (
        <List
          size="small"
          dataSource={items}
          renderItem={(alert: MonitoringAlert) => {
            const severity = alert.rule?.severity ?? 'info';
            const color = severityColors[severity] ?? 'default';

            return (
              <List.Item>
                <List.Item.Meta
                  title={
                    <Space>
                      <Tag color={color}>{severity.toUpperCase()}</Tag>
                      <Text strong>{alert.rule?.service ?? 'Unknown Service'}</Text>
                      <Text type="secondary">{alert.rule?.metric ?? 'metric'}</Text>
                    </Space>
                  }
                  description={
                    <div>
                      <Text>
                        Threshold {alert.rule?.operator ?? 'gt'} {alert.rule?.threshold ?? 'N/A'} • Value {alert.value}
                      </Text>
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Triggered {formatTimestamp(alert.timestamp)}
                        </Text>
                      </div>
                    </div>
                  }
                />
              </List.Item>
            );
          }}
        />
      )}

      {autoRefresh && (
        <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginTop: 12 }}>
          Auto-refresh every {Math.round(refreshInterval / 1000)}s
        </Text>
      )}
    </Card>
  );
};

export default MonitoringAlerts;
