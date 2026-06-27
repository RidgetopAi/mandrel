import React from 'react';
import { Card, Tag, Typography, Space, Tooltip, Checkbox, Button, Dropdown, Menu } from 'antd';
import {
  EyeOutlined, EditOutlined, DeleteOutlined, ShareAltOutlined,
  CalendarOutlined, FolderOutlined, TagsOutlined,
  FileMarkdownOutlined, CopyOutlined, FileTextOutlined, DatabaseOutlined,
  LinkOutlined
} from '@ant-design/icons';
import type { Context } from '../../types/context';
import {
  getTypeColor,
  getTypeDisplayName,
  highlightSearchTermsAsNodes,
} from '../../utils/contextHelpers';
import { markdownExcerpt } from '../common/MarkdownContent';
import { contextHandleChip } from '../../utils/refHelpers';
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

  // Clean plain-text excerpt (markdown syntax stripped) so the card preview never
  // shows cut-off `**`/`#`/`![](` fragments; search highlighting then applies to
  // the readable text.
  const truncatedContent = markdownExcerpt(context.content, 120);
  const highlightedContent = highlightSearchTermsAsNodes(truncatedContent, searchTerm);

  // Copyable id / named-ref affordance on the COLLAPSED card. Previously the only
  // copyable id lived in ContextDetail (after expanding). If the context carries a
  // well-formed `ref:<slug>` tag, surface that ref as the copyable handle (it is the
  // human-friendly, first-class stable reference — e.g. "ref:resume" — that resolves
  // via context_search({tags:["ref:<slug>"]})); otherwise fall back to the short
  // UUID prefix. Uses the same Ant `copyable` pattern as ContextDetail (copies the
  // FULL value, shows a short label). When it IS a ref the chip is visually distinct
  // (link icon + accent color) so a user can SEE which contexts have a reusable ref.
  // The chip decision is the shared, unit-tested `contextHandleChip` predicate.
  const handleChip = contextHandleChip(context.tags, context.id);
  const isRefChip = handleChip.isRef;
  const refTag = isRefChip ? handleChip.label : undefined;
  const idChipLabel = handleChip.label;
  const idChipCopyText = handleChip.copyText;

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
            {/* Copyable id / named-ref handle (collapsed-card affordance). A named
                ref renders as a distinct link-icon / accent chip so it reads as a
                reusable handle, not just an id. */}
            <Tooltip title={isRefChip ? `Copy ref handle: ${refTag}` : `Copy context id: ${context.id}`}>
              <Tag
                icon={isRefChip ? <LinkOutlined /> : <DatabaseOutlined />}
                color={isRefChip ? 'geekblue' : undefined}
                style={{ margin: 0 }}
              >
                <Text
                  code
                  style={{ fontSize: '12px' }}
                  copyable={{ text: idChipCopyText, tooltips: ['Copy', 'Copied'] }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {idChipLabel}
                </Text>
              </Tag>
            </Tooltip>
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