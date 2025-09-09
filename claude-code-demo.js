#!/usr/bin/env node

/**
 * Claude Code Demo - AIDIS Integration
 * 
 * This demonstrates how Claude Code can interact with AIDIS
 * via HTTP REST endpoints for context management and AI coordination.
 */

const BASE_URL = 'http://localhost:8080/mcp/tools';

async function callTool(toolName, args = {}) {
  try {
    const response = await fetch(`${BASE_URL}/${toolName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ arguments: args })
    });
    
    const result = await response.json();
    return result.success ? result.result : { error: result.error };
  } catch (error) {
    return { error: error.message };
  }
}

async function demo() {
  console.log('🚀 Claude Code + AIDIS Integration Demo\n');
  
  // 1. Check AIDIS connectivity
  console.log('1️⃣ Testing connectivity...');
  const ping = await callTool('aidis_ping', { message: 'Claude Code hello!' });
  console.log('Response:', ping.content[0].text);
  console.log();
  
  // 2. Get current project info
  console.log('2️⃣ Getting current project...');
  const project = await callTool('project_current');
  console.log('Project:', project.content[0].text);
  console.log();
  
  // 3. Store development context
  console.log('3️⃣ Storing context...');
  const context = await callTool('context_store', {
    content: 'Claude Code successfully integrated with AIDIS HTTP bridge',
    type: 'milestone',
    tags: ['integration', 'claude-code', 'http-bridge']
  });
  console.log('Stored:', context.content[0].text);
  console.log();
  
  // 4. Search contexts
  console.log('4️⃣ Searching contexts...');
  const search = await callTool('context_search', {
    query: 'HTTP bridge integration'
  });
  console.log('Search results:', search.content[0].text);
  console.log();
  
  // 5. Get naming suggestions
  console.log('5️⃣ Getting naming suggestions...');
  const naming = await callTool('naming_suggest', {
    description: 'HTTP middleware for authentication',
    entityType: 'function'
  });
  console.log('Name suggestions:', naming.content[0].text);
  console.log();
  
  // 6. Get AI recommendations
  console.log('6️⃣ Getting AI recommendations...');
  const recommendations = await callTool('get_recommendations', {
    context: 'building a REST API with Express',
    type: 'implementation'
  });
  console.log('Recommendations:', recommendations.content[0].text);
  console.log();
  
  // 7. Smart search across all systems
  console.log('7️⃣ Smart search...');
  const smartSearch = await callTool('smart_search', {
    query: 'project management tools'
  });
  console.log('Smart search:', smartSearch.content[0].text);
  console.log();
  
  console.log('✅ Demo complete! Claude Code can now fully leverage AIDIS capabilities.');
}

if (require.main === module) {
  demo().catch(console.error);
}
