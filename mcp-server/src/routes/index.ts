/**
 * Central Route Registry for All MCP Tools
 * Dispatches tool calls to appropriate domain route handlers
 */

import { formatMcpError } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';

// Import all route modules
import { systemRoutes } from './system.routes.js';
import { contextRoutes } from './context.routes.js';
import { projectRoutes } from './project.routes.js';
import { decisionsRoutes } from './decisions.routes.js';
import { tasksRoutes } from './tasks.routes.js';
import { searchRoutes } from './search.routes.js';

/**
 * Execute MCP Tool via Route Dispatcher
 * Central entry point for all 36 active MCP tools
 */
export async function routeExecutor(toolName: string, args: any): Promise<McpResponse> {
  try {
    // Log deprecation warning for old tool names
    const deprecatedTools = ['aidis_ping', 'aidis_status', 'aidis_help', 'aidis_explain', 'aidis_examples'];
    if (deprecatedTools.includes(toolName)) {
      const newName = toolName.replace('aidis_', 'mandrel_');
      console.warn(`⚠️  Tool '${toolName}' is deprecated. Use '${newName}' instead.`);
    }

    switch (toolName) {
      // System & Navigation (5 tools)
      case 'mandrel_ping':
      case 'aidis_ping': // DEPRECATED - use mandrel_ping
        return await systemRoutes.handlePing(args);
      case 'mandrel_status':
      case 'aidis_status': // DEPRECATED - use mandrel_status
        return await systemRoutes.handleStatus();
      case 'mandrel_help':
      case 'aidis_help': // DEPRECATED - use mandrel_help
        return await systemRoutes.handleHelp();
      case 'mandrel_explain':
      case 'aidis_explain': // DEPRECATED - use mandrel_explain
        return await systemRoutes.handleExplain(args);
      case 'mandrel_examples':
      case 'aidis_examples': // DEPRECATED - use mandrel_examples
        return await systemRoutes.handleExamples(args);

      // Context Management (4 tools)
      case 'context_store':
        return await contextRoutes.handleStore(args);
      case 'context_search':
        return await contextRoutes.handleSearch(args);
      case 'context_get_recent':
        return await contextRoutes.handleGetRecent(args);
      case 'context_stats':
        return await contextRoutes.handleStats(args);

      // Project Management (6 tools)
      case 'project_list':
        return await projectRoutes.handleList(args);
      case 'project_create':
        return await projectRoutes.handleCreate(args);
      case 'project_switch':
        return await projectRoutes.handleSwitch(args);
      case 'project_current':
        return await projectRoutes.handleCurrent(args);
      case 'project_info':
        return await projectRoutes.handleInfo(args);

      // Technical Decisions (4 tools)
      case 'decision_record':
        return await decisionsRoutes.handleRecord(args);
      case 'decision_search':
        return await decisionsRoutes.handleSearch(args);
      case 'decision_update':
        return await decisionsRoutes.handleUpdate(args);
      case 'decision_stats':
        return await decisionsRoutes.handleStats(args);

      // Task Management (6 tools)
      case 'task_create':
        return await tasksRoutes.handleCreate(args);
      case 'task_list':
        return await tasksRoutes.handleList(args);
      case 'task_update':
        return await tasksRoutes.handleUpdate(args);
      case 'task_details':
        return await tasksRoutes.handleDetails(args);
      case 'task_bulk_update':
        return await tasksRoutes.handleBulkUpdate(args);
      case 'task_progress_summary':
        return await tasksRoutes.handleProgressSummary(args);

      // Session Management (5 tools) - DELETED (2025-10-24)
      // Sessions auto-manage via SessionTracker service
      // REST API endpoints at /api/v2/sessions/* handle UI analytics

      // Smart Search & AI (3 tools)
      case 'smart_search':
        return await searchRoutes.handleSmartSearch(args);
      case 'get_recommendations':
        return await searchRoutes.handleRecommendations(args);
      case 'project_insights':
        return await searchRoutes.handleProjectInsights(args);

      // Unknown tool
      default:
        console.warn(`Unknown MCP tool requested: ${toolName}`);
        return formatMcpError(
          `Unknown tool: ${toolName}. Use 'mandrel_help' to see available tools.`,
          'route_executor'
        );
    }
  } catch (error) {
    console.error(`Error executing tool ${toolName}:`, error);
    return formatMcpError(error as Error, toolName);
  }
}