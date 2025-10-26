import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { globalQueryErrorHandler } from './hooks/useQueryErrorHandler';
import { AuthProvider } from './contexts/AuthContext';
import { ProjectProvider } from './contexts/ProjectContext';
import { FeatureFlagProvider } from './contexts/FeatureFlagContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';
import GlobalErrorBoundary from './components/error/GlobalErrorBoundary';
import SectionErrorBoundary from './components/error/SectionErrorBoundary';
import AidisApiErrorBoundary from './components/error/AidisApiErrorBoundary';
import LoadingState from './components/common/LoadingState';
import './App.css';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Contexts = lazy(() => import('./pages/Contexts'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Decisions = lazy(() => import('./pages/Decisions'));
const Embedding = lazy(() => import('./pages/Embedding'));
const Projects = lazy(() => import('./pages/Projects'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const Sessions = lazy(() => import('./pages/Sessions'));
const SessionDetail = lazy(() => import('./pages/SessionDetail'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Settings = lazy(() => import('./pages/Settings'));

// React Query client configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes (formerly cacheTime)
      retry: (failureCount, error: any) => {
        // Don't retry on 4xx errors (client errors)
        if (error?.status >= 400 && error?.status < 500) {
          return false;
        }
        // Retry up to 3 times for other errors
        return failureCount < 3;
      },
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false, // Don't retry mutations by default
      onError: globalQueryErrorHandler,
    },
  },
});

// Inner App component that uses the theme
const AppContent: React.FC = () => {
  const { antdThemeConfig } = useTheme();

  return (
    <ConfigProvider theme={antdThemeConfig}>
      <QueryClientProvider client={queryClient}>
        <GlobalErrorBoundary>
          <Router>
            <AuthProvider>
              <FeatureFlagProvider>
              <AidisApiErrorBoundary
                componentName="ProjectProvider"
                enableAutoRetry={true}
                maxRetries={3}
              >
                <ProjectProvider>
                  <Suspense fallback={<LoadingState fullscreen message="Preparing AIDIS interface…" /> }>
                    <Routes>
                    {/* Public Routes */}
                    <Route path="/login" element={<SectionErrorBoundary section="Login"><Login /></SectionErrorBoundary>} />

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
                      <Route path="dashboard" element={<SectionErrorBoundary section="Dashboard"><Dashboard /></SectionErrorBoundary>} />
                      <Route path="contexts" element={<SectionErrorBoundary section="Contexts"><Contexts /></SectionErrorBoundary>} />
                      <Route path="tasks" element={<SectionErrorBoundary section="Tasks"><Tasks /></SectionErrorBoundary>} />
                      <Route path="decisions" element={<SectionErrorBoundary section="Decisions"><Decisions /></SectionErrorBoundary>} />
                      <Route path="embedding" element={<SectionErrorBoundary section="Embedding"><Embedding /></SectionErrorBoundary>} />
                      <Route path="projects" element={<SectionErrorBoundary section="Projects"><Projects /></SectionErrorBoundary>} />
                      <Route path="projects/:id" element={<SectionErrorBoundary section="Project Detail"><ProjectDetail /></SectionErrorBoundary>} />
                      <Route path="sessions" element={<SectionErrorBoundary section="Sessions"><Sessions /></SectionErrorBoundary>} />
                      <Route path="sessions/:id" element={<SectionErrorBoundary section="Session Detail"><SessionDetail /></SectionErrorBoundary>} />
                      <Route path="analytics" element={<SectionErrorBoundary section="Analytics"><Analytics /></SectionErrorBoundary>} />
                      <Route path="settings" element={<SectionErrorBoundary section="Settings"><Settings /></SectionErrorBoundary>} />

                      {/* Catch all - redirect to dashboard */}
                      <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Route>
                    </Routes>
                  </Suspense>
                </ProjectProvider>
              </AidisApiErrorBoundary>
            </FeatureFlagProvider>
          </AuthProvider>
        </Router>
        <ReactQueryDevtools initialIsOpen={false} />
      </GlobalErrorBoundary>
      </QueryClientProvider>
    </ConfigProvider>
  );
};

// Main App component with ThemeProvider
const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
};

export default App;
