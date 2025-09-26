import React, { useEffect } from 'react';
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
  List
} from 'antd';
import { 
  ArrowLeftOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  DatabaseOutlined,
  EyeOutlined,
  TagsOutlined
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/api';
import contextsClient from '../api/contextsClient';
import type { Context } from '../types/context';
import { getTypeColor, getTypeDisplayName } from '../utils/contextHelpers';

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
}

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;

const SessionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    data: contextsResult,
    isFetching: contextsLoading,
    error: contextsError,
  } = useQuery({
    queryKey: ['session', id, 'contexts'],
    queryFn: async () => {
      if (!id) throw new Error('Session ID is required');
      return contextsClient.search({
        session_id: id,
        limit: 100,
        sort_by: 'created_at',
        sort_order: 'asc',
      });
    },
    enabled: !!id,
  });

  // Use React Query for session data
  const {
    data: sessionResponse,
    isLoading: loading,
    error
  } = useQuery({
    queryKey: ['session', id],
    queryFn: async () => {
      if (!id) throw new Error('Session ID is required');
      const response = await apiService.get<{
        success: boolean;
        data: { session: SessionDetailType };
      }>(`/sessions/${id}`);

      if (!response.success) {
        throw new Error('Failed to fetch session details');
      }

      return response.data.session;
    },
    enabled: !!id,
    retry: 1,
  });

  const session = sessionResponse;

  // Handle error state
  useEffect(() => {
    if (error) {
      console.error('Load session error:', error);
      message.error('Failed to load session details');
      navigate('/projects');
    }
  }, [error, navigate]);

  const contexts = contextsResult?.contexts ?? [];

  useEffect(() => {
    if (contextsError) {
      console.error('Load contexts error:', contextsError);
      message.error('Failed to load session contexts');
    }
  }, [contextsError]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatDuration = (startDate: string, endDate?: string) => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();
    const diff = end.getTime() - start.getTime();
    
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
        </Space>
        
        <Title level={2}>Session Details</Title>
        <Text code style={{ fontSize: '12px', marginBottom: '16px', display: 'block' }}>
          {session.id}
        </Text>

        {/* Statistics */}
        <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Contexts Created"
                value={session.context_count || 0}
                prefix={<FileTextOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Duration"
                value={formatDuration(session.created_at, session.last_context_at)}
                prefix={<ClockCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Created"
                value={formatDate(session.created_at)}
                valueStyle={{ fontSize: '14px' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Last Activity"
                value={session.last_context_at ? formatDate(session.last_context_at) : 'No activity'}
                valueStyle={{ fontSize: '14px' }}
              />
            </Card>
          </Col>
        </Row>

        {/* Session Info */}
        <Descriptions bordered column={{ xxl: 2, xl: 2, lg: 2, md: 1, sm: 1, xs: 1 }}>
          <Descriptions.Item label="Project">
            <Tag color="blue">{session.project_name || 'Unknown'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Session ID">
            <Text code>{session.id}</Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Tabs */}
      <Card style={{ marginTop: '24px' }}>
        <Tabs defaultActiveKey="contexts">
          <TabPane 
            tab={
              <Space>
                <FileTextOutlined />
                <span>Contexts ({contexts.length})</span>
              </Space>
            } 
            key="contexts"
          >
            {contextsLoading ? (
              <div style={{ textAlign: 'center', padding: '24px' }}>
                <Spin size="large" />
              </div>
            ) : contexts.length > 0 ? (
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
