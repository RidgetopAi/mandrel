/**
 * TR003-6: Form Validation Contract System Demo
 * Interactive demonstration of the enhanced form validation system
 */

import React, { useState } from 'react';
import {
  Card,
  Button,
  Space,
  Typography,
  Alert,
  Tabs,
  Table,
  Badge,
  Tag,
  Row,
  Col,
  Statistic,
  Progress
} from 'antd';
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  BugOutlined,
  FormOutlined,
  ApiOutlined,
  SettingOutlined
} from '@ant-design/icons';
import ValidatedTaskForm from '../tasks/ValidatedTaskForm';
import ValidatedProjectForm from '../projects/ValidatedProjectForm';
import { CreateTaskData, CreateProjectData } from '../../validation/schemas';
import { useValidatedForm } from '../../hooks/useValidatedForm';
import { z } from 'zod';

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;

// Demo schema for testing validation features
const DemoSchema = z.object({
  testField: z.string().min(3, 'Must be at least 3 characters').max(20, 'Must be less than 20 characters'),
  email: z.string().email('Invalid email format'),
  number: z.number().min(1, 'Must be positive').max(100, 'Must be less than 100'),
});

type DemoData = z.infer<typeof DemoSchema>;

const FormValidationDemo: React.FC = () => {
  const [taskFormVisible, setTaskFormVisible] = useState(false);
  const [projectFormVisible, setProjectFormVisible] = useState(false);
  const [validationStats, setValidationStats] = useState({
    totalValidations: 0,
    successfulValidations: 0,
    failedValidations: 0,
    serverValidations: 0,
  });

  // Demo form for testing validation features
  const { formState, formActions, errorHandler } = useValidatedForm<DemoData>({
    schema: DemoSchema,
    componentName: 'ValidationDemo',
    enableRealTimeValidation: true,
    debounceMs: 300,
    validateOnChange: true,
    validateOnBlur: true,
    enableServerValidation: false,
    onSubmitSuccess: (data) => {
      setValidationStats(prev => ({
        ...prev,
        successfulValidations: prev.successfulValidations + 1,
        totalValidations: prev.totalValidations + 1,
      }));
      console.log('Demo form submitted:', data);
    },
    onSubmitError: (error) => {
      setValidationStats(prev => ({
        ...prev,
        failedValidations: prev.failedValidations + 1,
        totalValidations: prev.totalValidations + 1,
      }));
      console.error('Demo form error:', error);
    },
    onValidationError: (errors) => {
      setValidationStats(prev => ({
        ...prev,
        failedValidations: prev.failedValidations + 1,
      }));
      console.log('Validation errors:', errors);
    },
  });

  const handleTaskSubmit = async (data: CreateTaskData) => {
    console.log('Task form submitted:', data);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
    setTaskFormVisible(false);
  };

  const handleProjectSubmit = async (data: CreateProjectData) => {
    console.log('Project form submitted:', data);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
    setProjectFormVisible(false);
  };

  const triggerTestError = () => {
    const testError = new Error('Demo validation error for testing');
    errorHandler.handleError(testError);
  };

  const validationFeatures = [
    {
      key: '1',
      feature: 'Real-time Validation',
      status: 'Active',
      description: 'Validates fields as user types with 300ms debounce',
      implementation: 'useValidatedForm hook with debounced validation'
    },
    {
      key: '2',
      feature: 'Shared Schema Contracts',
      status: 'Active',
      description: 'Zod schemas shared between frontend and backend',
      implementation: 'schemas.ts with comprehensive validation rules'
    },
    {
      key: '3',
      feature: 'Error Boundary Integration',
      status: 'Active',
      description: 'Form errors handled by TR002-6 error boundaries',
      implementation: 'AidisApiErrorBoundary wrapping all forms'
    },
    {
      key: '4',
      feature: 'AIDIS Error Reporting',
      status: 'Active',
      description: 'Form validation errors reported to AIDIS via context_store',
      implementation: 'TR001-6 API client integration'
    },
    {
      key: '5',
      feature: 'Server Validation',
      status: 'Ready',
      description: 'Optional server-side validation integration',
      implementation: 'validateWithServer function (configurable)'
    },
    {
      key: '6',
      feature: 'Form State Management',
      status: 'Active',
      description: 'Comprehensive form state with validation tracking',
      implementation: 'ValidatedFormState interface with all states'
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'success';
      case 'Ready': return 'processing';
      default: return 'default';
    }
  };

  const columns = [
    {
      title: 'Feature',
      dataIndex: 'feature',
      key: 'feature',
      render: (text: string) => <Text strong>{text}</Text>
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Badge
          color={getStatusColor(status)}
          text={status}
        />
      )
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Implementation',
      dataIndex: 'implementation',
      key: 'implementation',
      render: (text: string) => <Tag>{text}</Tag>
    }
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <Title level={2}>
          <FormOutlined /> TR003-6: Form Validation Contract System Demo
        </Title>
        <Paragraph>
          Interactive demonstration of the enhanced form validation system with real-time validation,
          error handling, and AIDIS integration.
        </Paragraph>

        <Alert
          message="TR003-6 Implementation Status"
          description="Form validation contract system is fully operational with real-time validation, shared schemas, and error boundary integration."
          type="success"
          icon={<CheckCircleOutlined />}
          style={{ marginBottom: 24 }}
        />

        <Tabs defaultActiveKey="1">
          <TabPane tab="Validation Features" key="1">
            <Title level={4}>TR003-6 Core Features</Title>
            <Table
              dataSource={validationFeatures}
              columns={columns}
              pagination={false}
              size="middle"
            />
          </TabPane>

          <TabPane tab="Live Demo Forms" key="2">
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Card title="Enhanced Task Form" size="small">
                  <Paragraph>
                    Demonstrates real-time validation with comprehensive field validation,
                    error handling, and AIDIS error reporting.
                  </Paragraph>
                  <Button
                    type="primary"
                    icon={<FormOutlined />}
                    onClick={() => setTaskFormVisible(true)}
                  >
                    Open Task Form
                  </Button>
                </Card>
              </Col>

              <Col span={12}>
                <Card title="Enhanced Project Form" size="small">
                  <Paragraph>
                    Shows dynamic schema validation (Create vs Update) with
                    optional field handling and URL validation.
                  </Paragraph>
                  <Button
                    type="primary"
                    icon={<ApiOutlined />}
                    onClick={() => setProjectFormVisible(true)}
                  >
                    Open Project Form
                  </Button>
                </Card>
              </Col>
            </Row>
          </TabPane>

          <TabPane tab="Validation Stats" key="3">
            <Row gutter={[16, 16]}>
              <Col span={6}>
                <Statistic
                  title="Total Validations"
                  value={validationStats.totalValidations}
                  prefix={<CheckCircleOutlined />}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Successful"
                  value={validationStats.successfulValidations}
                  valueStyle={{ color: '#3f8600' }}
                  prefix={<CheckCircleOutlined />}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Failed"
                  value={validationStats.failedValidations}
                  valueStyle={{ color: '#cf1322' }}
                  prefix={<ExclamationCircleOutlined />}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Success Rate"
                  value={validationStats.totalValidations > 0
                    ? Math.round((validationStats.successfulValidations / validationStats.totalValidations) * 100)
                    : 0
                  }
                  suffix="%"
                  prefix={<Progress type="circle" size={20} percent={
                    validationStats.totalValidations > 0
                      ? Math.round((validationStats.successfulValidations / validationStats.totalValidations) * 100)
                      : 0
                  } showInfo={false} />}
                />
              </Col>
            </Row>
          </TabPane>

          <TabPane tab="Error Testing" key="4">
            <Card title="Error Handling Demo" size="small">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Paragraph>
                  Test the TR002-6 error boundary integration with form validation errors:
                </Paragraph>

                {errorHandler.hasError && (
                  <Alert
                    type="error"
                    message="Demo Error Active"
                    description={errorHandler.getErrorMessage()}
                    action={
                      <Button size="small" onClick={errorHandler.clearError}>
                        Clear Error
                      </Button>
                    }
                    closable
                  />
                )}

                <Space>
                  <Button
                    icon={<BugOutlined />}
                    onClick={triggerTestError}
                    disabled={errorHandler.hasError}
                  >
                    Trigger Test Error
                  </Button>

                  <Button
                    icon={<SettingOutlined />}
                    onClick={() => formActions.validateForm()}
                  >
                    Test Form Validation
                  </Button>
                </Space>

                <Alert
                  message="Integration Status"
                  description={
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      <li>✅ TR001-6: AIDIS API Client - Error reporting via context_store</li>
                      <li>✅ TR002-6: Error Boundaries - Form error containment and recovery</li>
                      <li>✅ TR003-6: Validation Contracts - Real-time validation with shared schemas</li>
                    </ul>
                  }
                  type="info"
                />
              </Space>
            </Card>
          </TabPane>
        </Tabs>

        {/* Task Form Modal */}
        <ValidatedTaskForm
          visible={taskFormVisible}
          projectId="demo-project-id"
          onSubmit={handleTaskSubmit}
          onCancel={() => setTaskFormVisible(false)}
        />

        {/* Project Form Modal */}
        <ValidatedProjectForm
          visible={projectFormVisible}
          onSubmit={handleProjectSubmit}
          onCancel={() => setProjectFormVisible(false)}
        />
      </Card>
    </div>
  );
};

export default FormValidationDemo;