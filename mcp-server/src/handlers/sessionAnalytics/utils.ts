/**
 * Session Analytics Utility Functions
 * 
 * Simple wrapper functions for external usage.
 */

import { SessionTracker, SessionStats } from '../../services/sessionTracker.js';
import { SessionAnalyticsHandler } from './analytics/SessionAnalyticsHandler.js';

/**
 * Simple function to get session statistics
 */
export async function getSessionStatistics(projectId?: string): Promise<SessionStats | null> {
  try {
    const result = await SessionAnalyticsHandler.getSessionStats(projectId);
    return result.success ? result.data || null : null;
  } catch (error) {
    console.error('❌ Failed to get session statistics:', error);
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
    console.error('❌ Failed to record session operation:', error);
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
      const activeSessionId = await SessionTracker.getActiveSession();
      return activeSessionId;
    }
    return null;
  } catch (error) {
    console.error('❌ Failed to start session tracking:', error);
    return null;
  }
}
