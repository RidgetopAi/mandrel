import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { AuthProvider } from './contexts/AuthContext';
import { ProjectProvider } from './contexts/ProjectContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Contexts from './pages/Contexts';
import Agents from './pages/Agents';
import Tasks from './pages/Tasks';
import Decisions from './pages/Decisions';
import Naming from './pages/Naming';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import SessionDetail from './pages/SessionDetail';
import Settings from './pages/Settings';
import './App.css';

// Ant Design theme configuration
const theme = {
  token: {
    colorPrimary: '#1890ff',
    borderRadius: 8,
    wireframe: false,
  },
  components: {
    Layout: {
      siderBg: '#001529',
      headerBg: '#ffffff',
    },
  },
};

const App: React.FC = () => {
  return (
    <ConfigProvider theme={theme}>
      <Router>
        <AuthProvider>
          <ProjectProvider>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<Login />} />
              
              {/* Protected Routes */}
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                {/* Nested protected routes within the layout */}
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="contexts" element={<Contexts />} />
                <Route path="agents" element={<Agents />} />
                <Route path="tasks" element={<Tasks />} />
                <Route path="decisions" element={<Decisions />} />
                <Route path="naming" element={<Naming />} />
                <Route path="projects" element={<Projects />} />
                <Route path="projects/:id" element={<ProjectDetail />} />
                <Route path="sessions/:id" element={<SessionDetail />} />
                <Route path="settings" element={<Settings />} />
                
                {/* Catch all - redirect to dashboard */}
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Routes>
          </ProjectProvider>
        </AuthProvider>
      </Router>
    </ConfigProvider>
  );
};

export default App;
