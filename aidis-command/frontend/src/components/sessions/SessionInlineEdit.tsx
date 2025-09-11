import React, { useState } from 'react';
import {
  Typography,
  Input,
  Button,
  Space,
  message,
  Tooltip
} from 'antd';
import {
  EditOutlined,
  CheckOutlined,
  CloseOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import { ProjectApi, Session, UpdateSessionRequest } from '../../services/projectApi';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

interface SessionInlineEditProps {
  session: Session;
  field: 'title' | 'description';
  onUpdate: (updatedSession: Session) => void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
}

const SessionInlineEdit: React.FC<SessionInlineEditProps> = ({
  session,
  field,
  onUpdate,
  placeholder,
  maxLength = field === 'title' ? 255 : 2000,
  rows = field === 'description' ? 3 : 1
}) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(session[field] || '');
  const [loading, setLoading] = useState(false);

  const currentValue = session[field] || '';
  const hasValue = Boolean(currentValue.trim());

  const handleEdit = () => {
    setValue(currentValue);
    setEditing(true);
  };

  const handleCancel = () => {
    setValue(currentValue);
    setEditing(false);
  };

  const handleSave = async () => {
    const trimmedValue = value.trim();
    
    // If no change, just exit edit mode
    if (trimmedValue === currentValue) {
      setEditing(false);
      return;
    }

    try {
      setLoading(true);

      const updates: UpdateSessionRequest = {
        [field]: trimmedValue || undefined
      };

      const updatedSession = await ProjectApi.updateSession(session.id, updates);
      
      message.success(`Session ${field} updated successfully`);
      onUpdate(updatedSession);
      setEditing(false);
      
    } catch (error: any) {
      console.error(`Failed to update session ${field}:`, error);
      message.error(error.message || `Failed to update session ${field}`);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && field === 'title') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (editing) {
    const InputComponent = field === 'description' ? TextArea : Input;
    
    return (
      <div style={{ width: '100%' }}>
        <InputComponent
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || `Enter session ${field}...`}
          maxLength={maxLength}
          rows={rows}
          autoFocus
          style={{ marginBottom: 8 }}
        />
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            onClick={handleSave}
            loading={loading}
          >
            Save
          </Button>
          <Button
            size="small"
            icon={<CloseOutlined />}
            onClick={handleCancel}
            disabled={loading}
          >
            Cancel
          </Button>
        </Space>
      </div>
    );
  }

  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: field === 'title' ? 'center' : 'flex-start',
        gap: 8,
        cursor: 'pointer',
        padding: '4px 8px',
        borderRadius: 4,
        transition: 'background-color 0.2s',
        backgroundColor: isHovered ? '#f5f5f5' : 'transparent',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleEdit}
    >
      {hasValue ? (
        field === 'title' ? (
          <Text strong style={{ flex: 1 }}>
            {currentValue}
          </Text>
        ) : (
          <Paragraph 
            style={{ flex: 1, margin: 0 }}
            ellipsis={{ rows: 2, expandable: true, symbol: 'more' }}
          >
            {currentValue}
          </Paragraph>
        )
      ) : (
        <Text type="secondary" style={{ flex: 1, fontStyle: 'italic' }}>
          {placeholder || `Click to add ${field}...`}
        </Text>
      )}
      
      <Tooltip title={`Edit ${field}`}>
        <Button
          type="text"
          size="small"
          icon={hasValue ? <EditOutlined /> : <FileTextOutlined />}
          style={{ 
            opacity: isHovered ? 1 : 0.6,
            transition: 'opacity 0.2s'
          }}
        />
      </Tooltip>
    </div>
  );
};

export default SessionInlineEdit;