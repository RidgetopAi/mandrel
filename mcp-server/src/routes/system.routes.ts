import { navigationHandler } from '../handlers/navigation.js';
import { formatMcpError } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';
import { logger } from '../utils/logger.js';
import { MANDREL_VERSION } from '../version.js';

/**
 * System & Navigation Routes
 * Handles: ping, status, help, explain, examples
 */
class SystemRoutes {
  /**
   * Handle ping tool - simple connectivity test
   */
  async handlePing(args: { message?: string }): Promise<McpResponse> {
    try {
      const message = args.message || 'Hello Mandrel!';
      const timestamp = new Date().toISOString();

      logger.info(`🏓 Ping received: "${message}" at ${timestamp}`);

      return {
        content: [{
          type: 'text',
          text: `🏓 Mandrel Pong! Message: "${message}" | Time: ${timestamp} | Status: Operational`,
        }],
        structuredContent: {
          ok: true,
          message,
          timestamp,
          status: 'operational',
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'mandrel_ping');
    }
  }

  /**
   * Handle status tool - detailed server information
   */
  async handleStatus(): Promise<McpResponse> {
    try {
      logger.info('🎯 Status request received');
      const uptime = process.uptime();
      const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;
      // Version comes from the SINGLE source of truth (mcp-server/package.json via
      // ../version.js) — the SAME number reported by `initialize` and the health
      // endpoints. Surfacing it here closes the last gap where status showed none.
      return {
        content: [{
          type: 'text',
          text: `🎯 Mandrel Server Status Report\n\n` +
                `Version: ${MANDREL_VERSION}\n` +
                `Status: Operational\n` +
                `Uptime: ${uptimeStr}\n` +
                `Process: ${process.pid}`
        }],
        structuredContent: {
          ok: true,
          version: MANDREL_VERSION,
          status: 'operational',
          uptimeSeconds: Math.floor(uptime),
          pid: process.pid,
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'mandrel_status');
    }
  }

  /**
   * Handle help tool - display categorized list of all Mandrel tools
   */
  async handleHelp(): Promise<McpResponse> {
    try {
      logger.info('🔧 Mandrel help request received');
      return await navigationHandler.getHelp();
    } catch (error) {
      return formatMcpError(error as Error, 'mandrel_help');
    }
  }

  /**
   * Handle explain tool - get detailed help for a specific tool
   */
  async handleExplain(args: { toolName: string }): Promise<McpResponse> {
    try {
      logger.info('🔧 Mandrel explain request received for tool', { metadata: { toolName: args.toolName } });
      return await navigationHandler.explainTool(args);
    } catch (error) {
      return formatMcpError(error as Error, 'mandrel_explain');
    }
  }

  /**
   * Handle examples tool - get usage examples for a specific tool
   */
  async handleExamples(args: { toolName: string }): Promise<McpResponse> {
    try {
      logger.info('🔧 Mandrel examples request received for tool', { metadata: { toolName: args.toolName } });
      return await navigationHandler.getExamples(args);
    } catch (error) {
      return formatMcpError(error as Error, 'mandrel_examples');
    }
  }
}

export const systemRoutes = new SystemRoutes();