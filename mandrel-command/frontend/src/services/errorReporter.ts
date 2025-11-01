import type { ErrorInfo } from 'react';
import { reportError as sentryReportError, addBreadcrumb } from '../config/sentry';

export interface ErrorReportContext {
  componentStack?: string;
  section?: string;
  severity?: 'low' | 'medium' | 'high';
  metadata?: Record<string, unknown>;
}

const REPORT_ENDPOINT = process.env.REACT_APP_ERROR_ENDPOINT || '/api/monitoring/errors';

export const reportError = async (
  error: Error,
  info?: ErrorInfo,
  context: ErrorReportContext = {}
): Promise<void> => {
  const payload = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    componentStack: info?.componentStack,
    timestamp: new Date().toISOString(),
    ...context,
  };

  // Always log locally for immediate debugging visibility
  // eslint-disable-next-line no-console
  console.error('AIDIS UI Error Captured', payload);

  // QA Finding #3: Report to Sentry with enhanced context
  try {
    // Add breadcrumb for error context
    addBreadcrumb(
      `Error in ${context.section || 'unknown'} section`,
      'error',
      {
        severity: context.severity,
        componentStack: info?.componentStack,
        ...context.metadata,
      }
    );

    // Report to Sentry with additional context
    sentryReportError(error, {
      section: context.section,
      severity: context.severity,
      componentStack: info?.componentStack,
      ...context.metadata,
    });
  } catch (sentryError) {
    // eslint-disable-next-line no-console
    console.warn('Failed to report error to Sentry:', sentryError);
  }

  if (!REPORT_ENDPOINT) {
    return;
  }

  try {
    const body = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(REPORT_ENDPOINT, blob);
      return;
    }

    await fetch(REPORT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
  } catch (networkError) {
    // eslint-disable-next-line no-console
    console.warn('Failed to report UI error', networkError);
  }
};
