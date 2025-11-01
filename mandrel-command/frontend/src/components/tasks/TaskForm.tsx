import React, { useEffect } from 'react';
import { Form, Input, Select, Button, Modal } from 'antd';

const { TextArea } = Input;
const { Option } = Select;

interface Task {
  id: string;
  project_id: string;
  title: string;
  description?: string;
  type: string;
  status: string;
  priority: string;
  assigned_to?: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface CreateTaskRequest {
  title: string;
  description?: string;
  type?: string;
  priority: string;
  assigned_to?: string;
  project_id: string;
  tags?: string[];
}

interface TaskFormProps {
  visible: boolean;
  task?: Task;
  projectId: string;
  onSubmit: (data: CreateTaskRequest) => void;
  onCancel: () => void;
  loading?: boolean;
}

const TaskForm: React.FC<TaskFormProps> = ({
  visible,
  task,
  projectId,
  onSubmit,
  onCancel,
  loading = false
}) => {
  const [form] = Form.useForm();
  const isEditing = !!task;

  useEffect(() => {
    if (visible) {
      if (task) {
        // Pre-fill form with existing task data
        form.setFieldsValue({
          title: task.title,
          description: task.description,
          type: task.type,
          priority: task.priority,
          assigned_to: task.assigned_to,
          tags: task.tags?.join(', ') || ''
        });
      } else {
        // Reset form for new task
        form.resetFields();
        form.setFieldsValue({
          type: 'general',
          priority: 'medium'
        });
      }
    }
  }, [visible, task, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      // Process tags from comma-separated string to array
      const tags = values.tags ? 
        values.tags.split(',').map((tag: string) => tag.trim()).filter(Boolean) : 
        [];

      const taskData: CreateTaskRequest = {
        ...values,
        project_id: projectId,
        tags
      };
      
      onSubmit(taskData);
    } catch (error) {
      console.error('Form validation error:', error);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  return (
    <Modal
      title={isEditing ? 'Edit Task' : 'Create New Task'}
      open={visible}
      onCancel={handleCancel}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          Cancel
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={loading}
          onClick={handleSubmit}
        >
          {isEditing ? 'Update' : 'Create'}
        </Button>
      ]}
      destroyOnClose
      width={600}
    >
      <Form
        form={form}
        layout="vertical"
        name="taskForm"
      >
        <Form.Item
          name="title"
          label="Task Title"
          rules={[
            { required: true, message: 'Please enter task title' },
            { max: 500, message: 'Title must be less than 500 characters' }
          ]}
        >
          <Input placeholder="Enter task title" />
        </Form.Item>

        <Form.Item
          name="description"
          label="Description"
        >
          <TextArea
            placeholder="Enter task description"
            rows={4}
          />
        </Form.Item>

        <Form.Item
          name="type"
          label="Task Type"
          rules={[{ required: true, message: 'Please select task type' }]}
        >
          <Select placeholder="Select task type">
            <Option value="general">General</Option>
            <Option value="feature">Feature</Option>
            <Option value="bug">Bug Fix</Option>
            <Option value="refactor">Refactor</Option>
            <Option value="test">Testing</Option>
            <Option value="docs">Documentation</Option>
            <Option value="devops">DevOps</Option>
          </Select>
        </Form.Item>

        <Form.Item
          name="priority"
          label="Priority"
          rules={[{ required: true, message: 'Please select priority' }]}
        >
          <Select placeholder="Select priority">
            <Option value="low">Low</Option>
            <Option value="medium">Medium</Option>
            <Option value="high">High</Option>
            <Option value="urgent">Urgent</Option>
          </Select>
        </Form.Item>

        <Form.Item
          name="assigned_to"
          label="Assigned To"
        >
          <Select placeholder="Select assignee" allowClear>
            <Option value="unassigned">Unassigned</Option>
            <Option value="system">System</Option>
            <Option value="development">Development Team</Option>
            <Option value="testing">Testing Team</Option>
          </Select>
        </Form.Item>

        <Form.Item
          name="tags"
          label="Tags"
          help="Enter tags separated by commas"
        >
          <Input placeholder="e.g. frontend, urgent, review-needed" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default TaskForm;
