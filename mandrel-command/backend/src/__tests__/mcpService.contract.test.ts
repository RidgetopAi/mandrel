import http from 'http';
import { McpService } from '../services/mcp';

describe('McpService contract interaction', () => {
  let server: http.Server;
  let port: number;
  let originalPort: string | undefined;

  // Queue of response handlers to run sequentially for each incoming request
  const handlers: Array<(req: http.IncomingMessage, res: http.ServerResponse) => void> = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const handler = handlers.shift();
      if (handler) {
        handler(req, res);
      } else {
        res.statusCode = 500;
        res.end('No handler registered');
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });

    const address = server.address();
    if (address && typeof address === 'object') {
      port = address.port;
    } else {
      throw new Error('Failed to obtain stub server port');
    }

    originalPort = process.env.AIDIS_MCP_PORT;
    process.env.AIDIS_MCP_PORT = String(port);
  });

  afterAll(async () => {
    process.env.AIDIS_MCP_PORT = originalPort;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  afterEach(() => {
    handlers.length = 0;
  });

  it('interprets success envelopes and returns parsed data', async () => {
    handlers.push((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        // Ensure request body contains MCP arguments envelope
        expect(JSON.parse(body)).toEqual({ arguments: { message: 'contract regression' } });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            result: {
              content: [
                {
                  type: 'text',
                  text: '🏓 AIDIS Pong! Message: "contract regression" | Time: 2025-09-16T00:00:00Z | Status: Operational',
                },
              ],
            },
          }),
        );
      });
    });

    const result = await McpService.callTool('aidis_ping', { message: 'contract regression' });
    expect(result.success).toBe(true);
    expect(result.data).toContain('AIDIS Pong! Message');
  });

  it('propagates MCP error envelopes as failures', async () => {
    handlers.push((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'MCP validation failed: test error' }));
    });

    const result = await McpService.callTool('mandrel_ping', {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/MCP validation failed/);
  });

  it('propagates HTTP error responses', async () => {
    handlers.push((_req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'SERVER DOWN' }));
    });

    const result = await McpService.callTool('mandrel_ping', {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/HTTP 500/);
  });
});