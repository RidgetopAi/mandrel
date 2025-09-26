/**
 * TR002-6: Fallback UI Components for Graceful Degradation
 * Provides pre-built fallback components for different error scenarios
 */

import React from 'react';
import { Card, Empty, Button, Alert, Space, Typography, Spin, Result } from 'antd';
import {
  ApiOutlined,
  ReloadOutlined,
  ExclamationCircleOutlined,
  DisconnectOutlined,
  FileSearchOutlined,
  BugOutlined
} from '@ant-design/icons';

const { Text, Title } = Typography;

// ================================
// API FALLBACK COMPONENTS
// ================================

export interface ApiErrorFallbackProps {
  error?: Error;
  onRetry?: () => void;
  isRetrying?: boolean;
  componentName?: string;
}

export const ApiErrorFallback: React.FC<ApiErrorFallbackProps> = ({
  error,
  onRetry,
  isRetrying = false,
  componentName = 'Component'
}) => (
  <Card>
    <Result
      status="warning"
      icon={<ApiOutlined style={{ color: '#faad14' }} />}
      title="API Connection Issue"
      subTitle={`${componentName} couldn't connect to AIDIS API`}
      extra={[
        <Button
          key="retry"
          type="primary"
          icon={<ReloadOutlined />}
          onClick={onRetry}
          loading={isRetrying}
        >
          {isRetrying ? 'Retrying...' : 'Retry'}
        </Button>
      ]}
    >
      {error && (
        <Alert
          type="warning"
          message="Technical Details"
          description={error.message}
          style={{ textAlign: 'left', marginTop: 16 }}
        />
      )}
    </Result>
  </Card>
);

// ================================
// NETWORK FALLBACK COMPONENTS
// ================================

export interface NetworkErrorFallbackProps {
  onRetry?: () => void;
  isRetrying?: boolean;
}

export const NetworkErrorFallback: React.FC<NetworkErrorFallbackProps> = ({
  onRetry,
  isRetrying = false
}) => (
  <Card>
    <Result
      status="error"
      icon={<DisconnectOutlined style={{ color: '#ff4d4f' }} />}
      title="Connection Lost"
      subTitle="Unable to connect to AIDIS services"
      extra={[
        <Button
          key="retry"
          type="primary"
          icon={<ReloadOutlined />}
          onClick={onRetry}
          loading={isRetrying}
        >
          {isRetrying ? 'Reconnecting...' : 'Retry Connection'}
        </Button>,
        <Button key="reload" onClick={() => window.location.reload()}>
          Reload Page
        </Button>
      ]}
    >
      <Alert
        type="info"
        message="Troubleshooting"
        description={
          <ul style={{ textAlign: 'left', margin: 0, paddingLeft: 16 }}>
            <li>Check your internet connection</li>
            <li>Verify AIDIS server is running</li>
            <li>Try refreshing the page</li>
          </ul>
        }
      />
    </Result>
  </Card>
);

// ================================
// DATA LOADING FALLBACK COMPONENTS
// ================================

export interface DataLoadingFallbackProps {
  message?: string;
  showRetry?: boolean;
  onRetry?: () => void;
}

export const DataLoadingFallback: React.FC<DataLoadingFallbackProps> = ({
  message = 'Loading data...',
  showRetry = false,
  onRetry
}) => (
  <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
    <Space direction="vertical" size="large">
      <Spin size="large" />
      <div>
        <Title level={4}>{message}</Title>
        <Text type="secondary">Please wait while we fetch your data</Text>
      </div>
      {showRetry && onRetry && (
        <Button type="link" icon={<ReloadOutlined />} onClick={onRetry}>
          Retry if this takes too long
        </Button>
      )}
    </Space>
  </Card>
);

// ================================
// EMPTY STATE FALLBACK COMPONENTS
// ================================

export interface EmptyDataFallbackProps {
  title?: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export const EmptyDataFallback: React.FC<EmptyDataFallbackProps> = ({
  title = 'No Data Available',
  description = 'There\'s no data to display right now',
  actionText,
  onAction,
  icon
}) => (
  <Card>
    <Empty
      image={icon || <FileSearchOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />}
      imageStyle={{ height: 80 }}
      description={
        <Space direction="vertical">
          <Text strong>{title}</Text>
          <Text type="secondary">{description}</Text>
        </Space>
      }
    >
      {actionText && onAction && (
        <Button type="primary" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </Empty>
  </Card>
);

// ================================
// COMPONENT ERROR FALLBACK
// ================================

export interface ComponentErrorFallbackProps {
  error?: Error;
  componentName?: string;
  onReset?: () => void;
  showDetails?: boolean;
}

export const ComponentErrorFallback: React.FC<ComponentErrorFallbackProps> = ({
  error,
  componentName = 'Component',
  onReset,
  showDetails = false
}) => (
  <Card>
    <Result
      status="error"
      icon={<BugOutlined style={{ color: '#ff4d4f' }} />}
      title={`${componentName} Error`}
      subTitle="Something went wrong with this component"
      extra={[
        <Button key="reset" type="primary" onClick={onReset}>
          Reset Component
        </Button>,
        <Button key="reload" onClick={() => window.location.reload()}>
          Reload Page
        </Button>
      ]}
    >
      {showDetails && error && (
        <Alert
          type="error"
          message="Error Details"
          description={
            <div style={{ textAlign: 'left' }}>
              <Text code>{error.message}</Text>
              {error.stack && (
                <details style={{ marginTop: 8 }}>
                  <summary>Stack Trace</summary>
                  <pre style={{ fontSize: 10, overflow: 'auto', maxHeight: 200 }}>
                    {error.stack}
                  </pre>
                </details>
              )}
            </div>
          }
          style={{ marginTop: 16 }}
        />
      )}
    </Result>
  </Card>
);

// ================================
// PARTIAL DEGRADATION COMPONENTS
// ================================

export interface PartialFallbackProps {
  title: string;
  workingFeatures: string[];
  failedFeatures: string[];
  onRetryFailed?: () => void;
}

export const PartialFallback: React.FC<PartialFallbackProps> = ({
  title,
  workingFeatures,
  failedFeatures,
  onRetryFailed
}) => (
  <Card>
    <Alert
      type="warning"
      message={title}
      description={
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong style={{ color: '#52c41a' }}>✅ Working:</Text>
            <ul style={{ margin: '4px 0', paddingLeft: 16 }}>
              {workingFeatures.map((feature, index) => (
                <li key={index}>{feature}</li>
              ))}
            </ul>
          </div>

          <div>
            <Text strong style={{ color: '#ff4d4f' }}>❌ Unavailable:</Text>
            <ul style={{ margin: '4px 0', paddingLeft: 16 }}>
              {failedFeatures.map((feature, index) => (
                <li key={index}>{feature}</li>
              ))}
            </ul>
          </div>

          {onRetryFailed && (
            <Button
              type="link"
              size="small"
              icon={<ReloadOutlined />}
              onClick={onRetryFailed}
            >
              Retry Failed Features
            </Button>
          )}
        </Space>
      }
      showIcon
    />
  </Card>
);

// ================================
// SMART FALLBACK SELECTOR
// ================================

export interface SmartFallbackProps {
  error?: Error;
  errorType?: 'api' | 'network' | 'component' | 'validation' | 'unknown';
  componentName?: string;
  onRetry?: () => void;
  onReset?: () => void;
  isRetrying?: boolean;
  fallbackComponent?: React.ReactNode;
}

export const SmartFallback: React.FC<SmartFallbackProps> = ({
  error,
  errorType = 'unknown',
  componentName,
  onRetry,
  onReset,
  isRetrying = false,
  fallbackComponent
}) => {
  // Use custom fallback if provided
  if (fallbackComponent) {
    return <>{fallbackComponent}</>;
  }

  // Select appropriate fallback based on error type
  switch (errorType) {
    case 'api':
      return (
        <ApiErrorFallback
          error={error}
          onRetry={onRetry}
          isRetrying={isRetrying}
          componentName={componentName}
        />
      );

    case 'network':
      return (
        <NetworkErrorFallback
          onRetry={onRetry}
          isRetrying={isRetrying}
        />
      );

    case 'component':
      return (
        <ComponentErrorFallback
          error={error}
          componentName={componentName}
          onReset={onReset}
          showDetails={process.env.NODE_ENV === 'development'}
        />
      );

    case 'validation':
      return (
        <Alert
          type="error"
          message="Validation Error"
          description={error?.message || 'Invalid data provided'}
          action={
            <Button size="small" onClick={onReset}>
              Reset
            </Button>
          }
        />
      );

    default:
      return (
        <ComponentErrorFallback
          error={error}
          componentName={componentName}
          onReset={onReset}
          showDetails={false}
        />
      );
  }
};

export {
  ApiErrorFallback as ApiError,
  NetworkErrorFallback as NetworkError,
  DataLoadingFallback as DataLoading,
  EmptyDataFallback as EmptyData,
  ComponentErrorFallback as ComponentError,
  PartialFallback as PartialDegradation,
  SmartFallback as Smart
};

export default {
  ApiError: ApiErrorFallback,
  NetworkError: NetworkErrorFallback,
  DataLoading: DataLoadingFallback,
  EmptyData: EmptyDataFallback,
  ComponentError: ComponentErrorFallback,
  PartialDegradation: PartialFallback,
  Smart: SmartFallback,
};