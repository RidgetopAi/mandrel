import React from 'react';
import { Card, Tag, Typography, Space, Tooltip, Checkbox, Button, Badge, Progress } from 'antd';
import { 
  EyeOutlined, EditOutlined, DeleteOutlined, ShareAltOutlined,
  CalendarOutlined, FolderOutlined, CodeOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, WarningOutlined, UsergroupAddOutlined
} from '@ant-design/icons';
import { NamingEntry } from './types';
import { NamingApi } from '../../services/namingApi';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);

const { Text, Paragraph } = Typography;

interface NamingCardProps {
  entry: NamingEntry;
  selected?: boolean;
  showCheckbox?: boolean;
  searchTerm?: string;
  onSelect?: (id: number, selected: boolean) => void;
  onView?: (entry: NamingEntry) => void;
  onEdit?: (entry: NamingEntry) => void;
  onDelete?: (entry: NamingEntry) => void;
  onShare?: (entry: NamingEntry) => void;
}

const NamingCard: React.FC<NamingCardProps> = ({
  entry,
  selected = false,
  showCheckbox = false,
  searchTerm,
  onSelect,
  onView,
  onEdit,
  onDelete,
  onShare
}) => {
  const typeColor = NamingApi.getTypeColor(entry.type);
  const typeDisplayName = NamingApi.getTypeDisplayName(entry.type);
  const statusColor = NamingApi.getStatusColor(entry.status);
  const statusDisplayName = NamingApi.getStatusDisplayName(entry.status);
  const complianceColor = NamingApi.getComplianceColor(entry.compliance_score);
  const priority = NamingApi.getEntryPriority(entry);
  
  const handleCheckboxChange = (e: any) => {
    onSelect?.(entry.id, e.target.checked);
  };

  const highlightedName = searchTerm 
    ? NamingApi.highlightSearchTerms(entry.name, searchTerm)
    : entry.name;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'conflicted':
        return <WarningOutlined style={{ color: '#ff4d4f' }} />;
      case 'deprecated':
        return <ExclamationCircleOutlined style={{ color: '#8c8c8c' }} />;
      case 'pending':
        return <ExclamationCircleOutlined style={{ color: '#fa8c16' }} />;
      default:
        return <CodeOutlined style={{ color: '#1890ff' }} />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return '#ff4d4f';
      case 'medium':
        return '#fa8c16';
      default:
        return '#52c41a';
    }
  };

  const actions = [
    <Tooltip title="View Details" key="view">
      <Button 
        type="text" 
        icon={<EyeOutlined />}
        onClick={() => onView?.(entry)}
      />
    </Tooltip>,
    <Tooltip title="Edit" key="edit">
      <Button 
        type="text" 
        icon={<EditOutlined />}
        onClick={() => onEdit?.(entry)}
      />
    </Tooltip>,
    <Tooltip title="Share" key="share">
      <Button 
        type="text" 
        icon={<ShareAltOutlined />}
        onClick={() => onShare?.(entry)}
      />
    </Tooltip>,
    <Tooltip title="Delete" key="delete">
      <Button 
        type="text" 
        danger
        icon={<DeleteOutlined />}
        onClick={() => onDelete?.(entry)}
      />
    </Tooltip>
  ];

  return (
    <Badge.Ribbon 
      text={`${priority.toUpperCase()} PRIORITY`} 
      color={getPriorityColor(priority)}
      style={{ display: priority === 'high' ? 'block' : 'none' }}
    >
      <Card
        size="small"
        hoverable
        className={`naming-card ${selected ? 'naming-card-selected' : ''}`}
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
        <div className="naming-card-header">
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            {/* Name and Status */}
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text strong style={{ fontSize: '16px' }}>
                <span dangerouslySetInnerHTML={{ __html: highlightedName }} />
              </Text>
              <Space>
                {getStatusIcon(entry.status)}
              </Space>
            </Space>

            {/* Type, Status, and Project */}
            <Space wrap>
              <Tag color={typeColor} style={{ margin: 0 }}>
                {typeDisplayName}
              </Tag>
              <Tag color={statusColor}>
                {statusDisplayName}
              </Tag>
              {entry.project_name && (
                <Tag icon={<FolderOutlined />} color="blue">
                  {entry.project_name}
                </Tag>
              )}
              {priority !== 'low' && (
                <Tag color={getPriorityColor(priority)}>
                  {priority.toUpperCase()} PRIORITY
                </Tag>
              )}
            </Space>

            {/* Compliance Score */}
            <div>
              <Text type="secondary" style={{ fontSize: '12px', fontWeight: 'bold' }}>
                COMPLIANCE SCORE:
              </Text>
              <div style={{ marginTop: '4px' }}>
                <Progress 
                  percent={entry.compliance_score} 
                  size="small"
                  strokeColor={complianceColor}
                  format={(percent) => (
                    <Text 
                      style={{ 
                        fontSize: '12px', 
                        fontWeight: 'bold',
                        color: complianceColor
                      }}
                    >
                      {percent}%
                    </Text>
                  )}
                />
              </div>
            </div>

            {/* Context Preview */}
            {entry.context && (
              <div>
                <Text type="secondary" style={{ fontSize: '12px', fontWeight: 'bold' }}>
                  CONTEXT:
                </Text>
                <Paragraph 
                  style={{ margin: '4px 0 0 0' }}
                  ellipsis={{ rows: 2, expandable: false }}
                >
                  {NamingApi.truncateContent(entry.context, 120)}
                </Paragraph>
              </div>
            )}

            {/* Usage Information */}
            <Space>
              <UsergroupAddOutlined style={{ color: '#1890ff' }} />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {NamingApi.getUsageDisplay(entry.usage_count)}
              </Text>
              {entry.usage_count > 10 && (
                <>
                  <span>•</span>
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    High Usage
                  </Text>
                </>
              )}
            </Space>

            {/* Compliance Status Indicators */}
            {entry.compliance_score < 70 && (
              <Space>
                <WarningOutlined style={{ color: '#fa8c16' }} />
                <Text type="warning" style={{ fontSize: '12px' }}>
                  Low compliance score
                </Text>
              </Space>
            )}
            
            {entry.status === 'conflicted' && (
              <Space>
                <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                <Text type="danger" style={{ fontSize: '12px' }}>
                  Name conflict detected
                </Text>
              </Space>
            )}

            {/* Metadata */}
            <Space style={{ fontSize: '12px', color: '#8c8c8c' }}>
              <CalendarOutlined />
              <Text type="secondary">
                {dayjs.utc(entry.created_at).local().fromNow()}
              </Text>
              {entry.created_by && (
                <>
                  <span>•</span>
                  <Text type="secondary">
                    by {entry.created_by}
                  </Text>
                </>
              )}
              {entry.updated_at !== entry.created_at && (
                <>
                  <span>•</span>
                  <Text type="secondary">
                    updated {dayjs.utc(entry.updated_at).local().fromNow()}
                  </Text>
                </>
              )}
            </Space>
          </Space>
        </div>
      </Card>
    </Badge.Ribbon>
  );
};

export default NamingCard;
