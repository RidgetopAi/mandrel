import { navigationHandler } from '../handlers/navigation.js';
import { formatMcpError } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';

/**
 * System & Navigation Routes
 * Handles: ping, status, help, explain, examples
 */
export class SystemRoutes {
  /**
   * Handle ping tool - simple connectivity test
   */
  async handlePing(args: { message?: string }): Promise<McpResponse> {
    try {
      const message = args.message || 'Hello AIDIS!';
      const timestamp = new Date().toISOString();

      console.log(`🏓 Ping received: "${message}" at ${timestamp}`);

      return {
        content: [{
          type: 'text',
          text: `🏓 AIDIS Pong! Message: "${message}" | Time: ${timestamp} | Status: Operational`,
        }],
      };
    } catch (error) {
      return formatMcpError(error as Error, 'aidis_ping');
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
          text: `🎯 AIDIS Server Status Report\n\nStatus: Operational\nNote: Full status implementation pending Phase 6.3 refactor`
        }]
      };
    } catch (error) {
      return formatMcpError(error as Error, 'aidis_status');
    }
  }

  /**
   * Handle help tool - display categorized list of all AIDIS tools
   */
  async handleHelp(): Promise<McpResponse> {
    try {
      console.log('🔧 AIDIS help request received');
      return await navigationHandler.getHelp();
    } catch (error) {
      return formatMcpError(error as Error, 'aidis_help');
    }
  }

  /**
   * Handle explain tool - get detailed help for a specific tool
   */
  async handleExplain(args: { toolName: string }): Promise<McpResponse> {
    try {
      console.log('🔧 AIDIS explain request received for tool:', args.toolName);
      return await navigationHandler.explainTool(args);
    } catch (error) {
      return formatMcpError(error as Error, 'aidis_explain');
    }
  }

  /**
   * Handle examples tool - get usage examples for a specific tool
   */
  async handleExamples(args: { toolName: string }): Promise<McpResponse> {
    try {
      console.log('🔧 AIDIS examples request received for tool:', args.toolName);
      return await navigationHandler.getExamples(args);
    } catch (error) {
      return formatMcpError(error as Error, 'aidis_examples');
    }
  }
}

export const systemRoutes = new SystemRoutes();
