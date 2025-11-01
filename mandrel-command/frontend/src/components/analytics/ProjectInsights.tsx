import React from 'react';
import { Card, Typography, Spin, Alert, Button, Row, Col, Statistic, Tag, Progress } from 'antd';
import {
  CheckCircleOutlined, TrophyOutlined, BulbOutlined, FileTextOutlined,
  ReloadOutlined, GitlabOutlined, PlusOutlined, MinusOutlined
} from '@ant-design/icons';
import { useProjectInsights } from '../../hooks/useProjects';

const { Text, Title } = Typography;

interface ProjectInsightsProps {
  projectId: string;
  className?: string;
}

const ProjectInsights: React.FC<ProjectInsightsProps> = ({ projectId, className }) => {
  const { data: response, isLoading, error, refetch } = useProjectInsights(projectId);

  if (isLoading) {
    return (
      <Card className={className}>
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text>Loading project insights...</Text>
          </div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <Alert
          message="Failed to Load Project Insights"
          description={error instanceof Error ? error.message : 'Failed to fetch project insights'}
          type="error"
          action={
            <Button size="small" onClick={() => refetch()}>
              <ReloadOutlined /> Retry
            </Button>
          }
        />
      </Card>
    );
  }

  if (!response?.data) {
    return (
      <Card className={className}>
        <Alert
          message="No Data Available"
          description="Project insights could not be loaded at this time."
          type="info"
          action={
            <Button size="small" onClick={() => refetch()}>
              <ReloadOutlined /> Try Again
            </Button>
          }
        />
      </Card>
    );
  }

  const insights = response.data;

  // Calculate task statistics
  const activeTasks = insights.tasks.total - insights.tasks.cancelled;
  const openTasks = insights.tasks.todo + insights.tasks.in_progress + insights.tasks.blocked;

  return (
    <Card
      className={className}
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={4} style={{ margin: 0 }}>
            Project Insights
          </Title>
          <Button size="small" onClick={() => refetch()} loading={isLoading}>
            <ReloadOutlined /> Refresh
          </Button>
        </div>
      }
    >
      {/* Tasks Section */}
      <div style={{ marginBottom: 24 }}>
        <Title level={5} style={{ marginBottom: 16 }}>
          <TrophyOutlined /> Tasks
        </Title>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Card size="small">
              <Statistic
                title="Total Tasks"
                value={activeTasks}
                suffix={<Text type="secondary" style={{ fontSize: 14 }}>/ {insights.tasks.total}</Text>}
                prefix={<TrophyOutlined />}
              />
              {insights.tasks.cancelled > 0 && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  ({insights.tasks.cancelled} cancelled)
                </Text>
              )}
            </Card>
          </Col>

          <Col xs={24} sm={8}>
            <Card size="small">
              <Statistic
                title="Completed"
                value={insights.tasks.completed}
                valueStyle={{ color: '#3f8600' }}
                prefix={<CheckCircleOutlined />}
              />
              <Progress
                percent={insights.tasks.completion_percentage}
                size="small"
                showInfo={true}
                format={(percent) => `${percent}%`}
                style={{ marginTop: 8 }}
              />
            </Card>
          </Col>

          <Col xs={24} sm={8}>
            <Card size="small">
              <Statistic
                title="Open Tasks"
                value={openTasks}
                prefix={<FileTextOutlined />}
              />
              <div style={{ marginTop: 8, fontSize: 12 }}>
                <Tag color="blue">{insights.tasks.in_progress} in progress</Tag>
                <Tag>{insights.tasks.todo} todo</Tag>
                {insights.tasks.blocked > 0 && (
                  <Tag color="red">{insights.tasks.blocked} blocked</Tag>
                )}
              </div>
            </Card>
          </Col>
        </Row>
      </div>

      {/* Knowledge Base Section */}
      <div style={{ marginBottom: 24 }}>
        <Title level={5} style={{ marginBottom: 16 }}>
          <BulbOutlined /> Knowledge Base
        </Title>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <Card size="small">
              <Statistic
                title="Contexts"
                value={insights.contexts.total}
                prefix={<BulbOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Knowledge entries with semantic search
              </Text>
            </Card>
          </Col>

          <Col xs={24} sm={12}>
            <Card size="small">
              <Statistic
                title="Technical Decisions"
                value={insights.decisions.total}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Documented architectural choices
              </Text>
            </Card>
          </Col>
        </Row>
      </div>

      {/* Git Activity Section */}
      <div>
        <Title level={5} style={{ marginBottom: 16 }}>
          <GitlabOutlined /> Development Activity
        </Title>

        {insights.git_activity.total_commits > 0 ? (
          <>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={8}>
                <Card size="small">
                  <Statistic
                    title="Commits"
                    value={insights.git_activity.total_commits}
                    prefix={<GitlabOutlined />}
                  />
                </Card>
              </Col>

              <Col xs={24} sm={8}>
                <Card size="small">
                  <Statistic
                    title="Lines Added"
                    value={insights.git_activity.total_insertions.toLocaleString()}
                    valueStyle={{ color: '#52c41a' }}
                    prefix={<PlusOutlined />}
                  />
                </Card>
              </Col>

              <Col xs={24} sm={8}>
                <Card size="small">
                  <Statistic
                    title="Lines Removed"
                    value={insights.git_activity.total_deletions.toLocaleString()}
                    valueStyle={{ color: '#cf1322' }}
                    prefix={<MinusOutlined />}
                  />
                </Card>
              </Col>
            </Row>

            {insights.git_activity.latest_commit_message && (
              <Card size="small" style={{ marginTop: 16, backgroundColor: '#fafafa' }}>
                <Text strong>Latest Commit:</Text>
                <div style={{ marginTop: 8 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'monospace' }}>
                    {insights.git_activity.latest_commit_message}
                  </Text>
                </div>
                {insights.git_activity.latest_commit_date && (
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                    {new Date(insights.git_activity.latest_commit_date).toLocaleString()}
                  </Text>
                )}
              </Card>
            )}
          </>
        ) : (
          <Card size="small">
            <Alert
              message="No Git Activity Tracked"
              description="Git commit tracking has not been set up for this project yet."
              type="info"
              showIcon
            />
          </Card>
        )}
      </div>

      {/* Metadata Footer */}
      <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          Generated: {new Date(insights.generated_at).toLocaleString()}
        </Text>
      </div>
    </Card>
  );
};

export default ProjectInsights;
