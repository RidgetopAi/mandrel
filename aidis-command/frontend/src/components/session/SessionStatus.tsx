/**
 * Session Status Component
 * 
 * Displays current session state, connection status, and provides
 * recovery/reconnection controls for users.
 */

import React from 'react';
import {
  Card,
  Badge,
  Button,
  Typography,
  Space,
  Tooltip,
  Alert,
  Row,
  Col,
  Statistic,
  Spin
} from 'antd';
import {
  WifiOutlined,
  DisconnectOutlined,
  ReloadOutlined,
  ClockCircleOutlined,
  UserOutlined,
  WarningOutlined
} from '@ant-design/icons';
import { useSessionRecovery } from '../../hooks/useSessionRecovery';
import { formatDistanceToNow } from 'date-fns';

const { Text, Title } = Typography;

interface SessionStatusProps {
  showDetails?: boolean;
  compact?: boolean;
  className?: string;
}

const SessionStatus: React.FC<SessionStatusProps> = ({ 
  showDetails = true, 
  compact = false,
  className 
}) => {
  const [state, actions] = useSessionRecovery();
  
  const {
    currentSession,
    isConnected,
    reconnectAttempts,
    isLoading,
    lastSyncTime
  } = state;

  const getConnectionBadge = () => {
    if (isLoading) {
      return (
        <Badge 
          status="processing" 
          text={<Spin size="small" />}
        />
      );
    }
    
    if (isConnected) {
      return (
        <Badge 
          status="success" 
          text={
            <Space size="small">
              <WifiOutlined />
              Connected
            </Space>
          }
        />
      );
    }
    
    return (
      <Badge 
        status="error" 
        text={
          <Space size="small">
            <DisconnectOutlined />
            {reconnectAttempts > 0 ? `Reconnecting... (${reconnectAttempts})` : 'Disconnected'}
          </Space>
        }
      />
    );
  };

  const getLastSyncTime = () => {
    if (!lastSyncTime) return 'Never';
    try {
      return formatDistanceToNow(new Date(lastSyncTime), { addSuffix: true });
    } catch {
      return 'Unknown';
    }
  };

  const handleReconnect = async () => {
    await actions.reconnect();
  };

  const handleForceSync = async () => {
    await actions.forceSync();
  };

  if (compact) {
    return (
      <div className={className}>
        <Space size="small">
          {getConnectionBadge()}
          {!isConnected && reconnectAttempts === 0 && (
            <Tooltip title="Reconnect to server">
              <Button 
                type="text" 
                size="small" 
                icon={<ReloadOutlined />}
                loading={isLoading}
                onClick={handleReconnect}
              />
            </Tooltip>
          )}
        </Space>
      </div>
    );
  }

  return (
    <Card 
      className={className}
      title={
        <Space>
          <UserOutlined />
          Session Status
        </Space>
      }
      size="small"
    >
      {/* Connection Status */}
      <Row gutter={[16, 16]}>
        <Col span={12}>
          <div>
            <Text type="secondary">Connection Status</Text>
            <div style={{ marginTop: 4 }}>
              {getConnectionBadge()}
            </div>
          </div>
        </Col>
        
        <Col span={12}>
          <Statistic
            title="Last Sync"
            value={getLastSyncTime()}
            prefix={<ClockCircleOutlined />}
            valueStyle={{ fontSize: '14px' }}
          />
        </Col>
      </Row>

      {/* Session Info */}
      {showDetails && currentSession && (
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">Current Session</Text>
          <div style={{ marginTop: 4 }}>
            <Text strong>
              {currentSession.title || `Session ${currentSession.id.substring(0, 8)}...`}
            </Text>
            {currentSession.project_name && (
              <div>
                <Text type="secondary">Project: {currentSession.project_name}</Text>
              </div>
            )}
            {currentSession.description && (
              <div style={{ marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  {currentSession.description.length > 100 
                    ? `${currentSession.description.substring(0, 100)}...`
                    : currentSession.description
                  }
                </Text>
              </div>
            )}
          </div>
        </div>
      )}

      {/* No Session Warning */}
      {showDetails && !currentSession && isConnected && (
        <Alert
          message="No Active Session"
          description="No session is currently active. Session data may not be tracked properly."
          type="warning"
          icon={<WarningOutlined />}
          style={{ marginTop: 16 }}
          showIcon
        />
      )}

      {/* Connection Issues */}
      {!isConnected && (
        <Alert
          message="Connection Issues"
          description={
            reconnectAttempts > 0 
              ? `Attempting to reconnect... (Attempt ${reconnectAttempts})`
              : "Lost connection to server. Session data may not be synchronized."
          }
          type="error"
          style={{ marginTop: 16 }}
          showIcon
          action={
            reconnectAttempts === 0 && (
              <Button 
                size="small" 
                type="primary" 
                onClick={handleReconnect}
                loading={isLoading}
                icon={<ReloadOutlined />}
              >
                Reconnect
              </Button>
            )
          }
        />
      )}

      {/* Controls */}
      {showDetails && (
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <Space>
            <Button 
              size="small"
              icon={<ReloadOutlined />}
              onClick={handleForceSync}
              loading={isLoading}
            >
              Sync Now
            </Button>
            {!isConnected && reconnectAttempts === 0 && (
              <Button 
                type="primary"
                size="small"
                icon={<WifiOutlined />}
                onClick={handleReconnect}
                loading={isLoading}
              >
                Reconnect
              </Button>
            )}
          </Space>
        </div>
      )}
    </Card>
  );
};

export default SessionStatus;