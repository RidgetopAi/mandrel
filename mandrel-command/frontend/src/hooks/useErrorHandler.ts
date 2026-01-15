/**
 * TR002-6: Error Handler Hook for AIDIS API Integration
 * Provides error handling utilities for components using AIDIS V2 API
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { message } from 'antd';
import { mandrelApi } from '../api/mandrelApiClient';
import type { ApiError } from '../api/mandrelApiClient';

export interface ErrorState {
  hasError: boolean;
  error: Error | ApiError | null;
  errorType: 'api' | 'component' | 'network' | 'validation' | 'unknown';
  retryCount: number;
  lastErrorTime: Date | null;
  isRecovering: boolean;
}

export interface ErrorHandlerConfig {
  componentName: string;
  enableAutoRetry?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  showUserMessages?: boolean;
  reportToAidis?: boolean;
}

const DEFAULT_CONFIG: Required<Omit<ErrorHandlerConfig, 'componentName'>> = {
  enableAutoRetry: true,
  maxRetries: 3,
  retryDelay: 1000,
  showUserMessages: true,
  reportToAidis: true,
};

export const useErrorHandler = (config: ErrorHandlerConfig) => {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const [errorState, setErrorState] = useState<ErrorState>({
    hasError: false,
    error: null,
    errorType: 'unknown',
    retryCount: 0,
    lastErrorTime: null,
    isRecovering: false,
  });

  const retryTimeoutRef = useRef<NodeJS.Timeout>();
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  const classifyError = useCallback((error: Error | ApiError): ErrorState['errorType'] => {
    const errorString = error.message.toLowerCase();

    // API-specific errors
    if ('code' in error || errorString.includes('api') || errorString.includes('request')) {
      return 'api';
    }

    // Network errors
    if (errorString.includes('network') || errorString.includes('fetch') || errorString.includes('timeout')) {
      return 'network';
    }

    // Validation errors
    if (errorString.includes('validation') || errorString.includes('schema') || errorString.includes('invalid')) {
      return 'validation';
    }

    // Component errors
    if (errorString.includes('component') || errorString.includes('render') || errorString.includes('hook')) {
      return 'component';
    }

    return 'unknown';
  }, []);

  const reportErrorToAidis = useCallback(async (error: Error | ApiError, errorType: ErrorState['errorType']) => {
    if (!finalConfig.reportToAidis) return;

    try {
      const errorContext = {
        componentName: finalConfig.componentName,
        errorType,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error.message,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        ...(('code' in error) && { errorCode: error.code }),
        ...(('requestId' in error) && { requestId: error.requestId }),
      };

      await mandrelApi.storeContext(
        `Error in ${finalConfig.componentName}: ${error.message}`,
        'error',
        ['ui-error', errorType, finalConfig.componentName.toLowerCase()]
      );

      console.log('✅ Error reported to AIDIS:', errorContext);
    } catch (reportError) {
      console.warn('⚠️ Failed to report error to AIDIS:', reportError);
    }
  }, [finalConfig.componentName, finalConfig.reportToAidis]);

  const handleError = useCallback((error: Error | ApiError, options?: {
    skipRetry?: boolean;
    showMessage?: boolean;
    customMessage?: string;
  }) => {
    if (!mountedRef.current) return;

    const errorType = classifyError(error);
    const now = new Date();

    setErrorState(prev => ({
      hasError: true,
      error,
      errorType,
      retryCount: options?.skipRetry ? prev.retryCount : prev.retryCount + 1,
      lastErrorTime: now,
      isRecovering: false,
    }));

    // Report to AIDIS
    reportErrorToAidis(error, errorType);

    // Show user message
    if (finalConfig.showUserMessages && options?.showMessage !== false) {
      const userMessage = options?.customMessage || getUserFriendlyMessage(error, errorType);
      message.error(userMessage);
    }

    // Auto-retry logic
    if (
      finalConfig.enableAutoRetry &&
      !options?.skipRetry &&
      errorState.retryCount < finalConfig.maxRetries &&
      (errorType === 'api' || errorType === 'network')
    ) {
      scheduleRetry();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classifyError, reportErrorToAidis, finalConfig, errorState.retryCount]); // scheduleRetry excluded to prevent infinite loops

  const getUserFriendlyMessage = (error: Error | ApiError, errorType: ErrorState['errorType']): string => {
    switch (errorType) {
      case 'api':
        return 'API request failed. Please try again.';
      case 'network':
        return 'Connection problem. Please check your internet.';
      case 'validation':
        return 'Invalid data. Please check your input.';
      case 'component':
        return 'Component error. Refreshing may help.';
      default:
        return 'Something went wrong. Please try again.';
    }
  };

  const scheduleRetry = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    setErrorState(prev => ({ ...prev, isRecovering: true }));

    const delay = finalConfig.retryDelay * Math.pow(2, errorState.retryCount);

    retryTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setErrorState(prev => ({ ...prev, isRecovering: false }));
      }
    }, delay);
  }, [finalConfig.retryDelay, errorState.retryCount]);

  const clearError = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    setErrorState({
      hasError: false,
      error: null,
      errorType: 'unknown',
      retryCount: 0,
      lastErrorTime: null,
      isRecovering: false,
    });
  }, []);

  const retryOperation = useCallback(async (operation: () => Promise<any>) => {
    setErrorState(prev => ({ ...prev, isRecovering: true }));

    try {
      const result = await operation();
      clearError();
      if (finalConfig.showUserMessages) {
        message.success('Operation succeeded');
      }
      return result;
    } catch (error) {
      handleError(error as Error | ApiError);
      throw error;
    }
  }, [clearError, handleError, finalConfig.showUserMessages]);

  const withErrorHandling = useCallback(<T extends any[], R>(
    operation: (...args: T) => Promise<R>
  ) => {
    return async (...args: T): Promise<R | undefined> => {
      try {
        const result = await operation(...args);
        // Clear any previous errors on success
        if (errorState.hasError) {
          clearError();
        }
        return result;
      } catch (error) {
        handleError(error as Error | ApiError);
        return undefined;
      }
    };
  }, [clearError, handleError, errorState.hasError]);

  const getErrorMessage = useCallback((): string => {
    if (!errorState.error) return '';

    return `${finalConfig.componentName}: ${errorState.error.message}`;
  }, [errorState.error, finalConfig.componentName]);

  const isRetryable = useCallback((): boolean => {
    return (
      errorState.hasError &&
      errorState.retryCount < finalConfig.maxRetries &&
      (errorState.errorType === 'api' || errorState.errorType === 'network')
    );
  }, [errorState, finalConfig.maxRetries]);

  return {
    // State
    errorState,
    hasError: errorState.hasError,
    error: errorState.error,
    errorType: errorState.errorType,
    isRecovering: errorState.isRecovering,

    // Actions
    handleError,
    clearError,
    retryOperation,
    withErrorHandling,

    // Utilities
    getErrorMessage,
    isRetryable,
    retryCount: errorState.retryCount,
    maxRetries: finalConfig.maxRetries,
  };
};