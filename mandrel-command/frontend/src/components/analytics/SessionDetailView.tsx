import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Typography,
  Row,
  Col,
  Statistic,
  Tag,
  Tabs,
  List,
  Spin,
  Alert,
  Empty,
  Space
} from 'antd';
import {
  ClockCircleOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  CalendarOutlined
} from '@ant-design/icons';
import { apiService } from '../../services/api';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

interface SessionSummary {
  id: string;
  project_id: string;
  project_name?: string;
  created_at: string;
  context_count?: number;
  last_context_at?: string;
  ended_at?: string;
}

interface SessionDetailViewProps {
  session: SessionSummary;
}

interface Context {
  id: string;
  content: string;
  type: string;
  tags?: string[];
  created_at: string;
  relevance_score?: number;
}

const SessionDetailView: React.FC<SessionDetailViewProps> = ({ session }) => {
  const [contexts, setContexts] = useState<Context[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadContexts = useCallback(async () => {
    try {
      setLoading(true);
      // Use the existing contexts API to get contexts for this session
      const response = await apiService.get<{success: boolean; data: {contexts: Context[]}}>(
        '/contexts', 
        { 
          params: { 
            session_id: session.id,
            limit: 100
          } 
        }
      );
      
      setContexts(response.data.contexts || []);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load contexts:', err);
      setError('Failed to load session contexts');
      setContexts([]);
    } finally {
      setLoading(false);
    }
  }, [session.id]);

  useEffect(() => {
    loadContexts();
  }, [loadContexts]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const calculateDuration = () => {
    const start = new Date(session.created_at);
    
    // For active sessions, use current time
    // For completed sessions, use ended_at or last_context_at
    let end: Date;
    if (session.ended_at) {
      end = new Date(session.ended_at);
    } else {
      // Active session - use current time for real-time duration
      end = new Date();
    }
    
    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.round(diffMs / (1000 * 60));
    
    if (diffMins < 60) {
      return `${diffMins}m`;
    }
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}m`;
  };

  const getTypeColor = (type: string): string => {
    const colorMap: Record<string, string> = {
      code: 'blue',
      decision: 'purple', 
      error: 'red',
      discussion: 'cyan',
      planning: 'green',
      completion: 'orange'
    };
    return colorMap[type] || 'default';
  };

  return (
    <div style={{ padding: 16 }}>
      {/* Session Header */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={12}>
            <Title level={4}>Session Details</Title>
            {session.project_name && (
              <Text type="secondary">Project: {session.project_name}</Text>
            )}
            <br />
            <Text type="secondary">
              Started: {formatDate(session.created_at)}
            </Text>
            {session.last_context_at && (
              <>
                <br />
                <Text type="secondary">
                  Last Activity: {formatDate(session.last_context_at)}
                </Text>
              </>
            )}
          </Col>
          <Col xs={24} md={12}>
            <Space direction="vertical" size="middle">
              <Tag icon={<CalendarOutlined />} color="blue">
                ID: {session.id.substring(0, 8)}...
              </Tag>
              <Tag icon={<ClockCircleOutlined />} color="green">
                Duration: {calculateDuration()}
              </Tag>
            </Space>
          </Col>
        </Row>

        {/* Metrics Summary */}
        <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
          <Col xs={12} sm={8}>
            <Statistic
              title="Contexts Created"
              value={session.context_count || 0}
              prefix={<DatabaseOutlined />}
            />
          </Col>
          <Col xs={12} sm={8}>
            <Statistic
              title="Session Length"
              value={calculateDuration()}
              prefix={<ClockCircleOutlined />}
            />
          </Col>
          <Col xs={12} sm={8}>
            <Statistic
              title="Project"
              value={session.project_name || 'Unknown'}
              prefix={<FileTextOutlined />}
            />
          </Col>
        </Row>
      </Card>

      {/* Context Details */}
      <Card>
        <Tabs defaultActiveKey="contexts">
          <TabPane 
            tab={
              <Space>
                <DatabaseOutlined />
                <span>Contexts ({contexts.length})</span>
              </Space>
            } 
            key="contexts"
          >
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Spin size="large" />
                <div style={{ marginTop: 16 }}>
                  <Text type="secondary">Loading session contexts...</Text>
                </div>
              </div>
            ) : error ? (
              <Alert
                message="Error loading contexts" 
                description={error}
                type="error"
                showIcon
              />
            ) : contexts.length > 0 ? (
              <List
                itemLayout="vertical"
                dataSource={contexts}
                renderItem={(context) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space>
                          <Tag color={getTypeColor(context.type)}>
                            {context.type.charAt(0).toUpperCase() + context.type.slice(1)}
                          </Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {formatDate(context.created_at)}
                          </Text>
                          {context.relevance_score && (
                            <Tag color="gold">
                              Score: {context.relevance_score}
                            </Tag>
                          )}
                        </Space>
                      }
                      description={
                        <div>
                          <Text>
                            {context.content.length > 300 
                              ? `${context.content.substring(0, 300)}...` 
                              : context.content}
                          </Text>
                          {context.tags && context.tags.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              {context.tags.map(tag => (
                                <Tag key={tag}>{tag}</Tag>
                              ))}
                            </div>
                          )}
                        </div>
                      }
                    />
                  </List.Item>
                )}
                pagination={{
                  pageSize: 10,
                  showSizeChanger: false,
                  showQuickJumper: true,
                  showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} contexts`
                }}
              />
            ) : (
              <Empty 
                description="No contexts found for this session"
                style={{ padding: 40 }}
              />
            )}
          </TabPane>
          
          <TabPane 
            tab={
              <Space>
                <FileTextOutlined />
                <span>Session Summary</span>
              </Space>
            } 
            key="summary"
          >
            <div style={{ padding: 16 }}>
              <Title level={5}>Session Overview</Title>
              <Row gutter={[16, 16]}>
                <Col xs={24} md={12}>
                  <Card size="small" title="Basic Info">
                    <p><strong>Session ID:</strong> {session.id}</p>
                    <p><strong>Project:</strong> {session.project_name || 'Unknown'}</p>
                    <p><strong>Started:</strong> {formatDate(session.created_at)}</p>
                    {session.last_context_at && (
                      <p><strong>Last Activity:</strong> {formatDate(session.last_context_at)}</p>
                    )}
                  </Card>
                </Col>
                <Col xs={24} md={12}>
                  <Card size="small" title="Activity Summary">
                    <p><strong>Contexts Created:</strong> {session.context_count || 0}</p>
                    <p><strong>Duration:</strong> {calculateDuration()}</p>
                    <p><strong>Avg Contexts/Hour:</strong> {
                      session.context_count && session.last_context_at ? 
                      Math.round((session.context_count / (new Date(session.last_context_at).getTime() - new Date(session.created_at).getTime())) * 3600000) || 0 : 
                      'N/A'
                    }</p>
                  </Card>
                </Col>
              </Row>
            </div>
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default SessionDetailView;
