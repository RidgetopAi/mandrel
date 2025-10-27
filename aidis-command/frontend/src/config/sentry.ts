/**
 * QA Finding #3: Sentry Integration for Error Reporting
 * Configures Sentry for comprehensive error tracking and performance monitoring
 */

import * as Sentry from '@sentry/react';

// Sentry configuration
export const initSentry = () => {
  // Only initialize Sentry when explicitly enabled with a valid DSN
  // Prevents accidental telemetry to demo DSN
  const shouldInitSentry =
    process.env.NODE_ENV === 'production' &&
    process.env.REACT_APP_SENTRY_ENABLED === 'true' &&
    !!process.env.REACT_APP_SENTRY_DSN;

  if (!shouldInitSentry) {
    console.log('Sentry disabled (not enabled or missing DSN)');
    return;
  }

  Sentry.init({
    // Use environment variable for DSN - REQUIRED
    dsn: process.env.REACT_APP_SENTRY_DSN,

    environment: process.env.NODE_ENV || 'development',

    // Release tracking
    release: process.env.REACT_APP_VERSION || '1.0.0',

    // Performance monitoring sample rate (10% in production)
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Error sampling rate
    sampleRate: 1.0,

    // Enhanced error context
    beforeSend(event, hint) {
      // Add additional context
      event.tags = {
        ...event.tags,
        component: 'frontend',
        framework: 'react',
        build: process.env.REACT_APP_BUILD_NUMBER || 'development',
      };

      // Add user context if available
      const authToken = localStorage.getItem('aidis_token');
      if (authToken) {
        event.user = {
          ...event.user,
          authenticated: true,
        };
      }

      // Filter out known non-critical errors
      if (hint.originalException) {
        const error = hint.originalException as Error;

        // Filter network errors that are handled by React Query
        if (error.message?.includes('fetch') || error.message?.includes('Network')) {
          return null; // Don't send network errors that are handled
        }

        // Filter React Suspense errors (normal React behavior)
        if (error.message?.includes('Suspense')) {
          return null;
        }
      }

      return event;
    },

    // Performance monitoring configuration
    beforeSendTransaction(transaction: any) {
      // Add custom context to transactions
      transaction.setTag('component', 'frontend');
      return transaction;
    },

    // Error filtering
    ignoreErrors: [
      // Browser extensions
      'Non-Error promise rejection captured',
      'ResizeObserver loop limit exceeded',
      'Script error.',
      // Network errors handled by React Query
      'Failed to fetch',
      'NetworkError',
      'Load failed',
      // React development warnings
      'Warning: ',
    ],

    // Privacy settings
    sendDefaultPii: false,

    // Debug mode in development
    debug: process.env.NODE_ENV === 'development',
  });

  // Set user context
  Sentry.setUser({
    id: 'aidis-user',
    username: 'developer',
  });

  console.log('Sentry initialized successfully');
};

// Enhanced error reporting functions
export const reportError = (error: Error, context?: Record<string, any>) => {
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext('additional_info', context);
    }
    scope.setLevel('error');
    Sentry.captureException(error);
  });
};

export const reportMessage = (message: string, level: 'info' | 'warning' | 'error' = 'info') => {
  Sentry.captureMessage(message, level);
};

export const setUserContext = (user: { id?: string; email?: string; username?: string }) => {
  Sentry.setUser(user);
};

export const addBreadcrumb = (message: string, category?: string, data?: Record<string, any>) => {
  Sentry.addBreadcrumb({
    message,
    category: category || 'custom',
    data,
    level: 'info',
  });
};

// Performance monitoring helpers
export const startTransaction = (name: string) => {
  return Sentry.startSpan({
    name,
    op: 'navigation',
  }, () => {
    // Transaction implementation
  });
};

export { Sentry };