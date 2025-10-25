import React, { useState, useEffect } from 'react';
import { Typography, Card, Form, Input, Switch, Button, Space, Divider, Select, message, Tooltip, Modal } from 'antd';
import { SettingOutlined, UserOutlined, SecurityScanOutlined, ProjectOutlined } from '@ant-design/icons';
import { useAuthContext } from '../contexts/AuthContext';
import { useProjectContext } from '../contexts/ProjectContext';
import { useSettings } from '../hooks/useSettings';
import useFeatureFlag from '../hooks/useFeatureFlag';
import { useQueryClient } from '@tanstack/react-query';

const { Title, Text } = Typography;

const Settings: React.FC = () => {
  const { user } = useAuthContext();
  const queryClient = useQueryClient();
  const { allProjects } = useProjectContext();
  const { defaultProject, setDefaultProject, clearDefaultProject } = useSettings();
  const [form] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const featureFlagUiEnabled = useFeatureFlag('phase1.featureFlags', false);
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
  const token = localStorage.getItem('aidis_token') || '';

  // Load user theme on mount
  useEffect(() => {
    const loadUserTheme = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/auth/profile`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (response.ok) {
          const data = await response.json();
          const theme = data.data?.user?.theme || 'light';
          setIsDarkMode(theme === 'dark');
          form.setFieldsValue({ darkMode: theme === 'dark' });
        }
      } catch (error) {
        console.error('Failed to load user theme:', error);
      }
    };
    loadUserTheme();
  }, [apiBaseUrl, token, form]);

  const handleSave = async (values: any) => {
    setIsSavingProfile(true);
    try {
      const { username, email } = values;

      // Only send fields that have changed
      const updates: any = {};
      if (username !== user?.username) updates.username = username;
      if (email !== user?.email) updates.email = email;

      if (Object.keys(updates).length === 0) {
        message.info('No changes to save');
        setIsSavingProfile(false);
        return;
      }

      const response = await fetch(`${apiBaseUrl}/users/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        message.success('Profile updated successfully!');
        // Invalidate auth profile query to refetch user data
        queryClient.invalidateQueries({ queryKey: ['auth', 'profile'] });
      } else {
        message.error(data.message || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Failed to save profile:', error);
      message.error('Failed to save profile. Please try again.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleDefaultProjectChange = async (projectName: string | null) => {
    if (projectName) {
      try {
        await setDefaultProject(projectName);
        message.success(`Default project set to: ${projectName}`);
      } catch (error) {
        console.error('Failed to set default project:', error);
        message.error('Failed to set default project in backend. Local settings updated.');
      }
    } else {
      clearDefaultProject();
      message.info('Default project cleared');
    }
  };

  const handleDarkModeChange = async (checked: boolean) => {
    try {
      setIsDarkMode(checked);

      const response = await fetch(`${apiBaseUrl}/users/preferences`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ theme: checked ? 'dark' : 'light' }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        message.success(`Theme changed to ${checked ? 'dark' : 'light'} mode`);
      } else {
        setIsDarkMode(!checked); // Revert on failure
        message.error(data.message || 'Failed to update theme');
      }
    } catch (error) {
      console.error('Failed to update theme:', error);
      setIsDarkMode(!checked); // Revert on failure
      message.error('Failed to update theme. Please try again.');
    }
  };

  const handlePasswordChange = async (values: any) => {
    setIsSavingPassword(true);
    try {
      const { currentPassword, newPassword, confirmPassword } = values;

      if (newPassword !== confirmPassword) {
        message.error('New passwords do not match');
        setIsSavingPassword(false);
        return;
      }

      const response = await fetch(`${apiBaseUrl}/users/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        message.success('Password changed successfully!');
        setIsPasswordModalVisible(false);
        passwordForm.resetFields();
      } else {
        // Show specific validation errors if available
        if (data.details && Array.isArray(data.details) && data.details.length > 0) {
          const errorList = data.details.join('; ');
          message.error(`Password requirements not met: ${errorList}`, 6);
        } else {
          message.error(data.message || 'Failed to change password');
        }
      }
    } catch (error) {
      console.error('Failed to change password:', error);
      message.error('Failed to change password. Please try again.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleRevokeAllSessions = async () => {
    Modal.confirm({
      title: 'Revoke All Sessions',
      content: 'This will log you out from all devices and sessions. You will need to log in again. Continue?',
      okText: 'Yes, Revoke All',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const response = await fetch(`${apiBaseUrl}/users/revoke-sessions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });

          const data = await response.json();

          if (response.ok && data.success) {
            message.success('All sessions revoked. Logging out...');
            // Clear local storage and redirect to login
            setTimeout(() => {
              localStorage.removeItem('aidis_token');
              window.location.href = '/login';
            }, 1500);
          } else {
            message.error(data.message || 'Failed to revoke sessions');
          }
        } catch (error) {
          console.error('Failed to revoke sessions:', error);
          message.error('Failed to revoke sessions. Please try again.');
        }
      },
    });
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
          darkMode: false,
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

        {/* Application Settings */}
        <Card title={<><SettingOutlined /> Application Preferences</>}>
          <Form.Item
            label="Dark Mode"
            name="darkMode"
            valuePropName="checked"
          >
            <Switch checked={isDarkMode} onChange={handleDarkModeChange} />
          </Form.Item>

          <Text type="secondary">
            Toggle between light and dark theme
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
            <Button type="default" onClick={() => setIsPasswordModalVisible(true)}>
              Change Password
            </Button>
            <Tooltip title="API key management coming soon">
              <Button type="default" disabled>Manage API Keys</Button>
            </Tooltip>
            <Button type="default" danger onClick={handleRevokeAllSessions}>
              Revoke All Sessions
            </Button>
          </Space>
        </Card>

        <Divider />

        {/* Action Buttons */}
        <Space>
          <Button type="primary" htmlType="submit" loading={isSavingProfile}>
            Save Changes
          </Button>
          <Button type="default" onClick={() => form.resetFields()}>
            Reset
          </Button>
        </Space>
      </Form>

      {/* Password Change Modal */}
      <Modal
        title="Change Password"
        open={isPasswordModalVisible}
        onCancel={() => {
          setIsPasswordModalVisible(false);
          passwordForm.resetFields();
        }}
        footer={null}
      >
        <Form
          form={passwordForm}
          layout="vertical"
          onFinish={handlePasswordChange}
        >
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            Password must contain:
            <ul style={{ marginTop: 8, marginBottom: 0 }}>
              <li>At least 8 characters</li>
              <li>One uppercase letter (A-Z)</li>
              <li>One lowercase letter (a-z)</li>
              <li>One number (0-9)</li>
              <li>One special character (!@#$%^&*...)</li>
            </ul>
          </Text>

          <Form.Item
            label="Current Password"
            name="currentPassword"
            rules={[{ required: true, message: 'Please enter your current password' }]}
          >
            <Input.Password placeholder="Enter current password" />
          </Form.Item>

          <Form.Item
            label="New Password"
            name="newPassword"
            rules={[
              { required: true, message: 'Please enter a new password' },
              { min: 8, message: 'Password must be at least 8 characters' },
            ]}
          >
            <Input.Password placeholder="Enter new password" />
          </Form.Item>

          <Form.Item
            label="Confirm New Password"
            name="confirmPassword"
            rules={[
              { required: true, message: 'Please confirm your new password' },
            ]}
          >
            <Input.Password placeholder="Confirm new password" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={isSavingPassword}>
                Change Password
              </Button>
              <Button onClick={() => {
                setIsPasswordModalVisible(false);
                passwordForm.resetFields();
              }}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};

export default Settings;
