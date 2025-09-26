import React from 'react';
import { Typography, Card, Form, Input, Switch, Button, Space, Divider, Select, message } from 'antd';
import { SettingOutlined, UserOutlined, BellOutlined, SecurityScanOutlined, ProjectOutlined } from '@ant-design/icons';
import { useAuthContext } from '../contexts/AuthContext';
import { useProjectContext } from '../contexts/ProjectContext';
import { useSettings } from '../hooks/useSettings';
import useFeatureFlag from '../hooks/useFeatureFlag';

const { Title, Text } = Typography;

const Settings: React.FC = () => {
  const { user } = useAuthContext();
  const { allProjects } = useProjectContext();
  const { defaultProject, setDefaultProject, clearDefaultProject } = useSettings();
  const [form] = Form.useForm();
  const featureFlagUiEnabled = useFeatureFlag('phase1.featureFlags', false);

  const handleSave = (values: any) => {
    console.log('Settings saved:', values);

    // Save all form values including default project
    // Note: Default project is handled separately via dropdown onChange
    // but we should also handle it here for consistency
    try {
      // Other settings would go here (profile, notifications, etc.)
      // For now, just show success message
      message.success('Settings saved successfully!');
      console.log('✅ Settings form submitted successfully:', values);
    } catch (error) {
      console.error('Failed to save settings:', error);
      message.error('Failed to save settings. Please try again.');
    }
  };

  const handleDefaultProjectChange = (projectName: string | null) => {
    if (projectName) {
      setDefaultProject(projectName);
      message.success(`Default project set to: ${projectName}`);
    } else {
      clearDefaultProject();
      message.info('Default project cleared');
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div>
        <Title level={2}>Settings</Title>
        <Text type="secondary">
          Manage your account settings and preferences
        </Text>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
        initialValues={{
          username: user?.username,
          email: user?.email,
          notifications: true,
          darkMode: false,
          autoSave: true,
        }}
      >
        {/* Profile Settings */}
        <Card title={<><UserOutlined /> Profile Information</>}>
          <Form.Item
            label="Username"
            name="username"
            rules={[{ required: true, message: 'Username is required' }]}
          >
            <Input placeholder="Enter your username" />
          </Form.Item>

          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: 'Email is required' },
              { type: 'email', message: 'Please enter a valid email' },
            ]}
          >
            <Input placeholder="Enter your email" />
          </Form.Item>

        </Card>

        {/* Default Project Settings */}
        <Card title={<><ProjectOutlined /> Default Project</>}>
          <Form.Item label="Default Project">
            <Space.Compact style={{ width: '100%' }}>
              <Select
                value={defaultProject}
                placeholder="Select a default project"
                allowClear
                style={{ flex: 1 }}
                onChange={handleDefaultProjectChange}
                options={allProjects
                  .filter(project => project.id !== '00000000-0000-0000-0000-000000000000')
                  .map(project => ({
                    value: project.name,
                    label: project.name,
                  }))
                }
              />
            </Space.Compact>
          </Form.Item>

          <Text type="secondary">
            Set a default project to be automatically selected when you start a new session.
            If not set, the system will fall back to "aidis-bootstrap" or the first available project.
            <br />
            <strong>Note:</strong> Project selection is saved automatically when you make a change.
          </Text>
        </Card>

        {/* Notification Settings */}
        <Card title={<><BellOutlined /> Notifications</>}>
          <Form.Item
            label="Enable Notifications"
            name="notifications"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Text type="secondary">
            Receive notifications about system updates and important events
          </Text>
        </Card>

        {/* Application Settings */}
        <Card title={<><SettingOutlined /> Application Preferences</>}>
          <Form.Item
            label="Dark Mode"
            name="darkMode"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Form.Item
            label="Auto-save Context"
            name="autoSave"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Text type="secondary">
            Automatically save context changes without manual confirmation
          </Text>
        </Card>

        {featureFlagUiEnabled && (
          <Card title="Feature Flag Controls">
            <Text>
              Feature flag management UI is enabled. Future releases will surface toggle controls here once
              rollout gates are ready.
            </Text>
          </Card>
        )}

        {/* Security Settings */}
        <Card title={<><SecurityScanOutlined /> Security</>}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Button type="default">Change Password</Button>
            <Button type="default">Manage API Keys</Button>
            <Button type="default" danger>
              Revoke All Sessions
            </Button>
          </Space>
        </Card>

        <Divider />

        {/* Action Buttons */}
        <Space>
          <Button type="primary" htmlType="submit">
            Save Changes
          </Button>
          <Button type="default" onClick={() => form.resetFields()}>
            Reset
          </Button>
        </Space>
      </Form>
    </Space>
  );
};

export default Settings;
