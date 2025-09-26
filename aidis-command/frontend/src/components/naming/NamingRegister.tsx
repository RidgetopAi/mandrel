import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Modal, Form, Input, Select, Button, Space, Typography, Alert, Divider, Card } from 'antd';
import { 
  PlusOutlined, CheckCircleOutlined, ExclamationCircleOutlined,
  BulbOutlined, CodeOutlined 
} from '@ant-design/icons';
import { NamingApi } from '../../services/namingApi';
import { NamingSuggestion } from './types';

const { TextArea } = Input;
const { Text } = Typography;

interface NamingRegisterProps {
  visible: boolean;
  onClose: () => void;
  onComplete: (entry: any) => void;
}

const NamingRegister: React.FC<NamingRegisterProps> = ({
  visible,
  onClose,
  onComplete
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [availabilityResult, setAvailabilityResult] = useState<{ available: boolean; conflicts?: any[] } | null>(null);
  const [suggestions, setSuggestions] = useState<NamingSuggestion[]>([]);
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  const typeOptions = [
    { label: 'Variable', value: 'variable' },
    { label: 'Function', value: 'function' },
    { label: 'Component', value: 'component' },
    { label: 'Class', value: 'class' },
    { label: 'Interface', value: 'interface' },
    { label: 'Module', value: 'module' },
    { label: 'File', value: 'file' },
  ];

  const checkNameAvailability = useCallback(async (name: string) => {
    if (!name || name.length < 2) {
      setAvailabilityResult(null);
      setSuggestions([]);
      setCheckingAvailability(false);
      return;
    }

    setCheckingAvailability(true);
    try {
      const currentType = form.getFieldValue('type');
      // Check availability
      const availability = await NamingApi.checkNameAvailability(name);
      setAvailabilityResult(availability);

      // Get suggestions if name is not available
      if (!availability.available) {
        const nameSuggestions = await NamingApi.getSuggestions(name, currentType);
        setSuggestions(nameSuggestions);
      } else {
        setSuggestions([]);
      }
    } catch (err) {
      console.error('Failed to check name availability:', err);
      setAvailabilityResult(null);
      setSuggestions([]);
    } finally {
      setCheckingAvailability(false);
    }
  }, []);

  const handleNameChange = useCallback((name: string) => {
    // Clear previous timeout
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    // Reset availability if name is too short
    if (!name || name.length < 2) {
      setAvailabilityResult(null);
      setSuggestions([]);
      setCheckingAvailability(false);
      return;
    }

    // Debounce API call by 500ms
    debounceTimeout.current = setTimeout(() => {
      checkNameAvailability(name);
    }, 500);
  }, [checkNameAvailability]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, []);

  const handleSubmit = async (values: any) => {
    setLoading(true);
    
    // Clear debounce timeout during submission
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    
    try {
      const entry = await NamingApi.registerName({
        name: values.name.trim(),
        type: values.type,
        context: values.context?.trim() || undefined
      });
      
      form.resetFields();
      setAvailabilityResult(null);
      setSuggestions([]);
      setCheckingAvailability(false);
      onComplete(entry);
    } catch (err) {
      console.error('Failed to register name:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    // Clear debounce timeout
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    
    form.resetFields();
    setAvailabilityResult(null);
    setSuggestions([]);
    setCheckingAvailability(false);
    onClose();
  };

  const applySuggestion = (suggestedName: string) => {
    form.setFieldsValue({ name: suggestedName });
    handleNameChange(suggestedName);
  };

  return (
    <Modal
      title={
        <Space>
          <PlusOutlined />
          <span>Register New Name</span>
        </Space>
      }
      open={visible}
      onCancel={handleCancel}
      width={600}
      footer={null}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          type: 'variable'
        }}
      >
        <Form.Item
          name="name"
          label="Name"
          rules={[
            { required: true, message: 'Please enter a name' },
            { min: 2, message: 'Name must be at least 2 characters' },
            { pattern: /^[a-zA-Z_$][a-zA-Z0-9_$]*$/, message: 'Name must be a valid identifier' }
          ]}
        >
          <Input
            placeholder="Enter the name to register"
            onChange={(e) => handleNameChange(e.target.value)}
            suffix={
              <BulbOutlined 
                spin={checkingAvailability} 
                style={{ 
                  color: checkingAvailability ? '#1890ff' : '#d9d9d9',
                  transition: 'color 0.2s'
                }} 
              />
            }
          />
        </Form.Item>

        {/* Availability Status */}
        {availabilityResult && (
          <div style={{ marginBottom: 16 }}>
            {availabilityResult.available ? (
              <Alert
                type="success"
                message="Name Available"
                description="This name is available for registration."
                icon={<CheckCircleOutlined />}
                showIcon
              />
            ) : (
              <Alert
                type="warning"
                message="Name Conflict"
                description={`This name conflicts with ${availabilityResult.conflicts?.length || 0} existing entries.`}
                icon={<ExclamationCircleOutlined />}
                showIcon
              />
            )}
          </div>
        )}

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <Card size="small" title="Suggested Names" style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              {suggestions.slice(0, 3).map((suggestion, index) => (
                <div 
                  key={index}
                  style={{ 
                    padding: '8px 12px', 
                    border: '1px solid #d9d9d9', 
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onClick={() => applySuggestion(suggestion.suggested_name)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#1890ff';
                    e.currentTarget.style.backgroundColor = '#f6ffed';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#d9d9d9';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <div>
                      <Text strong style={{ color: '#1890ff' }}>
                        {suggestion.suggested_name}
                      </Text>
                      <Text type="secondary" style={{ display: 'block', fontSize: '12px' }}>
                        {suggestion.reason}
                      </Text>
                    </div>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      {suggestion.confidence}% confidence
                    </Text>
                  </Space>
                </div>
              ))}
            </Space>
          </Card>
        )}

        <Form.Item
          name="type"
          label={
            <Space>
              <CodeOutlined />
              <span>Type</span>
            </Space>
          }
          rules={[{ required: true, message: 'Please select a type' }]}
        >
          <Select placeholder="Select naming type" options={typeOptions} />
        </Form.Item>

        <Form.Item
          name="context"
          label="Context (Optional)"
          help="Describe where and how this name will be used"
        >
          <TextArea
            placeholder="Provide context about the purpose and usage of this name..."
            rows={3}
            maxLength={500}
            showCount
          />
        </Form.Item>

        <Divider />

        <div style={{ textAlign: 'right' }}>
          <Space>
            <Button onClick={handleCancel}>
              Cancel
            </Button>
            <Button 
              type="primary" 
              htmlType="submit"
              loading={loading}
              disabled={!!(availabilityResult && !availabilityResult.available)}
              icon={<PlusOutlined />}
            >
              Register Name
            </Button>
          </Space>
        </div>
      </Form>
    </Modal>
  );
};

export default NamingRegister;
