/**
 * TR001-6: AIDIS V2 API Status Hook
 * Monitors AIDIS V2 API health and provides real-time status
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { mandrelApi } from '../api/mandrelApiClient';

export interface AidisV2Status {
  status: 'connected' | 'connecting' | 'error' | 'unknown';
  health?: {
    status: string;
    version: string;
    toolsAvailable: number;
  };
  error?: string;
  lastCheck?: Date;
  responseTime?: number;
}

const useMandrelV2Status = (
  pollInterval: number = 30000, // 30 seconds
  enabled: boolean = true
) => {
  const [status, setStatus] = useState<AidisV2Status>({
    status: 'unknown'
  });
  const [isChecking, setIsChecking] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout>();
  const mountedRef = useRef(true);

  const checkHealth = useCallback(async () => {
    if (!enabled || !mountedRef.current) return;

    setIsChecking(true);
    const startTime = Date.now();

    try {
      setStatus(prev => ({ ...prev, status: 'connecting' }));

      const health = await mandrelApi.getHealth();
      const responseTime = Date.now() - startTime;

      if (mountedRef.current) {
        setStatus({
          status: 'connected',
          health,
          lastCheck: new Date(),
          responseTime,
          error: undefined
        });
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;

      if (mountedRef.current) {
        setStatus({
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          lastCheck: new Date(),
          responseTime,
          health: undefined
        });
      }
    } finally {
      if (mountedRef.current) {
        setIsChecking(false);
      }
    }
  }, [enabled]);

  const forceCheck = useCallback(() => {
    checkHealth();
  }, [checkHealth]);

  // Initial check and polling setup
  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
      return;
    }

    // Initial check
    checkHealth();

    // Set up polling
    if (pollInterval > 0) {
      intervalRef.current = setInterval(checkHealth, pollInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
    };
  }, [enabled, pollInterval, checkHealth]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    status,
    isChecking,
    forceCheck,
    checkHealth
  };
};