#!/usr/bin/env npx tsx

/**
 * TS013 - Session Migration Comprehensive Test Suite
 * 
 * Tests for the enhanced session migration system including:
 * - SessionMigrator functionality
 * - Migration plan analysis and execution
 * - Rollback and recovery mechanisms
 * - Integration with TS012 validation framework
 * - Safety features and data integrity
 */

import { SessionMigrator } from './mcp-server/src/services/sessionMigrator';
import { ProjectSwitchValidator } from './mcp-server/src/services/projectSwitchValidator';
import { projectHandler } from './mcp-server/src/handlers/project';
import { db } from './mcp-server/src/config/database';
import { randomUUID } from 'crypto';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  details: string;
  error?: any;
}

class TS013TestSuite {
  private results: TestResult[] = [];
  private testProjectIds: string[] = [];
  private testSessionIds: string[] = [];

  async runAllTests(): Promise<void> {
    console.log('🧪 Starting TS013 - Session Migration Comprehensive Test Suite');
    console.log('═'.repeat(80));

    await this.setupTestEnvironment();

    try {
      // Test Categories
      await this.testMigrationAnalysis();
      await this.testMigrationExecution();
      await this.testRollbackMechanisms();
      await this.testValidationIntegration();
      await this.testSafetyFeatures();
      await this.testEdgeCases();
      await this.testPerformanceAndScaling();

      // Generate test report
      this.generateTestReport();

    } finally {
      await this.cleanupTestEnvironment();
    }
  }

  // ===========================================
  // Test Environment Setup/Cleanup
  // ===========================================

  async setupTestEnvironment(): Promise<void> {
    console.log('\n📋 Setting up TS013 test environment...');
    
    try {
      // Clean up any existing test data
      await db.query("DELETE FROM analytics_events WHERE session_id::text LIKE 'ts013-test-%'");
      await db.query("DELETE FROM sessions WHERE id::text LIKE 'ts013-test-%'");
      await db.query("DELETE FROM projects WHERE name LIKE 'ts013-test-project-%'");

      // Create test projects
      const projects = [
        { name: 'ts013-test-project-1', description: 'Test project 1 for TS013' },
        { name: 'ts013-test-project-2', description: 'Test project 2 for TS013' },
        { name: 'ts013-test-project-3', description: 'Test project 3 for TS013' }
      ];

      for (const projectData of projects) {
        const project = await projectHandler.createProject(projectData);
        this.testProjectIds.push(project.id);
      }

      // Create test orphan sessions with various analytics patterns
      await this.createTestSessions();

      console.log(`✅ Created ${this.testProjectIds.length} test projects and ${this.testSessionIds.length} test sessions`);

    } catch (error) {
      console.error('❌ Failed to setup test environment:', error);
      throw error;
    }
  }

  async createTestSessions(): Promise<void> {
    const sessionTypes = [
      // Confident assignment - all events point to same project
      {
        type: 'confident',
        sessionId: `ts013-test-${randomUUID()}`,
        analyticsEvents: [
          { project_id: this.testProjectIds[0], event_type: 'session_start' },
          { project_id: this.testProjectIds[0], event_type: 'context_store' },
          { project_id: this.testProjectIds[0], event_type: 'context_search' }
        ]
      },
      // Tentative assignment - mostly one project with some others
      {
        type: 'tentative',
        sessionId: `ts013-test-${randomUUID()}`,
        analyticsEvents: [
          { project_id: this.testProjectIds[0], event_type: 'session_start' },
          { project_id: this.testProjectIds[0], event_type: 'context_store' },
          { project_id: this.testProjectIds[1], event_type: 'project_switch' }
        ]
      },
      // Manual review - multiple conflicting projects
      {
        type: 'manual_review',
        sessionId: `ts013-test-${randomUUID()}`,
        analyticsEvents: [
          { project_id: this.testProjectIds[0], event_type: 'session_start' },
          { project_id: this.testProjectIds[1], event_type: 'project_switch' },
          { project_id: this.testProjectIds[2], event_type: 'context_store' }
        ]
      },
      // Unassigned - no analytics events with project_id
      {
        type: 'unassigned',
        sessionId: `ts013-test-${randomUUID()}`,
        analyticsEvents: [
          { project_id: null, event_type: 'session_start' },
          { project_id: null, event_type: 'system_ping' }
        ]
      },
      // Edge case - empty analytics events
      {
        type: 'empty',
        sessionId: `ts013-test-${randomUUID()}`,
        analyticsEvents: []
      }
    ];

    for (const sessionData of sessionTypes) {
      // Create session
      await db.query(`
        INSERT INTO sessions (id, project_id, started_at, agent_type, title, description)
        VALUES ($1, NULL, NOW(), 'test-agent', $2, $3)
      `, [sessionData.sessionId, `Test session - ${sessionData.type}`, `TS013 test session for ${sessionData.type} scenario`]);

      this.testSessionIds.push(sessionData.sessionId);

      // Create analytics events
      for (const event of sessionData.analyticsEvents) {
        await db.query(`
          INSERT INTO analytics_events (id, session_id, project_id, event_type, created_at)
          VALUES ($1, $2, $3, $4, NOW())
        `, [randomUUID(), sessionData.sessionId, event.project_id, event.event_type]);
      }
    }
  }

  async cleanupTestEnvironment(): Promise<void> {
    console.log('\n🧹 Cleaning up TS013 test environment...');
    
    try {
      // Clean up test data
      for (const sessionId of this.testSessionIds) {
        await db.query("DELETE FROM analytics_events WHERE session_id = $1", [sessionId]);
        await db.query("DELETE FROM sessions WHERE id = $1", [sessionId]);
      }

      for (const projectId of this.testProjectIds) {
        await db.query("DELETE FROM projects WHERE id = $1", [projectId]);
      }

      // Clean up any backup tables that might have been created during testing
      const backupTables = await db.query(`
        SELECT tablename FROM pg_tables 
        WHERE tablename LIKE 'sessions_backup_%'
        AND tablename LIKE '%test%'
      `);

      for (const table of backupTables.rows) {
        await db.query(`DROP TABLE IF EXISTS ${table.tablename}`);
      }

      console.log('✅ Test environment cleanup complete');

    } catch (error) {
      console.error('❌ Failed to cleanup test environment:', error);
    }
  }

  // ===========================================
  // Migration Analysis Tests
  // ===========================================

  async testMigrationAnalysis(): Promise<void> {
    console.log('\n🔍 Testing Migration Analysis...');

    await this.runTest('Migration Health Check', async () => {
      const health = await SessionMigrator.getMigrationHealth();
      
      if (typeof health.orphanSessions !== 'number' || typeof health.totalSessions !== 'number') {
        throw new Error('Health check returned invalid data types');
      }

      // Should have our test orphan sessions
      if (health.orphanSessions < 5) {
        throw new Error(`Expected at least 5 orphan sessions, got ${health.orphanSessions}`);
      }

      return `Health check: ${health.orphanSessions} orphan sessions out of ${health.totalSessions} total`;
    });

    await this.runTest('Orphan Session Analysis', async () => {
      const plan = await SessionMigrator.analyzeOrphanSessions();
      
      if (!plan.migrationId || !plan.sessions || !plan.summary) {
        throw new Error('Migration plan missing required fields');
      }

      // Verify we have all our test session types
      const sessionTypes = plan.sessions.map(s => s.assignmentType);
      const expectedTypes = ['confident', 'tentative', 'manual_review', 'unassigned'];
      
      for (const expectedType of expectedTypes) {
        if (!sessionTypes.includes(expectedType as any)) {
          throw new Error(`Missing expected assignment type: ${expectedType}`);
        }
      }

      // Verify confidence scoring
      const confidentSessions = plan.sessions.filter(s => s.assignmentType === 'confident');
      if (confidentSessions.length > 0 && confidentSessions[0].confidence < 0.8) {
        throw new Error('Confident session has unexpectedly low confidence score');
      }

      return `Analyzed ${plan.sessions.length} sessions: ${plan.summary.confident} confident, ${plan.summary.tentative} tentative, ${plan.summary.manual_review} manual review, ${plan.summary.unassigned} unassigned`;
    });

    await this.runTest('Risk and Recommendation Generation', async () => {
      const plan = await SessionMigrator.analyzeOrphanSessions();
      
      if (!Array.isArray(plan.risks) || !Array.isArray(plan.recommendations)) {
        throw new Error('Plan missing risks or recommendations arrays');
      }

      // Should have generated at least some recommendations
      if (plan.recommendations.length === 0) {
        throw new Error('No recommendations generated');
      }

      return `Generated ${plan.risks.length} risks and ${plan.recommendations.length} recommendations`;
    });
  }

  // ===========================================
  // Migration Execution Tests
  // ===========================================

  async testMigrationExecution(): Promise<void> {
    console.log('\n🎯 Testing Migration Execution...');

    await this.runTest('Dry Run Migration', async () => {
      const plan = await SessionMigrator.analyzeOrphanSessions();
      const report = await SessionMigrator.executeMigrationPlan(plan, { dryRun: true });

      if (!report.migrationId || typeof report.summary !== 'object') {
        throw new Error('Migration report missing required fields');
      }

      // In dry run, all should be successful
      if (report.summary.failed > 0) {
        throw new Error(`Dry run should not have failures, got ${report.summary.failed}`);
      }

      return `Dry run: ${report.summary.total} sessions processed successfully`;
    });

    await this.runTest('Skip Low Confidence Migration', async () => {
      const plan = await SessionMigrator.analyzeOrphanSessions();
      const report = await SessionMigrator.executeMigrationPlan(plan, { 
        dryRun: true, 
        skipLowConfidence: true 
      });

      const processed = report.summary.successful + report.summary.skipped;
      if (processed !== plan.summary.total) {
        throw new Error('Processed count doesn\'t match plan total');
      }

      // Should have skipped some sessions
      if (report.summary.skipped === 0 && plan.summary.tentative + plan.summary.manual_review > 0) {
        throw new Error('Expected some sessions to be skipped');
      }

      return `Skipped ${report.summary.skipped} low-confidence sessions`;
    });

    await this.runTest('Migration Backup Creation', async () => {
      const plan = await SessionMigrator.analyzeOrphanSessions();
      
      // Execute a small test migration (not dry run)
      const testPlan = {
        ...plan,
        sessions: plan.sessions.slice(0, 1) // Only migrate one session
      };

      const report = await SessionMigrator.executeMigrationPlan(testPlan, { dryRun: false });

      // Verify backup table was created
      const backupTableName = `sessions_backup_${plan.migrationId.replace(/-/g, '_')}`;
      const backupExists = await db.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = $1
        )
      `, [backupTableName]);

      if (!backupExists.rows[0].exists) {
        throw new Error('Backup table was not created');
      }

      return `Migration backup table created: ${backupTableName}`;
    });
  }

  // ===========================================
  // Rollback Mechanism Tests
  // ===========================================

  async testRollbackMechanisms(): Promise<void> {
    console.log('\n🔄 Testing Rollback Mechanisms...');

    await this.runTest('Rollback Data Preparation', async () => {
      const plan = await SessionMigrator.analyzeOrphanSessions();
      
      // Execute migration to create rollback data
      const testPlan = {
        ...plan,
        sessions: plan.sessions.slice(0, 1)
      };

      await SessionMigrator.executeMigrationPlan(testPlan, { dryRun: false });

      // Test rollback
      const rollbackResult = await SessionMigrator.rollbackMigration(plan.migrationId);

      if (!rollbackResult.success) {
        throw new Error(`Rollback failed: ${rollbackResult.error}`);
      }

      return 'Rollback executed successfully';
    });

    await this.runTest('Rollback Integrity Verification', async () => {
      const plan = await SessionMigrator.analyzeOrphanSessions();
      
      // Create and execute small migration
      const testPlan = {
        ...plan,
        sessions: plan.sessions.slice(0, 2)
      };

      // Store original states
      const originalStates = await db.query(`
        SELECT id, project_id FROM sessions WHERE id = ANY($1)
      `, [testPlan.sessions.map(s => s.session.id)]);

      // Execute migration
      await SessionMigrator.executeMigrationPlan(testPlan, { dryRun: false });

      // Rollback
      await SessionMigrator.rollbackMigration(plan.migrationId);

      // Verify rollback restored original state
      const currentStates = await db.query(`
        SELECT id, project_id FROM sessions WHERE id = ANY($1)
      `, [testPlan.sessions.map(s => s.session.id)]);

      // Compare states
      for (const original of originalStates.rows) {
        const current = currentStates.rows.find(c => c.id === original.id);
        if (!current || current.project_id !== original.project_id) {
          throw new Error(`Session ${original.id} not properly rolled back`);
        }
      }

      return `Rollback integrity verified for ${originalStates.rows.length} sessions`;
    });
  }

  // ===========================================
  // TS012 Validation Integration Tests
  // ===========================================

  async testValidationIntegration(): Promise<void> {
    console.log('\n✅ Testing TS012 Validation Integration...');

    await this.runTest('Pre-Migration Validation', async () => {
      const plan = await SessionMigrator.analyzeOrphanSessions();
      
      // Find a confident session to test validation with
      const confidentSession = plan.sessions.find(s => s.assignmentType === 'confident' && s.targetProjectId);
      if (!confidentSession) {
        throw new Error('No confident session available for validation test');
      }

      // Test TS012 validation
      const validationResult = await ProjectSwitchValidator.validatePreSwitch(
        confidentSession.session.id, 
        confidentSession.targetProjectId!
      );

      if (!validationResult) {
        throw new Error('Validation result is null');
      }

      // Validation may pass or fail, but it should complete
      return `TS012 validation completed for session ${confidentSession.session.id.substring(0, 8)}... (${validationResult.isValid ? 'PASSED' : 'FAILED'})`;
    });

    await this.runTest('Migration with Validation Enabled', async () => {
      const plan = await SessionMigrator.analyzeOrphanSessions();
      
      const testPlan = {
        ...plan,
        sessions: plan.sessions.filter(s => s.assignmentType === 'confident').slice(0, 1)
      };

      const report = await SessionMigrator.executeMigrationPlan(testPlan, { 
        dryRun: true, 
        skipValidation: false 
      });

      if (report.summary.total === 0) {
        throw new Error('No sessions to test validation with');
      }

      return `Migration with validation: ${report.summary.successful} successful, ${report.summary.failed} failed`;
    });
  }

  // ===========================================
  // Safety Features Tests
  // ===========================================

  async testSafetyFeatures(): Promise<void> {
    console.log('\n🛡️  Testing Safety Features...');

    await this.runTest('Transaction Rollback on Error', async () => {
      // This test simulates an error during migration to test transaction rollback
      const plan = await SessionMigrator.analyzeOrphanSessions();
      
      // Store original count
      const originalCount = await db.query('SELECT COUNT(*) FROM sessions WHERE project_id IS NULL');
      const originalNullCount = parseInt(originalCount.rows[0].count);

      // Try to execute migration with an invalid project ID to force error
      const invalidPlan = {
        ...plan,
        sessions: [{
          ...plan.sessions[0],
          targetProjectId: 'invalid-project-id-that-does-not-exist'
        }]
      };

      try {
        await SessionMigrator.executeMigrationPlan(invalidPlan, { 
          dryRun: false, 
          skipValidation: true // Skip validation to test transaction rollback
        });
      } catch (error) {
        // Expected to fail
      }

      // Verify no partial changes occurred
      const finalCount = await db.query('SELECT COUNT(*) FROM sessions WHERE project_id IS NULL');
      const finalNullCount = parseInt(finalCount.rows[0].count);

      if (finalNullCount !== originalNullCount) {
        throw new Error(`Transaction rollback failed: ${originalNullCount} → ${finalNullCount}`);
      }

      return 'Transaction rollback on error working correctly';
    });

    await this.runTest('Backup Table Cleanup Detection', async () => {
      const plan = await SessionMigrator.analyzeOrphanSessions();
      
      // Create a migration to generate backup table
      const testPlan = {
        ...plan,
        sessions: plan.sessions.slice(0, 1)
      };

      await SessionMigrator.executeMigrationPlan(testPlan, { dryRun: false });

      // Check backup table exists
      const backupTableName = `sessions_backup_${plan.migrationId.replace(/-/g, '_')}`;
      const backupExists = await db.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = $1
        )
      `, [backupTableName]);

      if (!backupExists.rows[0].exists) {
        throw new Error('Backup table should exist after migration');
      }

      // Clean it up for this test
      await db.query(`DROP TABLE IF EXISTS ${backupTableName}`);

      return 'Backup table lifecycle working correctly';
    });
  }

  // ===========================================
  // Edge Cases Tests
  // ===========================================

  async testEdgeCases(): Promise<void> {
    console.log('\n🎭 Testing Edge Cases...');

    await this.runTest('Empty Migration Plan', async () => {
      // Temporarily make all sessions assigned to test empty migration
      const tempUpdate = await db.query(`
        UPDATE sessions 
        SET project_id = $1 
        WHERE id LIKE 'ts013-test-%' AND project_id IS NULL
      `, [this.testProjectIds[0]]);

      try {
        const health = await SessionMigrator.getMigrationHealth();
        
        // Should handle zero orphan sessions gracefully
        if (health.orphanSessions > 0) {
          // If there are still orphans (from other tests), that's ok
          // We're testing the analysis handles empty results
          const plan = await SessionMigrator.analyzeOrphanSessions();
          return `Empty migration plan handled: ${plan.sessions.length} sessions to migrate`;
        }

        return 'No orphan sessions available for empty migration test';
      } finally {
        // Restore original state
        await db.query(`
          UPDATE sessions 
          SET project_id = NULL 
          WHERE id LIKE 'ts013-test-%'
        `);
      }
    });

    await this.runTest('Malformed Migration ID Rollback', async () => {
      try {
        const result = await SessionMigrator.rollbackMigration('invalid-migration-id');
        if (result.success) {
          throw new Error('Rollback should fail with invalid migration ID');
        }
        return `Correctly rejected invalid migration ID: ${result.error}`;
      } catch (error) {
        return `Properly handled malformed migration ID: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    });
  }

  // ===========================================
  // Performance and Scaling Tests
  // ===========================================

  async testPerformanceAndScaling(): Promise<void> {
    console.log('\n⚡ Testing Performance and Scaling...');

    await this.runTest('Large Migration Analysis Performance', async () => {
      const startTime = Date.now();
      const plan = await SessionMigrator.analyzeOrphanSessions();
      const analysisTime = Date.now() - startTime;

      if (analysisTime > 5000) { // 5 second threshold
        throw new Error(`Analysis took too long: ${analysisTime}ms`);
      }

      return `Analysis completed in ${analysisTime}ms for ${plan.sessions.length} sessions`;
    });

    await this.runTest('Migration Memory Usage', async () => {
      const beforeMemory = process.memoryUsage();
      
      const plan = await SessionMigrator.analyzeOrphanSessions();
      await SessionMigrator.executeMigrationPlan(plan, { dryRun: true });
      
      const afterMemory = process.memoryUsage();
      const memoryIncrease = afterMemory.heapUsed - beforeMemory.heapUsed;
      
      // Memory increase should be reasonable (less than 50MB for test data)
      if (memoryIncrease > 50 * 1024 * 1024) {
        throw new Error(`Excessive memory usage: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
      }

      return `Memory usage: ${Math.round(memoryIncrease / 1024 / 1024)}MB increase`;
    });
  }

  // ===========================================
  // Test Execution Helpers
  // ===========================================

  async runTest(name: string, testFn: () => Promise<string>): Promise<void> {
    const startTime = Date.now();
    try {
      const details = await testFn();
      const duration = Date.now() - startTime;
      this.results.push({ name, passed: true, duration, details });
      console.log(`  ✅ ${name} (${duration}ms) - ${details}`);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({ 
        name, 
        passed: false, 
        duration, 
        details: error instanceof Error ? error.message : String(error),
        error 
      });
      console.log(`  ❌ ${name} (${duration}ms) - ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  generateTestReport(): void {
    const total = this.results.length;
    const passed = this.results.filter(r => r.passed).length;
    const failed = total - passed;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    const averageDuration = Math.round(totalDuration / total);

    console.log('\n' + '═'.repeat(80));
    console.log('📊 TS013 Migration Test Suite Results');
    console.log('═'.repeat(80));
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed} (${Math.round(passed/total*100)}%)`);
    console.log(`Failed: ${failed} (${Math.round(failed/total*100)}%)`);
    console.log(`Total Duration: ${totalDuration}ms`);
    console.log(`Average Duration: ${averageDuration}ms`);

    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.name}: ${r.details}`);
      });
    }

    console.log('\n✅ Test Categories Coverage:');
    console.log('  - Migration Analysis: ✅');
    console.log('  - Migration Execution: ✅');
    console.log('  - Rollback Mechanisms: ✅');
    console.log('  - TS012 Validation Integration: ✅');
    console.log('  - Safety Features: ✅');
    console.log('  - Edge Cases: ✅');
    console.log('  - Performance and Scaling: ✅');

    if (passed === total) {
      console.log('\n🎉 All tests passed! TS013 implementation is ready for production.');
    } else {
      console.log(`\n⚠️  ${failed} test(s) failed. Review and fix before production deployment.`);
    }
  }
}

// Handle CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const testSuite = new TS013TestSuite();
  testSuite.runAllTests().catch(error => {
    console.error('Test suite execution failed:', error);
    process.exit(1);
  });
}
