/**
 * Session Data Flush Service
 * Periodically flushes in-memory session data (tokens, activities) to database
 * Ensures data persistence even if server crashes
 */

import { SessionTracker } from './sessionTracker.js';
import { logger } from '../utils/logger.js';

const FLUSH_INTERVAL_MS = 30000; // 30 seconds

export class SessionFlushService {
  private static flushTimer: NodeJS.Timeout | null = null;
  private static isRunning: boolean = false;

  /**
   * Start the periodic flush service
   */
  static start(): void {
    if (this.isRunning) {
      logger.warn('Session flush service already running');
      return;
    }

    logger.info('Starting session data flush service', {
      component: 'SessionFlushService',
      operation: 'start',
      metadata: {
        intervalMs: FLUSH_INTERVAL_MS
      }
    });

    // Start periodic flush
    this.flushTimer = setInterval(async () => {
      try {
        await this.performFlush();
      } catch (error) {
        logger.error('Error during periodic flush', error instanceof Error ? error : new Error('Unknown error'), {
          component: 'SessionFlushService',
          operation: 'periodicFlush'
        });
      }
    }, FLUSH_INTERVAL_MS);

    this.isRunning = true;

    logger.info('Session flush service started', {
      component: 'SessionFlushService',
      operation: 'started'
    });
  }

  /**
   * Stop the periodic flush service
   */
  static stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping session flush service', {
      component: 'SessionFlushService',
      operation: 'stop'
    });

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    this.isRunning = false;

    logger.info('Session flush service stopped', {
      component: 'SessionFlushService',
      operation: 'stopped'
    });
  }

  /**
   * Perform the flush operation
   * Private method called by the timer
   */
  private static async performFlush(): Promise<void> {
    logger.debug('Performing periodic session data flush', {
      component: 'SessionFlushService',
      operation: 'performFlush'
    });

    // Flush tokens to database
    await SessionTracker.flushTokensToDatabase();

    // Flush activity counts to database
    await SessionTracker.flushActivityToDatabase();

    logger.debug('Periodic flush completed', {
      component: 'SessionFlushService',
      operation: 'performFlush'
    });
  }

  /**
   * Get service status
   */
  static getStatus(): { isRunning: boolean; intervalMs: number } {
    return {
      isRunning: this.isRunning,
      intervalMs: FLUSH_INTERVAL_MS
    };
  }
}
