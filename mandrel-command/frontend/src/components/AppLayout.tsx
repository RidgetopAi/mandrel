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
  Drawer,
  Grid,
} from 'antd';
import {
  DashboardOutlined,
  DatabaseOutlined,
  ProjectOutlined,
  FolderOutlined,
  BulbOutlined,
  DotChartOutlined,

  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  HistoryOutlined,
  BarChartOutlined,
  RadarChartOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import { useAuthContext } from '../contexts/AuthContext';
import { useProjectContext } from '../contexts/ProjectContext';
import { useTheme } from '../contexts/ThemeContext';
import ProjectSwitcher from './projects/ProjectSwitcher';
import SectionErrorBoundary from './error/SectionErrorBoundary';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const AppLayout: React.FC = () => {
  // Desktop: controls Sider collapse. Mobile: controls overlay Drawer open/close.
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthContext();
  const { currentProject, setCurrentProject } = useProjectContext();
  const { themeMode } = useTheme();

  const screens = useBreakpoint();
  // antd marks `lg` true at >=992px. Treat anything below `lg` as "mobile"
  // (phones + small tablets) where the 260px Sider would eat the screen.
  // On the very first paint `useBreakpoint()` can return {} (no key resolved
  // yet); default that "unknown" state to DESKTOP so wide screens never flash
  // the mobile layout — `isMobile` only becomes true once `lg` resolves false.
  const isMobile = 'lg' in screens && !screens.lg;

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
      key: '/embedding',
      icon: <DotChartOutlined />,
      label: 'Embedding Analytics',
    },
    {
      key: '/projects',
      icon: <FolderOutlined />,
      label: 'Projects',
    },
    {
      key: '/sessions',
      icon: <HistoryOutlined />,
      label: 'Sessions',
    },
    {
      key: '/analytics',
      icon: <BarChartOutlined />,
      label: 'Analytics',
    },
    {
      key: '/surveyor',
      icon: <RadarChartOutlined />,
      label: 'Surveyor',
    },
    {
      key: '/feedback',
      icon: <MessageOutlined />,
      label: 'Feedback',
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
    // On mobile the menu lives in an overlay Drawer — close it after navigating.
    setDrawerOpen(false);
  };

  // Shared navigation menu, rendered inside either the Sider (desktop) or the
  // overlay Drawer (mobile). `dark` in both places to match the Sider theme.
  const navMenu = (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[location.pathname]}
      items={menuItems}
      onClick={handleMenuClick}
      style={{ borderRight: 0, paddingTop: '16px' }}
    />
  );

  const logoBlock = (showText: boolean) => (
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
        {showText && (
          <Title level={4} style={{ color: 'white', margin: 0 }}>
            Mandrel
          </Title>
        )}
      </Space>
    </div>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Sidebar — desktop only. On mobile this is replaced by the overlay
          Drawer below so the 260px rail doesn't eat the phone screen. */}
      {!isMobile && (
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
          {logoBlock(!collapsed)}
          {navMenu}
        </Sider>
      )}

      {/* Mobile navigation — off-canvas overlay Drawer opened by the hamburger.
          Does NOT push/squeeze content (placement left, full-height). */}
      {isMobile && (
        <Drawer
          placement="left"
          closable={false}
          onClose={() => setDrawerOpen(false)}
          open={drawerOpen}
          width={260}
          styles={{ body: { padding: 0, background: '#001529' }, header: { display: 'none' } }}
          className="mobile-nav-drawer"
        >
          {logoBlock(true)}
          {navMenu}
        </Drawer>
      )}

      {/* Main Layout */}
      <Layout>
        {/* Header */}
        <Header
          style={{
            // Tighter horizontal padding on phones so the row doesn't overflow.
            padding: isMobile ? '0 8px' : '0 24px',
            background: themeMode === 'dark' ? '#1f1f1f' : '#fff',
            boxShadow: themeMode === 'dark'
              ? '0 2px 8px rgba(0,0,0,0.45)'
              : '0 2px 8px rgba(0,0,0,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Space size="middle" align="center">
            <Button
              type="text"
              icon={
                isMobile
                  ? <MenuUnfoldOutlined />
                  : (collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />)
              }
              // Mobile: open the overlay Drawer. Desktop: collapse the Sider.
              onClick={() =>
                isMobile ? setDrawerOpen(true) : setCollapsed(!collapsed)
              }
              style={{ fontSize: '16px', width: isMobile ? 44 : 64, height: 64 }}
            />
            <img
              src="/assets/ridgetopai-logo.svg"
              alt="Mandrel"
              style={{ height: '32px', objectFit: 'contain', display: 'block' }}
            />
          </Space>

          <Space split={<Divider type="vertical" />} size={isMobile ? 'small' : 'middle'}>
            <ProjectSwitcher
              currentProject={currentProject?.id}
              onProjectChange={(projectId, project) => setCurrentProject(project)}
              size="middle"
              // On phones the 200px min-width crowds the header; shrink it so the
              // switcher still fits next to the hamburger/logo/avatar (stays usable).
              style={isMobile ? { minWidth: 120, maxWidth: '40vw' } : undefined}
            />

            <Badge dot={false}>
              <Dropdown
                menu={{ items: userMenuItems }}
                placement="bottomRight"
                arrow={{ pointAtCenter: true }}
              >
                <Space style={{ cursor: 'pointer' }}>
                  <Avatar size="small" icon={<UserOutlined />} />
                  {/* Username text hidden on phones; avatar remains the affordance. */}
                  {!isMobile && (
                    <Text>
                      {user?.username || 'User'}
                    </Text>
                  )}
                </Space>
              </Dropdown>
            </Badge>
          </Space>
        </Header>

        {/* Breadcrumb */}
        <div style={{
          padding: '16px 24px 0',
          background: themeMode === 'dark' ? '#141414' : '#f0f2f5',
        }}>
          <Breadcrumb items={getBreadcrumbItems()} />
        </div>

        {/* Content */}
        <Content
          style={{
            margin: '24px',
            padding: '24px',
            background: themeMode === 'dark' ? '#1f1f1f' : '#fff',
            borderRadius: '8px',
            boxShadow: themeMode === 'dark'
              ? '0 2px 8px rgba(0,0,0,0.45)'
              : '0 2px 8px rgba(0,0,0,0.06)',
            minHeight: 'calc(100vh - 180px)',
          }}
        >
          <SectionErrorBoundary section="App Layout">
            <Outlet />
          </SectionErrorBoundary>
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
