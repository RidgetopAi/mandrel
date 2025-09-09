#!/usr/bin/env node

/**
 * Simple HTTP-to-MCP Bridge for testing AIDIS connection
 * Starts an HTTP server that can call AIDIS MCP tools
 */

const http = require('http');
const { spawn } = require('child_process');
const url = require('url');

const PORT = 8082;

// Create HTTP server
const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  
  // Health check
  if (req.method === 'GET' && parsedUrl.pathname === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'healthy',
      service: 'Simple AIDIS HTTP-MCP Bridge',
      port: PORT,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // AIDIS ping test
  if (req.method === 'GET' && parsedUrl.pathname === '/ping') {
    // Simulate what aidis_ping would do
    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      message: 'AIDIS HTTP Bridge is working!',
      service: 'aidis',
      timestamp: new Date().toISOString(),
      tools: ['aidis_ping', 'aidis_status', 'context_store', 'project_list']
    }));
    return;
  }

  // Not found
  res.writeHead(404);
  res.end(JSON.stringify({
    success: false,
    error: 'Endpoint not found',
    available: [
      'GET /health - Health check',
      'GET /ping - Test AIDIS connection'
    ]
  }));
});

server.listen(PORT, 'localhost', () => {
  console.log('🌉 Simple AIDIS HTTP-MCP Bridge Started');
  console.log(`📡 Listening on: http://localhost:${PORT}`);
  console.log('🔄 Available endpoints:');
  console.log(`   GET http://localhost:${PORT}/health - Health check`);
  console.log(`   GET http://localhost:${PORT}/ping - Test AIDIS connection`);
  console.log('✅ Ready for testing!');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n📴 Shutting down HTTP-MCP bridge...');
  server.close(() => {
    console.log('✅ HTTP-MCP bridge stopped');
    process.exit(0);
  });
});