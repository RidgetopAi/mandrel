import React, { useState, useEffect, useCallback } from 'react';
import { 
  Card, 
  Typography, 
  Tag, 
  Spin,
  Tabs,
  List,
  Row,
  Col,
  Alert,
  Statistic,
  Space
} from 'antd';
import {
  ClockCircleOutlined,
  DatabaseOutlined,
  CodeOutlined,
  FileTextOutlined,
  CheckSquareOutlined,
  TrophyOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import { apiService } from '../../services/api';
import SessionInlineEdit from '../sessions/SessionInlineEdit';

const { Text } = Typography;
const { TabPane } = Tabs;

interface SessionDetailProps {
  sessionId: string;
}

interface SessionDetailData {
  id: string;
  project_id: string;
  project_name?: string;
  title?: string;
  description?: string;
  session_type?: string;
  created_at: string;
  updated_at?: string;
  started_at: string;
  ended_at?: string;
  duration_minutes: number;
  context_count?: number;
  last_context_at?: string;
  
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  
  contexts_created: number;
  decisions_created: number;
  tasks_created: number;
  tasks_completed: number;
  api_requests: number;
  
  contexts: SessionContext[];
  decisions: SessionDecision[];
  tasks: SessionTask[];
  code_components: SessionCodeComponent[];
  
  context_summary?: string;
  productivity_score: number;
}

interface SessionContext {
  id: string;
  context_type: string;
  content: string;
  tags?: string[];
  created_at: string;
  relevance_score?: number;
}

interface SessionDecision {
  id: string;
  decision_type: string;
  title: string;
  description?: string;
  status: string;
  impact_level?: string;
  created_at: string;
}

interface SessionTask {
  id: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  created_at: string;
  completed_at?: string;
}

interface SessionCodeComponent {
  id: string;
  file_path: string;
  component_type: string;
  name: string;
  lines_of_code: number;
  complexity_score?: number;
  analyzed_at: string;
}

const SessionDetail: React.FC<SessionDetailProps> = ({ sessionId }) => {
  const [session, setSession] = useState<SessionDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessionDetail = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiService.get<{success: boolean; data: {session: SessionDetailData}}>(`/sessions/${sessionId}`);
      setSession(response.data.session);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load session details');
      console.error('Failed to fetch session details:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSessionDetail();
  }, [fetchSessionDetail]);

  const handleSessionUpdate = (updatedSession: any) => {
    setSession(prevSession => prevSession ? { ...prevSession, ...updatedSession } : null);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getStatusColor = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'approved':
        return 'green';
      case 'in_progress':
      case 'pending':
        return 'orange';
      case 'cancelled':
      case 'rejected':
        return 'red';
      default:
        return 'default';
    }
  };

  const getPriorityColor = (priority: string): string => {
    switch (priority.toLowerCase()) {
      case 'critical':
        return 'red';
      case 'high':
        return 'orange';
      case 'medium':
        return 'blue';
      case 'low':
        return 'default';
      default:
        return 'default';
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert 
        message="Error" 
        description={error} 
        type="error" 
        showIcon 
        style={{ margin: 16 }}
      />
    );
  }

  if (!session) {
    return (
      <Alert 
        message="Session not found" 
        type="info" 
        showIcon 
        style={{ margin: 16 }}
      />
    );
  }

  return (
    <div style={{ padding: 16 }}>
      {/* Session Header */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={12}>
            <div style={{ marginBottom: 16 }}>
              <SessionInlineEdit
                session={session}
                field="title"
                onUpdate={handleSessionUpdate}
                placeholder="Click to add session title..."
              />
            </div>
            {session.project_name && (
              <Text type="secondary">Project: {session.project_name}</Text>
            )}
            <br />
            <Text type="secondary">
              {formatDate(session.created_at || session.started_at)}
              {session.ended_at && ` - ${formatDate(session.ended_at)}`}
            </Text>
          </Col>
          <Col xs={24} md={12} style={{ textAlign: 'right' }}>
            <Space>
              <Tag icon={<ClockCircleOutlined />} color="blue">
                {formatDuration(session.duration_minutes)}
              </Tag>
              <Tag icon={<TrophyOutlined />} color="green">
                Score: {session.productivity_score}
              </Tag>
            </Space>
          </Col>
        </Row>

        {/* Metrics Summary */}
        <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
          <Col xs={12} sm={6}>
            <Statistic
              title="Total Tokens"
              value={session.total_tokens}
              prefix={<ThunderboltOutlined />}
              formatter={(value) => `${Number(value).toLocaleString()}`}
            />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic
              title="Contexts"
              value={session.contexts_created}
              prefix={<DatabaseOutlined />}
            />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic
              title="Decisions"
              value={session.decisions_created}
              prefix={<FileTextOutlined />}
            />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic
              title="Tasks Completed"
              value={`${session.tasks_completed}/${session.tasks_created}`}
              prefix={<CheckSquareOutlined />}
            />
          </Col>
        </Row>

        {/* Session Description */}
        <div style={{ marginTop: 24 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            Description:
          </Text>
          <SessionInlineEdit
            session={session}
            field="description"
            onUpdate={handleSessionUpdate}
            placeholder="Click to add session description..."
          />
        </div>

        {session.context_summary && (
          <div style={{ 
            marginTop: 16, 
            padding: 16, 
            backgroundColor: '#f5f5f5', 
            borderRadius: 4 
          }}>
            <Text>
              <strong>Summary:</strong> {session.context_summary}
            </Text>
          </div>
        )}
      </Card>

      {/* Activity Details Tabs */}
      <Card>
        <Tabs defaultActiveKey="contexts" type="card">
          <TabPane tab={`Contexts (${session.contexts.length})`} key="contexts">
            {session.contexts.length === 0 ? (
              <Text type="secondary">No contexts in this session</Text>
            ) : (
              <List
                itemLayout="vertical"
                dataSource={session.contexts}
                renderItem={(context) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space>
                          <Tag color="blue">{context.context_type}</Tag>
                          {context.tags?.map(tag => (
                            <Tag key={tag}>{tag}</Tag>
                          ))}
                        </Space>
                      }
                      description={
                        <div>
                          <Text>
                            {context.content.length > 200 
                              ? `${context.content.substring(0, 200)}...` 
                              : context.content}
                          </Text>
                          <br />
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {formatDate(context.created_at)}
                            {context.relevance_score && ` • Score: ${context.relevance_score}`}
                          </Text>
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </TabPane>

          <TabPane tab={`Decisions (${session.decisions.length})`} key="decisions">
            {session.decisions.length === 0 ? (
              <Text type="secondary">No decisions in this session</Text>
            ) : (
              <List
                itemLayout="vertical"
                dataSource={session.decisions}
                renderItem={(decision) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space>
                          <Text strong>{decision.title}</Text>
                          <Tag color="blue">{decision.decision_type}</Tag>
                          <Tag color={getStatusColor(decision.status)}>
                            {decision.status}
                          </Tag>
                          {decision.impact_level && (
                            <Tag>{decision.impact_level}</Tag>
                          )}
                        </Space>
                      }
                      description={
                        <div>
                          {decision.description && (
                            <Text>{decision.description}</Text>
                          )}
                          <br />
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {formatDate(decision.created_at)}
                          </Text>
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </TabPane>

          <TabPane tab={`Tasks (${session.tasks.length})`} key="tasks">
            {session.tasks.length === 0 ? (
              <Text type="secondary">No tasks in this session</Text>
            ) : (
              <List
                itemLayout="vertical"
                dataSource={session.tasks}
                renderItem={(task) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space>
                          <Text strong>{task.title}</Text>
                          <Tag>{task.type}</Tag>
                          <Tag color={getStatusColor(task.status)}>
                            {task.status}
                          </Tag>
                          <Tag color={getPriorityColor(task.priority)}>
                            {task.priority}
                          </Tag>
                        </Space>
                      }
                      description={
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Created: {formatDate(task.created_at)}
                          {task.completed_at && ` • Completed: ${formatDate(task.completed_at)}`}
                        </Text>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </TabPane>

          <TabPane tab={`Code (${session.code_components.length})`} key="code">
            {session.code_components.length === 0 ? (
              <Text type="secondary">No code components analyzed in this session</Text>
            ) : (
              <List
                itemLayout="vertical"
                dataSource={session.code_components}
                renderItem={(component) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={<CodeOutlined />}
                      title={
                        <Space>
                          <Text strong>{component.name}</Text>
                          <Tag color="blue">{component.component_type}</Tag>
                        </Space>
                      }
                      description={
                        <div>
                          <Text code>{component.file_path}</Text>
                          <br />
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {component.lines_of_code} lines
                            {component.complexity_score && ` • Complexity: ${component.complexity_score}`}
                            {` • Analyzed: ${formatDate(component.analyzed_at)}`}
                          </Text>
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default SessionDetail;
