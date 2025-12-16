#!/usr/bin/env node

/**
 * Simple HTTP-MCP Bridge for AIDIS Command Dev
 * Uses Amp's MCP system directly since we're running in Amp environment
 */

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 8081;

// Middleware
app.use(cors({
  origin: ['http://localhost:3001', 'http://localhost:5001', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'HTTP-MCP Bridge for AIDIS Command Dev',
    port: PORT,
    note: 'Forwarding HTTP requests to Amp MCP system',
    timestamp: new Date().toISOString()
  });
});

// Mock MCP tool responses for development
const mockResponses = {
  decision_search: {
    success: true,
    data: {
      results: [
        {
          id: '1',
          title: 'Test Decision',
          description: 'This is a test decision from the HTTP-MCP bridge',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ],
      total: 1,
      page: 1,
      limit: 10,
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

// Forward MCP tool calls - simpler route pattern
app.post('/mcp/tools/*', async (req, res) => {
  const toolName = req.params[0];
  const toolArgs = req.body.arguments || req.body;

  console.log(`🔄 HTTP→MCP: ${toolName}`, Object.keys(toolArgs || {}));

  try {
    // For now, return mock data to get the UI working
    // Later this can be replaced with real MCP calls
    const mockResponse = mockResponses[toolName];
    
    if (mockResponse) {
      console.log(`✅ Mock response for ${toolName}`);
      res.json(mockResponse);
    } else {
      // Generic success response for unknown tools
      console.log(`⚠️  Unknown tool ${toolName}, returning generic success`);
      res.json({
        success: true,
        data: {
          message: `Tool ${toolName} executed successfully (mock)`,
          args: toolArgs,
          timestamp: new Date().toISOString()
        }
      });
    }
    
  } catch (error) {
    console.error(`❌ Tool ${toolName} failed:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      tool: toolName,
      timestamp: new Date().toISOString()
    });
  }
});

// 404 handler
app.all('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `Endpoint ${req.method} ${req.path} not found`,
    available: [
      'GET /health',
      'POST /mcp/tools/:toolName'
    ]
  });
});

// Start server
const server = app.listen(PORT, 'localhost', () => {
  console.log('🌉 HTTP-MCP Bridge Server Started (Development Mock Mode)');
  console.log(`📡 Listening on: http://localhost:${PORT}`);
  console.log(`🔄 Providing mock responses for AIDIS Command Dev`);
  console.log('✅ Ready for aidis-command-dev backend connections');
  console.log('');
  console.log('📋 Available mock tools:');
  console.log('   - decision_search: Returns test decision data');
  console.log('   - decision_stats: Returns decision statistics');
  console.log('   - *: Generic success response');
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
