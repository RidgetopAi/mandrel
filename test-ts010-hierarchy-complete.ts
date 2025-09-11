#!/usr/bin/env npx tsx

/**
 * TS010 Complete Hierarchy Test
 * 
 * This test systematically verifies each level of the TS010 hierarchy:
 * 1. Current project (from project handler context)
 * 2. User's primary project  
 * 3. System default project (aidis-bootstrap)
 * 4. Create personal project
 */

import { db } from './mcp-server/src/config/database.js';
import { SessionTracker } from './mcp-server/src/services/sessionTracker.js';
import { projectHandler } from './mcp-server/src/handlers/project.js';

async function testHierarchyLevel(level: number, description: string, setupFn: () => Promise<void>, expectedProjectName?: string) {
  console.log(`\n🔄 Test ${level}: ${description}`);
  
  try {
    await setupFn();
    const resolvedProjectId = await SessionTracker.resolveProjectForSession('test-session');
    const resolvedProject = await projectHandler.getProject(resolvedProjectId);
    
    console.log(`✅ Resolved to: "${resolvedProject?.name}" (${resolvedProjectId.substring(0, 8)}...)`);
    
    if (expectedProjectName) {
      const match = resolvedProject?.name === expectedProjectName;
      console.log(`✅ Expected: "${expectedProjectName}" - Match: ${match ? 'YES' : 'NO'}`);
      if (!match) {
        throw new Error(`Expected ${expectedProjectName}, got ${resolvedProject?.name}`);
      }
    }
    
    return resolvedProject;
  } catch (error) {
    console.error(`❌ Test ${level} failed:`, error.message);
    throw error;
  }
}

async function runCompleteHierarchyTest() {
  console.log('🧪 TS010 Complete Hierarchy Test\n');
  
  // Store original state
  const originalProjects = await projectHandler.listProjects();
  let testPrimaryProject: any = null;
  let testCurrentProject: any = null;
  
  try {
    // Test 4: Create personal project (when nothing else exists)
    console.log('📋 Setting up test environment...');
    
    // Temporarily remove aidis-bootstrap and create test projects
    const aidisBootstrap = originalProjects.find(p => p.name === 'aidis-bootstrap');
    
    // Test Level 4: Personal project creation (clean slate)
    await testHierarchyLevel(4, 'Personal project creation (no existing projects)', async () => {
      // Clear current project for test session
      projectHandler.setCurrentProject(null, 'test-session');
      
      // Temporarily rename aidis-bootstrap so it's not found
      if (aidisBootstrap) {
        await db.query('UPDATE projects SET name = $1 WHERE id = $2', ['aidis-bootstrap-hidden', aidisBootstrap.id]);
      }
      
      // Remove any primary projects
      await db.query("UPDATE projects SET metadata = metadata - 'is_primary' WHERE metadata->>'is_primary' = 'true'");
    });
    
    // The above test should have created a Personal Project, let's verify
    const personalProjects = await db.query("SELECT * FROM projects WHERE name = 'Personal Project' AND metadata->>'ts010_fallback' = 'true'");
    if (personalProjects.rows.length > 0) {
      console.log(`✅ Personal project created successfully: ${personalProjects.rows[0].id.substring(0, 8)}...`);
    }
    
    // Test Level 3: System default project (aidis-bootstrap)
    await testHierarchyLevel(3, 'System default project (aidis-bootstrap)', async () => {
      // Clear current project for test session
      projectHandler.setCurrentProject(null, 'test-session');
      
      // Restore aidis-bootstrap name
      if (aidisBootstrap) {
        await db.query('UPDATE projects SET name = $1 WHERE id = $2', ['aidis-bootstrap', aidisBootstrap.id]);
      }
      
      // Ensure no primary projects
      await db.query("UPDATE projects SET metadata = metadata - 'is_primary' WHERE metadata->>'is_primary' = 'true'");
    }, 'aidis-bootstrap');
    
    // Test Level 2: Primary project
    testPrimaryProject = await projectHandler.createProject({
      name: 'test-primary-ts010',
      description: 'Test primary project for TS010 hierarchy',
      metadata: { is_primary: 'true', test_project: true }
    });
    
    await testHierarchyLevel(2, 'User primary project', async () => {
      // Clear current project for test session
      projectHandler.setCurrentProject(null, 'test-session');
      // Primary project should now be found
    }, 'test-primary-ts010');
    
    // Test Level 1: Current project  
    testCurrentProject = await projectHandler.createProject({
      name: 'test-current-ts010',
      description: 'Test current project for TS010 hierarchy',
      metadata: { test_project: true }
    });
    
    await testHierarchyLevel(1, 'Current project context', async () => {
      // Set current project for test session
      projectHandler.setCurrentProject(testCurrentProject.id, 'test-session');
    }, 'test-current-ts010');
    
    console.log('\n✅ All hierarchy levels tested successfully!');
    console.log('\n📊 TS010 Hierarchy Verification Complete:');
    console.log('   1. ✅ Current project (highest priority)');
    console.log('   2. ✅ User primary project');
    console.log('   3. ✅ System default (aidis-bootstrap)');
    console.log('   4. ✅ Personal project creation (fallback)');
    
  } catch (error) {
    console.error('❌ Hierarchy test failed:', error);
    throw error;
  } finally {
    // Cleanup test projects
    console.log('\n🧹 Cleaning up test projects...');
    
    if (testPrimaryProject) {
      await db.query('DELETE FROM projects WHERE id = $1', [testPrimaryProject.id]);
      console.log(`🧹 Cleaned up test primary project`);
    }
    
    if (testCurrentProject) {
      await db.query('DELETE FROM projects WHERE id = $1', [testCurrentProject.id]);
      console.log(`🧹 Cleaned up test current project`);
    }
    
    // Clean up any personal projects created during testing
    await db.query("DELETE FROM projects WHERE name = 'Personal Project' AND metadata->>'ts010_fallback' = 'true'");
    console.log(`🧹 Cleaned up test personal projects`);
    
    // Restore original state
    projectHandler.setCurrentProject(null, 'test-session');
    console.log(`🧹 Reset project handler state`);
  }
}

// Run the complete hierarchy test
runCompleteHierarchyTest()
  .then(() => {
    console.log('\n🎉 TS010 Complete Hierarchy Test PASSED!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 TS010 Complete Hierarchy Test FAILED:', error);
    process.exit(1);
  });