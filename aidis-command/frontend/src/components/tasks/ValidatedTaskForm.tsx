/**
 * TR003-6: Validated Task Form Component
 * Enhanced task form with real-time validation and contract enforcement
 */

import React, { useEffect } from 'react';
import { Form, Input, Select, Button, Modal, Alert, Space, Typography } from 'antd';
import { ExclamationCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useValidatedForm } from '../../hooks/useValidatedForm';
import { CreateTaskSchema, type CreateTaskData } from '../../validation/schemas';
import AidisApiErrorBoundary from '../error/AidisApiErrorBoundary';

const { TextArea } = Input;
const { Option } = Select;
const { Text } = Typography;

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

interface ValidatedTaskFormProps {
  visible: boolean;
  task?: Task;
  projectId: string;
  onSubmit: (data: CreateTaskData) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

const ValidatedTaskForm: React.FC<ValidatedTaskFormProps> = ({
  visible,
  task,
  projectId,
  onSubmit,
  onCancel,
  loading = false
}) => {
  const isEditing = !!task;

  // TR003-6: Use validated form hook with real-time validation
  const { form, formState, formActions, errorHandler } = useValidatedForm({
    schema: CreateTaskSchema,
    componentName: 'TaskForm',
    enableRealTimeValidation: true,
    debounceMs: 300,
    validateOnChange: true,
    validateOnBlur: true,
    enableServerValidation: true,
    onSubmitSuccess: async (data) => {
      try {
        await onSubmit(data);
        formActions.resetForm();
      } catch (error) {
        // Error will be handled by the error boundary
      }
    },
    onSubmitError: (error) => {
      console.error('Task form submission error:', error);
    },
    onValidationError: (errors) => {
      console.log('Validation errors:', errors);
    },
  });

  // Initialize form when modal opens
  useEffect(() => {
    if (visible) {
      if (task) {
        // Pre-fill form with existing task data
        const taskData: Partial<CreateTaskData> = {
          title: task.title,
          description: task.description || '',
          type: task.type as CreateTaskData['type'],
          priority: task.priority as CreateTaskData['priority'],
          assigned_to: task.assigned_to || '',
          project_id: projectId,
          tags: task.tags || [],
        };
        formActions.setFieldsValue(taskData);
      } else {
        // Reset form for new task with defaults
        formActions.resetForm();
        formActions.setFieldsValue({
          project_id: projectId,
          type: 'general',
          priority: 'medium',
          tags: [],
        });
      }
    }
  }, [visible, task, projectId, formActions]);

  const handleSubmit = async () => {
    const result = await formActions.submitForm();
    if (result) {
      // Form submission was successful, modal will be closed by parent
    }
  };

  const handleCancel = () => {
    formActions.resetForm();
    onCancel();
  };

  // Convert tags array to comma-separated string for display
  const tagsValue = formState.data.tags?.join(', ') || '';

  // Handle tags field change (convert comma-separated string to array)
  const handleTagsChange = (value: string) => {
    const tagsArray = value
      ? value.split(',').map(tag => tag.trim()).filter(Boolean)
      : [];
    formActions.setFieldValue('tags', tagsArray);
  };

  // Get validation status for a field
  const getFieldStatus = (fieldName: keyof CreateTaskData): 'error' | 'validating' | 'success' | '' => {
    if (formState.isValidating) return 'validating';
    if (formState.errors[fieldName] || formState.serverErrors[fieldName]) return 'error';
    if (formState.hasBeenModified && formState.data[fieldName]) return 'success';
    return '';
  };

  // Get field error message
  const getFieldError = (fieldName: keyof CreateTaskData): string => {
    return formState.errors[fieldName] || formState.serverErrors[fieldName] || '';
  };

  return (
    <AidisApiErrorBoundary
      componentName="ValidatedTaskForm"
      enableAutoRetry={false}
    >
      <Modal
        title={
          <Space>
            {isEditing ? 'Edit Task' : 'Create New Task'}
            {formState.hasBeenModified && (
              <Text type="secondary" style={{ fontSize: '12px' }}>
                (Modified)
              </Text>
            )}
          </Space>
        }
        open={visible}
        onCancel={handleCancel}
        footer={[
          <Button key="cancel" onClick={handleCancel} disabled={formState.isSubmitting}>
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={formState.isSubmitting || loading}
            onClick={handleSubmit}
            disabled={!formState.isValid && formState.hasBeenModified}
          >
            {isEditing ? 'Update' : 'Create'}
          </Button>
        ]}
        destroyOnClose
        width={600}
      >
        {/* Error Handler State Display */}
        {errorHandler.hasError && (
          <Alert
            type="error"
            message="Form Error"
            description={errorHandler.getErrorMessage()}
            style={{ marginBottom: 16 }}
            action={
              <Button size="small" onClick={errorHandler.clearError}>
                Dismiss
              </Button>
            }
            closable
          />
        )}

        {/* Server Validation Errors */}
        {Object.keys(formState.serverErrors).length > 0 && (
          <Alert
            type="warning"
            message="Server Validation Issues"
            description={
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {Object.entries(formState.serverErrors).map(([field, error]) => (
                  <li key={field}>{field}: {error}</li>
                ))}
              </ul>
            }
            style={{ marginBottom: 16 }}
            action={
              <Button size="small" onClick={formActions.clearServerErrors}>
                Dismiss
              </Button>
            }
            closable
          />
        )}

        <Form
          form={form[0]}
          layout="vertical"
          name="validatedTaskForm"
        >
          <Form.Item
            label="Task Title"
            validateStatus={getFieldStatus('title')}
            help={getFieldError('title')}
            hasFeedback
          >
            <Input
              placeholder="Enter task title"
              value={formState.data.title || ''}
              onChange={(e) => formActions.setFieldValue('title', e.target.value)}
              onBlur={() => formActions.validateField('title')}
            />
          </Form.Item>

          <Form.Item
            label="Description"
            validateStatus={getFieldStatus('description')}
            help={getFieldError('description')}
          >
            <TextArea
              placeholder="Enter task description (optional)"
              rows={4}
              value={formState.data.description || ''}
              onChange={(e) => formActions.setFieldValue('description', e.target.value)}
              onBlur={() => formActions.validateField('description')}
            />
          </Form.Item>

          <Form.Item
            label="Task Type"
            validateStatus={getFieldStatus('type')}
            help={getFieldError('type')}
            hasFeedback
          >
            <Select
              placeholder="Select task type"
              value={formState.data.type}
              onChange={(value) => formActions.setFieldValue('type', value)}
            >
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
            label="Priority"
            validateStatus={getFieldStatus('priority')}
            help={getFieldError('priority')}
            hasFeedback
          >
            <Select
              placeholder="Select priority"
              value={formState.data.priority}
              onChange={(value) => formActions.setFieldValue('priority', value)}
            >
              <Option value="low">Low</Option>
              <Option value="medium">Medium</Option>
              <Option value="high">High</Option>
              <Option value="urgent">Urgent</Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="Assigned To"
            validateStatus={getFieldStatus('assigned_to')}
            help={getFieldError('assigned_to')}
          >
            <Select
              placeholder="Select assignee (optional)"
              allowClear
              value={formState.data.assigned_to || undefined}
              onChange={(value) => formActions.setFieldValue('assigned_to', value || '')}
            >
              <Option value="unassigned">Unassigned</Option>
              <Option value="system">System</Option>
              <Option value="development">Development Team</Option>
              <Option value="testing">Testing Team</Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="Tags"
            help="Enter tags separated by commas (max 10 tags)"
            validateStatus={getFieldStatus('tags')}
            extra={getFieldError('tags')}
          >
            <Input
              placeholder="e.g. frontend, urgent, review-needed"
              value={tagsValue}
              onChange={(e) => handleTagsChange(e.target.value)}
              onBlur={() => formActions.validateField('tags')}
            />
          </Form.Item>
        </Form>

        {/* Validation Status Footer */}
        <div style={{
          borderTop: '1px solid #f0f0f0',
          paddingTop: 12,
          marginTop: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <Space>
            {formState.isValidating && (
              <Text type="secondary">
                <ExclamationCircleOutlined spin /> Validating...
              </Text>
            )}
            {formState.isValid && formState.hasBeenModified && !formState.isValidating && (
              <Text type="success">
                <CheckCircleOutlined /> Form is valid
              </Text>
            )}
            {!formState.isValid && formState.hasBeenModified && !formState.isValidating && (
              <Text type="danger">
                <ExclamationCircleOutlined /> Please fix validation errors
              </Text>
            )}
          </Space>

          <Text type="secondary" style={{ fontSize: '12px' }}>
            TR003-6: Real-time validation active
          </Text>
        </div>
      </Modal>
    </AidisApiErrorBoundary>
  );
};

export default ValidatedTaskForm;