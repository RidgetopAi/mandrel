#!/usr/bin/env node

/**
 * Super Simple HTTP-MCP Bridge using Node.js built-ins
 */

const http = require('http');
const url = require('url');
const { spawn } = require('child_process');

const PORT = 8081;

// Mock responses for development
const mockResponses = {
  decision_search: {
    success: true,
    data: {
      results: [
        {
          id: '1',
          title: 'Test Decision from Bridge',
          description: 'HTTP-MCP Bridge is working correctly',
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

/**
 * Call the real AIDIS MCP server
 */
async function callRealAidisMcp(toolName, args) {
  return new Promise((resolve, reject) => {
    const mcpCall = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args || {}
      }
    };

    const postData = JSON.stringify(mcpCall);
    
    const options = {
      hostname: 'localhost',
      port: 8080,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          
          if (parsed.error) {
            resolve({
              success: false,
              error: parsed.error.message || 'AIDIS MCP tool error'
            });
          } else {
            // Extract the actual result from AIDIS response
            let result = parsed.result !== undefined ? parsed.result : parsed;
            
            // Handle AIDIS text-based responses for decision_search
            if (result && result.content && result.content[0] && result.content[0].text) {
              const textResult = result.content[0].text;
              
              if (toolName === 'decision_search') {
                result = parseDecisionSearchText(textResult);
              } else {
                result = textResult;
              }
            }
            
            resolve({
              success: true,
              data: result
            });
          }
        } catch (parseError) {
          resolve({
            success: false,
            error: `Failed to parse AIDIS response: ${parseError.message}`
          });
        }
      });
    });

    req.on('error', (error) => {
      resolve({
        success: false,
        error: `AIDIS MCP request failed: ${error.message}`
      });
    });

    req.setTimeout(10000);
    req.write(postData);
    req.end();
  });
}

/**
 * Parse decision search text response from AIDIS
 */
function parseDecisionSearchText(text) {
  const result = {
    results: [],
    total: 0,
    page: 1,
    limit: 20
  };

  if (text.includes('No decisions found')) {
    return result;
  }

  // Parse the decisions from the text response
  const totalMatch = text.match(/Found (\d+) technical decisions?:/);
  if (totalMatch) {
    result.total = parseInt(totalMatch[1]);
  }

  // Parse individual decisions
  const decisionBlocks = text.split(/\d+\.\s+\*\*/).slice(1);
  
  for (const block of decisionBlocks) {
    const decision = parseDecisionBlock(block.trim());
    if (decision) {
      result.results.push(decision);
    }
  }

  return result;
}

/**
 * Parse individual decision block from AIDIS text
 */
function parseDecisionBlock(block) {
  try {
    // Extract decision type from first line (e.g., "ARCHITECTURE** - critical impact")
    const typeMatch = block.match(/^([A-Z]+)\*\*\s*-\s*([a-z]+)\s+impact/);
    if (!typeMatch) return null;

    const type = typeMatch[1];
    const impact = typeMatch[2];

    // Extract title (next line after emoji)
    const titleMatch = block.match(/📝\s+(.+)/);
    const title = titleMatch ? titleMatch[1].trim() : 'Untitled Decision';

    // Extract rationale/description
    const rationaleMatch = block.match(/💡\s+(.+)/);
    const rationale = rationaleMatch ? rationaleMatch[1].trim() : '';

    // Extract date and status
    const dateStatusMatch = block.match(/📅\s+(\d{4}-\d{2}-\d{2})\s+\|\s+Status:\s+([a-z]+)/);
    const date = dateStatusMatch ? dateStatusMatch[1] : new Date().toISOString().split('T')[0];
    const status = dateStatusMatch ? dateStatusMatch[2] : 'active';

    // Extract tags
    const tagsMatch = block.match(/🏷️\s+\[([^\]]*)\]/);
    const tags = tagsMatch && tagsMatch[1] ? tagsMatch[1].split(', ').filter(t => t.trim()) : [];

    return {
      id: Date.now() + Math.random(),
      title,
      decision_type: type.toLowerCase(),
      impact_level: impact,
      rationale,
      status,
      created_at: `${date}T00:00:00.000Z`,
      updated_at: `${date}T00:00:00.000Z`,
      tags,
      problem: rationale,
      decision: title
    };
  } catch (error) {
    console.error('Error parsing decision block:', error);
    return null;
  }
}

const server = http.createServer(async (req, res) => {
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
      service: 'Simple HTTP-MCP Bridge',
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

    req.on('end', async () => {
      try {
        const requestData = body ? JSON.parse(body) : {};
        const toolArgs = requestData.arguments || requestData;

        console.log(`🔄 HTTP→MCP: ${toolName}`, Object.keys(toolArgs || {}));

        // Call actual AIDIS MCP server instead of returning mock data
        const mcpResponse = await callRealAidisMcp(toolName, toolArgs);
        
        console.log(`✅ Real AIDIS response for ${toolName}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mcpResponse));

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
  console.log('🌉 Simple HTTP-MCP Bridge Started');
  console.log(`📡 Listening on: http://localhost:${PORT}`);
  console.log(`🔄 Providing mock responses for AIDIS Command Dev`);
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
  console.log(`\n📴 Received ${signal}, shutting down HTTP-MCP bridge...`);
  server.close(() => {
    console.log('✅ Bridge shutdown complete');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
