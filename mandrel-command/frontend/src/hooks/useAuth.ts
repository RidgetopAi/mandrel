import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuthenticationService } from '../api/generated/services/AuthenticationService';
import { LoginRequest } from '../api/generated/models/LoginRequest';
import { User } from '../api/generated/models/User';
import { useAuthStore } from '../stores/authStore';
import { OpenAPI } from '../api/generated/core/OpenAPI';

// Configure OpenAPI base settings
if (process.env.REACT_APP_API_URL) {
  OpenAPI.BASE = process.env.REACT_APP_API_URL;
}

// Helper to set auth token in OpenAPI client
const setAuthToken = (token: string | null) => {
  if (token) {
    OpenAPI.TOKEN = token;
    // Set headers using a simple object
    OpenAPI.HEADERS = {
      Authorization: `Bearer ${token}`,
    };
  } else {
    OpenAPI.TOKEN = undefined;
    OpenAPI.HEADERS = undefined;
  }
};

// Initialize token from localStorage if exists (use consistent key)
const storedToken = localStorage.getItem('aidis_token');
if (storedToken) {
  setAuthToken(storedToken);
}

export const useLogin = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (credentials: LoginRequest) => {
      const response = await AuthenticationService.postAuthLogin({
        requestBody: credentials,
      });
      return response;
    },
    onSuccess: (data) => {
      // Store token and user (use consistent key)
      localStorage.setItem('aidis_token', data.token);
      setAuthToken(data.token);

      // Update auth store
      useAuthStore.getState().setUser(data.user as User, data.token);
      useAuthStore.setState({ isAuthenticated: true });

      // Invalidate and refetch user profile
      queryClient.invalidateQueries({ queryKey: ['auth', 'profile'] });
      queryClient.setQueryData(['auth', 'profile'], data.user);
    },
    onError: (error: any) => {
      console.error('Login failed:', error);
      useAuthStore.getState().setError(error.body?.message || 'Login failed');
    },
  });
};

export const useLogout = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      try {
        await AuthenticationService.postAuthLogout();
      } catch (error) {
        // Even if logout fails on server, clear local state
        console.error('Logout error:', error);
      }
    },
    onSettled: () => {
      // Always clear local state regardless of server response
      localStorage.removeItem('aidis_token');
      setAuthToken(null);

      // Clear auth store
      useAuthStore.getState().logout();

      // Clear all queries
      queryClient.clear();
    },
  });
};

// Hook to check and verify authentication on app start
export const useAuthCheck = () => {
  // Use a ref to track token state without causing re-renders
  const [tokenState, setTokenState] = React.useState(() => !!localStorage.getItem('aidis_token'));

  // Update token state when it might have changed
  React.useEffect(() => {
    const checkToken = () => {
      const hasToken = !!localStorage.getItem('aidis_token');
      if (hasToken !== tokenState) {
        setTokenState(hasToken);
      }
    };

    // Check on mount and when storage might change
    checkToken();

    // Listen for storage changes (from other tabs)
    window.addEventListener('storage', checkToken);
    return () => window.removeEventListener('storage', checkToken);
  }, [tokenState]);

  const isEnabled = React.useMemo(() => tokenState, [tokenState]);

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['auth', 'profile'],
    queryFn: async () => {
      try {
        const response = await AuthenticationService.getAuthProfile();

        // Handle the nested response structure
        if (response.data?.user) {
          return response.data.user;
        }

        throw new Error('Invalid profile response');
      } catch (error: any) {
        // If unauthorized, clear auth state
        if (error.status === 401) {
          localStorage.removeItem('aidis_token');
          setAuthToken(null);
          useAuthStore.getState().logout();
        }
        throw error;
      }
    },
    enabled: isEnabled,
    retry: (failureCount, error: any) => {
      // Don't retry on 401 errors
      if (error.status === 401) {
        return false;
      }
      return failureCount < 2;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false, // Prevent unnecessary refetches
    refetchOnReconnect: false,
  });

  return {
    user: profile,
    isAuthenticated: !!profile && !error,
    isLoading,
    error,
  };
};