import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Modal,
} from 'antd';
import {
  ClockCircleOutlined,
  UserOutlined,
  ProjectOutlined,
  EditOutlined,
  EyeOutlined,
  ReloadOutlined,
  SearchOutlined,
  PlayCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useSessionsList } from '../hooks/useProjects';
import SessionEditModal from '../components/sessions/SessionEditModal';
import StartSessionModal from '../components/sessions/StartSessionModal';
import { sessionsClient } from '../api/sessionsClient';
import type { Session, SessionDetail } from '../types/session';

const { Title, Text } = Typography;
const { Option } = Select;
const { Search } = Input;

type SessionItem = Session;

interface SessionStats {
  totalSessions: number;
  activeSessions: number;
  todaySessions: number;
  averageDuration: number;
}

const Sessions: React.FC = () => {
  const [stats, setStats] = useState<SessionStats>({
    totalSessions: 0,
    activeSessions: 0,
    todaySessions: 0,
    averageDuration: 0,
  });

  // Use React Query hook for sessions data
  const { data: sessionsResponse, isLoading: loading, error, refetch } = useSessionsList({ limit: 1000 });
  const sessions = useMemo(() => {
    const sessionsList = sessionsResponse?.sessions || [];

    // DIAGNOSTIC: Log raw data to debug 112 active issue
    console.log('[Sessions] Raw sessions data received:', {
      total: sessionsList.length,
      sampleEndedAt: sessionsList.slice(0, 3).map(s => ({
        title: s.title?.substring(0, 20),
        ended_at: s.ended_at,
        type: typeof s.ended_at,
        isEmpty: s.ended_at === '',
        isNull: s.ended_at === null,
        isUndefined: s.ended_at === undefined,
        isFalsy: !s.ended_at
      }))
    });

    return sessionsList;
  }, [sessionsResponse]);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [startModalVisible, setStartModalVisible] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionItem | null>(null);
  const [activeSessions, setActiveSessions] = useState<Session[]>([]);
  const [selectedActiveSessionId, setSelectedActiveSessionId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');

  const navigate = useNavigate();
  // const { currentProject } = useProjectContext(); // TODO: Use for project filtering

  // Calculate stats from sessions data
  const calculateStats = useCallback((sessionsArray: SessionItem[], apiTotal?: number) => {
    // Use UTC midnight for consistent timezone handling
    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    const todaysSessions = sessionsArray.filter((s: SessionItem) =>
      new Date(s.started_at || s.created_at) >= todayUTC
    ).length;

    // Active sessions = sessions that haven't been ended (ended_at is null or undefined)
    const activeSessionsList = sessionsArray.filter((s: SessionItem) => !s.ended_at);
    const activeSessions = activeSessionsList.length;

    // Debug logging
    console.log('[Stats] API total:', apiTotal);
    console.log('[Stats] Sessions array length:', sessionsArray.length);
    console.log('[Stats] Active sessions (no ended_at):', activeSessions);
    console.log('[Stats] Sample ended_at values:', sessionsArray.slice(0, 5).map(s => ({
      title: s.title?.substring(0, 20),
      ended_at: s.ended_at,
      has_ended: !!s.ended_at
    })));

    // Calculate average duration in minutes
    const avgDuration = sessionsArray.length > 0
      ? Math.round(
          sessionsArray.reduce((sum, s: SessionItem) => {
            const start = s.started_at ? new Date(s.started_at) : new Date(s.created_at);
            const end = s.ended_at ? new Date(s.ended_at) : new Date();
            const durationMs = end.getTime() - start.getTime();
            return sum + durationMs;
          }, 0) / sessionsArray.length / (1000 * 60) // Convert to minutes
        )
      : 0;

    setStats({
      totalSessions: apiTotal || sessionsArray.length,  // Use API total if available, fallback to array length
      activeSessions,
      todaySessions: todaysSessions,
      averageDuration: avgDuration,
    });
  }, []);

  // Update stats when sessions data changes
  useEffect(() => {
    if (sessions.length > 0) {
      calculateStats(sessions, sessionsResponse?.total);
    }
  }, [sessions, sessionsResponse?.total, calculateStats]);

  // Handle error state
  useEffect(() => {
    if (error) {
      console.error('Error loading sessions:', error);
      message.error('Failed to load sessions');
    }
  }, [error]);

  // Fetch active sessions callback (not in useEffect to avoid infinite loop)
  const fetchActiveSessions = useCallback(async () => {
    try {
      const active = await sessionsClient.getAllActiveSessions();
      console.log(`[Sessions] Fetched ${active.length} active sessions:`, active.map(s => ({
        id: s.id?.substring(0, 8),
        title: s.title,
        started_at: s.started_at,
        ended_at: s.ended_at
      })));
      setActiveSessions(active);

      // Auto-select the first active session if only one exists
      if (active.length === 1) {
        setSelectedActiveSessionId(active[0].id);
        console.log(`[Sessions] Auto-selected session: ${active[0].title}`);
      } else if (active.length === 0) {
        setSelectedActiveSessionId(null);
        console.log('[Sessions] No active sessions');
      } else {
        console.log(`[Sessions] Multiple active sessions (${active.length}), user must select`);
      }
    } catch (error) {
      console.error('Failed to fetch active sessions:', error);
    }
  }, []);

  // Fetch active sessions on mount only
  useEffect(() => {
    fetchActiveSessions();
  }, []); // Only on mount - manual refresh after operations

  // Handle start session
  const handleStartSession = () => {
    setStartModalVisible(true);
  };

  // Handle end session
  const handleEndSession = async () => {
    if (!selectedActiveSessionId) {
      message.warning('Please select a session to end');
      return;
    }

    const sessionToEnd = activeSessions.find(s => s.id === selectedActiveSessionId);
    if (!sessionToEnd) {
      message.error('Selected session not found');
      return;
    }

    Modal.confirm({
      title: 'End Active Session?',
      content: (
        <div>
          <p>Are you sure you want to end this session?</p>
          <p><strong>Title:</strong> {sessionToEnd.title || 'Untitled'}</p>
          <p><strong>Started:</strong> {sessionToEnd.started_at ? new Date(sessionToEnd.started_at).toLocaleString() : 'Unknown'}</p>
          <p style={{ marginTop: 12, color: '#666' }}>
            This will sync git files, calculate final metrics, and mark the session as completed.
          </p>
        </div>
      ),
      icon: <StopOutlined style={{ color: '#ff4d4f' }} />,
      okText: 'End Session',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const endedSession = await sessionsClient.endSession(selectedActiveSessionId);
          message.success('Session ended successfully!');
          await refetch(); // Refresh the sessions list
          await fetchActiveSessions(); // Manually refresh active sessions
          console.log('Session ended:', endedSession);
        } catch (error) {
          console.error('Failed to end session:', error);
          message.error(`Failed to end session: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      },
    });
  };

  // Handle start session success
  const handleStartSuccess = async () => {
    setStartModalVisible(false);
    await refetch(); // Refresh the sessions list
    await fetchActiveSessions(); // Manually refresh active sessions
  };

  // Session type icons and colors
  const getTypeIcon = (type?: string) => {
    switch (type) {
      case 'AI Model': return '🤖';
      case 'mcp-server': return '🔌';
      default: return '🤖'; // Default to AI Model icon
    }
  };

  const getTypeColor = (type?: string) => {
    switch (type) {
      case 'AI Model': return 'blue';
      case 'mcp-server': return 'gray';
      default: return 'blue'; // Default to blue
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

  // Helper to check if session is active (not ended)
  const isSessionActive = (session: SessionItem): boolean => {
    // A session is active if it hasn't been ended (ended_at is null)
    return !session.ended_at;
  };

  // Filter sessions
  const filteredSessions = sessions.filter((session: SessionItem) => {
    const matchesSearch = !searchText || 
      (session.title?.toLowerCase().includes(searchText.toLowerCase())) ||
      (session.description?.toLowerCase().includes(searchText.toLowerCase())) ||
      (session.project_name?.toLowerCase().includes(searchText.toLowerCase()));
    
    // Status filtering based on activity
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'active' && isSessionActive(session)) ||
      (statusFilter === 'inactive' && !isSessionActive(session) && session.last_context_at) ||
      (statusFilter === 'disconnected' && !session.last_context_at);
    
    const matchesProject = projectFilter === 'all' || session.project_id === projectFilter;
    
    return matchesSearch && matchesStatus && matchesProject;
  });

  // Table columns
  const columns = [
    {
      title: 'Session',
      key: 'session',
      width: '30%',
      ellipsis: true,
      render: (record: SessionItem) => {
        const isActive = isSessionActive(record);
        return (
          <Space direction="vertical" size="small">
            <Space>
              <span>{getTypeIcon(record.session_type)}</span>
              <Text strong ellipsis>{record.title || `Session ${record.id.slice(0, 8)}`}</Text>
              <Tag color={getTypeColor(record.session_type)}>
                {record.ai_model || record.session_type || 'AI Model'}
              </Tag>
              {isActive && (
                <Badge status="processing" text="Active" />
              )}
            </Space>
            {record.description && (
              <Text type="secondary" ellipsis={{ tooltip: record.description }}>
                {record.description}
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Project',
      dataIndex: 'project_name',
      key: 'project',
      width: 150,
      ellipsis: true,
      render: (project_name: string) => (
        <Space>
          <ProjectOutlined />
          <Text ellipsis>{project_name || 'No Project'}</Text>
        </Space>
      ),
    },
    {
      title: 'Created',
      key: 'created',
      width: 120,
      render: (record: SessionItem) => (
        <Tooltip title={new Date(record.created_at).toLocaleString()}>
          <Space direction="vertical" size="small">
            <Text style={{ fontSize: 12 }}>{new Date(record.created_at).toLocaleDateString()}</Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {new Date(record.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </Space>
        </Tooltip>
      ),
    },
    {
      title: 'Activity',
      key: 'activity',
      width: 120,
      render: (record: SessionItem) => {
        const tasksTotal = (record.tasks_created || 0);
        const contextsTotal = (record.contexts_created || record.context_count || 0);
        const totalActivity = tasksTotal + contextsTotal;

        return (
          <Tooltip
            title={
              <>
                <div>Tasks: {record.tasks_created || 0} created, {record.tasks_updated || 0} updated, {record.tasks_completed || 0} completed</div>
                <div>Contexts: {contextsTotal} created</div>
              </>
            }
          >
            <Space size="small">
              {tasksTotal > 0 && (
                <>
                  <Badge count={tasksTotal} color="purple" showZero />
                  <Text type="secondary" style={{ fontSize: 11 }}>T</Text>
                </>
              )}
              {contextsTotal > 0 && (
                <>
                  <Badge count={contextsTotal} color="blue" showZero />
                  <Text type="secondary" style={{ fontSize: 11 }}>C</Text>
                </>
              )}
              {totalActivity === 0 && <Text type="secondary" style={{ fontSize: 11 }}>None</Text>}
            </Space>
          </Tooltip>
        );
      },
      sorter: (a: SessionItem, b: SessionItem) => {
        const totalA = (a.tasks_created || 0) + (a.contexts_created || a.context_count || 0);
        const totalB = (b.tasks_created || 0) + (b.contexts_created || b.context_count || 0);
        return totalA - totalB;
      },
    },
    {
      title: 'Tokens',
      key: 'tokens',
      width: 80,
      align: 'right' as const,
      render: (record: SessionItem) => (
        <Tooltip title={`Input: ${Number(record.input_tokens || 0).toLocaleString()} | Output: ${Number(record.output_tokens || 0).toLocaleString()}`}>
          <Text style={{ fontSize: 12 }}>{(Number(record.total_tokens || 0) / 1000).toFixed(1)}k</Text>
        </Tooltip>
      ),
      sorter: (a: SessionItem, b: SessionItem) => Number(a.total_tokens || 0) - Number(b.total_tokens || 0),
    },
    {
      title: 'Last Activity',
      dataIndex: 'last_context_at',
      key: 'lastActivity',
      width: 100,
      render: (last_context_at: string) => (
        <Tooltip title={new Date(last_context_at).toLocaleString()}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {new Date(last_context_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      fixed: 'right' as const,
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
            <Space>
              <Text type="secondary">
                Monitor and manage development sessions across projects
              </Text>
              {activeSessions.length > 0 && (
                <>
                  {activeSessions.length === 1 ? (
                    <Tag color="green" icon={<Badge status="processing" />}>
                      Active: {activeSessions[0].title || 'Untitled'}
                    </Tag>
                  ) : (
                    <Space>
                      <Tag color="orange" icon={<Badge status="warning" />}>
                        {activeSessions.length} Active Sessions
                      </Tag>
                      <Select
                        style={{ minWidth: 200 }}
                        placeholder="Select session to end"
                        value={selectedActiveSessionId}
                        onChange={setSelectedActiveSessionId}
                        size="small"
                      >
                        {activeSessions.map(session => (
                          <Option key={session.id} value={session.id}>
                            {session.title || 'Untitled'} - {session.started_at ? new Date(session.started_at).toLocaleTimeString() : 'Unknown'}
                          </Option>
                        ))}
                      </Select>
                    </Space>
                  )}
                </>
              )}
            </Space>
          </Space>
          <Space>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleStartSession}
              disabled={loading}
            >
              Start Session
            </Button>
            <Button
              danger
              icon={<StopOutlined />}
              onClick={handleEndSession}
              disabled={loading || activeSessions.length === 0 || !selectedActiveSessionId}
            >
              End Session
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                console.log('[Sessions] Hard refresh triggered');
                refetch();
              }}
              loading={loading}
            >
              Refresh
            </Button>
          </Space>
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
          refetch(); // Refresh the list
        }}
      />

      {/* Start Session Modal */}
      <StartSessionModal
        visible={startModalVisible}
        onClose={() => setStartModalVisible(false)}
        onSuccess={handleStartSuccess}
      />
    </div>
  );
};

export default Sessions;