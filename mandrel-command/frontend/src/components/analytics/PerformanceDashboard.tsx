import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Progress,
  Space,
  Typography,
  Button,
  Badge,
  Alert,
  Tooltip,
  Tabs,
  Table,
  Tag,
  Switch,
  Select,
  Divider
} from 'antd';
import {
  ThunderboltOutlined,
  DatabaseOutlined,
  ClockCircleOutlined,
  HddOutlined as MemoryStickOutlined,
  CloudDownloadOutlined,
  ReloadOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  TrophyOutlined
} from '@ant-design/icons';
import {
  performanceCache,
  getCacheStats,
  getPerformanceMetrics,
  clearCache,
  warmCache,
  type CacheStats,
  type PerformanceMetrics
} from '../../services/performanceCache';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

interface PerformanceDashboardProps {
  className?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({
  className,
  autoRefresh = true,
  refreshInterval = 5000
}) => {
  const [stats, setStats] = useState<CacheStats>(getCacheStats());
  const [metrics, setMetrics] = useState<PerformanceMetrics>(getPerformanceMetrics());
  const [isAutoRefresh, setIsAutoRefresh] = useState(autoRefresh);
  const [optimizationMode, setOptimizationMode] = useState<'balanced' | 'performance' | 'memory'>('balanced');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Auto-refresh effect
  useEffect(() => {
    if (isAutoRefresh) {
      const interval = setInterval(() => {
        setStats(getCacheStats());
        setMetrics(getPerformanceMetrics());
        setLastRefresh(new Date());
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  }, [isAutoRefresh, refreshInterval]);

  const handleRefresh = () => {
    setStats(getCacheStats());
    setMetrics(getPerformanceMetrics());
    setLastRefresh(new Date());
  };

  const handleClearCache = () => {
    clearCache();
    handleRefresh();
  };

  const handleWarmCache = async () => {
    await warmCache({
      mostUsed: true,
      predictive: true,
      scheduled: false
    });
    handleRefresh();
  };

  const getHealthColor = (value: number, thresholds: { good: number; warning: number }) => {
    if (value >= thresholds.good) return '#52c41a';
    if (value >= thresholds.warning) return '#faad14';
    return '#f5222d';
  };

  const getHealthStatus = (value: number, thresholds: { good: number; warning: number }) => {
    if (value >= thresholds.good) return 'success';
    if (value >= thresholds.warning) return 'warning';
    return 'error';
  };

  const renderOverviewCards = () => (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} md={6}>
        <Card size="small">
          <Statistic
            title="Cache Hit Rate"
            value={stats.hitRate}
            suffix="%"
            valueStyle={{
              color: getHealthColor(stats.hitRate, { good: 80, warning: 60 })
            }}
            prefix={<DatabaseOutlined />}
          />
          <Progress
            percent={stats.hitRate}
            size="small"
            strokeColor={getHealthColor(stats.hitRate, { good: 80, warning: 60 })}
            showInfo={false}
          />
        </Card>
      </Col>

      <Col xs={24} sm={12} md={6}>
        <Card size="small">
          <Statistic
            title="Avg Response Time"
            value={stats.avgResponseTime}
            suffix="ms"
            valueStyle={{
              color: getHealthColor(500 - stats.avgResponseTime, { good: 400, warning: 200 })
            }}
            prefix={<ThunderboltOutlined />}
          />
          <Progress
            percent={Math.min(100, (500 - stats.avgResponseTime) / 5)}
            size="small"
            strokeColor={getHealthColor(500 - stats.avgResponseTime, { good: 400, warning: 200 })}
            showInfo={false}
          />
        </Card>
      </Col>

      <Col xs={24} sm={12} md={6}>
        <Card size="small">
          <Statistic
            title="Memory Usage"
            value={stats.memoryUsage}
            suffix="%"
            valueStyle={{
              color: getHealthColor(100 - stats.memoryUsage, { good: 50, warning: 25 })
            }}
            prefix={<MemoryStickOutlined />}
          />
          <Progress
            percent={stats.memoryUsage}
            size="small"
            strokeColor={getHealthColor(100 - stats.memoryUsage, { good: 50, warning: 25 })}
            showInfo={false}
          />
        </Card>
      </Col>

      <Col xs={24} sm={12} md={6}>
        <Card size="small">
          <Statistic
            title="Cache Entries"
            value={stats.totalEntries}
            valueStyle={{
              color: stats.totalEntries > 500 ? '#faad14' : '#52c41a'
            }}
            prefix={<CloudDownloadOutlined />}
          />
          <div style={{ fontSize: '12px', color: '#666', marginTop: 4 }}>
            Size: {(stats.totalSize / 1024 / 1024).toFixed(2)} MB
          </div>
        </Card>
      </Col>
    </Row>
  );

  const renderPerformanceMetrics = () => (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={12}>
        <Card title="Render Performance" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text>Render Time:</Text>
              <Badge
                count={`${metrics.renderTime.toFixed(1)}ms`}
                style={{
                  backgroundColor: getHealthColor(100 - metrics.renderTime, { good: 80, warning: 50 })
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text>Component Mount:</Text>
              <Badge
                count={`${metrics.componentMountTime.toFixed(1)}ms`}
                style={{
                  backgroundColor: getHealthColor(100 - metrics.componentMountTime, { good: 80, warning: 50 })
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text>Data Processing:</Text>
              <Badge
                count={`${metrics.dataProcessingTime.toFixed(1)}ms`}
                style={{
                  backgroundColor: getHealthColor(100 - metrics.dataProcessingTime, { good: 80, warning: 50 })
                }}
              />
            </div>
          </Space>
        </Card>
      </Col>

      <Col xs={24} md={12}>
        <Card title="Network Performance" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text>API Response:</Text>
              <Badge
                count={`${metrics.apiResponseTime.toFixed(1)}ms`}
                style={{
                  backgroundColor: getHealthColor(1000 - metrics.apiResponseTime, { good: 700, warning: 400 })
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text>Network Latency:</Text>
              <Badge
                count={`${metrics.networkLatency.toFixed(1)}ms`}
                style={{
                  backgroundColor: getHealthColor(500 - metrics.networkLatency, { good: 300, warning: 150 })
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text>Error Rate:</Text>
              <Badge
                count={`${metrics.errorRate.toFixed(1)}%`}
                style={{
                  backgroundColor: getHealthColor(100 - metrics.errorRate, { good: 95, warning: 85 })
                }}
              />
            </div>
          </Space>
        </Card>
      </Col>
    </Row>
  );

  const renderCacheDetails = () => {
    const cacheKeys = performanceCache.keys();

    const columns = [
      {
        title: 'Cache Key',
        dataIndex: 'key',
        key: 'key',
        ellipsis: true,
        render: (text: string) => (
          <Tooltip title={text}>
            <Text code style={{ fontSize: '11px' }}>{text}</Text>
          </Tooltip>
        )
      },
      {
        title: 'Size',
        dataIndex: 'size',
        key: 'size',
        width: 80,
        render: (size: number) => `${(size / 1024).toFixed(1)}KB`
      },
      {
        title: 'TTL',
        dataIndex: 'ttl',
        key: 'ttl',
        width: 80,
        render: (ttl: number) => `${Math.round(ttl / 1000)}s`
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        width: 80,
        render: (status: string) => (
          <Tag color={status === 'valid' ? 'green' : status === 'expired' ? 'red' : 'orange'}>
            {status}
          </Tag>
        )
      }
    ];

    const data = cacheKeys.slice(0, 10).map(key => ({
      key,
      size: Math.random() * 10000, // Mock data - would come from actual cache
      ttl: Math.random() * 300000,
      status: Math.random() > 0.8 ? 'expired' : Math.random() > 0.9 ? 'expiring' : 'valid'
    }));

    return (
      <Table
        columns={columns}
        dataSource={data}
        size="small"
        pagination={false}
        scroll={{ y: 300 }}
      />
    );
  };

  const renderOptimizationControls = () => (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Row gutter={[16, 8]} align="middle">
        <Col span={8}>
          <Text strong>Optimization Mode:</Text>
        </Col>
        <Col span={16}>
          <Select
            value={optimizationMode}
            onChange={setOptimizationMode}
            style={{ width: '100%' }}
          >
            <Select.Option value="balanced">Balanced</Select.Option>
            <Select.Option value="performance">Performance</Select.Option>
            <Select.Option value="memory">Memory Efficient</Select.Option>
          </Select>
        </Col>
      </Row>

      <Row gutter={[16, 8]} align="middle">
        <Col span={8}>
          <Text strong>Auto Refresh:</Text>
        </Col>
        <Col span={16}>
          <Switch
            checked={isAutoRefresh}
            onChange={setIsAutoRefresh}
            checkedChildren="ON"
            unCheckedChildren="OFF"
          />
        </Col>
      </Row>

      <Divider style={{ margin: '12px 0' }} />

      <Space>
        <Button
          size="small"
          icon={<CloudDownloadOutlined />}
          onClick={handleWarmCache}
        >
          Warm Cache
        </Button>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={handleClearCache}
          danger
        >
          Clear Cache
        </Button>
      </Space>
    </Space>
  );

  const renderHealthAlerts = () => {
    const alerts = [];

    if (stats.hitRate < 60) {
      alerts.push({
        type: 'warning',
        message: 'Low cache hit rate detected. Consider adjusting TTL values or cache warming strategies.'
      });
    }

    if (stats.memoryUsage > 80) {
      alerts.push({
        type: 'error',
        message: 'High memory usage. Cache eviction may be affecting performance.'
      });
    }

    if (metrics.apiResponseTime > 1000) {
      alerts.push({
        type: 'warning',
        message: 'Slow API responses detected. Check network connectivity or backend performance.'
      });
    }

    if (metrics.errorRate > 5) {
      alerts.push({
        type: 'error',
        message: 'High error rate detected. Review error logs for potential issues.'
      });
    }

    if (alerts.length === 0) {
      return (
        <Alert
          message="System Performance Excellent"
          description="All performance metrics are within optimal ranges."
          type="success"
          showIcon
          icon={<TrophyOutlined />}
        />
      );
    }

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        {alerts.map((alert, index) => (
          <Alert
            key={index}
            message="Performance Alert"
            description={alert.message}
            type={alert.type as any}
            showIcon
            closable
          />
        ))}
      </Space>
    );
  };

  return (
    <Card
      className={className}
      title={
        <Space>
          <ThunderboltOutlined />
          <span>Performance Dashboard</span>
          <Badge
            status={
              stats.hitRate > 80 && stats.memoryUsage < 80 && metrics.errorRate < 2
                ? 'success'
                : 'warning'
            }
            text={
              stats.hitRate > 80 && stats.memoryUsage < 80 && metrics.errorRate < 2
                ? 'Optimal'
                : 'Needs Attention'
            }
          />
        </Space>
      }
      extra={
        <Space>
          <Tooltip title={`Last refresh: ${lastRefresh.toLocaleTimeString()}`}>
            <Text type="secondary" style={{ fontSize: '11px' }}>
              {lastRefresh.toLocaleTimeString()}
            </Text>
          </Tooltip>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
          >
            Refresh
          </Button>
        </Space>
      }
    >
      <Tabs defaultActiveKey="overview">
        <TabPane tab="Overview" key="overview">
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {renderOverviewCards()}
            {renderHealthAlerts()}
          </Space>
        </TabPane>

        <TabPane tab="Metrics" key="metrics">
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {renderPerformanceMetrics()}

            <Card title="Cache Statistics" size="small">
              <Row gutter={[16, 8]}>
                <Col xs={12} sm={6}>
                  <Statistic
                    title="Total Hits"
                    value={stats.totalHits}
                    prefix={<CheckCircleOutlined />}
                    valueStyle={{ color: '#52c41a' }}
                  />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic
                    title="Total Misses"
                    value={stats.totalMisses}
                    prefix={<CloseCircleOutlined />}
                    valueStyle={{ color: '#f5222d' }}
                  />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic
                    title="Evictions"
                    value={stats.evictionCount}
                    prefix={<WarningOutlined />}
                    valueStyle={{ color: '#faad14' }}
                  />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic
                    title="Compression"
                    value={stats.compressionRatio}
                    suffix="%"
                    prefix={<DatabaseOutlined />}
                    valueStyle={{ color: '#1890ff' }}
                  />
                </Col>
              </Row>
            </Card>
          </Space>
        </TabPane>

        <TabPane tab="Cache Details" key="cache">
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Title level={5}>Active Cache Entries ({stats.totalEntries})</Title>
            {renderCacheDetails()}
          </Space>
        </TabPane>

        <TabPane tab="Settings" key="settings">
          <Card title="Optimization Settings" size="small">
            {renderOptimizationControls()}
          </Card>
        </TabPane>
      </Tabs>
    </Card>
  );
};

export default PerformanceDashboard;