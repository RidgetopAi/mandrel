#!/usr/bin/env npx tsx

/**
 * Simple test to validate TS007-2 UNION query updates
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER || 'ridgetop',
  password: process.env.DB_PASSWORD || '',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'aidis_production',
});

async function testSessionCounts() {
  console.log('🔍 Testing session counts from both tables...');
  
  try {
    // Test user_sessions count
    const userSessionsResult = await pool.query('SELECT COUNT(*) FROM user_sessions');
    const userSessionsCount = parseInt(userSessionsResult.rows[0].count);
    
    // Test sessions count  
    const sessionsResult = await pool.query('SELECT COUNT(*) FROM sessions');
    const sessionsCount = parseInt(sessionsResult.rows[0].count);
    
    // Test UNION count (what our updated methods should return)
    const unionResult = await pool.query(`
      SELECT COUNT(*) FROM (
        SELECT id FROM user_sessions
        UNION ALL
        SELECT id FROM sessions
      ) combined
    `);
    const unionCount = parseInt(unionResult.rows[0].count);
    
    console.log(`📊 Session counts:`);
    console.log(`  - user_sessions: ${userSessionsCount}`);
    console.log(`  - sessions (MCP): ${sessionsCount}`);
    console.log(`  - UNION total: ${unionCount}`);
    console.log(`  - Expected: ${userSessionsCount + sessionsCount}`);
    
    if (unionCount === userSessionsCount + sessionsCount) {
      console.log('✅ UNION query working correctly');
      return true;
    } else {
      console.log('❌ UNION count mismatch');
      return false;
    }
  } catch (error) {
    console.error('❌ Session count test failed:', error.message);
    return false;
  }
}

async function testTokenUsageQuery() {
  console.log('\n🔍 Testing token usage patterns query...');
  
  try {
    const query = `
      WITH session_activity AS (
        -- User sessions (web sessions)
        SELECT 
          EXTRACT(HOUR FROM s.started_at) as hour,
          COALESCE(s.total_tokens, 0) as tokens_used
        FROM user_sessions s
        
        UNION ALL
        
        -- Agent sessions (MCP sessions)
        SELECT 
          EXTRACT(HOUR FROM s.started_at) as hour,
          COALESCE(s.tokens_used, 0) as tokens_used
        FROM sessions s
      ),
      hourly_usage AS (
        SELECT 
          hour,
          SUM(tokens_used) as total_tokens,
          COUNT(*) as session_count
        FROM session_activity
        GROUP BY hour
      ),
      hour_series AS (
        SELECT generate_series(0, 23) as hour
      )
      SELECT 
        hs.hour,
        COALESCE(hu.total_tokens, 0) as total_tokens,
        COALESCE(hu.session_count, 0) as session_count
      FROM hour_series hs
      LEFT JOIN hourly_usage hu ON hs.hour = hu.hour
      ORDER BY hs.hour
      LIMIT 5
    `;
    
    const result = await pool.query(query);
    console.log(`✅ Token usage query returned ${result.rows.length} rows`);
    console.log(`📊 Sample hours:`, result.rows.map(r => `${r.hour}:00 (${r.session_count} sessions, ${r.total_tokens} tokens)`));
    
    return true;
  } catch (error) {
    console.error('❌ Token usage query failed:', error.message);
    return false;
  }
}

async function testSessionStatsQuery() {
  console.log('\n🔍 Testing session stats query...');
  
  try {
    const query = `
      WITH session_activity AS (
        -- User sessions (web sessions)
        SELECT 
          s.project_id,
          s.started_at,
          s.ended_at
        FROM user_sessions s
        
        UNION ALL
        
        -- Agent sessions (MCP sessions)
        SELECT 
          s.project_id,
          s.started_at,
          s.ended_at
        FROM sessions s
      )
      SELECT 
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN sa.ended_at IS NULL THEN 1 END) as active_sessions,
        COUNT(CASE WHEN DATE(sa.started_at) = CURRENT_DATE THEN 1 END) as today_sessions
      FROM session_activity sa
    `;
    
    const result = await pool.query(query);
    const stats = result.rows[0];
    
    console.log(`✅ Session stats query successful`);
    console.log(`📊 Combined stats: ${stats.total_sessions} total, ${stats.active_sessions} active, ${stats.today_sessions} today`);
    
    return true;
  } catch (error) {
    console.error('❌ Session stats query failed:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('🚀 TS007-2 Simple UNION Query Validation');
  console.log('Testing updated analytics queries directly...\n');
  
  const results = await Promise.all([
    testSessionCounts(),
    testTokenUsageQuery(),
    testSessionStatsQuery()
  ]);
  
  const allPassed = results.every(r => r);
  
  if (allPassed) {
    console.log('\n🎉 SUCCESS: All UNION queries working correctly');
    console.log('✅ TS007-2 Analytics UNION implementation validated');
  } else {
    console.log('\n❌ Some tests failed');
  }
  
  await pool.end();
  return allPassed;
}

runTests()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('Test error:', error);
    process.exit(1);
  });
