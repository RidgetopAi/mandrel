#!/usr/bin/env node

// HTTP to MCP Bridge for Phase 2 Server
// Bridges HTTP requests to the Phase 2 AIDIS MCP server via stdio

const { spawn } = require('child_process');
const express = require('express');
const cors = require('cors');

// Create the bridge
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

let mcpProcess = null;
let isInitialized = false;
let requestId = 1;
let pendingRequests = new Map();

// Start MCP server process
function startMCPProcess() {
  console.log('Starting Phase 2 MCP server...');
  
  mcpProcess = spawn('npx', ['tsx', 'aidis-rebuild-p2.ts'], {
    cwd: '/home/ridgetop/aidis',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { 
      ...process.env, 
      AMP_CONNECTING: 'true', 
      AIDIS_FORCE_STDIO: 'true' 
    }
  });

  mcpProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    
    lines.forEach(line => {
      try {
        const response = JSON.parse(line);
        console.log('MCP Response:', JSON.stringify(response, null, 2));
        
        if (response.id && pendingRequests.has(response.id)) {
          const { resolve } = pendingRequests.get(response.id);
          pendingRequests.delete(response.id);
          resolve(response);
        }
      } catch (e) {
        // Ignore non-JSON lines
      }
    });
  });

  mcpProcess.stderr.on('data', (data) => {
    console.log('MCP stderr:', data.toString());
  });

  mcpProcess.on('close', (code) => {
    console.log(`MCP process closed with code ${code}`);
    mcpProcess = null;
    isInitialized = false;
  });

  // Initialize the MCP connection
  setTimeout(async () => {
    try {
      await sendMCPRequest({
        jsonrpc: "2.0",
        id: requestId++,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          clientInfo: { name: "http-bridge", version: "1.0.0" }
        }
      });
      isInitialized = true;
      console.log('Phase 2 MCP server initialized successfully');
    } catch (error) {
      console.error('Failed to initialize MCP server:', error);
    }
  }, 500);
}

// Send request to MCP server
function sendMCPRequest(message) {
  return new Promise((resolve, reject) => {
    if (!mcpProcess) {
      reject(new Error('MCP process not running'));
      return;
    }

    pendingRequests.set(message.id, { resolve, reject });
    
    mcpProcess.stdin.write(JSON.stringify(message) + '\n');
    
    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingRequests.has(message.id)) {
        pendingRequests.delete(message.id);
        reject(new Error('Request timeout'));
      }
    }, 30000);
  });
}

// HTTP endpoints
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    mcpConnected: isInitialized,
    phase: 'Phase 2 Enhanced',
    tools: 9
  });
});

app.get('/tools', async (req, res) => {
  try {
    if (!isInitialized) {
      return res.status(503).json({ error: 'MCP server not initialized' });
    }

    const response = await sendMCPRequest({
      jsonrpc: "2.0",
      id: requestId++,
      method: "tools/list"
    });

    res.json(response.result || response);
  } catch (error) {
    console.error('Error getting tools:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/mcp/tools/:toolName', async (req, res) => {
  try {
    if (!isInitialized) {
      return res.status(503).json({ error: 'MCP server not initialized' });
    }

    const { toolName } = req.params;
    const args = req.body || {};

    const response = await sendMCPRequest({
      jsonrpc: "2.0",
      id: requestId++,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args
      }
    });

    res.json(response.result || response);
  } catch (error) {
    console.error(`Error calling tool ${req.params.toolName}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Start everything
startMCPProcess();

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Phase 2 HTTP-MCP Bridge running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  if (mcpProcess) {
    mcpProcess.kill();
  }
  process.exit(0);
});
