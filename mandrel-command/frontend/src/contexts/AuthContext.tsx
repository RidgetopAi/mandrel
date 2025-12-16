import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { message } from 'antd';
import { useLogin, useLogout, useAuthCheck } from '../hooks/useAuth';
import { useAuth } from '../stores/authStore';
import { LoginRequest } from '../api/generated/models/LoginRequest';
import { User } from '../api/generated/models/User';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const navigate = useNavigate();
  const authStore = useAuth();
  const loginMutation = useLogin();
  const logoutMutation = useLogout();
  const { user, isAuthenticated, isLoading: checkingAuth } = useAuthCheck();
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize auth state only once
  useEffect(() => {
    if (!isInitialized) {
      authStore.initialize();
      setIsInitialized(true);
    }
  }, [isInitialized]); // Fixed: Remove authStore dependency to prevent infinite loop

  // Clean up token conflicts only once
  useEffect(() => {
    localStorage.removeItem('auth-token');
  }, []);

  // Memoize callbacks to prevent unnecessary re-renders
  const login = React.useCallback(async (credentials: LoginRequest) => {
    try {
      authStore.clearError();
      await loginMutation.mutateAsync(credentials);

      // Get user info for welcome message
      const userData = loginMutation.data?.user;
      const displayName = userData?.username || 'User';
      message.success(`Welcome back, ${displayName}!`);
    } catch (error: any) {
      const errorMessage = error?.body?.message || error?.message || 'Login failed';
      authStore.setError(errorMessage);
      message.error(errorMessage);
      throw error;
    }
  }, [authStore, loginMutation]);

  const logout = React.useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
      message.info('Logged out successfully');
      // Explicitly navigate to login page after logout
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Logout error:', error);
      // Even if logout fails, clear local state and redirect
      message.info('Logged out successfully');
      navigate('/login', { replace: true });
    }
  }, [logoutMutation, navigate]);

  const clearError = React.useCallback(() => {
    authStore.clearError();
  }, []); // Fixed: Empty dependency array since authStore.clearError is stable

  // Determine loading state
  const isLoading = !isInitialized || checkingAuth || loginMutation.isPending || logoutMutation.isPending;

  // Memoize context value to prevent unnecessary re-renders
  const contextValue: AuthContextType = React.useMemo(() => ({
    user: user as User | null,
    token: authStore.token,
    isAuthenticated,
    isLoading,
    error: authStore.error,
    login,
    logout,
    clearError,
  }), [user, authStore.token, isAuthenticated, isLoading, authStore.error, login, logout, clearError]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};