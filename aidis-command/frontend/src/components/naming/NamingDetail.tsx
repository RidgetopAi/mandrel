import React, { useState } from 'react';
import { Drawer, Typography, Space, Tag, Button, Card, Row, Col, Progress, Divider, message } from 'antd';
import { 
  EditOutlined, DeleteOutlined, CloseOutlined, CodeOutlined, 
  FolderOutlined, CalendarOutlined, UserOutlined, CheckCircleOutlined,
  WarningOutlined, UsergroupAddOutlined, InfoCircleOutlined 
} from '@ant-design/icons';
import { NamingEntry } from './types';
import { NamingApi } from '../../services/namingApi';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const { Title, Text, Paragraph } = Typography;

interface NamingDetailProps {
  visible: boolean;
  entry: NamingEntry | null;
  onClose: () => void;
  onUpdate?: (entry: NamingEntry) => void;
  onDelete?: (entry: NamingEntry) => void;
}

const NamingDetail: React.FC<NamingDetailProps> = ({
  visible,
  entry,
  onClose,
  onUpdate,
  onDelete
}) => {
  const [isEditing, setIsEditing] = useState(false);

  if (!entry) {
    return (
      <Drawer
        title="Naming Entry Details"
        open={visible}
        onClose={onClose}
        width={600}
      >
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <Text type="secondary">No naming entry selected</Text>
        </div>
      </Drawer>
    );
  }

  const typeColor = NamingApi.getTypeColor(entry.type);
  const typeDisplayName = NamingApi.getTypeDisplayName(entry.type);
  const statusColor = NamingApi.getStatusColor(entry.status);
  const statusDisplayName = NamingApi.getStatusDisplayName(entry.status);
  const complianceColor = NamingApi.getComplianceColor(entry.compliance_score);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleDelete = () => {
    onDelete?.(entry);
  };

  return (
    <Drawer
      title={
        <Space>
          <CodeOutlined />
          <span>Naming Entry Details</span>
        </Space>
      }
      open={visible}
      onClose={onClose}
      width={600}
      extra={
        <Space>
          <Button
            icon={<EditOutlined />}
            onClick={handleEdit}
            type="text"
            disabled={isEditing}
          >
            Edit
          </Button>
          <Button
            icon={<DeleteOutlined />}
            onClick={handleDelete}
            type="text"
            danger
          >
            Delete
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header Information */}
        <Card size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Title level={3} style={{ margin: 0 }}>
                {entry.name}
              </Title>
              <Space wrap style={{ marginTop: 8 }}>
                <Tag color={typeColor}>
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
              </Space>
            </div>
          </Space>
        </Card>

        {/* Compliance Information */}
        <Card title={<Space><CheckCircleOutlined />Compliance</Space>} size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Text strong>Compliance Score:</Text>
              <div style={{ marginTop: 8 }}>
                <Progress
                  percent={entry.compliance_score}
                  strokeColor={complianceColor}
                  format={(percent) => (
                    <Text style={{ color: complianceColor, fontWeight: 'bold' }}>
                      {percent}%
                    </Text>
                  )}
                />
              </div>
            </div>
            
            {entry.compliance_score < 70 && (
              <div style={{ marginTop: 16 }}>
                <Space>
                  <WarningOutlined style={{ color: '#fa8c16' }} />
                  <Text type="warning">
                    Low compliance score. Consider reviewing naming conventions.
                  </Text>
                </Space>
              </div>
            )}
          </Space>
        </Card>

        {/* Context Information */}
        {entry.context && (
          <Card title={<Space><InfoCircleOutlined />Context</Space>} size="small">
            <Paragraph>
              {entry.context}
            </Paragraph>
          </Card>
        )}

        {/* Usage Information */}
        <Card title={<Space><UsergroupAddOutlined />Usage</Space>} size="small">
          <Row gutter={16}>
            <Col span={12}>
              <div style={{ textAlign: 'center' }}>
                <Text type="secondary">Usage Count</Text>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1890ff' }}>
                  {entry.usage_count}
                </div>
              </div>
            </Col>
            <Col span={12}>
              <div style={{ textAlign: 'center' }}>
                <Text type="secondary">Status</Text>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: statusColor }}>
                  {statusDisplayName}
                </div>
              </div>
            </Col>
          </Row>
        </Card>

        {/* Metadata */}
        <Card title="Metadata" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Row gutter={16}>
              <Col span={12}>
                <Space>
                  <CalendarOutlined />
                  <div>
                    <Text type="secondary" style={{ display: 'block' }}>Created</Text>
                    <Text strong>{dayjs(entry.created_at).format('MMM DD, YYYY')}</Text>
                    <Text type="secondary" style={{ display: 'block', fontSize: '12px' }}>
                      {dayjs.utc(entry.created_at).local().fromNow()}
                    </Text>
                  </div>
                </Space>
              </Col>
              <Col span={12}>
                <Space>
                  <CalendarOutlined />
                  <div>
                    <Text type="secondary" style={{ display: 'block' }}>Updated</Text>
                    <Text strong>{dayjs(entry.updated_at).format('MMM DD, YYYY')}</Text>
                    <Text type="secondary" style={{ display: 'block', fontSize: '12px' }}>
                      {dayjs.utc(entry.updated_at).local().fromNow()}
                    </Text>
                  </div>
                </Space>
              </Col>
            </Row>

            {(entry.created_by || entry.updated_by) && (
              <>
                <Divider />
                <Row gutter={16}>
                  {entry.created_by && (
                    <Col span={12}>
                      <Space>
                        <UserOutlined />
                        <div>
                          <Text type="secondary" style={{ display: 'block' }}>Created By</Text>
                          <Text strong>{entry.created_by}</Text>
                        </div>
                      </Space>
                    </Col>
                  )}
                  {entry.updated_by && entry.updated_by !== entry.created_by && (
                    <Col span={12}>
                      <Space>
                        <UserOutlined />
                        <div>
                          <Text type="secondary" style={{ display: 'block' }}>Updated By</Text>
                          <Text strong>{entry.updated_by}</Text>
                        </div>
                      </Space>
                    </Col>
                  )}
                </Row>
              </>
            )}
          </Space>
        </Card>
      </Space>
    </Drawer>
  );
};

export default NamingDetail;
