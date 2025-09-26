import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Card,
  Empty,
  Button,
  Space,
  message,
  Modal,
  Tabs,
  Spin,
  Input
} from 'antd';
import {
  FolderOutlined,
  PlusOutlined,
  SearchOutlined,
  BarChartOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import ProjectCard from '../components/projects/ProjectCard';
import ProjectForm from '../components/projects/ProjectForm';
import ProjectStats from '../components/projects/ProjectStats';
import SessionList from '../components/projects/SessionList';
import {
  useProjects,
  useProjectStats,
  useAllSessions,
  useCreateProject,
  useUpdateProject,
  useDeleteProject
} from '../hooks/useProjects';
import type { Project, ProjectStats as ProjectStatsType } from '../types/project';
import type { Session } from '../types/session';
import type { CreateProjectRequest, UpdateProjectRequest } from '../api/generated';
import '../components/projects/projects.css';

const { Title, Text } = Typography;
const { Search } = Input;
const { TabPane } = Tabs;

const Projects: React.FC = () => {
  const navigate = useNavigate();

  // React Query hooks for data fetching
  const { data: projectsData, isLoading: loading, refetch: refetchProjects } = useProjects({ page: 1, limit: 100 });
  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } = useProjectStats();
  const { data: sessionsData, isLoading: sessionsLoading, refetch: refetchSessions } = useAllSessions();

  // Mutations
  const createProjectMutation = useCreateProject();
  const updateProjectMutation = useUpdateProject();
  const deleteProjectMutation = useDeleteProject();

  // Local UI state
  const [formVisible, setFormVisible] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('projects');

  // Extract data from React Query responses
  const projects: Project[] = (projectsData?.projects && projectsData.projects.length > 0)
    ? projectsData.projects
    : projectsData?.data?.projects ?? [];
  const stats: ProjectStatsType | null = statsData ?? null;
  const sessions: Session[] = sessionsData?.sessions ?? [];
  const formLoading = createProjectMutation.isPending || updateProjectMutation.isPending;

  // Refetch helper to refresh all data
  const refetchAllData = () => {
    refetchProjects();
    refetchStats();
    refetchSessions();
  };

  const handleCreateProject = () => {
    setEditingProject(undefined);
    setFormVisible(true);
  };

  const handleEditProject = (project: Project) => {
    setEditingProject(project);
    setFormVisible(true);
  };

  const handleDeleteProject = (project: Project) => {
    Modal.confirm({
      title: 'Delete Project',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <Text>Are you sure you want to delete the project </Text>
          <Text strong>"{project.name}"</Text>
          <Text>?</Text>
          <br />
          <Text type="danger" style={{ marginTop: 8, display: 'block' }}>
            This action cannot be undone and will permanently delete all associated contexts and sessions.
          </Text>
        </div>
      ),
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await deleteProjectMutation.mutateAsync(project.id);
          message.success('Project deleted successfully');
          refetchAllData();
        } catch (error) {
          message.error('Failed to delete project');
          console.error('Delete project error:', error);
        }
      }
    });
  };

  const handleViewProject = (project: Project) => {
    navigate(`/projects/${project.id}`);
  };

  const handleFormSubmit = async (data: CreateProjectRequest | UpdateProjectRequest) => {
    try {
      if (editingProject) {
        await updateProjectMutation.mutateAsync({
          id: editingProject.id,
          data: data as UpdateProjectRequest
        });
        message.success('Project updated successfully');
      } else {
        await createProjectMutation.mutateAsync(data as CreateProjectRequest);
        message.success('Project created successfully');
      }

      setFormVisible(false);
      setEditingProject(undefined);
      refetchAllData();
    } catch (error) {
      message.error(editingProject ? 'Failed to update project' : 'Failed to create project');
      console.error('Form submit error:', error);
    }
  };

  const handleFormCancel = () => {
    setFormVisible(false);
    setEditingProject(undefined);
  };

  const handleViewSession = (session: Session) => {
    console.log('Navigating to session:', session.id);
    navigate(`/sessions/${session.id}`);
  };

  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (project.description && project.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const renderProjectsContent = () => {
    if (loading) {
      return (
        <div className="project-loading">
          <Spin size="large" />
        </div>
      );
    }

    if (projects.length === 0) {
      return (
        <Card>
          <Empty
            image={<FolderOutlined style={{ fontSize: '64px', color: '#722ed1' }} />}
            imageStyle={{ height: 80 }}
            description={
              <Space direction="vertical" size="small">
                <Text strong>No Projects Yet</Text>
                <Text type="secondary">
                  Create your first project to start organizing your development work
                </Text>
              </Space>
            }
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateProject}>
              Create First Project
            </Button>
          </Empty>
        </Card>
      );
    }

    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <Search
            placeholder="Search projects..."
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ maxWidth: 400 }}
            allowClear
          />
        </div>
        
        <div className="project-list">
          {filteredProjects.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              onEdit={handleEditProject}
              onDelete={handleDeleteProject}
              onView={handleViewProject}
            />
          ))}
        </div>

        {filteredProjects.length === 0 && searchQuery && (
          <Card>
            <Empty
              description="No projects match your search"
              image={<SearchOutlined style={{ fontSize: '48px', color: '#ccc' }} />}
            />
          </Card>
        )}
      </div>
    );
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={2}>Project Management</Title>
          <Text type="secondary">
            Manage your projects and track development sessions across contexts
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateProject}>
          New Project
        </Button>
      </div>

      {/* Main Content Tabs */}
      <Tabs activeKey={activeTab} onChange={setActiveTab} type="card">
        <TabPane 
          tab={
            <Space>
              <FolderOutlined />
              Projects ({projects.length})
            </Space>
          } 
          key="projects"
        >
          {renderProjectsContent()}
        </TabPane>

        <TabPane 
          tab={
            <Space>
              <BarChartOutlined />
              Analytics
            </Space>
          } 
          key="analytics"
        >
          {stats && <ProjectStats stats={stats} loading={statsLoading} />}
        </TabPane>

        <TabPane 
          tab={
            <Space>
              <ClockCircleOutlined />
              Sessions ({sessions.length})
            </Space>
          } 
          key="sessions"
        >
          <SessionList 
            sessions={sessions}
            loading={sessionsLoading}
            onViewSession={handleViewSession}
            showProject={true}
          />
        </TabPane>
      </Tabs>

      {/* Project Form Modal */}
      <ProjectForm
        visible={formVisible}
        project={editingProject}
        onSubmit={handleFormSubmit}
        onCancel={handleFormCancel}
        loading={formLoading}
      />
    </Space>
  );
};

export default Projects;
