import React, { useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Button,
  message,
  Typography,
  Space,
  Select,
  Tag,
  Radio,
} from 'antd';
import { PlayCircleOutlined, CloseOutlined } from '@ant-design/icons';
import { sessionsClient } from '../../api/sessionsClient';
import { useProjects } from '../../hooks/useProjects';

const { Text } = Typography;
const { TextArea } = Input;

interface StartSessionModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface StartSessionForm {
  title: string;
  description?: string;
  session_goal?: string;
  tags?: string[];
  ai_model?: string;
  project_id?: string;
  session_type: 'mcp-server' | 'AI Model';
}

const StartSessionModal: React.FC<StartSessionModalProps> = ({
  visible,
  onClose,
  onSuccess
}) => {
  const [form] = Form.useForm<StartSessionForm>();
  const [loading, setLoading] = React.useState(false);
  const { data: projectsData } = useProjects();

  useEffect(() => {
    if (!visible) {
      form.resetFields();
    }
  }, [visible, form]);

  const handleSubmit = async (values: StartSessionForm) => {
    try {
      setLoading(true);

      // Call the start session API
      const newSession = await sessionsClient.startSession({
        projectId: values.project_id,
        title: values.title?.trim() || 'Untitled Session',
        description: values.description?.trim(),
        sessionGoal: values.session_goal?.trim(),
        tags: values.tags || [],
        aiModel: values.session_type === 'AI Model' ? values.ai_model?.trim() : undefined,
        sessionType: values.session_type,
      });

      message.success('Session started successfully!');
      console.log('New session created:', newSession);

      form.resetFields();
      onSuccess();
    } catch (error) {
      console.error('Failed to start session:', error);
      message.error(`Failed to start session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <PlayCircleOutlined style={{ color: '#52c41a' }} />
          <Text strong>Start New Session</Text>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={600}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          session_type: 'AI Model',
          ai_model: 'claude-sonnet-4-5',
          tags: []
        }}
      >
        <Form.Item
          label="Session Type"
          name="session_type"
          rules={[{ required: true, message: 'Please select a session type' }]}
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
            { required: true, message: 'Please enter a session title' },
            { max: 255, message: 'Title cannot exceed 255 characters' }
          ]}
        >
          <Input
            placeholder="e.g., Feature Development - User Authentication"
            maxLength={255}
          />
        </Form.Item>

        <Form.Item
          label="Description"
          name="description"
        >
          <TextArea
            placeholder="Brief description of what you'll be working on..."
            rows={3}
            maxLength={1000}
          />
        </Form.Item>

        <Form.Item
          label="Session Goal"
          name="session_goal"
          tooltip="What do you aim to accomplish in this session?"
        >
          <Input
            placeholder="e.g., Implement OAuth integration and add tests"
            maxLength={500}
          />
        </Form.Item>

        <Form.Item
          label="Project"
          name="project_id"
          tooltip="Leave empty to use current project"
        >
          <Select
            placeholder="Select a project (optional)"
            allowClear
            showSearch
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
            options={projectsData?.projects?.map(p => ({
              label: p.name,
              value: p.id
            })) || []}
          />
        </Form.Item>

        <Form.Item
          label="Tags"
          name="tags"
          tooltip="Add tags to categorize this session"
        >
          <Select
            mode="tags"
            placeholder="Add tags (press Enter to add)"
            tokenSeparators={[',']}
            maxTagCount={10}
          />
        </Form.Item>

        <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.session_type !== currentValues.session_type}>
          {({ getFieldValue }) => {
            const sessionType = getFieldValue('session_type');
            return sessionType === 'AI Model' ? (
              <Form.Item
                label="AI Model"
                name="ai_model"
              >
                <Select
                  placeholder="Select AI model"
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
            ) : null;
          }}
        </Form.Item>

        <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button
              icon={<CloseOutlined />}
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              icon={<PlayCircleOutlined />}
              loading={loading}
            >
              Start Session
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default StartSessionModal;
