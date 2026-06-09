/**
 * React Hook for Session Recovery
 * 
 * Provides session state management, recovery, and reconnection capabilities
 * for React components.
 */

import { useState, useEffect, useCallback } from 'react';
import { sessionRecovery } from '../services/sessionRecovery';
import type { Session } from '../types/session';
import { logger } from '../utils/logger';

interface SessionRecoveryState {
  currentSession: Session | null;
  isConnected: boolean;
  reconnectAttempts: number;
  isLoading: boolean;
  lastSyncTime: number;
}

interface SessionRecoveryActions {
  forceSync: () => Promise<void>;
  reconnect: () => Promise<void>;
  clearSession: () => void;
  updateSession: (session: Session | null) => void;
}

type UseSessionRecoveryReturn = [SessionRecoveryState, SessionRecoveryActions];

export const useSessionRecovery = (): UseSessionRecoveryReturn => {
  const [state, setState] = useState<SessionRecoveryState>({
    currentSession: sessionRecovery.getCurrentSession(),
    isConnected: sessionRecovery.isConnected(),
    reconnectAttempts: sessionRecovery.getReconnectAttempts(),
    isLoading: false,
    lastSyncTime: 0
  });

  const [isInitialized, setIsInitialized] = useState(false);

  // Subscribe to session recovery service updates
  useEffect(() => {
    const unsubscribe = sessionRecovery.subscribe((recoveryState) => {
      setState(prevState => ({
        ...prevState,
        currentSession: recoveryState.currentSession,
        isConnected: recoveryState.isConnected,
        reconnectAttempts: recoveryState.reconnectAttempts,
        lastSyncTime: recoveryState.lastSyncTime
      }));
    });

    // Initial sync
    if (!isInitialized) {
      setIsInitialized(true);
      sessionRecovery.forceSync().catch(logger.error);
    }

    return unsubscribe;
  }, [isInitialized]);

  // Force synchronization with backend
  const forceSync = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      await sessionRecovery.forceSync();
    } catch (error) {
      logger.error('Force sync failed:', error);
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  // Manual reconnection
  const reconnect = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      await sessionRecovery.reconnect();
    } catch (error) {
      logger.error('Reconnect failed:', error);
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  // Clear session data
  const clearSession = useCallback(() => {
    sessionRecovery.clearPersistedData();
  }, []);

  // Update session
  const updateSession = useCallback((session: Session | null) => {
    sessionRecovery.updateSession(session);
  }, []);

  const actions: SessionRecoveryActions = {
    forceSync,
    reconnect,
    clearSession,
    updateSession
  };

  return [state, actions];
};

export default useSessionRecovery;
