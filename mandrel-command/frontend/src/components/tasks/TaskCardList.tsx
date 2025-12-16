import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Tag, 
  Button, 
  Space, 
  Popconfirm, 
  Select, 
  Input, 
  Row, 
  Col,
  Badge,
  Typography,
  Tooltip
} from 'antd';
import './TaskCard.css';
import { 
  EditOutlined, 
  DeleteOutlined, 
  UserOutlined,
  CalendarOutlined,
  TagOutlined,
  ProjectOutlined,
  BugOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  StopOutlined,
  ExpandAltOutlined,
  ShrinkOutlined
} from '@ant-design/icons';
import TaskForm from './TaskForm';

const { Search } = Input;
const { Option } = Select;
const { Text, Paragraph } = Typography;

interface Task {
  id: string;
  project_id: string;
  title: string;
  description?: string;
  type: string;
  status: 'todo' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: string;
  dependencies: string[];
  tags: string[];
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface TaskCardListProps {
  tasks: Task[];
  loading: boolean;
  onUpdateTask: (taskId: string, updates: any) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  projects: Array<{ id: string; name: string; }>;
}

const TaskCardList: React.FC<TaskCardListProps> = ({ 
  tasks, 
  loading, 
  onUpdateTask, 
  onDeleteTask,
  projects 
}) => {
  const [filteredTasks, setFilteredTasks] = useState<Task[]>(tasks);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  // Update filtered tasks when tasks prop changes
  useEffect(() => {
    let filtered = tasks;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(task => 
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Apply status filter
    if (statusFilter) {
      filtered = filtered.filter(task => task.status === statusFilter);
    }

    // Apply priority filter
    if (priorityFilter) {
      filtered = filtered.filter(task => task.priority === priorityFilter);
    }

    setFilteredTasks(filtered);
  }, [tasks, searchTerm, statusFilter, priorityFilter]);

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'todo': 'blue',
      'in_progress': 'orange',
      'blocked': 'red',
      'completed': 'green',
      'cancelled': 'gray'
    };
    return colors[status] || 'blue';
  };

  const getStatusIcon = (status: string) => {
    const icons: Record<string, React.ReactNode> = {
      'todo': <ClockCircleOutlined />,
      'in_progress': <ExclamationCircleOutlined />,
      'blocked': <StopOutlined />,
      'completed': <CheckCircleOutlined />,
      'cancelled': <BugOutlined />
    };
    return icons[status] || <ClockCircleOutlined />;
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      'low': 'green',
      'medium': 'blue',
      'high': 'orange',
      'urgent': 'red'
    };
    return colors[priority] || 'blue';
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    await onUpdateTask(taskId, { status: newStatus });
  };

  const handleAssigneeChange = async (taskId: string, assignedTo: string) => {
    await onUpdateTask(taskId, { assigned_to: assignedTo });
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setShowEditForm(true);
  };

  const handleEditSubmit = async (updates: any) => {
    if (editingTask) {
      await onUpdateTask(editingTask.id, updates);
      setShowEditForm(false);
      setEditingTask(null);
    }
  };

  const toggleTaskExpansion = (taskId: string) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedTasks(newExpanded);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getProjectName = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    return project?.name || 'Unknown Project';
  };

  return (
    <div>
      {/* Filters */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Search
          placeholder="Search tasks..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: 250 }}
        />
        <Select
          placeholder="Filter by Status"
          value={statusFilter}
          onChange={setStatusFilter}
          allowClear
          style={{ width: 150 }}
        >
          <Option value="todo">To Do</Option>
          <Option value="in_progress">In Progress</Option>
          <Option value="blocked">Blocked</Option>
          <Option value="completed">Completed</Option>
          <Option value="cancelled">Cancelled</Option>
        </Select>
        <Select
          placeholder="Filter by Priority"
          value={priorityFilter}
          onChange={setPriorityFilter}
          allowClear
          style={{ width: 150 }}
        >
          <Option value="low">Low</Option>
          <Option value="medium">Medium</Option>
          <Option value="high">High</Option>
          <Option value="urgent">Urgent</Option>
        </Select>
      </div>

      {/* Task Cards */}
      <Row gutter={[16, 16]} className="task-cards-grid">
        {filteredTasks.map(task => {
          const isExpanded = expandedTasks.has(task.id);
          return (
            <Col 
              xs={24} 
              sm={isExpanded ? 24 : 12} 
              lg={isExpanded ? 16 : 8} 
              xl={isExpanded ? 16 : 8} 
              key={task.id}
            >
              <Badge.Ribbon 
                text={task.priority.toUpperCase()} 
                color={getPriorityColor(task.priority)}
              >
                <Card
                  hoverable
                  className={`task-card ${isExpanded ? 'expanded' : ''} priority-${task.priority} status-${task.status}`}
                  style={{ 
                    height: isExpanded ? 'auto' : '280px',
                    cursor: 'pointer',
                    border: `2px solid ${getStatusColor(task.status)}40`,
                    borderRadius: '12px',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                  onClick={() => toggleTaskExpansion(task.id)}
                  title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: 1, minWidth: 0 }}>
                        <div style={{ marginTop: 2 }}>{getStatusIcon(task.status)}</div>
                        <Text
                          strong
                          ellipsis={isExpanded ? false : true}
                          style={{
                            maxWidth: isExpanded ? 'none' : 200,
                            wordBreak: isExpanded ? 'break-word' : 'normal',
                            whiteSpace: isExpanded ? 'normal' : 'nowrap',
                            flex: 1
                          }}
                        >
                          {task.title}
                        </Text>
                      </div>
                      <Tooltip title={isExpanded ? "Click to collapse details" : "Click to expand details"}>
                        <div style={{
                          padding: '4px',
                          borderRadius: '4px',
                          backgroundColor: isExpanded ? '#e6f7ff' : '#f5f5f5',
                          transition: 'all 0.2s ease',
                          flexShrink: 0
                        }}>
                          {isExpanded ? <ShrinkOutlined style={{ color: '#1890ff' }} /> : <ExpandAltOutlined />}
                        </div>
                      </Tooltip>
                    </div>
                  }
                  actions={[
                    <Tooltip title="Quick Edit">
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(task);
                        }}
                      />
                    </Tooltip>,
                    <Popconfirm
                      title="Delete this task?"
                      onConfirm={() => onDeleteTask(task.id)}
                    >
                      <Tooltip title="Delete">
                        <Button
                          type="text"
                          size="small"
                          icon={<DeleteOutlined />}
                          danger
                          onClick={(e) => e.stopPropagation()}
                        />
                      </Tooltip>
                    </Popconfirm>
                  ]}
                >
                  <div style={{ minHeight: isExpanded ? 'auto' : '120px' }}>
                    {/* Status Tag */}
                    <div style={{ marginBottom: 12 }}>
                      <Tag 
                        className="task-status-tag"
                        color={getStatusColor(task.status)} 
                        icon={getStatusIcon(task.status)}
                      >
                        {task.status.replace('_', ' ')}
                      </Tag>
                    </div>
                    
                    {/* Basic Info */}
                    <div style={{ marginBottom: 12 }}>
                      <Paragraph 
                        ellipsis={isExpanded ? false : { rows: 2 }}
                        style={{ 
                          fontSize: '14px', 
                          color: '#666', 
                          marginBottom: 8,
                          minHeight: '40px'
                        }}
                      >
                        {task.description || 'No description provided'}
                      </Paragraph>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <UserOutlined />
                        <Text style={{ fontSize: '12px' }}>
                          {task.assigned_to || 'Unassigned'}
                        </Text>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ProjectOutlined />
                        <Text style={{ fontSize: '12px' }}>
                          {getProjectName(task.project_id)}
                        </Text>
                      </div>
                    </div>

                    {/* Tags */}
                    {task.tags.length > 0 && (
                      <div className="task-tags" style={{ marginBottom: 12 }}>
                        {task.tags.slice(0, isExpanded ? task.tags.length : 2).map(tag => (
                          <Tag key={tag} style={{ marginBottom: 4, fontSize: '12px' }}>
                            {tag}
                          </Tag>
                        ))}
                        {!isExpanded && task.tags.length > 2 && (
                          <Tag color="blue" style={{ fontSize: '12px' }}>+{task.tags.length - 2}</Tag>
                        )}
                      </div>
                    )}

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div 
                        className="task-details-expand" 
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          background: 'linear-gradient(135deg, #fafafa 0%, #f0f0f0 100%)',
                          padding: '12px',
                          borderRadius: '8px',
                          margin: '8px -16px -16px -16px',
                          border: '1px solid #e8e8e8'
                        }}
                      >
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          marginBottom: '12px',
                          paddingBottom: '8px',
                          borderBottom: '1px solid #d9d9d9'
                        }}>
                          <Text strong style={{ color: '#1890ff', fontSize: '13px' }}>
                            📋 Detailed Information
                          </Text>
                        </div>
                        
                        <Space direction="vertical" size="small" style={{ width: '100%' }}>
                          {/* Status and Priority Controls */}
                          <div>
                            <Text strong style={{ fontSize: '12px', display: 'block', marginBottom: 4 }}>
                              Status:
                            </Text>
                            <Select
                              value={task.status}
                              style={{ width: '100%' }}
                              size="small"
                              onChange={(value) => handleStatusChange(task.id, value)}
                            >
                              <Option value="todo">To Do</Option>
                              <Option value="in_progress">In Progress</Option>
                              <Option value="blocked">Blocked</Option>
                              <Option value="completed">Completed</Option>
                              <Option value="cancelled">Cancelled</Option>
                            </Select>
                          </div>

                          <div>
                            <Text strong style={{ fontSize: '12px', display: 'block', marginBottom: 4 }}>
                              Assign to:
                            </Text>
                            <Input
                              value={task.assigned_to || ''}
                              placeholder="Unassigned"
                              style={{ width: '100%' }}
                              size="small"
                              prefix={<UserOutlined />}
                              onChange={(e) => handleAssigneeChange(task.id, e.target.value)}
                            />
                          </div>

                          {/* Metadata */}
                          <div style={{
                            background: '#fff',
                            padding: '10px',
                            borderRadius: '6px',
                            border: '1px solid #e8e8e8'
                          }}>
                            <Text strong style={{ fontSize: '12px', display: 'block', marginBottom: 8, color: '#666' }}>
                              ℹ️ Task Information
                            </Text>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <CalendarOutlined style={{ color: '#52c41a' }} />
                              <Text style={{ fontSize: '12px' }}>
                                <strong>Created:</strong> {formatDate(task.created_at)}
                              </Text>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <CalendarOutlined style={{ color: '#1890ff' }} />
                              <Text style={{ fontSize: '12px' }}>
                                <strong>Updated:</strong> {formatDate(task.updated_at)}
                              </Text>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <TagOutlined style={{ color: '#722ed1' }} />
                              <Text style={{ fontSize: '12px' }}>
                                <strong>Type:</strong> {task.type}
                              </Text>
                            </div>
                          </div>

                          {/* Dependencies */}
                          {task.dependencies.length > 0 && (
                            <div style={{
                              background: '#fff',
                              padding: '10px',
                              borderRadius: '6px',
                              border: '1px solid #e8e8e8'
                            }}>
                              <Text strong style={{ fontSize: '12px', display: 'block', marginBottom: 8, color: '#666' }}>
                                🔗 Dependencies ({task.dependencies.length})
                              </Text>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {task.dependencies.map(dep => (
                                  <Tag key={dep} color="volcano" style={{ fontSize: '12px', margin: '2px' }}>
                                    {dep}
                                  </Tag>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Task ID and Additional Metadata */}
                          {task.metadata && Object.keys(task.metadata).length > 0 && (
                            <div style={{
                              background: '#fff',
                              padding: '10px',
                              borderRadius: '6px',
                              border: '1px solid #e8e8e8'
                            }}>
                              <Text strong style={{ fontSize: '12px', display: 'block', marginBottom: 8, color: '#666' }}>
                                🔧 Additional Details
                              </Text>
                              <div style={{ fontSize: '12px', color: '#666' }}>
                                <div><strong>Task ID:</strong> {task.id}</div>
                                {Object.entries(task.metadata).map(([key, value]) => (
                                  <div key={key}><strong>{key}:</strong> {String(value)}</div>
                                ))}
                              </div>
                            </div>
                          )}
                        </Space>
                      </div>
                    )}
                  </div>
                </Card>
              </Badge.Ribbon>
            </Col>
          );
        })}
      </Row>

      {filteredTasks.length === 0 && !loading && (
        <div className="task-empty-state">
          <ExclamationCircleOutlined style={{ fontSize: '48px' }} />
          <div style={{ fontSize: '18px', fontWeight: '500', marginBottom: '8px' }}>No tasks found</div>
          <div style={{ fontSize: '14px' }}>Try adjusting your filters or create a new task</div>
        </div>
      )}

      {/* Edit Task Modal */}
      <TaskForm
        visible={showEditForm}
        task={editingTask || undefined}
        projectId={editingTask?.project_id || ''}
        onSubmit={handleEditSubmit}
        onCancel={() => {
          setShowEditForm(false);
          setEditingTask(null);
        }}
      />
    </div>
  );
};

export default TaskCardList;