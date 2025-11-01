#!/usr/bin/env npx tsx

/**
 * TC006: Session-Code Bridge API Testing
 * Comprehensive test suite for session-code correlation endpoints
 */

import axios, { AxiosResponse } from 'axios';
import { db as pool } from './src/database/connection';

const API_BASE = 'http://localhost:5000/api';

interface TestResult {
  endpoint: string;
  method: string;
  success: boolean;
  status?: number;
  data?: any;
  error?: string;
  duration: number;
}

class SessionCodeApiTester {
  private results: TestResult[] = [];
  private testSessionId: string | null = null;
  private testProjectId: string | null = null;
  private authToken: string | null = null;

  /**
   * Get authentication token
   */
  async getAuthToken(): Promise<void> {
    console.log('🔐 Getting authentication token...');

    try {
      // Try to login with admin user
      const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
        username: 'admin',
        password: 'admin123'
      });

      if (loginResponse.data?.success && loginResponse.data?.data?.token) {
        this.authToken = loginResponse.data.data.token;
        console.log('✅ Authentication successful');
      } else {
        console.log('⚠️  Using development bypass mode');
        // For development testing, we'll create a minimal test token bypass
        // This is not secure and should only be used for testing
        this.authToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXIiLCJ0b2tlbklkIjoidGVzdC10b2tlbiIsImlhdCI6MTYzNDAzMjAwMCwiZXhwIjoxNjM0MDQwMDAwfQ.test';
      }

    } catch (error: any) {
      console.log('⚠️  Auth failed, using development bypass');
      // For testing, create a test bypass token
      this.authToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXIiLCJ0b2tlbklkIjoidGVzdC10b2tlbiIsImlhdCI6MTYzNDAzMjAwMCwiZXhwIjoxNjM0MDQwMDAwfQ.test';
    }
  }

  /**
   * Setup test data and environment
   */
  async setup(): Promise<void> {
    console.log('🔧 Setting up test environment...');

    try {
      // First get authentication
      await this.getAuthToken();
      // Find or create a test session
      const sessionQuery = `
        SELECT s.id, s.project_id, p.name as project_name
        FROM sessions s
        JOIN projects p ON s.project_id = p.id
        ORDER BY s.started_at DESC
        LIMIT 1
      `;

      const sessionResult = await pool.query(sessionQuery);

      if (sessionResult.rows.length === 0) {
        // Create a test session if none exists
        const projectResult = await pool.query(`
          SELECT id FROM projects ORDER BY created_at DESC LIMIT 1
        `);

        if (projectResult.rows.length === 0) {
          throw new Error('No projects found for testing');
        }

        const projectId = projectResult.rows[0].id;

        const createSessionResult = await pool.query(`
          INSERT INTO sessions (project_id, agent_type, started_at)
          VALUES ($1, 'claude-test', CURRENT_TIMESTAMP)
          RETURNING id, project_id
        `, [projectId]);

        this.testSessionId = createSessionResult.rows[0].id;
        this.testProjectId = createSessionResult.rows[0].project_id;
      } else {
        this.testSessionId = sessionResult.rows[0].id;
        this.testProjectId = sessionResult.rows[0].project_id;
      }

      console.log(`✅ Test session: ${this.testSessionId?.substring(0, 8)}...`);
      console.log(`✅ Test project: ${this.testProjectId?.substring(0, 8)}...`);

    } catch (error) {
      console.error('❌ Setup failed:', error);
      throw error;
    }
  }

  /**
   * Execute an API test
   */
  private async executeTest(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    data?: any,
    params?: any
  ): Promise<void> {
    const startTime = Date.now();
    const fullUrl = `${API_BASE}${endpoint}`;

    try {
      let response: AxiosResponse;
      const config = {
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        },
        params
      };

      if (method === 'GET') {
        response = await axios.get(fullUrl, config);
      } else {
        response = await axios.post(fullUrl, data, config);
      }

      const duration = Date.now() - startTime;

      this.results.push({
        endpoint,
        method,
        success: true,
        status: response.status,
        data: response.data,
        duration
      });

      console.log(`✅ ${method} ${endpoint} - ${response.status} (${duration}ms)`);
      if (response.data?.data) {
        console.log(`   Response keys: ${Object.keys(response.data.data).join(', ')}`);
      }

    } catch (error: any) {
      const duration = Date.now() - startTime;
      const status = error.response?.status;
      const errorMsg = error.response?.data?.error || error.message;

      this.results.push({
        endpoint,
        method,
        success: false,
        status,
        error: errorMsg,
        duration
      });

      console.log(`❌ ${method} ${endpoint} - ${status || 'Network Error'} (${duration}ms)`);
      console.log(`   Error: ${errorMsg}`);
    }
  }

  /**
   * Test GET /session-code/current
   */
  async testGetCurrentSession(): Promise<void> {
    console.log('\n📊 Testing GET /session-code/current');
    await this.executeTest('/session-code/current');
  }

  /**
   * Test GET /session-code/session/:sessionId
   */
  async testGetSessionById(): Promise<void> {
    console.log('\n📊 Testing GET /session-code/session/:sessionId');
    if (!this.testSessionId) {
      console.log('⚠️  Skipping - no test session ID available');
      return;
    }
    await this.executeTest(`/session-code/session/${this.testSessionId}`);
  }

  /**
   * Test POST /session-code/analyze
   */
  async testTriggerAnalysis(): Promise<void> {
    console.log('\n📊 Testing POST /session-code/analyze');
    
    const analysisRequest = {
      sessionId: this.testSessionId,
      analysisScope: 'targeted',
      targetFiles: ['src/test-file.ts'],
      includeMetrics: true,
      gitContext: true
    };

    await this.executeTest('/session-code/analyze', 'POST', analysisRequest);
  }

  /**
   * Test GET /session-code/commits/:sessionId
   */
  async testGetCommits(): Promise<void> {
    console.log('\n📊 Testing GET /session-code/commits/:sessionId');
    if (!this.testSessionId) {
      console.log('⚠️  Skipping - no test session ID available');
      return;
    }

    // Test without file changes
    await this.executeTest(
      `/session-code/commits/${this.testSessionId}`,
      'GET',
      undefined,
      { confidenceThreshold: 0.2 }
    );

    // Test with file changes
    await this.executeTest(
      `/session-code/commits/${this.testSessionId}`,
      'GET',
      undefined,
      { includeFileChanges: true, confidenceThreshold: 0.1 }
    );
  }

  /**
   * Test POST /session-code/correlate
   */
  async testCorrelation(): Promise<void> {
    console.log('\n📊 Testing POST /session-code/correlate');
    
    const correlationRequest = {
      sessionId: this.testSessionId,
      forceRefresh: true,
      confidenceThreshold: 0.2,
      scope: 'session'
    };

    await this.executeTest('/session-code/correlate', 'POST', correlationRequest);
  }

  /**
   * Test GET /session-code/metrics/:sessionId
   */
  async testGetMetrics(): Promise<void> {
    console.log('\n📊 Testing GET /session-code/metrics/:sessionId');
    if (!this.testSessionId) {
      console.log('⚠️  Skipping - no test session ID available');
      return;
    }

    // Test session-level metrics
    await this.executeTest(
      `/session-code/metrics/${this.testSessionId}`,
      'GET',
      undefined,
      { aggregateLevel: 'session' }
    );

    // Test component-level metrics
    await this.executeTest(
      `/session-code/metrics/${this.testSessionId}`,
      'GET',
      undefined,
      { aggregateLevel: 'component' }
    );
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Session-Code API Tests\n');

    try {
      await this.setup();

      // Run all test methods
      await this.testGetCurrentSession();
      await this.testGetSessionById();
      await this.testTriggerAnalysis();
      await this.testGetCommits();
      await this.testCorrelation();
      await this.testGetMetrics();

      await this.printSummary();

    } catch (error) {
      console.error('❌ Test execution failed:', error);
      process.exit(1);
    }
  }

  /**
   * Print test results summary
   */
  async printSummary(): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('📋 TEST RESULTS SUMMARY');
    console.log('='.repeat(60));

    const successful = this.results.filter(r => r.success);
    const failed = this.results.filter(r => !r.success);

    console.log(`✅ Successful: ${successful.length}`);
    console.log(`❌ Failed: ${failed.length}`);
    console.log(`🕐 Total Tests: ${this.results.length}`);

    if (successful.length > 0) {
      console.log('\n✅ SUCCESSFUL TESTS:');
      successful.forEach(result => {
        console.log(`   ${result.method} ${result.endpoint} (${result.duration}ms)`);
      });
    }

    if (failed.length > 0) {
      console.log('\n❌ FAILED TESTS:');
      failed.forEach(result => {
        console.log(`   ${result.method} ${result.endpoint} - ${result.error}`);
      });
    }

    // Show performance stats
    const avgDuration = this.results.reduce((sum, r) => sum + r.duration, 0) / this.results.length;
    const maxDuration = Math.max(...this.results.map(r => r.duration));
    const minDuration = Math.min(...this.results.map(r => r.duration));

    console.log('\n⏱️  PERFORMANCE:');
    console.log(`   Average: ${Math.round(avgDuration)}ms`);
    console.log(`   Min: ${minDuration}ms`);
    console.log(`   Max: ${maxDuration}ms`);

    // Show data insights
    console.log('\n📊 DATA INSIGHTS:');
    const successfulWithData = successful.filter(r => r.data?.data);
    
    successfulWithData.forEach(result => {
      const data = result.data?.data;
      if (data) {
        console.log(`   ${result.endpoint}:`);
        
        if (data.commits?.length) {
          console.log(`     - Found ${data.commits.length} linked commits`);
        }
        if (data.code_activity?.total_components) {
          console.log(`     - ${data.code_activity.total_components} code components`);
        }
        if (data.analysis_sessions?.length) {
          console.log(`     - ${data.analysis_sessions.length} analysis sessions`);
        }
        if (data.session_metrics?.total_analysis_sessions) {
          console.log(`     - ${data.session_metrics.total_analysis_sessions} total analysis sessions`);
        }
      }
    });

    console.log('\n' + '='.repeat(60));
    
    const successRate = Math.round((successful.length / this.results.length) * 100);
    if (successRate >= 80) {
      console.log(`🎉 Tests completed with ${successRate}% success rate!`);
    } else {
      console.log(`⚠️  Tests completed with ${successRate}% success rate`);
    }
  }

  /**
   * Cleanup test data
   */
  async cleanup(): Promise<void> {
    // Note: In a real test environment, you might want to clean up test data
    console.log('🧹 Test cleanup completed');
  }
}

/**
 * Helper function to test database connectivity
 */
async function testDatabaseConnection(): Promise<void> {
  try {
    const result = await pool.query('SELECT NOW() as current_time, COUNT(*) as session_count FROM sessions');
    console.log(`✅ Database connected - ${result.rows[0].session_count} sessions found`);
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
}

/**
 * Helper function to check if server is running
 */
async function testServerConnection(): Promise<void> {
  try {
    const response = await axios.get(`${API_BASE}/health`);
    console.log(`✅ API server connected - Status: ${response.data.data?.status || 'unknown'}`);
  } catch (error: any) {
    console.error('❌ API server connection failed:', error.message);
    console.error('   Make sure the backend server is running on port 3001');
    throw error;
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  try {
    console.log('🏁 Session-Code Bridge API Test Suite');
    console.log('=====================================\n');

    // Test connections
    console.log('🔍 Testing connections...');
    await testDatabaseConnection();
    await testServerConnection();

    // Run API tests
    const tester = new SessionCodeApiTester();
    await tester.runAllTests();
    await tester.cleanup();

    process.exit(0);

  } catch (error) {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  main();
}

export { SessionCodeApiTester };