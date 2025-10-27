#!/usr/bin/env npx tsx

import { projectHandler } from './mcp-server/src/handlers/project.js';

async function debugCurrentProject() {
  console.log('🐛 Debugging Current Project Logic\n');
  
  // Create a test project
  const testProject = await projectHandler.createProject({
    name: 'debug-test-project',
    description: 'Debug test project',
    metadata: { test: true }
  });
  
  console.log(`✅ Created test project: ${testProject.name} (${testProject.id})`);
  
  // Set current project for test session
  console.log('🔄 Setting current project for test-session...');
  projectHandler.setCurrentProject(testProject.id, 'test-session');
  
  // Get current project for test session
  console.log('🔍 Getting current project for test-session...');
  const currentProject = await projectHandler.getCurrentProject('test-session');
  
  if (currentProject) {
    console.log(`✅ Retrieved current project: ${currentProject.name} (${currentProject.id})`);
    console.log(`✅ IDs match: ${currentProject.id === testProject.id ? 'YES' : 'NO'}`);
  } else {
    console.log('❌ No current project found');
  }
  
  // Check session info
  console.log('📊 Session info:');
  const sessionInfo = projectHandler.getSessionInfo('test-session');
  console.log(JSON.stringify(sessionInfo, null, 2));
  
  // Cleanup
  await projectHandler.getProject(testProject.id).then(p => {
    if (p) {
      return import('./mcp-server/src/config/database.js').then(({ db }) => 
        db.query('DELETE FROM projects WHERE id = $1', [testProject.id])
      );
    }
  });
  console.log('🧹 Cleaned up test project');
}

debugCurrentProject()
  .then(() => console.log('\n🎉 Debug complete'))
  .catch(console.error);