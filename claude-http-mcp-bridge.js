#!/usr/bin/env node

/**
 * Claude Code HTTP-MCP Bridge
 *
 * Translates Claude Code's MCP stdio calls to AIDIS HTTP endpoints
 * Uses the working HTTP bridge at localhost:8080/mcp/tools/*
 *
 * AUTO-GENERATED: This file contains all 83 AIDIS tools from aidis_help
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
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// All 49 AIDIS tools from actual server (post TT009-4 + Enhanced Task Tools)
const AIDIS_TOOLS = [
  // System Health (2 tools)
  { name: 'aidis_ping', description: 'Test connectivity to AIDIS server' },
  { name: 'aidis_status', description: 'Get server status and health information' },

  // Context Management (4 tools)
  { name: 'context_store', description: 'Store development context with automatic embedding' },
  { name: 'context_search', description: 'Search stored contexts using semantic similarity' },
  { name: 'context_get_recent', description: 'Get recent contexts chronologically (newest first)' },
  { name: 'context_stats', description: 'Get context statistics for a project' },

  // Project Management (6 tools)
  { name: 'project_list', description: 'List all available projects with statistics' },
  { name: 'project_create', description: 'Create a new project' },
  { name: 'project_switch', description: 'Switch to a different project (sets as current)' },
  { name: 'project_current', description: 'Get the currently active project information' },
  { name: 'project_info', description: 'Get detailed information about a specific project' },
  { name: 'project_insights', description: 'Get comprehensive project health and insights' },

  // Session Management (5 tools)
  { name: 'session_assign', description: 'Assign current session to a project' },
  { name: 'session_status', description: 'Get current session status and details' },
  { name: 'session_new', description: 'Create a new session with optional title and project assignment' },
  { name: 'session_update', description: 'Update session title and description for better organization' },
  { name: 'session_details', description: 'Get detailed session information including title, description, and metadata' },

  // Naming Registry (4 tools)
  { name: 'naming_register', description: 'Register a name to prevent conflicts' },
  { name: 'naming_check', description: 'Check for naming conflicts before using a name' },
  { name: 'naming_suggest', description: 'Get name suggestions based on description' },
  { name: 'naming_stats', description: 'Get naming statistics and convention compliance' },

  // Technical Decisions (4 tools)
  { name: 'decision_record', description: 'Record a technical decision with context' },
  { name: 'decision_search', description: 'Search technical decisions with filters' },
  { name: 'decision_update', description: 'Update decision status, outcomes, or lessons' },
  { name: 'decision_stats', description: 'Get technical decision statistics and analysis' },

  // Task Management (6 tools)
  { name: 'task_create', description: 'Create a new task for coordination' },
  { name: 'task_list', description: 'List tasks with optional filtering' },
  { name: 'task_update', description: 'Update task status and assignment' },
  { name: 'task_details', description: 'Get detailed information for a specific task' },
  { name: 'task_bulk_update', description: 'Update multiple tasks atomically with the same changes' },
  { name: 'task_progress_summary', description: 'Get task progress summary with grouping and completion percentages' },

  // Code Analysis (5 tools)
  { name: 'code_analyze', description: 'Analyze code file structure and dependencies' },
  { name: 'code_components', description: 'List code components (functions, classes, etc.)' },
  { name: 'code_dependencies', description: 'Get dependencies for a specific component' },
  { name: 'code_impact', description: 'Analyze the impact of changing a component' },
  { name: 'code_stats', description: 'Get code analysis statistics for a project' },

  // Smart Search & AI (2 tools)
  { name: 'smart_search', description: 'Intelligent search across all project data' },
  { name: 'get_recommendations', description: 'Get AI-powered recommendations for development' },

  // Code Complexity (3 consolidated tools - TT009-1)
  { name: 'complexity_analyze', description: 'Unified complexity analysis - file analysis, commit analysis, and detailed metrics' },
  { name: 'complexity_insights', description: 'Unified complexity insights - dashboard, hotspots, trends, technical debt, and refactoring opportunities' },
  { name: 'complexity_manage', description: 'Unified complexity management - tracking service, alerts, thresholds, and performance monitoring' },

  // Development Metrics (3 tools - TT009-2 Consolidated from 17 tools)
  { name: 'metrics_collect', description: 'TT009-2-1: Unified metrics collection - project, core, patterns, productivity data' },
  { name: 'metrics_analyze', description: 'TT009-2-2: Unified metrics analysis - dashboard, trends, correlations, executive summaries, aggregation' },
  { name: 'metrics_control', description: 'TT009-2-3: Unified metrics control - collection management, alerts, performance, export' },

  // Pattern Detection & Analysis (2 tools - TT009-3 Consolidated from 17 tools)
  { name: 'pattern_analyze', description: 'TT009-3-1: Unified pattern analysis - detection, analysis, tracking operations' },
  { name: 'pattern_insights', description: 'TT009-3-2: Unified pattern insights - insights, correlations, recommendations, alerts' },

  // Outcome Tracking - REMOVED in TT009-4 (Academic features not used for building)

  // Git Integration (3 tools)
  { name: 'git_session_commits', description: 'Get all git commits linked to a session with correlation details' },
  { name: 'git_commit_sessions', description: 'Get all sessions that contributed to a specific git commit' },
  { name: 'git_correlate_session', description: 'Manually trigger git correlation for current or specified session' }
];

console.error(`🎯 Bridge loaded with ${AIDIS_TOOLS.length} tools`);

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
  console.error('🚀 AIDIS HTTP-MCP Bridge v2.0.0 - Connected to HTTP endpoints on port 8080');
  console.error(`📡 Available tools: ${AIDIS_TOOLS.length} (all 96 AIDIS tools)`);
}

main().catch((error) => {
  console.error('❌ Failed to start HTTP-MCP bridge:', error);
  process.exit(1);
});