import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuthenticationService } from '../api/generated/services/AuthenticationService';
import { LoginRequest } from '../api/generated/models/LoginRequest';
import { User } from '../api/generated/models/User';
import { useAuthStore } from '../stores/authStore';
import { logger } from '../utils/logger';

// SINGLE SOURCE OF TRUTH for the auth token: localStorage 'aidis_token', read
// FRESH on every request by the function-based OpenAPI.TOKEN resolver installed
// in api/client.ts (imported at app startup in index.tsx). We deliberately do
// NOT also pin a STATIC token/headers onto the global OpenAPI config here.
//
// THE BUG THIS REMOVES (stale-token logout loop, task 10669bdd):
//   This module used to call setAuthToken() at module-load and on every login,
//   which set `OpenAPI.TOKEN = <captured string>` and
//   `OpenAPI.HEADERS = { Authorization: 'Bearer <captured string>' }`.
//   Those STATIC values raced with — and clobbered — client.ts's fresh
//   function resolver. After a stale token had been captured (e.g. an old
//   value left in localStorage, or login firing while module-load already
//   captured the previous token), some parallel authed calls would send the
//   STALE token (→ 401) while siblings sent the fresh one. A single such 401
//   then tripped the global axios interceptor's force-logout → logout loop.
//
// The fix: writing localStorage is the ONLY thing that updates the token; every
// reader (client.ts resolver, services/api.ts, sessionsClient, etc.) reads that
// same key fresh, so it is impossible for one call to carry a stale token while
// a sibling carries the fresh one.
const setStoredToken = (token: string | null) => {
  if (token) {
    localStorage.setItem('aidis_token', token);
  } else {
    localStorage.removeItem('aidis_token');
  }
};

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
      // Store the fresh token in the single source of truth (localStorage).
      // The function-based OpenAPI.TOKEN resolver (api/client.ts) and every
      // other reader pick it up fresh on their next request — no static copy
      // is pinned onto the OpenAPI config, so no stale token can race.
      setStoredToken(data.token);

      // Update auth store
      useAuthStore.getState().setUser(data.user as User, data.token);
      useAuthStore.setState({ isAuthenticated: true });

      // Invalidate and refetch user profile
      queryClient.invalidateQueries({ queryKey: ['auth', 'profile'] });
      queryClient.setQueryData(['auth', 'profile'], data.user);
    },
    onError: (error: any) => {
      logger.error('Login failed:', error);
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
        logger.error('Logout error:', error);
      }
    },
    onSettled: () => {
      // Always clear local state regardless of server response
      setStoredToken(null);

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
        // The profile check IS an auth-critical call: a 401 here means the
        // stored token is genuinely dead, so clearing auth state is correct.
        // (Contrast with non-critical widget calls — those must NOT force a
        // logout; see services/api.ts response interceptor.)
        if (error.status === 401) {
          setStoredToken(null);
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