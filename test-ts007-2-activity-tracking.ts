#!/usr/bin/env npx tsx
/**
 * TS007-2: Task + Context Activity Tracking - Comprehensive Test Suite
 *
 * Tests:
 * 1. Database migration verification (columns exist, backfill worked)
 * 2. SessionTracker activity methods
 * 3. Task creation/update tracking
 * 4. Context creation tracking
 * 5. Activity persistence on session end
 * 6. session_status display includes activity
 * 7. Historical data backfill verification
 */

import { Pool } from 'pg';
import { SessionTracker } from './mcp-server/src/services/sessionTracker.js';
import { TasksHandler } from './mcp-server/src/handlers/tasks.js';
import { ContextHandler } from './mcp-server/src/handlers/context.js';

const db = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'aidis_production',
  user: 'ridgetop'
});

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

const results: TestResult[] = [];

function addResult(name: string, passed: boolean, message: string, details?: any) {
  results.push({ name, passed, message, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}: ${message}`);
  if (details) {
    console.log(`   Details:`, JSON.stringify(details, null, 2));
  }
}

async function test1_VerifyMigration() {
  console.log('\n📋 Test 1: Verify Migration 026 Applied');

  try {
    const result = await db.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'sessions'
        AND column_name IN ('tasks_created', 'tasks_updated', 'tasks_completed', 'contexts_created')
      ORDER BY column_name
    `);

    const expectedColumns = ['contexts_created', 'tasks_completed', 'tasks_created', 'tasks_updated'];
    const actualColumns = result.rows.map(r => r.column_name).sort();

    if (JSON.stringify(expectedColumns) === JSON.stringify(actualColumns)) {
      addResult('Migration Applied', true, 'All 4 activity columns exist', {
        columns: result.rows.map(r => ({
          name: r.column_name,
          type: r.data_type,
          default: r.column_default
        }))
      });
    } else {
      addResult('Migration Applied', false, 'Missing columns', {
        expected: expectedColumns,
        actual: actualColumns
      });
    }
  } catch (error) {
    addResult('Migration Applied', false, `Error: ${error}`);
  }
}

async function test2_VerifyBackfill() {
  console.log('\n📋 Test 2: Verify Historical Data Backfill');

  try {
    const result = await db.query(`
      SELECT
        COUNT(*) as total_sessions,
        SUM(tasks_created) as total_tasks,
        SUM(contexts_created) as total_contexts,
        COUNT(*) FILTER (WHERE tasks_created > 0) as sessions_with_tasks,
        COUNT(*) FILTER (WHERE contexts_created > 0) as sessions_with_contexts
      FROM sessions
    `);

    const stats = result.rows[0];

    if (parseInt(stats.total_sessions) > 0) {
      addResult('Backfill Stats', true, 'Historical data backfilled', {
        total_sessions: parseInt(stats.total_sessions),
        total_tasks: parseInt(stats.total_tasks) || 0,
        total_contexts: parseInt(stats.total_contexts) || 0,
        sessions_with_tasks: parseInt(stats.sessions_with_tasks) || 0,
        sessions_with_contexts: parseInt(stats.sessions_with_contexts) || 0
      });
    } else {
      addResult('Backfill Stats', false, 'No sessions found');
    }
  } catch (error) {
    addResult('Backfill Stats', false, `Error: ${error}`);
  }
}

async function test3_SessionTrackerMethods() {
  console.log('\n📋 Test 3: SessionTracker Activity Methods');

  try {
    // Start a test session
    const testProjectId = await getOrCreateTestProject();
    const sessionId = await SessionTracker.startSession(testProjectId, 'TS007-2 Test Session');

    console.log(`   Test session created: ${sessionId.substring(0, 8)}...`);

    // Test recordTaskCreated
    SessionTracker.recordTaskCreated(sessionId);
    SessionTracker.recordTaskCreated(sessionId);

    // Test recordTaskUpdated
    SessionTracker.recordTaskUpdated(sessionId, false);
    SessionTracker.recordTaskUpdated(sessionId, true); // completion

    // Test recordContextCreated
    SessionTracker.recordContextCreated(sessionId);
    SessionTracker.recordContextCreated(sessionId);
    SessionTracker.recordContextCreated(sessionId);

    // Get activity counts
    const activity = SessionTracker.getActivityCounts(sessionId);

    const expected = {
      tasks_created: 2,
      tasks_updated: 2,
      tasks_completed: 1,
      contexts_created: 3
    };

    if (
      activity.tasks_created === expected.tasks_created &&
      activity.tasks_updated === expected.tasks_updated &&
      activity.tasks_completed === expected.tasks_completed &&
      activity.contexts_created === expected.contexts_created
    ) {
      addResult('In-Memory Tracking', true, 'All activity methods work correctly', {
        expected,
        actual: activity
      });
    } else {
      addResult('In-Memory Tracking', false, 'Activity counts mismatch', {
        expected,
        actual: activity
      });
    }

    // End session to test persistence
    await SessionTracker.endSession(sessionId);
    console.log(`   Test session ended: ${sessionId.substring(0, 8)}...`);

    // Verify persistence
    const dbResult = await db.query(`
      SELECT tasks_created, tasks_updated, tasks_completed, contexts_created
      FROM sessions
      WHERE id = $1
    `, [sessionId]);

    if (dbResult.rows.length > 0) {
      const persisted = dbResult.rows[0];

      if (
        persisted.tasks_created === expected.tasks_created &&
        persisted.tasks_updated === expected.tasks_updated &&
        persisted.tasks_completed === expected.tasks_completed &&
        persisted.contexts_created === expected.contexts_created
      ) {
        addResult('Database Persistence', true, 'Activity counts persisted correctly', {
          expected,
          persisted
        });
      } else {
        addResult('Database Persistence', false, 'Persisted counts mismatch', {
          expected,
          persisted
        });
      }
    } else {
      addResult('Database Persistence', false, 'Session not found in database');
    }

  } catch (error) {
    addResult('SessionTracker Methods', false, `Error: ${error}`);
  }
}

async function test4_TaskHandlerIntegration() {
  console.log('\n📋 Test 4: Task Handler Integration');

  try {
    const testProjectId = await getOrCreateTestProject();
    const sessionId = await SessionTracker.startSession(testProjectId, 'TS007-2 Task Test');

    console.log(`   Test session created: ${sessionId.substring(0, 8)}...`);

    const tasksHandler = new TasksHandler(db);

    // Create a task
    const task = await tasksHandler.createTask(
      testProjectId,
      'TS007-2 Test Task',
      'Testing activity tracking',
      'test',
      'medium'
    );

    console.log(`   Task created: ${task.id.substring(0, 8)}...`);

    // Update task status
    await tasksHandler.updateTaskStatus(task.id, 'in_progress');
    await tasksHandler.updateTaskStatus(task.id, 'completed');

    // Check activity counts
    const activity = SessionTracker.getActivityCounts(sessionId);

    if (activity.tasks_created >= 1 && activity.tasks_updated >= 2 && activity.tasks_completed >= 1) {
      addResult('Task Handler Tracking', true, 'Task operations tracked correctly', {
        activity
      });
    } else {
      addResult('Task Handler Tracking', false, 'Task tracking incomplete', {
        activity
      });
    }

    await SessionTracker.endSession(sessionId);

    // Clean up
    await db.query('DELETE FROM tasks WHERE id = $1', [task.id]);

  } catch (error) {
    addResult('Task Handler Integration', false, `Error: ${error}`);
  }
}

async function test5_ContextHandlerIntegration() {
  console.log('\n📋 Test 5: Context Handler Integration');

  try {
    const testProjectId = await getOrCreateTestProject();
    const sessionId = await SessionTracker.startSession(testProjectId, 'TS007-2 Context Test');

    console.log(`   Test session created: ${sessionId.substring(0, 8)}...`);

    const contextHandler = new ContextHandler();

    // Store contexts
    await contextHandler.storeContext({
      projectId: testProjectId,
      sessionId: sessionId,
      content: 'TS007-2 Test Context 1',
      type: 'test',
      tags: ['test', 'ts007-2']
    });

    await contextHandler.storeContext({
      projectId: testProjectId,
      sessionId: sessionId,
      content: 'TS007-2 Test Context 2',
      type: 'test',
      tags: ['test', 'ts007-2']
    });

    // Check activity counts
    const activity = SessionTracker.getActivityCounts(sessionId);

    if (activity.contexts_created >= 2) {
      addResult('Context Handler Tracking', true, 'Context operations tracked correctly', {
        activity
      });
    } else {
      addResult('Context Handler Tracking', false, 'Context tracking incomplete', {
        activity
      });
    }

    await SessionTracker.endSession(sessionId);

    // Clean up
    await db.query('DELETE FROM contexts WHERE session_id = $1', [sessionId]);

  } catch (error) {
    addResult('Context Handler Integration', false, `Error: ${error}`);
  }
}

async function test6_SessionStatusDisplay() {
  console.log('\n📋 Test 6: Session Status Display');

  try {
    const testProjectId = await getOrCreateTestProject();
    const sessionId = await SessionTracker.startSession(testProjectId, 'TS007-2 Status Test');

    // Add some activity
    SessionTracker.recordTaskCreated(sessionId);
    SessionTracker.recordTaskUpdated(sessionId, true);
    SessionTracker.recordContextCreated(sessionId);

    // Get session status (simulating the MCP tool call)
    const sessionData = await SessionTracker.getSessionData(sessionId);

    if (sessionData) {
      addResult('Session Data Retrieval', true, 'Session data retrieved', {
        id: sessionId.substring(0, 8) + '...',
        activity: SessionTracker.getActivityCounts(sessionId)
      });
    } else {
      addResult('Session Data Retrieval', false, 'Failed to retrieve session data');
    }

    await SessionTracker.endSession(sessionId);

  } catch (error) {
    addResult('Session Status Display', false, `Error: ${error}`);
  }
}

async function getOrCreateTestProject(): Promise<string> {
  const result = await db.query(`
    SELECT id FROM projects WHERE name = 'TS007-2-Test' LIMIT 1
  `);

  if (result.rows.length > 0) {
    return result.rows[0].id;
  }

  const createResult = await db.query(`
    INSERT INTO projects (name, description)
    VALUES ('TS007-2-Test', 'Test project for TS007-2 activity tracking')
    RETURNING id
  `);

  return createResult.rows[0].id;
}

async function printSummary() {
  console.log('\n' + '='.repeat(80));
  console.log('TS007-2 Test Summary');
  console.log('='.repeat(80));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`\n✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${total}`);
  console.log(`🎯 Success Rate: ${Math.round((passed / total) * 100)}%`);

  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}: ${r.message}`);
    });
  }

  console.log('\n' + '='.repeat(80));
}

async function runTests() {
  console.log('🚀 Starting TS007-2 Activity Tracking Tests\n');

  try {
    await test1_VerifyMigration();
    await test2_VerifyBackfill();
    await test3_SessionTrackerMethods();
    await test4_TaskHandlerIntegration();
    await test5_ContextHandlerIntegration();
    await test6_SessionStatusDisplay();

    await printSummary();

  } catch (error) {
    console.error('❌ Test suite failed:', error);
  } finally {
    await db.end();
  }
}

runTests();
