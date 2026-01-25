/**
 * OperationTracker - Domain service for tracking session operations and activities
 */

import { ActivityCountStore } from '../../state/index.js';
import { SessionRepo, ActivityRepo, AnalyticsEventsRepo } from '../../infra/db/index.js';
import { logger } from '../../../../utils/logger.js';

export const OperationTracker = {
  /**
   * Record a general operation
   */
  async recordOperation(sessionId: string, operationType: string): Promise<void> {
    try {
      await AnalyticsEventsRepo.insert('system', operationType, {
        sessionId,
        status: 'completed',
        tags: ['operation', operationType]
      });

      // Update session activity timestamp
      await SessionRepo.touchActivity(sessionId);

      logger.debug(`Operation recorded: ${operationType}`, {
        component: 'OperationTracker',
        operation: 'recordOperation',
        metadata: { sessionId: sessionId.substring(0, 8), operationType }
      });

    } catch (error) {
      logger.error('Failed to record operation', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'OperationTracker',
        operation: 'recordOperation',
        metadata: { sessionId, operationType }
      });
    }
  },

  /**
   * Record task created
   */
  recordTaskCreated(sessionId: string): void {
    ActivityCountStore.incrementTasksCreated(sessionId);

    logger.debug('Task created recorded', {
      component: 'OperationTracker',
      operation: 'recordTaskCreated',
      metadata: { sessionId: sessionId.substring(0, 8) }
    });
  },

  /**
   * Record task updated
   */
  recordTaskUpdated(sessionId: string, isCompleted: boolean = false): void {
    ActivityCountStore.incrementTasksUpdated(sessionId, isCompleted);

    logger.debug('Task updated recorded', {
      component: 'OperationTracker',
      operation: 'recordTaskUpdated',
      metadata: { sessionId: sessionId.substring(0, 8), isCompleted }
    });
  },

  /**
   * Record context created
   */
  recordContextCreated(sessionId: string): void {
    ActivityCountStore.incrementContextsCreated(sessionId);

    logger.debug('Context created recorded', {
      component: 'OperationTracker',
      operation: 'recordContextCreated',
      metadata: { sessionId: sessionId.substring(0, 8) }
    });
  },

  /**
   * Get activity counts for a session
   */
  getActivityCounts(sessionId: string): {
    tasks_created: number;
    tasks_updated: number;
    tasks_completed: number;
    contexts_created: number;
  } {
    return ActivityCountStore.get(sessionId);
  },

  /**
   * Clear activity tracking for a session
   */
  clear(sessionId: string): void {
    ActivityCountStore.clear(sessionId);
  },

  /**
   * Record an activity event
   */
  async recordActivity(
    sessionId: string,
    activityType: string,
    activityData: Record<string, any> = {}
  ): Promise<void> {
    try {
      await ActivityRepo.insert(sessionId, activityType, activityData);
      await SessionRepo.updateActivityCount(sessionId);

      logger.debug(`Activity recorded: ${activityType}`, {
        component: 'OperationTracker',
        operation: 'recordActivity',
        metadata: { sessionId: sessionId.substring(0, 8), activityType }
      });

    } catch (error) {
      logger.error('Failed to record activity', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'OperationTracker',
        operation: 'recordActivity',
        metadata: { sessionId, activityType }
      });
    }
  },

  /**
   * Flush all pending activity counts to database
   */
  async flushToDatabase(): Promise<{
    sessionsFlushed: number;
  }> {
    let sessionsFlushed = 0;

    try {
      const allActivity = ActivityCountStore.getAll();

      for (const [sessionId, counts] of allActivity.entries()) {
        if (counts.tasks_created > 0 || counts.tasks_updated > 0 || counts.contexts_created > 0) {
          await SessionRepo.applyActivityCounts(
            sessionId,
            counts.tasks_created,
            counts.tasks_updated,
            counts.tasks_completed,
            counts.contexts_created
          );
          sessionsFlushed++;
        }
      }

      // Clear flushed data
      ActivityCountStore.clearAll();

      logger.info(`Activity counts flushed to database`, {
        component: 'OperationTracker',
        operation: 'flushToDatabase',
        metadata: { sessionsFlushed }
      });

      return { sessionsFlushed };

    } catch (error) {
      logger.error('Failed to flush activity to database', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'OperationTracker',
        operation: 'flushToDatabase'
      });

      return { sessionsFlushed };
    }
  }
};
