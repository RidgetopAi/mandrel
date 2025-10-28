/**
 * Visualizations Page
 * Provides dependency analysis and visualization tools
 */

import React from 'react';
import { Typography, Space, Row, Col, Card } from 'antd';
import { BranchesOutlined } from '@ant-design/icons';
import VisualizationPanel from '../components/visualizations/VisualizationPanel';

const { Title, Paragraph } = Typography;

const Visualizations: React.FC = () => {
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div>
        <Title level={2}>
          <BranchesOutlined style={{ marginRight: 8 }} />
          Dependency Visualizations
        </Title>
        <Paragraph type="secondary">
          Analyze your codebase dependencies, detect circular imports, identify complex modules, and visualize your project structure.
        </Paragraph>
      </div>

      {/* Visualization Panel */}
      <Row gutter={[24, 24]}>
        <Col xs={24} lg={12}>
          <VisualizationPanel
            targetPath="src/main.ts"
            extensions={['ts', 'tsx', 'js', 'jsx']}
          />
        </Col>

        <Col xs={24} lg={12}>
          <Card size="small" title="About Dependency Analysis">
            <Space direction="vertical" size="middle">
              <div>
                <Title level={5}>Full Dependency Analysis</Title>
                <Paragraph type="secondary">
                  Comprehensive analysis of your codebase including file count, dependency count,
                  circular dependencies, orphan files, and generates a visual dependency graph.
                </Paragraph>
              </div>

              <div>
                <Title level={5}>Circular Dependencies</Title>
                <Paragraph type="secondary">
                  Detects circular import chains where modules depend on each other in a loop.
                  Circular dependencies can cause runtime errors and make code harder to maintain.
                </Paragraph>
              </div>

              <div>
                <Title level={5}>Complex Modules</Title>
                <Paragraph type="secondary">
                  Identifies modules with the highest number of dependencies. High coupling can
                  indicate "God objects" or modules that are doing too much. Consider refactoring
                  these for better maintainability.
                </Paragraph>
              </div>

              <div>
                <Title level={5}>Best Practices</Title>
                <ul>
                  <li>Keep circular dependencies at zero</li>
                  <li>Limit module dependencies to &lt; 10 when possible</li>
                  <li>Regularly review orphan files and remove unused code</li>
                  <li>Use the dependency graph to understand module relationships</li>
                </ul>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
};

export default Visualizations;
