/**
 * TokenTracker - Domain service for token usage tracking
 */

import { TokenStore } from '../../state/index.js';
import { SessionRepo } from '../../infra/db/index.js';
import { logger } from '../../../../utils/logger.js';

export const TokenTracker = {
  /**
   * Record token usage for a session
   */
  record(sessionId: string, inputTokens: number, outputTokens: number): void {
    TokenStore.record(sessionId, inputTokens, outputTokens);

    logger.debug(`Token usage recorded`, {
      component: 'TokenTracker',
      operation: 'record',
      metadata: {
        sessionId: sessionId.substring(0, 8),
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens
      }
    });
  },

  /**
   * Get token usage for a session
   */
  get(sessionId: string): { input: number; output: number; total: number } {
    return TokenStore.get(sessionId);
  },

  /**
   * Clear token tracking for a session
   */
  clear(sessionId: string): void {
    TokenStore.clear(sessionId);
  },

  /**
   * Flush all pending token usage to database
   */
  async flushToDatabase(): Promise<{
    sessionsFlushed: number;
    totalTokensFlushed: number;
  }> {
    let sessionsFlushed = 0;
    let totalTokensFlushed = 0;

    try {
      const allTokens = TokenStore.getAll();

      for (const [sessionId, usage] of allTokens.entries()) {
        if (usage.total > 0) {
          await SessionRepo.addTokens(sessionId, usage.input, usage.output, usage.total);
          totalTokensFlushed += usage.total;
          sessionsFlushed++;
        }
      }

      // Clear flushed data
      TokenStore.clearAll();

      logger.info(`Token usage flushed to database`, {
        component: 'TokenTracker',
        operation: 'flushToDatabase',
        metadata: { sessionsFlushed, totalTokensFlushed }
      });

      return { sessionsFlushed, totalTokensFlushed };

    } catch (error) {
      logger.error('Failed to flush tokens to database', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'TokenTracker',
        operation: 'flushToDatabase'
      });

      return { sessionsFlushed, totalTokensFlushed };
    }
  }
};
