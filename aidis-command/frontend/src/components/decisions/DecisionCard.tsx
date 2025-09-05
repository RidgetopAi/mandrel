import React from 'react';
import { Card, Tag, Typography, Space, Tooltip, Checkbox, Button, Badge } from 'antd';
import { 
  EyeOutlined, EditOutlined, DeleteOutlined, ShareAltOutlined,
  CalendarOutlined, FolderOutlined, BulbOutlined, CheckCircleOutlined,
  CloseCircleOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import { TechnicalDecision } from './types';
import { DecisionApi } from '../../services/decisionApi';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);

const { Text, Paragraph } = Typography;

interface DecisionCardProps {
  decision: TechnicalDecision;
  selected?: boolean;
  showCheckbox?: boolean;
  searchTerm?: string;
  onSelect?: (id: number, selected: boolean) => void;
  onView?: (decision: TechnicalDecision) => void;
  onEdit?: (decision: TechnicalDecision) => void;
  onDelete?: (decision: TechnicalDecision) => void;
  onShare?: (decision: TechnicalDecision) => void;
}

const DecisionCard: React.FC<DecisionCardProps> = ({
  decision,
  selected = false,
  showCheckbox = false,
  searchTerm,
  onSelect,
  onView,
  onEdit,
  onDelete,
  onShare
}) => {
  const statusColor = DecisionApi.getStatusColor(decision.status);
  const statusDisplayName = DecisionApi.getStatusDisplayName(decision.status);
  const priority = DecisionApi.getDecisionPriority(decision);
  
  const handleCheckboxChange = (e: any) => {
    onSelect?.(decision.id, e.target.checked);
  };

  const truncatedProblem = DecisionApi.truncateContent(decision.problem, 120);
  const highlightedProblem = searchTerm 
    ? DecisionApi.highlightSearchTerms(truncatedProblem, searchTerm)
    : truncatedProblem;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'superseded':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      case 'deprecated':
        return <ExclamationCircleOutlined style={{ color: '#fa8c16' }} />;
      case 'under_review':
        return <ExclamationCircleOutlined style={{ color: '#1890ff' }} />;
      default:
        return <BulbOutlined style={{ color: '#fa8c16' }} />;
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
        onClick={() => onView?.(decision)}
      />
    </Tooltip>,
    <Tooltip title="Edit" key="edit">
      <Button 
        type="text" 
        icon={<EditOutlined />}
        onClick={() => onEdit?.(decision)}
      />
    </Tooltip>,
    <Tooltip title="Share" key="share">
      <Button 
        type="text" 
        icon={<ShareAltOutlined />}
        onClick={() => onShare?.(decision)}
      />
    </Tooltip>,
    <Tooltip title="Delete" key="delete">
      <Button 
        type="text" 
        danger
        icon={<DeleteOutlined />}
        onClick={() => onDelete?.(decision)}
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
        className={`decision-card ${selected ? 'decision-card-selected' : ''}`}
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
        <div className="decision-card-header">
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            {/* Title and Status */}
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text strong style={{ fontSize: '16px' }}>
                {decision.title}
              </Text>
              <Space>
                {getStatusIcon(decision.status)}
              </Space>
            </Space>

            {/* Status and Project */}
            <Space wrap>
              <Tag color={statusColor} style={{ margin: 0 }}>
                {statusDisplayName}
              </Tag>
              {decision.project_name && (
                <Tag icon={<FolderOutlined />} color="blue">
                  {decision.project_name}
                </Tag>
              )}
              {priority !== 'low' && (
                <Tag color={getPriorityColor(priority)}>
                  {priority.toUpperCase()} PRIORITY
                </Tag>
              )}
            </Space>

            {/* Problem Preview */}
            <div>
              <Text type="secondary" style={{ fontSize: '12px', fontWeight: 'bold' }}>
                PROBLEM:
              </Text>
              <Paragraph 
                style={{ margin: '4px 0 0 0' }}
                ellipsis={{ rows: 2, expandable: false }}
              >
                <span 
                  dangerouslySetInnerHTML={{ __html: highlightedProblem }}
                />
              </Paragraph>
            </div>

            {/* Decision Preview */}
            {decision.decision && (
              <div>
                <Text type="secondary" style={{ fontSize: '12px', fontWeight: 'bold' }}>
                  DECISION:
                </Text>
                <Paragraph 
                  style={{ margin: '4px 0 0 0' }}
                  ellipsis={{ rows: 2, expandable: false }}
                >
                  {DecisionApi.truncateContent(decision.decision, 100)}
                </Paragraph>
              </div>
            )}

            {/* Alternatives Indicator */}
            {decision.alternatives && decision.alternatives.length > 0 && (
              <Space>
                <BulbOutlined style={{ color: '#fa8c16' }} />
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  {decision.alternatives.length} alternative{decision.alternatives.length !== 1 ? 's' : ''} considered
                </Text>
              </Space>
            )}

            {/* Outcome Status */}
            {decision.status === 'active' && (
              <Space>
                {decision.outcome ? (
                  <>
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      Outcome documented
                    </Text>
                  </>
                ) : (
                  <>
                    <ExclamationCircleOutlined style={{ color: '#fa8c16' }} />
                    <Text type="warning" style={{ fontSize: '12px' }}>
                      Outcome pending
                    </Text>
                  </>
                )}
              </Space>
            )}

            {/* Metadata */}
            <Space style={{ fontSize: '12px', color: '#8c8c8c' }}>
              <CalendarOutlined />
              <Text type="secondary">
                {dayjs.utc(decision.created_at).local().fromNow()}
              </Text>
              {decision.created_by && (
                <>
                  <span>•</span>
                  <Text type="secondary">
                    by {decision.created_by}
                  </Text>
                </>
              )}
              {decision.updated_at !== decision.created_at && (
                <>
                  <span>•</span>
                  <Text type="secondary">
                    updated {dayjs.utc(decision.updated_at).local().fromNow()}
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

export default DecisionCard;
