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

// Define the ProjectInsights type based on what the component expects
interface ProjectInsightsData {
  insights: string;
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
  recommendations?: string[];
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

  const parseInsights = (rawInsights: string | any): ParsedInsights => {
    try {
      // Ensure rawInsights is a string
      const insightsStr = typeof rawInsights === 'string' ? rawInsights : JSON.stringify(rawInsights);
      
      // Parse the text response from MCP tool
      // Extract metrics using regex patterns
      const codeHealthMatch = insightsStr.match(/Code Health:.*?(\d+\.?\d*)/);
      const teamEfficiencyMatch = insightsStr.match(/Team Efficiency:.*?(\d+)/);
      const componentsMatch = insightsStr.match(/Components:\s*(\d+)/);
      const contextsMatch = insightsStr.match(/Contexts:\s*(\d+)/);
      const decisionsMatch = insightsStr.match(/Decisions:\s*(\d+)/);
      const tasksMatch = insightsStr.match(/Tasks:\s*(\d+)/);

      const codeScore = codeHealthMatch ? parseFloat(codeHealthMatch[1]) : 0;
      const teamScore = teamEfficiencyMatch ? parseInt(teamEfficiencyMatch[1]) : 0;

      // Determine status and colors based on scores
      const getHealthStatus = (score: number) => {
        if (score >= 80) return { status: 'HEALTHY', color: 'success' };
        if (score >= 60) return { status: 'MODERATE', color: 'warning' };
        return { status: 'NEEDS ATTENTION', color: 'error' };
      };

      const codeHealth = getHealthStatus(codeScore);
      const teamHealth = getHealthStatus(teamScore);

      return {
        codeHealth: {
          score: codeScore,
          status: codeHealth.status,
          color: codeHealth.color
        },
        teamEfficiency: {
          score: teamScore,
          status: teamHealth.status,
          color: teamHealth.color
        },
        components: componentsMatch ? parseInt(componentsMatch[1]) : 0,
        contexts: contextsMatch ? parseInt(contextsMatch[1]) : 0,
        decisions: decisionsMatch ? parseInt(decisionsMatch[1]) : 0,
        tasks: tasksMatch ? parseInt(tasksMatch[1]) : 0
      };
    } catch (err) {
      console.error('Error parsing insights:', err);
      return {
        codeHealth: { score: 0, status: 'UNKNOWN', color: 'default' },
        teamEfficiency: { score: 0, status: 'UNKNOWN', color: 'default' },
        components: 0,
        contexts: 0,
        decisions: 0,
        tasks: 0
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
        </Card>
      </Col>

      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic
            title="Tasks"
            value={parsed.tasks}
            prefix={<TrophyOutlined />}
          />
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
            {parsed.teamEfficiency.score >= 70 && (
              <Text type="success">
                <CheckCircleOutlined style={{ marginRight: 8 }} />
                High team efficiency - excellent productivity!
              </Text>
            )}
            {parsed.teamEfficiency.score < 50 && (
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
          {insights?.insights || 'No insights available'}
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
        
        <TabPane tab="Raw Data" key="raw">
          {renderRawInsights()}
        </TabPane>
      </Tabs>
    </Card>
  );
};

export default ProjectInsights;
