import React from 'react';
import { Card, Statistic, Row, Col, Tag, Space, Progress } from 'antd';
import {
  DatabaseOutlined, ClockCircleOutlined,
  TagOutlined, FileTextOutlined
} from '@ant-design/icons';
import { ContextStats as ContextStatsType } from '../../stores/contextStore';
import { getTypeColor, getTypeDisplayName } from '../../utils/contextHelpers';
import { useDecisionStatsQuery } from '../../hooks/useDecisions';
import { useProjectContext } from '../../contexts/ProjectContext';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

interface ContextStatsProps {
  stats: ContextStatsType | null;
  loading?: boolean;
}

const ContextStats: React.FC<ContextStatsProps> = ({ stats, loading }) => {
  const { currentProject } = useProjectContext();
  const { data: decisionStats, isLoading: decisionsLoading } = useDecisionStatsQuery(currentProject?.id);

  if (!stats) {
    return (
      <Card loading={loading}>
        <div style={{ textAlign: 'center', color: '#8c8c8c' }}>
          No statistics available
        </div>
      </Card>
    );
  }

  // Calculate values
  const totalContexts = stats.total_contexts ?? 0;
  const totalDecisions = decisionStats?.total_decisions ?? 0;
  const typeEntries = Object.entries(stats.by_type || {}).sort(([, a], [, b]) => b - a);
  const contextTypesCount = typeEntries.length;

  // Get most recent context timestamp
  const mostRecentTimestamp = stats.most_recent_timestamp;
  const lastActivity = mostRecentTimestamp
    ? dayjs(mostRecentTimestamp).fromNow()
    : 'No activity';

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
              title="Decisions"
              value={totalDecisions}
              prefix={<FileTextOutlined style={{ color: '#52c41a' }} />}
              loading={decisionsLoading}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Last Activity"
              value={lastActivity}
              prefix={<ClockCircleOutlined style={{ color: '#fa8c16' }} />}
              loading={loading}
              valueStyle={{ fontSize: '20px' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Context Types"
              value={contextTypesCount}
              prefix={<TagOutlined style={{ color: '#722ed1' }} />}
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
    </Space>
  );
};

export default ContextStats;
