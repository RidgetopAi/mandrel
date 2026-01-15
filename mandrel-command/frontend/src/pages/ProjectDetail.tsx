import React from 'react';
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
  Empty
} from 'antd';
import {
  ArrowLeftOutlined,
  FolderOutlined,
  GithubOutlined,
  FolderOpenOutlined,
  DatabaseOutlined,
  ClockCircleOutlined,
  EditOutlined
} from '@ant-design/icons';
import { useProject, useProjectSessions } from '../hooks/useProjects';
import SessionList from '../components/projects/SessionList';
import type { Session } from '../types/session';
import { useTheme } from '../contexts/ThemeContext';

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;

const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { themeMode } = useTheme();

  // React Query hooks for data fetching
  const {
    data: projectResponse,
    isLoading: projectLoading,
    error: projectError
  } = useProject(id);

  const {
    data: sessionsResponse,
    isLoading: sessionsLoading,
    error: sessionsError
  } = useProjectSessions(id);

  // Extract data from API responses
  const project = projectResponse?.data;
  const sessions = (sessionsResponse?.data as any)?.sessions || [];

  // Handle errors
  React.useEffect(() => {
    if (projectError) {
      console.error('Load project error:', projectError);
      message.error('Failed to load project details');
      navigate('/projects');
    }
  }, [projectError, navigate]);

  React.useEffect(() => {
    if (sessionsError) {
      console.error('Load sessions error:', sessionsError);
      message.error('Failed to load project sessions');
    }
  }, [sessionsError]);

  const handleViewSession = (session: Session) => {
    message.info(`Viewing session: ${session.id.slice(0, 8)}...`);
    // Could navigate to context browser with session filter
  };

  const handleEditProject = () => {
    // Could open edit modal or navigate to edit page
    message.info('Edit project functionality would be implemented here');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'green';
      case 'inactive': return 'orange';
      case 'archived': return 'red';
      default: return 'default';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (projectLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" tip="Loading project details..." />
      </div>
    );
  }

  if (!project) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Empty
          description="Project not found"
          image={<FolderOutlined style={{ fontSize: '64px', color: '#ccc' }} />}
        >
          <Button type="primary" onClick={() => navigate('/projects')}>
            Back to Projects
          </Button>
        </Empty>
      </div>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={() => navigate('/projects')}
            style={{ marginBottom: '16px' }}
          >
            Back to Projects
          </Button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <FolderOutlined style={{ fontSize: '32px', color: '#722ed1' }} />
            <div>
              <Title level={2} style={{ margin: 0 }}>
                {project?.name}
              </Title>
              <Space size="small" style={{ marginTop: '8px' }}>
                <Tag color={getStatusColor(project?.status || 'inactive')}>
                  {project?.status?.toUpperCase()}
                </Tag>
                {project?.git_repo_url && (
                  <Tag icon={<GithubOutlined />} color="blue">
                    Git Repository
                  </Tag>
                )}
                {project?.root_directory && (
                  <Tag icon={<FolderOpenOutlined />} color="purple">
                    Local Directory
                  </Tag>
                )}
              </Space>
            </div>
          </div>
        </div>
        <Button type="primary" icon={<EditOutlined />} onClick={handleEditProject}>
          Edit Project
        </Button>
      </div>

      {/* Project Overview */}
      <Card title="Project Overview">
        {project?.description && (
          <Paragraph style={{ fontSize: '16px', marginBottom: '24px' }}>
            {project.description}
          </Paragraph>
        )}

        <Descriptions column={2} bordered>
          <Descriptions.Item label="Created">
            {project?.created_at ? formatDate(project.created_at) : 'Unknown'}
          </Descriptions.Item>
          <Descriptions.Item label="Last Updated">
            {project?.updated_at ? formatDate(project.updated_at) : 'Never'}
          </Descriptions.Item>
          {project?.git_repo_url && (
            <Descriptions.Item label="Git Repository" span={2}>
              <a href={project.git_repo_url} target="_blank" rel="noopener noreferrer">
                {project.git_repo_url}
              </a>
            </Descriptions.Item>
          )}
          {project?.root_directory && (
            <Descriptions.Item label="Root Directory" span={2}>
              <Text code>{project.root_directory}</Text>
            </Descriptions.Item>
          )}
          {project?.metadata && Object.keys(project.metadata).length > 0 && (
            <Descriptions.Item label="Metadata" span={2}>
              <pre style={{
                background: themeMode === 'dark' ? '#262626' : '#f5f5f5',
                padding: '8px',
                borderRadius: '4px',
                color: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.85)' : 'inherit'
              }}>
                {JSON.stringify(project.metadata, null, 2)}
              </pre>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* Statistics */}
      <Row gutter={[24, 24]}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Total Contexts"
              value={(project as any)?.context_count || 0}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Total Sessions"
              value={(project as any)?.session_count || 0}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Days Active"
              value={project?.created_at ? Math.ceil((new Date().getTime() - new Date(project.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0}
              suffix="days"
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Detailed Information Tabs */}
      <Tabs defaultActiveKey="sessions" type="card">
        <TabPane 
          tab={
            <Space>
              <ClockCircleOutlined />
              Sessions ({sessions.length})
            </Space>
          } 
          key="sessions"
        >
          {sessions.length > 0 ? (
            <SessionList 
              sessions={sessions}
              loading={sessionsLoading}
              onViewSession={handleViewSession}
              showProject={false}
            />
          ) : (
            <Card>
              <Empty
                description="No sessions found for this project"
                image={<ClockCircleOutlined style={{ fontSize: '48px', color: '#ccc' }} />}
              />
            </Card>
          )}
        </TabPane>
        

      </Tabs>
    </Space>
  );
};

export default ProjectDetail;
