import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Space,
  Button,
  Tag,
  Typography,
  Tooltip,
  Select,
  Input,
  Row,
  Col,
  Statistic,
  Badge,
  message,
} from 'antd';
import {
  ClockCircleOutlined,
  UserOutlined,
  ProjectOutlined,
  EditOutlined,
  EyeOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useProjectContext } from '../contexts/ProjectContext';
import { Session } from '../services/projectApi';
import { apiService } from '../services/api';
import SessionEditModal from '../components/sessions/SessionEditModal';

const { Title, Text } = Typography;
const { Option } = Select;
const { Search } = Input;

interface SessionItem extends Session {
  project_name?: string;
  session_type?: string;
  context_count?: number;
  last_context_at?: string;
}

interface SessionStats {
  totalSessions: number;
  activeSessions: number;
  todaySessions: number;
  averageDuration: number;
}

const Sessions: React.FC = () => {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [stats, setStats] = useState<SessionStats>({
    totalSessions: 0,
    activeSessions: 0,
    todaySessions: 0,
    averageDuration: 0,
  });
  const [loading, setLoading] = useState(true);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionItem | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  
  const navigate = useNavigate();
  // const { currentProject } = useProjectContext(); // TODO: Use for project filtering

  // Load sessions and stats
  const loadSessions = async () => {
    setLoading(true);
    try {
      // Use same apiService as dashboard SessionSummaries
      const response = await apiService.get<{success: boolean; data: {sessions: SessionItem[]}}>('/projects/sessions/all');
      
      const sessionsArray = response.data.sessions;
      setSessions(sessionsArray);
      
      // Calculate basic stats from loaded sessions
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todaysSessions = sessionsArray.filter((s: SessionItem) => 
        new Date(s.created_at) >= today
      ).length;
      
      const activeSessions = sessionsArray.filter((s: SessionItem) => 
        s.last_context_at && new Date(s.last_context_at) > new Date(Date.now() - 60 * 60 * 1000)
      ).length;
      
      setStats({
        totalSessions: sessionsArray.length,
        activeSessions,
        todaySessions: todaysSessions,
        averageDuration: 0, // TODO: Calculate when we have duration data
      });
    } catch (error: any) {
      console.error('Error loading sessions:', error);
      message.error(error.response?.data?.error || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  // Session type icons and colors  
  const getTypeIcon = (type?: string) => {
    switch (type) {
      case 'claude-code-agent': return '🤖';
      case 'web': return '🌐';
      case 'claude': return '🧠';
      case 'mcp': return '🔌';
      default: return '❓';
    }
  };

  const getTypeColor = (type?: string) => {
    switch (type) {
      case 'claude-code-agent': return 'blue';
      case 'web': return 'green';
      case 'claude': return 'purple';
      case 'mcp': return 'orange';
      default: return 'default';
    }
  };

  // Format duration
  const formatDuration = (minutes: number) => {
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  // Filter sessions
  const filteredSessions = sessions.filter(session => {
    const matchesSearch = !searchText || 
      (session.title?.toLowerCase().includes(searchText.toLowerCase())) ||
      (session.description?.toLowerCase().includes(searchText.toLowerCase())) ||
      (session.project_name?.toLowerCase().includes(searchText.toLowerCase()));
    
    const matchesStatus = true; // No status filtering for now since we don't have status in data
    const matchesProject = projectFilter === 'all' || session.project_id === projectFilter;
    
    return matchesSearch && matchesStatus && matchesProject;
  });

  // Table columns
  const columns = [
    {
      title: 'Session',
      key: 'session',
      render: (record: SessionItem) => (
        <Space direction="vertical" size="small">
          <Space>
            <span>{getTypeIcon(record.session_type)}</span>
            <Text strong>{record.title || `Session ${record.id.slice(0, 8)}`}</Text>
            <Tag color={getTypeColor(record.session_type)}>{record.session_type}</Tag>
          </Space>
          {record.description && (
            <Text type="secondary" ellipsis={{ tooltip: record.description }}>
              {record.description}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Project',
      dataIndex: 'project_name',
      key: 'project',
      render: (project_name: string) => (
        <Space>
          <ProjectOutlined />
          <Text>{project_name || 'No Project'}</Text>
        </Space>
      ),
    },
    {
      title: 'Created',
      key: 'created',
      render: (record: SessionItem) => (
        <Space direction="vertical" size="small">
          <Space>
            <ClockCircleOutlined />
            <Text>{new Date(record.created_at).toLocaleDateString()}</Text>
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {new Date(record.created_at).toLocaleTimeString()}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Activity',
      key: 'activity',
      render: (record: SessionItem) => (
        <Space>
          <Badge count={record.context_count || 0} color="blue" />
          <Text type="secondary">contexts</Text>
        </Space>
      ),
    },
    {
      title: 'Last Activity',
      dataIndex: 'last_context_at',
      key: 'lastActivity',
      render: (last_context_at: string) => (
        <Tooltip title={new Date(last_context_at).toLocaleString()}>
          <Text type="secondary">
            {new Date(last_context_at).toLocaleTimeString()}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (record: SessionItem) => (
        <Space>
          <Tooltip title="View Details">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/sessions/${record.id}`)}
            />
          </Tooltip>
          <Tooltip title="Edit Session">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => {
                setSelectedSession(record);
                setEditModalVisible(true);
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header */}
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space direction="vertical">
            <Title level={2}>Session Management</Title>
            <Text type="secondary">
              Monitor and manage development sessions across projects
            </Text>
          </Space>
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={loadSessions}
            loading={loading}
          >
            Refresh
          </Button>
        </Space>

        {/* Stats Cards */}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Total Sessions"
                value={stats.totalSessions}
                prefix={<UserOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Active Sessions"
                value={stats.activeSessions}
                prefix={<Badge status="processing" />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Today's Sessions"
                value={stats.todaySessions}
                prefix={<ClockCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Avg Duration"
                value={formatDuration(stats.averageDuration)}
                prefix={<ClockCircleOutlined />}
              />
            </Card>
          </Col>
        </Row>

        {/* Filters */}
        <Card>
          <Row gutter={[16, 16]} align="middle">
            <Col xs={24} sm={8} md={6}>
              <Search
                placeholder="Search sessions..."
                allowClear
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                prefix={<SearchOutlined />}
              />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Select
                style={{ width: '100%' }}
                placeholder="Status"
                value={statusFilter}
                onChange={setStatusFilter}
              >
                <Option value="all">All Status</Option>
                <Option value="active">Active</Option>
                <Option value="inactive">Inactive</Option>
                <Option value="disconnected">Disconnected</Option>
              </Select>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Select
                style={{ width: '100%' }}
                placeholder="Project"
                value={projectFilter}
                onChange={setProjectFilter}
              >
                <Option value="all">All Projects</Option>
                {/* TODO: Load actual projects */}
              </Select>
            </Col>
            <Col>
              <Text type="secondary">
                {filteredSessions.length} of {sessions.length} sessions
              </Text>
            </Col>
          </Row>
        </Card>

        {/* Sessions Table */}
        <Card>
          <Table
            columns={columns}
            dataSource={filteredSessions}
            rowKey="id"
            loading={loading}
            pagination={{
              total: filteredSessions.length,
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) =>
                `${range[0]}-${range[1]} of ${total} sessions`,
            }}
          />
        </Card>
      </Space>

      {/* Edit Session Modal */}
      <SessionEditModal
        visible={editModalVisible}
        session={selectedSession}
        onClose={() => {
          setEditModalVisible(false);
          setSelectedSession(null);
        }}
        onSuccess={() => {
          setEditModalVisible(false);
          setSelectedSession(null);
          loadSessions(); // Refresh the list
        }}
      />
    </div>
  );
};

export default Sessions;
