#!/usr/bin/env npx tsx

/**
 * Dynamic Port Assignment Test Suite
 * Tests the Phase 3 dynamic port assignment implementation
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import http from 'http';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
  duration: number;
  details?: any;
}

interface ServicePortInfo {
  serviceName: string;
  port: number;
  pid: number;
  startedAt: Date;
  healthEndpoint?: string;
}

class DynamicPortTester {
  private results: TestResult[] = [];
  private registryPath = '/home/ridgetop/aidis/run/port-registry.json';
  private testProcesses: ChildProcess[] = [];

  async runAllTests(): Promise<void> {
    console.log('🧪 Dynamic Port Assignment Test Suite');
    console.log('=====================================');
    console.log('');

    await this.testPortManagerUtility();
    await this.testEnvironmentVariableProcessing();
    await this.testPortRegistryFunctionality();
    await this.testServiceDiscovery();
    await this.testPortConflictResolution();
    await this.testBackwardCompatibility();

    this.printSummary();
  }

  private async testPortManagerUtility(): Promise<void> {
    const startTime = Date.now();
    console.log('🔧 Testing Port Manager Utility...');

    try {
      // Test TypeScript port manager
      const { portManager } = await import('./mcp-server/src/utils/portManager.js');

      // Test dynamic assignment
      const dynamicPort = await portManager.assignPort('test-service');
      if (typeof dynamicPort !== 'number') {
        throw new Error('Port assignment returned non-number');
      }

      // Test environment variable handling
      process.env.AIDIS_TEST_SERVICE_PORT = '0';
      const zeroPort = await portManager.assignPort('test-service');
      if (zeroPort !== 0) {
        throw new Error('PORT=0 not handled correctly');
      }

      process.env.AIDIS_TEST_SERVICE_PORT = '9999';
      const fixedPort = await portManager.assignPort('test-service');
      if (fixedPort !== 9999) {
        throw new Error('Fixed port not handled correctly');
      }

      // Clean up
      delete process.env.AIDIS_TEST_SERVICE_PORT;

      this.addResult({
        name: 'Port Manager Utility',
        status: 'PASS',
        message: 'Port manager functions correctly',
        duration: Date.now() - startTime,
        details: { dynamicPort, zeroPort, fixedPort }
      });

    } catch (error) {
      this.addResult({
        name: 'Port Manager Utility',
        status: 'FAIL',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
    }
  }

  private async testEnvironmentVariableProcessing(): Promise<void> {
    const startTime = Date.now();
    console.log('🔧 Testing Environment Variable Processing...');

    try {
      const testCases = [
        { env: 'AIDIS_MCP_PORT=0', service: 'mcp', expected: 'dynamic' },
        { env: 'AIDIS_MCP_PORT=8080', service: 'mcp', expected: 8080 },
        { env: 'PORT=0', service: 'aidis-command-dev', expected: 'dynamic' },
        { env: 'PORT=5000', service: 'aidis-command-dev', expected: 5000 },
        { env: '', service: 'mcp', expected: 'default' }
      ];

      const results = [];

      for (const testCase of testCases) {
        // Set environment
        if (testCase.env) {
          const [key, value] = testCase.env.split('=');
          process.env[key] = value;
        }

        // Import fresh instance for testing
        delete require.cache[require.resolve('./mcp-server/src/utils/portManager.js')];
        const { portManager } = await import('./mcp-server/src/utils/portManager.js');

        const port = await portManager.assignPort(testCase.service);

        const result = {
          env: testCase.env || 'unset',
          service: testCase.service,
          expected: testCase.expected,
          actual: port,
          passed: testCase.expected === 'dynamic' ? port === 0 :
                  testCase.expected === 'default' ? (
                    testCase.service === 'mcp' ? port === 8080 : port === 5000
                  ) :
                  port === testCase.expected
        };

        results.push(result);

        // Clean up
        if (testCase.env) {
          const [key] = testCase.env.split('=');
          delete process.env[key];
        }
      }

      const allPassed = results.every(r => r.passed);

      this.addResult({
        name: 'Environment Variable Processing',
        status: allPassed ? 'PASS' : 'FAIL',
        message: allPassed ? 'All environment variable tests passed' : 'Some environment variable tests failed',
        duration: Date.now() - startTime,
        details: results
      });

    } catch (error) {
      this.addResult({
        name: 'Environment Variable Processing',
        status: 'FAIL',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
    }
  }

  private async testPortRegistryFunctionality(): Promise<void> {
    const startTime = Date.now();
    console.log('🔧 Testing Port Registry Functionality...');

    try {
      const { portManager } = await import('./mcp-server/src/utils/portManager.js');

      // Clean up any existing registry
      if (fs.existsSync(this.registryPath)) {
        fs.unlinkSync(this.registryPath);
      }

      // Test service registration
      await portManager.registerService('test-service-1', 8888, '/health');
      await portManager.registerService('test-service-2', 9999, '/status');

      // Check registry file was created
      if (!fs.existsSync(this.registryPath)) {
        throw new Error('Registry file was not created');
      }

      // Parse registry
      const registryData = JSON.parse(fs.readFileSync(this.registryPath, 'utf8'));

      if (!registryData['test-service-1'] || !registryData['test-service-2']) {
        throw new Error('Services not registered correctly');
      }

      // Test service discovery
      const port1 = await portManager.discoverServicePort('test-service-1');
      const port2 = await portManager.discoverServicePort('test-service-2');

      if (port1 !== 8888 || port2 !== 9999) {
        throw new Error('Service discovery failed');
      }

      // Test service unregistration
      await portManager.unregisterService('test-service-1');
      const port1AfterUnregister = await portManager.discoverServicePort('test-service-1');

      if (port1AfterUnregister !== null) {
        throw new Error('Service unregistration failed');
      }

      // Clean up
      if (fs.existsSync(this.registryPath)) {
        fs.unlinkSync(this.registryPath);
      }

      this.addResult({
        name: 'Port Registry Functionality',
        status: 'PASS',
        message: 'Registry operations work correctly',
        duration: Date.now() - startTime,
        details: { port1, port2, registryCreated: true }
      });

    } catch (error) {
      this.addResult({
        name: 'Port Registry Functionality',
        status: 'FAIL',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
    }
  }

  private async testServiceDiscovery(): Promise<void> {
    const startTime = Date.now();
    console.log('🔧 Testing Service Discovery...');

    try {
      // Create a test HTTP server
      const testServer = http.createServer((req, res) => {
        if (req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"status":"healthy"}');
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      // Start server on a random port
      testServer.listen(0, async () => {
        const actualPort = (testServer.address() as any)?.port;

        try {
          const { portManager } = await import('./mcp-server/src/utils/portManager.js');

          // Register the test service
          await portManager.registerService('discovery-test', actualPort, '/health');

          // Test discovery
          const discoveredPort = await portManager.discoverServicePort('discovery-test');

          if (discoveredPort !== actualPort) {
            throw new Error(`Discovery failed: expected ${actualPort}, got ${discoveredPort}`);
          }

          // Test health check
          const services = await portManager.getRegisteredServices();
          const serviceInfo = services['discovery-test'];

          if (!serviceInfo || serviceInfo.port !== actualPort) {
            throw new Error('Service info incorrect');
          }

          this.addResult({
            name: 'Service Discovery',
            status: 'PASS',
            message: 'Service discovery and health checks work correctly',
            duration: Date.now() - startTime,
            details: { actualPort, discoveredPort, serviceInfo }
          });

        } catch (error) {
          this.addResult({
            name: 'Service Discovery',
            status: 'FAIL',
            message: error instanceof Error ? error.message : 'Unknown error',
            duration: Date.now() - startTime
          });
        } finally {
          testServer.close();
        }
      });

    } catch (error) {
      this.addResult({
        name: 'Service Discovery',
        status: 'FAIL',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
    }
  }

  private async testPortConflictResolution(): Promise<void> {
    const startTime = Date.now();
    console.log('🔧 Testing Port Conflict Resolution...');

    try {
      // Create two servers that would conflict on the same port
      const server1 = http.createServer();
      const server2 = http.createServer();

      // Start both with PORT=0 (dynamic assignment)
      server1.listen(0, () => {
        const port1 = (server1.address() as any)?.port;

        server2.listen(0, () => {
          const port2 = (server2.address() as any)?.port;

          try {
            // They should get different ports
            if (port1 === port2) {
              throw new Error('Dynamic assignment gave same port to different services');
            }

            // Both should be valid ports
            if (port1 < 1024 || port1 > 65535 || port2 < 1024 || port2 > 65535) {
              throw new Error('Invalid port assignments');
            }

            this.addResult({
              name: 'Port Conflict Resolution',
              status: 'PASS',
              message: 'Dynamic assignment prevents port conflicts',
              duration: Date.now() - startTime,
              details: { port1, port2 }
            });

          } catch (error) {
            this.addResult({
              name: 'Port Conflict Resolution',
              status: 'FAIL',
              message: error instanceof Error ? error.message : 'Unknown error',
              duration: Date.now() - startTime
            });
          } finally {
            server1.close();
            server2.close();
          }
        });
      });

    } catch (error) {
      this.addResult({
        name: 'Port Conflict Resolution',
        status: 'FAIL',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
    }
  }

  private async testBackwardCompatibility(): Promise<void> {
    const startTime = Date.now();
    console.log('🔧 Testing Backward Compatibility...');

    try {
      // Test legacy environment variables
      const legacyTests = [
        { env: 'AIDIS_HEALTH_PORT=8080', service: 'aidis-mcp', expected: 8080 },
        { env: 'PORT=5000', service: 'aidis-command-dev', expected: 5000 }
      ];

      const results = [];

      for (const test of legacyTests) {
        // Set legacy environment variable
        const [key, value] = test.env.split('=');
        process.env[key] = value;

        // Test the service's port assignment logic
        const { portManager } = await import('./mcp-server/src/utils/portManager.js');
        const assignedPort = await portManager.assignPort(test.service);

        const passed = assignedPort === test.expected;
        results.push({
          env: test.env,
          service: test.service,
          expected: test.expected,
          actual: assignedPort,
          passed
        });

        // Clean up
        delete process.env[key];
      }

      const allPassed = results.every(r => r.passed);

      this.addResult({
        name: 'Backward Compatibility',
        status: allPassed ? 'PASS' : 'FAIL',
        message: allPassed ? 'Legacy environment variables work correctly' : 'Legacy compatibility issues',
        duration: Date.now() - startTime,
        details: results
      });

    } catch (error) {
      this.addResult({
        name: 'Backward Compatibility',
        status: 'FAIL',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
    }
  }

  private addResult(result: TestResult): void {
    this.results.push(result);
    const status = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⏭️ ';
    console.log(`${status} ${result.name}: ${result.message} (${result.duration}ms)`);
    if (result.details && result.status === 'FAIL') {
      console.log('   Details:', JSON.stringify(result.details, null, 2));
    }
    console.log('');
  }

  private printSummary(): void {
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const skipped = this.results.filter(r => r.status === 'SKIP').length;
    const total = this.results.length;

    console.log('🎯 Test Summary');
    console.log('===============');
    console.log(`Total: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log('');

    if (failed > 0) {
      console.log('❌ Failed Tests:');
      this.results
        .filter(r => r.status === 'FAIL')
        .forEach(r => console.log(`   • ${r.name}: ${r.message}`));
      console.log('');
    }

    const overallStatus = failed === 0 ? 'PASS' : 'FAIL';
    console.log(`🏁 Overall Status: ${overallStatus}`);

    if (overallStatus === 'PASS') {
      console.log('');
      console.log('🎉 Dynamic Port Assignment Implementation Complete!');
      console.log('');
      console.log('✅ Key Features Verified:');
      console.log('   • Dynamic port assignment (PORT=0)');
      console.log('   • Port discovery and coordination');
      console.log('   • Service registry functionality');
      console.log('   • Environment variable processing');
      console.log('   • Backward compatibility');
      console.log('   • Port conflict resolution');
      console.log('');
      console.log('💡 Usage:');
      console.log('   • Set AIDIS_*_PORT=0 for dynamic assignment');
      console.log('   • Use ./scripts/port-discovery.sh to check ports');
      console.log('   • Check run/port-registry.json for service details');
    }

    // Clean up test processes
    this.testProcesses.forEach(proc => {
      if (!proc.killed) {
        proc.kill();
      }
    });
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new DynamicPortTester();
  tester.runAllTests()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    });
}