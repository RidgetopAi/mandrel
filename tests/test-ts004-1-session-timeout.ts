/**
 * TS004-1 Test: Session Status and Timeout Functionality
 *
 * Tests the session status enum and 2-hour timeout implementation
 */

import { db } from './mcp-server/src/config/database.js';
import { SessionTracker } from './mcp-server/src/services/sessionTracker.js';

async function runTests() {
  console.log('🧪 TS004-1: Testing Session Status & Timeout\n');
  console.log('=' .repeat(60));

  // Test 1: Verify database schema changes
  console.log('\n📋 Test 1: Database Schema Validation');
  console.log('-'.repeat(60));

  const schemaCheck = await db.query(`
    SELECT
      column_name,
      data_type,
      is_nullable
    FROM information_schema.columns
    WHERE table_name = 'sessions'
      AND column_name IN ('status', 'last_activity_at')
    ORDER BY column_name
  `);

  console.log('Schema columns found:');
  schemaCheck.rows.forEach(row => {
    console.log(`  ✅ ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
  });

  if (schemaCheck.rows.length === 2) {
    console.log('✅ All required columns exist');
  } else {
    console.log('❌ Missing columns!');
  }

  // Test 2: Check status enum constraint
  console.log('\n📋 Test 2: Status Enum Constraint');
  console.log('-'.repeat(60));

  const constraintCheck = await db.query(`
    SELECT conname, pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conrelid = 'sessions'::regclass
      AND conname = 'sessions_status_check'
  `);

  if (constraintCheck.rows.length > 0) {
    console.log('✅ Status CHECK constraint exists');
    console.log(`   ${constraintCheck.rows[0].pg_get_constraintdef}`);
  } else {
    console.log('❌ Status CHECK constraint missing!');
  }

  // Test 3: Check indexes
  console.log('\n📋 Test 3: Performance Indexes');
  console.log('-'.repeat(60));

  const indexCheck = await db.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = 'sessions'
      AND indexname LIKE '%status%' OR indexname LIKE '%activity%'
    ORDER BY indexname
  `);

  console.log(`Found ${indexCheck.rows.length} indexes:`);
  indexCheck.rows.forEach(row => {
    console.log(`  ✅ ${row.indexname}`);
  });

  // Test 4: Check helper functions
  console.log('\n📋 Test 4: Helper Functions');
  console.log('-'.repeat(60));

  const functionCheck = await db.query(`
    SELECT proname
    FROM pg_proc
    WHERE proname IN ('timeout_inactive_sessions', 'find_timed_out_sessions', 'update_session_activity')
    ORDER BY proname
  `);

  console.log(`Found ${functionCheck.rows.length} functions:`);
  functionCheck.rows.forEach(row => {
    console.log(`  ✅ ${row.proname}()`);
  });

  // Test 5: Check data backfill
  console.log('\n📋 Test 5: Data Backfill Validation');
  console.log('-'.repeat(60));

  const statusDistribution = await db.query(`
    SELECT
      status,
      COUNT(*) as count,
      COUNT(CASE WHEN last_activity_at IS NULL THEN 1 END) as missing_activity
    FROM sessions
    GROUP BY status
    ORDER BY status
  `);

  console.log('Status distribution:');
  statusDistribution.rows.forEach(row => {
    console.log(`  ${row.status}: ${row.count} sessions (${row.missing_activity} missing activity)`);
  });

  // Test 6: Test updateSessionActivity method
  console.log('\n📋 Test 6: Activity Tracking');
  console.log('-'.repeat(60));

  const activeSessionId = await SessionTracker.getActiveSession();
  if (activeSessionId) {
    console.log(`Testing activity update for session: ${activeSessionId.substring(0, 8)}...`);

    const beforeUpdate = await db.query(`
      SELECT last_activity_at
      FROM sessions
      WHERE id = $1
    `, [activeSessionId]);

    console.log(`  Before: ${beforeUpdate.rows[0]?.last_activity_at}`);

    // Wait a second to ensure timestamp change
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Update activity
    await SessionTracker.updateSessionActivity(activeSessionId);

    const afterUpdate = await db.query(`
      SELECT last_activity_at
      FROM sessions
      WHERE id = $1
    `, [activeSessionId]);

    console.log(`  After:  ${afterUpdate.rows[0]?.last_activity_at}`);

    if (afterUpdate.rows[0]?.last_activity_at > beforeUpdate.rows[0]?.last_activity_at) {
      console.log('✅ Activity timestamp updated correctly');
    } else {
      console.log('❌ Activity timestamp not updated!');
    }
  } else {
    console.log('ℹ️  No active session to test (this is okay)');
  }

  // Test 7: Test timeout detection (read-only)
  console.log('\n📋 Test 7: Timeout Detection (Read-Only)');
  console.log('-'.repeat(60));

  const timedOutSessions = await db.query(`
    SELECT * FROM find_timed_out_sessions('2 hours'::INTERVAL)
  `);

  console.log(`Sessions that would be timed out: ${timedOutSessions.rows.length}`);
  if (timedOutSessions.rows.length > 0) {
    timedOutSessions.rows.forEach((row: any, idx: number) => {
      console.log(`  ${idx + 1}. ${row.session_id.substring(0, 8)}... (inactive for ${row.inactive_duration})`);
    });
  } else {
    console.log('  ✅ No sessions exceed 2-hour timeout threshold');
  }

  // Test 8: Verify SessionData interface (TypeScript types)
  console.log('\n📋 Test 8: TypeScript Interface Validation');
  console.log('-'.repeat(60));

  const sampleData = await db.query(`
    SELECT id, status, last_activity_at
    FROM sessions
    WHERE status = 'active'
    LIMIT 1
  `);

  if (sampleData.rows.length > 0) {
    const session = sampleData.rows[0];
    console.log('✅ Sample active session data:');
    console.log(`   ID: ${session.id.substring(0, 8)}...`);
    console.log(`   Status: ${session.status}`);
    console.log(`   Last Activity: ${session.last_activity_at}`);

    // Verify status is one of the valid enum values
    const validStatuses = ['active', 'inactive', 'disconnected'];
    if (validStatuses.includes(session.status)) {
      console.log('✅ Status is valid enum value');
    } else {
      console.log(`❌ Invalid status: ${session.status}`);
    }
  } else {
    console.log('ℹ️  No active sessions in database');
  }

  // Test 9: Service status check (if running)
  console.log('\n📋 Test 9: Timeout Service Status');
  console.log('-'.repeat(60));

  try {
    const { SessionTimeoutService } = await import('./mcp-server/src/services/sessionTimeout.js');
    const status = SessionTimeoutService.getStatus();

    console.log('Service Status:');
    console.log(`  Running: ${status.isRunning}`);
    console.log(`  Check Interval: ${status.checkIntervalMs / 1000}s`);
    console.log(`  Timeout Threshold: ${status.timeoutThresholdHours}h`);
    console.log(`  Checks Performed: ${status.checksPerformed}`);

    if (status.isRunning) {
      console.log('✅ Session timeout service is running');
    } else {
      console.log('ℹ️  Session timeout service not running (start server to test)');
    }
  } catch (error) {
    console.log('⚠️  Could not check service status:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 TS004-1 Test Complete!\n');

  process.exit(0);
}

runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});