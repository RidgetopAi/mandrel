#!/usr/bin/env node

/**
 * AIDIS CORE HTTP API SERVER - PURE HTTP SERVICE
 * 
 * This is the entry point for the AIDIS Core HTTP service.
 * The implementation has been modularized into src/server/
 * 
 * Core Features:
 * - HTTP API for all AIDIS tools
 * - Health endpoints (/healthz, /readyz)
 * - Database connectivity with circuit breaker
 * - Process management and graceful shutdown
 */

import { AIDISCoreServer } from './server/index.js';

// Enable debug logging if needed
if (process.env.AIDIS_DEBUG) {
  console.log('🐛 AIDIS Core debug logging enabled:', process.env.AIDIS_DEBUG);
}

// Global shutdown handling
let serverInstance: AIDISCoreServer | null = null;

async function shutdown(signal: string): Promise<void> {
  if (serverInstance) {
    await serverInstance.gracefulShutdown(signal);
  } else {
    console.log(`\n📴 Received ${signal}, no server instance to shut down`);
  }
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      console.log('🚀 Starting AIDIS Core HTTP Service (STDIO-free)');
      
      serverInstance = new AIDISCoreServer();
      await serverInstance.start();
      
    } catch (error) {
      console.error('❌ Unhandled startup error:', error);
      
      if (serverInstance) {
        await serverInstance.gracefulShutdown('STARTUP_ERROR');
      }
      process.exit(1);
    }
  })();
}

export { AIDISCoreServer };
