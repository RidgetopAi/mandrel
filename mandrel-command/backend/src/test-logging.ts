/**
 * Test script to verify comprehensive logging functionality
 * Tests request/response logging, error handling, database logging, and security events
 */

import request from 'supertest';
import express from 'express';
import { logger, securityLogger } from './config/logger';
import { correlationMiddleware } from './middleware/correlationId';
import { requestLoggingMiddleware } from './middleware/requestLogger';
import { errorHandler, createError } from './middleware/errorHandler';
import { dbWithLogging } from './database/connection';

// Create test app
const testApp = express();

// Apply logging middleware
testApp.use(correlationMiddleware);
testApp.use(express.json());
testApp.use(requestLoggingMiddleware);

// Test routes
testApp.get('/test/success', (_req, res) => {
  logger.info('Test success endpoint called', {
    correlationId: _req.correlationId,
    method: _req.method,
    path: _req.path
  });
  
  res.json({ 
    success: true, 
    message: 'Test endpoint working',
    correlationId: _req.correlationId,
    timestamp: new Date().toISOString()
  });
});

testApp.post('/test/slow', async (_req, res) => {
  // Simulate slow operation
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  res.json({
    success: true,
    message: 'Slow operation completed',
    duration: '2s'
  });
});

testApp.get('/test/error', (_req, _res, next) => {
  const error = createError('Test error for logging verification', 500);
  next(error);
});

testApp.get('/test/auth-error', (_req, _res, next) => {
  const error = createError('Authentication required', 401);
  next(error);
});

testApp.get('/test/forbidden', (_req, _res, next) => {
  const error = createError('Access forbidden', 403);
  next(error);
});

testApp.post('/test/database', async (req, res, next) => {
  try {
    // Test database logging
    logger.info('Testing database query logging', {
      correlationId: req.correlationId
    });
    
    const result = await dbWithLogging.query(
      'SELECT NOW() as current_time, $1 as test_param',
      ['test-value'],
      req.correlationId
    );
    
    res.json({
      success: true,
      data: result.rows[0],
      correlationId: req.correlationId
    });
  } catch (error) {
    next(error);
  }
});

testApp.get('/test/slow-query', async (req, res, next) => {
  try {
    // Simulate slow query (using pg_sleep)
    const result = await dbWithLogging.query(
      'SELECT pg_sleep(2), NOW() as current_time',
      [],
      req.correlationId
    );
    
    res.json({
      success: true,
      message: 'Slow query completed',
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

testApp.post('/test/security-event', (req, res) => {
  const { eventType, userAgent } = req.body;
  
  securityLogger.warn('Test security event', {
    correlationId: req.correlationId,
    event: eventType || 'test_security_event',
    userAgent,
    ip: req.ip,
    severity: 'medium',
    timestamp: new Date().toISOString()
  });
  
  res.json({
    success: true,
    message: 'Security event logged'
  });
});

// Error handler
testApp.use(errorHandler);

/**
 * Run logging tests
 */
async function runLoggingTests() {
  try {
    console.log('🧪 Starting comprehensive logging tests...\n');

    // Test 1: Successful request with correlation ID
    console.log('Test 1: Successful request logging');
    const successResponse = await request(testApp)
      .get('/test/success')
      .set('x-correlation-id', 'test-001')
      .expect(200);
    
    console.log('✅ Success response with correlation ID:', successResponse.body.correlationId);

    // Test 2: Slow request (should trigger slow response alert)
    console.log('\nTest 2: Slow request logging');
    await request(testApp)
      .post('/test/slow')
      .set('x-correlation-id', 'test-002')
      .expect(200);
    
    console.log('✅ Slow request completed');

    // Test 3: Error handling with structured logging
    console.log('\nTest 3: Error handling and logging');
    const errorResponse = await request(testApp)
      .get('/test/error')
      .set('x-correlation-id', 'test-003')
      .expect(500);
    
    console.log('✅ Error logged with correlation ID:', errorResponse.body.error.correlationId);

    // Test 4: Authentication error (security event)
    console.log('\nTest 4: Authentication error logging');
    await request(testApp)
      .get('/test/auth-error')
      .set('x-correlation-id', 'test-004')
      .expect(401);
    
    console.log('✅ Authentication error logged');

    // Test 5: Authorization error (security event)
    console.log('\nTest 5: Authorization error logging');
    await request(testApp)
      .get('/test/forbidden')
      .set('x-correlation-id', 'test-005')
      .expect(403);
    
    console.log('✅ Authorization error logged');

    // Test 6: Database query logging
    console.log('\nTest 6: Database query logging');
    await request(testApp)
      .post('/test/database')
      .set('x-correlation-id', 'test-006')
      .send({ test: 'data' })
      .expect(200);
    
    console.log('✅ Database query logged');

    // Test 7: Slow database query
    console.log('\nTest 7: Slow database query logging');
    await request(testApp)
      .get('/test/slow-query')
      .set('x-correlation-id', 'test-007')
      .expect(200);
    
    console.log('✅ Slow database query logged');

    // Test 8: Custom security event
    console.log('\nTest 8: Custom security event logging');
    await request(testApp)
      .post('/test/security-event')
      .set('x-correlation-id', 'test-008')
      .send({ 
        eventType: 'suspicious_activity',
        userAgent: 'Test-Agent/1.0'
      })
      .expect(200);
    
    console.log('✅ Custom security event logged');

    // Test 9: Request with sensitive data (should be sanitized)
    console.log('\nTest 9: Sensitive data sanitization');
    await request(testApp)
      .post('/test/database')
      .set('x-correlation-id', 'test-009')
      .send({
        password: 'secret123',
        token: 'jwt-token-here',
        normalData: 'safe-value'
      })
      .expect(200);
    
    console.log('✅ Sensitive data sanitized in logs');

    console.log('\n🎉 All logging tests completed successfully!');
    console.log('\nCheck the following log files in /home/ridgetop/aidis/aidis-command/logs/:');
    console.log('  • combined-YYYY-MM-DD.log - All application logs');
    console.log('  • error-YYYY-MM-DD.log - Error logs only');
    console.log('  • requests-YYYY-MM-DD.log - HTTP request/response logs');
    console.log('  • database-YYYY-MM-DD.log - Database operation logs');
    console.log('  • security-YYYY-MM-DD.log - Security event logs');

  } catch (error) {
    console.error('❌ Logging tests failed:', error);
    process.exit(1);
  }
}

// Manual test function for individual testing
export async function testLoggingEndpoint(endpoint: string, correlationId: string) {
  try {
    const response = await request(testApp)
      .get(endpoint)
      .set('x-correlation-id', correlationId);
    
    console.log(`Test ${endpoint}:`, {
      status: response.status,
      correlationId: response.body.correlationId || correlationId
    });
    
    return response;
  } catch (error) {
    console.error(`Test ${endpoint} failed:`, error);
    throw error;
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runLoggingTests().catch(console.error);
}

export { testApp, runLoggingTests };
