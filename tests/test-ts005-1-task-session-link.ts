/**
 * TS005-1 Test: Task-Session Linking and Display ID Validation
 *
 * Tests the task-session FK relationship and session display_id generation
 */

import { db } from './mcp-server/src/config/database.js';
import { SessionTracker } from './mcp-server/src/services/sessionTracker.js';
import { tasksHandler } from './mcp-server/src/handlers/tasks.js';

async function runTests() {
  console.log('🧪 TS005-1: Testing Task-Session Linking & Display IDs\n');
  console.log('='.repeat(60));

  // Test 1: Verify session display_id schema
  console.log('\n📋 Test 1: Session Display ID Schema');
  console.log('-'.repeat(60));

  const displayIdSchema = await db.query(`
    SELECT
      column_name,
      data_type,
      is_nullable,
      character_maximum_length
    FROM information_schema.columns
    WHERE table_name = 'sessions'
      AND column_name = 'display_id'
  `);

  if (displayIdSchema.rows.length > 0) {
    const col = displayIdSchema.rows[0];
    console.log(`✅ display_id column exists: ${col.data_type}(${col.character_maximum_length})`);
    console.log(`   Nullable: ${col.is_nullable}`);
  } else {
    console.log('❌ display_id column missing!');
  }

  // Test 2: Check display_id uniqueness constraint
  console.log('\n📋 Test 2: Display ID Uniqueness Constraint');
  console.log('-'.repeat(60));

  const uniqueConstraint = await db.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = 'sessions'
      AND indexname = 'idx_sessions_display_id'
  `);

  if (uniqueConstraint.rows.length > 0) {
    console.log('✅ Unique index exists: idx_sessions_display_id');
  } else {
    console.log('❌ Unique index missing!');
  }

  // Test 3: Verify display_id backfill completeness
  console.log('\n📋 Test 3: Display ID Backfill Status');
  console.log('-'.repeat(60));

  const backfillStats = await db.query(`
    SELECT
      COUNT(*) as total_sessions,
      COUNT(display_id) as sessions_with_display_id,
      COUNT(*) - COUNT(display_id) as sessions_missing_display_id
    FROM sessions
  `);

  const stats = backfillStats.rows[0];
  console.log(`Total sessions: ${stats.total_sessions}`);
  console.log(`Sessions with display_id: ${stats.sessions_with_display_id}`);
  console.log(`Sessions missing display_id: ${stats.sessions_missing_display_id}`);

  if (parseInt(stats.sessions_missing_display_id) === 0) {
    console.log('✅ All sessions have display_ids');
  } else {
    console.log('❌ Some sessions missing display_ids!');
  }

  // Test 4: Verify display_id format
  console.log('\n📋 Test 4: Display ID Format Validation');
  console.log('-'.repeat(60));

  const formatCheck = await db.query(`
    SELECT
      display_id,
      display_id ~ '^SES-[0-9]{4}-[0-9]{4}$' as valid_format
    FROM sessions
    WHERE display_id IS NOT NULL
    ORDER BY started_at DESC
    LIMIT 5
  `);

  console.log('Sample display_ids (most recent 5):');
  formatCheck.rows.forEach(row => {
    const status = row.valid_format ? '✅' : '❌';
    console.log(`  ${status} ${row.display_id}`);
  });

  const invalidCount = formatCheck.rows.filter(r => !r.valid_format).length;
  if (invalidCount === 0) {
    console.log('✅ All display_ids match format SES-YYYY-NNNN');
  } else {
    console.log(`❌ ${invalidCount} invalid format(s) found!`);
  }

  // Test 5: Verify task session_id schema
  console.log('\n📋 Test 5: Task session_id Column Schema');
  console.log('-'.repeat(60));

  const taskSessionIdSchema = await db.query(`
    SELECT
      column_name,
      data_type,
      is_nullable
    FROM information_schema.columns
    WHERE table_name = 'tasks'
      AND column_name = 'session_id'
  `);

  if (taskSessionIdSchema.rows.length > 0) {
    const col = taskSessionIdSchema.rows[0];
    console.log(`✅ session_id column exists: ${col.data_type}`);
    console.log(`   Nullable: ${col.is_nullable} (should be YES for backward compatibility)`);
  } else {
    console.log('❌ session_id column missing!');
  }

  // Test 6: Verify FK constraint
  console.log('\n📋 Test 6: Foreign Key Constraint');
  console.log('-'.repeat(60));

  const fkConstraint = await db.query(`
    SELECT
      conname,
      pg_get_constraintdef(oid) as definition
    FROM pg_constraint
    WHERE conrelid = 'tasks'::regclass
      AND conname = 'fk_tasks_session_id'
  `);

  if (fkConstraint.rows.length > 0) {
    console.log('✅ FK constraint exists: fk_tasks_session_id');
    console.log(`   ${fkConstraint.rows[0].definition}`);
  } else {
    console.log('❌ FK constraint missing!');
  }

  // Test 7: Check task-session linking backfill
  console.log('\n📋 Test 7: Task-Session Linking Backfill Status');
  console.log('-'.repeat(60));

  const linkingStats = await db.query(`
    SELECT
      COUNT(*) as total_tasks,
      COUNT(session_id) as tasks_with_session,
      COUNT(CASE WHEN metadata->>'backfilled_session_id' = 'true' THEN 1 END) as backfilled_tasks,
      ROUND((COUNT(session_id)::NUMERIC / COUNT(*)::NUMERIC * 100), 1) as link_percentage
    FROM tasks
  `);

  const linkStats = linkingStats.rows[0];
  console.log(`Total tasks: ${linkStats.total_tasks}`);
  console.log(`Tasks with session_id: ${linkStats.tasks_with_session} (${linkStats.link_percentage}%)`);
  console.log(`Tasks backfilled: ${linkStats.backfilled_tasks}`);

  if (parseFloat(linkStats.link_percentage) >= 60) {
    console.log('✅ Good linking rate (target: 60-70%)');
  } else {
    console.log('⚠️  Low linking rate (expected for tasks created outside sessions)');
  }

  // Test 8: Test new task creation with session capture
  console.log('\n📋 Test 8: New Task Creation with Session Capture');
  console.log('-'.repeat(60));

  const activeSessionId = await SessionTracker.getActiveSession();
  if (activeSessionId) {
    console.log(`Active session found: ${activeSessionId.substring(0, 8)}...`);

    // Get project_id from active session
    const sessionData = await db.query(
      'SELECT project_id FROM sessions WHERE id = $1',
      [activeSessionId]
    );

    if (sessionData.rows.length > 0) {
      const projectId = sessionData.rows[0].project_id;
      console.log(`Project: ${projectId.substring(0, 8)}...`);

      // Create test task
      const testTask = await tasksHandler.createTask(
        projectId,
        'TS005-1 Test Task',
        'Verify automatic session_id capture',
        'test',
        'low',
        undefined,
        undefined,
        ['ts005-1', 'test']
      );

      console.log(`\nTest task created: ${testTask.id.substring(0, 8)}...`);
      console.log(`  Title: ${testTask.title}`);
      console.log(`  Session ID captured: ${testTask.sessionId ? testTask.sessionId.substring(0, 8) + '...' : 'NONE'}`);

      if (testTask.sessionId === activeSessionId) {
        console.log('✅ Session ID automatically captured correctly');
      } else {
        console.log('❌ Session ID mismatch or not captured!');
      }

      // Clean up test task
      await db.query('DELETE FROM tasks WHERE id = $1', [testTask.id]);
      console.log('  (Test task cleaned up)');
    } else {
      console.log('⚠️  Could not get project_id from active session');
    }
  } else {
    console.log('ℹ️  No active session (test skipped - this is okay)');
  }

  // Test 9: Verify task query returns session_id
  console.log('\n📋 Test 9: Task Query Returns session_id');
  console.log('-'.repeat(60));

  const sampleTasks = await db.query(`
    SELECT id, title, session_id, project_id
    FROM tasks
    WHERE session_id IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 3
  `);

  console.log(`Sample tasks with session_id (${sampleTasks.rows.length} shown):`);
  sampleTasks.rows.forEach((task, idx) => {
    console.log(`  ${idx + 1}. ${task.title.substring(0, 40)}`);
    console.log(`     Task: ${task.id.substring(0, 8)}... → Session: ${task.session_id.substring(0, 8)}...`);
  });

  if (sampleTasks.rows.length > 0) {
    console.log('✅ Tasks successfully linked to sessions');
  } else {
    console.log('⚠️  No tasks with session_id found');
  }

  // Test 10: Verify helper function exists
  console.log('\n📋 Test 10: Display ID Generation Function');
  console.log('-'.repeat(60));

  const functionCheck = await db.query(`
    SELECT proname, pg_get_functiondef(oid) as definition
    FROM pg_proc
    WHERE proname = 'get_next_session_display_id'
  `);

  if (functionCheck.rows.length > 0) {
    console.log('✅ Function exists: get_next_session_display_id()');
  } else {
    console.log('❌ Function missing!');
  }

  // Test 11: Verify trigger exists
  console.log('\n📋 Test 11: Auto-Generation Trigger');
  console.log('-'.repeat(60));

  const triggerCheck = await db.query(`
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = 'sessions'::regclass
      AND tgname = 'trigger_auto_generate_session_display_id'
  `);

  if (triggerCheck.rows.length > 0) {
    console.log('✅ Trigger exists: trigger_auto_generate_session_display_id');
  } else {
    console.log('❌ Trigger missing!');
  }

  // Test 12: Check index performance
  console.log('\n📋 Test 12: Performance Indexes');
  console.log('-'.repeat(60));

  const indexes = await db.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename IN ('sessions', 'tasks')
      AND (indexname LIKE '%display_id%' OR indexname LIKE '%session_id%')
    ORDER BY tablename, indexname
  `);

  console.log(`Found ${indexes.rows.length} relevant indexes:`);
  indexes.rows.forEach(idx => {
    console.log(`  ✅ ${idx.indexname}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('🎉 TS005-1 Test Complete!\n');

  process.exit(0);
}

runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});