#!/usr/bin/env node

/**
 * HTTP-MCP Bridge for AIDIS Command Dev Environment
 * Simple Express server that forwards HTTP requests to Amp's MCP system
 */

const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

class HttpMcpBridge {
  constructor(port = 8081) {
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(cors({
      origin: ['http://localhost:3001', 'http://localhost:5001', 'http://localhost:3000'],
      credentials: true
    }));
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        service: 'HTTP-MCP Bridge for AIDIS Command Dev',
        port: this.port,
        timestamp: new Date().toISOString()
      });
    });

    // Forward MCP tool calls
    this.app.post('/mcp/tools/:toolName', async (req, res) => {
      const { toolName } = req.params;
      const toolArgs = req.body.arguments || req.body;

      console.log(`🔄 HTTP→MCP: ${toolName}`, Object.keys(toolArgs || {}));

      try {
        const result = await this.callMcpViaSystemD(toolName, toolArgs);
        
        console.log(`✅ MCP→HTTP: ${toolName} success`);
        res.json({
          success: true,
          data: result,
          tool: toolName,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error(`❌ MCP→HTTP: ${toolName} failed:`, error.message);
        res.status(500).json({
          success: false,
          error: error.message,
          tool: toolName,
          timestamp: new Date().toISOString()
        });
      }
    });

    // 404 handler
    this.app.all('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: `Endpoint ${req.method} ${req.path} not found`,
        available: [
          'GET /health',
          'POST /mcp/tools/:toolName'
        ]
      });
    });
  }

  /**
   * Call MCP tool via SystemD service HTTP endpoint
   */
  async callMcpViaSystemD(toolName, args) {
    const systemdUrl = 'http://localhost:8080';
    const toolUrl = `${systemdUrl}/tools/${toolName}`;
    
    try {
      // Use curl to make the request to the SystemD service
      const curlCommand = `curl -s -X POST "${toolUrl}" -H "Content-Type: application/json" -d '${JSON.stringify(args || {})}'`;
      
      const { stdout, stderr } = await execAsync(curlCommand);
      
      if (stderr) {
        throw new Error(`SystemD MCP call failed: ${stderr}`);
      }

      // Try to parse JSON response
      try {
        const result = JSON.parse(stdout);
        return result;
      } catch (parseError) {
        // If not JSON, return as text
        return { result: stdout.trim() };
      }
      
    } catch (error) {
      throw new Error(`MCP tool '${toolName}' failed: ${error.message}`);
    }
  }

  async start() {
    return new Promise((resolve, reject) => {
      const server = this.app.listen(this.port, 'localhost', () => {
        console.log('🌉 HTTP-MCP Bridge Server Started');
        console.log(`📡 Listening on: http://localhost:${this.port}`);
        console.log(`🔄 Forwarding: HTTP → SystemD MCP (port 8080) → HTTP`);
        console.log('✅ Ready for aidis-command-dev backend connections');
        resolve(server);
      });

      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${this.port} is already in use`));
        } else {
          reject(error);
        }
      });
    });
  }
}

// Start the bridge if run directly
if (require.main === module) {
  const bridge = new HttpMcpBridge();
  
  const shutdown = (signal) => {
    console.log(`\n📴 Received ${signal}, shutting down HTTP-MCP bridge...`);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  bridge.start().catch((error) => {
    console.error('❌ Failed to start HTTP-MCP Bridge:', error.message);
    process.exit(1);
  });
}

module.exports = HttpMcpBridge;
