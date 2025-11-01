/**
 * TR002-6: Error Boundary Demonstration Component
 * Shows all error boundary features and fallback components in action
 */

import React, { useState } from 'react';
import { Card, Button, Space, Typography, Alert, Row, Col, Divider } from 'antd';
import { BugOutlined, ApiOutlined, DisconnectOutlined, ExperimentOutlined } from '@ant-design/icons';
import MandrelApiErrorBoundary from '../error/MandrelApiErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import FallbackComponents from '../error/FallbackComponents';
import { mandrelApi } from '../../api/mandrelApiClient';

const { Title, Text } = Typography;

// Component that intentionally throws errors for testing
const ErrorTrigger: React.FC<{ errorType: string }> = ({ errorType }) => {
  const [shouldError, setShouldError] = useState(false);

  if (shouldError) {
    switch (errorType) {
      case 'component':
        throw new Error('Intentional component error for testing');
      case 'api':
        throw new Error('API request failed: Connection timeout');
      case 'network':
        throw new Error('Network error: Unable to reach server');
      case 'validation':
        throw new Error('Validation failed: Invalid input data');
      default:
        throw new Error('Unknown error type');
    }
  }

  return (
    <Button
      type="primary"
      danger
      onClick={() => setShouldError(true)}
      icon={<BugOutlined />}
    >
      Trigger {errorType} Error
    </Button>
  );
};

// Component demonstrating useErrorHandler hook
const ErrorHandlerHookDemo: React.FC = () => {
  const errorHandler = useErrorHandler({
    componentName: 'ErrorHandlerHookDemo',
    enableAutoRetry: true,
    maxRetries: 2,
    showUserMessages: true,
  });

  const simulateApiCall = async (shouldFail: boolean = false) => {
    if (shouldFail) {
      throw new Error('Simulated API failure');
    }
    return await mandrelApi.ping('Error handler test');
  };

  const testErrorHandling = async () => {
    await errorHandler.withErrorHandling(simulateApiCall)(true);
  };

  const testSuccessCall = async () => {
    await errorHandler.withErrorHandling(simulateApiCall)(false);
  };

  return (
    <Card title="🔧 useErrorHandler Hook Demo" size="small">
      <Space direction="vertical" style={{ width: '100%' }}>
        <Space>
          <Button onClick={testErrorHandling} icon={<BugOutlined />}>
            Test Error Handling
          </Button>
          <Button type="primary" onClick={testSuccessCall} icon={<ApiOutlined />}>
            Test Success Call
          </Button>
          {errorHandler.hasError && (
            <Button onClick={errorHandler.clearError}>
              Clear Error
            </Button>
          )}
        </Space>

        {errorHandler.hasError && (
          <Alert
            type="error"
            message={`Error Type: ${errorHandler.errorType}`}
            description={errorHandler.getErrorMessage()}
            showIcon
          />
        )}

        {errorHandler.isRecovering && (
          <Alert
            type="info"
            message="Recovering..."
            description={`Retry ${errorHandler.retryCount}/${errorHandler.maxRetries}`}
            showIcon
          />
        )}
      </Space>
    </Card>
  );
};

const ErrorBoundaryDemo: React.FC = () => {
  const [resetKey, setResetKey] = useState(0);

  const resetDemo = () => {
    setResetKey(prev => prev + 1);
  };

  return (
    <Card title="🧪 TR002-6: Error Boundary & Fallback Components Demo" style={{ margin: '16px 0' }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Alert
          message="TR002-6: React Component Error Boundaries"
          description="Comprehensive error handling with AIDIS V2 API integration, automatic retry, and graceful degradation"
          type="info"
          showIcon
        />

        <Button onClick={resetDemo} type="default" style={{ marginBottom: 16 }}>
          Reset All Demos
        </Button>

        <Row gutter={[16, 16]} key={resetKey}>
          {/* Error Boundary Tests */}
          <Col xs={24} lg={12}>
            <Title level={4}>🛡️ Error Boundary Tests</Title>

            <Space direction="vertical" style={{ width: '100%' }}>
              <MandrelApiErrorBoundary
                componentName="ComponentErrorTest"
                enableAutoRetry={false}
              >
                <Card title="Component Error Test" size="small">
                  <ErrorTrigger errorType="component" />
                </Card>
              </MandrelApiErrorBoundary>

              <MandrelApiErrorBoundary
                componentName="ApiErrorTest"
                enableAutoRetry={true}
                maxRetries={2}
              >
                <Card title="API Error Test" size="small">
                  <ErrorTrigger errorType="api" />
                </Card>
              </MandrelApiErrorBoundary>

              <MandrelApiErrorBoundary
                componentName="NetworkErrorTest"
                enableAutoRetry={true}
                maxRetries={3}
              >
                <Card title="Network Error Test" size="small">
                  <ErrorTrigger errorType="network" />
                </Card>
              </MandrelApiErrorBoundary>
            </Space>
          </Col>

          {/* Fallback Components */}
          <Col xs={24} lg={12}>
            <Title level={4}>🔧 Fallback Components</Title>

            <Space direction="vertical" style={{ width: '100%' }}>
              <FallbackComponents.ApiError
                error={new Error('Demo API error')}
                componentName="Demo Component"
                onRetry={() => console.log('Retry clicked')}
                isRetrying={false}
              />

              <FallbackComponents.EmptyData
                title="No Data Found"
                description="This is how empty states look"
                actionText="Load Data"
                onAction={() => console.log('Load data clicked')}
              />

              <FallbackComponents.PartialDegradation
                title="Partial System Degradation"
                workingFeatures={['Basic functionality', 'Local data', 'UI components']}
                failedFeatures={['AIDIS API', 'Real-time updates', 'Cloud sync']}
                onRetryFailed={() => console.log('Retry failed features')}
              />
            </Space>
          </Col>
        </Row>

        <Divider />

        {/* Error Handler Hook Demo */}
        <ErrorHandlerHookDemo />

        <Divider />

        {/* System Integration Status */}
        <Card title="🔗 Integration Status" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text>
              <strong>✅ Integrated Features:</strong>
            </Text>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              <li>AIDIS V2 API error reporting via context_store</li>
              <li>Automatic retry with exponential backoff</li>
              <li>Request correlation ID tracking</li>
              <li>Local error storage as fallback</li>
              <li>Component-level error boundaries</li>
              <li>Graceful degradation with fallback UI</li>
              <li>Error classification (API, Network, Component, Validation)</li>
            </ul>

            <Alert
              type="success"
              message="TR002-6 Implementation Complete"
              description="All error boundary features are active and integrated with TR001-6 AIDIS V2 API client"
              showIcon
            />
          </Space>
        </Card>
      </Space>
    </Card>
  );
};

export default ErrorBoundaryDemo;