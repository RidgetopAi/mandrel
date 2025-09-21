/**
 * Test TS009 Edge Cases - Service Integration Issues
 * Test for specific dependency and integration problems
 */

import { SessionManagementHandler } from './mcp-server/src/handlers/sessionAnalytics.js';
import { SessionTracker } from './mcp-server/src/services/sessionTracker.js';
import { projectHandler } from './mcp-server/src/handlers/project.js';
import { db } from './mcp-server/src/config/database.js';

async function testServiceIntegrationIssues() {
  console.log('🔧 Testing TS009 Edge Cases - Service Integration Issues');
  console.log('=========================================================');
  
  try {
    // Test 1: Project assignment with concurrent sessions
    console.log('\n1. Testing Concurrent Session Assignment...');
    
    // Create multiple sessions and see if assignment works properly
    const session1 = await SessionTracker.startSession();
    console.log(`   📊 Session 1 created: ${session1.substring(0, 8)}...`);
    
    // Get projects
    const projects = await projectHandler.listProjects();
    if (projects.length < 2) {
      console.log('   ⚠️  Need at least 2 projects for concurrent testing');
    } else {
      // Assign session to project
      const result1 = await SessionManagementHandler.assignSessionToProject(projects[0].name);
      console.log(`   ${result1.success ? '✅' : '❌'} Session 1 assignment: ${result1.message}`);
      
      // Start another session  
      const session2 = await SessionTracker.startSession();
      console.log(`   📊 Session 2 created: ${session2.substring(0, 8)}...`);
      
      // Assign to different project
      const result2 = await SessionManagementHandler.assignSessionToProject(projects[1].name);
      console.log(`   ${result2.success ? '✅' : '❌'} Session 2 assignment: ${result2.message}`);
      
      // Check if both assignments are preserved
      const query = await db.query('SELECT id, project_id FROM sessions WHERE id IN ($1, $2)', [session1, session2]);
      console.log(`   📊 Database verification: ${query.rows.length} sessions checked`);
      for (const row of query.rows) {
        console.log(`     Session ${row.id.substring(0, 8)}: project_id = ${row.project_id ? row.project_id.substring(0, 8) + '...' : 'NULL'}`);
      }
    }

    // Test 2: Project assignment with non-existent projects
    console.log('\n2. Testing Invalid Project Assignment...');
    
    const invalidResult = await SessionManagementHandler.assignSessionToProject('NonExistentProject123');
    console.log(`   ${invalidResult.success ? '⚠️' : '✅'} Invalid project handled correctly: ${invalidResult.message}`);
    
    // Test 3: Project assignment without active session
    console.log('\n3. Testing Assignment Without Active Session...');
    
    // Temporarily clear active session
    const originalSession = await SessionTracker.getActiveSession();
    (SessionTracker as any).activeSessionId = null;
    
    const noSessionResult = await SessionManagementHandler.assignSessionToProject(projects[0].name);
    console.log(`   ${noSessionResult.success ? '⚠️' : '✅'} No session handled correctly: ${noSessionResult.message}`);
    
    // Restore session
    (SessionTracker as any).activeSessionId = originalSession;

    // Test 4: Database consistency after assignment
    console.log('\n4. Testing Database Consistency...');
    
    if (originalSession) {
      // Check if session exists and has proper project assignment
      const sessionCheck = await db.query(`
        SELECT s.id, s.project_id, p.name as project_name 
        FROM sessions s 
        LEFT JOIN projects p ON s.project_id = p.id 
        WHERE s.id = $1
      `, [originalSession]);
      
      if (sessionCheck.rows.length > 0) {
        const session = sessionCheck.rows[0];
        console.log(`   ✅ Session ${session.id.substring(0, 8)}... exists`);
        console.log(`   📂 Project: ${session.project_name || 'Not assigned'} (${session.project_id ? session.project_id.substring(0, 8) + '...' : 'NULL'})`);
        
        // Check for foreign key constraints
        if (session.project_id) {
          const projectCheck = await db.query('SELECT id, name FROM projects WHERE id = $1', [session.project_id]);
          console.log(`   ${projectCheck.rows.length > 0 ? '✅' : '❌'} Foreign key integrity: ${projectCheck.rows.length > 0 ? 'Valid' : 'BROKEN'}`);
        }
      } else {
        console.log(`   ❌ Session not found in database`);
      }
    }

    // Test 5: Service method dependency chain
    console.log('\n5. Testing Service Method Dependencies...');
    
    try {
      // Test if assignSessionToProject properly depends on all required services
      const projects2 = await projectHandler.listProjects();
      console.log(`   ✅ Project service accessible: ${projects2.length} projects`);
      
      const activeSession2 = await SessionTracker.getActiveSession();
      console.log(`   ✅ Session service accessible: ${activeSession2 ? 'Active session found' : 'No active session'}`);
      
      // Test database accessibility within assignment method
      const dbTest = await db.query('SELECT COUNT(*) as count FROM sessions');
      console.log(`   ✅ Database accessible: ${dbTest.rows[0].count} total sessions`);
      
    } catch (error) {
      console.log(`   ❌ Service method dependency error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Test 6: Test for race conditions in assignment
    console.log('\n6. Testing Race Conditions...');
    
    try {
      const project = projects[0];
      
      // Execute multiple assignments simultaneously
      const promises = [
        SessionManagementHandler.assignSessionToProject(project.name),
        SessionManagementHandler.assignSessionToProject(project.name),
        SessionManagementHandler.assignSessionToProject(project.name)
      ];
      
      const results = await Promise.all(promises);
      const successCount = results.filter(r => r.success).length;
      console.log(`   📊 Race condition test: ${successCount}/${results.length} assignments succeeded`);
      
      if (successCount === results.length) {
        console.log('   ✅ No race condition issues detected');
      } else {
        console.log('   ⚠️  Potential race condition detected');
      }
      
    } catch (error) {
      console.log(`   ❌ Race condition test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    console.log('\n📊 TS009 Edge Cases Analysis Complete!');
    console.log('========================================');

  } catch (error) {
    console.error('❌ TS009 Edge Cases Test Failed:', error);
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
      if (error.stack) {
        console.error(`   Stack: ${error.stack.split('\n').slice(0, 5).join('\n')}`);
      }
    }
    process.exit(1);
  }
}

// Run the test
testServiceIntegrationIssues().catch(console.error);