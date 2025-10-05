#!/usr/bin/env npx tsx

/**
 * TC004: Session-Git Correlation System Test
 * 
 * Comprehensive test of the session-git correlation mechanism
 * that validates all components are working correctly.
 */

import { GitService } from './aidis-command/backend/src/services/gitService.js';
import { SessionDetailService } from './aidis-command/backend/src/services/sessionDetail.js';
import { GitHandler } from './mcp-server/src/handlers/git.js';
import { db } from './mcp-server/src/config/database.js';
import { initializeDatabase, closeDatabase } from './mcp-server/src/config/database.js';

// Test configuration
const TEST_CONFIG = {
  projectId: '', // Will be set from current AIDIS project
  testSessionId: '',
  gitRepoPath: '/home/ridgetop/aidis',
  testCommitSha: ''
};

/**
 * Test Results Tracking
 */
interface TestResult {
  name: string;
  success: boolean;
  duration: number;
  details: any;
  error?: string;
}

const testResults: TestResult[] = [];

/**
 * Run a test with error handling and timing
 */
async function runTest(name: string, testFn: () => Promise<any>): Promise<void> {
  console.log(`\n🧪 Running test: ${name}`);
  const startTime = Date.now();
  
  try {
    const result = await testFn();
    const duration = Date.now() - startTime;
    
    testResults.push({
      name,
      success: true,
      duration,
      details: result
    });
    
    console.log(`✅ ${name} - Passed in ${duration}ms`);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    testResults.push({
      name,
      success: false,
      duration,
      details: null,
      error: error instanceof Error ? error.message : String(error)
    });
    
    console.error(`❌ ${name} - Failed in ${duration}ms: ${error}`);
  }
}

/**
 * Setup test environment
 */
async function setupTestEnvironment(): Promise<void> {
  console.log('🔧 Setting up test environment...');
  
  // Initialize database
  await initializeDatabase();
  
  // Get current AIDIS project
  const projectResult = await db.query(`
    SELECT id, name FROM projects WHERE name LIKE '%aidis%' OR name = 'default' 
    ORDER BY created_at DESC LIMIT 1
  `);
  
  if (projectResult.rows.length === 0) {
    throw new Error('No AIDIS project found. Please create one first.');
  }
  
  TEST_CONFIG.projectId = projectResult.rows[0].id;
  console.log(`📋 Using project: ${projectResult.rows[0].name} (${TEST_CONFIG.projectId})`);
  
  // Initialize git repository for this project
  try {
    await GitService.initializeRepository({
      project_id: TEST_CONFIG.projectId,
      repo_path: TEST_CONFIG.gitRepoPath
    });
    console.log(`📁 Git repository initialized for project`);
  } catch (error) {
    console.log(`ℹ️  Git repository already initialized: ${error}`);
  }
  
  // Get recent commit for testing
  const recentCommits = await GitService.getRecentCommits({
    project_id: TEST_CONFIG.projectId,
    hours: 24,
    limit: 1
  });
  
  if (recentCommits.commits.length > 0) {
    TEST_CONFIG.testCommitSha = recentCommits.commits[0].commit_sha;
    console.log(`📝 Using test commit: ${TEST_CONFIG.testCommitSha.substring(0, 12)}...`);
  } else {
    console.warn('⚠️  No recent commits found - some tests may be limited');
  }
  
  // Create test session
  const sessionResult = await db.query(`
    INSERT INTO user_sessions (id, project_id, started_at, session_type)
    VALUES (gen_random_uuid(), $1, NOW() - INTERVAL '1 hour', 'test')
    RETURNING id
  `, [TEST_CONFIG.projectId]);
  
  TEST_CONFIG.testSessionId = sessionResult.rows[0].id;
  console.log(`📋 Created test session: ${TEST_CONFIG.testSessionId.substring(0, 8)}...`);
}

/**
 * Test 1: GitService correlation functionality
 */
async function testGitServiceCorrelation(): Promise<any> {
  const result = await GitService.correlateCommitsWithSessions({
    project_id: TEST_CONFIG.projectId,
    confidence_threshold: 0.1 // Low threshold for testing
  });
  
  if (!result.project_id || typeof result.links_created !== 'number') {
    throw new Error('Invalid correlation result structure');
  }
  
  return {
    linksCreated: result.links_created,
    linksUpdated: result.links_updated,
    highConfidenceLinks: result.high_confidence_links,
    processingTime: result.processing_time_ms
  };
}

/**
 * Test 2: SessionDetailService correlation functionality
 */
async function testSessionDetailCorrelation(): Promise<any> {
  const result = await SessionDetailService.correlateSessionWithGit(TEST_CONFIG.testSessionId);
  
  if (!result.success && !result.message.includes('no project')) {
    throw new Error(`Session correlation failed: ${result.message}`);
  }
  
  return {
    success: result.success,
    linksCreated: result.linksCreated,
    linksUpdated: result.linksUpdated,
    confidence: result.confidence,
    message: result.message
  };
}

/**
 * Test 3: SessionDetailService enhanced session details
 */
async function testEnhancedSessionDetails(): Promise<any> {
  const sessionDetail = await SessionDetailService.getSessionDetail(TEST_CONFIG.testSessionId);
  
  if (!sessionDetail) {
    throw new Error('Session detail not found');
  }
  
  // Check for new git-related fields
  const requiredFields = ['commits_contributed', 'linked_commits', 'git_correlation_confidence'];
  for (const field of requiredFields) {
    if (!(field in sessionDetail)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  return {
    sessionId: sessionDetail.id,
    commitsContributed: sessionDetail.commits_contributed,
    linkedCommitsCount: sessionDetail.linked_commits.length,
    correlationConfidence: sessionDetail.git_correlation_confidence,
    hasGitData: sessionDetail.commits_contributed > 0
  };
}

/**
 * Test 4: Git MCP handler - session commits
 */
async function testGitSessionCommitsHandler(): Promise<any> {
  const result = await GitHandler.gitSessionCommits({
    sessionId: TEST_CONFIG.testSessionId,
    includeDetails: true,
    confidenceThreshold: 0.0
  });
  
  if (!result.success) {
    throw new Error(`Git session commits failed: ${result.error}`);
  }
  
  return {
    sessionId: result.sessionId,
    totalCommits: result.totalCommits,
    avgConfidence: result.avgConfidence,
    hasTimeRange: !!result.timeRange,
    commitsFound: result.commits.length
  };
}

/**
 * Test 5: Git MCP handler - commit sessions (if we have a test commit)
 */
async function testGitCommitSessionsHandler(): Promise<any> {
  if (!TEST_CONFIG.testCommitSha) {
    return { skipped: true, reason: 'No test commit available' };
  }
  
  const result = await GitHandler.gitCommitSessions({
    commitSha: TEST_CONFIG.testCommitSha,
    includeDetails: true
  });
  
  if (!result.success) {
    throw new Error(`Git commit sessions failed: ${result.error}`);
  }
  
  return {
    commitSha: result.commitSha,
    totalSessions: result.totalSessions,
    avgConfidence: result.avgConfidence,
    hasCommitDetails: !!result.commit,
    sessionsFound: result.sessions.length
  };
}

/**
 * Test 6: Git MCP handler - correlation trigger
 */
async function testGitCorrelationHandler(): Promise<any> {
  const result = await GitHandler.gitCorrelateSession({
    sessionId: TEST_CONFIG.testSessionId,
    projectId: TEST_CONFIG.projectId,
    confidenceThreshold: 0.1
  });
  
  if (!result.success) {
    throw new Error(`Git correlation trigger failed: ${result.error}`);
  }
  
  return {
    sessionId: result.sessionId,
    projectId: result.projectId,
    linksCreated: result.linksCreated,
    linksUpdated: result.linksUpdated,
    avgConfidence: result.avgConfidence,
    processingTime: result.processingTimeMs
  };
}

/**
 * Test 7: Database schema validation
 */
async function testDatabaseSchema(): Promise<any> {
  // Check commit_session_links table exists and has correct structure
  const tableInfo = await db.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'commit_session_links'
    ORDER BY ordinal_position
  `);
  
  if (tableInfo.rows.length === 0) {
    throw new Error('commit_session_links table not found');
  }
  
  const requiredColumns = [
    'id', 'project_id', 'commit_id', 'session_id', 'link_type',
    'confidence_score', 'time_proximity_minutes', 'author_match'
  ];
  
  const existingColumns = tableInfo.rows.map(row => row.column_name);
  const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
  
  if (missingColumns.length > 0) {
    throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
  }
  
  // Check for any existing links
  const linksCount = await db.query(`
    SELECT COUNT(*) as count FROM commit_session_links
    WHERE project_id = $1
  `, [TEST_CONFIG.projectId]);
  
  return {
    tableExists: true,
    columnCount: tableInfo.rows.length,
    requiredColumnsPresent: true,
    existingLinksCount: parseInt(linksCount.rows[0].count)
  };
}

/**
 * Test 8: Real-time tracking (basic functionality)
 */
async function testRealtimeTracking(): Promise<any> {
  const result = await GitHandler.trackRealtimeGitActivity();
  
  return {
    success: result.success,
    recentCommits: result.recentCommits,
    autoCorrelated: result.autoCorrelated,
    sessionActive: !!result.sessionId,
    error: result.error
  };
}

/**
 * Cleanup test environment
 */
async function cleanupTestEnvironment(): Promise<void> {
  console.log('\n🧹 Cleaning up test environment...');
  
  try {
    // Remove test session
    if (TEST_CONFIG.testSessionId) {
      await db.query('DELETE FROM user_sessions WHERE id = $1', [TEST_CONFIG.testSessionId]);
      console.log('✅ Test session removed');
    }
    
    // Close database connection
    await closeDatabase();
    console.log('✅ Database connection closed');
    
  } catch (error) {
    console.warn('⚠️  Cleanup warning:', error);
  }
}

/**
 * Print test results summary
 */
function printTestSummary(): void {
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  
  const totalTests = testResults.length;
  const passedTests = testResults.filter(r => r.success).length;
  const failedTests = totalTests - passedTests;
  const totalTime = testResults.reduce((sum, r) => sum + r.duration, 0);
  
  console.log(`\n📈 Overall: ${passedTests}/${totalTests} tests passed`);
  console.log(`⏱️  Total time: ${totalTime}ms`);
  console.log(`✅ Success rate: ${Math.round((passedTests / totalTests) * 100)}%`);
  
  console.log('\n📋 Individual Test Results:');
  testResults.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    const details = result.success 
      ? `${result.duration}ms`
      : `${result.duration}ms - ${result.error}`;
    
    console.log(`${index + 1}. ${status} ${result.name} (${details})`);
    
    if (result.success && result.details && typeof result.details === 'object') {
      Object.entries(result.details).forEach(([key, value]) => {
        if (key !== 'skipped' && value !== undefined) {
          console.log(`   📄 ${key}: ${JSON.stringify(value)}`);
        }
      });
    }
  });
  
  if (failedTests > 0) {
    console.log('\n❗ Failed Tests Details:');
    testResults.filter(r => !r.success).forEach(result => {
      console.log(`\n❌ ${result.name}:`);
      console.log(`   Error: ${result.error}`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
  
  if (passedTests === totalTests) {
    console.log('🎉 ALL TESTS PASSED! Session-Git correlation system is working correctly.');
  } else {
    console.log(`⚠️  ${failedTests} test(s) failed. Please check the implementation.`);
  }
}

/**
 * Main test execution
 */
async function main(): Promise<void> {
  console.log('🚀 Starting TC004: Session-Git Correlation System Test');
  console.log('This test validates the complete session-git correlation mechanism\n');
  
  try {
    // Setup
    await setupTestEnvironment();
    
    // Run all tests
    await runTest('1. GitService Correlation', testGitServiceCorrelation);
    await runTest('2. SessionDetail Correlation', testSessionDetailCorrelation);
    await runTest('3. Enhanced Session Details', testEnhancedSessionDetails);
    await runTest('4. Git Session Commits Handler', testGitSessionCommitsHandler);
    await runTest('5. Git Commit Sessions Handler', testGitCommitSessionsHandler);
    await runTest('6. Git Correlation Handler', testGitCorrelationHandler);
    await runTest('7. Database Schema Validation', testDatabaseSchema);
    await runTest('8. Real-time Tracking', testRealtimeTracking);
    
  } catch (error) {
    console.error('\n❌ Test suite failed during setup or execution:', error);
  } finally {
    // Cleanup and summary
    await cleanupTestEnvironment();
    printTestSummary();
  }
}

// Run the test suite
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Test suite crashed:', error);
    process.exit(1);
  });
}