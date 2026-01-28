/**
 * Investigation Log Component
 *
 * Real-time timeline display of AI investigation events.
 * Uses Ant Design Timeline with auto-scroll.
 */

import React, { useEffect, useRef } from 'react';
import { Timeline, Typography, Tag, Card, Space, Empty, Spin } from 'antd';
import {
  FileSearchOutlined,
  SearchOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExperimentOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import type { InvestigationEvent, InvestigationAction } from '../../types/workflow';

const { Text, Paragraph } = Typography;

interface InvestigationLogProps {
  events: InvestigationEvent[];
  isStreaming?: boolean;
  maxHeight?: number | string;
}

// Map actions to icons and colors
const actionConfig: Record<
  InvestigationAction,
  { icon: React.ReactNode; color: string; label: string }
> = {
  file_read: {
    icon: <FileSearchOutlined />,
    color: 'blue',
    label: 'Reading File',
  },
  code_search: {
    icon: <SearchOutlined />,
    color: 'cyan',
    label: 'Searching Code',
  },
  hypothesis: {
    icon: <BulbOutlined />,
    color: 'gold',
    label: 'Hypothesis',
  },
  evidence: {
    icon: <CheckCircleOutlined />,
    color: 'green',
    label: 'Evidence Found',
  },
  rejection: {
    icon: <CloseCircleOutlined />,
    color: 'red',
    label: 'Hypothesis Rejected',
  },
  test_check: {
    icon: <ExperimentOutlined />,
    color: 'purple',
    label: 'Checking Tests',
  },
  fix_proposed: {
    icon: <ToolOutlined />,
    color: 'orange',
    label: 'Fix Proposed',
  },
};

const formatTimestamp = (date: Date): string => {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const renderEventContent = (event: InvestigationEvent): React.ReactNode => {
  const { action, details } = event;

  switch (action) {
    case 'file_read':
      return (
        <Space direction="vertical" size={2}>
          <Text code>{details.file}</Text>
          {details.line && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Lines {details.line}
              {details.lineEnd ? `-${details.lineEnd}` : ''} ({details.linesRead || '?'} lines)
            </Text>
          )}
        </Space>
      );

    case 'code_search':
      return (
        <Space direction="vertical" size={2}>
          <Text>
            Searching for: <Text code>{details.query || details.pattern}</Text>
          </Text>
          {details.matchCount !== undefined && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Found {details.matchCount} match{details.matchCount !== 1 ? 'es' : ''}
            </Text>
          )}
        </Space>
      );

    case 'hypothesis':
      return (
        <Space direction="vertical" size={2}>
          <Paragraph style={{ margin: 0 }}>{details.finding}</Paragraph>
          {details.confidence && (
            <Tag
              color={
                details.confidence === 'high'
                  ? 'green'
                  : details.confidence === 'medium'
                  ? 'orange'
                  : 'red'
              }
            >
              {details.confidence} confidence
            </Tag>
          )}
        </Space>
      );

    case 'evidence':
      return (
        <Space direction="vertical" size={2}>
          <Paragraph style={{ margin: 0 }}>{details.finding}</Paragraph>
          {details.file && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              in <Text code>{details.file}</Text>
              {details.line && `:${details.line}`}
            </Text>
          )}
        </Space>
      );

    case 'rejection':
      return (
        <Space direction="vertical" size={2}>
          <Text delete type="secondary">
            {details.finding}
          </Text>
          <Text italic style={{ fontSize: 12 }}>
            Reason: {details.reason}
          </Text>
        </Space>
      );

    case 'test_check':
      return (
        <Space direction="vertical" size={2}>
          <Text code>{details.file}</Text>
          {details.finding && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {details.finding}
            </Text>
          )}
        </Space>
      );

    case 'fix_proposed':
      return (
        <Space direction="vertical" size={2}>
          <Text>
            <Text code>{details.file}</Text>
            {details.changeType && (
              <Tag
                color={
                  details.changeType === 'add'
                    ? 'green'
                    : details.changeType === 'delete'
                    ? 'red'
                    : 'blue'
                }
                style={{ marginLeft: 8 }}
              >
                {details.changeType}
              </Tag>
            )}
          </Text>
          {details.summary && (
            <Text type="secondary">{details.summary}</Text>
          )}
        </Space>
      );

    default:
      return <Text type="secondary">Unknown event type</Text>;
  }
};

const InvestigationLog: React.FC<InvestigationLogProps> = ({
  events,
  isStreaming = false,
  maxHeight = 400,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events.length]);

  if (events.length === 0 && !isStreaming) {
    return (
      <Empty
        description="No investigation events yet"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }

  return (
    <Card
      size="small"
      title={
        <Space>
          <SearchOutlined />
          <span>Investigation Log</span>
          {isStreaming && <Spin size="small" />}
        </Space>
      }
      extra={
        <Text type="secondary" style={{ fontSize: 12 }}>
          {events.length} event{events.length !== 1 ? 's' : ''}
        </Text>
      }
      styles={{
        body: {
          maxHeight,
          overflowY: 'auto',
          padding: '16px 12px',
        },
      }}
    >
      <div ref={containerRef}>
        <Timeline
          pending={isStreaming ? 'Investigating...' : false}
          items={events.map((event, index) => {
            const config = actionConfig[event.action];
            return {
              key: `${event.workflowId}-${event.sequence}-${index}`,
              color: config.color,
              dot: config.icon,
              children: (
                <div style={{ paddingBottom: 8 }}>
                  <Space
                    style={{
                      width: '100%',
                      justifyContent: 'space-between',
                      marginBottom: 4,
                    }}
                  >
                    <Tag color={config.color}>{config.label}</Tag>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {formatTimestamp(event.timestamp)}
                    </Text>
                  </Space>
                  {renderEventContent(event)}
                </div>
              ),
            };
          })}
        />
      </div>
    </Card>
  );
};

export default InvestigationLog;
