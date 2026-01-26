/**
 * Surveyor Warning List
 * Displays and filters codebase warnings
 * Part of MandrelV2 Surveyor Integration - Phase 3
 */

import React, { useState } from 'react';
import {
  Card,
  List,
  Tag,
  Typography,
  Space,
  Select,
  Empty,
  Spin,
  Badge,
  Tooltip,
  Collapse,
} from 'antd';
import {
  WarningOutlined,
  InfoCircleOutlined,
  CloseCircleOutlined,
  FileOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import { useWarnings } from '../../hooks/useSurveyorData';
import type { Warning } from '../../api/surveyorClient';

const { Text, Paragraph } = Typography;
const { Panel } = Collapse;

// Warning level configuration
const LEVEL_CONFIG = {
  error: { color: 'red', icon: <CloseCircleOutlined />, priority: 1 },
  warning: { color: 'orange', icon: <WarningOutlined />, priority: 2 },
  info: { color: 'blue', icon: <InfoCircleOutlined />, priority: 3 },
};

// Warning category labels
const CATEGORY_LABELS: Record<string, string> = {
  circular_dependency: 'Circular Dependency',
  orphaned_code: 'Orphaned Code',
  duplicate_code: 'Duplicate Code',
  large_file: 'Large File',
  deep_nesting: 'Deep Nesting',
  missing_types: 'Missing Types',
  unused_export: 'Unused Export',
  security_concern: 'Security Concern',
};

interface SurveyorWarningListProps {
  scanId: string | undefined;
  onWarningClick?: (warning: Warning) => void;
}

export const SurveyorWarningList: React.FC<SurveyorWarningListProps> = ({
  scanId,
  onWarningClick,
}) => {
  const [levelFilter, setLevelFilter] = useState<string | undefined>(undefined);
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);

  const { data, isLoading, error } = useWarnings(scanId, {
    level: levelFilter,
    category: categoryFilter,
    limit: 100,
  });

  const warnings = data?.warnings || [];
  const total = data?.total || 0;

  // Get unique categories for filter
  const categories = [...new Set(warnings.map((w) => w.category))];

  const renderWarningItem = (warning: Warning) => {
    const levelConfig = LEVEL_CONFIG[warning.level];
    const categoryLabel = CATEGORY_LABELS[warning.category] || warning.category;

    return (
      <List.Item
        key={warning.id}
        style={{ cursor: 'pointer' }}
        onClick={() => onWarningClick?.(warning)}
      >
        <List.Item.Meta
          avatar={
            <Badge
              count={levelConfig.icon}
              style={{ backgroundColor: 'transparent' }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  background: `var(--ant-color-${levelConfig.color}-1)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: `var(--ant-color-${levelConfig.color})`,
                }}
              >
                {levelConfig.icon}
              </div>
            </Badge>
          }
          title={
            <Space>
              <Text strong>{warning.title}</Text>
              <Tag color={levelConfig.color}>{warning.level}</Tag>
              <Tag>{categoryLabel}</Tag>
            </Space>
          }
          description={
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Text type="secondary">{warning.description}</Text>
              {warning.filePath && (
                <Space>
                  <FileOutlined />
                  <Text code style={{ fontSize: '12px' }}>
                    {warning.filePath}
                  </Text>
                </Space>
              )}
              {warning.suggestion && (
                <Collapse ghost size="small">
                  <Panel
                    header={
                      <Space>
                        <BulbOutlined />
                        <Text type="secondary">Suggestion</Text>
                      </Space>
                    }
                    key="suggestion"
                  >
                    <Paragraph style={{ margin: 0 }}>
                      {warning.suggestion.summary}
                    </Paragraph>
                    {warning.suggestion.codeExample && (
                      <pre
                        style={{
                          background: '#f5f5f5',
                          padding: '8px',
                          borderRadius: '4px',
                          marginTop: '8px',
                          fontSize: '12px',
                          overflow: 'auto',
                        }}
                      >
                        {warning.suggestion.codeExample}
                      </pre>
                    )}
                  </Panel>
                </Collapse>
              )}
            </Space>
          }
        />
      </List.Item>
    );
  };

  if (isLoading) {
    return (
      <Card style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin tip="Loading warnings..." />
      </Card>
    );
  }

  if (error) {
    return (
      <Card style={{ height: 400 }}>
        <Empty description={`Error: ${(error as Error).message}`} />
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <WarningOutlined />
          <Text strong>Warnings</Text>
          <Badge count={total} style={{ backgroundColor: '#faad14' }} />
        </Space>
      }
      extra={
        <Space>
          <Select
            placeholder="Filter by level"
            allowClear
            style={{ width: 130 }}
            value={levelFilter}
            onChange={setLevelFilter}
            options={[
              { value: 'error', label: 'Errors' },
              { value: 'warning', label: 'Warnings' },
              { value: 'info', label: 'Info' },
            ]}
          />
          <Select
            placeholder="Filter by category"
            allowClear
            style={{ width: 180 }}
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={categories.map((cat) => ({
              value: cat,
              label: CATEGORY_LABELS[cat] || cat,
            }))}
          />
        </Space>
      }
      bodyStyle={{ maxHeight: 500, overflow: 'auto' }}
    >
      {warnings.length === 0 ? (
        <Empty
          description={
            levelFilter || categoryFilter
              ? 'No warnings match the current filters'
              : 'No warnings found'
          }
        />
      ) : (
        <List
          itemLayout="horizontal"
          dataSource={warnings}
          renderItem={renderWarningItem}
          size="small"
        />
      )}
    </Card>
  );
};

export default SurveyorWarningList;
