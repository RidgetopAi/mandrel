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
  FileTextOutlined,
  EditOutlined,
  CodeOutlined,
  SearchOutlined,
  FolderOpenOutlined,
  GlobalOutlined,
  RobotOutlined,
  ExperimentOutlined,
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

// Get tool-specific icon
const getToolIcon = (toolName: string) => {
  switch (toolName) {
    case "Read":
    case "file_read":
      return <FileTextOutlined style={{ color: "#1890ff" }} />;
    case "Edit":
    case "edit_file":
    case "file_edit":
      return <EditOutlined style={{ color: "#faad14" }} />;
    case "Write":
    case "file_write":
      return <EditOutlined style={{ color: "#52c41a" }} />;
    case "Bash":
    case "bash":
      return <CodeOutlined style={{ color: "#722ed1" }} />;
    case "Grep":
    case "grep":
      return <SearchOutlined style={{ color: "#13c2c2" }} />;
    case "Glob":
    case "glob":
      return <FolderOpenOutlined style={{ color: "#eb2f96" }} />;
    case "Task":
      return <RobotOutlined style={{ color: "#fa8c16" }} />;
    case "WebFetch":
    case "WebSearch":
      return <GlobalOutlined style={{ color: "#2f54eb" }} />;
    default:
      if (toolName.startsWith("mcp__") || toolName.includes("context_") ||
          toolName.includes("project_") || toolName.includes("mandrel_")) {
        return <ExperimentOutlined style={{ color: "#9254de" }} />;
      }
      return <ToolOutlined style={{ color: "#1890ff" }} />;
  }
};

// Truncate file path, showing end (filename + parent)
const truncatePath = (path: string, max: number): string => {
  if (path.length <= max) return path;
  const parts = path.split("/");
  if (parts.length >= 2) {
    const suffix = parts.slice(-2).join("/");
    if (suffix.length + 4 <= max) {
      return ".../" + suffix;
    }
  }
  return "..." + path.slice(-(max - 3));
};

// Extract readable summary from tool input
const extractToolSummary = (toolName: string, input: any): string | null => {
  if (!input || typeof input !== "object") return null;

  switch (toolName) {
    case "Read":
    case "file_read":
      if (input.file_path || input.path) {
        return truncatePath(input.file_path || input.path, 50);
      }
      break;
    case "Edit":
    case "edit_file":
    case "file_edit":
      if (input.file_path || input.path) {
        const path = truncatePath(input.file_path || input.path, 40);
        if (input.old_string && input.new_string) {
          const oldLines = (input.old_string as string).split("\n").length;
          const newLines = (input.new_string as string).split("\n").length;
          const added = Math.max(0, newLines - oldLines);
          const removed = Math.max(0, oldLines - newLines);
          if (added > 0 || removed > 0) {
            return `${path} [+${added} -${removed}]`;
          }
          return `${path} [~${oldLines} lines]`;
        }
        return path;
      }
      break;
    case "Write":
    case "file_write":
      if (input.file_path || input.path) {
        const path = truncatePath(input.file_path || input.path, 40);
        if (input.content) {
          const lines = (input.content as string).split("\n").length;
          return `${path} [${lines} lines]`;
        }
        return path;
      }
      break;
    case "Bash":
    case "bash":
      if (input.command) {
        const firstLine = (input.command as string).split("\n")[0];
        return truncate(firstLine, 60);
      }
      break;
    case "Grep":
    case "grep":
      const parts: string[] = [];
      if (input.pattern) {
        parts.push(`/${truncate(input.pattern, 25)}/`);
      }
      if (input.path) {
        parts.push(truncatePath(input.path, 25));
      }
      return parts.length > 0 ? parts.join(" ") : null;
    case "Glob":
    case "glob":
      if (input.pattern) {
        return `"${truncate(input.pattern, 45)}"`;
      }
      break;
    case "Task":
      if (input.description) {
        return truncate(input.description, 50);
      }
      break;
    case "WebFetch":
      if (input.url) {
        return truncate(input.url, 50);
      }
      break;
    case "WebSearch":
      if (input.query) {
        return `"${truncate(input.query, 45)}"`;
      }
      break;
    default:
      // Mandrel MCP tools
      if (toolName.startsWith("mcp__") || toolName.includes("context_") ||
          toolName.includes("project_") || toolName.includes("mandrel_")) {
        if (input.content) return truncate(input.content, 40);
        if (input.query) return `"${truncate(input.query, 35)}"`;
        if (input.project) return `→ ${input.project}`;
        if (input.title) return truncate(input.title, 40);
        if (input.name) return input.name;
      }
  }
  return null;
};

// Render a single activity
const renderActivity = (activity: ActivityMessage, index: number) => {
  const key = `${activity.type}-${activity.timestamp}-${index}`;

  switch (activity.type) {
    case "thinking": {
      // Show first line truncated for compact view
      const firstLine = activity.content.split("\n")[0].trim();
      const preview = truncate(firstLine, 80);
      const hasMore = activity.content.length > preview.length;
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
              {hasMore ? (
                <Collapse
                  size="small"
                  items={[
                    {
                      key: "thinking",
                      label: (
                        <Text
                          style={{
                            fontSize: 12,
                            color: "#8b8b8b",
                            fontStyle: "italic",
                          }}
                        >
                          {preview}
                        </Text>
                      ),
                      children: (
                        <Paragraph
                          style={{
                            margin: 0,
                            fontSize: 12,
                            color: "#8b8b8b",
                            fontStyle: "italic",
                            whiteSpace: "pre-wrap",
                            maxHeight: 200,
                            overflow: "auto",
                          }}
                        >
                          {activity.content}
                        </Paragraph>
                      ),
                    },
                  ]}
                />
              ) : (
                <Text
                  style={{
                    fontSize: 12,
                    color: "#8b8b8b",
                    fontStyle: "italic",
                  }}
                >
                  {preview}
                </Text>
              )}
            </div>
          </Space>
        </div>
      );
    }

    case "tool_call": {
      const toolIcon = getToolIcon(activity.toolName);
      const summary = extractToolSummary(activity.toolName, activity.input);
      return (
        <div key={key} className="activity-item tool-call">
          <Space align="start" style={{ width: "100%" }}>
            <span style={{ marginTop: 4 }}>{toolIcon}</span>
            <div style={{ flex: 1 }}>
              <Space style={{ marginBottom: 4 }} wrap>
                <Tag color="blue">{activity.toolName}</Tag>
                {summary && (
                  <Text code style={{ fontSize: 11, maxWidth: 400 }}>
                    {summary}
                  </Text>
                )}
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {formatTime(activity.timestamp)}
                </Text>
              </Space>
              <Collapse
                size="small"
                items={[
                  {
                    key: "input",
                    label: <Text type="secondary">Full Input</Text>,
                    children: (
                      <pre
                        style={{
                          margin: 0,
                          fontSize: 11,
                          maxHeight: 150,
                          overflow: "auto",
                          background: "#1f1f1f",
                          color: "#e0e0e0",
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
    }

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
                          background: "#1f1f1f",
                          color: "#e0e0e0",
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
