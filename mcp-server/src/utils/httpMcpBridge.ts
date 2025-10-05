/**
 * HTTP-to-MCP Bridge Server for AIDIS Command Dev Environment
 * 
 * Provides HTTP REST API on port 8081 that forwards requests to AIDIS MCP system
 * This allows aidis-command-dev backend to use HTTP while MCP uses stdio protocol
 */

import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import createSessionRouter from '../api/v2/sessionRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class HttpMcpBridge {
  private app: express.Application;
  private server: any;
  private port: number;

  constructor(port: number = 8081) {
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(cors({
      origin: ['http://localhost:3001', 'http://localhost:5001'],
      credentials: true
    }));
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        service: 'HTTP-MCP Bridge',
        port: this.port,
        timestamp: new Date().toISOString()
      });
    });

    // Mount session analytics REST API routes
    const sessionRouter = createSessionRouter();
    this.app.use('/api/v2/sessions', sessionRouter);
    console.log('📊 Session Analytics API mounted: /api/v2/sessions/* (8 endpoints)');

    // MCP tool forwarding endpoint
    this.app.post('/mcp/tools/:toolName', async (req, res) => {
      const { toolName } = req.params;
      const { arguments: toolArgs } = req.body;

      console.log(`🔄 HTTP→MCP: ${toolName}`, toolArgs ? Object.keys(toolArgs) : 'no args');

      try {
        const result = await this.callMcpTool(toolName, toolArgs || {});
        
        console.log(`✅ MCP→HTTP: ${toolName} success`);
        res.json({
          success: true,
          data: result,
          tool: toolName,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        const err = error as Error;
        console.error(`❌ MCP→HTTP: ${toolName} failed:`, err.message);
        res.status(500).json({
          success: false,
          error: err.message,
          tool: toolName,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Catch all - method not allowed
    this.app.all('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: `Endpoint ${req.method} ${req.path} not found`,
        available: [
          'GET /health - Bridge health check',
          'POST /mcp/tools/:toolName - Forward to MCP tool'
        ]
      });
    });
  }

  /**
   * Call MCP tool using Amp's MCP connection
   */
  private async callMcpTool(toolName: string, args: any): Promise<any> {
    return new Promise((resolve, reject) => {
      // Use the mcp__aidis__ prefix that Amp uses for AIDIS MCP tools
      // const mcpToolName = `mcp__aidis__${toolName}`;

      // Create a JSON-RPC request to Amp's MCP system
      // const _request = {
      //   jsonrpc: '2.0',
      //   id: Date.now(),
      //   method: 'tools/call',
      //   params: {
      //     name: mcpToolName,
      //     arguments: args
      //   }
      // };

      // Since we're running inside Amp's environment, we can use the MCP tools directly
      // by simulating the tool call through a child process that invokes the MCP server
      const serverPath = path.join(__dirname, '..', 'server.ts');
      const child = spawn('npx', ['tsx', '-e', `
        // Import and call the MCP tool directly
        import('${serverPath.replace(/\\/g, '/')}').then(async (module) => {
          try {
            // This is a simplified approach - in a real implementation we'd need
            // to properly initialize the MCP server and call the tool handler
            console.log('MCP_RESULT_START');
            console.log(JSON.stringify({ success: true, data: 'Tool forwarding not yet implemented' }));
            console.log('MCP_RESULT_END');
            process.exit(0);
          } catch (error) {
            console.log('MCP_ERROR_START');
            console.log(JSON.stringify({ success: false, error: error.message }));
            console.log('MCP_ERROR_END');
            process.exit(1);
          }
        });
      `], {
        cwd: path.join(__dirname, '..', '..'),
        stdio: 'pipe'
      });

      let output = '';
      let errorOutput = '';

      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          try {
            // For now, return a placeholder response indicating the bridge is working
            // but tool forwarding needs proper implementation
            resolve({
              bridgeStatus: 'working',
              tool: toolName,
              args: args,
              note: 'HTTP-MCP Bridge is running but tool forwarding needs implementation',
              timestamp: new Date().toISOString()
            });
          } catch (parseError) {
            const err = parseError as Error;
            reject(new Error(`Failed to parse MCP response: ${err.message}`));
          }
        } else {
          reject(new Error(`MCP tool failed with code ${code}: ${errorOutput}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to spawn MCP process: ${error.message}`));
      });
    });
  }

  /**
   * Start the HTTP-MCP bridge server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, 'localhost', () => {
        console.log('🌉 HTTP-MCP Bridge Server Started');
        console.log(`📡 Listening on: http://localhost:${this.port}`);
        console.log(`🔄 Forwarding: HTTP → AIDIS MCP → HTTP`);
        console.log('✅ Ready for aidis-command-dev backend connections');
        resolve();
      });

      this.server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${this.port} is already in use`));
        } else {
          reject(error);
        }
      });
    });
  }

  /**
   * Stop the HTTP-MCP bridge server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('📴 HTTP-MCP Bridge Server Stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const bridge = new HttpMcpBridge();
  
  const shutdown = async (signal: string) => {
    console.log(`\n📴 Received ${signal}, shutting down HTTP-MCP bridge...`);
    await bridge.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  bridge.start().catch((error) => {
    console.error('❌ Failed to start HTTP-MCP Bridge:', error.message);
    process.exit(1);
  });
}

export default HttpMcpBridge;
