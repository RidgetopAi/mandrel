import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Row, Col, Statistic, Spin, notification, Empty, DatePicker, Select } from 'antd';
import { 
  Pie, 
  Column, 
  Line,
  Bar,
  Area
} from '@ant-design/plots';
import { 
  CheckCircleOutlined, 
  ClockCircleOutlined, 
  ExclamationCircleOutlined,
  TrophyOutlined,
  LineChartOutlined,
  AreaChartOutlined,
  BarChartOutlined
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

interface SessionTrends {
  date: string;
  session_count: number;
  total_duration: number;
  avg_duration: number;
  total_contexts: number;
  total_tokens: number;
  productivity_score: number;
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

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  metadata?: any;
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
  const [sessionTrends, setSessionTrends] = useState<SessionTrends[]>([]);
  const [sessionAnalytics, setSessionAnalytics] = useState<SessionAnalytics | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
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

      // Load all analytics data including sessions
      const [statsResponse, tasksResponse, sessionTrendsResponse, sessionAnalyticsResponse] = await Promise.all([
        apiService.get<{success: boolean; data: {stats: TaskStats}}>('/tasks/stats', { params: paramsWithDate }),
        apiService.get<{success: boolean; data: {tasks: Task[]}}>('/tasks', { params: { ...paramsWithDate, limit: 1000 } }),
        apiService.get<{success: boolean; data: {stats: any[]}}>(
          '/sessions/stats-by-period', 
          { params: { period: 'day', limit: 30, ...paramsWithDate } }
        ).catch(() => ({ data: { stats: [] } })), // Fallback if endpoint doesn't exist
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
      setTasks(tasksResponse.data.tasks);
      
      // Set session data if available
      if (sessionTrendsResponse.data?.stats) {
        const trends = sessionTrendsResponse.data.stats.map((stat: any) => ({
          date: stat.period,
          session_count: stat.session_count || 0,
          total_duration: stat.total_duration_minutes || 0,
          avg_duration: stat.avg_duration_minutes || 0,
          total_contexts: stat.total_contexts || 0,
          total_tokens: stat.total_tokens || 0,
          productivity_score: Math.min(stat.total_contexts * 2 + stat.session_count, 100) // Simple scoring
        }));
        setSessionTrends(trends);
      } else {
        setSessionTrends([]);
      }
      
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

  const leadTimeData = useMemo(() => {
    const completedTasks = tasks.filter(task =>
      task.status === 'completed' && task.created_at && task.completed_at
    );

    if (completedTasks.length === 0) {
      return {
        distribution: [],
        stats: { totalTasks: 0, averageLeadTime: 0, p90LeadTime: 0 }
      };
    }

    const leadTimes = completedTasks.map(task => {
      const created = dayjs(task.created_at);
      const completed = dayjs(task.completed_at!);
      return Math.max(1, completed.diff(created, 'days'));
    });

    const maxLeadTime = Math.max(...leadTimes, 30);
    const binSize = Math.max(1, Math.ceil(maxLeadTime / 10));
    const distribution = [] as Array<{ label: string; count: number; color: string }>;

    for (let i = 0; i <= maxLeadTime; i += binSize) {
      const rangeEnd = Math.min(i + binSize - 1, maxLeadTime);
      const count = leadTimes.filter(time => time >= i && time <= rangeEnd).length;
      const color = i <= 3 ? '#52c41a' : i <= 7 ? '#faad14' : '#ff4d4f';
      distribution.push({
        label: `${i}-${rangeEnd}`,
        count,
        color
      });
    }

    const sortedTimes = [...leadTimes].sort((a, b) => a - b);
    const p90Index = Math.floor(sortedTimes.length * 0.9);
    const average = sortedTimes.reduce((sum, val) => sum + val, 0) / sortedTimes.length;

    return {
      distribution,
      stats: {
        totalTasks: completedTasks.length,
        averageLeadTime: average,
        p90LeadTime: sortedTimes[p90Index] || 0
      }
    };
  }, [tasks]);

  const weeklyVelocityData = useMemo(() => {
    if (!sessionTrends.length) {
      return [];
    }

    const weeklyData = sessionTrends.reduce((acc: Record<string, any>, trend) => {
      const week = dayjs(trend.date).startOf('week').format('YYYY-MM-DD');
      if (!acc[week]) {
        acc[week] = {
          week,
          contexts: 0,
          sessions: 0,
          productivity: 0,
          count: 0
        };
      }
      acc[week].contexts += trend.total_contexts;
      acc[week].sessions += trend.session_count;
      acc[week].productivity += trend.productivity_score;
      acc[week].count += 1;
      return acc;
    }, {});

    return Object.values(weeklyData).map((week: any) => ({
      week: dayjs(week.week).format('MMM DD'),
      contexts: week.contexts,
      sessions: week.sessions,
      avgProductivity: week.count > 0 ? week.productivity / week.count : 0,
      target: 50
    }));
  }, [sessionTrends]);

  const cumulativeFlowData: Array<{
    date: string;
    'Todo': number;
    'In Progress': number;
    'Completed': number;
    total: number;
  }> = [];

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

  // Lead time histogram config
  const leadTimeHistogramConfig = {
    data: leadTimeData?.distribution || [],
    xField: 'label',
    yField: 'count',
    color: '#1890ff',
    columnStyle: {
      radius: [2, 2, 0, 0],
    },
    label: {
      position: 'top' as const,
      style: {
        fill: '#666',
        fontSize: 12
      }
    },
    // Annotations disabled for stability
    annotations: []
  };

  // Weekly velocity line chart config
  const velocityLineConfig = {
    data: weeklyVelocityData || [],
    xField: 'week',
    yField: 'contexts',
    point: {
      size: 4,
      shape: 'circle',
      style: {
        fill: '#1890ff',
        stroke: '#1890ff',
        strokeWidth: 2
      }
    },
    line: {
      style: {
        stroke: '#1890ff',
        strokeWidth: 3
      }
    },
    annotations: [
      {
        type: 'line',
        start: ['min', 50],
        end: ['max', 50],
        style: {
          stroke: '#52c41a',
          strokeWidth: 2,
          strokeDasharray: '5,5'
        },
        text: {
          content: 'Target: 50 contexts/week',
          position: 'start',
          offsetY: -10,
          style: { fill: '#52c41a' }
        }
      }
    ],
    tooltip: {
      customContent: (title: string, items: any[]) => {
        if (!items.length) return null;
        const data = items[0].data;
        return `
          <div style="padding: 8px;">
            <p><strong>Week: ${title}</strong></p>
            <p>Contexts: ${data.contexts}</p>
            <p>Sessions: ${data.sessions}</p>
            <p>Avg Productivity: ${(data.avgProductivity || 0).toFixed(1)}</p>
          </div>
        `;
      }
    }
  };

  // Cumulative flow area chart config
  const cumulativeFlowConfig = {
    data: cumulativeFlowData || [],
    xField: 'date',
    yField: 'value',
    seriesField: 'category',
    isStack: true,
    color: ['#faad14', '#1890ff', '#52c41a'], // Todo, In Progress, Completed
    areaStyle: {
      fillOpacity: 0.7
    },
    legend: {
      position: 'top' as const
    },
    smooth: true,
    tooltip: {
      shared: true,
      showCrosshairs: true
    }
  };

  // Transform cumulative flow data for stacked area
  const cumulativeFlowStackedData = cumulativeFlowData.flatMap(item => [
    { date: item.date, category: 'Todo', value: item['Todo'] },
    { date: item.date, category: 'In Progress', value: item['In Progress'] },
    { date: item.date, category: 'Completed', value: item['Completed'] }
  ]);

  const completedTasks = stats.by_status.completed || 0;
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
