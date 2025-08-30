import React, { useState, useEffect } from 'react';
import { Select, Typography, Space, Tag, Avatar, Spin } from 'antd';
import { FolderOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { Project } from '../../services/projectApi';
import ProjectApi from '../../services/projectApi';
import { useAuthContext } from '../../contexts/AuthContext';

const { Text } = Typography;
const { Option } = Select;

interface ProjectSwitcherProps {
  currentProject?: string;
  onProjectChange: (projectId: string, project: Project) => void;
  size?: 'small' | 'middle' | 'large';
  style?: React.CSSProperties;
}

const ProjectSwitcher: React.FC<ProjectSwitcherProps> = ({
  currentProject,
  onProjectChange,
  size = 'middle',
  style
}) => {
  const { isAuthenticated, isLoading: authLoading } = useAuthContext();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      loadProjects();
    }
  }, [isAuthenticated, authLoading]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const response = await ProjectApi.getAllProjects();
      setProjects(response.projects.filter(p => p.status === 'active'));
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  };

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
    if (days < 7) return `${days}d ago`;
    return `${Math.floor(days / 7)}w ago`;
  };

  const handleChange = (value: string) => {
    const project = projects.find(p => p.id === value);
    if (project) {
      onProjectChange(value, project);
    }
  };

  return (
    <Select
      value={currentProject}
      onChange={handleChange}
      style={{ minWidth: 200, ...style }}
      size={size}
      loading={loading}
      placeholder="Select a project..."
      notFoundContent={loading ? <Spin size="small" /> : 'No projects found'}
      optionLabelProp="label"
    >
      {projects.map(project => (
        <Option key={project.id} value={project.id} label={project.name}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Space size="small">
              <Avatar 
                size="small" 
                icon={<FolderOutlined />} 
                style={{ backgroundColor: '#722ed1' }}
              />
              <div>
                <div style={{ fontWeight: 500 }}>
                  {project.name}
                  {currentProject === project.id && (
                    <CheckCircleOutlined style={{ marginLeft: 4, color: '#52c41a' }} />
                  )}
                </div>
                <div style={{ fontSize: '12px', color: '#999' }}>
                  {project.context_count} contexts • {formatLastActivity(project.last_activity)}
                </div>
              </div>
            </Space>
            <Tag 
              color={getStatusColor(project.status)} 
              style={{ marginLeft: 8, fontSize: '11px', padding: '0 4px' }}
            >
              {project.status}
            </Tag>
          </div>
        </Option>
      ))}
    </Select>
  );
};

export default ProjectSwitcher;
