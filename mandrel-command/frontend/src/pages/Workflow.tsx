/**
 * Workflow Page
 *
 * Main page for AI-assisted workflows.
 * Currently features the Bug Fix workflow, with more workflows coming.
 */

import React from 'react';
import { Typography, Space, Divider, Row, Col, Card, Tag } from 'antd';
import {
  BugOutlined,
  RocketOutlined,
  ThunderboltOutlined,
  PlusCircleOutlined,
} from '@ant-design/icons';
import { BugWorkflowPanel } from '../components/workflows';

const { Title, Text, Paragraph } = Typography;

// Placeholder cards for future workflows
const upcomingWorkflows = [
  {
    title: 'Feature Development',
    description: 'AI-guided feature implementation with spec generation',
    icon: <RocketOutlined style={{ fontSize: 24, color: '#722ed1' }} />,
    color: '#f9f0ff',
    status: 'Coming Soon',
  },
  {
    title: 'Refactoring',
    description: 'Safe, incremental code refactoring with test preservation',
    icon: <ThunderboltOutlined style={{ fontSize: 24, color: '#fa8c16' }} />,
    color: '#fff7e6',
    status: 'Coming Soon',
  },
];

const Workflow: React.FC = () => {
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Header */}
      <div>
        <Title level={2} style={{ marginBottom: 8 }}>
          AI Workflows
        </Title>
        <Paragraph type="secondary">
          Structured workflows that combine AI investigation with human oversight.
          Each workflow enforces review gates to ensure you stay in control.
        </Paragraph>
      </div>

      {/* Bug Fix Workflow */}
      <BugWorkflowPanel />

      <Divider>More Workflows</Divider>

      {/* Upcoming Workflows Grid */}
      <Row gutter={[16, 16]}>
        {upcomingWorkflows.map((workflow, index) => (
          <Col xs={24} md={12} key={index}>
            <Card
              hoverable
              style={{
                background: workflow.color,
                border: '1px dashed #d9d9d9',
                opacity: 0.7,
              }}
            >
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Space>
                  {workflow.icon}
                  <Title level={5} style={{ margin: 0 }}>
                    {workflow.title}
                  </Title>
                  <Tag color="default">{workflow.status}</Tag>
                </Space>
                <Text type="secondary">{workflow.description}</Text>
              </Space>
            </Card>
          </Col>
        ))}

        {/* Add Your Own */}
        <Col xs={24} md={12}>
          <Card
            style={{
              border: '1px dashed #d9d9d9',
              background: '#fafafa',
              opacity: 0.5,
            }}
          >
            <Space
              direction="vertical"
              size="small"
              align="center"
              style={{ width: '100%', textAlign: 'center' }}
            >
              <PlusCircleOutlined style={{ fontSize: 24, color: '#bfbfbf' }} />
              <Text type="secondary">Custom workflows coming soon</Text>
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
};

export default Workflow;
