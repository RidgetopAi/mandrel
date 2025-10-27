/**
 * Background Services Orchestrator
 * Manages lifecycle of all background services
 */

import { logger } from '../utils/logger.js';
import { getQueueManager, shutdownQueue } from './queueManager.js';
import { startGitTracking, stopGitTracking } from './gitTracker.js';

// Check if background services should be skipped (for testing)
const SKIP_BACKGROUND_SERVICES = process.env.AIDIS_SKIP_BACKGROUND === 'true';

/**
 * Background Services Orchestrator
 * Manages lifecycle of all background services
 */
export class BackgroundServices {
  private servicesStarted: boolean = false;

  /**
   * Start all background services
   */
  async startAll(): Promise<void> {
    if (SKIP_BACKGROUND_SERVICES) {
      console.log('🧪 Skipping background services (AIDIS_SKIP_BACKGROUND=true)');
      return;
    }

    logger.info('Starting background services...');

    try {
      // Initialize BullMQ queue system (replaces timer-based polling)
      console.log('🚀 Starting BullMQ queue system...');
      try {
        await getQueueManager();
        console.log('✅ Queue system initialized successfully');
      } catch (error) {
        console.warn('⚠️  Failed to initialize queue system:', error);
        console.warn('   Background services will be disabled');
      }

      // Initialize real-time git tracking (file watching only)
      console.log('⚡ Starting real-time git tracking...');
      try {
        await startGitTracking({
          enableFileWatching: true,
          enablePeriodicPolling: false, // Disabled: polling moved to queue
          pollingIntervalMs: 30000, // Still used by queue system
          correlationDelayMs: 5000   // 5 seconds delay after detection
        });
        console.log('✅ Git tracking initialized successfully');
      } catch (error) {
        console.warn('⚠️  Failed to initialize git tracking:', error);
        console.warn('   Git correlation will be manual only');
      }

      // Initialize session timeout service (2-hour inactivity timeout)
      console.log('⏱️  Starting session timeout service...');
      try {
        const { SessionTimeoutService } = await import('./sessionTimeout.js');
        SessionTimeoutService.start();
        console.log('✅ Session timeout service initialized successfully');
      } catch (error) {
        console.warn('⚠️  Failed to initialize session timeout service:', error);
        console.warn('   Session timeouts will not be automatic');
      }

      // Initialize session data flush service (30-second periodic flush)
      console.log('💾 Starting session data flush service...');
      try {
        const { SessionFlushService } = await import('./sessionFlush.js');
        SessionFlushService.start();
        console.log('✅ Session flush service initialized successfully');
      } catch (error) {
        console.warn('⚠️  Failed to initialize session flush service:', error);
        console.warn('   Session data will only flush on shutdown');
      }

      this.servicesStarted = true;
      logger.info('✅ All background services started');

    } catch (error) {
      logger.error('Error starting background services:', error as Error);
      throw error;
    }
  }

  /**
   * Stop all background services
   */
  async stopAll(): Promise<void> {
    if (SKIP_BACKGROUND_SERVICES || !this.servicesStarted) {
      return;
    }

    logger.info('Stopping background services...');

    try {
      // Stop queue system first (it manages background jobs)
      console.log('🚀 Stopping queue system...');
      try {
        await shutdownQueue();
        console.log('✅ Queue system stopped gracefully');
      } catch (error) {
        console.warn('⚠️  Failed to stop queue system:', error);
      }

      // Stop git tracking
      console.log('⚡ Stopping git tracking...');
      try {
        await stopGitTracking();
        console.log('✅ Git tracking stopped gracefully');
      } catch (error) {
        console.warn('⚠️  Failed to stop git tracking:', error);
      }

      // Stop session timeout service
      console.log('⏱️  Stopping session timeout service...');
      try {
        const { SessionTimeoutService } = await import('./sessionTimeout.js');
        SessionTimeoutService.stop();
        console.log('✅ Session timeout service stopped gracefully');
      } catch (error) {
        console.warn('⚠️  Failed to stop session timeout service:', error);
      }

      // Stop session flush service
      console.log('💾 Stopping session flush service...');
      try {
        const { SessionFlushService } = await import('./sessionFlush.js');
        SessionFlushService.stop();
        console.log('✅ Session flush service stopped gracefully');
      } catch (error) {
        console.warn('⚠️  Failed to stop session flush service:', error);
      }

      this.servicesStarted = false;
      logger.info('✅ All background services stopped');

    } catch (error) {
      logger.error('Error stopping background services:', error as Error);
    }
  }
}

export const backgroundServices = new BackgroundServices();
