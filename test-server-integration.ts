#!/usr/bin/env tsx

/**
 * Test AIDIS Server Integration with Logging
 * 
 * Tests the server logging integration without starting the full server
 */

import { logger, CorrelationIdManager } from './mcp-server/src/utils/logger.js';
import { RequestLogger } from './mcp-server/src/middleware/requestLogger.js';
import { ErrorHandler } from './mcp-server/src/utils/errorHandler.js';

// Import validation middleware to test the integration path
import { validationMiddleware } from './mcp-server/src/middleware/validation.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

async function testServerIntegration() {
  console.log('🧪 Testing AIDIS Server Integration with Logging...\n');

  // Test 1: Simulate the MCP tool execution path
  console.log('📝 Test 1: Simulating MCP tool execution path');
  
  const toolName = 'aidis_ping';
  const args = { message: 'Test integration message' };
  const correlationId = CorrelationIdManager.generate();
  
  try {
    const result = await RequestLogger.wrapOperation(
      toolName,
      args,
      async () => {
        // Simulate validation middleware
        const validation = validationMiddleware(toolName, args);
        if (!validation.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Input validation failed: ${validation.error}`
          );
        }
        
        // Simulate tool operation
        logger.debug('Executing tool operation', {
          component: 'MCP_TOOL',
          operation: toolName,
          correlationId,
          metadata: { args: validation.data }
        });
        
        // Simulate some processing time
        await new Promise(resolve => setTimeout(resolve, 50));
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ ${toolName} executed successfully: ${args.message}`
            }
          ]
        };
      },
      {
        correlationId,
        sessionId: 'integration-test-session',
        projectId: 'integration-test-project'
      }
    );

    console.log('✅ Tool execution completed:', result?.content?.[0]?.text);
    
  } catch (error) {
    console.error('❌ Tool execution failed:', error);
  }

  // Test 2: Simulate error handling in MCP context
  console.log('\n📝 Test 2: Simulating MCP error handling');
  
  try {
    await RequestLogger.wrapOperation(
      'test_failing_tool',
      { shouldFail: true },
      async () => {
        throw new McpError(ErrorCode.InternalError, 'Simulated MCP error for testing');
      },
      {
        sessionId: 'error-test-session',
        projectId: 'error-test-project'
      }
    );
  } catch (error) {
    console.log('✅ MCP error was properly handled and logged');
  }

  // Test 3: Simulate database operation logging
  console.log('\n📝 Test 3: Simulating database operation logging');
  
  RequestLogger.logDatabaseOperation(
    'SELECT',
    'SELECT * FROM contexts WHERE project_id = $1 AND session_id = $2',
    45.2
  );

  RequestLogger.logDatabaseOperation(
    'INSERT',
    'INSERT INTO analytics_events (actor, event_type, payload) VALUES ($1, $2, $3)',
    undefined,
    new Error('Connection timeout')
  );

  // Test 4: Simulate system startup logging
  console.log('\n📝 Test 4: Simulating system startup logging');
  
  RequestLogger.logSystemEvent('database_connection_established', {
    host: 'localhost',
    port: 5432,
    database: 'aidis_production',
    connectionTime: 123.45
  });

  RequestLogger.logSystemEvent('circuit_breaker_state_change', {
    previousState: 'closed',
    newState: 'half-open',
    reason: 'failure_threshold_reached'
  });

  // Test 5: Performance monitoring simulation
  console.log('\n📝 Test 5: Simulating performance monitoring');
  
  const operationId = 'complex_search_operation';
  logger.startOperation(operationId);
  
  // Simulate complex operation
  await new Promise(resolve => setTimeout(resolve, 200));
  
  logger.endOperation(operationId);

  // Test 6: Health check simulation
  console.log('\n📝 Test 6: Simulating health check logging');
  
  RequestLogger.logHealthCheck('/healthz', 'healthy', 12.3);
  RequestLogger.logHealthCheck('/readyz', 'unhealthy', 89.7);

  // Test 7: Error pattern detection
  console.log('\n📝 Test 7: Testing error pattern detection');
  
  // Generate multiple similar errors to test pattern detection
  for (let i = 0; i < 3; i++) {
    try {
      throw new Error('Repeated database connection error');
    } catch (error) {
      ErrorHandler.handleError(error as Error, {
        component: 'DATABASE',
        operation: 'connection_retry',
        additionalContext: {
          attempt: i + 1,
          connectionPool: 'primary'
        }
      });
    }
  }

  // Get error statistics
  const errorStats = ErrorHandler.getErrorStats();
  console.log('📊 Error Statistics:', errorStats);

  console.log('\n✅ Server integration test completed!');
  
  // Show recent log entries
  console.log('\n📋 Recent log entries (last 5 lines):');
  
  setTimeout(() => {
    try {
      const fs = require('fs');
      const logFile = '/home/ridgetop/aidis/logs/aidis-mcp.log';
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.trim().split('\n');
      const recentLines = lines.slice(-5);
      
      recentLines.forEach((line, index) => {
        try {
          const logEntry = JSON.parse(line);
          console.log(`${index + 1}. [${logEntry.level.toUpperCase()}] ${logEntry.component}::${logEntry.operation} - ${logEntry.message}`);
        } catch {
          console.log(`${index + 1}. ${line.substring(0, 100)}...`);
        }
      });
    } catch (error) {
      console.log('Could not read recent log entries:', error);
    }
    
    console.log('\n💡 Integration test complete. Check logs at: /home/ridgetop/aidis/logs/aidis-mcp.log');
  }, 100);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  testServerIntegration().catch(console.error);
}
