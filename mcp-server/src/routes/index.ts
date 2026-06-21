/**
 * Central Route Registry for All MCP Tools
 * Dispatches tool calls to appropriate domain route handlers
 */

import { formatMcpError } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';
import { logger } from '../utils/logger.js';
import { ensureActiveSession } from '../services/sessionTracker.js';
import { projectHandler } from '../handlers/project.js';

// Import all route modules
import { systemRoutes } from './system.routes.js';
import { contextRoutes } from './context.routes.js';
import { projectRoutes } from './project.routes.js';
import { decisionsRoutes } from './decisions.routes.js';
import { tasksRoutes } from './tasks.routes.js';
import { searchRoutes } from './search.routes.js';

/**
 * Execution context passed through route handlers
 */
export interface RouteContext {
  connectionId?: string;
}

/**
 * CONTENT-PRODUCING ("ACTION") TOOLS — the single source of truth for lazy
 * session creation.
 *
 * Lazy-session model (P-B): a DB session row is created ONLY when one of these
 * tools runs on a connection. Every other tool is PASSIVE and never creates a
 * session — so passive connects, dashboard polls, searches, stats, help, and
 * `project_*` navigation leave zero empty session rows behind.
 *
 * Keep this set TIGHT and in ONE place: adding a tool here is the only way to
 * make a tool create sessions, so noise can't creep back in silently. A tool is
 * an ACTION only if it persists user-authored content that should be attributed
 * to a session (creates), NOT if it merely reads or mutates existing rows.
 *
 * NOTE on project_switch: intentionally PASSIVE. Switching project must NOT
 * spawn a session (one-session-per-connection); if a session already exists it
 * is re-pinned to the new project by projectHandler.syncSessionProject, and if
 * none exists yet the NEXT real action creates one already pinned to the
 * switched-to project.
 */
const ACTION_TOOLS: ReadonlySet<string> = new Set<string>([
  'context_store',
  'task_create',
  'decision_record',
]);

/**
 * Lazily ensure a DB session exists for this connection BEFORE a content-
 * producing tool writes, so the write attaches to the correct per-connection
 * session. Inherits the connection's CURRENT project; a later project_switch
 * re-pins that same session (never spawns a new one).
 *
 * Connection-scoped and idempotent: if the connection already has an active
 * session, ensureActiveSession returns it unchanged (no duplicate rows). Failure
 * here must not block the tool — the write path degrades to "no session" exactly
 * as before, so a session-tracking hiccup never breaks the user's action.
 */
async function ensureSessionForAction(toolName: string, connectionId?: string): Promise<void> {
  try {
    const connId = connectionId ?? 'stdio';
    // Resolve the connection's current project (same key the route layer uses).
    let projectId: string | undefined;
    try {
      await projectHandler.initializeSession(connId);
      projectId = (await projectHandler.getCurrentProjectId(connId)) ?? undefined;
    } catch {
      projectId = undefined;
    }
    const sessionId = await ensureActiveSession(
      projectId,
      undefined, // title
      undefined, // description
      undefined, // sessionGoal
      undefined, // tags
      undefined, // aiModel
      connId     // connectionId — isolates this session to this connection
    );
    logger.info(
      `📋 Lazy session ready for action '${toolName}': ${sessionId.substring(0, 8)}... (connection: ${connId})`
    );
  } catch (error) {
    // Never block the user action on a session-tracking failure.
    logger.warn(`⚠️  Lazy session ensure failed for '${toolName}'; proceeding without`, {
      metadata: { error: (error as Error)?.message }
    });
  }
}

/**
 * DUAL-CHANNEL OUTPUT SEAM (task 2c412458).
 *
 * THE ONE mechanism — not 29 copy-pastes. Every tool result flows back through
 * `routeExecutor`, so this is the single place that guarantees the spec's
 * `structuredContent` is present on EVERY response:
 *
 *   1. If a handler set `structuredContent` directly (the rich tools that build a
 *      clean record/array), keep it.
 *   2. Else if it set the legacy `data` sibling, PROMOTE that to `structuredContent`
 *      (back-compat — generalizes the existing decisions-route `data` pattern to all).
 *   3. Else synthesize a minimal `{ ok }` object so a tool that only returns prose
 *      (system/status/ping) STILL carries a machine-readable success flag. No tool
 *      is ever left without structuredContent — Brian's "all tools" bar.
 *
 * `ok` is always (re)stamped from the response's error flag so a consumer never has
 * to infer success from text. The legacy `data` sibling is PRESERVED (back-compat
 * for the Command UI + task-1 tests that read `.data`); structuredContent is the new
 * canonical machine channel mirroring it.
 */
function ensureStructuredContent(resp: McpResponse): McpResponse {
  const ok = resp.isError !== true;
  let structured: Record<string, any>;

  if (resp.structuredContent && typeof resp.structuredContent === 'object') {
    structured = resp.structuredContent;
  } else if (resp.data && typeof resp.data === 'object' && !Array.isArray(resp.data)) {
    structured = resp.data;
  } else if (resp.data !== undefined) {
    // A primitive/array data payload — wrap it so structuredContent is always an object.
    structured = { value: resp.data };
  } else {
    structured = {};
  }

  // Always stamp the machine-readable success flag (handlers may omit it).
  if (structured.ok === undefined) structured.ok = ok;

  return { ...resp, structuredContent: structured };
}

/**
 * Execute MCP Tool via Route Dispatcher
 * Central entry point for all active MCP tools (context_update added in T1, task f54e6cf5)
 */
export async function routeExecutor(toolName: string, args: any, context?: RouteContext): Promise<McpResponse> {
  return ensureStructuredContent(await routeExecutorInner(toolName, args, context));
}

async function routeExecutorInner(toolName: string, args: any, context?: RouteContext): Promise<McpResponse> {
  try {
    // Log deprecation warning for old tool names
    const deprecatedTools = ['aidis_ping', 'aidis_status', 'aidis_help', 'aidis_explain', 'aidis_examples'];
    if (deprecatedTools.includes(toolName)) {
      const newName = toolName.replace('aidis_', 'mandrel_');
      logger.warn(`⚠️  Tool '${toolName}' is deprecated. Use '${newName}' instead.`);
    }

    // P-B ACTION GATE: lazily create this connection's DB session ONLY when a
    // content-producing tool runs. Passive/read tools fall straight through and
    // never create a session row. Centralised here so the create-timing decision
    // lives in exactly one place (see ACTION_TOOLS above).
    if (ACTION_TOOLS.has(toolName)) {
      await ensureSessionForAction(toolName, context?.connectionId);
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

      // Context Management (4 tools) - pass context for session isolation
      case 'context_store':
        return await contextRoutes.handleStore(args, context);
      case 'context_search':
        return await contextRoutes.handleSearch(args, context);
      case 'context_get_recent':
        return await contextRoutes.handleGetRecent(args, context);
      case 'context_update':
        return await contextRoutes.handleUpdate(args, context);
      case 'context_stats':
        return await contextRoutes.handleStats(args, context);
      case 'context_delete':
        return await contextRoutes.handleDelete(args, context);
      case 'context_restore':
        return await contextRoutes.handleRestore(args, context);

      // Project Management (8 tools) - pass context for session isolation
      case 'project_list':
        return await projectRoutes.handleList(args, context);
      case 'project_create':
        return await projectRoutes.handleCreate(args);
      case 'project_update':
        return await projectRoutes.handleUpdate(args);
      case 'project_delete':
        return await projectRoutes.handleDelete(args, context);
      case 'project_switch':
        return await projectRoutes.handleSwitch(args, context);
      case 'project_current':
        return await projectRoutes.handleCurrent(args, context);
      case 'project_info':
        return await projectRoutes.handleInfo(args);

      // Technical Decisions (4 tools) - pass context for session isolation
      case 'decision_record':
        return await decisionsRoutes.handleRecord(args, context);
      case 'decision_search':
        return await decisionsRoutes.handleSearch(args, context);
      case 'decision_get':
        return await decisionsRoutes.handleGet(args, context);
      case 'decision_update':
        return await decisionsRoutes.handleUpdate(args, context);
      case 'decision_stats':
        return await decisionsRoutes.handleStats(args, context);
      case 'decision_delete':
        return await decisionsRoutes.handleDelete(args, context);
      case 'decision_restore':
        return await decisionsRoutes.handleRestore(args, context);

      // Task Management (6 tools) - pass context for session isolation
      case 'task_create':
        return await tasksRoutes.handleCreate(args, context);
      case 'task_list':
        return await tasksRoutes.handleList(args, context);
      case 'task_update':
        return await tasksRoutes.handleUpdate(args, context);
      case 'task_details':
        return await tasksRoutes.handleDetails(args, context);
      case 'task_bulk_update':
        return await tasksRoutes.handleBulkUpdate(args, context);
      case 'task_progress_summary':
        return await tasksRoutes.handleProgressSummary(args, context);
      case 'task_delete':
        return await tasksRoutes.handleDelete(args, context);
      case 'task_restore':
        return await tasksRoutes.handleRestore(args, context);

      // Session Management (5 tools) - DELETED (2025-10-24)
      // Sessions auto-manage via SessionTracker service
      // REST API endpoints at /api/v2/sessions/* handle UI analytics

      // Smart Search & AI (3 tools) - pass context for session isolation
      case 'smart_search':
        return await searchRoutes.handleSmartSearch(args, context);
      case 'get_recommendations':
        return await searchRoutes.handleRecommendations(args, context);
      case 'project_insights':
        return await searchRoutes.handleProjectInsights(args, context);

      // Unknown tool
      default:
        logger.warn(`Unknown MCP tool requested: ${toolName}`);
        return formatMcpError(
          `Unknown tool: ${toolName}. Use 'mandrel_help' to see available tools.`,
          'route_executor'
        );
    }
  } catch (error) {
    logger.error(`Error executing tool ${toolName}`, error as Error);
    return formatMcpError(error as Error, toolName);
  }
}