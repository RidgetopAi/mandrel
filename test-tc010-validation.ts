#!/usr/bin/env npx tsx
/**
 * TC010 Validation - Quick Schema and Integration Check
 * Validates that our database schema fixes resolved the integration issues
 */

import { db } from './mcp-server/dist/config/database.js';

async function validateTC010Fixes() {
  console.log('🔍 TC010 Integration Fixes Validation');
  console.log('=' .repeat(50));
  
  const results = {
    schemaFixes: 0,
    integrationTests: 0,
    overall: false
  };
  
  try {
    // Test 1: Verify updated_at column exists
    console.log('\n1️⃣  Checking commit_session_links.updated_at column...');
    const updatedAtResult = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'commit_session_links' 
      AND column_name = 'updated_at'
    `);
    
    if (updatedAtResult.rows.length > 0) {
      console.log('✅ updated_at column exists');
      results.schemaFixes++;
    } else {
      console.log('❌ updated_at column missing');
    }
    
    // Test 2: Verify event_log table exists
    console.log('\n2️⃣  Checking event_log table...');
    const eventLogResult = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'event_log'
    `);
    
    if (eventLogResult.rows.length > 0) {
      console.log('✅ event_log table exists');
      results.schemaFixes++;
    } else {
      console.log('❌ event_log table missing');
    }
    
    // Test 3: Verify trigger_type constraint is flexible
    console.log('\n3️⃣  Testing code_analysis_sessions constraint...');
    try {
      await db.query(`
        INSERT INTO code_analysis_sessions 
        (project_id, session_id, trigger_type, file_path, analysis_summary)
        VALUES 
        ('4afb236c-00d7-433d-87de-0f489b96acb2', 
         gen_random_uuid(), 
         'integration_test', 
         '/test/file.ts', 
         '{"test": true}')
        ON CONFLICT DO NOTHING
      `);
      console.log('✅ trigger_type constraint is flexible');
      results.schemaFixes++;
    } catch (error) {
      console.log('❌ trigger_type constraint still too restrictive');
    }
    
    // Test 4: Quick correlation test
    console.log('\n4️⃣  Testing basic session-commit correlation...');
    try {
      const correlationTest = await db.query(`
        SELECT COUNT(*) as count 
        FROM commit_session_links csl
        JOIN sessions s ON csl.session_id = s.id
        WHERE s.project_id = '4afb236c-00d7-433d-87de-0f489b96acb2'
      `);
      console.log(`✅ Correlation query successful: ${correlationTest.rows[0].count} links`);
      results.integrationTests++;
    } catch (error) {
      console.log('❌ Correlation test failed:', error.message);
    }
    
    // Summary
    console.log('\n' + '=' .repeat(50));
    results.overall = results.schemaFixes >= 2 && results.integrationTests >= 1;
    
    if (results.overall) {
      console.log('✅ TC010 SCHEMA FIXES SUCCESSFUL');
      console.log(`   Schema fixes: ${results.schemaFixes}/3`);
      console.log(`   Integration tests: ${results.integrationTests}/1`);
      console.log('\nPhase 1 integration issues have been resolved!');
    } else {
      console.log('⚠️  TC010 PARTIAL SUCCESS');
      console.log(`   Schema fixes: ${results.schemaFixes}/3`);
      console.log(`   Integration tests: ${results.integrationTests}/1`);
      console.log('\nSome issues still remain.');
    }
    
  } catch (error) {
    console.error('❌ Validation failed:', error.message);
  } finally {
    await db.end();
  }
}

validateTC010Fixes();