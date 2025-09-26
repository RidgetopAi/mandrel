import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Card,
  Row,
  Col,
  Statistic,
  Space,
  Alert,
  Button,
  Spin,
  Skeleton,
} from 'antd';
import {
  DatabaseOutlined,
  FolderOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useAuthContext } from '../contexts/AuthContext';
import { useProjectContext } from '../contexts/ProjectContext';
import { useDashboardStats } from '../hooks/useDashboardStats';
import { useAidisV2Status } from '../hooks/useAidisV2Status';
import ProjectInsights from '../components/analytics/ProjectInsights';
import SystemMonitoring from '../components/analytics/SystemMonitoring';
import MonitoringStats from '../components/analytics/MonitoringStats';
import MonitoringAlerts from '../components/analytics/MonitoringAlerts';
import MonitoringTrends from '../components/analytics/MonitoringTrends';
import SessionSummaries from '../components/analytics/SessionSummaries';
import AidisV2ApiTest from '../components/testing/AidisV2ApiTest';
import ErrorBoundaryDemo from '../components/testing/ErrorBoundaryDemo';

const { Title, Text, Paragraph } = Typography;

const Dashboard: React.FC = () => {
  const { user } = useAuthContext();
  const { currentProject } = useProjectContext();
  const navigate = useNavigate();

  // Oracle Phase 2: Use dashboard stats hook with real data
  const { stats, isLoading, error, refetch } = useDashboardStats();

  // TR001-6: AIDIS V2 API Status
  const { status: aidisV2Status } = useAidisV2Status();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Oracle Phase 2: Show loading skeleton until data arrives
  if (isLoading) {
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={2} style={{ marginBottom: '8px' }}>
            {getGreeting()}, {user?.username || 'User'}! 👋
          </Title>
          <Text type="secondary">
            Welcome to AIDIS Command - Your AI Development Intelligence System
          </Text>
        </div>
        
        <Row gutter={[24, 24]}>
          {[1, 2, 3, 4].map(i => (
            <Col xs={24} sm={12} lg={6} key={i}>
              <Card>
                <Skeleton active title={false} paragraph={{ rows: 2 }} />
              </Card>
            </Col>
          ))}
        </Row>
        
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <Spin size="large" tip="Loading real-time dashboard data..." />
        </div>
      </Space>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Welcome Header */}
      <div>
        <Title level={2} style={{ marginBottom: '8px' }}>
          {getGreeting()}, {user?.username || 'User'}! 👋
        </Title>
        <Text type="secondary">
          Welcome to AIDIS Command - Your AI Development Intelligence System
        </Text>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert
          message="Connection Issue"
          description={error}
          type="warning"
          showIcon
          action={
            <Button
              size="small"
              type="primary"
              onClick={refetch}
            >
              Retry
            </Button>
          }
          closable
        />
      )}

      {/* Oracle Phase 2: Real Database Counts */}
      <Row gutter={[24, 24]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Contexts"
              value={stats?.contexts ?? 0}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {currentProject ? `In ${currentProject.name}` : 'Development contexts stored'}
            </Text>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Active Tasks"
              value={stats?.activeTasks ?? 0}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {currentProject ? `In ${currentProject.name}` : 'Tasks in progress'}
            </Text>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Projects"
              value={stats?.projects ?? 0}
              prefix={<FolderOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Projects managed
            </Text>
          </Card>
        </Col>
        
      </Row>

      {/* Project Insights */}
      {currentProject && (
        <ProjectInsights projectId={currentProject.id} />
      )}

      {/* Session Analytics */}
      <SessionSummaries projectId={currentProject?.id} limit={10} />

      {/* System Monitoring */}
      <SystemMonitoring />

      {/* Monitoring Insights */}
      <Row gutter={[24, 24]}>
        <Col xs={24} xl={8}>
          <MonitoringStats />
        </Col>
        <Col xs={24} xl={8}>
          <MonitoringAlerts limit={10} />
        </Col>
        <Col xs={24} xl={8}>
          <MonitoringTrends />
        </Col>
      </Row>

      {/* Feature Cards */}
      <Row gutter={[24, 24]}>
        <Col xs={24} lg={8}>
          <Card
            title="Context Management"
            extra={<DatabaseOutlined style={{ color: '#1890ff' }} />}
            hoverable
          >
            <Paragraph>
              Store and retrieve development contexts with semantic search.
              Maintain consistency across multi-week projects.
            </Paragraph>
            <Button type="primary" ghost onClick={() => navigate('/contexts')}>
              Browse Contexts
            </Button>
          </Card>
        </Col>
        
        
        <Col xs={24} lg={8}>
          <Card
            title="Project Switching"
            extra={<FolderOutlined style={{ color: '#722ed1' }} />}
            hoverable
          >
            <Paragraph>
              Seamlessly switch between projects while maintaining context
              and decision history.
            </Paragraph>
            <Button type="primary" ghost>
              Switch Projects
            </Button>
          </Card>
        </Col>
      </Row>

      {/* System Status */}
      <Card title="System Status">
        <Row gutter={24}>
          <Col span={8}>
            <Space>
              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '18px' }} />
              <div>
                <Text strong>Backend API</Text>
                <br />
                <Text type="secondary">Connected</Text>
              </div>
            </Space>
          </Col>
          <Col span={8}>
            <Space>
              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '18px' }} />
              <div>
                <Text strong>Authentication</Text>
                <br />
                <Text type="secondary">Active</Text>
              </div>
            </Space>
          </Col>
          <Col span={8}>
            <Space>
              {aidisV2Status.status === 'connected' && (
                <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '18px' }} />
              )}
              {aidisV2Status.status === 'connecting' && (
                <Spin size="small" />
              )}
              {aidisV2Status.status === 'error' && (
                <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: '18px' }} />
              )}
              {aidisV2Status.status === 'unknown' && (
                <ExclamationCircleOutlined style={{ color: '#fa8c16', fontSize: '18px' }} />
              )}
              <div>
                <Text strong>
                  AIDIS V2 API
                  {aidisV2Status.health?.version && (
                    <Text type="secondary"> v{aidisV2Status.health.version}</Text>
                  )}
                </Text>
                <br />
                <Text type="secondary">
                  {aidisV2Status.status === 'connected' &&
                    `${aidisV2Status.health?.toolsAvailable || 0} tools (${aidisV2Status.responseTime}ms)`
                  }
                  {aidisV2Status.status === 'connecting' && 'Connecting...'}
                  {aidisV2Status.status === 'error' && 'Connection failed'}
                  {aidisV2Status.status === 'unknown' && 'Checking...'}
                </Text>
              </div>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* TR001-6: AIDIS V2 API Integration Test */}
      <AidisV2ApiTest />

      {/* TR002-6: Error Boundary & Fallback Components Demo */}
      <ErrorBoundaryDemo />
    </Space>
  );
};

export default Dashboard;
