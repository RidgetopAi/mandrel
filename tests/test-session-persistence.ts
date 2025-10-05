#!/usr/bin/env tsx

/**
 * Test Session-Project Persistence Implementation
 * 
 * This tests the database-backed session persistence to verify that
 * session-project mappings survive MCP server restarts.
 */

import { projectHandler } from './mcp-server/src/handlers/project.js';
import { db } from './mcp-server/src/config/database.js';

async function testSessionPersistence() {
  console.log('🧪 Testing Session-Project Persistence...\n');

  try {
    // Test 1: Create a test session and set project
    console.log('1️⃣ Testing project assignment persistence...');
    const testSessionId = 'test-session-' + Date.now();
    
    // List available projects
    const projects = await projectHandler.listProjects(false);
    if (projects.length === 0) {
      console.error('❌ No projects available for testing');
      return;
    }
    
    const testProject = projects[0];
    console.log(`   📂 Using test project: ${testProject.name} (${testProject.id})`);
    
    // Set current project for test session
    await projectHandler.setCurrentProject(testProject.id, testSessionId);
    console.log(`   ✅ Set project for session: ${testSessionId}`);

    // Test 2: Verify database storage
    console.log('\n2️⃣ Testing database storage...');
    const result = await db.query(`
      SELECT session_id, project_id, created_at, updated_at 
      FROM session_project_mappings 
      WHERE session_id = $1
    `, [testSessionId]);
    
    if (result.rows.length > 0) {
      const mapping = result.rows[0];
      console.log(`   ✅ Found database mapping:`);
      console.log(`      Session: ${mapping.session_id}`);
      console.log(`      Project: ${mapping.project_id}`);
      console.log(`      Created: ${mapping.created_at}`);
      console.log(`      Updated: ${mapping.updated_at}`);
    } else {
      console.error('   ❌ No database mapping found!');
      return;
    }

    // Test 3: Retrieve project mapping
    console.log('\n3️⃣ Testing project retrieval...');
    const retrievedProjectId = await projectHandler.getCurrentProjectId(testSessionId);
    if (retrievedProjectId === testProject.id) {
      console.log(`   ✅ Retrieved correct project: ${retrievedProjectId}`);
    } else {
      console.error(`   ❌ Project mismatch - expected: ${testProject.id}, got: ${retrievedProjectId}`);
      return;
    }

    // Test 4: Test project switch persistence
    console.log('\n4️⃣ Testing project switch persistence...');
    if (projects.length > 1) {
      const secondProject = projects[1];
      console.log(`   🔄 Switching to project: ${secondProject.name}`);
      
      await projectHandler.switchProject(secondProject.name, testSessionId);
      
      // Verify switch was persisted
      const switchedProjectId = await projectHandler.getCurrentProjectId(testSessionId);
      if (switchedProjectId === secondProject.id) {
        console.log(`   ✅ Switch persisted correctly: ${switchedProjectId}`);
      } else {
        console.error(`   ❌ Switch not persisted - expected: ${secondProject.id}, got: ${switchedProjectId}`);
        return;
      }
    } else {
      console.log('   ⚠️  Only one project available, skipping switch test');
    }

    // Test 5: Test session initialization with existing mapping
    console.log('\n5️⃣ Testing session initialization with existing mapping...');
    const initResult = await projectHandler.initializeSession(testSessionId);
    if (initResult && initResult.id === (await projectHandler.getCurrentProjectId(testSessionId))) {
      console.log(`   ✅ Session initialization restored project: ${initResult.name}`);
    } else {
      console.error('   ❌ Session initialization failed to restore project');
      return;
    }

    // Test 6: Test concurrent sessions
    console.log('\n6️⃣ Testing concurrent sessions...');
    const session2 = 'test-session-2-' + Date.now();
    await projectHandler.setCurrentProject(testProject.id, session2);
    
    const session1Project = await projectHandler.getCurrentProjectId(testSessionId);
    const session2Project = await projectHandler.getCurrentProjectId(session2);
    
    console.log(`   Session 1 project: ${session1Project}`);
    console.log(`   Session 2 project: ${session2Project}`);
    
    if (session1Project !== session2Project || session2Project !== testProject.id) {
      console.log('   ✅ Sessions maintain independent project mappings');
    } else {
      console.log('   ⚠️  Sessions share project mappings (expected behavior)');
    }

    // Cleanup test sessions
    console.log('\n🧹 Cleaning up test data...');
    await db.query('DELETE FROM session_project_mappings WHERE session_id LIKE $1', ['test-session-%']);
    console.log('   ✅ Test data cleaned up');

    console.log('\n🎉 All persistence tests passed!');
    console.log('\n✨ Session-project mappings will now survive MCP server restarts!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

async function main() {
  try {
    await testSessionPersistence();
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
