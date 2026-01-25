/**
 * Surveyor Page
 * Future feature: Multi-language codebase analysis and visualization
 */

import React from 'react';
import { Typography, Space, Card, Empty, Tag } from 'antd';
import { RadarChartOutlined, RocketOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

const Surveyor: React.FC = () => {
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div>
        <Title level={2}>
          <RadarChartOutlined style={{ marginRight: 8 }} />
          Surveyor
          <Tag color="blue" style={{ marginLeft: 12, verticalAlign: 'middle' }}>Coming Soon</Tag>
        </Title>
        <Paragraph type="secondary">
          Advanced codebase analysis and visualization tool
        </Paragraph>
      </div>

      {/* Placeholder Card */}
      <Card>
        <Empty
          image={<RocketOutlined style={{ fontSize: 64, color: '#722ed1' }} />}
          imageStyle={{ height: 80 }}
          description={
            <Space direction="vertical" size="middle" style={{ marginTop: 16 }}>
              <Text strong style={{ fontSize: 18 }}>Surveyor Integration Planned</Text>
              <Paragraph type="secondary" style={{ maxWidth: 500, margin: '0 auto' }}>
                Surveyor will provide comprehensive codebase analysis with support for multiple languages
                including TypeScript, Python, Go, Rust, and more.
              </Paragraph>

              <Space direction="vertical" size="small" style={{ textAlign: 'left', marginTop: 16 }}>
                <Text strong>Planned Features:</Text>
                <ul style={{ textAlign: 'left', color: 'rgba(0, 0, 0, 0.45)' }}>
                  <li>Multi-language dependency analysis</li>
                  <li>Interactive dependency graphs</li>
                  <li>Circular dependency detection</li>
                  <li>Code complexity metrics</li>
                  <li>Project health scoring</li>
                  <li>Integration with project selector</li>
                </ul>
              </Space>
            </Space>
          }
        />
      </Card>
    </Space>
  );
};

export default Surveyor;
