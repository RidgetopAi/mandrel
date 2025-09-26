#!/usr/bin/env node

/**
 * Claude Code HTTP-MCP Bridge for Staging
 * 
 * Modified to connect to staging AIDIS HTTP server on port 9090
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
    name: 'aidis-http-bridge-staging',
    version: '1.0.0-staging',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// All AIDIS tools (same as production)
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
  { name: 'project_switch', description: 'Switch to different project' },
  { name: 'project_current', description: 'Get current project information' },
  { name: 'project_info', description: 'Get detailed project information' },
  { name: 'project_insights', description: 'Get comprehensive project insights' },
  
  // Naming Registry (4 tools)
  { name: 'naming_register', description: 'Register a name to prevent conflicts' },
  { name: 'naming_check', description: 'Check for naming conflicts' },
  { name: 'naming_suggest', description: 'Get AI-powered name suggestions' },
  { name: 'naming_stats', description: 'Get naming statistics' },
  
  // Technical Decisions (4 tools)
  { name: 'decision_record', description: 'Record technical decision with context' },
  { name: 'decision_search', description: 'Search technical decisions' },
  { name: 'decision_update', description: 'Update decision status/outcomes' },
  { name: 'decision_stats', description: 'Get decision statistics' },
  
  // Smart Search (2 tools)
  { name: 'smart_search', description: 'Intelligent search across all data sources' },
  { name: 'get_recommendations', description: 'Get AI-powered development recommendations' },
  
  // Session Management (5 tools) 
  { name: 'session_new', description: 'Create new session' },
  { name: 'session_status', description: 'Get current session status' },
  { name: 'session_assign', description: 'Assign session to project' },
  { name: 'session_update', description: 'Update session title/description' },
  { name: 'session_details', description: 'Get detailed session information' },
  
  // Multi-Agent Coordination (3 tools)
  { name: 'task_create', description: 'Create task for agent coordination' },
  { name: 'task_list', description: 'List tasks with filtering' },
  { name: 'task_update', description: 'Update task status' },
  { name: 'task_details', description: 'Get detailed task information' },
  
  // Code Analysis (5 tools)
  { name: 'code_analyze', description: 'Analyze code structure and dependencies' },
  { name: 'code_components', description: 'List code components in project' },
  { name: 'code_dependencies', description: 'Get dependencies for component' },
  { name: 'code_impact', description: 'Analyze impact of changing component' },
  { name: 'code_stats', description: 'Get code analysis statistics' }
];

// Forward HTTP calls to staging AIDIS server on port 9090
function callAidisHttp(toolName, args) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      arguments: args || {}
    });
    
    const options = {
      hostname: 'localhost',
      port: 9090,  // STAGING PORT (instead of 8080)
      path: `/mcp/tools/${toolName}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 30000
    };
    
    console.error(`🔄 Staging HTTP Call: ${toolName} -> port 9090`);
    
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

// Register list_tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: AIDIS_TOOLS.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: true
      }
    }))
  };
});

// Register call_tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    const result = await callAidisHttp(name, args);
    return {
      content: [
        {
          type: "text",
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error) {
    console.error(`❌ Tool call failed: ${name} - ${error.message}`);
    return {
      content: [
        {
          type: "text", 
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  console.error('🧪 Starting AIDIS Staging HTTP Bridge (port 9090)...');
  await server.connect(transport);
  console.error('✅ Staging HTTP bridge ready!');
}

// Handle startup
main().catch(console.error);
