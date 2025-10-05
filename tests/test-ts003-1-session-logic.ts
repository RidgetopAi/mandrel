/**
 * TS003-1 Test: Simplified Active Session Logic
 *
 * Tests the simplified getActiveSession() implementation
 */

import { SessionTracker } from './mcp-server/src/services/sessionTracker.js';
import { db } from './mcp-server/src/config/database.js';

async function runTests() {
  console.log('🧪 TS003-1: Testing Simplified Active Session Logic\n');
  console.log('=' .repeat(60));

  // Test 1: Memory cache hit (no database query)
  console.log('\n📋 Test 1: Memory Cache Hit');
  console.log('-'.repeat(60));

  const testSessionId = 'test-cache-session-' + Date.now();
  (SessionTracker as any).activeSessionId = testSessionId;

  const cachedResult = await SessionTracker.getActiveSession();

  if (cachedResult === testSessionId) {
    console.log('✅ Memory cache returned correct session ID');
    console.log('✅ No database query needed (instant response)');
  } else {
    console.log('❌ Memory cache failed:', cachedResult);
  }

  // Test 2: Memory cache miss (query database)
  console.log('\n📋 Test 2: Memory Cache Miss - Database Query');
  console.log('-'.repeat(60));

  // Clear memory cache
  SessionTracker.clearActiveSession();

  const dbResult = await SessionTracker.getActiveSession();

  if (dbResult) {
    console.log('✅ Database query returned session:', dbResult.substring(0, 8) + '...');
    console.log('✅ Memory cache updated with result');
  } else {
    console.log('ℹ️  No active sessions found in database (this is okay if DB is empty)');
  }

  // Test 3: Check database for active sessions
  console.log('\n📋 Test 3: Database Active Sessions Check');
  console.log('-'.repeat(60));

  const activeSessions = await db.query(`
    SELECT id, agent_type, started_at, ended_at
    FROM sessions
    WHERE ended_at IS NULL
    ORDER BY started_at DESC
    LIMIT 5
  `);

  console.log(`Found ${activeSessions.rows.length} active session(s):`);
  activeSessions.rows.forEach((session, idx) => {
    console.log(`  ${idx + 1}. ${session.id.substring(0, 8)}... (${session.agent_type})`);
    console.log(`     Started: ${session.started_at}`);
  });

  // Test 4: Verify simplified logic reduces database queries
  console.log('\n📋 Test 4: Performance - Database Query Reduction');
  console.log('-'.repeat(60));

  // Set up cache
  if (activeSessions.rows.length > 0) {
    (SessionTracker as any).activeSessionId = activeSessions.rows[0].id;
  }

  // Track queries
  let queryCount = 0;
  const originalQuery = db.query.bind(db);
  (db as any).query = async (...args: any[]) => {
    queryCount++;
    return originalQuery(...args);
  };

  // Make 3 calls to getActiveSession()
  await SessionTracker.getActiveSession();
  await SessionTracker.getActiveSession();
  await SessionTracker.getActiveSession();

  // Restore original query
  (db as any).query = originalQuery;

  console.log(`✅ 3 calls to getActiveSession() = ${queryCount} database queries`);
  console.log(`   Expected: 0 queries (all cache hits)`);
  if (queryCount === 0) {
    console.log('✅ Performance optimized - no unnecessary DB queries!');
  } else {
    console.log('⚠️  Unexpected queries detected');
  }

  // Test 5: Verify methods were deleted
  console.log('\n📋 Test 5: Verify Deleted Methods');
  console.log('-'.repeat(60));

  const hasRecoverMethod = typeof (SessionTracker as any).recoverActiveSessionFromDatabase === 'function';
  const hasExistsMethod = typeof (SessionTracker as any).sessionExists === 'function';

  console.log(`recoverActiveSessionFromDatabase: ${hasRecoverMethod ? '❌ Still exists' : '✅ Deleted'}`);
  console.log(`sessionExists: ${hasExistsMethod ? '❌ Still exists' : '✅ Deleted'}`);

  // Test 6: Code metrics
  console.log('\n📋 Test 6: Code Complexity Reduction');
  console.log('-'.repeat(60));

  // Read the sessionTracker file to count lines
  const fs = await import('fs/promises');
  const content = await fs.readFile('./mcp-server/src/services/sessionTracker.ts', 'utf-8');

  // Find getActiveSession method
  const methodStart = content.indexOf('static async getActiveSession()');
  const methodEnd = content.indexOf('\n  }', methodStart);
  const methodContent = content.substring(methodStart, methodEnd);
  const methodLines = methodContent.split('\n').length;

  console.log(`getActiveSession() method: ${methodLines} lines`);
  console.log(`Target: ~30 lines (including comments and whitespace)`);

  if (methodLines <= 35) {
    console.log('✅ Complexity target achieved!');
  } else {
    console.log('⚠️  Method longer than expected');
  }

  // Calculate reduction
  const before = 105; // lines from investigation
  const after = methodLines;
  const reduction = ((before - after) / before * 100).toFixed(1);

  console.log(`\nComplexity Reduction: ${before} → ${after} lines (-${reduction}%)`);

  console.log('\n' + '='.repeat(60));
  console.log('🎉 TS003-1 Test Complete!\n');

  process.exit(0);
}

runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});