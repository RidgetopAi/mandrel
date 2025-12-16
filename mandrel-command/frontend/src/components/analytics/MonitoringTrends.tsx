import React, { useMemo, useState } from 'react';
import { Card, Select, Button, Spin, Alert, Space, Statistic, Row, Col, Empty } from 'antd';
import { Line } from '@ant-design/plots';
import { usePerformanceTrendsQuery } from '../../hooks/useMonitoring';

const WINDOW_OPTIONS = [5, 15, 60] as const;

interface MonitoringTrendsProps {
  initialWindow?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

const MonitoringTrends: React.FC<MonitoringTrendsProps> = ({
  initialWindow = 15,
  autoRefresh = true,
  refreshInterval = 60_000,
  className,
}) => {
  const [windowMinutes, setWindowMinutes] = useState<number>(initialWindow);

  const trendsQuery = usePerformanceTrendsQuery(windowMinutes, {
    refetchInterval: autoRefresh ? refreshInterval : false,
    refetchOnWindowFocus: false,
  });

  const { data: trends, isLoading, isFetching, error, refetch } = trendsQuery;

  const responseTimeData = useMemo(() => {
    const series = trends?.trends?.responseTime ?? [];
    if (!Array.isArray(series) || series.length === 0) {
      return [];
    }

    const points = series.map((value, index) => ({
      index,
      time: `${index + 1}m`,
      value,
    }));

    return points;
  }, [trends]);

  const chartConfig = useMemo(() => ({
    data: responseTimeData,
    xField: 'time',
    yField: 'value',
    smooth: true as const,
    animation: false,
    point: {
      size: 2,
    },
    tooltip: {
      showMarkers: false,
    },
  }), [responseTimeData]);

  if (isLoading && !trends) {
    return (
      <Card className={className} title="Performance Trends">
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Loading performance trends...</div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className} title="Performance Trends">
        <Alert
          type="error"
          message="Failed to load performance trends"
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
      title="Performance Trends"
      extra={
        <Space>
          <Select
            size="small"
            value={windowMinutes}
            onChange={(value) => setWindowMinutes(value)}
          >
            {WINDOW_OPTIONS.map((option) => (
              <Select.Option key={option} value={option}>
                Last {option}m
              </Select.Option>
            ))}
          </Select>
          <Button size="small" onClick={() => refetch()} loading={isFetching}>
            Refresh
          </Button>
        </Space>
      }
    >
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Statistic
            title="Error Rate"
            value={trends?.trends?.errorRate ?? 0}
            suffix="%"
            precision={2}
          />
        </Col>
        <Col span={12}>
          <Statistic
            title="Request Volume"
            value={trends?.trends?.requestVolume ?? 0}
          />
        </Col>
      </Row>

      {responseTimeData.length === 0 ? (
        <Empty description="No response time data available for this window" />
      ) : (
        <Line {...chartConfig} />
      )}

      {autoRefresh && (
        <div style={{ marginTop: 12 }}>
          <small style={{ color: 'rgba(0,0,0,0.45)' }}>
            Auto-refresh every {Math.round(refreshInterval / 1000)}s
          </small>
        </div>
      )}
    </Card>
  );
};

export default MonitoringTrends;
