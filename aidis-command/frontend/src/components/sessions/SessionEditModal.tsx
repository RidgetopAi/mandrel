import React, { useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Button,
  message,
  Typography,
  Space,
  Divider
} from 'antd';
import { EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import type { Session, UpdateSessionRequest } from '../../types/session';
import { useUpdateSession } from '../../hooks/useProjects';

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
}

const SessionEditModal: React.FC<SessionEditModalProps> = ({
  session,
  visible,
  onClose,
  onSuccess
}) => {
  const [form] = Form.useForm<SessionEditForm>();
  const updateSessionMutation = useUpdateSession();

  useEffect(() => {
    if (visible && session) {
      // Pre-populate form with current session data
      form.setFieldsValue({
        title: session.title || '',
        description: session.description || ''
      });
    } else {
      form.resetFields();
    }
  }, [visible, session, form]);

  const handleSubmit = async (values: SessionEditForm) => {
    if (!session) return;

    // Only send fields that have values or have changed
    const updates: UpdateSessionRequest = {};

    if (values.title && values.title.trim() !== (session.title || '')) {
      updates.title = values.title.trim();
    }

    if (values.description && values.description.trim() !== (session.description || '')) {
      updates.description = values.description.trim();
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
                maxLength={2000}
                showCount
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                💡 Tip: Adding a title and description helps organize your sessions and makes them easier to find later.
                If you provide only a description, a title will be auto-generated from the first 50 characters.
              </Text>
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  );
};

export default SessionEditModal;
