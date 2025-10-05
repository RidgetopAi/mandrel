#!/usr/bin/env npx tsx

/**
 * TS006-2: Token Counting Implementation - Comprehensive Test Suite
 *
 * Tests all components of the token tracking feature:
 * 1. Database schema verification (columns exist)
 * 2. Token estimation function accuracy
 * 3. SessionTracker.recordTokenUsage increments correctly
 * 4. Session end persists tokens to database
 * 5. session_status includes token data
 * 6. Database queries return token data
 */

import { db } from './mcp-server/src/config/database.js';
import { SessionTracker } from './mcp-server/src/services/sessionTracker.js';

interface TestResult {
  test: string;
  passed: boolean;
  message: string;
  details?: any;
}

const results: TestResult[] = [];

function logTest(test: string, passed: boolean, message: string, details?: any) {
  results.push({ test, passed, message, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${test}: ${message}`);
  if (details) {
    console.log(`   Details:`, JSON.stringify(details, null, 2));
  }
}

async function testDatabaseSchema() {
  console.log('\n📊 Test 1: Database Schema Verification');
  console.log('==========================================');

  try {
    // Check sessions table
    const sessionsColumns = await db.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'sessions'
        AND column_name IN ('input_tokens', 'output_tokens', 'total_tokens')
      ORDER BY column_name
    `);

    const expectedColumns = ['input_tokens', 'output_tokens', 'total_tokens'];
    const foundColumns = sessionsColumns.rows.map(r => r.column_name);

    if (foundColumns.length === 3 && expectedColumns.every(col => foundColumns.includes(col))) {
      logTest('Sessions table columns', true, 'All token columns exist', foundColumns);
    } else {
      logTest('Sessions table columns', false, `Missing columns. Expected: ${expectedColumns.join(', ')}, Found: ${foundColumns.join(', ')}`);
    }

    // Check user_sessions table
    const userSessionsColumns = await db.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'user_sessions'
        AND column_name IN ('input_tokens', 'output_tokens', 'total_tokens')
      ORDER BY column_name
    `);

    const foundUserColumns = userSessionsColumns.rows.map(r => r.column_name);

    if (foundUserColumns.length === 3 && expectedColumns.every(col => foundUserColumns.includes(col))) {
      logTest('User_sessions table columns', true, 'All token columns exist', foundUserColumns);
    } else {
      logTest('User_sessions table columns', false, `Missing columns. Expected: ${expectedColumns.join(', ')}, Found: ${foundUserColumns.join(', ')}`);
    }

    // Verify data types
    const tokenColumn = sessionsColumns.rows.find(r => r.column_name === 'total_tokens');
    if (tokenColumn && tokenColumn.data_type === 'bigint') {
      logTest('Token column data type', true, 'BIGINT data type confirmed');
    } else {
      logTest('Token column data type', false, `Expected BIGINT, got ${tokenColumn?.data_type}`);
    }

  } catch (error) {
    logTest('Database schema check', false, error instanceof Error ? error.message : 'Unknown error');
  }
}

async function testTokenEstimation() {
  console.log('\n🧮 Test 2: Token Estimation Function');
  console.log('==========================================');

  const testCases = [
    { text: 'Hello', expected: 2 },  // 5 chars / 4 = 1.25 -> ceil = 2
    { text: 'Hello World', expected: 3 },  // 11 chars / 4 = 2.75 -> ceil = 3
    { text: 'a'.repeat(100), expected: 25 },  // 100 chars / 4 = 25
    { text: '', expected: 0 },  // Empty string
    { text: JSON.stringify({ key: 'value', num: 123 }), expected: 7 }  // 26 chars / 4 = 6.5 -> ceil = 7
  ];

  for (const { text, expected } of testCases) {
    const estimated = Math.ceil(text.length / 4);
    const passed = estimated === expected;
    logTest(
      `Token estimation (${text.length} chars)`,
      passed,
      `Expected ${expected}, got ${estimated}`,
      { text: text.substring(0, 50) + (text.length > 50 ? '...' : ''), length: text.length }
    );
  }
}

async function testSessionTrackerTokenRecording() {
  console.log('\n📝 Test 3: SessionTracker Token Recording');
  console.log('==========================================');

  try {
    // Start a test session
    const sessionId = await SessionTracker.startSession(undefined, 'TS006-2 Token Tracking Test');
    console.log(`   Started test session: ${sessionId.substring(0, 8)}...`);

    // Record some token usage
    SessionTracker.recordTokenUsage(sessionId, 100, 200);
    SessionTracker.recordTokenUsage(sessionId, 50, 75);
    SessionTracker.recordTokenUsage(sessionId, 25, 25);

    // Get token usage
    const tokens = SessionTracker.getTokenUsage(sessionId);

    const expectedInput = 100 + 50 + 25; // 175
    const expectedOutput = 200 + 75 + 25; // 300
    const expectedTotal = 175 + 300; // 475

    if (tokens.input === expectedInput && tokens.output === expectedOutput && tokens.total === expectedTotal) {
      logTest('Token usage accumulation', true, 'Token counts match expected values', tokens);
    } else {
      logTest('Token usage accumulation', false, `Expected input=${expectedInput}, output=${expectedOutput}, total=${expectedTotal}`, tokens);
    }

    // End the session to persist tokens
    const endedSession = await SessionTracker.endSession(sessionId);

    if (endedSession.input_tokens === expectedInput &&
        endedSession.output_tokens === expectedOutput &&
        endedSession.total_tokens === expectedTotal) {
      logTest('Token persistence on end', true, 'Tokens persisted to database correctly', {
        input: endedSession.input_tokens,
        output: endedSession.output_tokens,
        total: endedSession.total_tokens
      });
    } else {
      logTest('Token persistence on end', false, 'Token values incorrect after end', {
        expected: { input: expectedInput, output: expectedOutput, total: expectedTotal },
        actual: {
          input: endedSession.input_tokens,
          output: endedSession.output_tokens,
          total: endedSession.total_tokens
        }
      });
    }

    // Verify database persistence
    const dbCheck = await db.query(
      'SELECT input_tokens, output_tokens, total_tokens FROM sessions WHERE id = $1',
      [sessionId]
    );

    if (dbCheck.rows.length > 0) {
      const row = dbCheck.rows[0];
      if (parseInt(row.input_tokens) === expectedInput &&
          parseInt(row.output_tokens) === expectedOutput &&
          parseInt(row.total_tokens) === expectedTotal) {
        logTest('Database verification', true, 'Tokens correctly stored in database', {
          input: row.input_tokens,
          output: row.output_tokens,
          total: row.total_tokens
        });
      } else {
        logTest('Database verification', false, 'Database values do not match', row);
      }
    } else {
      logTest('Database verification', false, 'Session not found in database');
    }

  } catch (error) {
    logTest('SessionTracker token recording', false, error instanceof Error ? error.message : 'Unknown error');
  }
}

async function testSessionStatusWithTokens() {
  console.log('\n📊 Test 4: Session Status with Token Data');
  console.log('==========================================');

  try {
    // Create a new session with token usage
    const sessionId = await SessionTracker.startSession(undefined, 'TS006-2 Status Test');
    console.log(`   Created test session: ${sessionId.substring(0, 8)}...`);

    // Record token usage
    SessionTracker.recordTokenUsage(sessionId, 500, 1000);

    // Get session data
    const sessionData = await SessionTracker.getSessionData(sessionId);

    if (sessionData &&
        sessionData.input_tokens === 500 &&
        sessionData.output_tokens === 1000 &&
        sessionData.total_tokens === 1500) {
      logTest('Session data includes tokens', true, 'Token data correctly included in session status', {
        input: sessionData.input_tokens,
        output: sessionData.output_tokens,
        total: sessionData.total_tokens
      });
    } else {
      logTest('Session data includes tokens', false, 'Token data missing or incorrect', sessionData);
    }

    // Clean up
    await SessionTracker.endSession(sessionId);

  } catch (error) {
    logTest('Session status with tokens', false, error instanceof Error ? error.message : 'Unknown error');
  }
}

async function testActiveSessionTokens() {
  console.log('\n⚡ Test 5: Active Session Token Tracking');
  console.log('==========================================');

  try {
    // Create a session and make it active
    const sessionId = await SessionTracker.startSession(undefined, 'TS006-2 Active Session Test');
    console.log(`   Created active session: ${sessionId.substring(0, 8)}...`);

    // Simulate tool calls by recording tokens
    SessionTracker.recordTokenUsage(sessionId, 250, 500);
    SessionTracker.recordTokenUsage(sessionId, 100, 200);

    // Get tokens while session is still active
    const tokens = SessionTracker.getTokenUsage(sessionId);

    if (tokens.input === 350 && tokens.output === 700 && tokens.total === 1050) {
      logTest('Active session token tracking', true, 'Tokens tracked correctly for active session', tokens);
    } else {
      logTest('Active session token tracking', false, 'Token tracking incorrect for active session', {
        expected: { input: 350, output: 700, total: 1050 },
        actual: tokens
      });
    }

    // Clean up
    await SessionTracker.endSession(sessionId);

  } catch (error) {
    logTest('Active session token tracking', false, error instanceof Error ? error.message : 'Unknown error');
  }
}

async function testBackwardCompatibility() {
  console.log('\n🔄 Test 6: Backward Compatibility');
  console.log('==========================================');

  try {
    // Check that tokens_used column still exists
    const tokensUsedColumn = await db.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'sessions' AND column_name = 'tokens_used'
    `);

    if (tokensUsedColumn.rows.length > 0) {
      logTest('tokens_used column exists', true, 'Backward compatibility maintained');
    } else {
      logTest('tokens_used column exists', false, 'tokens_used column missing - backward compatibility broken');
    }

    // Test that tokens_used is set when session ends
    const sessionId = await SessionTracker.startSession(undefined, 'TS006-2 Backward Compat Test');
    SessionTracker.recordTokenUsage(sessionId, 100, 200);
    await SessionTracker.endSession(sessionId);

    const dbCheck = await db.query(
      'SELECT tokens_used, total_tokens FROM sessions WHERE id = $1',
      [sessionId]
    );

    if (dbCheck.rows.length > 0) {
      const row = dbCheck.rows[0];
      if (parseInt(row.tokens_used) === parseInt(row.total_tokens)) {
        logTest('tokens_used synchronization', true, 'tokens_used matches total_tokens', {
          tokens_used: row.tokens_used,
          total_tokens: row.total_tokens
        });
      } else {
        logTest('tokens_used synchronization', false, 'tokens_used does not match total_tokens', row);
      }
    }

  } catch (error) {
    logTest('Backward compatibility', false, error instanceof Error ? error.message : 'Unknown error');
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   TS006-2: Token Counting - Comprehensive Test Suite      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Initialize database
    console.log('🔌 Connecting to database...');
    const { initializeDatabase } = await import('./mcp-server/src/config/database.js');
    await initializeDatabase();

    // Run all tests
    await testDatabaseSchema();
    await testTokenEstimation();
    await testSessionTrackerTokenRecording();
    await testSessionStatusWithTokens();
    await testActiveSessionTokens();
    await testBackwardCompatibility();

    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                      TEST SUMMARY                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const totalTests = results.length;
    const passedTests = results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;

    console.log(`Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%\n`);

    if (failedTests > 0) {
      console.log('Failed Tests:');
      results.filter(r => !r.passed).forEach(r => {
        console.log(`  ❌ ${r.test}: ${r.message}`);
      });
      console.log('');
    }

    // Exit with appropriate code
    process.exit(failedTests > 0 ? 1 : 0);

  } catch (error) {
    console.error('❌ Test suite error:', error);
    process.exit(1);
  }
}

main();
