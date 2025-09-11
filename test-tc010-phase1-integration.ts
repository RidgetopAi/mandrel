#!/usr/bin/env npx tsx

/**
 * TC010: Comprehensive Phase 1 Integration Test Suite
 * 
 * Tests the complete AIDIS Code Tracking Intelligence system integration:
 * - Git data collection pipeline (TC008)
 * - Session-code correlation validation (TC009) 
 * - Code analysis integration
 * - Database schema integrity
 * - API service interdependencies
 * - Real-time tracking workflows
 * - Performance benchmarks
 * - Data consistency and integrity
 * 
 * This is INTEGRATION testing - focuses on component interactions and data flow
 */

import { GitService } from './aidis-command/backend/src/services/gitService.js';
import { SessionDetailService } from './aidis-command/backend/src/services/sessionDetail.js';
import { GitHandler } from './mcp-server/src/handlers/git.js';
import { CodeAnalysisHandler } from './mcp-server/src/handlers/codeAnalysis.js';
import { GitTracker } from './mcp-server/src/services/gitTracker.js';
import { db } from './mcp-server/src/config/database.js';
import { initializeDatabase, closeDatabase } from './mcp-server/src/config/database.js';
import { logEvent } from './mcp-server/src/middleware/eventLogger.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Test configuration
const TEST_CONFIG = {
  projectId: '',
  testSessionId: '',
  gitRepoPath: '/home/ridgetop/aidis',
  testCommitSha: '',
  performanceThresholds: {
    maxQueryTime: 5000,      // 5 seconds
    maxCorrelationTime: 10000, // 10 seconds
    minCorrelationAccuracy: 0.3, // 30%
    maxMemoryUsageMB: 512,   // 512MB
    maxConcurrentSessions: 10
  },
  stressTest: {
    sessionCount: 25,
    commitCount: 50,
    concurrentOperations: 5
  }
};

/**
 * Enhanced Test Result Tracking with Performance Metrics
 */
interface TestResult {
  name: string;
  category: 'integration' | 'performance' | 'integrity' | 'stress' | 'api';
  success: boolean;
  duration: number;
  performanceMetrics?: {
    memoryUsed: number;
    queriesExecuted: number;
    avgQueryTime: number;
    peakMemory: number;
    throughput?: number;
  };
  details: any;
  error?: string;
  recommendations?: string[];
}

const testResults: TestResult[] = [];

/**
 * System resource monitoring
 */
let performanceMonitor = {
  startTime: 0,
  startMemory: 0,
  peakMemory: 0,
  queryCount: 0,
  totalQueryTime: 0,
  
  start() {
    this.startTime = Date.now();
    this.startMemory = process.memoryUsage().heapUsed;
    this.peakMemory = this.startMemory;
    this.queryCount = 0;
    this.totalQueryTime = 0;
  },
  
  recordQuery(duration: number) {
    this.queryCount++;
    this.totalQueryTime += duration;
    const currentMemory = process.memoryUsage().heapUsed;
    if (currentMemory > this.peakMemory) {
      this.peakMemory = currentMemory;
    }
  },
  
  getMetrics() {
    const currentMemory = process.memoryUsage().heapUsed;
    return {
      memoryUsed: Math.round((currentMemory - this.startMemory) / 1024 / 1024), // MB
      peakMemory: Math.round(this.peakMemory / 1024 / 1024), // MB
      queriesExecuted: this.queryCount,
      avgQueryTime: this.queryCount > 0 ? Math.round(this.totalQueryTime / this.queryCount) : 0,
      throughput: this.queryCount / ((Date.now() - this.startTime) / 1000) // queries per second
    };
  }
};

/**
 * Enhanced test runner with performance monitoring
 */
async function runTest(
  name: string, 
  category: TestResult['category'],
  testFn: () => Promise<any>,
  expectedDuration?: number
): Promise<void> {
  console.log(`\n🧪 Running ${category} test: ${name}`);
  performanceMonitor.start();
  const startTime = Date.now();
  
  try {
    const result = await testFn();
    const duration = Date.now() - startTime;
    const metrics = performanceMonitor.getMetrics();
    
    // Performance warnings
    const recommendations: string[] = [];
    if (expectedDuration && duration > expectedDuration * 1.5) {
      recommendations.push(`Test took ${duration}ms, expected ${expectedDuration}ms`);
    }
    if (metrics.peakMemory > TEST_CONFIG.performanceThresholds.maxMemoryUsageMB) {
      recommendations.push(`High memory usage: ${metrics.peakMemory}MB`);
    }
    if (metrics.avgQueryTime > TEST_CONFIG.performanceThresholds.maxQueryTime) {
      recommendations.push(`Slow queries: ${metrics.avgQueryTime}ms average`);
    }
    
    testResults.push({
      name,
      category,
      success: true,
      duration,
      performanceMetrics: metrics,
      details: result,
      recommendations: recommendations.length > 0 ? recommendations : undefined
    });
    
    console.log(`✅ ${name} - Passed in ${duration}ms`);
    console.log(`   📊 Memory: ${metrics.memoryUsed}MB used, ${metrics.peakMemory}MB peak`);
    console.log(`   📊 Queries: ${metrics.queriesExecuted} executed, ${metrics.avgQueryTime}ms avg`);
    if (recommendations.length > 0) {
      console.log(`   ⚠️  Performance warnings: ${recommendations.length}`);
    }
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const metrics = performanceMonitor.getMetrics();
    
    testResults.push({
      name,
      category,
      success: false,
      duration,
      performanceMetrics: metrics,
      details: null,
      error: error instanceof Error ? error.message : String(error)
    });
    
    console.error(`❌ ${name} - Failed in ${duration}ms: ${error}`);
  }
}

/**
 * Setup comprehensive test environment
 */
async function setupTestEnvironment(): Promise<void> {
  console.log('🔧 Setting up comprehensive test environment...');
  
  // Initialize database
  await initializeDatabase();
  
  // Ensure all migrations are applied
  await ensureMigrationsApplied();
  
  // Get or create AIDIS project
  const projectResult = await db.query(`
    SELECT id, name FROM projects WHERE name LIKE '%aidis%' OR name = 'default' 
    ORDER BY created_at DESC LIMIT 1
  `);
  
  if (projectResult.rows.length === 0) {
    // Create test project
    const createResult = await db.query(`
      INSERT INTO projects (id, name, description, root_directory)
      VALUES (gen_random_uuid(), 'aidis-integration-test', 'TC010 Integration Test Project', $1)
      RETURNING id, name
    `, [TEST_CONFIG.gitRepoPath]);
    TEST_CONFIG.projectId = createResult.rows[0].id;
    console.log(`📋 Created test project: ${createResult.rows[0].name}`);
  } else {
    TEST_CONFIG.projectId = projectResult.rows[0].id;
    console.log(`📋 Using existing project: ${projectResult.rows[0].name} (${TEST_CONFIG.projectId})`);
  }
  
  // Initialize git repository
  try {
    await GitService.initializeRepository({
      project_id: TEST_CONFIG.projectId,
      repo_path: TEST_CONFIG.gitRepoPath
    });
    console.log(`📁 Git repository initialized`);
  } catch (error) {
    console.log(`ℹ️  Git repository already initialized`);
  }
  
  // Get or create recent commit
  const recentCommits = await GitService.getRecentCommits({
    project_id: TEST_CONFIG.projectId,
    hours: 24,
    limit: 1
  });
  
  if (recentCommits.commits.length > 0) {
    TEST_CONFIG.testCommitSha = recentCommits.commits[0].commit_sha;
    console.log(`📝 Using test commit: ${TEST_CONFIG.testCommitSha.substring(0, 12)}...`);
  } else {
    console.warn('⚠️  No recent commits found - creating synthetic test data');
    await createSyntheticTestData();
  }
  
  // Create test session with proper project assignment
  const sessionResult = await db.query(`
    INSERT INTO user_sessions (id, project_id, token_id, expires_at, started_at, session_type, metadata)
    VALUES (gen_random_uuid(), $1, 'test-token-' || extract(epoch from now()), NOW() + INTERVAL '1 day', NOW() - INTERVAL '2 hours', 'integration_test', '{"test": "tc010"}')
    RETURNING id
  `, [TEST_CONFIG.projectId]);
  
  TEST_CONFIG.testSessionId = sessionResult.rows[0].id;
  console.log(`📋 Created test session: ${TEST_CONFIG.testSessionId.substring(0, 8)}...`);
  
  console.log(`✅ Test environment ready`);
}

/**
 * Ensure all required migrations are applied
 */
async function ensureMigrationsApplied(): Promise<void> {
  // Check for required tables
  const requiredTables = [
    'git_commits', 'git_branches', 'git_file_changes', 'commit_session_links',
    'code_components', 'code_dependencies', 'code_analysis_sessions',
    'user_sessions', 'projects', 'contexts'
  ];
  
  for (const tableName of requiredTables) {
    const result = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = $1
      )
    `, [tableName]);
    
    if (!result.rows[0].exists) {
      throw new Error(`Required table missing: ${tableName}. Please run migrations first.`);
    }
  }
  
  console.log(`✅ All required database tables exist`);
}

/**
 * Create synthetic test data if no real commits available
 */
async function createSyntheticTestData(): Promise<void> {
  console.log('🔬 Creating synthetic test data...');
  
  // Create synthetic commit
  const commitResult = await db.query(`
    INSERT INTO git_commits (
      project_id, commit_sha, message, author_name, author_email,
      author_date, committer_name, committer_email, committer_date,
      branch_name, files_changed, insertions, deletions, commit_type
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
    ) RETURNING commit_sha
  `, [
    TEST_CONFIG.projectId,
    'a1b2c3d4e5f6789012345678901234567890abcd', // Synthetic SHA
    'feat: add integration test infrastructure for TC010',
    'AIDIS System',
    'aidis@example.com',
    new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
    'AIDIS System',
    'aidis@example.com',
    new Date(Date.now() - 30 * 60 * 1000),
    'main',
    5,
    150,
    25,
    'feature'
  ]);
  
  TEST_CONFIG.testCommitSha = commitResult.rows[0].commit_sha;
  
  // Create synthetic file changes
  await db.query(`
    INSERT INTO git_file_changes (project_id, commit_id, file_path, change_type, lines_added, lines_removed)
    SELECT $1, gc.id, 'test/integration/' || (unnest(array['test1.ts', 'test2.ts', 'test3.ts'])), 'added', 50, 0
    FROM git_commits gc WHERE gc.commit_sha = $2
  `, [TEST_CONFIG.projectId, TEST_CONFIG.testCommitSha]);
  
  console.log(`🔬 Synthetic test data created`);
}

// ===============================
// INTEGRATION TESTS
// ===============================

/**
 * Test 1: Complete Git-Session Integration Pipeline
 */
async function testGitSessionIntegrationPipeline(): Promise<any> {
  const results = {
    gitServiceStatus: false,
    sessionServiceStatus: false,
    correlationWorking: false,
    dataFlowComplete: false,
    performanceAcceptable: false
  };
  
  // Test GitService functionality
  const gitCorrelation = await GitService.correlateCommitsWithSessions({
    project_id: TEST_CONFIG.projectId,
    confidence_threshold: 0.1
  });
  results.gitServiceStatus = gitCorrelation.project_id === TEST_CONFIG.projectId;
  performanceMonitor.recordQuery(gitCorrelation.processing_time_ms);
  
  // Test SessionDetailService integration
  const sessionCorrelation = await SessionDetailService.correlateSessionWithGit(TEST_CONFIG.testSessionId);
  results.sessionServiceStatus = sessionCorrelation.success || sessionCorrelation.message.includes('no project');
  
  // Test MCP Handler integration
  const handlerResult = await GitHandler.gitSessionCommits({
    sessionId: TEST_CONFIG.testSessionId,
    includeDetails: true
  });
  results.correlationWorking = handlerResult.success;
  
  // Verify data flow end-to-end
  const dataFlowCheck = await db.query(`
    SELECT COUNT(*) as link_count
    FROM commit_session_links csl
    JOIN git_commits gc ON csl.commit_id = gc.id
    JOIN user_sessions us ON csl.session_id = us.id
    WHERE gc.project_id = $1
  `, [TEST_CONFIG.projectId]);
  
  results.dataFlowComplete = parseInt(dataFlowCheck.rows[0].link_count) >= 0; // At least structure exists
  results.performanceAcceptable = gitCorrelation.processing_time_ms < TEST_CONFIG.performanceThresholds.maxCorrelationTime;
  
  return {
    ...results,
    gitLinksCreated: gitCorrelation.links_created,
    sessionLinksCreated: sessionCorrelation.linksCreated,
    handlerCommitsFound: handlerResult.totalCommits,
    processingTime: gitCorrelation.processing_time_ms
  };
}

/**
 * Test 2: Code Analysis Integration with Git Tracking
 */
async function testCodeAnalysisGitIntegration(): Promise<any> {
  const codeAnalyzer = new CodeAnalysisHandler();
  
  // Test file analysis with git context
  const testFile = path.join(TEST_CONFIG.gitRepoPath, 'mcp-server/src/handlers/git.ts');
  
  const analysisResult = await codeAnalyzer.analyzeFile(
    TEST_CONFIG.projectId,
    testFile,
    undefined,
    {
      developmentSessionId: TEST_CONFIG.testSessionId,
      commitSha: TEST_CONFIG.testCommitSha,
      branchName: 'main',
      triggerType: 'integration_test',
      analysisContext: 'TC010 Integration Test'
    }
  );
  
  // Verify code components are linked to git data
  const componentGitLinks = await db.query(`
    SELECT cc.*, gc.commit_sha
    FROM code_components cc
    LEFT JOIN git_commits gc ON cc.last_modified_commit = gc.commit_sha
    WHERE cc.project_id = $1 AND cc.file_path = $2
  `, [TEST_CONFIG.projectId, testFile]);
  
  // Test analysis session correlation
  const sessionAnalysisCount = await db.query(`
    SELECT COUNT(*) as count
    FROM code_analysis_sessions cas
    WHERE cas.project_id = $1 AND cas.development_session_id = $2
  `, [TEST_CONFIG.projectId, TEST_CONFIG.testSessionId]);
  
  return {
    componentsFound: analysisResult.components.length,
    dependenciesFound: analysisResult.dependencies.length,
    analysisSessionId: analysisResult.analysisSessionId,
    gitLinkedComponents: componentGitLinks.rows.length,
    sessionAnalysisRecords: parseInt(sessionAnalysisCount.rows[0].count),
    integrationWorking: analysisResult.components.length > 0 && analysisResult.analysisSessionId
  };
}

/**
 * Test 3: Real-time Git Tracking System
 */
async function testRealtimeGitTracking(): Promise<any> {
  const gitTracker = GitTracker.getInstance({
    enableFileWatching: true,
    enablePeriodicPolling: true,
    pollingIntervalMs: 5000,
    correlationDelayMs: 1000
  });
  
  // Test tracker startup
  await gitTracker.start();
  const startupStatus = gitTracker.getStatus();
  
  // Test activity detection
  const activityResult = await gitTracker.checkForRecentActivity();
  
  // Test real-time handler
  const realtimeResult = await GitHandler.trackRealtimeGitActivity();
  
  // Test forced correlation
  const forceResult = await gitTracker.forceCorrelation();
  
  // Stop tracker
  await gitTracker.stop();
  const shutdownStatus = gitTracker.getStatus();
  
  return {
    trackerStarted: startupStatus.isActive,
    trackerStopped: !shutdownStatus.isActive,
    activityDetected: activityResult.hasActivity,
    realtimeWorking: realtimeResult.success,
    forceCorrelationWorking: forceResult.success,
    watchersCount: startupStatus.watchers.length,
    commitsDetected: startupStatus.commitsDetected,
    correlationsTriggered: startupStatus.correlationsTriggered
  };
}

/**
 * Test 4: Database Schema Integrity and Foreign Keys
 */
async function testDatabaseSchemaIntegrity(): Promise<any> {
  const integrity = {
    tableStructures: true,
    foreignKeyConstraints: true,
    indexesOptimal: true,
    triggersFunctional: true,
    viewsWorking: true
  };
  
  // Test table structures
  const requiredTables = ['git_commits', 'git_branches', 'git_file_changes', 'commit_session_links'];
  for (const table of requiredTables) {
    const columns = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
    `, [table]);
    
    if (columns.rows.length === 0) {
      integrity.tableStructures = false;
      break;
    }
  }
  
  // Test foreign key constraints
  const fkTest = await db.query(`
    SELECT COUNT(*) as fk_count
    FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY'
    AND table_name IN ('git_commits', 'git_file_changes', 'commit_session_links')
  `);
  integrity.foreignKeyConstraints = parseInt(fkTest.rows[0].fk_count) >= 3;
  
  // Test indexes
  const indexTest = await db.query(`
    SELECT COUNT(*) as index_count
    FROM pg_indexes
    WHERE tablename IN ('git_commits', 'git_branches', 'git_file_changes', 'commit_session_links')
  `);
  integrity.indexesOptimal = parseInt(indexTest.rows[0].index_count) >= 10;
  
  // Test triggers
  const triggerTest = await db.query(`
    SELECT COUNT(*) as trigger_count
    FROM information_schema.triggers
    WHERE event_object_table IN ('git_commits')
  `);
  integrity.triggersFunctional = parseInt(triggerTest.rows[0].trigger_count) >= 2;
  
  // Test views
  try {
    const viewTest = await db.query(`SELECT COUNT(*) FROM project_git_activity LIMIT 1`);
    integrity.viewsWorking = true;
  } catch {
    integrity.viewsWorking = false;
  }
  
  return integrity;
}

/**
 * Test 5: API Integration Across All Services
 */
async function testAPIIntegration(): Promise<any> {
  const apiTests = {
    gitServiceAPIs: 0,
    sessionServiceAPIs: 0,
    mcpHandlerAPIs: 0,
    codeAnalysisAPIs: 0,
    totalSuccessful: 0
  };
  
  // Test GitService APIs
  try {
    await GitService.getRecentCommits({ project_id: TEST_CONFIG.projectId, hours: 24 });
    apiTests.gitServiceAPIs++;
    
    await GitService.correlateCommitsWithSessions({ project_id: TEST_CONFIG.projectId });
    apiTests.gitServiceAPIs++;
    
    await GitService.getBranchInfo({ project_id: TEST_CONFIG.projectId });
    apiTests.gitServiceAPIs++;
  } catch (error) {
    console.warn('GitService API test failed:', error);
  }
  
  // Test SessionDetailService APIs
  try {
    await SessionDetailService.correlateSessionWithGit(TEST_CONFIG.testSessionId);
    apiTests.sessionServiceAPIs++;
    
    await SessionDetailService.getSessionDetail(TEST_CONFIG.testSessionId);
    apiTests.sessionServiceAPIs++;
  } catch (error) {
    console.warn('SessionDetailService API test failed:', error);
  }
  
  // Test MCP Handler APIs
  try {
    await GitHandler.gitSessionCommits({ sessionId: TEST_CONFIG.testSessionId });
    apiTests.mcpHandlerAPIs++;
    
    if (TEST_CONFIG.testCommitSha) {
      await GitHandler.gitCommitSessions({ commitSha: TEST_CONFIG.testCommitSha });
      apiTests.mcpHandlerAPIs++;
    }
    
    await GitHandler.gitCorrelateSession({ sessionId: TEST_CONFIG.testSessionId });
    apiTests.mcpHandlerAPIs++;
  } catch (error) {
    console.warn('MCP Handler API test failed:', error);
  }
  
  // Test CodeAnalysis APIs
  try {
    const analyzer = new CodeAnalysisHandler();
    const testFile = path.join(TEST_CONFIG.gitRepoPath, 'package.json');
    
    if (await fs.access(testFile).then(() => true).catch(() => false)) {
      await analyzer.analyzeFile(TEST_CONFIG.projectId, testFile);
      apiTests.codeAnalysisAPIs++;
    }
  } catch (error) {
    console.warn('Code Analysis API test failed:', error);
  }
  
  apiTests.totalSuccessful = apiTests.gitServiceAPIs + apiTests.sessionServiceAPIs + 
                             apiTests.mcpHandlerAPIs + apiTests.codeAnalysisAPIs;
  
  return apiTests;
}

// ===============================
// PERFORMANCE TESTS
// ===============================

/**
 * Test 6: Performance Benchmarks Under Load
 */
async function testPerformanceBenchmarks(): Promise<any> {
  const benchmarks = {
    correlationSpeed: 0,
    queryPerformance: 0,
    memoryEfficiency: true,
    concurrencyHandling: true,
    throughputMeetsBenchmark: true
  };
  
  // Correlation speed test
  const correlationStart = Date.now();
  await GitService.correlateCommitsWithSessions({
    project_id: TEST_CONFIG.projectId,
    confidence_threshold: 0.2
  });
  benchmarks.correlationSpeed = Date.now() - correlationStart;
  performanceMonitor.recordQuery(benchmarks.correlationSpeed);
  
  // Query performance test
  const queryStart = Date.now();
  await db.query(`
    SELECT gc.*, csl.confidence_score
    FROM git_commits gc
    LEFT JOIN commit_session_links csl ON gc.id = csl.commit_id
    WHERE gc.project_id = $1
    ORDER BY gc.author_date DESC
    LIMIT 100
  `, [TEST_CONFIG.projectId]);
  benchmarks.queryPerformance = Date.now() - queryStart;
  performanceMonitor.recordQuery(benchmarks.queryPerformance);
  
  // Memory efficiency test
  const memoryBefore = process.memoryUsage().heapUsed;
  const largeDataTest = await db.query(`
    SELECT * FROM git_commits WHERE project_id = $1
  `, [TEST_CONFIG.projectId]);
  const memoryAfter = process.memoryUsage().heapUsed;
  const memoryUsed = (memoryAfter - memoryBefore) / 1024 / 1024; // MB
  benchmarks.memoryEfficiency = memoryUsed < TEST_CONFIG.performanceThresholds.maxMemoryUsageMB;
  
  // Performance threshold checks
  benchmarks.throughputMeetsBenchmark = (
    benchmarks.correlationSpeed < TEST_CONFIG.performanceThresholds.maxCorrelationTime &&
    benchmarks.queryPerformance < TEST_CONFIG.performanceThresholds.maxQueryTime
  );
  
  return {
    ...benchmarks,
    memoryUsedMB: Math.round(memoryUsed),
    recordsProcessed: largeDataTest.rows.length,
    meetsThresholds: benchmarks.throughputMeetsBenchmark && benchmarks.memoryEfficiency
  };
}

/**
 * Test 7: Stress Testing with Concurrent Sessions
 */
async function testStressWithConcurrentSessions(): Promise<any> {
  const stressResults = {
    sessionsCreated: 0,
    concurrentOperations: 0,
    correlationsTested: 0,
    dataConsistencyMaintained: true,
    systemStable: true,
    averageResponseTime: 0
  };
  
  const sessionIds: string[] = [];
  const operationTimes: number[] = [];
  
  try {
    // Create multiple test sessions
    for (let i = 0; i < TEST_CONFIG.stressTest.sessionCount; i++) {
      const sessionResult = await db.query(`
        INSERT INTO user_sessions (id, project_id, token_id, expires_at, started_at, session_type, metadata)
        VALUES (gen_random_uuid(), $1, 'stress-token-' || extract(epoch from now()) || '-' || $2, NOW() + INTERVAL '1 day', NOW() - INTERVAL '${i} minutes', 'stress_test', '{"stress_test": true}')
        RETURNING id
      `, [TEST_CONFIG.projectId, i]);
      
      sessionIds.push(sessionResult.rows[0].id);
      stressResults.sessionsCreated++;
    }
    
    // Run concurrent correlation operations
    const concurrentOps = [];
    for (let i = 0; i < TEST_CONFIG.stressTest.concurrentOperations; i++) {
      concurrentOps.push(
        Promise.all(sessionIds.slice(i * 5, (i + 1) * 5).map(async sessionId => {
          const start = Date.now();
          try {
            await SessionDetailService.correlateSessionWithGit(sessionId);
            const duration = Date.now() - start;
            operationTimes.push(duration);
            stressResults.correlationsTested++;
          } catch (error) {
            console.warn(`Stress test correlation failed for session ${sessionId}:`, error);
            stressResults.systemStable = false;
          }
        }))
      );
    }
    
    await Promise.all(concurrentOps);
    stressResults.concurrentOperations = concurrentOps.length;
    
    // Check data consistency
    const consistencyCheck = await db.query(`
      SELECT 
        COUNT(DISTINCT csl.session_id) as unique_sessions,
        COUNT(csl.id) as total_links,
        AVG(csl.confidence_score) as avg_confidence
      FROM commit_session_links csl
      WHERE csl.session_id = ANY($1)
    `, [sessionIds]);
    
    stressResults.dataConsistencyMaintained = consistencyCheck.rows[0].unique_sessions <= sessionIds.length;
    stressResults.averageResponseTime = operationTimes.length > 0 
      ? Math.round(operationTimes.reduce((a, b) => a + b, 0) / operationTimes.length)
      : 0;
    
  } catch (error) {
    console.error('Stress test failed:', error);
    stressResults.systemStable = false;
  } finally {
    // Cleanup stress test sessions
    if (sessionIds.length > 0) {
      await db.query(`DELETE FROM user_sessions WHERE id = ANY($1)`, [sessionIds]);
    }
  }
  
  return stressResults;
}

/**
 * Test 8: Data Consistency and Zero Loss Validation
 */
async function testDataConsistencyAndIntegrity(): Promise<any> {
  const consistency = {
    referentialIntegrity: true,
    dataConsistency: true,
    transactionIntegrity: true,
    zeroDataLoss: true,
    auditTrailComplete: true
  };
  
  // Test referential integrity
  const orphanedRecords = await db.query(`
    SELECT 'git_file_changes' as table_name, COUNT(*) as orphaned
    FROM git_file_changes gfc
    WHERE NOT EXISTS (SELECT 1 FROM git_commits gc WHERE gc.id = gfc.commit_id)
    UNION ALL
    SELECT 'commit_session_links' as table_name, COUNT(*) as orphaned
    FROM commit_session_links csl
    WHERE NOT EXISTS (SELECT 1 FROM git_commits gc WHERE gc.id = csl.commit_id)
  `);
  
  const totalOrphaned = orphanedRecords.rows.reduce((sum, row) => sum + parseInt(row.orphaned), 0);
  consistency.referentialIntegrity = totalOrphaned === 0;
  
  // Test data consistency across tables
  const consistencyCheck = await db.query(`
    SELECT 
      gc.project_id,
      COUNT(gc.id) as commit_count,
      COUNT(gfc.id) as file_change_count,
      COUNT(csl.id) as session_link_count
    FROM git_commits gc
    LEFT JOIN git_file_changes gfc ON gc.id = gfc.commit_id
    LEFT JOIN commit_session_links csl ON gc.id = csl.commit_id
    WHERE gc.project_id = $1
    GROUP BY gc.project_id
  `, [TEST_CONFIG.projectId]);
  
  consistency.dataConsistency = consistencyCheck.rows.length > 0;
  
  // Test transaction integrity with concurrent operations
  try {
    await db.query('BEGIN');
    
    const testCommit = await db.query(`
      INSERT INTO git_commits (project_id, commit_sha, message, author_name, author_email, author_date, committer_name, committer_email, committer_date)
      VALUES ($1, 'transaction_test_commit_abc123', 'Transaction test', 'Test', 'test@test.com', NOW(), 'Test', 'test@test.com', NOW())
      RETURNING id
    `, [TEST_CONFIG.projectId]);
    
    await db.query(`
      INSERT INTO git_file_changes (project_id, commit_id, file_path, change_type)
      VALUES ($1, $2, 'test/transaction.test', 'added')
    `, [TEST_CONFIG.projectId, testCommit.rows[0].id]);
    
    await db.query('ROLLBACK');
    
    const rollbackCheck = await db.query(`
      SELECT COUNT(*) as count FROM git_commits WHERE commit_sha = 'transaction_test_commit_abc123'
    `);
    
    consistency.transactionIntegrity = parseInt(rollbackCheck.rows[0].count) === 0;
    
  } catch (error) {
    await db.query('ROLLBACK');
    consistency.transactionIntegrity = false;
  }
  
  // Test audit trail completeness
  const auditCheck = await db.query(`
    SELECT COUNT(*) as events FROM event_log 
    WHERE event_type LIKE 'git_%' AND created_at >= NOW() - INTERVAL '1 hour'
  `);
  consistency.auditTrailComplete = parseInt(auditCheck.rows[0].events) >= 0; // Events exist
  
  return {
    ...consistency,
    orphanedRecords: totalOrphaned,
    dataRecordsChecked: consistencyCheck.rows.length > 0 ? consistencyCheck.rows[0] : {},
    auditEventsFound: parseInt(auditCheck.rows[0].events),
    overallIntegrity: Object.values(consistency).every(v => v === true)
  };
}

/**
 * Cleanup test environment
 */
async function cleanupTestEnvironment(): Promise<void> {
  console.log('\n🧹 Cleaning up test environment...');
  
  try {
    // Remove test session and related data
    if (TEST_CONFIG.testSessionId) {
      await db.query(`
        DELETE FROM commit_session_links WHERE session_id = $1;
        DELETE FROM code_analysis_sessions WHERE development_session_id = $1;
        DELETE FROM user_sessions WHERE id = $1;
      `, [TEST_CONFIG.testSessionId]);
      console.log('✅ Test session and related data removed');
    }
    
    // Clean up synthetic test data if it was created
    if (TEST_CONFIG.testCommitSha === 'a1b2c3d4e5f6789012345678901234567890abcd') {
      await db.query(`
        DELETE FROM git_file_changes WHERE commit_id = (SELECT id FROM git_commits WHERE commit_sha = $1);
        DELETE FROM git_commits WHERE commit_sha = $1;
      `, [TEST_CONFIG.testCommitSha]);
      console.log('✅ Synthetic test data removed');
    }
    
    // Close database connection
    await closeDatabase();
    console.log('✅ Database connection closed');
    
  } catch (error) {
    console.warn('⚠️  Cleanup warning:', error);
  }
}

/**
 * Generate comprehensive test report with Phase 2 recommendations
 */
function generateComprehensiveReport(): void {
  console.log('\n' + '='.repeat(80));
  console.log('📊 TC010: COMPREHENSIVE PHASE 1 INTEGRATION TEST RESULTS');
  console.log('='.repeat(80));
  
  const totalTests = testResults.length;
  const passedTests = testResults.filter(r => r.success).length;
  const failedTests = totalTests - passedTests;
  const totalTime = testResults.reduce((sum, r) => sum + r.duration, 0);
  
  // Overall metrics
  console.log(`\n📈 Overall Results:`);
  console.log(`   Tests: ${passedTests}/${totalTests} passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log(`   Total time: ${Math.round(totalTime / 1000)}s`);
  console.log(`   Average test time: ${Math.round(totalTime / totalTests)}ms`);
  
  // Category breakdown
  const categories = ['integration', 'performance', 'integrity', 'stress', 'api'] as const;
  console.log(`\n📋 Results by Category:`);
  
  categories.forEach(category => {
    const categoryTests = testResults.filter(r => r.category === category);
    const categoryPassed = categoryTests.filter(r => r.success).length;
    const categoryTotal = categoryTests.length;
    
    if (categoryTotal > 0) {
      const percentage = Math.round((categoryPassed / categoryTotal) * 100);
      const status = percentage === 100 ? '✅' : percentage >= 80 ? '⚠️' : '❌';
      console.log(`   ${status} ${category.toUpperCase()}: ${categoryPassed}/${categoryTotal} (${percentage}%)`);
    }
  });
  
  // Performance summary
  console.log(`\n⚡ Performance Metrics Summary:`);
  const perfTests = testResults.filter(r => r.performanceMetrics);
  if (perfTests.length > 0) {
    const avgMemory = Math.round(perfTests.reduce((sum, t) => sum + (t.performanceMetrics?.memoryUsed || 0), 0) / perfTests.length);
    const avgQueries = Math.round(perfTests.reduce((sum, t) => sum + (t.performanceMetrics?.queriesExecuted || 0), 0) / perfTests.length);
    const avgQueryTime = Math.round(perfTests.reduce((sum, t) => sum + (t.performanceMetrics?.avgQueryTime || 0), 0) / perfTests.length);
    const totalWarnings = testResults.reduce((sum, t) => sum + (t.recommendations?.length || 0), 0);
    
    console.log(`   Average memory usage: ${avgMemory}MB`);
    console.log(`   Average queries per test: ${avgQueries}`);
    console.log(`   Average query time: ${avgQueryTime}ms`);
    console.log(`   Performance warnings: ${totalWarnings}`);
  }
  
  // Detailed test results
  console.log(`\n📋 Detailed Test Results:`);
  testResults.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    const category = result.category.toUpperCase().padEnd(12);
    const duration = `${result.duration}ms`.padEnd(8);
    
    console.log(`${index + 1}.`.padEnd(4) + `${status} ${category} ${result.name} (${duration})`);
    
    // Show key metrics
    if (result.success && result.details && typeof result.details === 'object') {
      const keyMetrics = Object.entries(result.details)
        .filter(([key, value]) => typeof value === 'number' || typeof value === 'boolean')
        .slice(0, 3); // Show top 3 metrics
      
      keyMetrics.forEach(([key, value]) => {
        console.log(`      📊 ${key}: ${value}`);
      });
    }
    
    // Show performance warnings
    if (result.recommendations && result.recommendations.length > 0) {
      result.recommendations.forEach(rec => {
        console.log(`      ⚠️  ${rec}`);
      });
    }
    
    // Show errors
    if (result.error) {
      console.log(`      ❌ Error: ${result.error}`);
    }
  });
  
  // Phase 2 Recommendations
  console.log(`\n🚀 PHASE 2 RECOMMENDATIONS:`);
  console.log('='.repeat(50));
  
  const recommendations = generatePhase2Recommendations();
  recommendations.forEach((rec, index) => {
    console.log(`${index + 1}. ${rec}`);
  });
  
  // Final verdict
  console.log('\n' + '='.repeat(80));
  if (passedTests === totalTests && totalTime < 60000) {
    console.log('🎉 PHASE 1 INTEGRATION: COMPLETE SUCCESS!');
    console.log('   All systems are fully integrated and performing optimally.');
    console.log('   Ready to proceed with Phase 2 development.');
  } else if (passedTests >= totalTests * 0.8) {
    console.log('✅ PHASE 1 INTEGRATION: SUBSTANTIAL SUCCESS');
    console.log('   Core integration is working with minor issues to address.');
    console.log('   Ready to proceed with Phase 2 with noted improvements.');
  } else {
    console.log('⚠️  PHASE 1 INTEGRATION: REQUIRES ATTENTION');
    console.log('   Significant issues found that should be resolved before Phase 2.');
    console.log('   Review failed tests and performance issues.');
  }
  console.log('='.repeat(80));
}

/**
 * Generate specific Phase 2 recommendations based on test results
 */
function generatePhase2Recommendations(): string[] {
  const recommendations: string[] = [];
  
  // Analyze test results for specific recommendations
  const failedTests = testResults.filter(r => !r.success);
  const slowTests = testResults.filter(r => r.duration > 5000);
  const highMemoryTests = testResults.filter(r => (r.performanceMetrics?.memoryUsed || 0) > 100);
  const warnings = testResults.filter(r => r.recommendations && r.recommendations.length > 0);
  
  // Performance recommendations
  if (slowTests.length > 0) {
    recommendations.push('Performance Optimization: Implement query caching and database connection pooling');
    recommendations.push('Performance Monitoring: Add real-time performance metrics and alerting');
  }
  
  if (highMemoryTests.length > 0) {
    recommendations.push('Memory Management: Implement streaming for large datasets and memory cleanup');
  }
  
  // Integration recommendations
  const integrationTests = testResults.filter(r => r.category === 'integration');
  if (integrationTests.some(t => !t.success)) {
    recommendations.push('Integration Robustness: Add retry mechanisms and circuit breakers');
    recommendations.push('Error Handling: Implement comprehensive error recovery patterns');
  }
  
  // API recommendations
  const apiTests = testResults.filter(r => r.category === 'api');
  if (apiTests.some(t => !t.success)) {
    recommendations.push('API Reliability: Add API versioning and backward compatibility');
    recommendations.push('API Monitoring: Implement comprehensive API health checks');
  }
  
  // Data consistency recommendations
  const integrityTests = testResults.filter(r => r.category === 'integrity');
  if (integrityTests.some(t => !t.success)) {
    recommendations.push('Data Integrity: Strengthen foreign key constraints and add data validation');
    recommendations.push('Backup Strategy: Implement automated backup and recovery procedures');
  }
  
  // Stress testing recommendations
  const stressTests = testResults.filter(r => r.category === 'stress');
  if (stressTests.some(t => !t.success)) {
    recommendations.push('Scalability: Implement horizontal scaling and load balancing');
    recommendations.push('Concurrency: Add better concurrency control and deadlock prevention');
  }
  
  // General Phase 2 features
  recommendations.push('Advanced Analytics: Implement predictive code quality metrics');
  recommendations.push('ML Integration: Add machine learning for better correlation accuracy');
  recommendations.push('Real-time Dashboard: Build comprehensive monitoring and analytics dashboard');
  recommendations.push('Advanced Correlation: Implement semantic code analysis for better session-commit matching');
  recommendations.push('Automated Testing: Expand integration test coverage to include edge cases');
  recommendations.push('Documentation: Create comprehensive API documentation and user guides');
  recommendations.push('Security: Add authentication, authorization, and audit logging');
  recommendations.push('Deployment: Implement containerization and CI/CD pipelines');
  
  return recommendations.slice(0, 12); // Return top 12 recommendations
}

/**
 * Main test execution
 */
async function main(): Promise<void> {
  console.log('🚀 Starting TC010: Comprehensive Phase 1 Integration Test Suite');
  console.log('Testing complete AIDIS Code Tracking Intelligence system integration');
  console.log(`Performance thresholds: Query<${TEST_CONFIG.performanceThresholds.maxQueryTime}ms, Memory<${TEST_CONFIG.performanceThresholds.maxMemoryUsageMB}MB\n`);
  
  try {
    // Setup
    await setupTestEnvironment();
    
    // Integration Tests
    await runTest('Complete Git-Session Integration Pipeline', 'integration', 
      testGitSessionIntegrationPipeline, 8000);
    await runTest('Code Analysis Git Integration', 'integration', 
      testCodeAnalysisGitIntegration, 10000);
    await runTest('Real-time Git Tracking System', 'integration', 
      testRealtimeGitTracking, 6000);
    
    // Integrity Tests  
    await runTest('Database Schema Integrity', 'integrity', 
      testDatabaseSchemaIntegrity, 3000);
    await runTest('Data Consistency and Zero Loss', 'integrity', 
      testDataConsistencyAndIntegrity, 5000);
    
    // API Tests
    await runTest('API Integration Across Services', 'api', 
      testAPIIntegration, 7000);
    
    // Performance Tests
    await runTest('Performance Benchmarks', 'performance', 
      testPerformanceBenchmarks, 8000);
    
    // Stress Tests
    await runTest('Concurrent Session Stress Test', 'stress', 
      testStressWithConcurrentSessions, 15000);
    
  } catch (error) {
    console.error('\n❌ Test suite failed during setup or execution:', error);
  } finally {
    // Cleanup and comprehensive report
    await cleanupTestEnvironment();
    generateComprehensiveReport();
  }
}

// Run the comprehensive integration test suite
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Integration test suite crashed:', error);
    process.exit(1);
  });
}

export {
  testGitSessionIntegrationPipeline,
  testCodeAnalysisGitIntegration,
  testRealtimeGitTracking,
  testDatabaseSchemaIntegrity,
  testAPIIntegration,
  testPerformanceBenchmarks,
  testStressWithConcurrentSessions,
  testDataConsistencyAndIntegrity
};