/**
 * Session Analytics Utility Functions
 * 
 * Simple wrapper functions for external usage.
 */

import { SessionTracker, SessionStats } from '../../services/sessionTracker.js';
import { SessionAnalyticsHandler } from './analytics/SessionAnalyticsHandler.js';
import { logger } from '../../utils/logger.js';

/**
 * Simple function to get session statistics
 */
export async function getSessionStatistics(projectId?: string): Promise<SessionStats | null> {
  try {
    const result = await SessionAnalyticsHandler.getSessionStats(projectId);
    return result.success ? result.data || null : null;
  } catch (error) {
    logger.error('❌ Failed to get session statistics', error as Error);
    return null;
  }
}

/**
 * Simple function to record session operation
 */
export async function recordSessionOperation(operationType: string, projectId?: string): Promise<boolean> {
  try {
    const result = await SessionAnalyticsHandler.recordOperation(operationType, projectId);
    return result.success;
  } catch (error) {
    logger.error('❌ Failed to record session operation', error as Error);
    return false;
  }
}

/**
 * Simple function to start session tracking
 */
export async function startSessionTracking(projectId?: string): Promise<string | null> {
  try {
    const result = await SessionAnalyticsHandler.startSession(projectId);
    if (result.success) {
      // Legacy global reader: returns the just-started session anywhere.
      const activeSessionId = await SessionTracker.getActiveSession(undefined, { allowGlobalFallback: true });
      return activeSessionId;
    }
    return null;
  } catch (error) {
    logger.error('❌ Failed to start session tracking', error as Error);
    return null;
  }
}
