import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography,
  Card,
  Button,
  Space,
  Spin,
  message,
  Row,
  Col,
  Statistic,
  Tag,
  Descriptions,
  Tabs,
  Empty,
  List,
  Table,
  Badge,
  Progress
} from 'antd';
import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  DatabaseOutlined,
  EyeOutlined,
  TagsOutlined,
  CodeOutlined,
  BranchesOutlined,
  RobotOutlined,
  FolderOpenOutlined,
  LineChartOutlined,
  PlusOutlined,
  MinusOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import contextsClient from '../api/contextsClient';
import { sessionsClient } from '../api/sessionsClient';
import { SessionsService } from '../api/generated';
import type { Context } from '../types/context';
import type { SessionFile } from '../types/session';
import { getTypeColor, getTypeDisplayName } from '../utils/contextHelpers';
import GitSyncModal from '../components/sessions/GitSyncModal';

// Session detail type
interface SessionDetailType {
  id: string;
  project_id: string;
  project_name?: string;
  title?: string;
  description?: string;
  created_at: string;
  context_count?: number;
  last_context_at?: string;
  contexts?: {
    id: string;
    type: string;
    content: string;
    created_at: string;
    tags?: string[];
  }[];
  duration?: number;
  metadata?: Record<string, any>;

  // Session enhancements
  started_at?: string;
  ended_at?: string;
  status?: 'active' | 'inactive';
  session_goal?: string;
  tags?: string[];
  ai_model?: string;
  active_branch?: string;
  working_commit_sha?: string;
  lines_added?: number;
  lines_deleted?: number;
  lines_net?: number;
  files_modified_count?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  tasks_created?: number;
  tasks_updated?: number;
  tasks_completed?: number;
  contexts_created?: number;
  activity_count?: number;
  productivity_score?: number;

  // Nested data from backend
  tasks?: Array<{
    id: string;
    title: string;
    type: string;
    status: string;
    priority: string;
    created_at: string;
    completed_at?: string;
  }>;
  decisions?: Array<{
    id: string;
    decision_type: string;
    title: string;
    description?: string;
    status: string;
    impact_level?: string;
    created_at: string;
  }>;
}

// Backend context type (uses context_type instead of type)
interface BackendContext {
  id: string;
  context_type: string;
  content: string;
  created_at: string;
  tags?: string[];
  relevance_score?: number;
}

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;

const SessionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('contexts');

  // Contexts are now loaded from the session detail endpoint
  // This query is kept for backward compatibility but won't be used
  // const contextsResult = session?.contexts || [];

  // Fetch session files
  const {
    data: sessionFiles = [],
    isLoading: filesLoading,
    error: filesError
  } = useQuery({
    queryKey: ['session', id, 'files'],
    queryFn: async () => {
      if (!id) throw new Error('Session ID is required');
      return sessionsClient.getSessionFiles(id);
    },
    enabled: !!id,
  });

  // Use React Query for session data - now from backend API
  const {
    data: sessionResponse,
    isLoading: loading,
    error
  } = useQuery({
    queryKey: ['session', id],
    queryFn: async () => {
      if (!id) throw new Error('Session ID is required');
      return SessionsService.getSessions1({ id });
    },
    enabled: !!id,
    retry: 1,
  });

  // Cast to our extended type since generated API types are incomplete
  const session = sessionResponse?.data?.session as SessionDetailType | undefined;

  // DEBUG: Log the API response
  console.log('=== SESSION DETAIL DEBUG ===');
  console.log('Session Response:', sessionResponse);
  console.log('Session Data:', session);
  console.log('Contexts:', session?.contexts);
  console.log('Tasks:', session?.tasks);
  console.log('Decisions:', session?.decisions);

  // Handle error state
  useEffect(() => {
    if (error) {
      console.error('Load session error:', error);
      message.error('Failed to load session details');
      navigate('/sessions');
    }
  }, [error, navigate]);

  // Map backend context format to frontend format (context_type -> type)
  const contexts: Context[] = (session?.contexts ?? []).map((ctx: any) => ({
    id: ctx.id,
    type: ctx.context_type || ctx.type, // Support both formats
    content: ctx.content,
    created_at: ctx.created_at,
    updated_at: ctx.updated_at || ctx.created_at, // Use created_at if updated_at not available
    tags: ctx.tags || [],
    session_id: ctx.session_id || session?.id,
    project_id: ctx.project_id || session?.project_id,
    relevance_score: ctx.relevance_score
  }));

  const tasks = session?.tasks ?? [];
  const decisions = session?.decisions ?? [];

  // DEBUG: Log mapped data
  console.log('Mapped Contexts Count:', contexts.length);
  console.log('Tasks Count:', tasks.length);
  console.log('Decisions Count:', decisions.length);
  console.log('First Context:', contexts[0]);

  useEffect(() => {
    if (filesError) {
      console.error('Load files error:', filesError);
      // Don't show error message for files - it's not critical
    }
  }, [filesError]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatDuration = (startDate?: string, endDate?: string) => {
    if (!startDate) return 'N/A';

    const start = new Date(startDate);
    if (isNaN(start.getTime())) return 'Invalid date';

    const end = endDate ? new Date(endDate) : new Date();
    if (isNaN(end.getTime())) return 'Invalid date';

    const diff = end.getTime() - start.getTime();

    if (diff < 0) return '0m'; // Handle negative durations

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const handleViewContext = (context: Context) => {
    // Navigate to contexts page with filter for this specific context
    navigate(`/contexts?id=${context.id}`);
  };

  const handleBackToProjects = () => {
    navigate('/sessions');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!session) {
    return (
      <Card>
        <Empty description="Session not found" />
      </Card>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <Card>
        <Space style={{ marginBottom: '16px' }}>
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={handleBackToProjects}
          >
            Back to Sessions
          </Button>
          <GitSyncModal sessionId={session.id} projectId={session.project_id} />
        </Space>
        
        <Title level={2}>Session Details</Title>
        <Text code style={{ fontSize: '12px', marginBottom: '16px', display: 'block' }}>
          {session.id}
        </Text>

        {/* Statistics Row 1 - Core Metrics */}
        <Row gutter={[16, 16]} style={{ marginBottom: '16px' }}>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Duration"
                value={formatDuration(
                  session.started_at || session.created_at,
                  session.ended_at || session.last_context_at
                )}
                prefix={<ClockCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Files Modified"
                value={session.files_modified_count || 0}
                prefix={<FolderOpenOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Productivity Score"
                value={session.productivity_score || 0}
                suffix="/100"
                prefix={<LineChartOutlined />}
                valueStyle={{ color: (session.productivity_score || 0) >= 70 ? '#52c41a' : '#faad14' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Total Tokens"
                value={(session.total_tokens || 0).toLocaleString()}
                prefix={<CodeOutlined />}
                valueStyle={{ fontSize: '14px' }}
              />
            </Card>
          </Col>
        </Row>

        {/* Statistics Row 2 - Activity Metrics */}
        <Row gutter={[16, 16]} style={{ marginBottom: '16px' }}>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Contexts Created"
                value={session.contexts_created || session.context_count || 0}
                prefix={<FileTextOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Tasks"
                value={`${session.tasks_created || 0} / ${session.tasks_completed || 0}`}
                prefix={<CheckCircleOutlined />}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>Created / Completed</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Lines Added"
                value={session.lines_added || 0}
                prefix={<PlusOutlined />}
                valueStyle={{ color: '#52c41a', fontSize: '14px' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Lines Deleted"
                value={session.lines_deleted || 0}
                prefix={<MinusOutlined />}
                valueStyle={{ color: '#ff4d4f', fontSize: '14px' }}
              />
            </Card>
          </Col>
        </Row>

        {/* Session Info */}
        <Descriptions bordered column={{ xxl: 2, xl: 2, lg: 2, md: 1, sm: 1, xs: 1 }}>
          <Descriptions.Item label="Project">
            <Tag color="blue">{session.project_name || 'Unknown'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="AI Model">
            <Space>
              <RobotOutlined />
              <Text>{session.ai_model || 'Not specified'}</Text>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="Git Branch">
            <Space>
              <BranchesOutlined />
              <Text code>{session.active_branch || 'Not tracked'}</Text>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="Commit SHA">
            <Text code>{session.working_commit_sha ? session.working_commit_sha.substring(0, 8) + '...' : 'Not tracked'}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Session Goal" span={2}>
            <Text>{session.session_goal || 'No goal specified'}</Text>
          </Descriptions.Item>
          {session.tags && session.tags.length > 0 && (
            <Descriptions.Item label="Tags" span={2}>
              <Space size={[0, 4]} wrap>
                {session.tags.map(tag => (
                  <Tag key={tag} color="blue">{tag}</Tag>
                ))}
              </Space>
            </Descriptions.Item>
          )}
          <Descriptions.Item label="Created">
            <Text>{formatDate(session.created_at)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Last Activity">
            <Text>{session.last_context_at ? formatDate(session.last_context_at) : 'No activity'}</Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Tabs */}
      <Card style={{ marginTop: '24px' }}>
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane
            tab={
              <Space>
                <FileTextOutlined />
                <span>Contexts ({contexts.length})</span>
              </Space>
            }
            key="contexts"
          >
            {contexts.length > 0 ? (
              <List
                dataSource={contexts}
                renderItem={(context) => (
                  <List.Item
                    actions={[
                      <Button
                        type="text"
                        icon={<EyeOutlined />}
                        onClick={() => handleViewContext(context)}
                      >
                        View
                      </Button>
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Space>
                          <Tag color={getTypeColor(context.type)}>
                            {getTypeDisplayName(context.type)}
                          </Tag>
                          <Text>{formatDate(context.created_at)}</Text>
                        </Space>
                      }
                      description={
                        <div>
                          <Paragraph 
                            ellipsis={{ rows: 2, expandable: true, symbol: 'more' }}
                            style={{ marginBottom: '8px' }}
                          >
                            {context.content}
                          </Paragraph>
                          {context.tags && context.tags.length > 0 && (
                            <Space size={[0, 4]} wrap>
                              <TagsOutlined style={{ color: '#8c8c8c' }} />
                              {context.tags.map(tag => (
                                <Tag key={tag}>{tag}</Tag>
                              ))}
                            </Space>
                          )}
                        </div>
                      }
                    />
                  </List.Item>
                )}
                pagination={{
                  pageSize: 20,
                  showSizeChanger: true,
                  showQuickJumper: true,
                  showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} contexts`
                }}
              />
            ) : (
              <Empty description="No contexts found for this session" />
            )}
          </TabPane>

          <TabPane
            tab={
              <Space>
                <CheckCircleOutlined />
                <span>Tasks ({tasks.length})</span>
              </Space>
            }
            key="tasks"
          >
            {tasks.length > 0 ? (
              <Table
                dataSource={tasks}
                rowKey="id"
                pagination={{
                  pageSize: 20,
                  showSizeChanger: true,
                  showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} tasks`
                }}
                columns={[
                  {
                    title: 'Title',
                    dataIndex: 'title',
                    key: 'title',
                    render: (title: string) => <Text strong>{title}</Text>,
                  },
                  {
                    title: 'Type',
                    dataIndex: 'type',
                    key: 'type',
                    render: (type: string) => {
                      const colors = { feature: 'blue', bugfix: 'red', refactor: 'orange', test: 'green', documentation: 'purple' };
                      return <Tag color={colors[type as keyof typeof colors] || 'default'}>{type}</Tag>;
                    },
                    filters: [
                      { text: 'Feature', value: 'feature' },
                      { text: 'Bugfix', value: 'bugfix' },
                      { text: 'Refactor', value: 'refactor' },
                      { text: 'Test', value: 'test' },
                      { text: 'Documentation', value: 'documentation' },
                    ],
                    onFilter: (value, record) => record.type === value,
                    width: 130,
                  },
                  {
                    title: 'Status',
                    dataIndex: 'status',
                    key: 'status',
                    render: (status: string) => {
                      const colors = { todo: 'default', in_progress: 'blue', completed: 'green', cancelled: 'red', blocked: 'orange' };
                      return <Tag color={colors[status as keyof typeof colors] || 'default'}>{status.replace('_', ' ')}</Tag>;
                    },
                    filters: [
                      { text: 'To Do', value: 'todo' },
                      { text: 'In Progress', value: 'in_progress' },
                      { text: 'Completed', value: 'completed' },
                      { text: 'Blocked', value: 'blocked' },
                      { text: 'Cancelled', value: 'cancelled' },
                    ],
                    onFilter: (value, record) => record.status === value,
                    width: 130,
                  },
                  {
                    title: 'Priority',
                    dataIndex: 'priority',
                    key: 'priority',
                    render: (priority: string) => {
                      const colors = { low: 'default', medium: 'blue', high: 'orange', urgent: 'red' };
                      return <Tag color={colors[priority as keyof typeof colors] || 'default'}>{priority}</Tag>;
                    },
                    sorter: (a, b) => {
                      const order = { urgent: 4, high: 3, medium: 2, low: 1 };
                      return (order[a.priority as keyof typeof order] || 0) - (order[b.priority as keyof typeof order] || 0);
                    },
                    width: 110,
                  },
                  {
                    title: 'Created',
                    dataIndex: 'created_at',
                    key: 'created_at',
                    render: (date: string) => (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(date).toLocaleString()}
                      </Text>
                    ),
                    sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
                    width: 170,
                  },
                  {
                    title: 'Completed',
                    dataIndex: 'completed_at',
                    key: 'completed_at',
                    render: (date: string) => date ? (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(date).toLocaleString()}
                      </Text>
                    ) : <Text type="secondary">-</Text>,
                    width: 170,
                  },
                ]}
              />
            ) : (
              <Empty description="No tasks found for this session" />
            )}
          </TabPane>

          <TabPane
            tab={
              <Space>
                <DatabaseOutlined />
                <span>Decisions ({decisions.length})</span>
              </Space>
            }
            key="decisions"
          >
            {decisions.length > 0 ? (
              <List
                dataSource={decisions}
                renderItem={(decision) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space>
                          <Tag color="purple">{decision.decision_type}</Tag>
                          <Text strong>{decision.title}</Text>
                        </Space>
                      }
                      description={
                        <div>
                          {decision.description && (
                            <Paragraph
                              ellipsis={{ rows: 2, expandable: true, symbol: 'more' }}
                              style={{ marginBottom: '8px' }}
                            >
                              {decision.description}
                            </Paragraph>
                          )}
                          <Space>
                            <Tag color={decision.status === 'approved' ? 'green' : 'orange'}>{decision.status}</Tag>
                            {decision.impact_level && (
                              <Tag color={decision.impact_level === 'high' || decision.impact_level === 'critical' ? 'red' : 'blue'}>
                                Impact: {decision.impact_level}
                              </Tag>
                            )}
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {formatDate(decision.created_at)}
                            </Text>
                          </Space>
                        </div>
                      }
                    />
                  </List.Item>
                )}
                pagination={{
                  pageSize: 10,
                  showSizeChanger: true,
                  showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} decisions`
                }}
              />
            ) : (
              <Empty description="No decisions recorded for this session" />
            )}
          </TabPane>

          <TabPane
            tab={
              <Space>
                <FolderOpenOutlined />
                <span>Files Changed ({sessionFiles.length})</span>
              </Space>
            }
            key="files"
          >
            {filesLoading ? (
              <div style={{ textAlign: 'center', padding: '24px' }}>
                <Spin size="large" />
              </div>
            ) : sessionFiles.length > 0 ? (
              <Table
                dataSource={sessionFiles}
                rowKey="id"
                pagination={{
                  pageSize: 20,
                  showSizeChanger: true,
                  showQuickJumper: true,
                  showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} files`
                }}
                columns={[
                  {
                    title: 'File Path',
                    dataIndex: 'file_path',
                    key: 'file_path',
                    render: (path: string) => <Text code>{path}</Text>,
                    sorter: (a, b) => a.file_path.localeCompare(b.file_path),
                  },
                  {
                    title: 'Lines Added',
                    dataIndex: 'lines_added',
                    key: 'lines_added',
                    render: (lines: number) => (
                      <Text style={{ color: '#52c41a' }}>
                        <PlusOutlined /> {lines}
                      </Text>
                    ),
                    sorter: (a, b) => a.lines_added - b.lines_added,
                    width: 130,
                  },
                  {
                    title: 'Lines Deleted',
                    dataIndex: 'lines_deleted',
                    key: 'lines_deleted',
                    render: (lines: number) => (
                      <Text style={{ color: '#ff4d4f' }}>
                        <MinusOutlined /> {lines}
                      </Text>
                    ),
                    sorter: (a, b) => a.lines_deleted - b.lines_deleted,
                    width: 130,
                  },
                  {
                    title: 'Net Change',
                    key: 'net',
                    render: (_, record) => {
                      const net = record.lines_added - record.lines_deleted;
                      return (
                        <Text style={{ color: net > 0 ? '#52c41a' : net < 0 ? '#ff4d4f' : '#8c8c8c' }}>
                          {net > 0 ? '+' : ''}{net}
                        </Text>
                      );
                    },
                    sorter: (a, b) => (a.lines_added - a.lines_deleted) - (b.lines_added - b.lines_deleted),
                    width: 110,
                  },
                  {
                    title: 'Source',
                    dataIndex: 'source',
                    key: 'source',
                    render: (source: string) => {
                      const colors = { tool: 'blue', git: 'green', manual: 'orange' };
                      return <Tag color={colors[source as keyof typeof colors] || 'default'}>{source}</Tag>;
                    },
                    filters: [
                      { text: 'Tool', value: 'tool' },
                      { text: 'Git', value: 'git' },
                      { text: 'Manual', value: 'manual' },
                    ],
                    onFilter: (value, record) => record.source === value,
                    width: 100,
                  },
                  {
                    title: 'Last Modified',
                    dataIndex: 'last_modified_at',
                    key: 'last_modified_at',
                    render: (date: string) => (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(date).toLocaleString()}
                      </Text>
                    ),
                    sorter: (a, b) => new Date(a.last_modified_at).getTime() - new Date(b.last_modified_at).getTime(),
                    width: 170,
                  },
                ]}
                summary={(data) => {
                  const totalAdded = data.reduce((sum, file) => sum + file.lines_added, 0);
                  const totalDeleted = data.reduce((sum, file) => sum + file.lines_deleted, 0);
                  const netChange = totalAdded - totalDeleted;

                  return (
                    <Table.Summary fixed>
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0}>
                          <Text strong>Total</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={1}>
                          <Text strong style={{ color: '#52c41a' }}>
                            <PlusOutlined /> {totalAdded}
                          </Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={2}>
                          <Text strong style={{ color: '#ff4d4f' }}>
                            <MinusOutlined /> {totalDeleted}
                          </Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={3}>
                          <Text strong style={{ color: netChange > 0 ? '#52c41a' : netChange < 0 ? '#ff4d4f' : '#8c8c8c' }}>
                            {netChange > 0 ? '+' : ''}{netChange}
                          </Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={4} />
                        <Table.Summary.Cell index={5} />
                      </Table.Summary.Row>
                    </Table.Summary>
                  );
                }}
              />
            ) : (
              <Empty description="No files tracked for this session" />
            )}
          </TabPane>

          <TabPane
            tab={
              <Space>
                <DatabaseOutlined />
                Activity Timeline
              </Space>
            }
            key="timeline"
          >
            {contexts.length > 0 ? (
              <div>
                <Title level={4}>Session Activity Timeline</Title>
                <List
                  dataSource={contexts.map(context => ({
                    ...context,
                    timestamp: new Date(context.created_at).getTime()
                  })).sort((a, b) => a.timestamp - b.timestamp)}
                  renderItem={(context, index) => (
                    <List.Item style={{ padding: '12px 0' }}>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Space>
                          <Text strong>{formatDate(context.created_at)}</Text>
                          <Tag color={getTypeColor(context.type)}>
                            {getTypeDisplayName(context.type)}
                          </Tag>
                        </Space>
                        <Paragraph 
                          ellipsis={{ rows: 1, expandable: false }}
                          style={{ margin: 0, paddingLeft: '16px' }}
                        >
                          {context.content}
                        </Paragraph>
                      </Space>
                    </List.Item>
                  )}
                />
              </div>
            ) : (
              <Empty description="No activity timeline available" />
            )}
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default SessionDetail;
