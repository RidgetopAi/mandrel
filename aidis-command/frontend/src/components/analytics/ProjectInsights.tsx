import React from 'react';
import { Card, Typography, Spin, Alert, Button, Space, Tabs, Row, Col, Statistic, Progress, Tag } from 'antd';
import {
  RocketOutlined, TeamOutlined, CodeOutlined, BulbOutlined,
  WarningOutlined, CheckCircleOutlined, InfoCircleOutlined,
  ReloadOutlined, TrophyOutlined
} from '@ant-design/icons';
import { useProjectInsights } from '../../hooks/useProjects';

const { Text, Paragraph } = Typography;
const { TabPane } = Tabs;

interface ProjectHealth {
  score: number;
  level: string;
  components: number;
  contexts: number;
  decisions: number;
  tasks: number;
}

interface TeamEfficiency {
  score: number;
  level: string;
}

interface ProjectInsightsData {
  insights: {
    projectHealth: ProjectHealth;
    teamEfficiency: TeamEfficiency;
    raw: string;
  };
  generatedAt: string;
  projectId: string;
}

interface ProjectInsightsProps {
  projectId: string;
  className?: string;
}

interface ParsedInsights {
  codeHealth: {
    score: number;
    status: string;
    color: string;
  };
  teamEfficiency: {
    score: number;
    status: string;
    color: string;
  };
  components: number;
  contexts: number;
  decisions: number;
  tasks: number;
  knowledgeGaps: string[];
  codeIssues: string[];
}

const ProjectInsights: React.FC<ProjectInsightsProps> = ({ projectId, className }) => {
  const { data: insightsResponse, isLoading: loading, error, refetch } = useProjectInsights(projectId);

  // Debug logging to understand the issue
  console.log('[ProjectInsights] Debug Info:', {
    projectId,
    insightsResponse,
    responseData: insightsResponse?.data,
    loading,
    error,
    hasData: !!insightsResponse?.data
  });

  // Extract the insights data from the API response
  const insights: ProjectInsightsData | null = insightsResponse?.data ? {
    insights: insightsResponse.data.insights || '',
    generatedAt: insightsResponse.data.generatedAt || new Date().toISOString(),
    projectId: projectId
  } : null;

  const parseInsights = (insightsData: ProjectInsightsData['insights']): ParsedInsights => {
    try {
      const { projectHealth, teamEfficiency, raw } = insightsData;

      // Map project health level to color
      const getHealthColor = (level: string) => {
        if (level === 'healthy') return 'success';
        if (level === 'moderate') return 'warning';
        return 'error';
      };

      // Map team efficiency level to color
      const getEfficiencyColor = (level: string) => {
        if (level === 'high') return 'success';
        if (level === 'medium') return 'warning';
        if (level === 'low') return 'error';
        return 'default';
      };

      // Extract knowledge gaps from raw text
      const knowledgeGaps: string[] = [];
      const knowledgeGapsMatch = raw.match(/📋 Knowledge Gaps:\n(.*?)(?=\n⚠️|$)/s);
      if (knowledgeGapsMatch) {
        const gaps = knowledgeGapsMatch[1]
          .split('\n')
          .filter(line => line.trim().startsWith('•'))
          .map(line => line.replace(/^\s*•\s*/, '').trim())
          .filter(line => line.length > 0);
        knowledgeGaps.push(...gaps);
      }

      // Extract code issues from raw text
      const codeIssues: string[] = [];
      const codeIssuesMatch = raw.match(/⚠️\s+Code Issues:\n(.*?)(?=\n\n|$)/s);
      if (codeIssuesMatch) {
        const issues = codeIssuesMatch[1]
          .split('\n')
          .filter(line => line.trim().startsWith('•'))
          .map(line => line.replace(/^\s*•\s*/, '').trim())
          .filter(line => line.length > 0);
        codeIssues.push(...issues);
      }

      return {
        codeHealth: {
          score: projectHealth.score,
          status: projectHealth.level.toUpperCase().replace('_', ' '),
          color: getHealthColor(projectHealth.level)
        },
        teamEfficiency: {
          score: teamEfficiency.score,
          status: teamEfficiency.level.toUpperCase(),
          color: getEfficiencyColor(teamEfficiency.level)
        },
        components: projectHealth.components,
        contexts: projectHealth.contexts,
        decisions: projectHealth.decisions,
        tasks: projectHealth.tasks,
        knowledgeGaps,
        codeIssues
      };
    } catch (err) {
      console.error('Error parsing insights:', err);
      return {
        codeHealth: { score: 0, status: 'UNKNOWN', color: 'default' },
        teamEfficiency: { score: 0, status: 'UNKNOWN', color: 'default' },
        components: 0,
        contexts: 0,
        decisions: 0,
        tasks: 0,
        knowledgeGaps: [],
        codeIssues: []
      };
    }
  };

  const renderOverview = (parsed: ParsedInsights) => (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic
            title="Code Health"
            value={parsed.codeHealth.score}
            precision={1}
            suffix="/100"
            prefix={<CodeOutlined />}
            valueStyle={{ 
              color: parsed.codeHealth.color === 'success' ? '#3f8600' : 
                     parsed.codeHealth.color === 'warning' ? '#cf1322' : '#d46b08' 
            }}
          />
          <div style={{ marginTop: 8 }}>
            <Tag color={parsed.codeHealth.color}>{parsed.codeHealth.status}</Tag>
          </div>
        </Card>
      </Col>
      
      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic
            title="Team Efficiency"
            value={parsed.teamEfficiency.score}
            suffix="%"
            prefix={<TeamOutlined />}
            valueStyle={{ 
              color: parsed.teamEfficiency.color === 'success' ? '#3f8600' : 
                     parsed.teamEfficiency.color === 'warning' ? '#cf1322' : '#d46b08' 
            }}
          />
          <div style={{ marginTop: 8 }}>
            <Tag color={parsed.teamEfficiency.color}>{parsed.teamEfficiency.status}</Tag>
          </div>
        </Card>
      </Col>

      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic
            title="Components"
            value={parsed.components}
            prefix={<RocketOutlined />}
          />
          {parsed.components === 0 && (
            <Text type="secondary" style={{ fontSize: '12px' }}>No code analyzed yet</Text>
          )}
        </Card>
      </Col>

      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic
            title="Contexts"
            value={parsed.contexts}
            prefix={<BulbOutlined />}
          />
        </Card>
      </Col>

      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic
            title="Decisions"
            value={parsed.decisions}
            prefix={<CheckCircleOutlined />}
          />
          {parsed.decisions === 0 && (
            <Text type="secondary" style={{ fontSize: '12px' }}>No decisions recorded</Text>
          )}
        </Card>
      </Col>

      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic
            title="Tasks"
            value={parsed.tasks}
            prefix={<TrophyOutlined />}
          />
          {parsed.tasks === 0 && (
            <Text type="secondary" style={{ fontSize: '12px' }}>No tasks tracked</Text>
          )}
        </Card>
      </Col>
    </Row>
  );

  const renderHealthDetails = (parsed: ParsedInsights) => (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={12}>
        <Card title="Code Health Analysis" size="small">
          <div style={{ marginBottom: 16 }}>
            <Text strong>Overall Score: {parsed.codeHealth.score.toFixed(1)}/100</Text>
            <Progress 
              percent={parsed.codeHealth.score} 
              status={parsed.codeHealth.color === 'success' ? 'success' : 
                      parsed.codeHealth.color === 'warning' ? 'exception' : 'active'}
              showInfo={false}
              style={{ marginTop: 8 }}
            />
          </div>
          <Space direction="vertical" size="small">
            <Text>
              <InfoCircleOutlined style={{ color: '#1890ff', marginRight: 8 }} />
              Code health measures architecture quality, complexity, and maintainability
            </Text>
            {parsed.codeHealth.score >= 80 && (
              <Text type="success">
                <CheckCircleOutlined style={{ marginRight: 8 }} />
                Excellent code health - keep up the good work!
              </Text>
            )}
            {parsed.codeHealth.score < 60 && (
              <Text type="warning">
                <WarningOutlined style={{ marginRight: 8 }} />
                Consider refactoring to improve code health
              </Text>
            )}
          </Space>
        </Card>
      </Col>

      <Col xs={24} md={12}>
        <Card title="Team Efficiency Analysis" size="small">
          <div style={{ marginBottom: 16 }}>
            <Text strong>Efficiency Score: {parsed.teamEfficiency.score}%</Text>
            <Progress 
              percent={parsed.teamEfficiency.score} 
              status={parsed.teamEfficiency.color === 'success' ? 'success' : 
                      parsed.teamEfficiency.color === 'warning' ? 'exception' : 'active'}
              showInfo={false}
              style={{ marginTop: 8 }}
            />
          </div>
          <Space direction="vertical" size="small">
            <Text>
              <InfoCircleOutlined style={{ color: '#1890ff', marginRight: 8 }} />
              Team efficiency reflects task completion rates and productivity patterns
            </Text>
            {parsed.teamEfficiency.score === 0 && parsed.teamEfficiency.status === 'UNKNOWN' && (
              <Text type="secondary">
                <InfoCircleOutlined style={{ marginRight: 8 }} />
                No task data available yet
              </Text>
            )}
            {parsed.teamEfficiency.score >= 70 && (
              <Text type="success">
                <CheckCircleOutlined style={{ marginRight: 8 }} />
                High team efficiency - excellent productivity!
              </Text>
            )}
            {parsed.teamEfficiency.score > 0 && parsed.teamEfficiency.score < 50 && (
              <Text type="warning">
                <WarningOutlined style={{ marginRight: 8 }} />
                Focus on improving team workflows and processes
              </Text>
            )}
          </Space>
        </Card>
      </Col>
    </Row>
  );

  const renderKnowledgeAndIssues = (parsed: ParsedInsights) => (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={12}>
        <Card title="📋 Knowledge Gaps" size="small">
          {parsed.knowledgeGaps.length > 0 ? (
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              {parsed.knowledgeGaps.map((gap, idx) => (
                <li key={idx} style={{ marginBottom: 8 }}>
                  <Text>{gap}</Text>
                </li>
              ))}
            </ul>
          ) : (
            <Text type="secondary">No knowledge gaps identified</Text>
          )}
        </Card>
      </Col>

      <Col xs={24} md={12}>
        <Card title="⚠️ Code Issues" size="small">
          {parsed.codeIssues.length > 0 ? (
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              {parsed.codeIssues.map((issue, idx) => (
                <li key={idx} style={{ marginBottom: 8 }}>
                  <Text type="warning">{issue}</Text>
                </li>
              ))}
            </ul>
          ) : (
            <Text type="secondary">No code issues found</Text>
          )}
        </Card>
      </Col>
    </Row>
  );

  const renderRawInsights = () => (
    <Card title="Raw AIDIS Intelligence" size="small">
      <Paragraph>
        <pre style={{ 
          whiteSpace: 'pre-wrap', 
          fontFamily: 'monospace', 
          fontSize: '12px',
          background: '#f5f5f5',
          padding: '12px',
          borderRadius: '4px',
          overflow: 'auto'
        }}>
{insights?.insights?.raw || 'No insights available'}
        </pre>
      </Paragraph>
      <Text type="secondary" style={{ fontSize: '11px' }}>
        Generated: {insights?.generatedAt ? new Date(insights.generatedAt).toLocaleString() : 'Unknown'}
      </Text>
    </Card>
  );

  if (loading) {
    return (
      <Card className={className}>
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text>Loading project insights from AIDIS...</Text>
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

  if (!insights) {
    return (
      <Card className={className}>
        <Alert
          message="No Insights Available"
          description="Project insights could not be generated at this time."
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

  const parsed = parseInsights(insights.insights);

  return (
    <Card 
      className={className}
      title={
        <Space>
          <BulbOutlined />
          <span>Project Insights</span>
          <Tag color="blue">AIDIS Intelligence</Tag>
        </Space>
      }
      extra={
        <Button size="small" onClick={() => refetch()} loading={loading}>
          <ReloadOutlined /> Refresh
        </Button>
      }
    >
      <Tabs defaultActiveKey="overview" size="small">
        <TabPane tab="Overview" key="overview">
          {renderOverview(parsed)}
        </TabPane>
        
        <TabPane tab="Health Analysis" key="health">
          {renderHealthDetails(parsed)}
        </TabPane>
        
        <TabPane tab="Knowledge & Issues" key="knowledge">
          {renderKnowledgeAndIssues(parsed)}
        </TabPane>
        
        <TabPane tab="Raw Data" key="raw">
          {renderRawInsights()}
        </TabPane>
      </Tabs>
    </Card>
  );
};

export default ProjectInsights;
