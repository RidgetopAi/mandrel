import React, { useState } from 'react';
import { Table, Tag, Typography, Space, Button, Card } from 'antd';
import { EyeOutlined, FileTextOutlined, EditOutlined } from '@ant-design/icons';
import { Session } from '../../services/projectApi';
import SessionEditModal from '../sessions/SessionEditModal';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;

interface SessionListProps {
  sessions: Session[];
  loading?: boolean;
  onViewSession?: (session: Session) => void;
  onSessionUpdate?: (session: Session) => void;
  showProject?: boolean;
}

const SessionList: React.FC<SessionListProps> = ({
  sessions,
  loading = false,
  onViewSession,
  onSessionUpdate,
  showProject = false
}) => {
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatDuration = (startDate: string, endDate?: string) => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();
    const diff = end.getTime() - start.getTime();
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const columns: ColumnsType<Session> = [
    {
      title: 'Session ID',
      dataIndex: 'id',
      key: 'id',
      width: 120,
      render: (id: string) => (
        <Text code style={{ fontSize: '11px' }}>
          {id.slice(0, 8)}...
        </Text>
      )
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      width: 200,
      render: (title: string, record: Session) => (
        title ? (
          <Text strong style={{ fontSize: '13px' }}>
            {title}
          </Text>
        ) : (
          <Text type="secondary" style={{ fontStyle: 'italic', fontSize: '12px' }}>
            Session {new Date(record.created_at).toLocaleDateString()}
          </Text>
        )
      )
    },
    ...(showProject ? [{
      title: 'Project',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 150,
      render: (name: string) => (
        <Tag color="blue">{name || 'Unknown'}</Tag>
      )
    }] : []),
    {
      title: 'Contexts',
      dataIndex: 'context_count',
      key: 'context_count',
      width: 100,
      align: 'center' as const,
      render: (count: number) => (
        <Space>
          <FileTextOutlined />
          <Text strong>{count || 0}</Text>
        </Space>
      )
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (date: string) => formatDate(date)
    },
    {
      title: 'Duration',
      key: 'duration',
      width: 100,
      render: (_, record: Session) => (
        <Text type="secondary">
          {formatDuration(record.created_at, record.last_context_at)}
        </Text>
      )
    },
    {
      title: 'Last Activity',
      dataIndex: 'last_context_at',
      key: 'last_context_at',
      width: 160,
      render: (date: string) => date ? formatDate(date) : '-'
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 130,
      align: 'center' as const,
      render: (_, record: Session) => (
        <Space size="small">
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => onViewSession?.(record)}
            title="View session details"
            size="small"
          >
            View
          </Button>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => setEditingSession(record)}
            title="Edit session details"
            size="small"
          >
            Edit
          </Button>
        </Space>
      )
    }
  ];

  const handleSessionUpdate = (updatedSession: Session) => {
    onSessionUpdate?.(updatedSession);
    setEditingSession(null);
  };

  return (
    <>
      <Card>
        <Table
          columns={columns}
          dataSource={sessions}
          loading={loading}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} sessions`
          }}
          scroll={{ x: 900 }}
          size="small"
        />
      </Card>

      <SessionEditModal
        session={editingSession}
        visible={!!editingSession}
        onClose={() => setEditingSession(null)}
        onSuccess={handleSessionUpdate}
      />
    </>
  );
};

export default SessionList;
