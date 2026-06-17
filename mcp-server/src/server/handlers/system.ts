/**
 * System Tool Handlers - ping, status, help, explain, examples
 */

import { navigationHandler } from '../../handlers/navigation.js';
import { CircuitBreaker } from '../infra/CircuitBreaker.js';
import { AIDIS_TOOL_DEFINITIONS } from '../../config/toolDefinitions.js';
import { MANDREL_VERSION } from '../../version.js';

const HTTP_PORT = process.env.AIDIS_HTTP_PORT || 8080;

export function createSystemHandlers(circuitBreaker: CircuitBreaker, dbHealthy: () => boolean) {
  return {
    async handlePing(args: { message?: string }) {
      return {
        content: [
          {
            type: 'text',
            text: `🏓 AIDIS Core HTTP Service Pong! ${args.message || ''}\n\n` +
                  `🚀 Status: All systems operational\n` +
                  `⏰ Server time: ${new Date().toISOString()}\n` +
                  `🔒 PID: ${process.pid}\n` +
                  `🌐 Service: aidis-core-http\n` +
                  `📊 Circuit breaker: ${circuitBreaker.getState()}\n` +
                  `🗄️  Database: ${dbHealthy() ? 'Connected' : 'Disconnected'}`
          },
        ],
      };
    },

    async handleStatus() {
      const uptime = process.uptime();
      const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;
      
      return {
        content: [
          {
            type: 'text',
            text: `📊 AIDIS Core HTTP Service Status\n\n` +
                  `🚀 Service: aidis-core-http v${MANDREL_VERSION}\n` +
                  `⏰ Uptime: ${uptimeStr}\n` +
                  `🔒 Process: ${process.pid}\n` +
                  `🌐 HTTP Port: ${HTTP_PORT}\n` +
                  `🗄️  Database: ${dbHealthy() ? '✅ Connected' : '❌ Disconnected'}\n` +
                  `⚡ Circuit Breaker: ${circuitBreaker.getState().toUpperCase()}\n` +
                  `🧠 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\n` +
                  `📊 Available Tools: ${AIDIS_TOOL_DEFINITIONS.length}\n\n` +
                  `🔗 Endpoints:\n` +
                  `   • GET  /mcp/tools - List all tools\n` +
                  `   • POST /mcp/tools/{name} - Execute tool\n` +
                  `   • GET  /healthz - Health check\n` +
                  `   • GET  /readyz - Readiness check`
          },
        ],
      };
    },

    async handleHelp() {
      return navigationHandler.getHelp();
    },

    async handleExplain(args: any) {
      return navigationHandler.explainTool(args);
    },

    async handleExamples(args: any) {
      return navigationHandler.getExamples(args);
    }
  };
}
