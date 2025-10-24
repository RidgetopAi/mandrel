/**
 * Session Tracking Middleware
 * Automatically records session activities for MCP tool calls
 * Part of MCP → REST migration automation strategy
 */

import { SessionTracker } from '../../services/sessionTracker.js';
import { logger } from '../../utils/logger.js';

/**
 * Session Tracking Middleware
 * Provides helper functions to auto-track activities from MCP tools
 */
export class SessionTrackingMiddleware {
  /**
   * Auto-track context creation
   * Called after context_store MCP tool succeeds
   */
  static async trackContextStored(
    contextId: string,
    contextType: string,
    tags: string[]
  ): Promise<void> {
    try {
      const activeSessionId = await SessionTracker.getActiveSession();
      if (!activeSessionId) {
        logger.debug('No active session - skipping context_stored activity tracking');
        return;
      }

      await SessionTracker.recordActivity(activeSessionId, 'context_stored', {
        context_id: contextId,
        context_type: contextType,
        tags
      });

      logger.debug(`Tracked context_stored activity for session ${activeSessionId}`);
    } catch (error) {
      // Silent fail - don't break main operation
      const err = error as Error;
      logger.warn('Auto-track context_stored failed:', err);
    }
  }

  /**
   * Auto-track task creation
   * Called after task_create MCP tool succeeds
   */
  static async trackTaskCreated(
    taskId: string,
    taskTitle: string,
    taskType: string,
    taskPriority: string
  ): Promise<void> {
    try {
      const activeSessionId = await SessionTracker.getActiveSession();
      if (!activeSessionId) {
        logger.debug('No active session - skipping task_created activity tracking');
        return;
      }

      await SessionTracker.recordActivity(activeSessionId, 'task_created', {
        task_id: taskId,
        task_title: taskTitle,
        task_type: taskType,
        task_priority: taskPriority
      });

      logger.debug(`Tracked task_created activity for session ${activeSessionId}`);
    } catch (error) {
      // Silent fail - don't break main operation
      const err = error as Error;
      logger.warn('Auto-track task_created failed:', err);
    }
  }

  /**
   * Auto-track decision recording
   * Called after decision_record MCP tool succeeds
   */
  static async trackDecisionRecorded(
    decisionId: string,
    decisionType: string,
    impactLevel: string
  ): Promise<void> {
    try {
      const activeSessionId = await SessionTracker.getActiveSession();
      if (!activeSessionId) {
        logger.debug('No active session - skipping decision_recorded activity tracking');
        return;
      }

      await SessionTracker.recordActivity(activeSessionId, 'decision_recorded', {
        decision_id: decisionId,
        decision_type: decisionType,
        impact_level: impactLevel
      });

      logger.debug(`Tracked decision_recorded activity for session ${activeSessionId}`);
    } catch (error) {
      // Silent fail - don't break main operation
      const err = error as Error;
      logger.warn('Auto-track decision_recorded failed:', err);
    }
  }

  /**
   * Auto-track naming registration
   * Called after naming_register MCP tool succeeds
   */
  static async trackNamingRegistered(
    entityType: string,
    canonicalName: string
  ): Promise<void> {
    try {
      const activeSessionId = await SessionTracker.getActiveSession();
      if (!activeSessionId) {
        logger.debug('No active session - skipping naming_registered activity tracking');
        return;
      }

      await SessionTracker.recordActivity(activeSessionId, 'naming_registered', {
        entity_type: entityType,
        canonical_name: canonicalName
      });

      logger.debug(`Tracked naming_registered activity for session ${activeSessionId}`);
    } catch (error) {
      // Silent fail - don't break main operation
      const err = error as Error;
      logger.warn('Auto-track naming_registered failed:', err);
    }
  }

  /**
   * Auto-track file edit
   * Called when file modifications are detected
   * Note: This is for future use - currently using Git tracker for file changes
   */
  static async trackFileEdit(
    filePath: string,
    linesAdded: number,
    linesDeleted: number,
    _source: 'tool' | 'git' | 'manual' = 'tool'
  ): Promise<void> {
    try {
      const activeSessionId = await SessionTracker.getActiveSession();
      if (!activeSessionId) {
        logger.debug('No active session - skipping file_edit activity tracking');
        return;
      }

      // This would call the session file tracking service
      // Implementation depends on SessionManagementHandler.recordFileEdit
      logger.debug(`File edit detected: ${filePath} (+${linesAdded}/-${linesDeleted})`);

    } catch (error) {
      // Silent fail - don't break main operation
      const err = error as Error;
      logger.warn('Auto-track file_edit failed:', err);
    }
  }
}

/**
 * Convenience wrapper functions for backward compatibility
 */
export async function autoTrackActivity(activityType: string, metadata?: any): Promise<void> {
  try {
    const activeSessionId = await SessionTracker.getActiveSession();
    if (activeSessionId) {
      await SessionTracker.recordActivity(activeSessionId, activityType, metadata);
    }
  } catch (error) {
    const err = error as Error;
    logger.warn(`Auto-track activity failed (${activityType}):`, err);
  }
}

export async function autoTrackFileEdit(
  filePath: string,
  linesAdded: number,
  linesDeleted: number,
  source: 'tool' | 'git' | 'manual' = 'tool'
): Promise<void> {
  await SessionTrackingMiddleware.trackFileEdit(filePath, linesAdded, linesDeleted, source);
}
