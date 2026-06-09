/**
 * Session Timeout Service
 * TS004-1: Automatic 2-hour timeout for inactive sessions
 *
 * Runs periodic checks to identify and mark sessions that have been
 * inactive for 2+ hours as 'inactive'. Uses database function for
 * efficient bulk timeout processing.
 */

import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';

export class SessionTimeoutService {
  private static intervalId: NodeJS.Timeout | null = null;
  private static readonly CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly TIMEOUT_THRESHOLD_HOURS = 2;
  private static isRunning = false;

  /**
   * Start the session timeout service
   * Runs checks every 5 minutes to timeout inactive sessions
   */
  static start(): void {
    if (this.isRunning) {
      logger.warn('⚠️  Session timeout service already running');
      return;
    }

    logger.info(`🕐 Starting session timeout service...`);
    logger.info(`   Check interval: ${this.CHECK_INTERVAL_MS / 1000}s`);
    logger.info(`   Timeout threshold: ${this.TIMEOUT_THRESHOLD_HOURS}h`);

    // Run initial check immediately
    this.checkTimeouts().catch(error => {
      logger.error('❌ Initial timeout check failed', error as Error);
    });

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.checkTimeouts().catch(error => {
        logger.error('❌ Periodic timeout check failed', error as Error);
      });
    }, this.CHECK_INTERVAL_MS);

    this.isRunning = true;
    logger.info('✅ Session timeout service started');
  }

  /**
   * Stop the session timeout service
   */
  static stop(): void {
    if (!this.isRunning) {
      logger.warn('⚠️  Session timeout service not running');
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    logger.info('🛑 Session timeout service stopped');
  }

  /**
   * Check for timed-out sessions and mark them as inactive
   * Uses database function for efficient processing
   */
  private static async checkTimeouts(): Promise<void> {
    try {
      const startTime = Date.now();

      // Call database function to timeout sessions
      const result = await db.query(
        `SELECT * FROM timeout_inactive_sessions($1::INTERVAL)`,
        [`${this.TIMEOUT_THRESHOLD_HOURS} hours`]
      );

      const timedOutCount = result.rows.length;
      const duration = Date.now() - startTime;

      if (timedOutCount > 0) {
        logger.info(`⏱️  Timed out ${timedOutCount} inactive session(s) (${duration}ms)`);
        result.rows.forEach((row: any) => {
          logger.info(`   - ${row.session_id.substring(0, 8)}...`);
        });
      } else {
        // Only log every ~6 hours to reduce noise (72 checks = 6 hours at 5min intervals)
        if (this.checkCount++ % 72 === 0) {
          logger.info(`✅ Session timeout check: 0 timeouts (${duration}ms)`);
        }
      }
    } catch (error) {
      logger.error('❌ Failed to check session timeouts', error as Error);
      throw error;
    }
  }

  // Counter for periodic logging
  private static checkCount = 0;

  /**
   * Get service status
   */
  static getStatus(): {
    isRunning: boolean;
    checkIntervalMs: number;
    timeoutThresholdHours: number;
    checksPerformed: number;
  } {
    return {
      isRunning: this.isRunning,
      checkIntervalMs: this.CHECK_INTERVAL_MS,
      timeoutThresholdHours: this.TIMEOUT_THRESHOLD_HOURS,
      checksPerformed: this.checkCount
    };
  }

  /**
   * Manually trigger a timeout check (for testing/debugging)
   */
  static async manualCheck(): Promise<number> {
    logger.info('🔍 Running manual timeout check...');
    const result = await db.query(
      `SELECT * FROM timeout_inactive_sessions($1::INTERVAL)`,
      [`${this.TIMEOUT_THRESHOLD_HOURS} hours`]
    );

    const timedOutCount = result.rows.length;
    logger.info(`   Timed out ${timedOutCount} session(s)`);

    return timedOutCount;
  }

  /**
   * Find sessions that would be timed out (read-only query for monitoring)
   */
  static async findTimedOutSessions(): Promise<Array<{
    session_id: string;
    project_id: string | null;
    agent_type: string;
    started_at: Date;
    last_activity_at: Date;
    inactive_duration: string;
  }>> {
    const result = await db.query(
      `SELECT * FROM find_timed_out_sessions($1::INTERVAL)`,
      [`${this.TIMEOUT_THRESHOLD_HOURS} hours`]
    );

    return result.rows;
  }
}

/**
 * Helper function to start timeout service (for convenience)
 */
export function startSessionTimeoutService(): void {
  SessionTimeoutService.start();
}

/**
 * Helper function to stop timeout service (for convenience)
 */
export function stopSessionTimeoutService(): void {
  SessionTimeoutService.stop();
}