/**
 * Basic test to verify logging functionality works
 */

import { logger, securityLogger, dbLogger, requestLogger } from './config/logger';

async function testBasicLogging() {
  console.log('🧪 Testing basic logging functionality...\n');

  // Test all loggers
  logger.info('Application logger test', {
    test: 'basic_logging',
    timestamp: new Date().toISOString()
  });

  logger.warn('Warning message test', {
    level: 'warning',
    event: 'test_warning'
  });

  logger.error('Error message test', {
    level: 'error',
    error: 'Test error message',
    event: 'test_error'
  });

  securityLogger.warn('Security event test', {
    event: 'test_security_event',
    severity: 'medium',
    userAgent: 'Test-Agent/1.0'
  });

  dbLogger.info('Database logger test', {
    event: 'test_db_log',
    query: 'SELECT 1',
    duration: 5
  });

  requestLogger.info('Request logger test', {
    method: 'GET',
    url: '/test',
    statusCode: 200,
    responseTime: 150
  });

  console.log('✅ Basic logging test completed');
  console.log('📁 Check logs directory: /home/ridgetop/aidis/aidis-command/logs/');
  
  // Wait a moment for logs to be written
  await new Promise(resolve => setTimeout(resolve, 100));
}

if (require.main === module) {
  testBasicLogging().catch(console.error);
}

export { testBasicLogging };
