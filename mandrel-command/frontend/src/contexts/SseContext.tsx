import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from './AuthContext';
import { useProjectContext } from './ProjectContext';
import { startSse, SseHandle } from '../lib/sse';
import { AidisEntity } from '../types/events';

interface SseContextValue {
  isConnected: boolean;
  isSupported: boolean;
}

const SseContext = createContext<SseContextValue>({
  isConnected: false,
  isSupported: true
});

export const useSseContext = () => useContext(SseContext);

export const SseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuthContext();
  const { currentProject } = useProjectContext();
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    if (!token) {
      setIsConnected(false);
      return;
    }

    // Subscribe to all entity types
    const entities: AidisEntity[] = ['contexts', 'tasks', 'decisions', 'projects', 'sessions'];

    const handle: SseHandle = startSse({
      token,
      projectId: currentProject?.id,
      entities,
      queryClient,
      onConnect: () => setIsConnected(true),
      onDisconnect: () => setIsConnected(false),
      onError: () => setIsConnected(false)
    });

    if (handle.unsupported) {
      setIsSupported(false);
      console.warn('SSE not supported, falling back to polling');
      // TODO: Enable React Query polling as fallback
    }

    return () => {
      handle.stop?.();
    };
  }, [token, currentProject?.id, queryClient]);

  return (
    <SseContext.Provider value={{ isConnected, isSupported }}>
      {children}
    </SseContext.Provider>
  );
};
