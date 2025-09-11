/**
 * TC014: Development Metrics System Comprehensive Testing Suite
 * 
 * Tests the complete metrics collection and analysis system:
 * - Database schema and migrations
 * - Metrics collector service functionality
 * - MCP API handlers and endpoints
 * - Real-time integration with git and patterns
 * - Performance validation (sub-100ms targets)
 * - Data accuracy and calculations
 * 
 * Run with: npx tsx src/test/test-metrics-system.ts
 */

import { db } from '../config/database.js';
import { MetricsCollector, collectProjectMetrics } from '../services/metricsCollector.js';
import { DevelopmentMetricsHandler } from '../handlers/developmentMetrics.js';
import { MetricsIntegrationService } from '../services/metricsIntegration.js';

// Test configuration
const TEST_CONFIG = {
  performanceTargetMs: 100, // Sub-100ms performance target
  testTimeout: 30000, // 30 seconds max per test
  sampleDataSize: 50, // Number of sample records to create
  accuracyThreshold: 0.95 // 95% accuracy requirement
};

/**
 * Test result interface
 */
interface TestResult {
  name: string;
  passed: boolean;
  executionTime: number;
  error?: string;
  details?: any;
}

/**
 * Main test suite
 */
export class MetricsSystemTestSuite {
  private results: TestResult[] = [];
  private testStartTime = Date.now();

  /**
   * Run all tests
   */
  async runAllTests(): Promise<void> {
    console.log('🧪 Starting TC014 Development Metrics System Test Suite...\n');

    try {
      // 1. Database Schema Tests
      await this.testDatabaseSchema();
      
      // 2. Core Service Tests
      await this.testMetricsCollectorService();
      
      // 3. MCP Handler Tests
      await this.testMcpHandlers();
      
      // 4. Integration Tests
      await this.testSystemIntegration();
      
      // 5. Performance Tests
      await this.testPerformance();
      
      // 6. Data Accuracy Tests
      await this.testDataAccuracy();
      
      // Print results summary
      this.printTestSummary();

    } catch (error) {
      console.error('❌ Test suite execution failed:', error);
    }
  }

  /**
   * Test database schema and migrations
   */
  private async testDatabaseSchema(): Promise<void> {
    console.log('📊 Testing Database Schema...');

    // Test 1: Check if all metrics tables exist
    await this.runTest('Database Tables Exist', async () => {
      const expectedTables = [
        'metrics_collection_sessions',
        'core_development_metrics',
        'pattern_intelligence_metrics',
        'productivity_health_metrics',
        'metrics_alerts',
        'metrics_trends'
      ];

      for (const table of expectedTables) {
        const result = await db.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = $1
          )
        `, [table]);

        if (!result.rows[0].exists) {
          throw new Error(`Table ${table} does not exist`);
        }
      }

      return { tablesChecked: expectedTables.length };
    });

    // Test 2: Check indexes for performance
    await this.runTest('Performance Indexes Exist', async () => {
      const indexQuery = `
        SELECT indexname 
        FROM pg_indexes 
        WHERE indexname LIKE 'idx_%metrics%' 
           OR indexname LIKE 'idx_%productivity%'
           OR indexname LIKE 'idx_%intelligence%'
      `;

      const result = await db.query(indexQuery);
      const indexCount = result.rows.length;

      if (indexCount < 20) { // Expecting at least 20 performance indexes
        throw new Error(`Insufficient indexes found: ${indexCount} < 20`);
      }

      return { indexesFound: indexCount };
    });

    // Test 3: Check materialized views
    await this.runTest('Dashboard Views Exist', async () => {
      const expectedViews = [
        'project_metrics_dashboard',
        'developer_productivity_summary',
        'high_priority_alerts_summary'
      ];

      for (const view of expectedViews) {
        const result = await db.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.views 
            WHERE table_name = $1
          )
        `, [view]);

        if (!result.rows[0].exists) {
          throw new Error(`View ${view} does not exist`);
        }
      }

      return { viewsChecked: expectedViews.length };
    });

    console.log('✅ Database schema tests completed\n');
  }

  /**
   * Test metrics collector service
   */
  private async testMetricsCollectorService(): Promise<void> {
    console.log('⚙️  Testing Metrics Collector Service...');

    // Test 1: Service initialization
    await this.runTest('Service Initialization', async () => {
      const collector = MetricsCollector.getInstance();
      await collector.start();

      const stats = collector.getCollectionMetrics();
      
      await collector.stop();

      return { serviceStarted: true, initialStats: stats };
    });

    // Test 2: Create test project and collect metrics
    await this.runTest('Metrics Collection Flow', async () => {
      // Create test project
      const projectResult = await db.query(`
        INSERT INTO projects (name, description, status)
        VALUES ('Test Metrics Project', 'Test project for metrics validation', 'active')
        RETURNING id
      `);
      const projectId = projectResult.rows[0].id;

      try {
        // Create sample git commits
        await this.createSampleGitData(projectId);

        // Collect metrics for the project
        const result = await collectProjectMetrics(projectId, 'manual');

        // Verify results
        if (!result.success) {
          throw new Error(`Metrics collection failed: ${result.errors.join(', ')}`);
        }

        if (result.executionTimeMs > TEST_CONFIG.performanceTargetMs * 2) {
          throw new Error(`Execution too slow: ${result.executionTimeMs}ms > ${TEST_CONFIG.performanceTargetMs * 2}ms`);
        }

        return {
          projectId: projectId.substring(0, 8),
          executionTime: result.executionTimeMs,
          metricsGenerated: result.totalMetricsCalculated,
          alertsGenerated: result.alertsGenerated,
          dataCompletenessScore: result.dataCompletenessScore
        };

      } finally {
        // Cleanup test project
        await this.cleanupTestProject(projectId);
      }
    });

    console.log('✅ Metrics collector service tests completed\n');
  }

  /**
   * Test MCP API handlers
   */
  private async testMcpHandlers(): Promise<void> {
    console.log('🔌 Testing MCP API Handlers...');

    // Test 1: Tool registration
    await this.runTest('MCP Tools Registration', async () => {
      const tools = DevelopmentMetricsHandler.getTools();

      const expectedTools = [
        'metrics_collect_project',
        'metrics_get_dashboard',
        'metrics_get_core_metrics',
        'metrics_get_pattern_intelligence',
        'metrics_get_productivity_health',
        'metrics_get_alerts',
        'metrics_get_trends'
      ];

      const toolNames = tools.map(t => t.name);
      
      for (const expectedTool of expectedTools) {
        if (!toolNames.includes(expectedTool)) {
          throw new Error(`Missing tool: ${expectedTool}`);
        }
      }

      return { 
        toolsRegistered: tools.length,
        expectedTools: expectedTools.length
      };
    });

    // Test 2: Handler execution (with sample data)
    await this.runTest('MCP Handler Execution', async () => {
      // Create test project with sample data
      const projectResult = await db.query(`
        INSERT INTO projects (name, description, status)
        VALUES ('MCP Test Project', 'Test project for MCP handlers', 'active')
        RETURNING id
      `);
      const projectId = projectResult.rows[0].id;

      try {
        // Create sample data
        await this.createSampleGitData(projectId);
        await this.createSampleMetricsData(projectId);

        // Test metrics dashboard handler
        const dashboardResult = await DevelopmentMetricsHandler.handleTool(
          'metrics_get_dashboard',
          { projectId, timeframe: '30d' }
        );

        if (!dashboardResult.success) {
          throw new Error('Dashboard handler failed');
        }

        // Test core metrics handler  
        const coreResult = await DevelopmentMetricsHandler.handleTool(
          'metrics_get_core_metrics',
          { projectId, timeframe: '30d' }
        );

        if (!coreResult.success) {
          throw new Error('Core metrics handler failed');
        }

        return {
          dashboardSuccess: dashboardResult.success,
          coreMetricsSuccess: coreResult.success,
          dashboardMetrics: Object.keys(dashboardResult.coreMetrics || {}).length,
          coreMetricsCount: coreResult.summary?.totalMetrics || 0
        };

      } finally {
        await this.cleanupTestProject(projectId);
      }
    });

    console.log('✅ MCP API handler tests completed\n');
  }

  /**
   * Test system integration
   */
  private async testSystemIntegration(): Promise<void> {
    console.log('🔗 Testing System Integration...');

    // Test 1: Integration service initialization
    await this.runTest('Integration Service Init', async () => {
      const service = MetricsIntegrationService.getInstance();
      await service.start();

      const stats = service.getIntegrationStats();

      await service.stop();

      return { 
        serviceInitialized: true,
        initialStats: stats
      };
    });

    // Test 2: Git integration flow (simulated)
    await this.runTest('Git Integration Flow', async () => {
      const service = MetricsIntegrationService.getInstance();
      await service.start();

      try {
        // Simulate git commit event
        const commitShas = ['abc123def456', 'ghi789jkl012'];
        
        // This would normally trigger async processing, so we test the trigger mechanism
        await service.handleGitCommitEvent(commitShas);

        // Wait a moment for processing
        await new Promise(resolve => setTimeout(resolve, 100));

        const stats = service.getIntegrationStats();

        return {
          commitsProcessed: commitShas.length,
          integrationStats: stats
        };

      } finally {
        await service.stop();
      }
    });

    console.log('✅ System integration tests completed\n');
  }

  /**
   * Test performance requirements
   */
  private async testPerformance(): Promise<void> {
    console.log('⚡ Testing Performance Requirements...');

    // Test 1: Database query performance
    await this.runTest('Dashboard Query Performance', async () => {
      // Create test project with substantial data
      const projectResult = await db.query(`
        INSERT INTO projects (name, description, status)
        VALUES ('Perf Test Project', 'Performance testing project', 'active')
        RETURNING id
      `);
      const projectId = projectResult.rows[0].id;

      try {
        // Create substantial test data
        await this.createLargeDataset(projectId);

        // Test dashboard view performance
        const startTime = Date.now();
        
        const result = await db.query(`
          SELECT * FROM project_metrics_dashboard 
          WHERE project_id = $1
        `, [projectId]);

        const executionTime = Date.now() - startTime;

        if (executionTime > TEST_CONFIG.performanceTargetMs) {
          throw new Error(`Query too slow: ${executionTime}ms > ${TEST_CONFIG.performanceTargetMs}ms`);
        }

        return {
          executionTime,
          recordsReturned: result.rows.length,
          performanceTarget: TEST_CONFIG.performanceTargetMs,
          passed: executionTime <= TEST_CONFIG.performanceTargetMs
        };

      } finally {
        await this.cleanupTestProject(projectId);
      }
    });

    // Test 2: Metrics collection performance
    await this.runTest('Metrics Collection Performance', async () => {
      const projectResult = await db.query(`
        INSERT INTO projects (name, description, status)
        VALUES ('Collection Perf Test', 'Performance testing for collection', 'active')
        RETURNING id
      `);
      const projectId = projectResult.rows[0].id;

      try {
        await this.createSampleGitData(projectId);

        const startTime = Date.now();
        const result = await collectProjectMetrics(projectId, 'manual');
        const executionTime = Date.now() - startTime;

        // Allow 2x the target for collection (more complex operation)
        const collectionTarget = TEST_CONFIG.performanceTargetMs * 2;

        if (executionTime > collectionTarget) {
          console.warn(`⚠️  Collection time ${executionTime}ms exceeds target ${collectionTarget}ms`);
        }

        return {
          executionTime,
          metricsGenerated: result.totalMetricsCalculated,
          target: collectionTarget,
          withinTarget: executionTime <= collectionTarget
        };

      } finally {
        await this.cleanupTestProject(projectId);
      }
    });

    console.log('✅ Performance tests completed\n');
  }

  /**
   * Test data accuracy and calculations
   */
  private async testDataAccuracy(): Promise<void> {
    console.log('🎯 Testing Data Accuracy...');

    // Test 1: Velocity calculation accuracy
    await this.runTest('Velocity Calculation Accuracy', async () => {
      const projectResult = await db.query(`
        INSERT INTO projects (name, description, status)
        VALUES ('Accuracy Test Project', 'Data accuracy testing', 'active')
        RETURNING id
      `);
      const projectId = projectResult.rows[0].id;

      try {
        // Create controlled test data with known metrics
        const testCommits = [
          { insertions: 100, deletions: 50, files: 5 },
          { insertions: 200, deletions: 100, files: 8 },
          { insertions: 150, deletions: 75, files: 6 }
        ];

        const expectedTotalLines = testCommits.reduce((sum, c) => sum + c.insertions + c.deletions, 0);
        const expectedAvgFilesPerCommit = testCommits.reduce((sum, c) => sum + c.files, 0) / testCommits.length;

        await this.createControlledGitData(projectId, testCommits);

        // Collect metrics
        const result = await collectProjectMetrics(projectId, 'manual');

        // Find velocity metrics
        const velocityMetrics = result.coreMetrics.filter(m => m.metricType === 'code_velocity');
        const linesMetric = velocityMetrics.find(m => m.metricUnit === 'lines/day');

        if (!linesMetric) {
          throw new Error('Lines velocity metric not found');
        }

        // Calculate expected daily velocity (assuming 1-day period)
        const expectedDailyLines = expectedTotalLines;
        const actualDailyLines = linesMetric.metricValue;
        
        const accuracy = 1 - Math.abs(expectedDailyLines - actualDailyLines) / expectedDailyLines;

        if (accuracy < TEST_CONFIG.accuracyThreshold) {
          throw new Error(`Accuracy too low: ${accuracy} < ${TEST_CONFIG.accuracyThreshold}`);
        }

        return {
          expectedLines: expectedTotalLines,
          actualLines: actualDailyLines,
          accuracy: accuracy,
          passed: accuracy >= TEST_CONFIG.accuracyThreshold
        };

      } finally {
        await this.cleanupTestProject(projectId);
      }
    });

    console.log('✅ Data accuracy tests completed\n');
  }

  /**
   * Helper method to run individual tests
   */
  private async runTest(name: string, testFunction: () => Promise<any>): Promise<void> {
    const startTime = Date.now();

    try {
      console.log(`   🧪 ${name}...`);
      
      const result = await Promise.race([
        testFunction(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Test timeout')), TEST_CONFIG.testTimeout)
        )
      ]);

      const executionTime = Date.now() - startTime;

      this.results.push({
        name,
        passed: true,
        executionTime,
        details: result
      });

      console.log(`   ✅ ${name} - ${executionTime}ms`);

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      this.results.push({
        name,
        passed: false,
        executionTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      console.log(`   ❌ ${name} - ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Create sample git data for testing
   */
  private async createSampleGitData(projectId: string): Promise<void> {
    const commits = [];
    const baseDate = new Date();

    for (let i = 0; i < 10; i++) {
      const commitDate = new Date(baseDate.getTime() - (i * 24 * 60 * 60 * 1000));
      
      commits.push({
        projectId,
        commitSha: `test${i}`.padEnd(40, '0'),
        message: `Test commit ${i}: Adding features and fixes`,
        authorName: 'Test Developer',
        authorEmail: 'test@example.com',
        authorDate: commitDate,
        committerName: 'Test Developer',
        committerEmail: 'test@example.com',
        committerDate: commitDate,
        branchName: 'main',
        insertions: Math.floor(Math.random() * 100) + 10,
        deletions: Math.floor(Math.random() * 50) + 5,
        filesChanged: Math.floor(Math.random() * 8) + 2
      });
    }

    for (const commit of commits) {
      await db.query(`
        INSERT INTO git_commits (
          project_id, commit_sha, message, author_name, author_email, author_date,
          committer_name, committer_email, committer_date, branch_name,
          insertions, deletions, files_changed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        commit.projectId, commit.commitSha, commit.message, commit.authorName,
        commit.authorEmail, commit.authorDate, commit.committerName, commit.committerEmail,
        commit.committerDate, commit.branchName, commit.insertions, commit.deletions,
        commit.filesChanged
      ]);
    }
  }

  /**
   * Create controlled git data with known metrics
   */
  private async createControlledGitData(projectId: string, testCommits: any[]): Promise<void> {
    const baseDate = new Date();

    for (let i = 0; i < testCommits.length; i++) {
      const commit = testCommits[i];
      const commitDate = new Date(baseDate.getTime() - (i * 60 * 60 * 1000)); // 1 hour apart

      await db.query(`
        INSERT INTO git_commits (
          project_id, commit_sha, message, author_name, author_email, author_date,
          committer_name, committer_email, committer_date, branch_name,
          insertions, deletions, files_changed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        projectId, `controlled${i}`.padEnd(40, '0'), `Controlled commit ${i}`,
        'Test Developer', 'test@example.com', commitDate,
        'Test Developer', 'test@example.com', commitDate, 'main',
        commit.insertions, commit.deletions, commit.files
      ]);
    }
  }

  /**
   * Create sample metrics data for handler testing
   */
  private async createSampleMetricsData(projectId: string): Promise<void> {
    // Create a metrics collection session
    const sessionResult = await db.query(`
      INSERT INTO metrics_collection_sessions (project_id, collection_trigger, status)
      VALUES ($1, 'manual', 'completed')
      RETURNING id
    `, [projectId]);
    const sessionId = sessionResult.rows[0].id;

    // Create sample core metrics
    const metrics = [
      { type: 'code_velocity', scope: 'project', value: 150, unit: 'lines/day' },
      { type: 'development_focus', scope: 'project', value: 0.8, unit: 'concentration_ratio' },
      { type: 'technical_debt_accumulation', scope: 'project', value: 0.3, unit: 'debt_score' }
    ];

    for (const metric of metrics) {
      await db.query(`
        INSERT INTO core_development_metrics (
          collection_session_id, project_id, metric_type, metric_scope, scope_identifier,
          period_type, period_start, period_end, metric_value, metric_unit,
          data_quality_score, measurement_confidence, sample_size,
          contributing_commits, contributing_sessions, contributing_files, contributing_developers,
          alert_triggered
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      `, [
        sessionId, projectId, metric.type, metric.scope, projectId,
        'daily', new Date(Date.now() - 24*60*60*1000), new Date(), metric.value, metric.unit,
        0.9, 0.8, 10, 5, 1, 8, 1, false
      ]);
    }
  }

  /**
   * Create large dataset for performance testing
   */
  private async createLargeDataset(projectId: string): Promise<void> {
    // Create multiple collection sessions
    for (let i = 0; i < 5; i++) {
      const sessionResult = await db.query(`
        INSERT INTO metrics_collection_sessions (project_id, collection_trigger, status)
        VALUES ($1, 'scheduled', 'completed')
        RETURNING id
      `, [projectId]);
      const sessionId = sessionResult.rows[0].id;

      // Create many metrics per session
      for (let j = 0; j < 20; j++) {
        await db.query(`
          INSERT INTO core_development_metrics (
            collection_session_id, project_id, metric_type, metric_scope, scope_identifier,
            period_type, period_start, period_end, metric_value, metric_unit,
            data_quality_score, measurement_confidence, sample_size,
            contributing_commits, contributing_sessions, contributing_files, contributing_developers,
            alert_triggered
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        `, [
          sessionId, projectId, 'code_velocity', 'project', projectId,
          'daily', new Date(Date.now() - (i+j)*60*60*1000), new Date(), Math.random() * 200,
          'lines/day', 0.9, 0.8, 10, 5, 1, 8, 1, false
        ]);
      }
    }
  }

  /**
   * Cleanup test project and all related data
   */
  private async cleanupTestProject(projectId: string): Promise<void> {
    try {
      // Delete in reverse dependency order
      await db.query('DELETE FROM core_development_metrics WHERE project_id = $1', [projectId]);
      await db.query('DELETE FROM pattern_intelligence_metrics WHERE project_id = $1', [projectId]);
      await db.query('DELETE FROM productivity_health_metrics WHERE project_id = $1', [projectId]);
      await db.query('DELETE FROM metrics_alerts WHERE project_id = $1', [projectId]);
      await db.query('DELETE FROM metrics_trends WHERE project_id = $1', [projectId]);
      await db.query('DELETE FROM metrics_collection_sessions WHERE project_id = $1', [projectId]);
      await db.query('DELETE FROM git_commits WHERE project_id = $1', [projectId]);
      await db.query('DELETE FROM projects WHERE id = $1', [projectId]);
    } catch (error) {
      console.warn('⚠️  Cleanup warning:', error);
    }
  }

  /**
   * Print comprehensive test results summary
   */
  private printTestSummary(): void {
    const totalExecutionTime = Date.now() - this.testStartTime;
    const passedTests = this.results.filter(r => r.passed);
    const failedTests = this.results.filter(r => !r.passed);
    
    console.log('\n' + '='.repeat(80));
    console.log('🧪 TC014 DEVELOPMENT METRICS SYSTEM TEST RESULTS');
    console.log('='.repeat(80));
    
    console.log(`📊 Test Summary:`);
    console.log(`   Total Tests: ${this.results.length}`);
    console.log(`   ✅ Passed: ${passedTests.length}`);
    console.log(`   ❌ Failed: ${failedTests.length}`);
    console.log(`   ⏱️  Total Time: ${totalExecutionTime}ms`);
    console.log(`   📈 Success Rate: ${((passedTests.length / this.results.length) * 100).toFixed(1)}%`);

    if (failedTests.length > 0) {
      console.log(`\n❌ Failed Tests:`);
      failedTests.forEach(test => {
        console.log(`   • ${test.name}: ${test.error}`);
      });
    }

    console.log(`\n✅ Passed Tests:`);
    passedTests.forEach(test => {
      console.log(`   • ${test.name} (${test.executionTime}ms)`);
    });

    // Performance summary
    const avgExecutionTime = this.results.reduce((sum, r) => sum + r.executionTime, 0) / this.results.length;
    console.log(`\n⚡ Performance Summary:`);
    console.log(`   Average Test Time: ${avgExecutionTime.toFixed(1)}ms`);
    console.log(`   Performance Target: ${TEST_CONFIG.performanceTargetMs}ms`);

    // Final verdict
    const allTestsPassed = failedTests.length === 0;
    const performanceGood = avgExecutionTime <= TEST_CONFIG.performanceTargetMs * 2;
    
    console.log('\n' + '='.repeat(80));
    if (allTestsPassed && performanceGood) {
      console.log('🎉 TC014 DEVELOPMENT METRICS SYSTEM: ALL TESTS PASSED!');
      console.log('✅ System is ready for production use');
    } else {
      console.log('⚠️  TC014 DEVELOPMENT METRICS SYSTEM: ISSUES DETECTED');
      if (!allTestsPassed) {
        console.log(`❌ ${failedTests.length} tests failed - system needs fixes`);
      }
      if (!performanceGood) {
        console.log(`⚡ Performance below target - optimization needed`);
      }
    }
    console.log('='.repeat(80) + '\n');
  }
}

/**
 * Run the test suite if called directly
 */
if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  const testSuite = new MetricsSystemTestSuite();
  
  testSuite.runAllTests()
    .then(() => {
      console.log('🧪 Test suite completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    });
}

export { MetricsSystemTestSuite, TEST_CONFIG };