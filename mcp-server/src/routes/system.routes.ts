import { navigationHandler } from '../handlers/navigation.js';
import { formatMcpError } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';

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

      console.log(`🏓 Ping received: "${message}" at ${timestamp}`);

      return {
        content: [{
          type: 'text',
          text: `🏓 Mandrel Pong! Message: "${message}" | Time: ${timestamp} | Status: Operational`,
        }],
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
      console.log('🎯 Status request received');
      // Navigation handler doesn't have getStatus, will be implemented in Phase 6.3
      // For now, return basic status
      return {
        content: [{
          type: 'text',
          text: `🎯 Mandrel Server Status Report\n\nStatus: Operational\nNote: Full status implementation pending Phase 6.3 refactor`
        }]
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
      console.log('🔧 Mandrel help request received');
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
      console.log('🔧 Mandrel explain request received for tool:', args.toolName);
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
      console.log('🔧 Mandrel examples request received for tool:', args.toolName);
      return await navigationHandler.getExamples(args);
    } catch (error) {
      return formatMcpError(error as Error, 'mandrel_examples');
    }
  }
}

export const systemRoutes = new SystemRoutes();