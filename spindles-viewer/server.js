#!/usr/bin/env node
/**
 * Quick test server for spindles viewer
 * Serves fake spindle data via Server-Sent Events (SSE)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3737;

// Production mode - no test data
let spindleCount = 0;
const sseClients = []; // Track all SSE connections

// Broadcast spindle to all connected clients
function broadcastSpindle(spindle) {
  spindleCount++;
  const data = JSON.stringify({ ...spindle, count: spindleCount });
  const message = `data: ${data}\n\n`;

  sseClients.forEach(client => {
    try {
      client.write(message);
    } catch (err) {
      console.error('Error writing to client:', err.message);
    }
  });

  console.log(`📡 Broadcast spindle #${spindleCount} to ${sseClients.length} client(s)`);
}

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Serve the viewer HTML
  if (req.url === '/' || req.url === '/index.html') {
    const htmlPath = path.join(__dirname, 'viewer.html');
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('viewer.html not found');
    }
    return;
  }

  // SSE endpoint for live spindles
  if (req.url === '/spindles/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // Add to clients array
    sseClients.push(res);
    console.log(`✅ New SSE client connected (${sseClients.length} total)`);

    // Send initial connection message
    res.write('data: {"type":"connected","message":"Spindles stream connected - waiting for real AI thinking blocks..."}\n\n');

    // Cleanup on disconnect
    req.on('close', () => {
      const index = sseClients.indexOf(res);
      if (index > -1) {
        sseClients.splice(index, 1);
      }
      console.log(`🔌 Client disconnected (${sseClients.length} remaining)`);
    });

    return;
  }

  // POST endpoint for receiving real spindles from Forge
  if (req.url === '/spindles/post' && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log(`📥 Received spindle from ${data.spindle?.runId || 'unknown'}`);

        // Broadcast to all connected clients
        broadcastSpindle(data);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: spindleCount }));
      } catch (err) {
        console.error('❌ Error parsing spindle:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });

    return;
  }

  // 404 for everything else
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║  🎡 SPINDLES VIEWER - LIVE PRODUCTION MODE    ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log('');
  console.log(`🌐 Server running at: http://localhost:${PORT}`);
  console.log(`📡 SSE stream at:     http://localhost:${PORT}/spindles/stream`);
  console.log(`📥 POST endpoint:     http://localhost:${PORT}/spindles/post`);
  console.log('');
  console.log('💡 Open in browser:   http://localhost:3737');
  console.log('🤖 Waiting for real AI thinking blocks...');
  console.log('');
  console.log('Press Ctrl+C to stop');
  console.log('');
});
