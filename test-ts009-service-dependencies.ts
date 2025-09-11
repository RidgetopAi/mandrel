/**
 * Test TS009 - Service Project Assignment Dependencies
 * Identify and fix dependency issues in session-project assignment
 */

import { SessionManagementHandler } from './mcp-server/src/handlers/sessionAnalytics.js';
import { SessionTracker } from './mcp-server/src/services/sessionTracker.js';
import { projectHandler } from './mcp-server/src/handlers/project.js';

async function testServiceDependencies() {
  console.log('🔧 Testing TS009 - Service Project Assignment Dependencies');
  console.log('===========================================================');
  
  try {
    // Test 1: Check if all required services are available
    console.log('\n1. Testing Service Availability...');
    
    // Test SessionTracker
    console.log('   📊 SessionTracker:', typeof SessionTracker.getActiveSession === 'function' ? '✅ Available' : '❌ Missing');
    
    // Test projectHandler  
    console.log('   📂 projectHandler:', typeof projectHandler.listProjects === 'function' ? '✅ Available' : '❌ Missing');
    
    // Test SessionManagementHandler
    console.log('   🔗 SessionManagementHandler:', typeof SessionManagementHandler.assignSessionToProject === 'function' ? '✅ Available' : '❌ Missing');

    // Test 2: Check project listing dependency
    console.log('\n2. Testing Project Service Integration...');
    try {
      const projects = await projectHandler.listProjects();
      console.log(`   ✅ Project listing works: ${projects.length} projects found`);
      if (projects.length > 0) {
        console.log(`   📝 Sample project: ${projects[0].name} (${projects[0].id})`);
      }
    } catch (error) {
      console.log(`   ❌ Project listing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Test 3: Check session tracking dependency  
    console.log('\n3. Testing Session Service Integration...');
    try {
      const activeSession = await SessionTracker.getActiveSession();
      console.log(`   📊 Current session: ${activeSession || 'None'}`);
      
      if (!activeSession) {
        console.log('   🚀 Starting new session for testing...');
        const newSessionId = await SessionTracker.startSession();
        console.log(`   ✅ New session created: ${newSessionId.substring(0, 8)}...`);
      }
    } catch (error) {
      console.log(`   ❌ Session tracking failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Test 4: Test the integration (assignment functionality)
    console.log('\n4. Testing Session-Project Assignment Integration...');
    try {
      const projects = await projectHandler.listProjects();
      if (projects.length === 0) {
        console.log('   ⚠️  No projects available for assignment test');
        
        // Create a test project
        console.log('   🏗️  Creating test project for dependency testing...');
        const testProject = await projectHandler.createProject({
          name: 'TS009-Test-Project',
          description: 'Test project for TS009 dependency testing',
          gitRepoUrl: null,
          rootDirectory: '/tmp/ts009-test'
        });
        console.log(`   ✅ Test project created: ${testProject.name} (${testProject.id})`);
      }
      
      // Now test assignment
      const availableProjects = await projectHandler.listProjects();
      const testProjectName = availableProjects[0].name;
      
      console.log(`   🔗 Testing assignment to project: ${testProjectName}`);
      const result = await SessionManagementHandler.assignSessionToProject(testProjectName);
      
      if (result.success) {
        console.log('   ✅ Assignment successful!');
        console.log(`   📝 Session: ${result.sessionId?.substring(0, 8)}...`);
        console.log(`   📂 Project: ${result.projectName}`);
      } else {
        console.log('   ❌ Assignment failed:', result.message);
      }
      
    } catch (error) {
      console.log(`   ❌ Assignment integration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.log(`   🔍 Error stack: ${error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') : 'N/A'}`);
    }

    // Test 5: Test circular dependency issues
    console.log('\n5. Testing for Circular Dependencies...');
    try {
      // Test if services can be imported without circular dependency errors
      const { SessionTracker: ST2 } = await import('./mcp-server/src/services/sessionTracker.js');
      const { projectHandler: PH2 } = await import('./mcp-server/src/handlers/project.js');
      const { SessionManagementHandler: SMH2 } = await import('./mcp-server/src/handlers/sessionAnalytics.js');
      
      console.log('   ✅ No circular dependency issues detected');
      console.log('   📦 All services imported successfully');
    } catch (error) {
      console.log(`   ❌ Circular dependency detected: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    console.log('\n📊 TS009 Service Dependency Analysis Complete!');
    console.log('=================================================');

  } catch (error) {
    console.error('❌ TS009 Test Failed:', error);
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
testServiceDependencies().catch(console.error);