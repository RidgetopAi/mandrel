import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Typography,
  Button,
  Select,
  Tabs,
  Row,
  Col,
  Statistic,
  Space,
  Alert,
  List,
  Tag,
  Skeleton
} from 'antd';
import { 
  Line as LineChart, 
  Column as ColumnChart 
} from '@ant-design/plots';
import {
  ClockCircleOutlined,
  MessageOutlined,
  RiseOutlined,
  TrophyOutlined,
  BarChartOutlined,
  ThunderboltOutlined,
  TeamOutlined,
  ReloadOutlined,
  LineChartOutlined
} from '@ant-design/icons';
import { 
  SessionAnalytics as SessionAnalyticsType, 
  SessionTrend, 
  ProductiveSession, 
  TokenUsagePattern,
  Project 
} from '../../services/projectApi';
import ProjectApi from '../../services/projectApi';

const { Title, Text } = Typography;
const { TabPane } = Tabs;
const { Option } = Select;

interface SessionAnalyticsProps {
  selectedProjectId?: string;
}

export function SessionAnalytics({ selectedProjectId }: SessionAnalyticsProps) {
  const [analytics, setAnalytics] = useState<SessionAnalyticsType | null>(null);
  const [trends, setTrends] = useState<SessionTrend[]>([]);
  const [productiveSessions, setProductiveSessions] = useState<ProductiveSession[]>([]);
  const [tokenPatterns, setTokenPatterns] = useState<TokenUsagePattern[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectFilter, setProjectFilter] = useState<string>(selectedProjectId || 'all');
  const [timeRange, setTimeRange] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = async () => {
    try {
      const { projects: projectsList } = await ProjectApi.getAllProjects();
      setProjects(projectsList);
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  };

  const loadAnalyticsData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const projectId = projectFilter === 'all' ? undefined : projectFilter;
      
      const [analyticsData, trendsData, productiveData, patternsData] = await Promise.all([
        ProjectApi.getSessionAnalytics(projectId),
        ProjectApi.getSessionTrends(timeRange, projectId),
        ProjectApi.getProductiveSessions(10, projectId),
        ProjectApi.getTokenUsagePatterns(projectId)
      ]);

      setAnalytics(analyticsData);
      setTrends(trendsData);
      setProductiveSessions(productiveData);
      setTokenPatterns(patternsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  }, [projectFilter, timeRange]);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    loadAnalyticsData();
  }, [loadAnalyticsData]);

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatHour = (hour: number): string => {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
  };

  if (loading) {
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={3}>Session Analytics</Title>
        </div>
        <Row gutter={[24, 24]}>
          {[...Array(4)].map((_, i) => (
            <Col xs={24} sm={12} lg={6} key={i}>
              <Card>
                <Skeleton active title={false} paragraph={{ rows: 2 }} />
              </Card>
            </Col>
          ))}
        </Row>
      </Space>
    );
  }

  if (error) {
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={3}>Session Analytics</Title>
        </div>
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <Alert
              message="Error loading analytics"
              description={error}
              type="error"
              showIcon
              action={
                <Button
                  size="small"
                  type="primary"
                  icon={<ReloadOutlined />}
                  onClick={loadAnalyticsData}
                >
                  Retry
                </Button>
              }
            />
          </div>
        </Card>
      </Space>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Header with Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <Title level={3} style={{ margin: 0 }}>Session Analytics</Title>
        <Space>
          <Select
            value={projectFilter}
            onChange={setProjectFilter}
            style={{ width: 200 }}
            placeholder="Filter by project"
          >
            <Option value="all">All Projects</Option>
            {projects.map(project => (
              <Option key={project.id} value={project.id}>
                {project.name}
              </Option>
            ))}
          </Select>
          
          <Select
            value={timeRange}
            onChange={setTimeRange}
            style={{ width: 120 }}
          >
            <Option value={7}>7 Days</Option>
            <Option value={30}>30 Days</Option>
            <Option value={90}>90 Days</Option>
          </Select>
        </Space>
      </div>

      {/* Overview Cards */}
      {analytics && (
        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Total Sessions"
                value={analytics.total_sessions}
                prefix={<TeamOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {analytics.sessions_this_week} this week
              </Text>
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Avg Duration"
                value={formatDuration(analytics.average_duration_minutes)}
                prefix={<ClockCircleOutlined />}
                valueStyle={{ color: '#722ed1' }}
              />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Total: {formatDuration(analytics.total_duration_minutes)}
              </Text>
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Total Contexts"
                value={analytics.total_contexts}
                prefix={<MessageOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Avg: {analytics.average_contexts_per_session}/session
              </Text>
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Total Tokens"
                value={analytics.total_tokens_used}
                prefix={<ThunderboltOutlined />}
                valueStyle={{ color: '#fa8c16' }}
              />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Avg: {analytics.average_tokens_per_session}/session
              </Text>
            </Card>
          </Col>
        </Row>
      )}

      {/* Charts and Analytics */}
      <Tabs defaultActiveKey="trends">
        <TabPane 
          tab={<span><RiseOutlined />Session Trends</span>} 
          key="trends"
        >
          <Row gutter={[24, 24]}>
            {/* Session Count Trend */}
            <Col xs={24} lg={12}>
              <Card 
                title={
                  <Space>
                    <LineChartOutlined />
                    Daily Session Count
                  </Space>
                }
              >
                <div style={{ height: 300 }}>
                  <LineChart
                    data={trends.map(t => ({
                      ...t,
                      date: formatDate(t.date)
                    }))}
                    xField="date"
                    yField="session_count"
                    height={300}
                    smooth={true}
                    color="#1890ff"
                    point={{ size: 4, shape: 'circle' }}
                  />
                </div>
              </Card>
            </Col>

            {/* Duration Trend */}
            <Col xs={24} lg={12}>
              <Card 
                title={
                  <Space>
                    <ClockCircleOutlined />
                    Daily Duration (Minutes)
                  </Space>
                }
              >
                <div style={{ height: 300 }}>
                  <ColumnChart
                    data={trends.map(t => ({
                      ...t,
                      date: formatDate(t.date)
                    }))}
                    xField="date"
                    yField="total_duration_minutes"
                    height={300}
                    color="#52c41a"
                  />
                </div>
              </Card>
            </Col>
          </Row>
        </TabPane>

        <TabPane 
          tab={<span><BarChartOutlined />Token Usage</span>} 
          key="tokens"
        >
          <Card 
            title={
              <Space>
                <BarChartOutlined />
                Token Usage by Hour of Day
              </Space>
            }
          >
            <div style={{ height: 400 }}>
              <ColumnChart
                data={tokenPatterns.map(p => ({
                  ...p,
                  hour: formatHour(p.hour)
                }))}
                xField="hour"
                yField="total_tokens"
                height={400}
                color="#fa8c16"
              />
            </div>
          </Card>
        </TabPane>

        <TabPane 
          tab={<span><TrophyOutlined />Productive Sessions</span>} 
          key="productive"
        >
          <Card 
            title={
              <Space>
                <TrophyOutlined />
                Most Productive Sessions
              </Space>
            }
          >
            {productiveSessions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <Text type="secondary">No sessions found for the selected criteria</Text>
              </div>
            ) : (
              <List
                dataSource={productiveSessions}
                renderItem={(session, index) => (
                  <List.Item key={session.id}>
                    <List.Item.Meta
                      avatar={
                        <div style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          backgroundColor: '#1890ff',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold'
                        }}>
                          {index + 1}
                        </div>
                      }
                      title={
                        <Space>
                          <Text strong>{session.project_name || 'Unknown Project'}</Text>
                          <Text type="secondary">
                            {new Date(session.created_at).toLocaleDateString()}
                          </Text>
                        </Space>
                      }
                      description={
                        <div>
                          <Row gutter={16} style={{ marginBottom: 8 }}>
                            <Col>
                              <Text type="secondary">Duration: </Text>
                              <Text>{formatDuration(session.duration_minutes)}</Text>
                            </Col>
                            <Col>
                              <Text type="secondary">Contexts: </Text>
                              <Text>{session.context_count}</Text>
                            </Col>
                            <Col>
                              <Text type="secondary">Tokens: </Text>
                              <Text>{session.tokens_used.toLocaleString()}</Text>
                            </Col>
                            <Col>
                              <Text type="secondary">Score: </Text>
                              <Tag color="green">{session.productivity_score}</Tag>
                            </Col>
                          </Row>
                          {session.context_summary && (
                            <div>
                              <Text type="secondary">Summary: </Text>
                              <Text ellipsis={{ tooltip: session.context_summary }}>
                                {session.context_summary}
                              </Text>
                            </div>
                          )}
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </TabPane>
      </Tabs>
    </Space>
  );
}

export default SessionAnalytics;
