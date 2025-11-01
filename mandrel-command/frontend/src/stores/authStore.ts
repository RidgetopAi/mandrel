import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../api/generated/models/User';

interface AuthState {
  // State
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setUser: (user: User, token: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      isAuthenticated: false,
      user: null,
      token: null,
      isLoading: false,
      error: null,

      // Actions
      setUser: (user: User, token: string) => {
        localStorage.setItem('aidis_token', token);
        localStorage.setItem('aidis_user', JSON.stringify(user));
        set({
          user,
          token,
          isAuthenticated: true,
          error: null,
        });
      },

      logout: () => {
        // Clear localStorage first
        localStorage.removeItem('aidis_token');
        localStorage.removeItem('aidis_user');
        
        // Force clear the Zustand persistence cache to prevent corruption
        try {
          localStorage.removeItem('aidis-auth');
        } catch (e) {
          console.warn('Failed to clear Zustand cache:', e);
        }
        
        // Update state
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
        });
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      setError: (error: string | null) => {
        set({ error });
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'aidis-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Helper hook for auth operations
export const useAuth = () => {
  const store = useAuthStore();

  const initialize = (() => {
    let isInitializing = false;

    return () => {
      // Prevent infinite loops during initialization
      if (isInitializing) {
        return;
      }

      isInitializing = true;

      try {
        const token = localStorage.getItem('aidis_token');
        const userStr = localStorage.getItem('aidis_user');

        if (token && userStr) {
          try {
            const user = JSON.parse(userStr);
            store.setUser(user, token);
          } catch (error) {
            console.error('Failed to parse stored user:', error);
            localStorage.removeItem('aidis_token');
            localStorage.removeItem('aidis_user');
          }
        } else {
          // CRITICAL FIX: If no valid token/user data, ensure we're not authenticated
          // This prevents the corrupted state where isAuthenticated=true but no credentials
          if (store.isAuthenticated) {
            console.warn('Detected corrupted auth state - clearing authentication');
            localStorage.removeItem('aidis_token');
            localStorage.removeItem('aidis_user');
            // Don't call store.logout() to avoid infinite loop
          }
        }
      } finally {
        isInitializing = false;
      }
    };
  })();

  return {
    ...store,
    initialize,
  };
};
