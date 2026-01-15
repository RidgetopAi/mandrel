import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Row, Col, Statistic, Spin, notification, Empty, DatePicker, Select } from 'antd';
import { 
  Pie, 
  Column, 
  Bar,
} from '@ant-design/plots';
import { 
  CheckCircleOutlined, 
  ClockCircleOutlined, 
  ExclamationCircleOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { apiService } from '../../services/api';
import dayjs from 'dayjs';

/**
 * TaskAnalytics Component
 * Displays comprehensive task statistics with interactive charts
 */

interface TaskStats {
  total: number;
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  by_type: Record<string, number>;
  completion_rate: number;
  avg_completion_time?: number;
  leadTimeP50?: number;
  leadTimeP95?: number;
  weeklyVelocity?: Array<{week: string, completed: number}>;
}

interface SessionAnalytics {
  total_sessions: number;
  total_duration: number;
  avg_duration: number;
  total_contexts: number;
  avg_contexts_per_session: number;
  total_tokens: number;
  avg_tokens_per_session: number;
  productivity_score: number;
}

interface TaskAnalyticsProps {
  projectId?: string;
  dateRange?: [Date, Date];
  refreshInterval?: number;
}

const TaskAnalytics: React.FC<TaskAnalyticsProps> = ({ 
  projectId, 
  dateRange = [dayjs().subtract(30, 'days').toDate(), dayjs().toDate()],
  refreshInterval = 300000 // 5 minutes
}) => {
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [sessionAnalytics, setSessionAnalytics] = useState<SessionAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDateRange, setSelectedDateRange] = useState<[Date, Date]>(dateRange);
  const [viewMode, setViewMode] = useState<'basic' | 'advanced'>('advanced');

  // Defensive formatter utility for safe .toFixed() calls
  const fmt = (num: number | null | undefined, digits: number = 1): string => {
    return (typeof num === 'number' && !Number.isNaN(num))
           ? num.toFixed(digits)
           : '0.0';
  };

  // Safe number utility for response normalization
  const safeNumber = (v: any, def: number = 0): number => {
    return (typeof v === 'number' && !Number.isNaN(v)) ? v : def;
  };

  const dateRangeParams = useMemo(() => ({
    start_date: dayjs(selectedDateRange[0]).format('YYYY-MM-DD'),
    end_date: dayjs(selectedDateRange[1]).format('YYYY-MM-DD')
  }), [selectedDateRange]);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const params = projectId ? { project_id: projectId } : {};
      const paramsWithDate = { ...params, ...dateRangeParams };

      // Load analytics data
      const [statsResponse, sessionAnalyticsResponse] = await Promise.all([
        apiService.get<{success: boolean; data: {stats: TaskStats}}>('/tasks/stats', { params: paramsWithDate }),
        apiService.get<{success: boolean; data: any}>(
          '/sessions/analytics', 
          { params: paramsWithDate }
        ).catch(() => ({ data: null })) // Fallback if endpoint doesn't exist
      ]);

      // Normalize basic stats
      const normalizedStats = {
        ...statsResponse.data.stats,
        completion_rate: safeNumber(statsResponse.data.stats?.completion_rate),
        total: safeNumber(statsResponse.data.stats?.total),
        avg_completion_time: safeNumber(statsResponse.data.stats?.avg_completion_time)
      };

      setStats(normalizedStats);
      
      if (sessionAnalyticsResponse.data) {
        const analytics = {
          total_sessions: sessionAnalyticsResponse.data.total_sessions || 0,
          total_duration: sessionAnalyticsResponse.data.total_duration_minutes || 0,
          avg_duration: sessionAnalyticsResponse.data.average_duration_minutes || 0,
          total_contexts: sessionAnalyticsResponse.data.total_contexts || 0,
          avg_contexts_per_session: sessionAnalyticsResponse.data.average_contexts_per_session || 0,
          total_tokens: sessionAnalyticsResponse.data.total_tokens_used || 0,
          avg_tokens_per_session: sessionAnalyticsResponse.data.average_tokens_per_session || 0,
          productivity_score: Math.min(
            (sessionAnalyticsResponse.data.total_contexts || 0) * 0.5 + 
            (sessionAnalyticsResponse.data.total_sessions || 0) * 5, 
            100
          ) // Simple productivity calculation
        };
        setSessionAnalytics(analytics);
      } else {
        setSessionAnalytics(null);
      }
    } catch (error) {
      console.error('Failed to load analytics data:', error);
      notification.error({
        message: 'Loading Error',
        description: 'Failed to load task analytics data.'
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, dateRangeParams]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  useEffect(() => {
    const interval = refreshInterval > 0 ? setInterval(loadAllData, refreshInterval) : null;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [refreshInterval, loadAllData]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
        <p style={{ marginTop: '16px' }}>Loading task analytics...</p>
      </div>
    );
  }

  if (!stats || stats.total === 0) {
    return (
      <Empty
        description="No task data available"
        style={{ padding: '50px' }}
      />
    );
  }

  // Prepare data for charts
  const statusData = Object.entries(stats.by_status).map(([status, count]) => ({
    type: status.replace('_', ' ').toUpperCase(),
    value: count
  }));

  const priorityData = Object.entries(stats.by_priority).map(([priority, count]) => ({
    priority: priority.toUpperCase(),
    count
  }));

  const typeData = Object.entries(stats.by_type).map(([type, count]) => ({
    type: type.replace('_', ' ').toUpperCase(),
    count
  }));

  // Status colors
  const statusColors = {
    'TODO': '#faad14',
    'IN PROGRESS': '#1890ff', 
    'BLOCKED': '#ff4d4f',
    'COMPLETED': '#52c41a',
    'CANCELLED': '#8c8c8c'
  };

  // Priority colors
  const priorityColors = {
    'URGENT': '#ff4d4f',
    'HIGH': '#fa8c16',
    'MEDIUM': '#1890ff',
    'LOW': '#52c41a'
  };

  // Pie chart config for status distribution
  const statusPieConfig = {
    data: statusData,
    angleField: 'value',
    colorField: 'type',
    color: statusData.map(d => statusColors[d.type as keyof typeof statusColors] || '#8c8c8c'),
    radius: 0.8,
    label: {
      position: 'outside' as const,
      content: ({ percent }: any) => `${(percent * 100).toFixed(0)}%`,
      style: {
        fontSize: 12,
        fontWeight: 'bold',
      },
    },
    legend: {
      position: 'bottom' as const,
    },
    interactions: [{ type: 'element-active' }],
  };

  // Bar chart config for priority distribution  
  const priorityBarConfig = {
    data: priorityData,
    xField: 'count',
    yField: 'priority',
    color: priorityData.map(d => priorityColors[d.priority as keyof typeof priorityColors] || '#8c8c8c'),
    label: {
      position: 'right' as const,
      style: {
        fill: '#fff',
        fontWeight: 'bold'
      }
    },
    interactions: [{ type: 'element-active' }],
  };

  // Column chart config for task types
  const typeColumnConfig = {
    data: typeData,
    xField: 'type',
    yField: 'count',
    color: '#1890ff',
    label: {
      position: 'top' as const,
      style: {
        fill: '#333',
        fontWeight: 'bold'
      }
    },
    interactions: [{ type: 'element-active' }],
  };



  const inProgressTasks = stats.by_status.in_progress || 0;
  const blockedTasks = stats.by_status.blocked || 0;

  return (
    <div className="task-analytics" style={{ padding: '16px' }}>
      {/* Controls Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} md={8}>
          <Card size="small">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <strong>Date Range:</strong>
              <DatePicker.RangePicker
                value={[dayjs(selectedDateRange[0]), dayjs(selectedDateRange[1])]}
                onChange={(dates) => {
                  if (dates && dates[0] && dates[1]) {
                    setSelectedDateRange([dates[0].toDate(), dates[1].toDate()]);
                  }
                }}
                size="small"
              />
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card size="small">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <strong>View:</strong>
              <Select
                value={viewMode}
                onChange={setViewMode}
                size="small"
                options={[
                  { label: 'Advanced Analytics', value: 'advanced' },
                  { label: 'Basic Charts', value: 'basic' }
                ]}
              />
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={24} md={8}>
          <Card size="small">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px' }}>
              <span><strong>Last Updated:</strong> {dayjs().format('HH:mm:ss')}</span>
              {sessionAnalytics && (
                <span><strong>Productivity:</strong> {fmt(sessionAnalytics?.productivity_score)}/100</span>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Key Metrics Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Tasks"
              value={stats.total}
              prefix={<TrophyOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Completion Rate"
              value={stats.completion_rate}
              precision={1}
              suffix="%"
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: stats.completion_rate > 75 ? '#52c41a' : stats.completion_rate > 50 ? '#faad14' : '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="In Progress"
              value={inProgressTasks}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Blocked Tasks"
              value={blockedTasks}
              prefix={<ExclamationCircleOutlined />}
              valueStyle={{ color: blockedTasks > 0 ? '#ff4d4f' : '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Charts Row */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Task Status Distribution" style={{ height: '400px' }}>
            <Pie {...statusPieConfig} height={300} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Priority Breakdown" style={{ height: '400px' }}>
            <Bar {...priorityBarConfig} height={300} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: '16px' }}>
        <Col xs={24}>
          <Card title="Task Types Distribution" style={{ height: '350px' }}>
            <Column {...typeColumnConfig} height={250} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default TaskAnalytics;
