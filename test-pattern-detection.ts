#!/usr/bin/env tsx

/**
 * TC013: Comprehensive Pattern Detection System Test
 * 
 * Tests the real-time pattern detection system end-to-end:
 * - Service startup and initialization
 * - Pattern detection algorithms (all 5 types)
 * - MCP API endpoints
 * - Database storage and retrieval
 * - Performance benchmarks (sub-100ms target)
 * - Alert generation system
 */

import { startPatternDetection, stopPatternDetection, PatternDetector } from './mcp-server/src/services/patternDetector.js';
import { PatternDetectionHandler } from './mcp-server/src/handlers/patternDetection.js';
import { db } from './mcp-server/src/config/database.js';

interface TestResult {
  testName: string;
  success: boolean;
  executionTime: number;
  details?: any;
  error?: string;
}

class PatternDetectionTester {
  private results: TestResult[] = [];
  private projectId: string = '';
  private sessionId: string = '';

  async runAllTests(): Promise<{
    success: boolean;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    results: TestResult[];
    summary: any;
  }> {
    console.log('🧪 TC013: Starting Pattern Detection System Tests...\n');

    // Test 1: Service Management
    await this.testServiceManagement();

    // Test 2: Database Setup
    await this.testDatabaseSetup();

    // Test 3: Pattern Detection Algorithms
    await this.testPatternDetectionAlgorithms();

    // Test 4: MCP API Endpoints
    await this.testMcpApiEndpoints();

    // Test 5: Performance Benchmarks
    await this.testPerformanceBenchmarks();

    // Test 6: Alert Generation
    await this.testAlertGeneration();

    // Test 7: Integration Test
    await this.testEndToEndIntegration();

    // Generate summary
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = this.results.length - passedTests;
    const totalExecutionTime = this.results.reduce((sum, r) => sum + r.executionTime, 0);

    const summary = {
      totalTests: this.results.length,
      passedTests,
      failedTests,
      successRate: (passedTests / this.results.length) * 100,
      totalExecutionTime,
      averageExecutionTime: totalExecutionTime / this.results.length,
      performanceTarget: this.results.filter(r => r.testName.includes('Performance')).every(r => r.executionTime < 100)
    };

    console.log('\n📊 TEST SUMMARY');
    console.log('================');
    console.log(`Total Tests: ${summary.totalTests}`);
    console.log(`Passed: ${summary.passedTests} (${summary.successRate.toFixed(1)}%)`);
    console.log(`Failed: ${summary.failedTests}`);
    console.log(`Total Execution Time: ${summary.totalExecutionTime}ms`);
    console.log(`Performance Target Met: ${summary.performanceTarget ? '✅' : '❌'}`);

    if (failedTests > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.results.filter(r => !r.success).forEach(r => {
        console.log(`  - ${r.testName}: ${r.error}`);
      });
    }

    return {
      success: failedTests === 0,
      totalTests: this.results.length,
      passedTests,
      failedTests,
      results: this.results,
      summary
    };
  }

  private async testServiceManagement(): Promise<void> {
    console.log('1️⃣  Testing Service Management...');

    // Test service startup
    await this.runTest('Service Startup', async () => {
      await startPatternDetection({
        enableRealTimeDetection: true,
        enableBatchProcessing: true,
        detectionTimeoutMs: 100
      });
      
      const detector = PatternDetector.getInstance();
      const metrics = detector.getMetrics();
      
      return {
        serviceStarted: true,
        metrics
      };
    });

    // Test service status
    await this.runTest('Service Status', async () => {
      const status = await PatternDetectionHandler.getPatternDetectionStatus();
      
      if (!status.success) {
        throw new Error('Service status check failed');
      }
      
      return status;
    });

    // Test service shutdown
    await this.runTest('Service Shutdown', async () => {
      const result = await PatternDetectionHandler.stopPatternDetection();
      
      if (!result.success) {
        throw new Error(`Service shutdown failed: ${result.error}`);
      }
      
      return result;
    });

    console.log('✅ Service Management Tests Completed\n');
  }

  private async testDatabaseSetup(): Promise<void> {
    console.log('2️⃣  Testing Database Setup...');

    await this.runTest('Database Connection', async () => {
      const result = await db.query('SELECT current_database()');
      return {
        database: result.rows[0].current_database,
        connected: true
      };
    });

    await this.runTest('Pattern Tables Exist', async () => {
      const tableCheck = await db.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name IN (
          'pattern_discovery_sessions',
          'file_cooccurrence_patterns', 
          'temporal_patterns',
          'developer_patterns',
          'change_magnitude_patterns',
          'pattern_insights'
        )
        ORDER BY table_name
      `);
      
      const tables = tableCheck.rows.map(r => r.table_name);
      const expectedTables = [
        'change_magnitude_patterns',
        'developer_patterns', 
        'file_cooccurrence_patterns',
        'pattern_discovery_sessions',
        'pattern_insights',
        'temporal_patterns'
      ];
      
      const missingTables = expectedTables.filter(t => !tables.includes(t));
      
      if (missingTables.length > 0) {
        throw new Error(`Missing tables: ${missingTables.join(', ')}`);
      }
      
      return {
        tablesFound: tables.length,
        expectedTables: expectedTables.length,
        allTablesPresent: missingTables.length === 0
      };
    });

    // Set up test data
    await this.runTest('Test Data Setup', async () => {
      // Create test project
      const projectResult = await db.query(`
        INSERT INTO projects (name, description) 
        VALUES ('test-pattern-detection', 'Test project for pattern detection') 
        ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
        RETURNING id
      `);
      this.projectId = projectResult.rows[0].id;

      // Create test session with required token_id
      const sessionResult = await db.query(`
        INSERT INTO user_sessions (project_id, token_id, started_at) 
        VALUES ($1, $2, CURRENT_TIMESTAMP) 
        RETURNING id
      `, [this.projectId, 'test-pattern-detection-token']);
      this.sessionId = sessionResult.rows[0].id;

      return {
        projectId: this.projectId,
        sessionId: this.sessionId
      };
    });

    console.log('✅ Database Setup Tests Completed\n');
  }

  private async testPatternDetectionAlgorithms(): Promise<void> {
    console.log('3️⃣  Testing Pattern Detection Algorithms...');

    // Test co-occurrence pattern detection
    await this.runTest('Co-occurrence Pattern Detection', async () => {
      // Insert test commits and file changes
      const commit1Id = await this.insertTestCommit('abc123', 'Test commit 1');
      const commit2Id = await this.insertTestCommit('def456', 'Test commit 2');
      
      await this.insertTestFileChange(commit1Id, 'src/file1.ts');
      await this.insertTestFileChange(commit1Id, 'src/file2.ts');
      await this.insertTestFileChange(commit2Id, 'src/file1.ts');
      await this.insertTestFileChange(commit2Id, 'src/file2.ts');
      
      const result = await PatternDetectionHandler.detectPatternsForCommits({
        commitShas: [this.generateValidSha('abc123'), this.generateValidSha('def456')],
        projectId: this.projectId
      });
      
      if (!result.success) {
        throw new Error(`Pattern detection failed: ${result.error}`);
      }
      
      return {
        patternsFound: result.result?.totalPatternsFound || 0,
        executionTime: result.result?.executionTimeMs || 0,
        cooccurrencePatterns: result.result?.cooccurrencePatterns?.length || 0
      };
    });

    // Test temporal pattern detection
    await this.runTest('Temporal Pattern Detection', async () => {
      // Create commits spread across different hours
      const commits = [];
      for (let i = 0; i < 10; i++) {
        const date = new Date();
        date.setHours(9 + (i % 8)); // Business hours pattern
        const sha = `temporal${i}`;
        const commitId = await this.insertTestCommit(sha, `Temporal test commit ${i}`, date);
        commits.push(this.generateValidSha(sha));
      }
      
      const result = await PatternDetectionHandler.detectPatternsForCommits({
        commitShas: commits,
        projectId: this.projectId
      });
      
      return {
        temporalPatterns: result.result?.temporalPatterns?.length || 0,
        executionTime: result.result?.temporalTimeMs || 0
      };
    });

    // Test developer pattern detection
    await this.runTest('Developer Pattern Detection', async () => {
      // Create commits from different developers
      const dev1Commits = [];
      const dev2Commits = [];
      
      for (let i = 0; i < 5; i++) {
        const commit1 = await this.insertTestCommit(`dev1_${i}`, `Dev1 commit ${i}`, new Date(), 'dev1@test.com', 'Developer One');
        const commit2 = await this.insertTestCommit(`dev2_${i}`, `Dev2 commit ${i}`, new Date(), 'dev2@test.com', 'Developer Two');
        dev1Commits.push(`dev1_${i}`);
        dev2Commits.push(`dev2_${i}`);
      }
      
      const result = await PatternDetectionHandler.detectPatternsForCommits({
        commitShas: [...dev1Commits, ...dev2Commits],
        projectId: this.projectId
      });
      
      return {
        developerPatterns: result.result?.developerPatterns?.length || 0,
        executionTime: result.result?.developerTimeMs || 0
      };
    });

    // Test change magnitude pattern detection
    await this.runTest('Change Magnitude Pattern Detection', async () => {
      // Create commits with varying file changes
      const commits = [];
      for (let i = 0; i < 5; i++) {
        const commitId = await this.insertTestCommit(`magnitude${i}`, `Magnitude test ${i}`);
        await this.insertTestFileChange(commitId, `src/magnitude${i}.ts`, 10 + i * 50, 5 + i * 10); // Varying sizes
        commits.push(`magnitude${i}`);
      }
      
      const result = await PatternDetectionHandler.detectPatternsForCommits({
        commitShas: commits,
        projectId: this.projectId
      });
      
      return {
        magnitudePatterns: result.result?.magnitudePatterns?.length || 0,
        executionTime: result.result?.magnitudeTimeMs || 0
      };
    });

    console.log('✅ Pattern Detection Algorithm Tests Completed\n');
  }

  private async testMcpApiEndpoints(): Promise<void> {
    console.log('4️⃣  Testing MCP API Endpoints...');

    await this.runTest('Pattern Detection Start API', async () => {
      const result = await PatternDetectionHandler.startPatternDetection({
        enableRealTime: true,
        detectionTimeoutMs: 100
      });
      
      if (!result.success) {
        throw new Error(`API call failed: ${result.error}`);
      }
      
      return result;
    });

    await this.runTest('Session Insights API', async () => {
      const result = await PatternDetectionHandler.getSessionPatternInsights({
        sessionId: this.sessionId,
        confidenceThreshold: 0.1
      });
      
      if (!result.success) {
        throw new Error(`API call failed: ${result.error}`);
      }
      
      return {
        totalInsights: result.totalInsights,
        highRiskInsights: result.highRiskInsights,
        criticalInsights: result.criticalInsights
      };
    });

    await this.runTest('Project Analysis API', async () => {
      const result = await PatternDetectionHandler.analyzeProjectPatterns({
        projectId: this.projectId,
        timeRangeHours: 24
      });
      
      if (!result.success) {
        throw new Error(`API call failed: ${result.error}`);
      }
      
      return result.analysis;
    });

    await this.runTest('Pattern Alerts API', async () => {
      const result = await PatternDetectionHandler.getPatternAlerts({
        projectId: this.projectId,
        timeRangeHours: 24
      });
      
      if (!result.success) {
        throw new Error(`API call failed: ${result.error}`);
      }
      
      return {
        totalAlerts: result.totalAlerts,
        criticalAlerts: result.criticalAlerts,
        warningAlerts: result.warningAlerts
      };
    });

    console.log('✅ MCP API Endpoint Tests Completed\n');
  }

  private async testPerformanceBenchmarks(): Promise<void> {
    console.log('5️⃣  Testing Performance Benchmarks...');

    await this.runTest('Sub-100ms Detection Performance', async () => {
      const startTime = Date.now();
      
      // Create a moderate number of commits for performance testing
      const commits = [];
      for (let i = 0; i < 10; i++) {
        await this.insertTestCommit(`perf${i}`, `Performance test commit ${i}`);
        commits.push(`perf${i}`);
      }
      
      const detectionStart = Date.now();
      const result = await PatternDetectionHandler.detectPatternsForCommits({
        commitShas: commits,
        projectId: this.projectId
      });
      const detectionTime = Date.now() - detectionStart;
      
      const setupTime = detectionStart - startTime;
      
      if (!result.success) {
        throw new Error('Pattern detection failed during performance test');
      }
      
      return {
        detectionTime,
        setupTime,
        totalTime: Date.now() - startTime,
        meetsPerformanceTarget: detectionTime < 100,
        patternsFound: result.result?.totalPatternsFound || 0
      };
    });

    await this.runTest('Batch Processing Performance', async () => {
      const startTime = Date.now();
      
      // Test larger batch
      const commits = [];
      for (let i = 0; i < 25; i++) {
        await this.insertTestCommit(`batch${i}`, `Batch test commit ${i}`);
        commits.push(`batch${i}`);
      }
      
      const result = await PatternDetectionHandler.detectPatternsForCommits({
        commitShas: commits,
        projectId: this.projectId
      });
      
      const executionTime = Date.now() - startTime;
      
      return {
        executionTime,
        commitsProcessed: commits.length,
        throughput: commits.length / (executionTime / 1000),
        success: result.success
      };
    });

    console.log('✅ Performance Benchmark Tests Completed\n');
  }

  private async testAlertGeneration(): Promise<void> {
    console.log('6️⃣  Testing Alert Generation...');

    await this.runTest('Critical Risk File Alerts', async () => {
      // Create a high-risk file pattern
      const commitId = await this.insertTestCommit('highrisk1', 'High risk commit');
      await this.insertTestFileChange(commitId, 'src/critical.ts', 500, 100); // Large changes
      
      const result = await PatternDetectionHandler.detectPatternsForCommits({
        commitShas: ['highrisk1'],
        projectId: this.projectId
      });
      
      const alerts = await PatternDetectionHandler.getPatternAlerts({
        projectId: this.projectId,
        severityFilter: ['critical', 'warning']
      });
      
      return {
        patternsDetected: result.result?.totalPatternsFound || 0,
        alertsGenerated: alerts.totalAlerts,
        criticalAlerts: alerts.criticalAlerts,
        hasAlerts: alerts.totalAlerts > 0
      };
    });

    await this.runTest('Coupling Alerts', async () => {
      // Create strong coupling pattern
      for (let i = 0; i < 5; i++) {
        const commitId = await this.insertTestCommit(`coupling${i}`, `Coupling commit ${i}`);
        await this.insertTestFileChange(commitId, 'src/coupled1.ts');
        await this.insertTestFileChange(commitId, 'src/coupled2.ts');
      }
      
      const result = await PatternDetectionHandler.detectPatternsForCommits({
        commitShas: ['coupling0', 'coupling1', 'coupling2', 'coupling3', 'coupling4'],
        projectId: this.projectId
      });
      
      return {
        cooccurrencePatterns: result.result?.cooccurrencePatterns?.length || 0,
        strongPatterns: result.result?.cooccurrencePatterns?.filter(p => p.patternStrength === 'strong' || p.patternStrength === 'very_strong').length || 0
      };
    });

    console.log('✅ Alert Generation Tests Completed\n');
  }

  private async testEndToEndIntegration(): Promise<void> {
    console.log('7️⃣  Testing End-to-End Integration...');

    await this.runTest('Complete Workflow Integration', async () => {
      const startTime = Date.now();
      
      // 1. Start service
      await PatternDetectionHandler.startPatternDetection({
        enableRealTime: true,
        detectionTimeoutMs: 100
      });
      
      // 2. Create diverse commit patterns
      const commits = [];
      
      // Different developers
      for (let i = 0; i < 3; i++) {
        const commitId = await this.insertTestCommit(`integration_dev1_${i}`, `Dev1 integration ${i}`, new Date(), 'dev1@integration.com');
        await this.insertTestFileChange(commitId, 'src/integration1.ts');
        commits.push(`integration_dev1_${i}`);
      }
      
      for (let i = 0; i < 3; i++) {
        const commitId = await this.insertTestCommit(`integration_dev2_${i}`, `Dev2 integration ${i}`, new Date(), 'dev2@integration.com');
        await this.insertTestFileChange(commitId, 'src/integration2.ts');
        commits.push(`integration_dev2_${i}`);
      }
      
      // Coupled files
      for (let i = 0; i < 4; i++) {
        const commitId = await this.insertTestCommit(`integration_coupled_${i}`, `Coupled integration ${i}`);
        await this.insertTestFileChange(commitId, 'src/service.ts');
        await this.insertTestFileChange(commitId, 'src/service.test.ts');
        commits.push(`integration_coupled_${i}`);
      }
      
      // 3. Detect patterns
      const detectionResult = await PatternDetectionHandler.detectPatternsForCommits({
        commitShas: commits,
        projectId: this.projectId
      });
      
      // 4. Get insights
      const insightsResult = await PatternDetectionHandler.getSessionPatternInsights({
        sessionId: this.sessionId
      });
      
      // 5. Get project analysis
      const analysisResult = await PatternDetectionHandler.analyzeProjectPatterns({
        projectId: this.projectId
      });
      
      // 6. Get alerts
      const alertsResult = await PatternDetectionHandler.getPatternAlerts({
        projectId: this.projectId
      });
      
      // 7. Stop service
      const stopResult = await PatternDetectionHandler.stopPatternDetection();
      
      const totalTime = Date.now() - startTime;
      
      return {
        totalExecutionTime: totalTime,
        patternsDetected: detectionResult.result?.totalPatternsFound || 0,
        insightsGenerated: insightsResult.totalInsights,
        alertsGenerated: alertsResult.totalAlerts,
        serviceStoppedSuccessfully: stopResult.success,
        allStepsSuccessful: [
          detectionResult.success,
          insightsResult.success,
          analysisResult.success,
          alertsResult.success,
          stopResult.success
        ].every(s => s === true)
      };
    });

    console.log('✅ End-to-End Integration Tests Completed\n');
  }

  // Helper methods

  private generateValidSha(baseString: string): string {
    // Generate valid 40-character hex SHA
    const fullSha = (baseString + '0'.repeat(40)).substring(0, 40);
    return fullSha.replace(/[^a-f0-9]/g, 'a');
  }

  private async runTest(testName: string, testFn: () => Promise<any>): Promise<void> {
    const startTime = Date.now();
    
    try {
      const details = await testFn();
      const executionTime = Date.now() - startTime;
      
      this.results.push({
        testName,
        success: true,
        executionTime,
        details
      });
      
      console.log(`  ✅ ${testName} (${executionTime}ms)`);
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      this.results.push({
        testName,
        success: false,
        executionTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      console.log(`  ❌ ${testName} (${executionTime}ms): ${error instanceof Error ? error.message : error}`);
    }
  }

  private async insertTestCommit(
    sha: string, 
    message: string, 
    date: Date = new Date(),
    authorEmail: string = 'test@example.com',
    authorName: string = 'Test User'
  ): Promise<string> {
    const hexSha = this.generateValidSha(sha);
    
    const result = await db.query(`
      INSERT INTO git_commits (
        project_id, commit_sha, message, author_name, author_email, 
        author_date, committer_name, committer_email, committer_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $4, $5, $6)
      ON CONFLICT (project_id, commit_sha) DO UPDATE SET message = EXCLUDED.message
      RETURNING id
    `, [this.projectId, hexSha, message, authorName, authorEmail, date]);
    
    return result.rows[0].id;
  }

  private async insertTestFileChange(
    commitId: string, 
    filePath: string, 
    linesAdded: number = 10, 
    linesRemoved: number = 5
  ): Promise<void> {
    await db.query(`
      INSERT INTO git_file_changes (
        project_id, commit_id, file_path, change_type, lines_added, lines_removed
      ) VALUES ($1, $2, $3, 'modified', $4, $5)
      ON CONFLICT DO NOTHING
    `, [this.projectId, commitId, filePath, linesAdded, linesRemoved]);
  }
}

// Run the tests
async function main() {
  const tester = new PatternDetectionTester();
  
  try {
    const results = await tester.runAllTests();
    
    console.log('\n🎯 FINAL RESULT');
    console.log('================');
    
    if (results.success) {
      console.log('🎉 ALL TESTS PASSED!');
      console.log('✅ TC013 Pattern Detection System is fully operational');
      console.log(`✅ Performance target met: ${results.summary.performanceTarget ? 'YES' : 'NO'}`);
    } else {
      console.log('❌ SOME TESTS FAILED');
      console.log(`❌ Failed: ${results.failedTests}/${results.totalTests} tests`);
    }
    
    process.exit(results.success ? 0 : 1);
    
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}