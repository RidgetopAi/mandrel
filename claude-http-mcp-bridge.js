#!/usr/bin/env node

/**
 * Claude Code HTTP-MCP Bridge
 *
 * Translates Claude Code's MCP stdio calls to Mandrel HTTP endpoints
 * Uses the working HTTP bridge at localhost:8080/mcp/tools/*
 *
 * Token-Optimized: 27 active Mandrel tools (70% token reduction from original 52)
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema
} = require('@modelcontextprotocol/sdk/types.js');
const http = require('http');

// Resolve base URL for Mandrel HTTP service
const BASE_URL = process.env.MANDREL_HTTP_URL || process.env.AIDIS_HTTP_URL || process.env.AIDIS_URL || 'http://localhost:8080';

// Generate unique connection ID for this bridge instance (session isolation)
const CONNECTION_ID = `bridge-${process.pid}-${Date.now().toString(36)}`;

// Create MCP server
const server = new Server(
  {
    name: 'mandrel-http-bridge',
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Fallback list of tools (used only if schema fetch fails)
const MANDREL_TOOLS = [
  // System Health (2 tools)
  { name: 'mandrel_ping', description: 'Test connectivity to Mandrel server' },
  { name: 'mandrel_status', description: 'Get server status and health information' },

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

  // Smart Search & AI (2 tools)
  { name: 'smart_search', description: 'Intelligent search across all project data' },
  { name: 'get_recommendations', description: 'Get AI-powered recommendations for development' },

  // Development Metrics (3 tools - TT009-2 Consolidated from 17 tools)
  { name: 'metrics_collect', description: 'TT009-2-1: Unified metrics collection - project, core, patterns, productivity data' },
  { name: 'metrics_analyze', description: 'TT009-2-2: Unified metrics analysis - dashboard, trends, correlations, executive summaries, aggregation' },
  { name: 'metrics_control', description: 'TT009-2-3: Unified metrics control - collection management, alerts, performance, export' },

  // Pattern Detection & Analysis (2 tools - TT009-3 Consolidated from 17 tools)
  { name: 'pattern_analyze', description: 'TT009-3-1: Unified pattern analysis - detection, analysis, tracking operations' },
  { name: 'pattern_insights', description: 'TT009-3-2: Unified pattern insights - insights, correlations, recommendations, alerts' },

  // Navigation & Help (3 tools)
  { name: 'mandrel_help', description: 'Get help and list all available Mandrel tools organized by category' },
  { name: 'mandrel_explain', description: 'Get detailed explanation and usage information for a specific Mandrel tool' },
  { name: 'mandrel_examples', description: 'Get usage examples and patterns for a specific Mandrel tool' }
];

console.error(`🎯 Bridge starting. Target: ${BASE_URL} | Connection: ${CONNECTION_ID}`);

// Cached schemas loaded from AIDIS HTTP service
let CACHED_TOOL_SCHEMAS = null; // [{ name, description, inputSchema }, ...]

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const isHttps = u.protocol === 'https:';
      const httpModule = isHttps ? require('https') : http;

      const req = httpModule.request({
        hostname: u.hostname,
        port: u.port || (isHttps ? 443 : 80),
        path: u.pathname + u.search,
        method: options.method || 'GET',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        timeout: options.timeout || 30000,
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`Invalid JSON from ${url}`)); }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data || res.statusMessage}`));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      if (options.body) req.write(options.body);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function loadToolSchemas() {
  try {
    const schemas = await fetchJson(`${BASE_URL}/mcp/tools/schemas`);
    if (schemas && schemas.success !== false && Array.isArray(schemas.tools)) {
      // Normalize to minimal shape needed by MCP: name, description, inputSchema
      CACHED_TOOL_SCHEMAS = schemas.tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema || { type: 'object', properties: {}, additionalProperties: true },
      }));
      console.error(`📦 Loaded ${CACHED_TOOL_SCHEMAS.length} tool schemas from Mandrel`);
      return true;
    }
  } catch (e) {
    console.error(`⚠️  Failed to load tool schemas: ${e.message}`);
  }
  CACHED_TOOL_SCHEMAS = null;
  return false;
}

// Call AIDIS HTTP bridge
function callAidisHttp(toolName, args) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ arguments: args || {} });
    const base = new URL(BASE_URL);
    const isHttps = base.protocol === 'https:';
    const httpModule = isHttps ? require('https') : http;

    const options = {
      hostname: base.hostname,
      port: base.port || (isHttps ? 443 : 80),
      path: `/mcp/tools/${toolName}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'X-Connection-ID': CONNECTION_ID  // Session isolation per bridge instance
      },
      timeout: 30000,
    };

    console.error(`🔄 HTTP Call: ${toolName}`);

    const req = httpModule.request(options, (res) => {
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

// Register tools/list handler (prefer live schemas if available)
server.setRequestHandler(ListToolsRequestSchema, async () => {
  if (!CACHED_TOOL_SCHEMAS) {
    await loadToolSchemas();
  }
  const tools = (CACHED_TOOL_SCHEMAS && CACHED_TOOL_SCHEMAS.length)
    ? CACHED_TOOL_SCHEMAS
    : MANDREL_TOOLS.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: { type: 'object', properties: {}, additionalProperties: true }
      }));
  return { tools };
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
  // Best-effort load of schemas before connecting
  await loadToolSchemas();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const toolCount = (CACHED_TOOL_SCHEMAS && CACHED_TOOL_SCHEMAS.length) || MANDREL_TOOLS.length;
  console.error(`🚀 Mandrel HTTP-MCP Bridge v2.0.0 - Connected to ${BASE_URL}`);
  console.error(`📡 Available tools: ${toolCount} (schemas ${CACHED_TOOL_SCHEMAS ? 'loaded' : 'fallback'})`);
}

main().catch((error) => {
  console.error('❌ Failed to start HTTP-MCP bridge:', error);
  process.exit(1);
});
