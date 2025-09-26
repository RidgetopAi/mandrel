import React from 'react';
import { Card, Typography, Tag, Space, Statistic, Row, Col, Button, Dropdown, MenuProps } from 'antd';
import {
  FolderOutlined,
  MoreOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  GithubOutlined,
  FolderOpenOutlined
} from '@ant-design/icons';
import { ProjectEntity } from '../../api/generated';

const { Title, Text, Paragraph } = Typography;

// Extended type for project with computed statistics
type ProjectWithStats = ProjectEntity & {
  context_count?: number;
  session_count?: number;
  last_activity?: string;
};

interface ProjectCardProps {
  project: ProjectWithStats;
  onEdit: (project: ProjectWithStats) => void;
  onDelete: (project: ProjectWithStats) => void;
  onView: (project: ProjectWithStats) => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ 
  project, 
  onEdit, 
  onDelete, 
  onView 
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'green';
      case 'inactive': return 'orange';
      case 'archived': return 'red';
      default: return 'default';
    }
  };

  const formatLastActivity = (lastActivity?: string) => {
    if (!lastActivity) return 'No activity';
    
    const date = new Date(lastActivity);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
  };

  const dropdownItems: MenuProps['items'] = [
    {
      key: 'view',
      label: 'View Details',
      icon: <EyeOutlined />,
      onClick: () => onView(project)
    },
    {
      key: 'edit',
      label: 'Edit',
      icon: <EditOutlined />,
      onClick: () => onEdit(project)
    },
    {
      type: 'divider'
    },
    {
      key: 'delete',
      label: 'Delete',
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => onDelete(project)
    }
  ];

  return (
    <Card
      hoverable
      className="project-card"
      actions={[
        <Button 
          type="text" 
          icon={<EyeOutlined />} 
          onClick={() => onView(project)}
        >
          View
        </Button>,
        <Button 
          type="text" 
          icon={<EditOutlined />} 
          onClick={() => onEdit(project)}
        >
          Edit
        </Button>,
        <Dropdown 
          menu={{ items: dropdownItems }}
          trigger={['click']}
        >
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ]}
    >
      <div className="project-card-header">
        <Space align="start" style={{ width: '100%' }}>
          <FolderOutlined style={{ fontSize: '24px', color: '#722ed1' }} />
          <div style={{ flex: 1 }}>
            <Title level={4} style={{ margin: 0 }}>
              {project.name}
            </Title>
            <Space size="small" style={{ marginTop: '4px' }}>
              <Tag color={getStatusColor(project.status)}>
                {project.status.toUpperCase()}
              </Tag>
              {project.git_repo_url && (
                <Tag icon={<GithubOutlined />} color="blue">
                  Git
                </Tag>
              )}
              {project.root_directory && (
                <Tag icon={<FolderOpenOutlined />} color="purple">
                  Local
                </Tag>
              )}
            </Space>
          </div>
        </Space>
      </div>

      {project.description && (
        <Paragraph 
          type="secondary" 
          style={{ marginTop: '12px' }}
          ellipsis={{ rows: 2 }}
        >
          {project.description}
        </Paragraph>
      )}

      <Row gutter={16} style={{ marginTop: '16px' }}>
        <Col span={8}>
          <Statistic
            title="Contexts"
            value={project.context_count || 0}
            valueStyle={{ fontSize: '16px' }}
          />
        </Col>
        <Col span={8}>
          <Statistic
            title="Sessions"
            value={project.session_count || 0}
            valueStyle={{ fontSize: '16px' }}
          />
        </Col>
        <Col span={8}>
          <div>
            <Text type="secondary" style={{ fontSize: '12px', display: 'block' }}>
              Last Activity
            </Text>
            <Text style={{ fontSize: '16px', fontWeight: 500 }}>
              {formatLastActivity(project.last_activity)}
            </Text>
          </div>
        </Col>
      </Row>

      {project.created_at && (
        <Text type="secondary" style={{ fontSize: '12px', marginTop: '12px', display: 'block' }}>
          Created {new Date(project.created_at).toLocaleDateString()}
        </Text>
      )}
    </Card>
  );
};

export default ProjectCard;
