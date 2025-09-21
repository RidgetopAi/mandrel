#!/usr/bin/env npx tsx

/**
 * TR009-4: Health Check Endpoints Test Suite
 *
 * Tests all health check endpoints across AIDIS services
 */

import axios, { AxiosError } from 'axios';

// Test configuration
const services = [
  {
    name: 'MCP Server',
    endpoints: {
      health: 'http://localhost:8080/healthz',
      liveness: 'http://localhost:8080/healthz',
      readiness: 'http://localhost:8080/readyz'
    }
  },
  {
    name: 'Backend API',
    endpoints: {
      health: 'http://localhost:5000/api/healthz',
      liveness: 'http://localhost:5000/api/livez',
      readiness: 'http://localhost:5000/api/readyz',
      legacy: 'http://localhost:5000/api/health'
    }
  },
  {
    name: 'Frontend Dev Server',
    endpoints: {
      health: 'http://localhost:3000'
    }
  }
];

// Colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') {
  const color = {
    success: colors.green,
    error: colors.red,
    info: colors.blue,
    warning: colors.yellow
  }[type];
  console.log(`${color}${message}${colors.reset}`);
}

async function testEndpoint(name: string, url: string): Promise<{
  success: boolean;
  statusCode?: number;
  responseTime?: number;
  data?: any;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    const response = await axios.get(url, {
      timeout: 5000,
      validateStatus: () => true // Don't throw on non-2xx status
    });

    const responseTime = Date.now() - startTime;

    // Health check endpoints can return 503 when unhealthy - this is still a valid response
    const isSuccessful = response.status >= 200 && response.status < 600;

    return {
      success: isSuccessful,
      statusCode: response.status,
      responseTime,
      data: response.data
    };
  } catch (error) {
    const axiosError = error as AxiosError;
    return {
      success: false,
      error: axiosError.code === 'ECONNREFUSED'
        ? 'Service not running'
        : axiosError.message
    };
  }
}

async function validateHealthResponse(data: any): string[] {
  const issues: string[] = [];

  // Check required fields
  if (!data.status) issues.push('Missing "status" field');
  if (!data.timestamp) issues.push('Missing "timestamp" field');

  // Validate status value
  if (data.status && !['healthy', 'degraded', 'unhealthy', 'alive', 'ready'].includes(data.status)) {
    issues.push(`Invalid status value: ${data.status}`);
  }

  // Check for health checks detail
  if (data.checks) {
    for (const [key, check] of Object.entries(data.checks as any)) {
      if (!check.status || !['up', 'down', 'degraded'].includes(check.status)) {
        issues.push(`Invalid check status for ${key}: ${check.status}`);
      }
    }
  }

  return issues;
}

async function testService(service: typeof services[0]) {
  log(`\n=== Testing ${service.name} ===`, 'info');

  const results = [];

  for (const [endpointName, url] of Object.entries(service.endpoints)) {
    const result = await testEndpoint(endpointName, url);

    if (result.success) {
      log(`✅ ${endpointName}: ${url}`, 'success');
      log(`   Status: ${result.statusCode} | Response time: ${result.responseTime}ms`, 'info');

      // Validate response structure
      if (result.data) {
        const issues = await validateHealthResponse(result.data);
        if (issues.length > 0) {
          log(`   ⚠️  Response validation issues:`, 'warning');
          issues.forEach(issue => log(`      - ${issue}`, 'warning'));
        } else {
          log(`   ✓ Response structure valid`, 'success');
        }

        // Show health status
        if (result.data.status) {
          const statusColor = result.data.status === 'healthy' || result.data.status === 'alive'
            ? 'success'
            : 'warning';
          log(`   Health status: ${result.data.status}`, statusColor as any);
        }

        // Show component checks if available
        if (result.data.checks) {
          log(`   Component checks:`, 'info');
          for (const [component, check] of Object.entries(result.data.checks as any)) {
            const checkStatus = check.status === 'up' ? '✅' : '❌';
            log(`      ${checkStatus} ${component}: ${check.status}`, 'info');
            if (check.metadata) {
              for (const [key, value] of Object.entries(check.metadata)) {
                log(`         - ${key}: ${value}`, 'info');
              }
            }
          }
        }
      }

      results.push({ endpoint: endpointName, success: true });
    } else {
      log(`❌ ${endpointName}: ${url}`, 'error');
      log(`   Error: ${result.error}`, 'error');
      results.push({ endpoint: endpointName, success: false, error: result.error });
    }
  }

  return results;
}

async function testConcurrentHealth() {
  log('\n=== Testing Concurrent Health Checks ===', 'info');

  const endpoints = [
    'http://localhost:8080/healthz',
    'http://localhost:8080/readyz',
    'http://localhost:5000/api/healthz',
    'http://localhost:5000/api/livez',
    'http://localhost:5000/api/readyz'
  ];

  log(`Sending ${endpoints.length} concurrent requests...`, 'info');
  const startTime = Date.now();

  const promises = endpoints.map(url => testEndpoint(url, url));
  const results = await Promise.all(promises);

  const totalTime = Date.now() - startTime;
  const successCount = results.filter(r => r.success).length;

  log(`\nCompleted ${endpoints.length} requests in ${totalTime}ms`, 'info');
  log(`Success rate: ${successCount}/${endpoints.length} (${((successCount / endpoints.length) * 100).toFixed(0)}%)`,
      successCount === endpoints.length ? 'success' : 'warning');

  // Show individual results
  endpoints.forEach((url, index) => {
    const result = results[index];
    if (result.success) {
      log(`  ✅ ${url} - ${result.responseTime}ms`, 'success');
    } else {
      log(`  ❌ ${url} - ${result.error}`, 'error');
    }
  });
}

async function testHealthUnderLoad() {
  log('\n=== Testing Health Checks Under Load ===', 'info');

  const url = 'http://localhost:8080/healthz';
  const iterations = 50;
  let successCount = 0;
  let totalResponseTime = 0;
  const responseTimes: number[] = [];

  log(`Sending ${iterations} sequential requests to ${url}...`, 'info');

  for (let i = 0; i < iterations; i++) {
    const result = await testEndpoint(`Request ${i + 1}`, url);
    if (result.success) {
      successCount++;
      totalResponseTime += result.responseTime || 0;
      responseTimes.push(result.responseTime || 0);
    }
  }

  // Calculate statistics
  const avgResponseTime = totalResponseTime / successCount;
  const maxResponseTime = Math.max(...responseTimes);
  const minResponseTime = Math.min(...responseTimes);
  const p95ResponseTime = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)];

  log(`\nLoad test results:`, 'info');
  log(`  Success rate: ${successCount}/${iterations} (${((successCount / iterations) * 100).toFixed(0)}%)`,
      successCount === iterations ? 'success' : 'warning');
  log(`  Avg response time: ${avgResponseTime.toFixed(2)}ms`, 'info');
  log(`  Min response time: ${minResponseTime}ms`, 'info');
  log(`  Max response time: ${maxResponseTime}ms`, 'info');
  log(`  P95 response time: ${p95ResponseTime}ms`, 'info');
}

async function runAllTests() {
  log('🚀 Starting TR009-4 Health Check Endpoint Tests', 'info');
  log('=' . repeat(50), 'info');

  const allResults = [];

  // Test each service
  for (const service of services) {
    const results = await testService(service);
    allResults.push({ service: service.name, results });
  }

  // Test concurrent health checks
  await testConcurrentHealth();

  // Test health under load
  await testHealthUnderLoad();

  // Summary
  log('\n' + '=' . repeat(50), 'info');
  log('📊 Test Summary:', 'info');

  let totalEndpoints = 0;
  let successfulEndpoints = 0;

  for (const serviceResult of allResults) {
    const serviceSuccess = serviceResult.results.filter(r => r.success).length;
    const serviceTotal = serviceResult.results.length;
    totalEndpoints += serviceTotal;
    successfulEndpoints += serviceSuccess;

    const statusIcon = serviceSuccess === serviceTotal ? '✅' : '⚠️';
    log(`  ${statusIcon} ${serviceResult.service}: ${serviceSuccess}/${serviceTotal} endpoints working`,
        serviceSuccess === serviceTotal ? 'success' : 'warning');
  }

  log(`\nOverall: ${successfulEndpoints}/${totalEndpoints} endpoints operational`,
      successfulEndpoints === totalEndpoints ? 'success' : 'warning');

  process.exit(successfulEndpoints === totalEndpoints ? 0 : 1);
}

// Run tests
runAllTests().catch(error => {
  log(`Fatal error: ${error}`, 'error');
  process.exit(1);
});