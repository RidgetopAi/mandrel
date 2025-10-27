#!/usr/bin/env npx tsx

import { db } from './mcp-server/src/config/database.js';
import { SessionTracker } from './mcp-server/src/services/sessionTracker.js';
import { projectHandler } from './mcp-server/src/handlers/project.js';

async function debugSingleStep() {
  console.log('🐛 Debugging TS010 Single Step - Current Project\n');
  
  try {
    // Create test primary project to ensure it exists
    const testPrimaryProject = await projectHandler.createProject({
      name: 'debug-primary-ts010',
      description: 'Debug primary project',
      metadata: { is_primary: 'true', test_project: true }
    });
    console.log(`✅ Created primary project: ${testPrimaryProject.name}`);
    
    // Create test current project
    const testCurrentProject = await projectHandler.createProject({
      name: 'debug-current-ts010',
      description: 'Debug current project',
      metadata: { test_project: true }
    });
    console.log(`✅ Created current project: ${testCurrentProject.name}`);
    
    // Set current project for test session
    console.log('\n🔄 Setting current project...');
    projectHandler.setCurrentProject(testCurrentProject.id, 'test-session');
    
    // Verify current project is set
    const sessionInfo = projectHandler.getSessionInfo('test-session');
    console.log(`📊 Session info:`, sessionInfo);
    
    // Get current project to verify
    const currentProject = await projectHandler.getCurrentProject('test-session');
    console.log(`🔍 Current project retrieved: ${currentProject?.name} (${currentProject?.id})`);
    
    // Now test the resolve method with debug output
    console.log('\n🔍 Testing resolveProjectForSession...');
    const resolvedProjectId = await SessionTracker.resolveProjectForSession('test-session');
    const resolvedProject = await projectHandler.getProject(resolvedProjectId);
    
    console.log(`✅ Resolved to: ${resolvedProject?.name} (${resolvedProjectId})`);
    console.log(`✅ Expected: ${testCurrentProject.name} (${testCurrentProject.id})`);
    console.log(`✅ Match: ${resolvedProjectId === testCurrentProject.id ? 'YES' : 'NO'}`);
    
    if (resolvedProjectId !== testCurrentProject.id) {
      console.log('\n❌ MISMATCH DETECTED!');
      console.log(`   Resolved: ${resolvedProject?.name}`);
      console.log(`   Expected: ${testCurrentProject.name}`);
      
      // Debug why this happened
      if (resolvedProject?.name === testPrimaryProject.name) {
        console.log('   📝 Note: Resolved to primary project instead of current project');
        console.log('   📝 This suggests current project check is failing');
      }
    }
    
    // Cleanup
    await db.query('DELETE FROM projects WHERE id = $1', [testPrimaryProject.id]);
    await db.query('DELETE FROM projects WHERE id = $1', [testCurrentProject.id]);
    console.log('\n🧹 Cleaned up test projects');
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
    throw error;
  }
}

debugSingleStep()
  .then(() => console.log('\n🎉 Debug complete'))
  .catch(console.error);