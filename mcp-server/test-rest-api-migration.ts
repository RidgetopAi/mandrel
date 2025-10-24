/**
 * REST API Migration Test Suite
 * Tests for 8 session analytics REST endpoints
 *
 * Run with: npx tsx test-rest-api-migration.ts
 */

import { HttpMcpBridge } from './src/utils/httpMcpBridge.js';

const BASE_URL = 'http://localhost:8081';
const TEST_SESSION_ID = 'test-session-123';

interface TestResult {
  endpoint: string;
  method: string;
  status: 'PASS' | 'FAIL';
  statusCode?: number;
  error?: string;
}

const results: TestResult[] = [];

async function testEndpoint(
  endpoint: string,
  method: string,
  body?: any
): Promise<TestResult> {
  try {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const data = await response.json();

    return {
      endpoint,
      method,
      status: response.ok ? 'PASS' : 'FAIL',
      statusCode: response.status
    };
  } catch (error) {
    return {
      endpoint,
      method,
      status: 'FAIL',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function runTests() {
  console.log('🧪 REST API Migration Test Suite');
  console.log('=' .repeat(60));
  console.log('');

  // Start HTTP-MCP Bridge server
  const bridge = new HttpMcpBridge(8081);
  await bridge.start();

  console.log('📡 Running endpoint tests...\n');

  // Test 1: Record Activity
  results.push(await testEndpoint(
    `/api/v2/sessions/${TEST_SESSION_ID}/activities`,
    'POST',
    {
      activityType: 'test_activity',
      activityData: { test: true }
    }
  ));

  // Test 2: Get Activities
  results.push(await testEndpoint(
    `/api/v2/sessions/${TEST_SESSION_ID}/activities`,
    'GET'
  ));

  // Test 3: Record File Edit
  results.push(await testEndpoint(
    `/api/v2/sessions/${TEST_SESSION_ID}/files`,
    'POST',
    {
      filePath: '/test/file.ts',
      linesAdded: 10,
      linesDeleted: 5,
      source: 'tool'
    }
  ));

  // Test 4: Get Files
  results.push(await testEndpoint(
    `/api/v2/sessions/${TEST_SESSION_ID}/files`,
    'GET'
  ));

  // Test 5: Calculate Productivity
  results.push(await testEndpoint(
    `/api/v2/sessions/${TEST_SESSION_ID}/productivity`,
    'POST',
    {
      configName: 'default'
    }
  ));

  // Test 6: List Sessions
  results.push(await testEndpoint(
    '/api/v2/sessions?limit=10',
    'GET'
  ));

  // Test 7: Get Stats
  results.push(await testEndpoint(
    '/api/v2/sessions/stats?period=week',
    'GET'
  ));

  // Test 8: Compare Sessions
  results.push(await testEndpoint(
    '/api/v2/sessions/compare?sessionId1=abc&sessionId2=xyz',
    'GET'
  ));

  // Print results
  console.log('📊 Test Results:');
  console.log('');

  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;

  results.forEach((result, index) => {
    const icon = result.status === 'PASS' ? '✅' : '❌';
    const statusCode = result.statusCode ? ` (${result.statusCode})` : '';
    const error = result.error ? ` - ${result.error}` : '';

    console.log(`${icon} Test ${index + 1}: ${result.method} ${result.endpoint}${statusCode}${error}`);
  });

  console.log('');
  console.log('=' .repeat(60));
  console.log(`Total: ${results.length} tests | Passed: ${passCount} | Failed: ${failCount}`);
  console.log('');

  if (failCount > 0) {
    console.log('⚠️  Some tests failed. This is expected if:');
    console.log('   - Database is not running');
    console.log('   - Test session does not exist');
    console.log('   - Authentication is required');
    console.log('');
    console.log('📝 Manual testing recommended using curl or Postman');
  } else {
    console.log('✅ All tests passed!');
  }

  // Stop server
  await bridge.stop();
  process.exit(failCount > 0 ? 1 : 0);
}

// Run tests
runTests().catch((error) => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
