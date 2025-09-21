/**
 * Test TS003 - Project Inheritance Implementation
 * Validates smart project assignment for new sessions
 */

import { SessionTracker } from './mcp-server/src/services/sessionTracker.js';
import { db } from './mcp-server/src/config/database.js';

async function testProjectInheritance() {
  console.log('🧪 Testing TS003 - Project Inheritance Implementation');
  console.log('=====================================================');
  
  try {
    // Clean up any existing sessions and test projects to start fresh
    console.log('\n1. Cleaning up existing sessions and test projects for clean test...');
    await db.query('UPDATE sessions SET ended_at = NOW() WHERE ended_at IS NULL');
    // Clean up any existing test projects
    await db.query('DELETE FROM analytics_events WHERE project_id IN (SELECT id FROM projects WHERE metadata->>\'test_project\' = \'true\')');
    await db.query('DELETE FROM projects WHERE metadata->>\'test_project\' = \'true\'');
    await db.query('DELETE FROM projects WHERE metadata->>\'auto_created\' = \'true\'');
    
    // Test 1: No projects exist - should create personal project
    console.log('\n2. Testing with no projects (should create personal)...');
    // Clear session state to force fresh resolution
    SessionTracker.clearActiveSession();
    
    const sessionId1 = await SessionTracker.startSession();
    console.log(`Created session: ${sessionId1.substring(0, 8)}...`);
    
    // Verify session has valid project
    const sessionCheck1 = await db.query('SELECT project_id FROM sessions WHERE id = $1', [sessionId1]);
    const projectId1 = sessionCheck1.rows[0].project_id;
    console.log(`Session assigned to project: ${projectId1}`);
    
    if (projectId1 && projectId1 !== '00000000-0000-0000-0000-000000000000') {
      console.log('✅ Test 1 PASSED: Personal project created and assigned');
    } else {
      console.log('❌ Test 1 FAILED: Invalid project assignment');
    }
    
    // Test 2: Create primary project and test inheritance
    console.log('\n3. Testing primary project inheritance...');
    const primaryProjectId = 'aaaaaaaa-bbbb-cccc-dddd-111111111111';
    await db.query(`
      INSERT INTO projects (id, name, description, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      primaryProjectId,
      'Primary Test Project',
      'Test primary project for inheritance',
      JSON.stringify({ is_primary: 'true', test_project: true }),
      new Date()
    ]);
    
    // End ALL current sessions to clear recent activity and force primary project usage
    await db.query('UPDATE sessions SET ended_at = NOW() WHERE ended_at IS NULL');
    // Clear any cached session state
    SessionTracker.clearActiveSession();
    
    const sessionId2 = await SessionTracker.startSession();
    console.log(`Created session: ${sessionId2.substring(0, 8)}...`);
    
    const sessionCheck2 = await db.query('SELECT project_id FROM sessions WHERE id = $1', [sessionId2]);
    const projectId2 = sessionCheck2.rows[0].project_id;
    console.log(`Session assigned to project: ${projectId2}`);
    
    if (projectId2 === primaryProjectId) {
      console.log('✅ Test 2 PASSED: Primary project inheritance works');
    } else {
      console.log('❌ Test 2 FAILED: Primary project not inherited');
    }
    
    // Test 3: Test last active session inheritance
    console.log('\n4. Testing last active session inheritance...');
    const recentProjectId = 'bbbbbbbb-cccc-dddd-eeee-222222222222';
    await db.query(`
      INSERT INTO projects (id, name, description, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      recentProjectId,
      'Recent Test Project',
      'Test recent project for inheritance',
      JSON.stringify({ test_project: true }),
      new Date()
    ]);
    
    // Create session with specific project (simulating recent activity)
    const recentSessionId = await SessionTracker.startSession(recentProjectId);
    await db.query('UPDATE sessions SET ended_at = NOW() WHERE id = $1', [recentSessionId]);
    
    // Now create new session - should inherit from recent
    const sessionId3 = await SessionTracker.startSession();
    console.log(`Created session: ${sessionId3.substring(0, 8)}...`);
    
    const sessionCheck3 = await db.query('SELECT project_id FROM sessions WHERE id = $1', [sessionId3]);
    const projectId3 = sessionCheck3.rows[0].project_id;
    console.log(`Session assigned to project: ${projectId3}`);
    
    if (projectId3 === recentProjectId) {
      console.log('✅ Test 3 PASSED: Last active session inheritance works');
    } else {
      console.log('❌ Test 3 FAILED: Last active session not inherited');
    }
    
    // Test 4: Verify no invalid UUIDs
    console.log('\n5. Testing for invalid UUID elimination...');
    const invalidSessionsQuery = await db.query(`
      SELECT COUNT(*) as count 
      FROM sessions 
      WHERE project_id = '00000000-0000-0000-0000-000000000000'
      AND started_at > NOW() - INTERVAL '1 hour'
    `);
    
    const invalidCount = parseInt(invalidSessionsQuery.rows[0].count);
    if (invalidCount === 0) {
      console.log('✅ Test 4 PASSED: No invalid UUIDs created');
    } else {
      console.log(`❌ Test 4 FAILED: ${invalidCount} sessions with invalid UUIDs`);
    }
    
    // Cleanup test data
    console.log('\n6. Cleaning up test data...');
    // First clean up dependent records
    await db.query('DELETE FROM analytics_events WHERE project_id IN (SELECT id FROM projects WHERE metadata->>\'test_project\' = \'true\')');
    await db.query('UPDATE sessions SET ended_at = NOW() WHERE ended_at IS NULL');
    // Then clean up test projects
    await db.query('DELETE FROM projects WHERE metadata->>\'test_project\' = \'true\'');
    
    console.log('\n✅ TS003 Project Inheritance Testing Complete');
    console.log('All sessions should now get valid project assignments!');
    
  } catch (error) {
    console.error('❌ TS003 test failed:', error);
    throw error;
  }
}

testProjectInheritance().catch(console.error);