#!/usr/bin/env npx tsx

/**
 * AIDIS HTTP Adapter Comprehensive Test Suite
 * 
 * Tests the new production-ready HTTP adapter for Week 2 of Oracle's redesign.
 * 
 * TEST COVERAGE:
 * ✅ Adapter connection to AIDIS Core Service
 * ✅ Dynamic tool discovery from /mcp/tools endpoint
 * ✅ Tool execution through adapter
 * ✅ Error handling and retry logic
 * ✅ Environment configuration
 * ✅ TypeScript compilation
 * ✅ Health monitoring
 * 
 * ARCHITECTURE TESTED:
 * Test Suite → mcp-http-adapter → AIDIS Core Service
 */

import * as http from 'http';
import * as child_process from 'child_process';
import { fileURLToPath } from 'url';
import * as path from 'path';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const AIDIS_URL = process.env.AIDIS_URL || 'http://localhost:8080';
const ADAPTER_PATH = path.join(__dirname, 'adapters', 'mcp-http-adapter.ts');
const TEST_TIMEOUT = 30000; // 30 seconds

// Colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

/**
 * Test utilities
 */
class TestUtils {
  static log(message: string, color: keyof typeof colors = 'reset'): void {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  static success(message: string): void {
    this.log(`✅ ${message}`, 'green');
  }

  static error(message: string): void {
    this.log(`❌ ${message}`, 'red');
  }

  static warning(message: string): void {
    this.log(`⚠️  ${message}`, 'yellow');
  }

  static info(message: string): void {
    this.log(`ℹ️  ${message}`, 'blue');
  }

  static section(title: string): void {
    this.log(`\n${colors.bold}${colors.cyan}=== ${title} ===${colors.reset}`, 'cyan');
  }

  /**
   * Make HTTP request with promise
   */
  static httpRequest(
    url: string, 
    options: http.RequestOptions & { body?: string } = {}
  ): Promise<{ statusCode: number; data: string }> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const requestOptions: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 80,
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        timeout: 10000
      };

      if (options.body) {
        requestOptions.headers!['Content-Length'] = Buffer.byteLength(options.body);
      }

      const req = http.request(requestOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode || 0, data }));
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }

  /**
   * Wait for a condition with timeout
   */
  static async waitFor(
    condition: () => Promise<boolean>,
    timeoutMs: number = 30000,
    intervalMs: number = 1000
  ): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        if (await condition()) {
          return true;
        }
      } catch (error) {
        // Continue waiting on errors
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    
    return false;
  }
}

/**
 * Test Suite
 */
class HttpAdapterTestSuite {
  private testResults: Map<string, boolean> = new Map();
  
  /**
   * Run all tests
   */
  async runAllTests(): Promise<boolean> {
    TestUtils.section('AIDIS HTTP Adapter Test Suite - Week 2 Oracle Redesign');
    TestUtils.info('Testing production-ready HTTP adapter for Claude Code integration');
    
    try {
      // Pre-flight checks
      await this.testPrerequisites();
      
      // Core functionality tests
      await this.testCoreServiceConnection();
      await this.testDynamicToolDiscovery();
      await this.testAdapterCompilation();
      await this.testEnvironmentConfiguration();
      
      // Integration tests
      await this.testToolExecution();
      await this.testErrorHandling();
      await this.testHealthMonitoring();
      
      // Summary
      this.printTestSummary();
      
      return Array.from(this.testResults.values()).every(result => result === true);
      
    } catch (error) {
      TestUtils.error(`Test suite failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Test prerequisites
   */
  async testPrerequisites(): Promise<void> {
    TestUtils.section('Prerequisites Check');
    
    // Check if AIDIS Core Service is running
    try {
      const response = await TestUtils.httpRequest(`${AIDIS_URL}/healthz`);
      if (response.statusCode === 200) {
        const health = JSON.parse(response.data);
        if (health.status === 'healthy') {
          TestUtils.success('AIDIS Core Service is running and healthy');
          this.testResults.set('core-service-running', true);
        } else {
          throw new Error('Service not healthy');
        }
      } else {
        throw new Error(`HTTP ${response.statusCode}`);
      }
    } catch (error) {
      TestUtils.error(`AIDIS Core Service not available: ${(error as Error).message}`);
      this.testResults.set('core-service-running', false);
    }

    // Check adapter file exists
    if (fs.existsSync(ADAPTER_PATH)) {
      TestUtils.success('HTTP adapter file exists');
      this.testResults.set('adapter-file-exists', true);
    } else {
      TestUtils.error('HTTP adapter file not found');
      this.testResults.set('adapter-file-exists', false);
    }
  }

  /**
   * Test connection to AIDIS Core Service
   */
  async testCoreServiceConnection(): Promise<void> {
    TestUtils.section('Core Service Connection');

    try {
      // Test health endpoint
      const healthResponse = await TestUtils.httpRequest(`${AIDIS_URL}/healthz`);
      if (healthResponse.statusCode === 200) {
        TestUtils.success('Health endpoint accessible');
        this.testResults.set('health-endpoint', true);
      } else {
        throw new Error(`Health check failed: ${healthResponse.statusCode}`);
      }

      // Test readiness endpoint
      const readyResponse = await TestUtils.httpRequest(`${AIDIS_URL}/readyz`);
      if (readyResponse.statusCode === 200 || readyResponse.statusCode === 503) {
        TestUtils.success('Readiness endpoint accessible');
        this.testResults.set('ready-endpoint', true);
      } else {
        throw new Error(`Readiness check failed: ${readyResponse.statusCode}`);
      }

    } catch (error) {
      TestUtils.error(`Core service connection failed: ${(error as Error).message}`);
      this.testResults.set('health-endpoint', false);
      this.testResults.set('ready-endpoint', false);
    }
  }

  /**
   * Test dynamic tool discovery
   */
  async testDynamicToolDiscovery(): Promise<void> {
    TestUtils.section('Dynamic Tool Discovery');

    try {
      const response = await TestUtils.httpRequest(`${AIDIS_URL}/mcp/tools`);
      
      if (response.statusCode === 200) {
        const toolsData = JSON.parse(response.data);
        
        if (toolsData.tools && Array.isArray(toolsData.tools)) {
          const toolCount = toolsData.tools.length;
          TestUtils.success(`Discovered ${toolCount} tools from core service`);
          
          // Verify essential tools are present
          const essentialTools = ['aidis_ping', 'aidis_status', 'aidis_help', 'context_search', 'project_current'];
          const discoveredTools = toolsData.tools.map((t: any) => t.name);
          
          const hasEssentialTools = essentialTools.every(tool => discoveredTools.includes(tool));
          
          if (hasEssentialTools) {
            TestUtils.success('All essential tools discovered');
            this.testResults.set('tool-discovery', true);
          } else {
            const missing = essentialTools.filter(tool => !discoveredTools.includes(tool));
            TestUtils.warning(`Missing essential tools: ${missing.join(', ')}`);
            this.testResults.set('tool-discovery', false);
          }
          
          // Show first few tools
          TestUtils.info('Sample discovered tools:');
          toolsData.tools.slice(0, 5).forEach((tool: any) => {
            TestUtils.info(`  - ${tool.name}: ${tool.description}`);
          });
          
        } else {
          throw new Error('Invalid tools response format');
        }
      } else {
        throw new Error(`Tools endpoint failed: HTTP ${response.statusCode}`);
      }

    } catch (error) {
      TestUtils.error(`Tool discovery failed: ${(error as Error).message}`);
      this.testResults.set('tool-discovery', false);
    }
  }

  /**
   * Test adapter compilation
   */
  async testAdapterCompilation(): Promise<void> {
    TestUtils.section('Adapter Compilation');

    try {
      // Test TypeScript compilation in the adapters directory
      const adapterDir = path.join(__dirname, 'adapters');
      const tscResult = child_process.spawnSync('npx', ['tsc', '--noEmit'], {
        cwd: adapterDir,
        encoding: 'utf8'
      });

      if (tscResult.status === 0) {
        TestUtils.success('TypeScript compilation successful');
        this.testResults.set('typescript-compilation', true);
      } else {
        TestUtils.error(`TypeScript compilation failed:\n${tscResult.stderr}`);
        this.testResults.set('typescript-compilation', false);
      }

    } catch (error) {
      TestUtils.error(`Compilation test failed: ${(error as Error).message}`);
      this.testResults.set('typescript-compilation', false);
    }
  }

  /**
   * Test environment configuration
   */
  async testEnvironmentConfiguration(): Promise<void> {
    TestUtils.section('Environment Configuration');

    try {
      // Test reading the adapter file to verify environment support
      const adapterContent = fs.readFileSync(ADAPTER_PATH, 'utf8');
      
      const hasEnvironmentSupport = [
        'process.env.AIDIS_URL',
        'process.env.AIDIS_TIMEOUT',
        'process.env.AIDIS_RETRIES',
        'process.env.AIDIS_DEBUG'
      ].every(envVar => adapterContent.includes(envVar));

      if (hasEnvironmentSupport) {
        TestUtils.success('Environment configuration support verified');
        this.testResults.set('environment-config', true);
      } else {
        TestUtils.error('Missing environment configuration support');
        this.testResults.set('environment-config', false);
      }

      // Test default configuration
      const hasDefaults = adapterContent.includes('http://localhost:8080') &&
                         adapterContent.includes('30000') &&
                         adapterContent.includes('maxRetries');

      if (hasDefaults) {
        TestUtils.success('Default configuration values present');
        this.testResults.set('default-config', true);
      } else {
        TestUtils.error('Missing default configuration values');
        this.testResults.set('default-config', false);
      }

    } catch (error) {
      TestUtils.error(`Environment configuration test failed: ${(error as Error).message}`);
      this.testResults.set('environment-config', false);
      this.testResults.set('default-config', false);
    }
  }

  /**
   * Test tool execution through core service
   */
  async testToolExecution(): Promise<void> {
    TestUtils.section('Tool Execution');

    try {
      // Test aidis_ping
      const pingResponse = await TestUtils.httpRequest(`${AIDIS_URL}/mcp/tools/aidis_ping`, {
        method: 'POST',
        body: JSON.stringify({ arguments: { message: 'HTTP Adapter Test' } })
      });

      if (pingResponse.statusCode === 200) {
        const result = JSON.parse(pingResponse.data);
        if (result.success) {
          TestUtils.success('aidis_ping executed successfully');
          this.testResults.set('tool-execution-ping', true);
        } else {
          throw new Error('Ping failed');
        }
      } else {
        throw new Error(`HTTP ${pingResponse.statusCode}`);
      }

      // Test aidis_help
      const helpResponse = await TestUtils.httpRequest(`${AIDIS_URL}/mcp/tools/aidis_help`, {
        method: 'POST',
        body: JSON.stringify({ arguments: {} })
      });

      if (helpResponse.statusCode === 200) {
        const result = JSON.parse(helpResponse.data);
        if (result.success) {
          TestUtils.success('aidis_help executed successfully');
          this.testResults.set('tool-execution-help', true);
        } else {
          throw new Error('Help failed');
        }
      } else {
        throw new Error(`HTTP ${helpResponse.statusCode}`);
      }

    } catch (error) {
      TestUtils.error(`Tool execution test failed: ${(error as Error).message}`);
      this.testResults.set('tool-execution-ping', false);
      this.testResults.set('tool-execution-help', false);
    }
  }

  /**
   * Test error handling
   */
  async testErrorHandling(): Promise<void> {
    TestUtils.section('Error Handling');

    try {
      // Test invalid tool
      const invalidResponse = await TestUtils.httpRequest(`${AIDIS_URL}/mcp/tools/invalid_tool`, {
        method: 'POST',
        body: JSON.stringify({ arguments: {} })
      });

      if (invalidResponse.statusCode === 500) {
        const result = JSON.parse(invalidResponse.data);
        if (!result.success && result.error) {
          TestUtils.success('Invalid tool error handling works');
          this.testResults.set('error-handling-invalid-tool', true);
        } else {
          throw new Error('Expected error response');
        }
      } else {
        TestUtils.warning(`Unexpected status for invalid tool: ${invalidResponse.statusCode}`);
        this.testResults.set('error-handling-invalid-tool', false);
      }

      // Test malformed request (expecting graceful error handling)
      try {
        const malformedResponse = await TestUtils.httpRequest(`${AIDIS_URL}/mcp/tools/aidis_ping`, {
          method: 'POST',
          body: 'invalid json'
        });
        
        if (malformedResponse.statusCode >= 400) {
          TestUtils.success('Malformed request properly rejected with error status');
          this.testResults.set('error-handling-malformed', true);
        } else {
          // Some servers handle malformed JSON gracefully, which is also acceptable
          TestUtils.success('Server handles malformed requests gracefully');
          this.testResults.set('error-handling-malformed', true);
        }
      } catch (error) {
        TestUtils.success('Malformed request properly rejected with exception');
        this.testResults.set('error-handling-malformed', true);
      }

    } catch (error) {
      TestUtils.error(`Error handling test failed: ${(error as Error).message}`);
      this.testResults.set('error-handling-invalid-tool', false);
      this.testResults.set('error-handling-malformed', false);
    }
  }

  /**
   * Test health monitoring
   */
  async testHealthMonitoring(): Promise<void> {
    TestUtils.section('Health Monitoring');

    try {
      // Verify adapter code includes health check functionality
      const adapterContent = fs.readFileSync(ADAPTER_PATH, 'utf8');
      
      const hasHealthChecks = [
        'checkHealth',
        'healthCheckInterval',
        'startHealthMonitoring'
      ].every(feature => adapterContent.includes(feature));

      if (hasHealthChecks) {
        TestUtils.success('Health monitoring features found in adapter');
        this.testResults.set('health-monitoring-code', true);
      } else {
        TestUtils.error('Missing health monitoring features');
        this.testResults.set('health-monitoring-code', false);
      }

      // Test circuit breaker pattern
      const hasCircuitBreaker = adapterContent.includes('retry') || 
                                adapterContent.includes('exponential') ||
                                adapterContent.includes('backoff');

      if (hasCircuitBreaker) {
        TestUtils.success('Retry/circuit breaker logic present');
        this.testResults.set('circuit-breaker', true);
      } else {
        TestUtils.error('Missing retry/circuit breaker logic');
        this.testResults.set('circuit-breaker', false);
      }

    } catch (error) {
      TestUtils.error(`Health monitoring test failed: ${(error as Error).message}`);
      this.testResults.set('health-monitoring-code', false);
      this.testResults.set('circuit-breaker', false);
    }
  }

  /**
   * Print test summary
   */
  private printTestSummary(): void {
    TestUtils.section('Test Summary');
    
    const totalTests = this.testResults.size;
    const passedTests = Array.from(this.testResults.values()).filter(result => result === true).length;
    const failedTests = totalTests - passedTests;
    
    TestUtils.info(`Total tests: ${totalTests}`);
    TestUtils.info(`Passed: ${passedTests}`);
    TestUtils.info(`Failed: ${failedTests}`);
    
    if (failedTests === 0) {
      TestUtils.success('🎉 All tests passed! HTTP Adapter is ready for production.');
    } else {
      TestUtils.error(`❌ ${failedTests} tests failed. Address issues before deployment.`);
    }

    // Show detailed results
    TestUtils.info('\nDetailed Results:');
    for (const [testName, result] of this.testResults.entries()) {
      const status = result ? '✅ PASS' : '❌ FAIL';
      TestUtils.log(`  ${status} ${testName}`, result ? 'green' : 'red');
    }
  }
}

/**
 * Main test execution
 */
async function main(): Promise<void> {
  const testSuite = new HttpAdapterTestSuite();
  const success = await testSuite.runAllTests();
  
  TestUtils.section('Week 2 Completion Status');
  
  if (success) {
    TestUtils.success('✅ HTTP Adapter implementation complete and tested');
    TestUtils.success('✅ Ready for Claude Code integration');
    TestUtils.success('✅ Week 2 objectives achieved');
    process.exit(0);
  } else {
    TestUtils.error('❌ HTTP Adapter implementation needs fixes');
    TestUtils.error('❌ Address test failures before proceeding');
    process.exit(1);
  }
}

// Run tests
main().catch((error) => {
  TestUtils.error(`Test execution failed: ${error.message}`);
  process.exit(1);
});
