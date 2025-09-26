import React from 'react';
import { Card, Row, Col, Statistic, Typography, Divider, Progress } from 'antd';
import {
  FolderOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
  TeamOutlined
} from '@ant-design/icons';

// Define the ProjectStats type based on what the component expects
interface ProjectStatsType {
  total_projects?: number;
  active_projects?: number;
  total_contexts?: number;
  total_sessions?: number;
  contexts_by_type?: Record<string, number>;
  recent_activity?: {
    contexts_last_week?: number;
    sessions_last_week?: number;
  };
}

const { Title } = Typography;

interface ProjectStatsProps {
  stats: ProjectStatsType;
  loading?: boolean;
}

const ProjectStats: React.FC<ProjectStatsProps> = ({ stats, loading = false }) => {
  const getContextTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
      'code': '#52c41a',
      'decision': '#1890ff', 
      'error': '#f5222d',
      'discussion': '#fa8c16',
      'planning': '#722ed1',
      'completion': '#13c2c2'
    };
    return colors[type] || '#d9d9d9';
  };

  const contextTypes = Object.entries(stats.contexts_by_type || {});
  const totalContexts = contextTypes.reduce((sum, [, count]) => sum + count, 0);

  return (
    <div>
      {/* Overview Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Projects"
              value={stats.total_projects ?? 0}
              prefix={<FolderOutlined />}
              loading={loading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Active Projects"
              value={stats.active_projects ?? 0}
              prefix={<FolderOutlined />}
              loading={loading}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Contexts"
              value={stats.total_contexts ?? 0}
              prefix={<FileTextOutlined />}
              loading={loading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Sessions"
              value={stats.total_sessions ?? 0}
              prefix={<TeamOutlined />}
              loading={loading}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: '16px' }}>
        {/* Context Types Breakdown */}
        <Col xs={24} lg={12}>
          <Card title="Context Types Distribution" loading={loading}>
            {contextTypes.length > 0 ? (
              <div>
                {contextTypes.map(([type, count]) => (
                  <div key={type} style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ textTransform: 'capitalize' }}>{type}</span>
                      <span>{count} ({totalContexts > 0 ? Math.round((count / totalContexts) * 100) : 0}%)</span>
                    </div>
                    <Progress
                      percent={totalContexts > 0 ? (count / totalContexts) * 100 : 0}
                      strokeColor={getContextTypeColor(type)}
                      showInfo={false}
                      size="small"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                No context data available
              </div>
            )}
          </Card>
        </Col>

        {/* Recent Activity */}
        <Col xs={24} lg={12}>
          <Card title="Recent Activity (Last 7 Days)" loading={loading}>
            <Row gutter={16}>
              <Col span={12}>
                <Statistic
                  title="New Contexts"
                value={stats.recent_activity?.contexts_last_week ?? 0}
                  prefix={<FileTextOutlined />}
                  suffix="contexts"
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="New Sessions"
                value={stats.recent_activity?.sessions_last_week ?? 0}
                  prefix={<ClockCircleOutlined />}
                  suffix="sessions"
                />
              </Col>
            </Row>

            <Divider />

            <div style={{ textAlign: 'center' }}>
              <Title level={4} style={{ margin: 0 }}>
                {stats.total_projects && stats.total_projects > 0 && stats.total_contexts
                  ? Math.round((stats.total_contexts ?? 0) / stats.total_projects)
                  : 0}
              </Title>
              <div style={{ color: '#999' }}>Average contexts per project</div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default ProjectStats;
