import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Badge,
  Alert,
  Timeline,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Progress,
  Tooltip,
  Modal,
  Tabs,
  List,
  Switch,
  Select,
  Divider
} from 'antd';
import {
  BugOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
  SettingOutlined,
  EyeOutlined,
  ClearOutlined,
  SafetyOutlined,
  ApiOutlined,
  CommentOutlined,
  ClockCircleOutlined,
  FireOutlined
} from '@ant-design/icons';
// TODO: Import real mockErrorResilienceSystem when available
// import {
//   mockErrorResilienceSystem,
//   type ErrorReport,
//   type CircuitBreakerState
// } from '../../services/mockErrorResilienceSystem';

// Mock types and service for now
type ErrorReport = {
  id: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  component: string;
  stack?: string;
  type: string;
  resolved?: boolean;
  url?: string;
  userAgent?: string;
  retryCount?: number;
  firstOccurrence?: string;
  fallbackUsed?: boolean;
};

type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

const mockErrorResilienceSystem = {
  getRecentErrors: () => [] as ErrorReport[],
  getSystemHealth: () => ({ status: 'healthy', details: { errorRate: 0, criticalErrors: 0, circuitBreakers: { open: 0, total: 1 }, lastError: null } }),
  getCircuitBreakerState: () => 'CLOSED' as CircuitBreakerState,
  getMetrics: () => ({ totalErrors: 0, errorRate: 0, responseTime: 100 }),
  getErrorStats: () => ({
    totalErrors: 0,
    errorRate: 0,
    criticalErrors: 0,
    resolvedErrors: 0,
    unresolved: 0,
    byType: { network: 0, api: 0, component: 0, render: 0 },
    bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
    recentErrors: [] as ErrorReport[]
  }),
  getCircuitBreakerStatus: () => [{ status: 'CLOSED', failures: 0, name: 'default', state: 'CLOSED' as CircuitBreakerState, key: 'default' }],
  addErrorListener: (callback: (error: ErrorReport) => void) => {},
  removeErrorListener: (callback: (error: ErrorReport) => void) => {},
  clearErrors: () => {},
  clearOldErrors: () => 0,
  markErrorResolved: (errorId: string) => {},
  resolveError: (errorId: string) => {}
};

const { Title, Text } = Typography;
const { TabPane } = Tabs;

interface ErrorMonitoringDashboardProps {
  className?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

const ErrorMonitoringDashboard: React.FC<ErrorMonitoringDashboardProps> = ({
  className,
  autoRefresh = true,
  refreshInterval = 10000
}) => {
  const [errorStats, setErrorStats] = useState(mockErrorResilienceSystem.getErrorStats());
  const [systemHealth, setSystemHealth] = useState(mockErrorResilienceSystem.getSystemHealth());
  const [circuitBreakers, setCircuitBreakers] = useState(mockErrorResilienceSystem.getCircuitBreakerStatus());
  const [selectedError, setSelectedError] = useState<ErrorReport | null>(null);
  const [errorDetailVisible, setErrorDetailVisible] = useState(false);
  const [isAutoRefresh, setIsAutoRefresh] = useState(autoRefresh);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [filters, setFilters] = useState({
    type: 'all',
    severity: 'all',
    resolved: 'all'
  });

  // Auto-refresh effect
  useEffect(() => {
    if (isAutoRefresh) {
      const interval = setInterval(() => {
        refreshData();
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  }, [isAutoRefresh, refreshInterval]);

  // Error listener effect
  useEffect(() => {
    const handleNewError = (error: ErrorReport) => {
      refreshData();
    };

    mockErrorResilienceSystem.addErrorListener(handleNewError);

    return () => {
      mockErrorResilienceSystem.removeErrorListener(handleNewError);
    };
  }, []);

  const refreshData = () => {
    setErrorStats(mockErrorResilienceSystem.getErrorStats());
    setSystemHealth(mockErrorResilienceSystem.getSystemHealth());
    setCircuitBreakers(mockErrorResilienceSystem.getCircuitBreakerStatus());
    setLastRefresh(new Date());
  };

  const handleResolveError = (errorId: string) => {
    mockErrorResilienceSystem.resolveError(errorId);
    refreshData();
  };

  const handleClearOldErrors = () => {
    const cleared = mockErrorResilienceSystem.clearOldErrors();
    refreshData();

    Modal.success({
      title: 'Errors Cleared',
      content: `Cleared ${cleared} old error reports.`
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#f5222d';
      case 'high': return '#fa8c16';
      case 'medium': return '#faad14';
      case 'low': return '#52c41a';
      default: return '#d9d9d9';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'network': return <ApiOutlined />;
      case 'api': return <ThunderboltOutlined />;
      case 'component': return <CommentOutlined />;
      case 'render': return <BugOutlined />;
      case 'memory': return <WarningOutlined />;
      case 'timeout': return <ClockCircleOutlined />;
      default: return <BugOutlined />;
    }
  };

  const getCircuitBreakerColor = (state: CircuitBreakerState) => {
    switch (state) {
      case 'CLOSED': return '#52c41a';
      case 'OPEN': return '#f5222d';
      case 'HALF_OPEN': return '#faad14';
      default: return '#d9d9d9';
    }
  };

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'healthy': return '#52c41a';
      case 'degraded': return '#faad14';
      case 'unhealthy': return '#f5222d';
      default: return '#d9d9d9';
    }
  };

  const renderOverviewStats = () => (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} md={6}>
        <Card size="small">
          <Statistic
            title="Total Errors"
            value={errorStats.totalErrors}
            prefix={<BugOutlined />}
            valueStyle={{
              color: errorStats.totalErrors > 50 ? '#f5222d' : errorStats.totalErrors > 20 ? '#faad14' : '#52c41a'
            }}
          />
        </Card>
      </Col>

      <Col xs={24} sm={12} md={6}>
        <Card size="small">
          <Statistic
            title="Unresolved"
            value={errorStats.unresolved}
            prefix={<CloseCircleOutlined />}
            valueStyle={{
              color: errorStats.unresolved > 10 ? '#f5222d' : errorStats.unresolved > 5 ? '#faad14' : '#52c41a'
            }}
          />
        </Card>
      </Col>

      <Col xs={24} sm={12} md={6}>
        <Card size="small">
          <Statistic
            title="System Health"
            value={systemHealth.status.toUpperCase()}
            prefix={
              systemHealth.status === 'healthy' ? <CheckCircleOutlined /> :
              systemHealth.status === 'degraded' ? <WarningOutlined /> : <CloseCircleOutlined />
            }
            valueStyle={{ color: getHealthColor(systemHealth.status) }}
          />
        </Card>
      </Col>

      <Col xs={24} sm={12} md={6}>
        <Card size="small">
          <Statistic
            title="Circuit Breakers"
            value={`${systemHealth.details.circuitBreakers.open}/${systemHealth.details.circuitBreakers.total}`}
            prefix={<SafetyOutlined />}
            valueStyle={{
              color: systemHealth.details.circuitBreakers.open > 0 ? '#f5222d' : '#52c41a'
            }}
          />
        </Card>
      </Col>
    </Row>
  );

  const renderErrorsByType = () => (
    <Row gutter={[8, 8]}>
      {Object.entries(errorStats.byType).map(([type, count]) => (
        <Col key={type} xs={12} sm={8} md={6}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Space direction="vertical" size="small">
              <div style={{ fontSize: '24px', color: getSeverityColor('medium') }}>
                {getTypeIcon(type)}
              </div>
              <Text strong>{count}</Text>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {type}
              </Text>
            </Space>
          </Card>
        </Col>
      ))}
    </Row>
  );

  const renderErrorsBySeverity = () => (
    <Row gutter={[8, 8]}>
      {Object.entries(errorStats.bySeverity).map(([severity, count]) => (
        <Col key={severity} xs={12} sm={6}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Space direction="vertical" size="small">
              <div style={{ fontSize: '18px', color: getSeverityColor(severity) }}>
                {severity === 'critical' ? <FireOutlined /> : <WarningOutlined />}
              </div>
              <Text strong style={{ color: getSeverityColor(severity) }}>
                {count}
              </Text>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {severity}
              </Text>
            </Space>
          </Card>
        </Col>
      ))}
    </Row>
  );

  const renderRecentErrors = () => {
    const filteredErrors = errorStats.recentErrors.filter(error => {
      if (filters.type !== 'all' && error.type !== filters.type) return false;
      if (filters.severity !== 'all' && error.severity !== filters.severity) return false;
      if (filters.resolved !== 'all') {
        if (filters.resolved === 'resolved' && !error.resolved) return false;
        if (filters.resolved === 'unresolved' && error.resolved) return false;
      }
      return true;
    });

    const columns = [
      {
        title: 'Time',
        dataIndex: 'timestamp',
        key: 'timestamp',
        width: 120,
        render: (timestamp: Date) => (
          <Text style={{ fontSize: '11px' }}>
            {timestamp.toLocaleTimeString()}
          </Text>
        )
      },
      {
        title: 'Type',
        dataIndex: 'type',
        key: 'type',
        width: 80,
        render: (type: string) => (
          <Tooltip title={type}>
            <Tag icon={getTypeIcon(type)} color="blue">
              {type}
            </Tag>
          </Tooltip>
        )
      },
      {
        title: 'Severity',
        dataIndex: 'severity',
        key: 'severity',
        width: 80,
        render: (severity: string) => (
          <Tag color={getSeverityColor(severity)}>
            {severity}
          </Tag>
        )
      },
      {
        title: 'Message',
        dataIndex: 'message',
        key: 'message',
        ellipsis: true,
        render: (message: string) => (
          <Tooltip title={message}>
            <Text style={{ fontSize: '12px' }}>{message}</Text>
          </Tooltip>
        )
      },
      {
        title: 'Component',
        dataIndex: ['context', 'component'],
        key: 'component',
        width: 100,
        render: (component: string) => (
          component ? (
            <Tag color="purple">{component}</Tag>
          ) : (
            <Text type="secondary" style={{ fontSize: '11px' }}>-</Text>
          )
        )
      },
      {
        title: 'Status',
        dataIndex: 'resolved',
        key: 'resolved',
        width: 80,
        render: (resolved: boolean) => (
          <Badge
            status={resolved ? 'success' : 'error'}
            text={resolved ? 'Resolved' : 'Active'}
          />
        )
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 120,
        render: (record: ErrorReport) => (
          <Space size="small">
            <Button
              type="link"
                           icon={<EyeOutlined />}
              onClick={() => {
                setSelectedError(record);
                setErrorDetailVisible(true);
              }}
            >
              View
            </Button>
            {!record.resolved && (
              <Button
                type="link"
                               onClick={() => handleResolveError(record.id)}
              >
                Resolve
              </Button>
            )}
          </Space>
        )
      }
    ];

    return (
      <div>
        <Row gutter={[16, 8]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={6}>
            <Select
              placeholder="Filter by type"
              value={filters.type}
              onChange={(value) => setFilters(prev => ({ ...prev, type: value }))}
              style={{ width: '100%' }}
                         >
              <Select.Option value="all">All Types</Select.Option>
              <Select.Option value="network">Network</Select.Option>
              <Select.Option value="api">API</Select.Option>
              <Select.Option value="component">Component</Select.Option>
              <Select.Option value="render">Render</Select.Option>
              <Select.Option value="memory">Memory</Select.Option>
              <Select.Option value="timeout">Timeout</Select.Option>
            </Select>
          </Col>
          <Col xs={24} sm={6}>
            <Select
              placeholder="Filter by severity"
              value={filters.severity}
              onChange={(value) => setFilters(prev => ({ ...prev, severity: value }))}
              style={{ width: '100%' }}
                         >
              <Select.Option value="all">All Severities</Select.Option>
              <Select.Option value="critical">Critical</Select.Option>
              <Select.Option value="high">High</Select.Option>
              <Select.Option value="medium">Medium</Select.Option>
              <Select.Option value="low">Low</Select.Option>
            </Select>
          </Col>
          <Col xs={24} sm={6}>
            <Select
              placeholder="Filter by status"
              value={filters.resolved}
              onChange={(value) => setFilters(prev => ({ ...prev, resolved: value }))}
              style={{ width: '100%' }}
                         >
              <Select.Option value="all">All Status</Select.Option>
              <Select.Option value="resolved">Resolved</Select.Option>
              <Select.Option value="unresolved">Unresolved</Select.Option>
            </Select>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={filteredErrors}
          rowKey="id"
                   pagination={false}
          scroll={{ y: 300 }}
        />
      </div>
    );
  };

  const renderCircuitBreakersStatus = () => (
    <List
           dataSource={circuitBreakers}
      renderItem={(breaker) => (
        <List.Item>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space>
              <Badge
                color={getCircuitBreakerColor(breaker.state)}
                text={breaker.key}
              />
            </Space>
            <Tag color={getCircuitBreakerColor(breaker.state)}>
              {breaker.state.toUpperCase()}
            </Tag>
          </Space>
        </List.Item>
      )}
      locale={{
        emptyText: (
          <div style={{ textAlign: 'center', padding: '24px' }}>
            <SafetyOutlined style={{ fontSize: '32px', color: '#d9d9d9' }} />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">No circuit breakers configured</Text>
            </div>
          </div>
        )
      }}
    />
  );

  const renderHealthAlerts = () => {
    const alerts = [];

    if (systemHealth.details.criticalErrors > 0) {
      alerts.push({
        type: 'error',
        message: `${systemHealth.details.criticalErrors} critical errors detected in the last 5 minutes.`
      });
    }

    if (systemHealth.details.errorRate > 20) {
      alerts.push({
        type: 'warning',
        message: `High error rate: ${systemHealth.details.errorRate} errors in the last 5 minutes.`
      });
    }

    if (systemHealth.details.circuitBreakers.open > 0) {
      alerts.push({
        type: 'warning',
        message: `${systemHealth.details.circuitBreakers.open} circuit breakers are open.`
      });
    }

    if (alerts.length === 0) {
      return (
        <Alert
          message="System Running Smoothly"
          description="No critical issues detected. All systems are operating normally."
          type="success"
          showIcon
        />
      );
    }

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        {alerts.map((alert, index) => (
          <Alert
            key={index}
            message="System Alert"
            description={alert.message}
            type={alert.type as any}
            showIcon
            closable
          />
        ))}
      </Space>
    );
  };

  const renderErrorDetailModal = () => (
    <Modal
      title={
        <Space>
          <BugOutlined />
          <span>Error Details</span>
          {selectedError && (
            <Tag color={getSeverityColor(selectedError.severity)}>
              {selectedError.severity}
            </Tag>
          )}
        </Space>
      }
      open={errorDetailVisible}
      onCancel={() => setErrorDetailVisible(false)}
      width={800}
      footer={[
        <Button key="close" onClick={() => setErrorDetailVisible(false)}>
          Close
        </Button>,
        selectedError && !selectedError.resolved && (
          <Button
            key="resolve"
            type="primary"
            onClick={() => {
              handleResolveError(selectedError.id);
              setErrorDetailVisible(false);
            }}
          >
            Mark as Resolved
          </Button>
        )
      ].filter(Boolean)}
    >
      {selectedError && (
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Card title="Error Information" size="small">
            <Row gutter={[16, 8]}>
              <Col span={12}>
                <Text strong>Type:</Text>
                <div style={{ marginTop: 4 }}>
                  <Tag icon={getTypeIcon(selectedError.type)} color="blue">
                    {selectedError.type}
                  </Tag>
                </div>
              </Col>
              <Col span={12}>
                <Text strong>Severity:</Text>
                <div style={{ marginTop: 4 }}>
                  <Tag color={getSeverityColor(selectedError.severity)}>
                    {selectedError.severity}
                  </Tag>
                </div>
              </Col>
              <Col span={24}>
                <Text strong>Message:</Text>
                <div style={{
                  marginTop: 4,
                  padding: '8px',
                  background: '#f5f5f5',
                  borderRadius: '4px'
                }}>
                  <Text code>{selectedError.message}</Text>
                </div>
              </Col>
            </Row>
          </Card>

          <Card title="Context" size="small">
            <Row gutter={[16, 8]}>
              <Col span={12}>
                <Text strong>Timestamp:</Text>
                <div style={{ marginTop: 4 }}>
                  <Text>{selectedError.timestamp}</Text>
                </div>
              </Col>
              <Col span={12}>
                <Text strong>Component:</Text>
                <div style={{ marginTop: 4 }}>
                  <Text>{selectedError.component || 'Unknown'}</Text>
                </div>
              </Col>
              {selectedError.url && (
                <Col span={24}>
                  <Text strong>URL:</Text>
                  <div style={{ marginTop: 4 }}>
                    <Text code style={{ fontSize: '11px' }}>
                      {selectedError.url}
                    </Text>
                  </div>
                </Col>
              )}
            </Row>
          </Card>

          {selectedError.stack && (
            <Card title="Stack Trace" size="small">
              <pre style={{
                fontSize: '10px',
                background: '#f5f5f5',
                padding: '8px',
                borderRadius: '4px',
                overflow: 'auto',
                maxHeight: '200px',
                margin: 0
              }}>
                {selectedError.stack}
              </pre>
            </Card>
          )}

          <Card title="Metrics" size="small">
            <Row gutter={16}>
              <Col span={8}>
                <Statistic
                  title="Retry Count"
                  value={selectedError.retryCount}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Fallback Used"
                  value={selectedError.fallbackUsed ? 'Yes' : 'No'}
                  valueStyle={{
                    color: selectedError.fallbackUsed ? '#faad14' : '#52c41a'
                  }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Status"
                  value={selectedError.resolved ? 'Resolved' : 'Active'}
                  valueStyle={{
                    color: selectedError.resolved ? '#52c41a' : '#f5222d'
                  }}
                />
              </Col>
            </Row>
          </Card>
        </Space>
      )}
    </Modal>
  );

  return (
    <Card
      className={className}
      title={
        <Space>
          <BugOutlined />
          <span>Error Monitoring Dashboard</span>
          <Badge
            status={
              systemHealth.status === 'healthy' ? 'success' :
              systemHealth.status === 'degraded' ? 'warning' : 'error'
            }
            text={systemHealth.status.toUpperCase()}
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
          <Switch
                       checked={isAutoRefresh}
            onChange={setIsAutoRefresh}
            checkedChildren="Auto"
            unCheckedChildren="Manual"
          />
          <Button size="small" icon={<ReloadOutlined />} onClick={refreshData}>
            Refresh
          </Button>
          <Button
                       icon={<ClearOutlined />}
            onClick={handleClearOldErrors}
          >
            Clear Old
          </Button>
        </Space>
      }
    >
      <Tabs defaultActiveKey="overview">
        <TabPane tab="Overview" key="overview">
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {renderOverviewStats()}
            {renderHealthAlerts()}
          </Space>
        </TabPane>

        <TabPane tab="Error Analysis" key="analysis">
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <Card title="Errors by Type" size="small">
              {renderErrorsByType()}
            </Card>

            <Card title="Errors by Severity" size="small">
              {renderErrorsBySeverity()}
            </Card>
          </Space>
        </TabPane>

        <TabPane tab="Recent Errors" key="errors">
          {renderRecentErrors()}
        </TabPane>

        <TabPane tab="Circuit Breakers" key="circuit-breakers">
          <Card title="Circuit Breaker Status" size="small">
            {renderCircuitBreakersStatus()}
          </Card>
        </TabPane>

        <TabPane tab="System Health" key="health">
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <Row gutter={16}>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title="Health Status"
                    value={systemHealth.status.toUpperCase()}
                    valueStyle={{ color: getHealthColor(systemHealth.status) }}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title="Error Rate (5min)"
                    value={systemHealth.details.errorRate}
                    valueStyle={{
                      color: systemHealth.details.errorRate > 20 ? '#f5222d' :
                             systemHealth.details.errorRate > 10 ? '#faad14' : '#52c41a'
                    }}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title="Critical Errors"
                    value={systemHealth.details.criticalErrors}
                    valueStyle={{
                      color: systemHealth.details.criticalErrors > 0 ? '#f5222d' : '#52c41a'
                    }}
                  />
                </Card>
              </Col>
            </Row>

{/* Disabled broken mock code section */}
          </Space>
        </TabPane>
      </Tabs>

      {renderErrorDetailModal()}
    </Card>
  );
};

export default ErrorMonitoringDashboard;