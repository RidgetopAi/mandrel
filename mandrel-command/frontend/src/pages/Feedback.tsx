import React, { useState } from 'react';
import { Typography, Card, Form, Input, Select, Button, Space, message } from 'antd';
import { MessageOutlined } from '@ant-design/icons';
import { logger } from '../utils/logger';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface FeedbackFormValues {
  type: 'bug' | 'idea' | 'question';
  severity: 'low' | 'medium' | 'high';
  message: string;
}

const Feedback: React.FC = () => {
  const [form] = Form.useForm<FeedbackFormValues>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const apiBaseUrl = process.env.REACT_APP_API_URL || '/api';

  const handleSubmit = async (values: FeedbackFormValues) => {
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('aidis_token') || '';

      // Auto-capture the current page/URL path. The username is intentionally NOT
      // sent — the server derives it from the authenticated JWT.
      const payload = {
        type: values.type,
        severity: values.severity,
        message: values.message,
        page: window.location.pathname,
      };

      const response = await fetch(`${apiBaseUrl}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        message.success('Thanks — got it');
        form.resetFields();
        form.setFieldsValue({ type: 'bug', severity: 'medium' });
      } else {
        message.error(data.message || 'Failed to submit feedback');
      }
    } catch (error) {
      logger.error('Failed to submit feedback:', error);
      message.error('Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <Space align="center" style={{ marginBottom: 16 }}>
        <MessageOutlined style={{ fontSize: 24, color: '#1890ff' }} />
        <Title level={2} style={{ margin: 0 }}>Feedback</Title>
      </Space>

      <Text type="secondary">
        Found a bug, have an idea, or a question? Send it straight to the team.
      </Text>

      <Card style={{ marginTop: 16, maxWidth: 640 }}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ type: 'bug', severity: 'medium' }}
          onFinish={handleSubmit}
        >
          <Form.Item
            name="type"
            label="Type"
            rules={[{ required: true, message: 'Please select a type' }]}
          >
            <Select
              options={[
                { value: 'bug', label: 'Bug' },
                { value: 'idea', label: 'Idea' },
                { value: 'question', label: 'Question' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="severity"
            label="Severity"
            rules={[{ required: true, message: 'Please select a severity' }]}
          >
            <Select
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="message"
            label="Message"
            rules={[
              { required: true, message: 'Please enter a message' },
              { max: 5000, message: 'Message must be 5000 characters or fewer' },
            ]}
          >
            <TextArea
              rows={6}
              maxLength={5000}
              showCount
              placeholder="Describe the bug, idea, or question…"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={isSubmitting}>
              Submit Feedback
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default Feedback;
