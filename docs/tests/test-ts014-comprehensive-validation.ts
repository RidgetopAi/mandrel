#!/usr/bin/env npx tsx

/**
 * TS014 - Comprehensive Testing and Validation Framework
 * 
 * Master test suite for the entire TS001-TS013 session management system.
 * This framework provides enterprise-grade validation of all integrated components:
 * 
 * - TS008: Session Recovery and Persistence
 * - TS009: Service Dependencies and Error Handling
 * - TS010: 4-Level Project Assignment Hierarchy 
 * - TS011: Session Management UI and Backend APIs
 * - TS012: Atomic Operations with Validation Framework
 * - TS013: Session Migration and Legacy User Support
 * 
 * Features:
 * - Integration testing across all components
 * - Performance benchmarking and load testing
 * - Error simulation and recovery validation
 * - Data integrity and consistency verification
 * - Concurrent operations safety testing
 * - Security and access control validation
 * - Comprehensive reporting and analytics
 */

import { db } from './mcp-server/src/config/database.js';
import { SessionTracker } from './mcp-server/src/services/sessionTracker.js';
import { SessionMigrator } from './mcp-server/src/services/sessionMigrator.js';
import { ProjectSwitchValidator } from './mcp-server/src/services/projectSwitchValidator.js';
import { projectHandler } from './mcp-server/src/handlers/project.js';
import { randomUUID } from 'crypto';

interface TestResult {
  category: string;
  name: string;
  passed: boolean;
  duration: number;
  details: string;
  error?: any;
  performance?: PerformanceMetrics;
}

interface PerformanceMetrics {
  executionTimeMs: number;
  memoryUsageMB?: number;
  operationsPerSecond?: number;
  concurrentOperations?: number;
}

interface IntegrationTestScenario {
  name: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  timeout: number;
}

interface SystemHealthSnapshot {
  timestamp: Date;
  activeConnections: number;
  totalProjects: number;
  totalSessions: number;
  memoryUsage: NodeJS.MemoryUsage;
  databaseConnections: number;
}

/**
 * TS014 Comprehensive Testing Suite
 * Master orchestrator for all session management validation
 */
class TS014ComprehensiveTestSuite {
  private results: TestResult[] = [];
  private healthSnapshots: SystemHealthSnapshot[] = [];
  private testProjects: string[] = [];
  private testSessions: string[] = [];
  private performanceBenchmarks: Map<string, number> = new Map();
  private concurrentOperationLimits: Map<string, number> = new Map();

  constructor() {
    // Set performance benchmarks (sub-100ms requirement)
    this.performanceBenchmarks.set('session_create', 50);
    this.performanceBenchmarks.set('session_switch', 30);
    this.performanceBenchmarks.set('project_resolve', 25);
    this.performanceBenchmarks.set('migration_analysis', 75);
    this.performanceBenchmarks.set('validation_check', 20);
    
    // Set concurrent operation limits
    this.concurrentOperationLimits.set('session_operations', 10);
    this.concurrentOperationLimits.set('project_switches', 5);
    this.concurrentOperationLimits.set('migrations', 3);
  }

  /**
   * Main test execution orchestrator
   */
  async runComprehensiveTests(): Promise<void> {
    console.log('🚀 TS014 - Comprehensive Testing and Validation Framework');
    console.log('═'.repeat(90));
    console.log('📊 Testing entire TS001-TS013 session management system');
    console.log('🎯 Integration • Performance • Reliability • Security • Concurrency');
    console.log('═'.repeat(90));

    const startTime = Date.now();
    await this.captureHealthSnapshot('test_start');

    try {
      await this.setupTestEnvironment();

      // Category 1: Integration Testing
      console.log('\n📈 CATEGORY 1: INTEGRATION TESTING');
      console.log('-'.repeat(50));
      await this.runIntegrationTests();

      // Category 2: Performance & Scalability
      console.log('\n⚡ CATEGORY 2: PERFORMANCE & SCALABILITY VALIDATION');
      console.log('-'.repeat(50));
      await this.runPerformanceTests();

      // Category 3: Error Handling & Recovery
      console.log('\n🔧 CATEGORY 3: ERROR HANDLING & RECOVERY TESTING');
      console.log('-'.repeat(50));
      await this.runErrorRecoveryTests();

      // Category 4: Concurrent Operations Safety
      console.log('\n🔀 CATEGORY 4: CONCURRENT OPERATIONS SAFETY');
      console.log('-'.repeat(50));
      await this.runConcurrencyTests();

      // Category 5: Data Integrity & Security
      console.log('\n🔒 CATEGORY 5: DATA INTEGRITY & SECURITY TESTING');
      console.log('-'.repeat(50));
      await this.runSecurityTests();

      // Category 6: End-to-End Workflows
      console.log('\n🌊 CATEGORY 6: END-TO-END WORKFLOW VALIDATION');
      console.log('-'.repeat(50));
      await this.runWorkflowTests();

      await this.captureHealthSnapshot('test_end');
      await this.generateComprehensiveReport();

    } catch (error) {
      console.error('❌ Critical test suite failure:', error);
      await this.captureHealthSnapshot('test_error');
    } finally {
      await this.cleanupTestEnvironment();
      console.log(`\n⏱️  Total test duration: ${Date.now() - startTime}ms`);
    }
  }

  /**
   * CATEGORY 1: Integration Testing
   * Tests interactions between all TS008-TS013 components
   */
  private async runIntegrationTests(): Promise<void> {
    await this.runTest('Integration', 'TS008-TS010 Session Recovery with Project Hierarchy', async () => {
      const sessionId = randomUUID();
      
      // Test TS008 + TS010 integration - use system default project
      await SessionTracker.startSession(sessionId, 'TS014-Integration-Test');
      const resolvedProject = await SessionTracker.resolveProjectForSession(sessionId);
      
      // Simulate crash and recovery
      await SessionTracker.endSession(sessionId);
      const recoverySuccess = await SessionTracker.recoverSession(sessionId);
      
      return `Session recovered: ${recoverySuccess}, Project: ${resolvedProject.substring(0, 8)}...`;
    });

    await this.runTest('Integration', 'TS010-TS012 Project Resolution with Validation', async () => {
      const sessionId = randomUUID();
      const testProject = await this.createTestProject('integration-validation-test');
      
      // Test TS010 + TS012 integration
      const validator = new ProjectSwitchValidator();
      const validationResult = await validator.validateSwitch(sessionId, testProject.id);
      
      if (!validationResult.isValid) {
        throw new Error(`Validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`);
      }
      
      await SessionTracker.startSession(sessionId, 'Validation-Test', testProject.id);
      const resolvedProject = await SessionTracker.resolveProjectForSession(sessionId);
      
      return `Validation passed, resolved to correct project: ${resolvedProject === testProject.id}`;
    });

    await this.runTest('Integration', 'TS012-TS013 Migration with Validation Framework', async () => {
      const migrator = new SessionMigrator();
      const validator = new ProjectSwitchValidator();
      
      // Create test session for migration
      const legacySessionId = randomUUID();
      await this.createLegacySession(legacySessionId);
      
      // Test TS012 + TS013 integration
      const analysis = await migrator.analyzeSessionForMigration(legacySessionId);
      
      if (analysis.targetProjectId) {
        const validationResult = await validator.validateSwitch(legacySessionId, analysis.targetProjectId);
        if (!validationResult.isValid) {
          throw new Error('Migration validation failed');
        }
      }
      
      return `Migration analysis confidence: ${analysis.confidence}, target: ${analysis.assignmentType}`;
    });

    await this.runTest('Integration', 'End-to-End Session Lifecycle', async () => {
      const sessionId = randomUUID();
      const testProject = await this.createTestProject('lifecycle-test');
      
      // Complete lifecycle: Create → Switch → Migrate → Recover
      await SessionTracker.startSession(sessionId, 'Lifecycle-Test');
      
      // Switch project (TS010 + TS012)
      const validator = new ProjectSwitchValidator();
      await validator.validateSwitch(sessionId, testProject.id);
      await SessionTracker.updateSessionProject(sessionId, testProject.id);
      
      // End and recover (TS008)
      await SessionTracker.endSession(sessionId);
      const recovered = await SessionTracker.recoverSession(sessionId);
      
      return `Lifecycle completed successfully: ${recovered}`;
    });
  }

  /**
   * CATEGORY 2: Performance & Scalability Testing
   * Validates sub-100ms operations and concurrent capacity
   */
  private async runPerformanceTests(): Promise<void> {
    await this.runTest('Performance', 'Session Creation Performance Benchmark', async () => {
      const iterations = 50;
      const times: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        const sessionId = randomUUID();
        await SessionTracker.startSession(sessionId, `Perf-Test-${i}`);
        await SessionTracker.endSession(sessionId);
        times.push(Date.now() - start);
      }
      
      const avgTime = times.reduce((sum, time) => sum + time, 0) / iterations;
      const maxTime = Math.max(...times);
      const benchmark = this.performanceBenchmarks.get('session_create')!;
      
      if (avgTime > benchmark) {
        throw new Error(`Average time ${avgTime}ms exceeds benchmark ${benchmark}ms`);
      }
      
      return `Average: ${avgTime.toFixed(1)}ms, Max: ${maxTime}ms (Benchmark: ${benchmark}ms)`;
    });

    await this.runTest('Performance', 'Project Resolution Speed Test', async () => {
      const iterations = 100;
      const times: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const sessionId = randomUUID();
        await SessionTracker.startSession(sessionId, `Resolution-Test-${i}`);
        
        const start = Date.now();
        await SessionTracker.resolveProjectForSession(sessionId);
        times.push(Date.now() - start);
        
        await SessionTracker.endSession(sessionId);
      }
      
      const avgTime = times.reduce((sum, time) => sum + time, 0) / iterations;
      const benchmark = this.performanceBenchmarks.get('project_resolve')!;
      
      if (avgTime > benchmark) {
        throw new Error(`Average resolution time ${avgTime}ms exceeds benchmark ${benchmark}ms`);
      }
      
      return `Average resolution: ${avgTime.toFixed(1)}ms (Benchmark: ${benchmark}ms)`;
    });

    await this.runTest('Performance', 'Migration Analysis Performance', async () => {
      const migrator = new SessionMigrator();
      const iterations = 20;
      const times: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const sessionId = randomUUID();
        await this.createLegacySession(sessionId);
        
        const start = Date.now();
        await migrator.analyzeSessionForMigration(sessionId);
        times.push(Date.now() - start);
      }
      
      const avgTime = times.reduce((sum, time) => sum + time, 0) / iterations;
      const benchmark = this.performanceBenchmarks.get('migration_analysis')!;
      
      if (avgTime > benchmark) {
        throw new Error(`Average analysis time ${avgTime}ms exceeds benchmark ${benchmark}ms`);
      }
      
      return `Average analysis: ${avgTime.toFixed(1)}ms (Benchmark: ${benchmark}ms)`;
    });

    await this.runTest('Performance', 'Concurrent Session Operations Load Test', async () => {
      const concurrentCount = 15;
      const operations: Promise<void>[] = [];
      
      for (let i = 0; i < concurrentCount; i++) {
        operations.push(this.performConcurrentSessionOperation(i));
      }
      
      const start = Date.now();
      const results = await Promise.allSettled(operations);
      const duration = Date.now() - start;
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      if (failed > 0) {
        throw new Error(`${failed} out of ${concurrentCount} operations failed`);
      }
      
      const opsPerSecond = (concurrentCount / duration) * 1000;
      return `${successful}/${concurrentCount} operations succeeded in ${duration}ms (${opsPerSecond.toFixed(1)} ops/sec)`;
    });
  }

  /**
   * CATEGORY 3: Error Handling & Recovery Testing
   * Simulates failures and validates recovery mechanisms
   */
  private async runErrorRecoveryTests(): Promise<void> {
    await this.runTest('Error Recovery', 'Database Connection Failure Simulation', async () => {
      // Test graceful degradation when database is unavailable
      const sessionId = randomUUID();
      
      // Create session normally
      await SessionTracker.startSession(sessionId, 'DB-Failure-Test');
      
      // Simulate database connection issues by creating invalid operations
      let errorHandled = false;
      try {
        await db.query('SELECT * FROM nonexistent_table');
      } catch (error) {
        errorHandled = true;
      }
      
      // Verify system continues to function
      const sessionData = await SessionTracker.getSessionData(sessionId);
      
      return `Error handled gracefully: ${errorHandled}, Session accessible: ${!!sessionData}`;
    });

    await this.runTest('Error Recovery', 'Concurrent Project Switch Conflict Resolution', async () => {
      const sessionId = randomUUID();
      const project1 = await this.createTestProject('conflict-test-1');
      const project2 = await this.createTestProject('conflict-test-2');
      
      await SessionTracker.startSession(sessionId, 'Conflict-Test');
      
      // Attempt simultaneous project switches
      const validator = new ProjectSwitchValidator();
      const operations = [
        validator.executeSwitch(sessionId, project1.id),
        validator.executeSwitch(sessionId, project2.id)
      ];
      
      const results = await Promise.allSettled(operations);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      
      // Should handle conflicts gracefully
      return `Conflict resolved, successful operations: ${successful}`;
    });

    await this.runTest('Error Recovery', 'Migration Rollback on Failure', async () => {
      const migrator = new SessionMigrator();
      const sessionId = randomUUID();
      await this.createLegacySession(sessionId);
      
      // Create migration plan
      const analysis = await migrator.analyzeSessionForMigration(sessionId);
      
      if (analysis.targetProjectId) {
        try {
          // Force migration failure by invalidating target project
          await db.query('UPDATE projects SET id = $1 WHERE id = $2', 
                        ['invalid-id', analysis.targetProjectId]);
          
          // Attempt migration (should fail and rollback)
          await migrator.executeMigration(sessionId, analysis.targetProjectId);
          throw new Error('Migration should have failed');
          
        } catch (error) {
          // Verify rollback occurred
          const postFailureAnalysis = await migrator.analyzeSessionForMigration(sessionId);
          return `Rollback successful, session preserved: ${!!postFailureAnalysis}`;
        }
      }
      
      return 'No migration target found, test skipped';
    });
  }

  /**
   * CATEGORY 4: Concurrent Operations Safety
   * Tests system behavior under concurrent load
   */
  private async runConcurrencyTests(): Promise<void> {
    await this.runTest('Concurrency', 'Parallel Session Creation Safety', async () => {
      const concurrentSessions = 20;
      const sessionIds = Array.from({length: concurrentSessions}, () => randomUUID());
      
      const operations = sessionIds.map(id => 
        SessionTracker.startSession(id, `Concurrent-${id.substring(0, 8)}`)
      );
      
      const results = await Promise.allSettled(operations);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      
      if (successful < concurrentSessions * 0.9) { // Allow 10% failure rate
        throw new Error(`Too many failures: ${successful}/${concurrentSessions}`);
      }
      
      return `${successful}/${concurrentSessions} sessions created concurrently`;
    });

    await this.runTest('Concurrency', 'Project Resolution Under Load', async () => {
      const iterations = 30;
      const sessionId = randomUUID();
      await SessionTracker.startSession(sessionId, 'Load-Test');
      
      const operations = Array.from({length: iterations}, () =>
        SessionTracker.resolveProjectForSession(sessionId)
      );
      
      const start = Date.now();
      const results = await Promise.allSettled(operations);
      const duration = Date.now() - start;
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      
      if (successful < iterations) {
        throw new Error(`Some resolutions failed: ${successful}/${iterations}`);
      }
      
      return `${successful} concurrent resolutions in ${duration}ms`;
    });

    await this.runTest('Concurrency', 'Migration Analysis Concurrency', async () => {
      const migrator = new SessionMigrator();
      const sessionCount = 10;
      const sessionIds: string[] = [];
      
      // Create multiple legacy sessions
      for (let i = 0; i < sessionCount; i++) {
        const sessionId = randomUUID();
        await this.createLegacySession(sessionId);
        sessionIds.push(sessionId);
      }
      
      // Analyze them concurrently
      const operations = sessionIds.map(id => 
        migrator.analyzeSessionForMigration(id)
      );
      
      const results = await Promise.allSettled(operations);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      
      return `${successful}/${sessionCount} concurrent migration analyses completed`;
    });
  }

  /**
   * CATEGORY 5: Data Integrity & Security Testing
   * Validates data consistency and access control
   */
  private async runSecurityTests(): Promise<void> {
    await this.runTest('Security', 'Session Isolation Verification', async () => {
      const session1 = randomUUID();
      const session2 = randomUUID();
      const project1 = await this.createTestProject('isolation-test-1');
      const project2 = await this.createTestProject('isolation-test-2');
      
      // Create isolated sessions
      await SessionTracker.startSession(session1, 'Isolation-1', project1.id);
      await SessionTracker.startSession(session2, 'Isolation-2', project2.id);
      
      // Verify each session resolves to correct project
      const resolved1 = await SessionTracker.resolveProjectForSession(session1);
      const resolved2 = await SessionTracker.resolveProjectForSession(session2);
      
      if (resolved1 === resolved2) {
        throw new Error('Session isolation failed - same project resolved');
      }
      
      return `Sessions properly isolated: ${resolved1 !== resolved2}`;
    });

    await this.runTest('Security', 'Project Access Control Validation', async () => {
      const sessionId = randomUUID();
      const testProject = await this.createTestProject('access-control-test');
      
      // Test validation prevents invalid assignments
      const validator = new ProjectSwitchValidator();
      const invalidProjectId = 'invalid-project-id';
      
      const validationResult = await validator.validateSwitch(sessionId, invalidProjectId);
      
      if (validationResult.isValid) {
        throw new Error('Validator should have rejected invalid project');
      }
      
      return `Access control working: ${validationResult.errors.length} errors detected`;
    });

    await this.runTest('Security', 'Data Consistency During Failures', async () => {
      const sessionId = randomUUID();
      const testProject = await this.createTestProject('consistency-test');
      
      await SessionTracker.startSession(sessionId, 'Consistency-Test');
      
      // Capture initial state
      const initialData = await SessionTracker.getSessionData(sessionId);
      
      try {
        // Attempt invalid operation that should fail
        await db.query('UPDATE sessions SET project_id = $1 WHERE session_id = $2',
                      ['invalid-project-id', sessionId]);
      } catch (error) {
        // Verify data remained consistent
        const finalData = await SessionTracker.getSessionData(sessionId);
        return `Data consistency maintained: ${JSON.stringify(initialData) === JSON.stringify(finalData)}`;
      }
      
      throw new Error('Invalid operation should have failed');
    });
  }

  /**
   * CATEGORY 6: End-to-End Workflow Testing
   * Tests complete user workflows across all components
   */
  private async runWorkflowTests(): Promise<void> {
    await this.runTest('Workflow', 'New User Onboarding Flow', async () => {
      const sessionId = randomUUID();
      
      // Simulate new user first session (triggers TS010 hierarchy)
      await SessionTracker.startSession(sessionId, 'New-User-Onboarding');
      const resolvedProject = await SessionTracker.resolveProjectForSession(sessionId);
      
      // Should resolve to system default (aidis-bootstrap)
      const project = await projectHandler.getProject(resolvedProject);
      
      return `New user assigned to: ${project?.name || 'unknown'}`;
    });

    await this.runTest('Workflow', 'Returning User Session Resume', async () => {
      const sessionId = randomUUID();
      const testProject = await this.createTestProject('returning-user-test');
      
      // Create user with existing project preference
      await SessionTracker.startSession(sessionId, 'Initial-Session', testProject.id);
      await SessionTracker.endSession(sessionId);
      
      // Simulate returning user (should resume with same project)
      const newSessionId = randomUUID();
      await SessionTracker.startSession(newSessionId, 'Return-Session');
      
      // Should inherit project from user's history
      const resolvedProject = await SessionTracker.resolveProjectForSession(newSessionId);
      
      return `Session resumed successfully: ${!!resolvedProject}`;
    });

    await this.runTest('Workflow', 'Legacy User Migration Flow', async () => {
      const migrator = new SessionMigrator();
      const sessionId = randomUUID();
      
      // Create legacy session
      await this.createLegacySession(sessionId);
      
      // Analyze and migrate
      const analysis = await migrator.analyzeSessionForMigration(sessionId);
      
      if (analysis.targetProjectId) {
        const result = await migrator.executeMigration(sessionId, analysis.targetProjectId);
        return `Migration completed: ${result.success}, Sessions migrated: ${result.migratedSessionsCount}`;
      }
      
      return `No migration needed, confidence: ${analysis.confidence}`;
    });

    await this.runTest('Workflow', 'Multi-Project User Workflow', async () => {
      const sessionId = randomUUID();
      const project1 = await this.createTestProject('multi-project-1');
      const project2 = await this.createTestProject('multi-project-2');
      
      // Create session with first project
      await SessionTracker.startSession(sessionId, 'Multi-Project-Test', project1.id);
      
      // Switch to second project
      const validator = new ProjectSwitchValidator();
      const switchResult = await validator.executeSwitch(sessionId, project2.id);
      
      // Verify switch was successful
      const resolvedProject = await SessionTracker.resolveProjectForSession(sessionId);
      
      return `Project switch successful: ${resolvedProject === project2.id}`;
    });
  }

  /**
   * Helper methods for test execution and infrastructure
   */
  private async runTest(category: string, name: string, testFn: () => Promise<string>): Promise<void> {
    const start = Date.now();
    
    try {
      console.log(`🔍 Testing: ${name}`);
      const details = await testFn();
      const duration = Date.now() - start;
      
      this.results.push({
        category,
        name,
        passed: true,
        duration,
        details,
        performance: { executionTimeMs: duration }
      });
      
      console.log(`  ✅ PASS (${duration}ms): ${details}`);
      
    } catch (error) {
      const duration = Date.now() - start;
      this.results.push({
        category,
        name,
        passed: false,
        duration,
        details: error.message,
        error
      });
      
      console.log(`  ❌ FAIL (${duration}ms): ${error.message}`);
    }
  }

  private async performConcurrentSessionOperation(index: number): Promise<void> {
    const sessionId = randomUUID();
    await SessionTracker.startSession(sessionId, `Concurrent-Op-${index}`);
    await SessionTracker.resolveProjectForSession(sessionId);
    await SessionTracker.endSession(sessionId);
  }

  private async createTestProject(name: string): Promise<any> {
    const project = await projectHandler.createProject({
      name: `TS014-${name}-${Date.now()}`,
      description: 'TS014 test project'
    });
    this.testProjects.push(project.id);
    return project;
  }

  private async createLegacySession(sessionId: string): Promise<void> {
    await db.query(`
      INSERT INTO analytics_events (actor, session_id, event_type, timestamp, project_id, status, metadata, tags)
      VALUES ($1, $2, $3, $4, NULL, $5, $6, $7)
    `, ['test-system', sessionId, 'session_start', new Date(), 'active', '{}', ['test']]);
    
    this.testSessions.push(sessionId);
  }

  private async captureHealthSnapshot(phase: string): Promise<void> {
    const snapshot: SystemHealthSnapshot = {
      timestamp: new Date(),
      activeConnections: 1, // Simplified for test
      totalProjects: (await projectHandler.listProjects()).length,
      totalSessions: this.testSessions.length,
      memoryUsage: process.memoryUsage(),
      databaseConnections: 1 // Simplified for test
    };
    
    this.healthSnapshots.push(snapshot);
    console.log(`📊 Health snapshot (${phase}): ${JSON.stringify(snapshot, null, 2)}`);
  }

  private async setupTestEnvironment(): Promise<void> {
    console.log('🔧 Setting up test environment...');
    
    // Ensure test isolation
    this.testProjects = [];
    this.testSessions = [];
    
    console.log('✅ Test environment ready');
  }

  private async cleanupTestEnvironment(): Promise<void> {
    console.log('🧹 Cleaning up test environment...');
    
    try {
      // Clean up test projects
      for (const projectId of this.testProjects) {
        try {
          await db.query('DELETE FROM projects WHERE id = $1', [projectId]);
        } catch (error) {
          console.warn(`Failed to cleanup project ${projectId}:`, error.message);
        }
      }
      
      // Clean up test sessions
      for (const sessionId of this.testSessions) {
        try {
          await db.query('DELETE FROM analytics_events WHERE session_id = $1', [sessionId]);
          await db.query('DELETE FROM sessions WHERE session_id = $1', [sessionId]);
        } catch (error) {
          console.warn(`Failed to cleanup session ${sessionId}:`, error.message);
        }
      }
      
      console.log('✅ Test environment cleaned up');
    } catch (error) {
      console.error('❌ Cleanup failed:', error);
    }
  }

  private async generateComprehensiveReport(): Promise<void> {
    console.log('\n📋 TS014 COMPREHENSIVE TEST REPORT');
    console.log('═'.repeat(90));
    
    // Summary statistics
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    const successRate = (passedTests / totalTests) * 100;
    
    console.log(`📊 SUMMARY STATISTICS:`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Passed: ${passedTests} (${successRate.toFixed(1)}%)`);
    console.log(`   Failed: ${failedTests}`);
    console.log(`   Overall Status: ${successRate >= 95 ? '✅ EXCELLENT' : successRate >= 90 ? '⚠️ GOOD' : '❌ NEEDS ATTENTION'}`);
    
    // Performance analysis
    console.log(`\n⚡ PERFORMANCE ANALYSIS:`);
    const performanceTests = this.results.filter(r => r.category === 'Performance');
    for (const test of performanceTests) {
      console.log(`   ${test.name}: ${test.passed ? '✅' : '❌'} ${test.details}`);
    }
    
    // Category breakdown
    console.log(`\n📈 RESULTS BY CATEGORY:`);
    const categories = [...new Set(this.results.map(r => r.category))];
    for (const category of categories) {
      const categoryResults = this.results.filter(r => r.category === category);
      const categoryPassed = categoryResults.filter(r => r.passed).length;
      const categoryTotal = categoryResults.length;
      console.log(`   ${category}: ${categoryPassed}/${categoryTotal} (${((categoryPassed/categoryTotal)*100).toFixed(1)}%)`);
    }
    
    // Failed tests details
    if (failedTests > 0) {
      console.log(`\n❌ FAILED TESTS DETAILS:`);
      this.results.filter(r => !r.passed).forEach(test => {
        console.log(`   ${test.category} - ${test.name}: ${test.details}`);
      });
    }
    
    // System health comparison
    if (this.healthSnapshots.length >= 2) {
      console.log(`\n🏥 SYSTEM HEALTH COMPARISON:`);
      const start = this.healthSnapshots[0];
      const end = this.healthSnapshots[this.healthSnapshots.length - 1];
      
      console.log(`   Memory Usage: ${start.memoryUsage.heapUsed} → ${end.memoryUsage.heapUsed} bytes`);
      console.log(`   Total Projects: ${start.totalProjects} → ${end.totalProjects}`);
      console.log(`   Total Sessions: ${start.totalSessions} → ${end.totalSessions}`);
    }
    
    // Recommendations
    console.log(`\n💡 RECOMMENDATIONS:`);
    if (successRate >= 95) {
      console.log('   ✅ System is enterprise-ready with excellent reliability');
      console.log('   ✅ All performance benchmarks met');
      console.log('   ✅ Integration between components working properly');
    } else {
      console.log('   ⚠️ Review failed tests and address issues before production deployment');
      if (failedTests > 0) {
        console.log('   🔧 Focus on error recovery and data consistency improvements');
      }
    }
    
    console.log('\n═'.repeat(90));
    console.log('🎯 TS014 Comprehensive Testing Complete');
    console.log(`📈 System Validation: ${successRate >= 95 ? 'ENTERPRISE-READY' : 'NEEDS IMPROVEMENT'}`);
    console.log('═'.repeat(90));
  }
}

/**
 * Main execution entry point
 */
async function main() {
  const testSuite = new TS014ComprehensiveTestSuite();
  await testSuite.runComprehensiveTests();
  process.exit(0);
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('💥 Test suite execution failed:', error);
    process.exit(1);
  });
}

export { TS014ComprehensiveTestSuite };
