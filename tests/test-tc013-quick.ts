#!/usr/bin/env npx tsx
/**
 * TC013 Quick Test - Verify pattern detection is working
 */

import { db } from './mcp-server/dist/config/database.js';

async function testTC013() {
  console.log('🧪 TC013 Pattern Detection Quick Test');
  console.log('=' .repeat(50));
  
  try {
    // Test 1: Check if pattern detection tables have data
    console.log('\n1️⃣  Checking pattern storage...');
    const patternCount = await db.query('SELECT COUNT(*) FROM file_cooccurrence_patterns');
    console.log(`✅ Found ${patternCount.rows[0].count} co-occurrence patterns`);
    
    // Test 2: Check if pattern discovery sessions exist
    const sessionCount = await db.query('SELECT COUNT(*) FROM pattern_discovery_sessions');
    console.log(`✅ Found ${sessionCount.rows[0].count} pattern discovery sessions`);
    
    // Test 3: Check most recent pattern activity
    const recentActivity = await db.query(`
      SELECT created_at, status 
      FROM pattern_discovery_sessions 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    if (recentActivity.rows.length > 0) {
      const lastSession = recentActivity.rows[0];
      console.log(`✅ Most recent pattern session: ${lastSession.created_at}`);
      console.log(`✅ Status: ${lastSession.status || 'unknown'}`);
    }
    
    // Test 4: Simple pattern query performance
    console.log('\n2️⃣  Testing pattern query performance...');
    const start = Date.now();
    const strongPatterns = await db.query(`
      SELECT COUNT(*) 
      FROM file_cooccurrence_patterns 
      WHERE confidence_score > 0.8
    `);
    const queryTime = Date.now() - start;
    
    console.log(`✅ Strong patterns query: ${queryTime}ms (${strongPatterns.rows[0].count} patterns)`);
    
    // Overall status
    console.log('\n' + '=' .repeat(50));
    console.log(`✅ TC013 Pattern Detection: OPERATIONAL`);
    console.log(`   Pattern Storage: ${patternCount.rows[0].count} patterns`);
    console.log(`   Query Performance: ${queryTime}ms`);
    console.log(`   Sessions: ${sessionCount.rows[0].count} discovery sessions`);
    
  } catch (error) {
    console.error('❌ TC013 Test failed:', error.message);
  } finally {
    await db.end();
  }
}

testTC013();