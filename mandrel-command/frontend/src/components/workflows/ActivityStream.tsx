/**
 * Activity Stream Component
 *
 * Real-time display of Claude AI activity from spindles-proxy.
 * Shows thinking, tool calls, tool results, and text output.
 */

import React, { useEffect, useRef } from "react";
import { Card, Typography, Tag, Space, Empty, Badge, Collapse } from "antd";
import {
  ThunderboltOutlined,
  ToolOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  MessageOutlined,
  BulbOutlined,
} from "@ant-design/icons";
import {
  useSpindlesStore,
  spindlesWS,
  type ActivityMessage,
} from "../../services/spindlesWS";

const { Text, Paragraph } = Typography;

// Format timestamp
const formatTime = (timestamp: string): string => {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
};

// Truncate long content
const truncate = (str: string, max: number): string => {
  if (str.length <= max) return str;
  return str.slice(0, max) + "...";
};

// Render a single activity
const renderActivity = (activity: ActivityMessage, index: number) => {
  const key = `${activity.type}-${activity.timestamp}-${index}`;

  switch (activity.type) {
    case "thinking":
      return (
        <div key={key} className="activity-item thinking">
          <Space align="start" style={{ width: "100%" }}>
            <BulbOutlined style={{ color: "#722ed1", marginTop: 4 }} />
            <div style={{ flex: 1 }}>
              <Space style={{ marginBottom: 4 }}>
                <Tag color="purple">Thinking</Tag>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {formatTime(activity.timestamp)}
                </Text>
              </Space>
              <Paragraph
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: "#8b8b8b",
                  fontStyle: "italic",
                  whiteSpace: "pre-wrap",
                }}
                ellipsis={{ rows: 3, expandable: true, symbol: "more" }}
              >
                {activity.content}
              </Paragraph>
            </div>
          </Space>
        </div>
      );

    case "tool_call":
      return (
        <div key={key} className="activity-item tool-call">
          <Space align="start" style={{ width: "100%" }}>
            <ToolOutlined style={{ color: "#1890ff", marginTop: 4 }} />
            <div style={{ flex: 1 }}>
              <Space style={{ marginBottom: 4 }}>
                <Tag color="blue">{activity.toolName}</Tag>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {formatTime(activity.timestamp)}
                </Text>
              </Space>
              <Collapse
                size="small"
                items={[
                  {
                    key: "input",
                    label: <Text type="secondary">Input</Text>,
                    children: (
                      <pre
                        style={{
                          margin: 0,
                          fontSize: 11,
                          maxHeight: 150,
                          overflow: "auto",
                          background: "#f5f5f5",
                          padding: 8,
                          borderRadius: 4,
                        }}
                      >
                        {JSON.stringify(activity.input, null, 2)}
                      </pre>
                    ),
                  },
                ]}
              />
            </div>
          </Space>
        </div>
      );

    case "tool_result": {
      const isError = activity.isError;
      return (
        <div key={key} className="activity-item tool-result">
          <Space align="start" style={{ width: "100%" }}>
            {isError ? (
              <CloseCircleOutlined style={{ color: "#ff4d4f", marginTop: 4 }} />
            ) : (
              <CheckCircleOutlined style={{ color: "#52c41a", marginTop: 4 }} />
            )}
            <div style={{ flex: 1 }}>
              <Space style={{ marginBottom: 4 }}>
                <Tag color={isError ? "error" : "success"}>
                  {isError ? "Error" : "Result"}
                </Tag>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {formatTime(activity.timestamp)}
                </Text>
              </Space>
              <Collapse
                size="small"
                items={[
                  {
                    key: "content",
                    label: (
                      <Text type="secondary">
                        {truncate(
                          typeof activity.content === "string"
                            ? activity.content
                            : JSON.stringify(activity.content),
                          50
                        )}
                      </Text>
                    ),
                    children: (
                      <pre
                        style={{
                          margin: 0,
                          fontSize: 11,
                          maxHeight: 200,
                          overflow: "auto",
                          background: "#f5f5f5",
                          padding: 8,
                          borderRadius: 4,
                        }}
                      >
                        {typeof activity.content === "string"
                          ? activity.content
                          : JSON.stringify(activity.content, null, 2)}
                      </pre>
                    ),
                  },
                ]}
              />
            </div>
          </Space>
        </div>
      );
    }

    case "text":
      return (
        <div key={key} className="activity-item text">
          <Space align="start" style={{ width: "100%" }}>
            <MessageOutlined style={{ color: "#13c2c2", marginTop: 4 }} />
            <div style={{ flex: 1 }}>
              <Space style={{ marginBottom: 4 }}>
                <Tag color="cyan">Response</Tag>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {formatTime(activity.timestamp)}
                </Text>
              </Space>
              <Paragraph
                style={{
                  margin: 0,
                  fontSize: 13,
                  whiteSpace: "pre-wrap",
                }}
                ellipsis={{ rows: 5, expandable: true, symbol: "more" }}
              >
                {activity.content}
              </Paragraph>
            </div>
          </Space>
        </div>
      );

    case "error":
      return (
        <div key={key} className="activity-item error">
          <Space align="start" style={{ width: "100%" }}>
            <CloseCircleOutlined style={{ color: "#ff4d4f", marginTop: 4 }} />
            <div style={{ flex: 1 }}>
              <Space style={{ marginBottom: 4 }}>
                <Tag color="error">Error</Tag>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {formatTime(activity.timestamp)}
                </Text>
              </Space>
              <Text type="danger">{activity.message}</Text>
            </div>
          </Space>
        </div>
      );

    default:
      return null;
  }
};

interface ActivityStreamProps {
  maxHeight?: number | string;
  autoConnect?: boolean;
}

const ActivityStream: React.FC<ActivityStreamProps> = ({
  maxHeight = 400,
  autoConnect = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { activities, isConnected, error, clearActivities } = useSpindlesStore();

  // Auto-connect on mount if requested
  useEffect(() => {
    if (autoConnect) {
      spindlesWS.connect();
    }
    return () => {
      // Don't disconnect on unmount - connection is managed by BugWorkflowPanel
    };
  }, [autoConnect]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [activities.length]);

  return (
    <Card
      size="small"
      title={
        <Space>
          <ThunderboltOutlined />
          <span>AI Activity</span>
          <Badge
            status={isConnected ? "success" : "default"}
            text={isConnected ? "Live" : "Disconnected"}
          />
        </Space>
      }
      extra={
        <Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {activities.length} events
          </Text>
          {activities.length > 0 && (
            <a onClick={clearActivities} style={{ fontSize: 12 }}>
              Clear
            </a>
          )}
        </Space>
      }
      styles={{
        body: {
          maxHeight,
          overflowY: "auto",
          padding: "8px 12px",
        },
      }}
    >
      <style>
        {`
          .activity-item {
            padding: 8px 0;
            border-bottom: 1px solid #f0f0f0;
          }
          .activity-item:last-child {
            border-bottom: none;
          }
          .activity-item.thinking {
            background: #f9f0ff40;
          }
        `}
      </style>
      <div ref={containerRef}>
        {activities.length === 0 && !error ? (
          <Empty
            description={
              isConnected
                ? "Waiting for AI activity..."
                : "Connect to see AI activity"
            }
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : error ? (
          <Empty
            description={error}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          activities.map((activity, index) => renderActivity(activity, index))
        )}
      </div>
    </Card>
  );
};

export default ActivityStream;
