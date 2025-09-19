#!/usr/bin/env node

/**
 * Claude Code HTTP-MCP Bridge
 *
 * Translates Claude Code's MCP stdio calls to AIDIS HTTP endpoints
 * Uses the working HTTP bridge at localhost:8080/mcp/tools/*
 *
 * AUTO-GENERATED: This file contains all 96 AIDIS tools from aidis_help
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

// All 96 AIDIS tools from actual server
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

  // Task Management (4 tools)
  { name: 'task_create', description: 'Create a new task for coordination' },
  { name: 'task_list', description: 'List tasks with optional filtering' },
  { name: 'task_update', description: 'Update task status and assignment' },
  { name: 'task_details', description: 'Get detailed information for a specific task' },

  // Code Analysis (5 tools)
  { name: 'code_analyze', description: 'Analyze code file structure and dependencies' },
  { name: 'code_components', description: 'List code components (functions, classes, etc.)' },
  { name: 'code_dependencies', description: 'Get dependencies for a specific component' },
  { name: 'code_impact', description: 'Analyze the impact of changing a component' },
  { name: 'code_stats', description: 'Get code analysis statistics for a project' },

  // Smart Search & AI (2 tools)
  { name: 'smart_search', description: 'Intelligent search across all project data' },
  { name: 'get_recommendations', description: 'Get AI-powered recommendations for development' },

  // Code Complexity (16 tools)
  { name: 'complexity_analyze_files', description: 'Analyze code complexity for specific files with multi-dimensional metrics' },
  { name: 'complexity_get_dashboard', description: 'Get comprehensive complexity dashboard for project' },
  { name: 'complexity_get_file_metrics', description: 'Get detailed complexity metrics for specific files' },
  { name: 'complexity_get_function_metrics', description: 'Get detailed complexity metrics at function level' },
  { name: 'complexity_get_hotspots', description: 'Get complexity hotspots that require immediate attention' },
  { name: 'complexity_get_alerts', description: 'Get active complexity alerts and threshold violations' },
  { name: 'complexity_acknowledge_alert', description: 'Acknowledge a complexity alert' },
  { name: 'complexity_resolve_alert', description: 'Mark a complexity alert as resolved' },
  { name: 'complexity_get_refactoring_opportunities', description: 'Get prioritized refactoring opportunities' },
  { name: 'complexity_get_trends', description: 'Get complexity trends and forecasting data over time' },
  { name: 'complexity_get_technical_debt', description: 'Get technical debt analysis based on complexity metrics' },
  { name: 'complexity_analyze_commit', description: 'Analyze complexity for files changed in git commits' },
  { name: 'complexity_set_thresholds', description: 'Configure complexity thresholds and alerting rules' },
  { name: 'complexity_get_performance', description: 'Get complexity tracking system performance statistics' },
  { name: 'complexity_start_tracking', description: 'Start the complexity tracking service' },
  { name: 'complexity_stop_tracking', description: 'Stop the complexity tracking service' },

  // Development Metrics (12 tools)
  { name: 'metrics_collect_project', description: 'Trigger comprehensive metrics collection for a project' },
  { name: 'metrics_get_dashboard', description: 'Get comprehensive project metrics dashboard data' },
  { name: 'metrics_get_core_metrics', description: 'Get detailed core development metrics (velocity, quality, debt)' },
  { name: 'metrics_get_pattern_intelligence', description: 'Get pattern-based intelligence metrics' },
  { name: 'metrics_get_productivity_health', description: 'Get developer productivity and health metrics' },
  { name: 'metrics_get_alerts', description: 'Get active metrics alerts and notifications' },
  { name: 'metrics_acknowledge_alert', description: 'Acknowledge a metrics alert' },
  { name: 'metrics_resolve_alert', description: 'Mark a metrics alert as resolved' },
  { name: 'metrics_get_trends', description: 'Get metrics trends and forecasting data' },
  { name: 'metrics_get_performance', description: 'Get metrics collection system performance statistics' },
  { name: 'metrics_start_collection', description: 'Start the metrics collection service' },
  { name: 'metrics_stop_collection', description: 'Stop the metrics collection service' },

  // Metrics Aggregation (5 tools)
  { name: 'metrics_aggregate_projects', description: 'Aggregate metrics across multiple projects with various aggregation types' },
  { name: 'metrics_aggregate_timeline', description: 'Aggregate metrics over time with specified granularity and smoothing' },
  { name: 'metrics_calculate_correlations', description: 'Calculate correlations and relationships between metrics' },
  { name: 'metrics_get_executive_summary', description: 'Generate comprehensive executive summary with key insights' },
  { name: 'metrics_export_data', description: 'Export aggregated metrics data in various formats (CSV, JSON, Excel)' },

  // Pattern Detection (7 tools)
  { name: 'pattern_detection_start', description: 'Start the real-time pattern detection service' },
  { name: 'pattern_detection_stop', description: 'Stop the pattern detection service and get final metrics' },
  { name: 'pattern_detection_status', description: 'Get pattern detection service status and performance metrics' },
  { name: 'pattern_detect_commits', description: 'Detect patterns in specific commits or recent commits' },
  { name: 'pattern_track_git_activity', description: 'Track git activity with automatic pattern detection' },
  { name: 'pattern_get_alerts', description: 'Get real-time pattern alerts for high-risk discoveries' },
  { name: 'pattern_get_session_insights', description: 'Get pattern insights for current session' },

  // Pattern Analysis (10 tools)
  { name: 'pattern_analyze_project', description: 'Get comprehensive pattern analysis for project' },
  { name: 'pattern_analyze_session', description: 'Analyze patterns for specific session context' },
  { name: 'pattern_analyze_commit', description: 'Analyze patterns for specific git commits with impact analysis' },
  { name: 'pattern_get_discovered', description: 'Get discovered patterns with advanced filtering' },
  { name: 'pattern_get_insights', description: 'Get actionable pattern insights with advanced filtering' },
  { name: 'pattern_get_trends', description: 'Analyze pattern trends over time with forecasting' },
  { name: 'pattern_get_correlations', description: 'Find correlations between different pattern types' },
  { name: 'pattern_get_anomalies', description: 'Detect pattern anomalies and outliers with statistical analysis' },
  { name: 'pattern_get_recommendations', description: 'Generate AI-driven pattern-based recommendations' },
  { name: 'pattern_get_performance', description: 'Get pattern detection system performance metrics' },

  // Outcome Tracking (7 tools)
  { name: 'outcome_record', description: 'Record a decision outcome measurement with evidence and scoring' },
  { name: 'outcome_track_metric', description: 'Track metrics over time for a decision to monitor progress' },
  { name: 'outcome_analyze_impact', description: 'Analyze and record impact relationships between decisions' },
  { name: 'outcome_conduct_retrospective', description: 'Conduct a structured retrospective on a decision' },
  { name: 'outcome_get_insights', description: 'Get learning insights and patterns from decision outcomes' },
  { name: 'outcome_get_analytics', description: 'Get comprehensive decision analytics, trends, and reporting' },
  { name: 'outcome_predict_success', description: 'Predict decision success probability using historical patterns' },

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