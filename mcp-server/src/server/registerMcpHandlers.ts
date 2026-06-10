/**
 * Shared MCP request-handler registration
 *
 * DRY: this is the SINGLE place that registers the MCP JSON-RPC request handlers
 * (ListTools / CallTool / ListResources / ReadResource) on an SDK `Server` instance.
 *
 * It is used by BOTH:
 *   - the long-lived stdio `Server` (MandrelMcpServer)
 *   - each per-session HTTP `Server` created for a Streamable HTTP connection
 *
 * The actual tool logic is NOT duplicated here — every CallTool request is delegated
 * back to the shared `executeMcpTool()` closure provided by MandrelMcpServer, which
 * funnels through `executeToolOperation()` → `routeExecutor()`. ZERO changes to tool
 * logic; this only wires the protocol surface.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { AIDIS_TOOL_DEFINITIONS } from '../config/toolDefinitions.js';
import { logger } from '../utils/logger.js';

/**
 * Tools filtered from the public tool list (Token Optimization 2025-10-01).
 * Kept identical to the historical stdio behaviour.
 */
const DISABLED_TOOLS = [
  'code_analyze', 'code_components', 'code_dependencies', 'code_impact', 'code_stats',
  'complexity_analyze', 'complexity_insights', 'complexity_manage',
];

/**
 * Collaborators injected by MandrelMcpServer so this module never owns tool logic
 * or server state directly.
 */
export interface McpHandlerDeps {
  /** Shared tool executor (validation → routeExecutor). connectionId isolates sessions. */
  executeMcpTool: (toolName: string, args: any, context?: { connectionId?: string }) => Promise<any>;
  /** Normalizes Claude-Code-serialized array/number params. */
  deserializeParameters: (args: any) => any;
  /** Best-effort server status for the aidis://status resource. */
  getServerStatus: () => Promise<any>;
}

/**
 * Register the full MCP request-handler surface on a given SDK Server.
 *
 * @param server  An SDK `Server` (stdio or a per-HTTP-session instance)
 * @param deps    Shared collaborators from MandrelMcpServer
 * @param connectionId  Connection/session identifier used for session isolation.
 *                      stdio passes undefined (defaults to 'stdio' downstream);
 *                      each HTTP session passes its Mcp-Session-Id.
 */
export function registerMcpHandlers(
  server: Server,
  deps: McpHandlerDeps,
  connectionId?: string
): void {
  // Tool listing — filter disabled tools (identical to legacy stdio behaviour)
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: AIDIS_TOOL_DEFINITIONS.filter(tool => !DISABLED_TOOLS.includes(tool.name)),
    };
  });

  // Tool execution — delegate to the shared executor (no tool logic here)
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;

    try {
      const args = deps.deserializeParameters(rawArgs || {});
      // Pass connectionId so HTTP sessions are isolated from stdio and each other
      return await deps.executeMcpTool(name, args, connectionId ? { connectionId } : undefined);
    } catch (error) {
      logger.error(`Error executing tool ${name}`, error as Error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to execute tool: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });

  // Resource listing
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'aidis://status',
          mimeType: 'application/json',
          name: 'AIDIS Server Status',
          description: 'Current server status and configuration',
        },
      ],
    };
  });

  // Resource reading
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    if (uri === 'aidis://status') {
      const status = await deps.getServerStatus();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    }

    throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
  });
}
