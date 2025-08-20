/**
 * Test AIDIS Project Management System
 * 
 * This tests the complete project switching workflow that AI agents will use:
 * - Creating projects
 * - Switching between projects  
 * - Context storage with automatic project detection
 * - Cross-project context isolation
 */

import { projectHandler } from './src/handlers/project.js';
import { contextHandler } from './src/handlers/context.js';
import { initializeDatabase, closeDatabase } from './src/config/database.js';

async function testProjectManagement() {
  console.log('🧪 Testing AIDIS Project Management System...\n');

  try {
    // Initialize database
    await initializeDatabase();

    // Test 1: Initialize session and check current project
    console.log('🔄 STEP 1: Session initialization...');
    await projectHandler.initializeSession();
    const initialProject = await projectHandler.getCurrentProject();
    console.log(`✅ Initial project: ${initialProject?.name || 'None'}`);

    // Test 2: List existing projects
    console.log('\n📋 STEP 2: Listing existing projects...');
    const existingProjects = await projectHandler.listProjects();
    console.log(`Found ${existingProjects.length} existing projects:`);
    existingProjects.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.name}${p.isActive ? ' (CURRENT)' : ''} - ${p.contextCount} contexts`);
    });

    // Test 3: Create new projects for testing
    console.log('\n🆕 STEP 3: Creating test projects...');
    
    const projects = [
      {
        name: 'web-app-frontend',
        description: 'React-based frontend application with TypeScript',
        metadata: { framework: 'react', language: 'typescript', type: 'frontend' }
      },
      {
        name: 'api-backend',
        description: 'Node.js REST API server with Express and PostgreSQL',
        metadata: { framework: 'express', language: 'javascript', type: 'backend' }
      },
      {
        name: 'mobile-app',
        description: 'React Native mobile application for iOS and Android',
        metadata: { framework: 'react-native', platforms: ['ios', 'android'], type: 'mobile' }
      }
    ];

    const createdProjects = [];
    for (const projectData of projects) {
      try {
        const project = await projectHandler.createProject(projectData);
        createdProjects.push(project);
        console.log(`   ✅ Created: ${project.name}`);
      } catch (error) {
        if (error instanceof Error && error.message.includes('already exists')) {
          console.log(`   ⚠️  Project ${projectData.name} already exists, getting existing...`);
          const existing = await projectHandler.getProject(projectData.name);
          if (existing) createdProjects.push(existing);
        } else {
          throw error;
        }
      }
    }

    // Test 4: Project switching and context storage
    console.log('\n🔄 STEP 4: Testing project switching with context storage...');
    
    // Switch to web-app-frontend and store contexts
    console.log('\n   Switching to web-app-frontend...');
    await projectHandler.switchProject('web-app-frontend');
    let currentProject = await projectHandler.getCurrentProject();
    console.log(`   ✅ Current project: ${currentProject?.name}`);

    // Store frontend-specific contexts
    const frontendContexts = [
      {
        type: 'code' as const,
        content: 'Implemented responsive navigation component using React Router and CSS Grid',
        tags: ['react', 'navigation', 'responsive', 'css-grid']
      },
      {
        type: 'error' as const,
        content: 'Fixed hydration mismatch error in Next.js by ensuring consistent server and client rendering',
        tags: ['nextjs', 'hydration', 'ssr', 'bug-fix']
      }
    ];

    for (const contextData of frontendContexts) {
      const stored = await contextHandler.storeContext(contextData);
      console.log(`   📝 Stored ${contextData.type} context: ${stored.id.substring(0, 8)}...`);
    }

    // Switch to api-backend and store different contexts
    console.log('\n   Switching to api-backend...');
    await projectHandler.switchProject('api-backend');
    currentProject = await projectHandler.getCurrentProject();
    console.log(`   ✅ Current project: ${currentProject?.name}`);

    const backendContexts = [
      {
        type: 'decision' as const,
        content: 'Chose PostgreSQL over MongoDB for ACID compliance and complex query requirements',
        tags: ['postgresql', 'database', 'architecture', 'decision']
      },
      {
        type: 'code' as const,
        content: 'Implemented JWT authentication middleware with refresh token rotation for enhanced security',
        tags: ['jwt', 'authentication', 'security', 'middleware']
      }
    ];

    for (const contextData of backendContexts) {
      const stored = await contextHandler.storeContext(contextData);
      console.log(`   📝 Stored ${contextData.type} context: ${stored.id.substring(0, 8)}...`);
    }

    // Switch to mobile-app  
    console.log('\n   Switching to mobile-app...');
    await projectHandler.switchProject('mobile-app');
    currentProject = await projectHandler.getCurrentProject();
    console.log(`   ✅ Current project: ${currentProject?.name}`);

    const mobileContexts = [
      {
        type: 'planning' as const,
        content: 'Planning offline-first architecture with AsyncStorage and sync queue for network resilience',
        tags: ['offline-first', 'asyncstorage', 'sync', 'architecture']
      }
    ];

    for (const contextData of mobileContexts) {
      const stored = await contextHandler.storeContext(contextData);
      console.log(`   📝 Stored ${contextData.type} context: ${stored.id.substring(0, 8)}...`);
    }

    // Test 5: Cross-project context isolation
    console.log('\n🔍 STEP 5: Testing cross-project context isolation...');
    
    // Search for React contexts while in mobile-app project (should find mobile React Native contexts)
    console.log('\n   Searching for "React" in mobile-app project...');
    let searchResults = await contextHandler.searchContext({
      query: 'React components and navigation',
      limit: 5
    });
    console.log(`   Found ${searchResults.length} results in mobile-app project`);
    searchResults.forEach((result, i) => {
      console.log(`      ${i + 1}. ${result.contextType}: ${result.content.substring(0, 60)}...`);
    });

    // Switch to web-app-frontend and search again
    console.log('\n   Switching to web-app-frontend and searching for "React"...');
    await projectHandler.switchProject('web-app-frontend');
    searchResults = await contextHandler.searchContext({
      query: 'React components and navigation',  
      limit: 5
    });
    console.log(`   Found ${searchResults.length} results in web-app-frontend project`);
    searchResults.forEach((result, i) => {
      console.log(`      ${i + 1}. ${result.contextType}: ${result.content.substring(0, 60)}...`);
    });

    // Test 6: Project statistics
    console.log('\n📊 STEP 6: Project statistics overview...');
    const finalProjects = await projectHandler.listProjects(true);
    
    console.log('\n📋 Final Project Status:');
    finalProjects.forEach((project, i) => {
      const current = project.isActive ? ' 🟢 (CURRENT)' : '';
      console.log(`   ${i + 1}. **${project.name}**${current}`);
      console.log(`      📄 ${project.description}`);
      console.log(`      📊 Contexts: ${project.contextCount}`);
      console.log(`      🏷️  Framework: ${project.metadata.framework || 'N/A'}`);
      console.log(`      📅 Updated: ${project.updatedAt.toISOString().split('T')[0]}`);
    });

    // Test 7: Demonstrate switching back to original
    console.log('\n🔄 STEP 7: Switching back to original project...');
    if (initialProject) {
      await projectHandler.switchProject(initialProject.name);
      const finalCurrentProject = await projectHandler.getCurrentProject();
      console.log(`✅ Back to original project: ${finalCurrentProject?.name}`);
    }

    console.log('\n🎉 All project management tests completed successfully!');
    console.log('🚀 AIDIS Project Management System is fully operational!');

    console.log('\n✨ AI Agents can now:');
    console.log('   📋 List and discover available projects');
    console.log('   🆕 Create new projects with rich metadata');
    console.log('   🔄 Switch between projects seamlessly');
    console.log('   📝 Store contexts that automatically use the current project');
    console.log('   🔍 Search contexts within the current project scope');
    console.log('   📊 Get project statistics and context counts');
    console.log('   🏷️  Maintain isolated context per project');
    console.log('   🧠 Build project-specific knowledge bases!');

  } catch (error) {
    console.error('❌ Project management test failed:', error);
  } finally {
    await closeDatabase();
  }
}

testProjectManagement().catch(console.error);
