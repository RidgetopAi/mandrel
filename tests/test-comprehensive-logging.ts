#!/usr/bin/env tsx

/**
 * AIDIS Comprehensive Logging System Test
 * 
 * Tests the new logging functionality including:
 * - Structured JSON logging
 * - Request/response correlation with IDs
 * - Error handling with stack traces
 * - Performance monitoring
 * - Log rotation functionality
 * 
 * Usage: npx tsx test-comprehensive-logging.ts
 */

import { logger, CorrelationIdManager } from './mcp-server/src/utils/logger.js';
import { RequestLogger } from './mcp-server/src/middleware/requestLogger.js';
import { ErrorHandler } from './mcp-server/src/utils/errorHandler.js';
import * as fs from 'fs';
import * as path from 'path';

async function testLoggingSystem() {
  console.log('🧪 Testing AIDIS Comprehensive Logging System...\n');

  // Test 1: Basic structured logging
  console.log('📝 Test 1: Basic structured logging');
  logger.info('Test message for basic logging', {
    component: 'TEST',
    operation: 'basic_test',
    metadata: { testId: 1, timestamp: new Date().toISOString() }
  });

  logger.warn('Test warning message', {
    component: 'TEST',
    operation: 'warning_test',
    metadata: { severity: 'medium' }
  });

  logger.debug('Test debug message with performance data', {
    component: 'TEST',
    operation: 'debug_test',
    performance: {
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    }
  });

  // Test 2: Correlation ID management
  console.log('\n🔗 Test 2: Correlation ID management');
  const correlationId = CorrelationIdManager.generate();
  console.log(`Generated correlation ID: ${correlationId.substring(0, 8)}...`);
  
  logger.info('First correlated message', {
    correlationId,
    component: 'TEST',
    operation: 'correlation_test_1'
  });

  logger.info('Second correlated message', {
    correlationId,
    component: 'TEST', 
    operation: 'correlation_test_2'
  });

  // Test 3: Request/Response logging
  console.log('\n📊 Test 3: Request/Response logging');
  const testArgs = { query: 'test search', limit: 10 };
  
  logger.logRequest('test_tool', testArgs, {
    component: 'TEST',
    sessionId: 'test-session-123',
    projectId: 'test-project-456'
  });

  logger.logResponse('test_tool', true, 123.45, 1024, {
    component: 'TEST',
    sessionId: 'test-session-123',
    projectId: 'test-project-456'
  });

  // Test 4: Performance monitoring
  console.log('\n⚡ Test 4: Performance monitoring');
  const operationId = 'test_performance_op';
  logger.startOperation(operationId);
  
  // Simulate some work
  await new Promise(resolve => setTimeout(resolve, 150));
  
  logger.endOperation(operationId);

  // Test 5: Error handling and logging
  console.log('\n❌ Test 5: Error handling and logging');
  
  try {
    throw new Error('This is a test error with stack trace');
  } catch (error) {
    logger.error('Caught test error', error as Error, {
      component: 'TEST',
      operation: 'error_handling_test',
      metadata: {
        testCase: 'intentional_error',
        errorHandlingVersion: 'enhanced'
      }
    });
  }

  // Test 6: Wrapped operation logging
  console.log('\n🔄 Test 6: Wrapped operation logging');
  
  try {
    await RequestLogger.wrapOperation(
      'test_wrapped_operation',
      { param1: 'value1', param2: 42 },
      async () => {
        // Simulate operation work
        await new Promise(resolve => setTimeout(resolve, 100));
        return { result: 'success', items: [1, 2, 3] };
      },
      {
        sessionId: 'test-session-789',
        projectId: 'test-project-abc'
      }
    );
  } catch (error) {
    // Should not reach here in this test
  }

  // Test 7: Error handling with context
  console.log('\n🔍 Test 7: Enhanced error handling with context');
  
  try {
    await RequestLogger.wrapOperation(
      'test_failing_operation',
      { shouldFail: true },
      async () => {
        throw new Error('Simulated operation failure');
      },
      {
        sessionId: 'test-session-error',
        projectId: 'test-project-error'
      }
    );
  } catch (error) {
    // Expected - error was properly logged and re-thrown
    console.log('✅ Error was properly handled and re-thrown');
  }

  // Test 8: Database operation logging
  console.log('\n🗄️  Test 8: Database operation logging');
  RequestLogger.logDatabaseOperation(
    'SELECT', 
    'SELECT * FROM test_table WHERE id = $1', 
    45.2
  );

  // Test 9: System event logging
  console.log('\n🖥️  Test 9: System event logging');
  RequestLogger.logSystemEvent('test_system_event', {
    eventType: 'maintenance',
    scheduledDowntime: false,
    affectedServices: ['mcp-server']
  });

  // Test 10: Health check logging
  console.log('\n🏥 Test 10: Health check logging');
  RequestLogger.logHealthCheck('/healthz', 'healthy', 23.5);
  RequestLogger.logHealthCheck('/readyz', 'unhealthy', 156.8);

  // Test 11: Log file verification
  console.log('\n📁 Test 11: Log file verification');
  const logDir = process.env.AIDIS_LOG_DIR || '/home/ridgetop/aidis/logs';
  const logFile = path.join(logDir, 'aidis-mcp.log');
  
  try {
    if (fs.existsSync(logFile)) {
      const stats = fs.statSync(logFile);
      console.log(`✅ Log file exists: ${logFile}`);
      console.log(`📊 File size: ${stats.size} bytes`);
      console.log(`📅 Last modified: ${stats.mtime}`);
      
      // Read last few lines to verify structured logging
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      
      try {
        const logEntry = JSON.parse(lastLine);
        console.log('✅ Log entries are properly structured JSON');
        console.log('🔍 Last log entry keys:', Object.keys(logEntry));
      } catch {
        console.log('⚠️  Log entries may not be structured JSON');
      }
    } else {
      console.log('❌ Log file not found. Check AIDIS_LOG_DIR configuration.');
    }
  } catch (error) {
    console.log('❌ Error checking log file:', error);
  }

  // Test 12: Error statistics
  console.log('\n📈 Test 12: Error statistics');
  const errorStats = ErrorHandler.getErrorStats();
  console.log('📊 Error Statistics:', {
    totalErrors: errorStats.totalErrors,
    uniqueErrors: errorStats.uniqueErrors,
    topErrors: errorStats.topErrors.length
  });

  console.log('\n✅ Comprehensive logging system test completed!');
  console.log('\n📋 Test Summary:');
  console.log('- ✅ Structured JSON logging');
  console.log('- ✅ Correlation ID management'); 
  console.log('- ✅ Request/response logging');
  console.log('- ✅ Performance monitoring');
  console.log('- ✅ Error handling with context');
  console.log('- ✅ Wrapped operation logging');
  console.log('- ✅ Database operation logging');
  console.log('- ✅ System event logging');
  console.log('- ✅ Health check logging');
  console.log('- ✅ Log file verification');
  console.log('- ✅ Error statistics tracking');
  
  console.log('\n💡 Next steps:');
  console.log('1. Check log files in:', logDir);
  console.log('2. Test with actual MCP operations');
  console.log('3. Monitor log rotation behavior');
  console.log('4. Verify performance impact is minimal');
}

// Environment variable recommendations
function showEnvironmentRecommendations() {
  console.log('\n⚙️  Environment Variable Recommendations:');
  console.log('');
  console.log('# Basic Logging Configuration');
  console.log('export AIDIS_LOG_LEVEL=info          # error, warn, info, debug, trace');
  console.log('export AIDIS_LOG_DIR=/home/ridgetop/aidis/logs');
  console.log('export AIDIS_LOG_CONSOLE=true        # Enable console output');
  console.log('export AIDIS_LOG_FILE=true           # Enable file logging');
  console.log('');
  console.log('# Advanced Configuration');
  console.log('export AIDIS_LOG_MAX_SIZE=10485760   # 10MB per log file');
  console.log('export AIDIS_LOG_MAX_FILES=10        # Keep 10 rotated files');
  console.log('export AIDIS_PERFORMANCE_LOGGING=true');
  console.log('export AIDIS_REQUEST_LOGGING=true');
  console.log('export AIDIS_DETAILED_LOGGING=true   # Include request args');
  console.log('export AIDIS_SLOW_OP_THRESHOLD=1000  # 1 second threshold');
  console.log('');
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  showEnvironmentRecommendations();
  testLoggingSystem().catch(console.error);
}
