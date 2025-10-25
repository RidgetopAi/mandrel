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
import { namingRoutes } from './naming.routes.js';
import { decisionsRoutes } from './decisions.routes.js';
import { tasksRoutes } from './tasks.routes.js';
import { sessionsRoutes } from './sessions.routes.js';
import { searchRoutes } from './search.routes.js';

/**
 * Execute MCP Tool via Route Dispatcher
 * Central entry point for all 36 active MCP tools
 */
export async function routeExecutor(toolName: string, args: any): Promise<McpResponse> {
  try {
    switch (toolName) {
      // System & Navigation (5 tools)
      case 'aidis_ping':
        return await systemRoutes.handlePing(args);
      case 'aidis_status':
        return await systemRoutes.handleStatus();
      case 'aidis_help':
        return await systemRoutes.handleHelp();
      case 'aidis_explain':
        return await systemRoutes.handleExplain(args);
      case 'aidis_examples':
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

      // Naming Registry (4 tools)
      case 'naming_register':
        return await namingRoutes.handleRegister(args);
      case 'naming_check':
        return await namingRoutes.handleCheck(args);
      case 'naming_suggest':
        return await namingRoutes.handleSuggest(args);
      case 'naming_stats':
        return await namingRoutes.handleStats(args);

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

      // Session Management (5 tools)
      case 'session_assign':
        return await sessionsRoutes.handleAssign(args);
      case 'session_status':
        return await sessionsRoutes.handleStatus();
      case 'session_new':
        return await sessionsRoutes.handleNew(args);
      case 'session_update':
        return await sessionsRoutes.handleUpdate(args);
      case 'session_details':
        return await sessionsRoutes.handleDetails(args);

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
          `Unknown tool: ${toolName}. Use 'aidis_help' to see available tools.`,
          'route_executor'
        );
    }
  } catch (error) {
    console.error(`Error executing tool ${toolName}:`, error);
    return formatMcpError(error as Error, toolName);
  }
}
