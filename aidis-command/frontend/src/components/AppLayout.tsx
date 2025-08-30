import React, { useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import {
  Layout,
  Menu,
  Avatar,
  Dropdown,
  Typography,
  Space,
  Button,
  Breadcrumb,
  Badge,
  Divider,
} from 'antd';
import {
  DashboardOutlined,
  DatabaseOutlined,
  TeamOutlined,
  ProjectOutlined,
  FolderOutlined,
  BulbOutlined,
  TagOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { useAuthContext } from '../contexts/AuthContext';
import { useProjectContext } from '../contexts/ProjectContext';
import ProjectSwitcher from './projects/ProjectSwitcher';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthContext();
  const { currentProject, setCurrentProject } = useProjectContext();

  // Navigation menu items
  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
    },
    {
      key: '/contexts',
      icon: <DatabaseOutlined />,
      label: 'Contexts',
    },
    {
      key: '/agents',
      icon: <TeamOutlined />,
      label: 'Agents',
    },
    {
      key: '/tasks',
      icon: <ProjectOutlined />,
      label: 'Tasks',
    },
    {
      key: '/decisions',
      icon: <BulbOutlined />,
      label: 'Decisions',
    },
    {
      key: '/naming',
      icon: <TagOutlined />,
      label: 'Naming Registry',
    },
    {
      key: '/projects',
      icon: <FolderOutlined />,
      label: 'Projects',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: 'Settings',
    },
  ];

  // User dropdown menu
  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Profile',
      onClick: () => navigate('/profile'),
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
      onClick: () => navigate('/settings'),
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      onClick: logout,
    },
  ];

  // Generate breadcrumb items based on current path
  const getBreadcrumbItems = () => {
    const pathSnippets = location.pathname.split('/').filter(i => i);
    
    const breadcrumbItems = [
      {
        title: 'Dashboard',
        href: '/dashboard',
      },
    ];

    // Only add additional breadcrumbs if we're not on the dashboard
    if (pathSnippets.length > 0 && pathSnippets[0] !== 'dashboard') {
      pathSnippets.forEach((snippet, index) => {
        const url = `/${pathSnippets.slice(0, index + 1).join('/')}`;
        const menuItem = menuItems.find(item => item.key === url);
        
        breadcrumbItems.push({
          title: menuItem?.label || snippet.charAt(0).toUpperCase() + snippet.slice(1),
          href: url,
        });
      });
    }

    return breadcrumbItems;
  };

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Sidebar */}
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={260}
        theme="dark"
        style={{
          boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
        }}
      >
        {/* Logo */}
        <div
          style={{
            height: '64px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid #303030',
          }}
        >
          <Space>
            <DatabaseOutlined style={{ color: '#1890ff', fontSize: '24px' }} />
            {!collapsed && (
              <Title level={4} style={{ color: 'white', margin: 0 }}>
                AIDIS
              </Title>
            )}
          </Space>
        </div>

        {/* Navigation Menu */}
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ borderRight: 0, paddingTop: '16px' }}
        />
      </Sider>

      {/* Main Layout */}
      <Layout>
        {/* Header */}
        <Header
          style={{
            padding: '0 24px',
            background: '#fff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Space>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: '16px', width: 64, height: 64 }}
            />
          </Space>

          <Space split={<Divider type="vertical" />}>
            <ProjectSwitcher
              currentProject={currentProject?.id}
              onProjectChange={(projectId, project) => setCurrentProject(project)}
              size="middle"
            />
            
            <Badge dot={false}>
              <Dropdown
                menu={{ items: userMenuItems }}
                placement="bottomRight"
                arrow={{ pointAtCenter: true }}
              >
                <Space style={{ cursor: 'pointer' }}>
                  <Avatar size="small" icon={<UserOutlined />} />
                  <Text>
                    {user?.firstName || user?.username || 'User'}
                  </Text>
                </Space>
              </Dropdown>
            </Badge>
          </Space>
        </Header>

        {/* Breadcrumb */}
        <div style={{ padding: '16px 24px 0' }}>
          <Breadcrumb items={getBreadcrumbItems()} />
        </div>

        {/* Content */}
        <Content
          style={{
            margin: '24px',
            padding: '24px',
            background: '#fff',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            minHeight: 'calc(100vh - 180px)',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
