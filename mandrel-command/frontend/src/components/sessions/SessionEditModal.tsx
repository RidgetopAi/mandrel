import React, { useEffect, useState } from 'react';
import {
  Modal,
  Form,
  Input,
  Button,
  message,
  Typography,
  Space,
  Divider,
  Select,
  Tag,
  Alert,
  Spin,
  Radio
} from 'antd';
import { EditOutlined, SaveOutlined, CloseOutlined, SyncOutlined, FolderOutlined } from '@ant-design/icons';
import type { Session, UpdateSessionRequest } from '../../types/session';
import { useUpdateSession, useProjects } from '../../hooks/useProjects';
import { sessionsClient } from '../../api/sessionsClient';

const { Text, Title } = Typography;
const { TextArea } = Input;

interface SessionEditModalProps {
  session: Session | null;
  visible: boolean;
  onClose: () => void;
  onSuccess: (updatedSession: Session) => void;
}

interface SessionEditForm {
  title: string;
  description: string;
  session_goal: string;
  tags: string[];
  ai_model: string;
  project_id: string;
  session_type: 'mcp-server' | 'AI Model';
}

const SessionEditModal: React.FC<SessionEditModalProps> = ({
  session,
  visible,
  onClose,
  onSuccess
}) => {
  const [form] = Form.useForm<SessionEditForm>();
  const updateSessionMutation = useUpdateSession();
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const { data: projectsData } = useProjects();

  useEffect(() => {
    if (visible && session) {
      // Pre-populate form with current session data
      form.setFieldsValue({
        title: session.title || '',
        description: session.description || '',
        session_goal: session.session_goal || '',
        tags: session.tags || [],
        ai_model: session.ai_model || '',
        project_id: session.project_id || '',
        session_type: (session.session_type === 'mcp-server' || session.session_type === 'AI Model')
          ? session.session_type
          : 'AI Model'
      });
    } else {
      form.resetFields();
      setSyncResult(null);
    }
  }, [visible, session, form]);

  const handleSubmit = async (values: SessionEditForm) => {
    if (!session) return;

    // Build updates object with all fields that have changed
    const updates: UpdateSessionRequest = {};

    if (values.title && values.title.trim() !== (session.title || '')) {
      updates.title = values.title.trim();
    }

    if (values.description && values.description.trim() !== (session.description || '')) {
      updates.description = values.description.trim();
    }

    if (values.session_goal && values.session_goal.trim() !== (session.session_goal || '')) {
      updates.session_goal = values.session_goal.trim();
    }

    if (values.tags && JSON.stringify(values.tags) !== JSON.stringify(session.tags || [])) {
      updates.tags = values.tags;
    }

    if (values.ai_model && values.ai_model.trim() !== (session.ai_model || '')) {
      updates.ai_model = values.ai_model.trim();
    }

    if (values.project_id && values.project_id !== (session.project_id || '')) {
      updates.project_id = values.project_id;
    }

    if (values.session_type && values.session_type !== (session.session_type || 'AI Model')) {
      updates.session_type = values.session_type;
    }

    // If no changes, just close
    if (Object.keys(updates).length === 0) {
      message.info('No changes to save');
      onClose();
      return;
    }

    updateSessionMutation.mutate(
      { sessionId: session.id, updates },
      {
        onSuccess: (updatedSession) => {
          message.success('Session updated successfully');
          onSuccess(updatedSession);
          onClose();
        },
        onError: (error: any) => {
          console.error('Failed to update session:', error);
          message.error(error.message || 'Failed to update session');
        }
      }
    );
  };

  const handleFilesSync = async () => {
    if (!session?.id) return;

    setSyncLoading(true);
    setSyncResult(null);

    try {
      const result = await sessionsClient.syncFilesFromGit(session.id);

      if (result.success && result.data) {
        const msg = `✅ Synced ${result.data.filesProcessed} files: +${result.data.totalLinesAdded}/-${result.data.totalLinesDeleted} lines (${result.data.netChange > 0 ? '+' : ''}${result.data.netChange} net)`;
        setSyncResult(msg);
        message.success('Files synced successfully!');
        // Trigger a refetch by calling onSuccess with current session
        // This will refresh the parent list
        onSuccess(session);
      } else {
        message.error(result.error || 'Failed to sync files');
        setSyncResult(`❌ ${result.error || 'Failed to sync files'}`);
      }
    } catch (error) {
      console.error('File sync error:', error);
      message.error('Failed to sync files from git');
      setSyncResult(`❌ ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSyncLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      title={
        <Space>
          <EditOutlined />
          <Title level={4} style={{ margin: 0 }}>
            Edit Session Details
          </Title>
        </Space>
      }
      open={visible}
      onCancel={handleCancel}
      width={600}
      footer={[
        <Button key="cancel" onClick={handleCancel} icon={<CloseOutlined />}>
          Cancel
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={updateSessionMutation.isPending}
          onClick={() => form.submit()}
          icon={<SaveOutlined />}
        >
          Save Changes
        </Button>
      ]}
    >
      {session && (
        <>
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">
              Session ID: <Text code>{session.id.slice(0, 8)}...</Text>
            </Text>
            <br />
            <Text type="secondary">
              Created: {new Date(session.created_at).toLocaleString()}
            </Text>
            {session.project_name && (
              <>
                <br />
                <Text type="secondary">
                  Project: <Text strong>{session.project_name}</Text>
                </Text>
              </>
            )}
          </div>

          <Divider />

          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            autoComplete="off"
          >
            <Form.Item
              label="Session Type"
              name="session_type"
              help="Whether this session uses AI assistance or is solo work"
            >
              <Radio.Group>
                <Radio.Button value="AI Model">AI-Assisted Work</Radio.Button>
                <Radio.Button value="mcp-server">Solo Work</Radio.Button>
              </Radio.Group>
            </Form.Item>

            <Form.Item
              label="Session Title"
              name="title"
              rules={[
                { max: 255, message: 'Title must be less than 255 characters' }
              ]}
              help="A short, descriptive title for this session (e.g., 'Implement user authentication')"
            >
              <Input
                placeholder="Enter session title..."
                maxLength={255}
                showCount
              />
            </Form.Item>

            <Form.Item
              label="Session Description"
              name="description"
              help="Detailed description of session goals, context, and objectives"
            >
              <TextArea
                placeholder="Enter session description..."
                rows={4}
                maxLength={5000}
                showCount
              />
            </Form.Item>

            <Form.Item
              label="Session Goal"
              name="session_goal"
              help="What you're trying to accomplish in this session"
            >
              <TextArea
                placeholder="Enter session goal..."
                rows={3}
                maxLength={5000}
                showCount
              />
            </Form.Item>

            <Form.Item
              label="AI Model"
              name="ai_model"
              help="The AI model being used (leave blank if Solo Work)"
            >
              <Select
                placeholder="Select AI model"
                allowClear
                options={[
                  { label: 'Claude Sonnet 4.5', value: 'claude-sonnet-4-5' },
                  { label: 'Claude Sonnet 4', value: 'claude-sonnet-4' },
                  { label: 'Claude Opus 4', value: 'claude-opus-4' },
                  { label: 'Claude Code', value: 'claude-code' },
                  { label: 'Amp Free', value: 'amp-free' },
                  { label: 'Amp Smart', value: 'amp-smart' },
                  { label: 'Other', value: 'other' }
                ]}
              />
            </Form.Item>

            <Form.Item
              label="Tags"
              name="tags"
              help="Tags to categorize this session (press Enter to add)"
            >
              <Select
                mode="tags"
                placeholder="Add tags..."
                style={{ width: '100%' }}
                tokenSeparators={[',']}
              />
            </Form.Item>

            <Form.Item
              label="Project"
              name="project_id"
              help="Assign this session to a project"
            >
              <Select
                placeholder="Select project..."
                allowClear
                showSearch
                optionFilterProp="children"
              >
                {projectsData?.projects.map((project) => (
                  <Select.Option key={project.id} value={project.id}>
                    <Space>
                      <FolderOutlined />
                      {project.name}
                    </Space>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Divider />

            {/* File Sync Section */}
            <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
              <Text strong>File Synchronization</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Sync file changes from git to see what was modified during this session
              </Text>
              <Button
                icon={<SyncOutlined spin={syncLoading} />}
                onClick={handleFilesSync}
                loading={syncLoading}
                type="dashed"
                block
              >
                {syncLoading ? 'Syncing files from git...' : 'Sync Files from Git'}
              </Button>
              {syncResult && (
                <Alert
                  message={syncResult}
                  type={syncResult.startsWith('✅') ? 'success' : 'error'}
                  showIcon
                  closable
                  onClose={() => setSyncResult(null)}
                />
              )}
            </Space>

            <Form.Item style={{ marginBottom: 0 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                💡 Tip: All session fields are now editable. Changes will be saved when you click "Save Changes".
              </Text>
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  );
};

export default SessionEditModal;