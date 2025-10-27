import React from 'react';
import { Card, Tag, Typography, Space, Tooltip, Checkbox, Button, Dropdown, Menu } from 'antd';
import {
  EyeOutlined, EditOutlined, DeleteOutlined, ShareAltOutlined,
  CalendarOutlined, FolderOutlined, TagsOutlined,
  FileMarkdownOutlined, CopyOutlined, FileTextOutlined
} from '@ant-design/icons';
import type { Context } from '../../types/context';
import {
  getTypeColor,
  getTypeDisplayName,
  highlightSearchTermsAsNodes,
  truncateContent,
} from '../../utils/contextHelpers';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);

const { Text, Paragraph } = Typography;

interface ContextCardProps {
  context: Context;
  selected?: boolean;
  showCheckbox?: boolean;
  searchTerm?: string;
  onSelect?: (id: string, selected: boolean) => void;
  onView?: (context: Context) => void;
  onEdit?: (context: Context) => void;
  onDelete?: (context: Context) => void;
  onShare?: (context: Context, format: 'markdown' | 'text' | 'json') => void;
}

const ContextCard: React.FC<ContextCardProps> = ({
  context,
  selected = false,
  showCheckbox = false,
  searchTerm,
  onSelect,
  onView,
  onEdit,
  onDelete,
  onShare
}) => {
  const typeColor = getTypeColor(context.type);
  const typeDisplayName = getTypeDisplayName(context.type);
  
  const handleCheckboxChange = (e: any) => {
    onSelect?.(context.id, e.target.checked);
  };

  const truncatedContent = truncateContent(context.content, 120);
  const highlightedContent = highlightSearchTermsAsNodes(truncatedContent, searchTerm);

  const actions = [
    <Tooltip title="View Details" key="view">
      <Button 
        type="text" 
        icon={<EyeOutlined />}
        onClick={() => onView?.(context)}
      />
    </Tooltip>,
    <Tooltip title="Edit" key="edit">
      <Button 
        type="text" 
        icon={<EditOutlined />}
        onClick={() => onEdit?.(context)}
      />
    </Tooltip>,
    <Tooltip title="Export Context" key="share">
      <Dropdown
        overlay={
          <Menu>
            <Menu.Item
              key="markdown"
              icon={<FileMarkdownOutlined />}
              onClick={() => onShare?.(context, 'markdown')}
            >
              Export as Markdown
            </Menu.Item>
            <Menu.Item
              key="text"
              icon={<CopyOutlined />}
              onClick={() => onShare?.(context, 'text')}
            >
              Copy as Text
            </Menu.Item>
            <Menu.Item
              key="json"
              icon={<FileTextOutlined />}
              onClick={() => onShare?.(context, 'json')}
            >
              Export as JSON
            </Menu.Item>
          </Menu>
        }
        trigger={['click']}
      >
        <Button
          type="text"
          icon={<ShareAltOutlined />}
        />
      </Dropdown>
    </Tooltip>,
    <Tooltip title="Delete" key="delete">
      <Button 
        type="text" 
        danger
        icon={<DeleteOutlined />}
        onClick={() => onDelete?.(context)}
      />
    </Tooltip>
  ];

  return (
    <Card
      size="small"
      hoverable
      className={`context-card ${selected ? 'context-card-selected' : ''}`}
      style={{ 
        borderColor: selected ? '#1890ff' : undefined,
        boxShadow: selected ? '0 2px 8px rgba(24, 144, 255, 0.2)' : undefined
      }}
      actions={actions}
      extra={
        showCheckbox && (
          <Checkbox 
            checked={selected}
            onChange={handleCheckboxChange}
          />
        )
      }
    >
      <div className="context-card-header">
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          {/* Type and Project */}
          <Space wrap>
            <Tag color={typeColor} style={{ margin: 0 }}>
              {typeDisplayName}
            </Tag>
            {context.project_name && (
              <Tag icon={<FolderOutlined />} color="blue">
                {context.project_name}
              </Tag>
            )}
            {context.relevance_score && (
              <Tag color="gold">
                Score: {context.relevance_score.toFixed(2)}
              </Tag>
            )}
          </Space>

          {/* Content Preview */}
          <Paragraph 
            style={{ margin: 0 }}
            ellipsis={{ rows: 3, expandable: false }}
          >
            {highlightedContent}
          </Paragraph>

          {/* Tags */}
          {context.tags && context.tags.length > 0 && (
            <Space wrap size="small">
              <TagsOutlined style={{ color: '#8c8c8c', fontSize: '12px' }} />
              {context.tags.slice(0, 3).map(tag => (
                <Tag key={tag} color="processing">
                  {tag}
                </Tag>
              ))}
              {context.tags.length > 3 && (
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  +{context.tags.length - 3} more
                </Text>
              )}
            </Space>
          )}

          {/* Metadata */}
          <Space style={{ fontSize: '12px', color: '#8c8c8c' }}>
            <CalendarOutlined />
            <Text type="secondary">
              {dayjs.utc(context.created_at).local().fromNow()}
            </Text>
            {context.session_id && (
              <>
                <span>•</span>
                <Text type="secondary" code>
                  Session: {context.session_id.slice(0, 8)}
                </Text>
              </>
            )}
          </Space>
        </Space>
      </div>
    </Card>
  );
};

export default ContextCard;