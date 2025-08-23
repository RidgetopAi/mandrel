#!/usr/bin/env node

/**
 * Super Simple Mock HTTP Bridge for AIDIS Command Dev
 */

const http = require('http');
const url = require('url');

const PORT = 8081;

// Mock responses for development
const mockResponses = {
  decision_search: {
    success: true,
    data: {
      results: [
        {
          id: '1',
          title: 'Test Decision from Mock Bridge',
          description: 'HTTP-MCP Bridge is working with mock data',
          status: 'active',
          impact_level: 'medium',
          decision_type: 'technical',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          rationale: 'Created to test the HTTP-MCP bridge functionality'
        },
        {
          id: '2', 
          title: 'Database Schema Decision',
          description: 'Use PostgreSQL with pgvector for AIDIS storage',
          status: 'active',
          impact_level: 'high',
          decision_type: 'architecture',
          created_at: '2025-08-22T10:00:00.000Z',
          updated_at: '2025-08-22T10:00:00.000Z',
          rationale: 'PostgreSQL provides ACID compliance and vector search capabilities'
        }
      ],
      total: 2,
      page: 1,
      limit: 20,
      totalPages: 1
    }
  },
  decision_stats: {
    success: true,
    data: {
      total_decisions: 14,
      active_decisions: 12,
      recent_decisions: 3,
      status_breakdown: {
        active: 12,
        deprecated: 1,
        superseded: 1
      }
    }
  }
};

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  
  console.log(`${new Date().toISOString()} ${req.method} ${parsedUrl.pathname}`);

  // Health check
  if (req.method === 'GET' && parsedUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      service: 'Simple Mock HTTP-MCP Bridge',
      port: PORT,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Handle MCP tool calls
  if (req.method === 'POST' && parsedUrl.pathname.startsWith('/mcp/tools/')) {
    const toolName = parsedUrl.pathname.replace('/mcp/tools/', '');
    
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const requestData = body ? JSON.parse(body) : {};
        const toolArgs = requestData.arguments || requestData;

        console.log(`🔄 HTTP→MOCK: ${toolName}`, Object.keys(toolArgs || {}));

        // Return mock response
        const mockResponse = mockResponses[toolName];
        
        if (mockResponse) {
          console.log(`✅ Mock response for ${toolName}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(mockResponse));
        } else {
          console.log(`⚠️  Unknown tool ${toolName}, returning generic success`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            data: {
              message: `Tool ${toolName} executed successfully (mock)`,
              args: toolArgs,
              timestamp: new Date().toISOString()
            }
          }));
        }

      } catch (error) {
        console.error(`❌ Tool ${toolName} failed:`, error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        }));
      }
    });

    return;
  }

  // 404 for other routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    success: false,
    error: `Endpoint ${req.method} ${parsedUrl.pathname} not found`,
    available: [
      'GET /health',
      'POST /mcp/tools/{toolName}'
    ]
  }));
});

server.listen(PORT, 'localhost', () => {
  console.log('🌉 Simple Mock HTTP Bridge Started');
  console.log(`📡 Listening on: http://localhost:${PORT}`);
  console.log(`🔄 Providing MOCK responses for AIDIS Command Dev`);
  console.log('✅ Ready for aidis-command-dev backend connections');
  console.log('');
  console.log('📋 Available endpoints:');
  console.log('   GET  /health - Bridge health check');
  console.log('   POST /mcp/tools/decision_search - Mock decision search');
  console.log('   POST /mcp/tools/decision_stats - Mock decision stats');
  console.log('   POST /mcp/tools/* - Generic mock response');
});

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`\n📴 Received ${signal}, shutting down mock bridge...`);
  server.close(() => {
    console.log('✅ Mock bridge shutdown complete');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
