/**
 * Bug Report Form Component
 *
 * Ant Design form for creating bug reports.
 */

import React from 'react';
import { Form, Input, Select, Button, Space, Typography } from 'antd';
import { BugOutlined, SendOutlined, BranchesOutlined } from '@ant-design/icons';
import type { BugReport, Severity } from '../../types/workflow';

const { TextArea } = Input;
const { Text } = Typography;

interface BugReportFormProps {
  onSubmit: (report: BugReport, projectPath: string, branchName?: string) => void;
  isSubmitting?: boolean;
  initialValues?: Partial<BugReport & { projectPath: string; branchName?: string }>;
}

const severityOptions: { value: Severity; label: string; description: string }[] = [
  { value: 'blocker', label: 'Blocker', description: 'Prevents any further work' },
  { value: 'major', label: 'Major', description: 'Significantly impacts functionality' },
  { value: 'minor', label: 'Minor', description: 'Small issue, workaround exists' },
];

const BugReportForm: React.FC<BugReportFormProps> = ({
  onSubmit,
  isSubmitting = false,
  initialValues,
}) => {
  const [form] = Form.useForm();

  const handleFinish = (values: BugReport & { projectPath: string; branchName?: string }) => {
    const { projectPath, branchName, ...bugReport } = values;
    onSubmit(bugReport, projectPath, branchName);
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleFinish}
      initialValues={{
        severity: 'major',
        ...initialValues,
      }}
      disabled={isSubmitting}
    >
      <Form.Item
        name="projectPath"
        label="Project Path"
        rules={[{ required: true, message: 'Please enter the project path' }]}
        tooltip="Absolute path to the project directory"
      >
        <Input
          placeholder="/home/user/projects/my-app"
          prefix={<Text type="secondary">~</Text>}
        />
      </Form.Item>

      <Form.Item
        name="branchName"
        label="Branch Name"
        tooltip="Git branch for the fix (optional). If provided, changes will be committed to this branch."
      >
        <Input
          placeholder="fix/bug-description"
          prefix={<Text type="secondary">git:</Text>}
        />
      </Form.Item>

      <Form.Item
        name="title"
        label="Bug Title"
        rules={[
          { required: true, message: 'Please enter a title' },
          { max: 200, message: 'Title must be 200 characters or less' },
        ]}
      >
        <Input
          placeholder="Brief description of the bug"
          prefix={<BugOutlined />}
          showCount
          maxLength={200}
        />
      </Form.Item>

      <Form.Item
        name="description"
        label="Description"
        rules={[{ required: true, message: 'Please describe the bug' }]}
        tooltip="Detailed explanation of what's happening"
      >
        <TextArea
          rows={4}
          placeholder="What's going wrong? Include any error messages, unexpected behavior, or symptoms you've observed."
          showCount
        />
      </Form.Item>

      <Form.Item
        name="severity"
        label="Severity"
        rules={[{ required: true }]}
      >
        <Select placeholder="Select severity level">
          {severityOptions.map((opt) => (
            <Select.Option key={opt.value} value={opt.value}>
              <Space direction="vertical" size={0}>
                <Text strong>{opt.label}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {opt.description}
                </Text>
              </Space>
            </Select.Option>
          ))}
        </Select>
      </Form.Item>

      <Form.Item
        name="stepsToReproduce"
        label="Steps to Reproduce"
        tooltip="How can we trigger this bug?"
      >
        <TextArea
          rows={3}
          placeholder={`1. Navigate to...
2. Click on...
3. Enter...
4. Bug appears when...`}
        />
      </Form.Item>

      <Form.Item
        name="expectedBehavior"
        label="Expected Behavior"
        tooltip="What should happen instead?"
      >
        <TextArea
          rows={2}
          placeholder="What did you expect to happen?"
        />
      </Form.Item>

      <Form.Item
        name="actualBehavior"
        label="Actual Behavior"
        tooltip="What actually happens?"
      >
        <TextArea
          rows={2}
          placeholder="What actually happens when you follow the steps?"
        />
      </Form.Item>

      <Form.Item style={{ marginBottom: 0 }}>
        <Button
          type="primary"
          htmlType="submit"
          icon={<SendOutlined />}
          loading={isSubmitting}
          size="large"
          block
        >
          {isSubmitting ? 'Submitting...' : 'Submit Bug Report'}
        </Button>
      </Form.Item>
    </Form>
  );
};

export default BugReportForm;
