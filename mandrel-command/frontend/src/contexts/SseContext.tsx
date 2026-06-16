import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from './AuthContext';
import { useProjectContext } from './ProjectContext';
import { startSse, SseHandle } from '../lib/sse';
import { AidisEntity } from '../types/events';
import { logger } from '../utils/logger';
import { isValidUuid } from '../utils/uuid';

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

    // Only filter by projectId when it is a real UUID. A synthetic `aidis-*` id
    // or a corrupt stored id would make the backend SSE route 400 ("Invalid
    // project ID format") and spam "SSE connection error". Omitting it opens an
    // unfiltered stream (still valid) until a real project resolves.
    const safeProjectId = isValidUuid(currentProject?.id) ? currentProject?.id : undefined;

    const handle: SseHandle = startSse({
      token,
      projectId: safeProjectId,
      entities,
      queryClient,
      onConnect: () => setIsConnected(true),
      onDisconnect: () => setIsConnected(false),
      onError: () => setIsConnected(false)
    });

    if (handle.unsupported) {
      setIsSupported(false);
      logger.warn('SSE not supported, falling back to polling');
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
