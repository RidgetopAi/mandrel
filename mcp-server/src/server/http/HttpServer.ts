/**
 * HTTP Server Setup and Routing
 */

import * as http from 'http';
import { AIDIS_TOOL_DEFINITIONS } from '../../config/toolDefinitions.js';
import { CircuitBreaker } from '../infra/CircuitBreaker.js';

const DISABLED_TOOLS = [
  'code_analyze', 'code_components', 'code_dependencies', 'code_impact', 'code_stats',
  'git_session_commits', 'git_commit_sessions', 'git_correlate_session'
];

export function createHttpServer(
  circuitBreaker: CircuitBreaker,
  dbHealthy: () => boolean,
  handleToolRequest: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
): http.Server {
  return http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    if (req.url === '/healthz') {
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        pid: process.pid,
        version: '1.0.0-core',
        service: 'aidis-core-http'
      }));
      
    } else if (req.url === '/readyz') {
      const isReady = dbHealthy() && circuitBreaker.getState() !== 'open';
      
      res.writeHead(isReady ? 200 : 503);
      res.end(JSON.stringify({
        status: isReady ? 'ready' : 'not_ready',
        database: dbHealthy() ? 'connected' : 'disconnected',
        circuit_breaker: circuitBreaker.getState(),
        timestamp: new Date().toISOString()
      }));
      
    } else if (req.url?.startsWith('/mcp/tools/') && req.method === 'POST') {
      await handleToolRequest(req, res);
      
    } else if (req.url === '/mcp/tools' && req.method === 'GET') {
      const activeTools = AIDIS_TOOL_DEFINITIONS.filter(tool => !DISABLED_TOOLS.includes(tool.name));

      try {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          tools: activeTools.map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            endpoint: `/mcp/tools/${tool.name}`
          })),
          count: activeTools.length,
          timestamp: new Date().toISOString()
        }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Failed to retrieve tool definitions',
          timestamp: new Date().toISOString()
        }));
      }

    } else if (req.url === '/mcp/tools/schemas' && req.method === 'GET') {
      const activeTools = AIDIS_TOOL_DEFINITIONS.filter(tool => !DISABLED_TOOLS.includes(tool.name));

      try {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          tools: activeTools,
          count: activeTools.length,
          timestamp: new Date().toISOString(),
          note: 'Complete MCP tool definitions with inputSchema for all AIDIS tools'
        }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Failed to retrieve tool schemas',
          timestamp: new Date().toISOString()
        }));
      }

    } else {
      res.writeHead(404);
      res.end(JSON.stringify({
        error: 'Not found',
        available_endpoints: ['/healthz', '/readyz', '/mcp/tools', '/mcp/tools/schemas', '/mcp/tools/{toolName}']
      }));
    }
  });
}
