import React, { useState, useEffect } from 'react';
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
  Input,
  Tag,
  Badge,
  Statistic,
  Row,
  Col
} from 'antd';
import { 
  TeamOutlined, 
  PlusOutlined, 
  SearchOutlined,
  RobotOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  MinusCircleOutlined,
  UnorderedListOutlined,
  MessageOutlined,
  ExclamationCircleTwoTone
} from '@ant-design/icons';
import AgentCard from '../components/agents/AgentCard';
import AgentForm from '../components/agents/AgentForm';
import AgentApi, { 
  Agent, 
  AgentTask,
  CreateAgentRequest,
  UpdateAgentRequest
} from '../services/agentApi';
import useWebSocket from '../hooks/useWebSocket';

const { Title, Text } = Typography;
const { Search } = Input;
const { TabPane } = Tabs;

const Agents: React.FC = () => {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | undefined>(undefined);
  const [formLoading, setFormLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('agents');

  // WebSocket connection for real-time updates
  const token = localStorage.getItem('aidis_token');
  const backendPort = process.env.REACT_APP_BACKEND_PORT || '5001';
  const wsUrl = token ? `ws://localhost:${backendPort}/ws?token=${encodeURIComponent(token)}` : null;
  
  const { isConnected, sendMessage } = useWebSocket(wsUrl, {
    onMessage: (message) => {
      switch (message.type) {
        case 'agent_status_update':
          handleAgentStatusUpdate(message.data);
          break;
        case 'task_update':
          handleTaskUpdate(message.data);
          break;
        default:
          console.log('Unknown WebSocket message:', message);
      }
    },
    onOpen: () => {
      console.log('WebSocket connected for agent updates');
    },
    onClose: () => {
      console.log('WebSocket disconnected');
    }
  });

  useEffect(() => {
    loadAgents();
    loadTasks();
  }, []);

  const loadAgents = async () => {
    setLoading(true);
    try {
      const response = await AgentApi.getAllAgents();
      setAgents(response.agents);
    } catch (error) {
      message.error('Failed to load agents');
      console.error('Load agents error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTasks = async () => {
    setTasksLoading(true);
    try {
      const response = await AgentApi.getAllTasks();
      setTasks(response.tasks);
    } catch (error) {
      message.error('Failed to load tasks');
      console.error('Load tasks error:', error);
    } finally {
      setTasksLoading(false);
    }
  };

  const handleAgentStatusUpdate = (data: any) => {
    setAgents(prev => prev.map(agent => 
      agent.id === data.agentId 
        ? { ...agent, status: data.status, last_seen: data.last_seen }
        : agent
    ));
  };

  const handleTaskUpdate = (data: any) => {
    loadTasks(); // Reload tasks on update
  };

  const handleCreateAgent = () => {
    setEditingAgent(undefined);
    setFormVisible(true);
  };

  const handleEditAgent = (agent: Agent) => {
    setEditingAgent(agent);
    setFormVisible(true);
  };

  const handleDeleteAgent = (agent: Agent) => {
    Modal.confirm({
      title: 'Delete Agent',
      icon: <ExclamationCircleTwoTone twoToneColor="#ff4d4f" />,
      content: (
        <div>
          <Text>Are you sure you want to delete the agent </Text>
          <Text strong>"{agent.name}"</Text>
          <Text>?</Text>
          <br />
          <Text type="danger" style={{ marginTop: 8, display: 'block' }}>
            This action cannot be undone and will remove all associated sessions and messages.
          </Text>
        </div>
      ),
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await AgentApi.deleteAgent(agent.id);
          message.success('Agent deleted successfully');
          loadAgents();
          loadTasks();
        } catch (error) {
          message.error('Failed to delete agent');
          console.error('Delete agent error:', error);
        }
      }
    });
  };

  const handleViewAgent = (agent: Agent) => {
    // Navigate to agent detail view (to be implemented)
    message.info(`Agent detail view for ${agent.name} - coming soon!`);
  };

  const handleFormSubmit = async (data: CreateAgentRequest | UpdateAgentRequest) => {
    setFormLoading(true);
    try {
      if (editingAgent) {
        await AgentApi.updateAgent(editingAgent.id, data);
        message.success('Agent updated successfully');
      } else {
        await AgentApi.createAgent(data as CreateAgentRequest);
        message.success('Agent registered successfully');
      }
      
      setFormVisible(false);
      setEditingAgent(undefined);
      loadAgents();
      loadTasks();
    } catch (error) {
      message.error(editingAgent ? 'Failed to update agent' : 'Failed to register agent');
      console.error('Form submit error:', error);
    } finally {
      setFormLoading(false);
    }
  };

  const handleFormCancel = () => {
    setFormVisible(false);
    setEditingAgent(undefined);
  };

  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (agent.capabilities && agent.capabilities.some(cap => 
      cap.toLowerCase().includes(searchQuery.toLowerCase())
    ))
  );

  const getStatusStats = () => {
    const stats = { active: 0, busy: 0, offline: 0, error: 0 };
    agents.forEach(agent => {
      stats[agent.status]++;
    });
    return stats;
  };

  const getTaskStats = () => {
    const stats = { total: tasks.length, active: 0, completed: 0, overdue: 0 };
    tasks.forEach(task => {
      if (task.status === 'in_progress' || task.status === 'todo' || task.status === 'blocked') {
        stats.active++;
      } else if (task.status === 'completed') {
        stats.completed++;
      }
      // Add overdue logic based on created date if needed
    });
    return stats;
  };

  const renderAgentsContent = () => {
    if (loading) {
      return (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Spin size="large" />
        </div>
      );
    }

    if (agents.length === 0) {
      return (
        <Card>
          <Empty
            image={<RobotOutlined style={{ fontSize: '64px', color: '#722ed1' }} />}
            imageStyle={{ height: 80 }}
            description={
              <Space direction="vertical" size="small">
                <Text strong>No Agents Registered</Text>
                <Text type="secondary">
                  Register your first AI agent to start coordinating development tasks
                </Text>
              </Space>
            }
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateAgent}>
              Register First Agent
            </Button>
          </Empty>
        </Card>
      );
    }

    return (
      <div>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Search
            placeholder="Search agents by name, type, or capabilities..."
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ maxWidth: 400 }}
            allowClear
          />
          
          <Space>
            {isConnected && (
              <Tag color="green" icon={<CheckCircleOutlined />}>
                Live Updates
              </Tag>
            )}
            <Badge count={agents.filter(a => a.status === 'error').length}>
              <Tag icon={<ExclamationCircleOutlined />} color="red">
                Errors
              </Tag>
            </Badge>
          </Space>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '16px' }}>
          {filteredAgents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onEdit={handleEditAgent}
              onDelete={handleDeleteAgent}
              onView={handleViewAgent}
            />
          ))}
        </div>

        {filteredAgents.length === 0 && searchQuery && (
          <Card style={{ marginTop: 16 }}>
            <Empty
              description="No agents match your search"
              image={<SearchOutlined style={{ fontSize: '48px', color: '#ccc' }} />}
            />
          </Card>
        )}
      </div>
    );
  };

  const renderTasksContent = () => {
    if (tasksLoading) {
      return (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Spin size="large" />
        </div>
      );
    }

    if (tasks.length === 0) {
      return (
        <Card>
          <Empty
            image={<UnorderedListOutlined style={{ fontSize: '64px', color: '#1890ff' }} />}
            imageStyle={{ height: 80 }}
            description={
              <Space direction="vertical" size="small">
                <Text strong>No Tasks Yet</Text>
                <Text type="secondary">
                  Tasks will appear here when agents are assigned work
                </Text>
              </Space>
            }
          />
        </Card>
      );
    }

    // Simple task list (can be enhanced later)
    return (
      <div style={{ display: 'grid', gap: '12px' }}>
        {tasks.map(task => (
          <Card key={task.id} size="small">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <Text strong>{task.title}</Text>
                <div style={{ marginTop: 4 }}>
                  <Space>
                    <Tag color={task.priority === 'urgent' ? 'red' : task.priority === 'high' ? 'orange' : 'default'}>
                      {task.priority}
                    </Tag>
                    <Tag color={task.status === 'completed' ? 'green' : task.status === 'in_progress' ? 'blue' : 'default'}>
                      {task.status.replace('_', ' ')}
                    </Tag>
                    {task.assigned_to_name && (
                      <Tag>{task.assigned_to_name}</Tag>
                    )}
                  </Space>
                </div>
                {task.description && (
                  <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginTop: 4 }}>
                    {task.description.length > 100 ? `${task.description.substring(0, 100)}...` : task.description}
                  </Text>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  };

  const statusStats = getStatusStats();
  const taskStats = getTaskStats();

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={2}>Agent Management</Title>
          <Text type="secondary">
            Coordinate AI agents, assign tasks, and monitor progress across your development team
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateAgent}>
          Register Agent
        </Button>
      </div>

      {/* Statistics Overview */}
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic 
              title="Total Agents" 
              value={agents.length}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic 
              title="Active Agents" 
              value={statusStats.active}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic 
              title="Active Tasks" 
              value={taskStats.active}
              valueStyle={{ color: '#1890ff' }}
              prefix={<UnorderedListOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic 
              title="Completed Tasks" 
              value={taskStats.completed}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Main Content Tabs */}
      <Tabs activeKey={activeTab} onChange={setActiveTab} type="card">
        <TabPane 
          tab={
            <Space>
              <TeamOutlined />
              Agents ({agents.length})
            </Space>
          } 
          key="agents"
        >
          {renderAgentsContent()}
        </TabPane>

        <TabPane 
          tab={
            <Space>
              <UnorderedListOutlined />
              Tasks ({tasks.length})
            </Space>
          } 
          key="tasks"
        >
          {renderTasksContent()}
        </TabPane>
      </Tabs>

      {/* Agent Form Modal */}
      <AgentForm
        visible={formVisible}
        agent={editingAgent}
        onSubmit={handleFormSubmit}
        onCancel={handleFormCancel}
        loading={formLoading}
      />
    </Space>
  );
};

export default Agents;
