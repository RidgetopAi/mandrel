#!/usr/bin/env node

/**
 * Claude Code HTTP-MCP Bridge
 * 
 * Translates Claude Code's MCP stdio calls to AIDIS HTTP endpoints
 * Uses the working HTTP bridge at localhost:8080/mcp/tools/*
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} = require('@modelcontextprotocol/sdk/types.js');
const http = require('http');

// Create MCP server
const server = new Server(
  {
    name: 'aidis-http-bridge',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// All 40 AIDIS tools including new help system
const AIDIS_TOOLS = [
  // System Health (2 tools)
  { name: 'aidis_ping', description: 'Test connectivity to AIDIS server' },
  { name: 'aidis_status', description: 'Get AIDIS server health information' },
  
  // Help & Discovery (3 tools)  
  { name: 'aidis_help', description: 'Get complete tool categorization and overview' },
  { name: 'aidis_explain', description: 'Get detailed help for a specific tool' },
  { name: 'aidis_examples', description: 'Get usage examples for a specific tool' },
  
  // Context Management (4 tools)
  { name: 'context_store', description: 'Store development context with semantic search' },
  { name: 'context_search', description: 'Search contexts using semantic similarity' },
  { name: 'context_get_recent', description: 'Get recent contexts chronologically' },
  { name: 'context_stats', description: 'Get context storage statistics' },
  
  // Project Management (6 tools)
  { name: 'project_list', description: 'List all projects' },
  { name: 'project_create', description: 'Create new project' },
  { name: 'project_switch', description: 'Switch active project' },
  { name: 'project_current', description: 'Get current project information' },
  { name: 'project_info', description: 'Get detailed project information' },
  { name: 'project_insights', description: 'Get project analytics and insights' },
  
  // Naming Registry (4 tools)
  { name: 'naming_register', description: 'Register name in naming system' },
  { name: 'naming_check', description: 'Check for naming conflicts' },
  { name: 'naming_suggest', description: 'Get naming suggestions' },
  { name: 'naming_stats', description: 'Get naming registry statistics' },
  
  // Technical Decisions (4 tools)
  { name: 'decision_record', description: 'Record technical decision' },
  { name: 'decision_search', description: 'Search technical decisions' },
  { name: 'decision_update', description: 'Update decision outcomes' },
  { name: 'decision_stats', description: 'Get decision analytics' },
  
  // Multi-Agent Coordination (11 tools)
  { name: 'agent_register', description: 'Register new agent' },
  { name: 'agent_list', description: 'List all registered agents' },
  { name: 'agent_status', description: 'Get agent status' },
  { name: 'agent_join', description: 'Join agent session' },
  { name: 'agent_leave', description: 'Leave agent session' },
  { name: 'agent_sessions', description: 'List active agent sessions' },
  { name: 'agent_message', description: 'Send message to agent' },
  { name: 'agent_messages', description: 'Get agent messages' },
  { name: 'task_create', description: 'Create new task' },
  { name: 'task_list', description: 'List tasks' },
  { name: 'task_update', description: 'Update task status' },
  
  // Code Analysis (5 tools)
  { name: 'code_analyze', description: 'Analyze file structure' },
  { name: 'code_components', description: 'List code components' },
  { name: 'code_dependencies', description: 'Analyze component dependencies' },
  { name: 'code_impact', description: 'Analyze change impact' },
  { name: 'code_stats', description: 'Get code statistics' },
  
  // Smart Search & AI (3 tools)
  { name: 'smart_search', description: 'Cross-system intelligent search' },
  { name: 'get_recommendations', description: 'Get AI recommendations' },
  { name: 'context_get_recent', description: 'Get recent contexts' }
];

// Call AIDIS HTTP bridge
function callAidisHttp(toolName, args) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      arguments: args || {}
    });
    
    const options = {
      hostname: 'localhost',
      port: 8080,
      path: `/mcp/tools/${toolName}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 30000
    };
    
    console.error(`🔄 HTTP Call: ${toolName}`);
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.success) {
            resolve(response.result);
          } else {
            reject(new Error(response.error || 'HTTP call failed'));
          }
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${data}`));
        }
      });
    });
    
    req.on('error', (err) => {
      reject(new Error(`HTTP request failed: ${err.message}`));
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('HTTP request timeout'));
    });
    
    req.write(postData);
    req.end();
  });
}

// Register tools/list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: AIDIS_TOOLS.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: true
      }
    }))
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  console.error(`🔧 MCP Tool Call: ${name}`);
  
  try {
    const result = await callAidisHttp(name, args);
    return result;
  } catch (error) {
    console.error(`❌ Tool call failed: ${name} - ${error.message}`);
    
    return {
      content: [
        {
          type: 'text',
          text: `❌ Error calling ${name}: ${error.message}`
        }
      ]
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🚀 AIDIS HTTP-MCP Bridge - Connected to HTTP endpoints on port 8080');
  console.error(`📡 Available tools: ${AIDIS_TOOLS.length} (all 38 AIDIS tools)`);
}

main().catch((error) => {
  console.error('❌ Failed to start HTTP-MCP bridge:', error);
  process.exit(1);
});