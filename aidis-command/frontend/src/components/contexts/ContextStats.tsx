import React from 'react';
import { Card, Statistic, Row, Col, Progress, Tag, Space } from 'antd';
import {
  DatabaseOutlined, FileOutlined, ClockCircleOutlined,
  ProjectOutlined, TagOutlined, TrophyOutlined
} from '@ant-design/icons';
import { ContextStats as ContextStatsType } from '../../stores/contextStore';
import { getTypeColor, getTypeDisplayName } from '../../utils/contextHelpers';

interface ContextStatsProps {
  stats: ContextStatsType | null;
  loading?: boolean;
}

const ContextStats: React.FC<ContextStatsProps> = ({ stats, loading }) => {
  if (!stats) {
    return (
      <Card loading={loading}>
        <div style={{ textAlign: 'center', color: '#8c8c8c' }}>
          No statistics available
        </div>
      </Card>
    );
  }

  // Calculate percentages for type distribution
  const totalContexts = stats.total_contexts ?? 0;
  const totalProjects = stats.total_projects ?? 0;
  const recentContexts = stats.recent_contexts ?? 0;
  const typeEntries = Object.entries(stats.by_type || {}).sort(([, a], [, b]) => b - a);
  // Calculate recent activity percentage
  const recentPercentage = totalContexts > 0
    ? Math.round((recentContexts / totalContexts) * 100)
    : 0;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Overview Stats */}
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Contexts"
              value={totalContexts}
              prefix={<DatabaseOutlined style={{ color: '#1890ff' }} />}
              loading={loading}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Projects"
              value={totalProjects}
              prefix={<ProjectOutlined style={{ color: '#52c41a' }} />}
              loading={loading}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Recent (7 days)"
              value={recentContexts}
              prefix={<ClockCircleOutlined style={{ color: '#fa8c16' }} />}
              suffix={`(${recentPercentage}%)`}
              loading={loading}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Avg per Project"
              value={totalProjects > 0 ? Math.round(totalContexts / totalProjects) : 0}
              prefix={<TrophyOutlined style={{ color: '#722ed1' }} />}
              loading={loading}
            />
          </Card>
        </Col>
      </Row>

      {/* Type Distribution */}
      <Card 
        title={
          <Space>
            <TagOutlined />
            <span>Context Types Distribution</span>
          </Space>
        }
        loading={loading}
      >
        {typeEntries.length > 0 ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {typeEntries.map(([type, count]) => (
              <div key={type} style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Space>
                    <Tag color={getTypeColor(type)}>
                      {getTypeDisplayName(type)}
                    </Tag>
                    <span>{count} contexts</span>
                  </Space>
                  <span>{totalContexts > 0 ? Math.round((count / totalContexts) * 100) : 0}%</span>
                </div>
                <Progress
                  percent={totalContexts > 0 ? Math.round((count / totalContexts) * 100) : 0}
                  strokeColor={getTypeColor(type)}
                  showInfo={false}
                />
              </div>
            ))}
          </Space>
        ) : (
          <div style={{ textAlign: 'center', color: '#8c8c8c' }}>
            No context types data available
          </div>
        )}
      </Card>

      {/* Project Distribution */}
      <Card 
        title={
          <Space>
            <ProjectOutlined />
            <span>Top Projects</span>
          </Space>
        }
        loading={loading}
      >
        {Object.keys(stats.by_project || {}).length > 0 ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {Object.entries(stats.by_project || {})
              .sort(([,a], [,b]) => b - a)
              .slice(0, 10) // Top 10 projects
              .map(([project, count]) => (
                <div key={project} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Space>
                      <FileOutlined />
                      <span style={{ fontWeight: 500 }}>{project}</span>
                    </Space>
                    <Space>
                      <span>{count} contexts</span>
                      <span style={{ color: '#8c8c8c' }}>
                        ({totalContexts > 0 ? Math.round((count / totalContexts) * 100) : 0}%)
                      </span>
                    </Space>
                  </div>
                  <Progress
                    percent={totalContexts > 0 ? Math.round((count / totalContexts) * 100) : 0}
                    strokeColor="#1890ff"
                    showInfo={false}
                  />
                </div>
              ))}
          </Space>
        ) : (
          <div style={{ textAlign: 'center', color: '#8c8c8c' }}>
            No project data available
          </div>
        )}
      </Card>

      {/* Activity Summary */}
      <Card title="Activity Summary" loading={loading}>
        <Row gutter={16}>
          <Col span={8}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#52c41a' }}>
                {recentPercentage}%
              </div>
              <div style={{ color: '#8c8c8c' }}>Recent Activity</div>
              <div style={{ fontSize: '12px', color: '#8c8c8c' }}>
                Past 7 days
              </div>
            </div>
          </Col>
          <Col span={8}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1890ff' }}>
                {totalProjects > 0 ? Math.round(totalContexts / totalProjects) : 0}
              </div>
              <div style={{ color: '#8c8c8c' }}>Avg per Project</div>
              <div style={{ fontSize: '12px', color: '#8c8c8c' }}>
                Total contexts / projects
              </div>
            </div>
          </Col>
          <Col span={8}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#722ed1' }}>
                {typeEntries.length}
              </div>
              <div style={{ color: '#8c8c8c' }}>Context Types</div>
              <div style={{ fontSize: '12px', color: '#8c8c8c' }}>
                Different types used
              </div>
            </div>
          </Col>
        </Row>
      </Card>
    </Space>
  );
};

export default ContextStats;
