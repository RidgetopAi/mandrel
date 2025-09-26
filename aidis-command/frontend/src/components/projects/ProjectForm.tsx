import React, { useEffect } from 'react';
import { Form, Input, Select, Button, Modal } from 'antd';
import { ProjectEntity, CreateProjectRequest, UpdateProjectRequest } from '../../api/generated';

const { TextArea } = Input;
const { Option } = Select;

interface ProjectFormProps {
  visible: boolean;
  project?: ProjectEntity;
  onSubmit: (data: CreateProjectRequest | UpdateProjectRequest) => void;
  onCancel: () => void;
  loading?: boolean;
}

const ProjectForm: React.FC<ProjectFormProps> = ({
  visible,
  project,
  onSubmit,
  onCancel,
  loading = false
}) => {
  const [form] = Form.useForm();
  const isEditing = !!project;

  useEffect(() => {
    if (visible) {
      if (project) {
        // Pre-fill form with existing project data
        form.setFieldsValue({
          name: project.name,
          description: project.description,
          status: project.status,
          git_repo_url: project.git_repo_url,
          root_directory: project.root_directory
        });
      } else {
        // Reset form for new project
        form.resetFields();
      }
    }
  }, [visible, project, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      onSubmit(values);
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
      title={isEditing ? 'Edit Project' : 'Create New Project'}
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
        requiredMark={false}
      >
        <Form.Item
          name="name"
          label="Project Name"
          rules={[
            { required: true, message: 'Project name is required' },
            { min: 2, message: 'Project name must be at least 2 characters' },
            { max: 100, message: 'Project name must be less than 100 characters' }
          ]}
        >
          <Input placeholder="Enter project name" />
        </Form.Item>

        <Form.Item
          name="description"
          label="Description"
          rules={[
            { max: 500, message: 'Description must be less than 500 characters' }
          ]}
        >
          <TextArea
            rows={3}
            placeholder="Enter project description (optional)"
          />
        </Form.Item>

        {isEditing && (
          <Form.Item
            name="status"
            label="Status"
            rules={[{ required: true, message: 'Status is required' }]}
          >
            <Select placeholder="Select project status">
              <Option value="active">Active</Option>
              <Option value="inactive">Inactive</Option>
              <Option value="archived">Archived</Option>
            </Select>
          </Form.Item>
        )}

        <Form.Item
          name="git_repo_url"
          label="Git Repository URL"
          rules={[
            { type: 'url', message: 'Please enter a valid URL' }
          ]}
        >
          <Input placeholder="https://github.com/username/repo.git (optional)" />
        </Form.Item>

        <Form.Item
          name="root_directory"
          label="Root Directory"
          rules={[
            { max: 255, message: 'Root directory path must be less than 255 characters' }
          ]}
        >
          <Input placeholder="/path/to/project/root (optional)" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ProjectForm;
