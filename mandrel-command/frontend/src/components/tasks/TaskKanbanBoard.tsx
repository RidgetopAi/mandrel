import React, { useState, useMemo } from 'react';
import {
  Card,
  Tag,
  Button,
  Space,
  Popconfirm,
  Input,
  Badge,
  Typography,
  Tooltip,
  Avatar,
  Spin
} from 'antd';
import './TaskCard.css';
import {
  EditOutlined,
  DeleteOutlined,
  UserOutlined,
  ProjectOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  StopOutlined
} from '@ant-design/icons';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import TaskForm from './TaskForm';

const { Text, Paragraph } = Typography;
const { Search } = Input;

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

interface TaskKanbanBoardProps {
  tasks: Task[];
  loading: boolean;
  onUpdateTask: (taskId: string, updates: any) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onBulkUpdateTasks?: (updates: Array<{ id: string; status: string }>) => Promise<void>;
  projects: Array<{ id: string; name: string; }>;
}

type ColumnId = 'todo' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';

const COLUMNS: Array<{ id: ColumnId; title: string; icon: React.ReactNode; color: string }> = [
  { id: 'todo', title: 'To Do', icon: <ClockCircleOutlined />, color: '#1890ff' },
  { id: 'in_progress', title: 'In Progress', icon: <ExclamationCircleOutlined />, color: '#faad14' },
  { id: 'blocked', title: 'Blocked', icon: <StopOutlined />, color: '#ff4d4f' },
  { id: 'completed', title: 'Completed', icon: <CheckCircleOutlined />, color: '#52c41a' },
  { id: 'cancelled', title: 'Cancelled', icon: <DeleteOutlined />, color: '#8c8c8c' }
];

const TaskKanbanBoard: React.FC<TaskKanbanBoardProps> = ({
  tasks,
  loading,
  onUpdateTask,
  onDeleteTask,
  onBulkUpdateTasks,
  projects
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  // Group tasks by status column
  const tasksByColumn = useMemo(() => {
    let filtered = tasks;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(task =>
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Group by status
    const grouped: Record<ColumnId, Task[]> = {
      todo: [],
      in_progress: [],
      blocked: [],
      completed: [],
      cancelled: []
    };

    filtered.forEach(task => {
      if (grouped[task.status]) {
        grouped[task.status].push(task);
      }
    });

    // Sort by priority (urgent > high > medium > low) and then by created_at
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    Object.keys(grouped).forEach((status) => {
      grouped[status as ColumnId].sort((a, b) => {
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    });

    return grouped;
  }, [tasks, searchTerm]);

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

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      'low': 'green',
      'medium': 'blue',
      'high': 'orange',
      'urgent': 'red'
    };
    return colors[priority] || 'blue';
  };

  const getProjectName = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    return project?.name || 'Unknown';
  };

  const handleDragStart = (result: any) => {
    setDraggedTaskId(result.draggableId);
  };

  const handleDragEnd = async (result: DropResult) => {
    setDraggedTaskId(null);

    if (!result.destination) {
      return;
    }

    const sourceColumn = result.source.droppableId as ColumnId;
    const destinationColumn = result.destination.droppableId as ColumnId;

    // No change if dropped in same column
    if (sourceColumn === destinationColumn) {
      return;
    }

    const taskId = result.draggableId;
    const newStatus = destinationColumn;

    try {
      // Use bulk update API if available (optimized for Kanban)
      if (onBulkUpdateTasks) {
        await onBulkUpdateTasks([{ id: taskId, status: newStatus }]);
      } else {
        // Fallback to single update
        await onUpdateTask(taskId, { status: newStatus });
      }
    } catch (error) {
      console.error('Failed to update task status:', error);
    }
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

  const renderTaskCard = (task: Task, index: number) => {
    const isBeingDragged = draggedTaskId === task.id;

    return (
      <Draggable key={task.id} draggableId={task.id} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            style={{
              marginBottom: 12,
              opacity: snapshot.isDragging ? 0.8 : 1,
              transform: snapshot.isDragging ? 'rotate(2deg)' : 'none',
              ...provided.draggableProps.style
            }}
          >
            <Badge.Ribbon
              text={task.priority.toUpperCase()}
              color={getPriorityColor(task.priority)}
            >
              <Card
                hoverable
                className={`task-card kanban-card ${isBeingDragged ? 'kanban-card-dragging' : ''} priority-${task.priority} status-${task.status}`}
                style={{
                  border: `2px solid ${getStatusColor(task.status)}40`,
                  borderRadius: '8px',
                  cursor: 'grab',
                  boxShadow: snapshot.isDragging
                    ? '0 8px 16px rgba(0,0,0,0.2)'
                    : '0 2px 8px rgba(0,0,0,0.08)',
                  transition: 'all 0.2s ease'
                }}
                bodyStyle={{ padding: '12px' }}
              >
                {/* Task Title */}
                <div style={{ marginBottom: 8 }}>
                  <Text
                    strong
                    style={{
                      fontSize: '14px',
                      display: 'block',
                      marginBottom: 4
                    }}
                  >
                    {task.title}
                  </Text>
                </div>

                {/* Description */}
                {task.description && (
                  <Paragraph
                    ellipsis={{ rows: 2 }}
                    style={{
                      fontSize: '12px',
                      color: '#666',
                      marginBottom: 8
                    }}
                  >
                    {task.description}
                  </Paragraph>
                )}

                {/* Tags */}
                {task.tags.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {task.tags.slice(0, 2).map(tag => (
                      <Tag key={tag} style={{ fontSize: '11px', marginBottom: 4 }}>
                        {tag}
                      </Tag>
                    ))}
                    {task.tags.length > 2 && (
                      <Tag color="blue" style={{ fontSize: '11px' }}>
                        +{task.tags.length - 2}
                      </Tag>
                    )}
                  </div>
                )}

                {/* Task Metadata */}
                <div className="kanban-card-metadata" style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 8,
                  paddingTop: 8
                }}>
                  {/* Assignee */}
                  {task.assigned_to ? (
                    <Tooltip title={task.assigned_to}>
                      <Avatar
                        size="small"
                        icon={<UserOutlined />}
                        style={{ backgroundColor: '#1890ff' }}
                      />
                    </Tooltip>
                  ) : (
                    <Avatar
                      size="small"
                      icon={<UserOutlined />}
                      style={{ backgroundColor: '#d9d9d9' }}
                    />
                  )}

                  {/* Actions */}
                  <Space size={4}>
                    <Tooltip title="Edit Task">
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(task);
                        }}
                        style={{ padding: '2px 4px' }}
                      />
                    </Tooltip>
                    <Popconfirm
                      title="Delete this task?"
                      onConfirm={() => onDeleteTask(task.id)}
                      okText="Delete"
                      cancelText="Cancel"
                    >
                      <Tooltip title="Delete Task">
                        <Button
                          type="text"
                          size="small"
                          icon={<DeleteOutlined />}
                          danger
                          onClick={(e) => e.stopPropagation()}
                          style={{ padding: '2px 4px' }}
                        />
                      </Tooltip>
                    </Popconfirm>
                  </Space>
                </div>

                {/* Project Indicator */}
                <div style={{
                  marginTop: 8,
                  fontSize: '11px',
                  color: '#999',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}>
                  <ProjectOutlined style={{ fontSize: '10px' }} />
                  {getProjectName(task.project_id)}
                </div>
              </Card>
            </Badge.Ribbon>
          </div>
        )}
      </Draggable>
    );
  };

  const renderColumn = (column: typeof COLUMNS[0]) => {
    const columnTasks = tasksByColumn[column.id];

    return (
      <div
        key={column.id}
        style={{
          flex: '1 1 0',
          minWidth: '280px',
          maxWidth: '350px',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Column Header */}
        <div
          className="kanban-column-header"
          style={{
            padding: '12px 16px',
            borderRadius: '8px 8px 0 0',
            border: `2px solid ${column.color}30`,
            borderBottom: `3px solid ${column.color}`,
            marginBottom: 8
          }}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <Space size={8}>
              <span style={{ color: column.color, fontSize: '16px' }}>
                {column.icon}
              </span>
              <Text strong style={{ fontSize: '14px' }}>
                {column.title}
              </Text>
            </Space>
            <Badge
              count={columnTasks.length}
              style={{
                backgroundColor: column.color,
                boxShadow: 'none',
                fontSize: '12px'
              }}
            />
          </div>
        </div>

        {/* Droppable Column */}
        <Droppable droppableId={column.id}>
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={`kanban-column ${snapshot.isDraggingOver ? 'kanban-column-dragging-over' : ''}`}
              style={{
                padding: '8px',
                borderRadius: '0 0 8px 8px',
                border: `2px solid ${snapshot.isDraggingOver ? column.color : '#e8e8e8'}`,
                borderTop: 'none',
                minHeight: '500px',
                maxHeight: '70vh',
                overflowY: 'auto',
                transition: 'all 0.2s ease',
                flex: 1
              }}
            >
              {columnTasks.map((task, index) => renderTaskCard(task, index))}
              {provided.placeholder}

              {/* Empty State */}
              {columnTasks.length === 0 && !loading && (
                <div style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  color: '#999'
                }}>
                  <div style={{ fontSize: '32px', marginBottom: 8 }}>
                    {column.icon}
                  </div>
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    No {column.title.toLowerCase()} tasks
                  </Text>
                </div>
              )}
            </div>
          )}
        </Droppable>
      </div>
    );
  };

  return (
    <div>
      {/* Search Bar */}
      <div style={{ marginBottom: 16 }}>
        <Search
          placeholder="Search tasks by title, description, or tags..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ maxWidth: 400 }}
          allowClear
        />
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16, color: '#999' }}>Loading tasks...</div>
        </div>
      )}

      {/* Kanban Board */}
      {!loading && (
        <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div
            style={{
              display: 'flex',
              gap: '16px',
              overflowX: 'auto',
              paddingBottom: '16px',
              minHeight: '600px'
            }}
          >
            {COLUMNS.map(column => renderColumn(column))}
          </div>
        </DragDropContext>
      )}

      {/* Empty State - No Tasks */}
      {!loading && tasks.length === 0 && (
        <div
          className="task-empty-state"
          style={{
            padding: '60px 20px',
            textAlign: 'center',
            borderRadius: '8px',
            border: '2px dashed #d9d9d9',
            background: '#fafafa'
          }}
        >
          <ExclamationCircleOutlined style={{ fontSize: '48px', color: '#d9d9d9' }} />
          <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '16px', marginBottom: '8px' }}>
            No tasks found
          </div>
          <div style={{ fontSize: '14px', color: '#999' }}>
            Create a new task to get started
          </div>
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

export default TaskKanbanBoard;