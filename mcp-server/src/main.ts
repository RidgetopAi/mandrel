#!/usr/bin/env node

/**
 * AIDIS MCP Server - Main Entry Point
 *
 * This is the entry point for the AIDIS MCP server.
 * The server implementation is in ./server/MandrelMcpServer.ts
 */

import MandrelMcpServer from './server/MandrelMcpServer.js';
import { logger } from './utils/logger.js';
import { processLock } from './utils/processLock.js';
import { ensureFeatureFlags } from './utils/featureFlags.js';

/**
 * Global shutdown handling
 */
let serverInstance: MandrelMcpServer | null = null;

async function shutdown(signal: string): Promise<void> {
  if (serverInstance) {
    await serverInstance.gracefulShutdown(signal);
  } else {
    console.log(`\n📴 Received ${signal}, no server instance to shut down`);
  }
  process.exit(0);
}

/**
 * Main entry point
 */
async function main() {
  try {
    logger.info('AIDIS MCP Server - Starting...');

    // ORACLE FIX #1: Enforce process singleton (CRITICAL)
    try {
      processLock.acquire();
      logger.info('Process singleton acquired successfully', {
        component: 'STARTUP',
        operation: 'singleton_lock'
      });
    } catch (error) {
      logger.error('Cannot start: Another AIDIS instance is already running', error as Error, {
        component: 'STARTUP',
        operation: 'singleton_lock_failed'
      });
      process.exit(1);
    }

    // Ensure feature flags are initialized
    await ensureFeatureFlags();

    // Create and start server
    serverInstance = new MandrelMcpServer();
    await serverInstance.start();

    logger.info('AIDIS MCP Server - Running');

  } catch (error) {
    console.error('❌ FATAL ERROR:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    logger.error('Fatal error starting AIDIS MCP Server:', error as Error);

    // Attempt graceful cleanup even on startup failure
    if (serverInstance) {
      await serverInstance.gracefulShutdown('STARTUP_ERROR');
    }

    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Start the server
main().catch((error) => {
  console.error('Unhandled error in main():', error);
  process.exit(1);
});