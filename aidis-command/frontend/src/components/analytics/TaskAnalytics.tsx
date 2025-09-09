import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Spin, notification, Empty, DatePicker, Select } from 'antd';
import { 
  Pie, 
  Column, 
  Line,
  Bar,
  Histogram,
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
  const [leadTimeData, setLeadTimeData] = useState<any>(null);
  const [weeklyVelocityData, setWeeklyVelocityData] = useState<any[]>([]);
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

  const loadAllData = async () => {
    setLoading(true);
    try {
      const params = projectId ? { project_id: projectId } : {};
      const dateParams = {
        ...params,
        start_date: dayjs(selectedDateRange[0]).format('YYYY-MM-DD'),
        end_date: dayjs(selectedDateRange[1]).format('YYYY-MM-DD')
      };

      // Just load basic working data
      const [statsResponse, tasksResponse] = await Promise.all([
        apiService.get<{success: boolean; data: {stats: TaskStats}}>('/tasks/stats', { params }),
        apiService.get<{success: boolean; data: {tasks: Task[]}}>('/tasks', { params: { ...params, limit: 1000 } })
      ]);

      // Normalize basic stats only
      const normalizedStats = {
        ...statsResponse.data.stats,
        completion_rate: safeNumber(statsResponse.data.stats?.completion_rate),
        total: safeNumber(statsResponse.data.stats?.total),
        avg_completion_time: safeNumber(statsResponse.data.stats?.avg_completion_time)
      };

      setStats(normalizedStats);
      setTasks(tasksResponse.data.tasks);
      
      // Disable advanced analytics for now
      setSessionTrends([]);
      setSessionAnalytics(null);
      setLeadTimeData(null);
      setWeeklyVelocityData([]);
    } catch (error) {
      console.error('Failed to load analytics data:', error);
      notification.error({
        message: 'Loading Error',
        description: 'Failed to load task analytics data.'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [projectId, selectedDateRange]);

  useEffect(() => {
    const interval = refreshInterval > 0 ? setInterval(loadAllData, refreshInterval) : null;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [refreshInterval]);

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

  // Calculate lead time distribution from completed tasks
  const calculateLeadTimeData = () => {
    const completedTasks = tasks.filter(task => 
      task.status === 'completed' && task.created_at && task.completed_at
    );

    const leadTimes = completedTasks.map(task => {
      const created = dayjs(task.created_at);
      const completed = dayjs(task.completed_at);
      return Math.max(1, completed.diff(created, 'days')); // Minimum 1 day
    });

    // Create histogram bins
    const maxLeadTime = Math.max(...leadTimes, 30);
    const bins: { range: string; count: number; color: string }[] = [];
    const binSize = Math.max(1, Math.ceil(maxLeadTime / 10));

    for (let i = 0; i <= maxLeadTime; i += binSize) {
      const rangeEnd = Math.min(i + binSize - 1, maxLeadTime);
      const count = leadTimes.filter(time => time >= i && time <= rangeEnd).length;
      const color = i <= 3 ? '#52c41a' : i <= 7 ? '#faad14' : '#ff4d4f';
      bins.push({
        range: `${i}-${rangeEnd}`,
        count,
        color
      });
    }

    // Calculate percentiles
    const sortedTimes = leadTimes.sort((a, b) => a - b);
    const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.5)] || 0;
    const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0;

    return { bins, p50, p95, leadTimes };
  };

  // Calculate weekly velocity from session trends
  const calculateWeeklyVelocity = () => {
    if (!sessionTrends.length) return [];

    // Group by week
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
      target: 50 // Target contexts per week
    }));
  };

  // Calculate cumulative flow data
  const calculateCumulativeFlow = () => {
    // Temporarily disabled - we're removing this distraction analytics
    return [];

    let cumulativeTodo = 0;
    let cumulativeInProgress = 0;
    let cumulativeCompleted = 0;

    return sessionTrends.map((trend, index) => {
      // Simulate task flow - in real scenario, track actual status changes
      const newTasks = Math.floor(trend.total_contexts * 0.3); // New contexts as tasks
      const completedTasks = Math.floor(trend.productivity_score * 0.1);
      const inProgressTasks = Math.floor(newTasks * 0.4);

      cumulativeTodo += newTasks - inProgressTasks;
      cumulativeInProgress += inProgressTasks - completedTasks;
      cumulativeCompleted += completedTasks;

      return {
        date: dayjs(trend.date).format('MMM DD'),
        'Todo': Math.max(0, cumulativeTodo),
        'In Progress': Math.max(0, cumulativeInProgress),
        'Completed': cumulativeCompleted,
        total: cumulativeTodo + cumulativeInProgress + cumulativeCompleted
      };
    });
  };

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

  // Advanced analytics data (now from real APIs)
  // leadTimeData and weeklyVelocityData are now set from API responses
  const cumulativeFlowData = calculateCumulativeFlow();

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

      {/* Advanced Analytics Charts */}
      {viewMode === 'advanced' && (
        <>
          {/* Lead Time & Velocity Row */}
          <Row gutter={[16, 16]} style={{ marginTop: '16px' }}>
            <Col xs={24} lg={12}>
              <Card 
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BarChartOutlined />
                    Lead Time Distribution
                    <span style={{ fontSize: '12px', color: '#666', fontWeight: 'normal' }}>
                      ({leadTimeData?.stats?.totalTasks || 0} completed tasks)
                    </span>
                  </div>
                } 
                style={{ height: '450px' }}
              >
                {leadTimeData?.stats?.totalTasks > 0 ? (
                  <Column {...leadTimeHistogramConfig} height={350} />
                ) : (
                  <Empty description="No completed tasks for lead time analysis" style={{ paddingTop: '100px' }} />
                )}
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card 
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <LineChartOutlined />
                    Weekly Context Velocity
                  </div>
                } 
                style={{ height: '450px' }}
              >
                {weeklyVelocityData?.length > 0 ? (
                  <Line {...velocityLineConfig} height={350} />
                ) : (
                  <Empty description="No session data for velocity analysis" style={{ paddingTop: '100px' }} />
                )}
              </Card>
            </Col>
          </Row>

          {/* Cumulative Flow Diagram */}
          <Row gutter={[16, 16]} style={{ marginTop: '16px' }}>
            <Col xs={24}>
              <Card 
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AreaChartOutlined />
                    Cumulative Flow Diagram
                    <span style={{ fontSize: '12px', color: '#666', fontWeight: 'normal' }}>
                      Work progression over time
                    </span>
                  </div>
                } 
                style={{ height: '400px' }}
              >
                {cumulativeFlowData.length > 0 ? (
                <Area 
                {...cumulativeFlowConfig}
                data={cumulativeFlowStackedData}
                height={300} 
                />
                ) : (
                  <Empty description="No session trends for cumulative flow analysis" style={{ paddingTop: '80px' }} />
                )}
              </Card>
            </Col>
          </Row>

          {/* Advanced Insights */}
          <Row gutter={[16, 16]} style={{ marginTop: '16px' }}>
            <Col xs={24} lg={16}>
              <Card title="Advanced Analytics Insights" type="inner">
                <div style={{ padding: '8px 0' }}>
                  {leadTimeData?.stats?.totalTasks > 0 && (
                    <>
                      <p>📊 <strong>Lead Time Analysis:</strong> Avg = {fmt(leadTimeData?.stats?.averageLeadTime)} days, P90 = {fmt(leadTimeData?.stats?.p90LeadTime)} days</p>
                      <p>⚡ <strong>Completion Speed:</strong> {leadTimeData?.stats?.totalTasks || 0} completed tasks tracked</p>
                    </>
                  )}
                  {sessionAnalytics && (
                    <>
                      <p>🎯 <strong>Productivity Score:</strong> {fmt(sessionAnalytics?.productivity_score)}/100 
                        (based on {sessionAnalytics.total_sessions || 0} sessions)</p>
                      <p>📈 <strong>Session Efficiency:</strong> {fmt(sessionAnalytics?.avg_contexts_per_session)} contexts per session</p>
                    </>
                  )}
                  {weeklyVelocityData?.length > 0 && (
                    <p>🚀 <strong>Velocity Trend:</strong> Recent weekly average of {
                      fmt((weeklyVelocityData?.slice(-3).reduce((sum, w) => sum + w.contexts, 0) || 0) / Math.min(3, weeklyVelocityData?.length || 1))
                    } contexts per week</p>
                  )}
                  {cumulativeFlowData.length > 0 && (
                    <p>📦 <strong>Work in Progress:</strong> Current flow shows {
                      cumulativeFlowData[cumulativeFlowData.length - 1]?.['In Progress'] || 0
                    } active items</p>
                  )}
                </div>
              </Card>
            </Col>
            <Col xs={24} lg={8}>
              <Card title="Performance Metrics" type="inner">
                <div style={{ padding: '8px 0' }}>
                  {sessionAnalytics && (
                    <>
                      <Statistic
                        title="Avg Session Duration"
                        value={sessionAnalytics.avg_duration}
                        precision={1}
                        suffix="min"
                        valueStyle={{ fontSize: '18px' }}
                      />
                      <div style={{ marginTop: '16px' }} />
                      <Statistic
                        title="Total Contexts Created"
                        value={sessionAnalytics.total_contexts}
                        valueStyle={{ fontSize: '18px', color: '#1890ff' }}
                      />
                    </>
                  )}
                </div>
              </Card>
            </Col>
          </Row>
        </>
      )}

      {/* Summary Insights */}
      {stats && (
        <Row gutter={[16, 16]} style={{ marginTop: '16px' }}>
          <Col xs={24}>
            <Card title="Analytics Insights" type="inner">
              <div style={{ padding: '8px 0' }}>
                <p>📊 <strong>Task Overview:</strong> {stats.total || 0} total tasks with {fmt(stats?.completion_rate)}% completion rate</p>
                <p>✅ <strong>Completed:</strong> {completedTasks} tasks ({fmt(stats.total > 0 ? (completedTasks / stats.total) * 100 : 0)}%)</p>
              <p>⚡ <strong>Active Work:</strong> {inProgressTasks} tasks in progress</p>
              {blockedTasks > 0 && (
                <p style={{ color: '#ff4d4f' }}>🚫 <strong>Attention Needed:</strong> {blockedTasks} blocked tasks require intervention</p>
              )}
              <p>🎯 <strong>Most Common Type:</strong> {Object.entries(stats.by_type).reduce((a, b) => stats.by_type[a[0]] > stats.by_type[b[0]] ? a : b)[0].replace('_', ' ')}</p>
              <p>🔥 <strong>Priority Focus:</strong> {Object.entries(stats.by_priority).reduce((a, b) => stats.by_priority[a[0]] > stats.by_priority[b[0]] ? a : b)[0]} priority tasks are most common</p>
            </div>
          </Card>
        </Col>
      </Row>
      )}
    </div>
  );
};

export default TaskAnalytics;
