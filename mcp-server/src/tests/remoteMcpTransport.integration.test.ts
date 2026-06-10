/**
 * Integration test: Remote Streamable HTTP MCP transport + bearer auth.
 *
 * Boots the real HealthServer Express app with a real RemoteMcpTransport mounted,
 * but injects a STUB tool executor so we exercise the transport/auth/protocol wiring
 * WITHOUT pulling the embeddings/background-services (sharp) path that the full
 * dist/main.js boot requires. Tool logic itself is covered elsewhere; here we prove:
 *   - missing token  → 401
 *   - wrong token    → 401
 *   - valid token    → full MCP handshake (initialize → tools/list → tools/call)
 *   - the stub executor receives a per-session connectionId (session isolation)
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// The global vitest.setup.ts mocks 'crypto' with ONLY randomUUID, which breaks any
// real crypto use (createHash/timingSafeEqual in bearerAuth, randomUUID in the
// transport). Restore the REAL crypto module for this integration test so we exercise
// the genuine auth + session-id path.
vi.mock('crypto', async (importActual) => await importActual<typeof import('crypto')>());
vi.mock('node:crypto', async (importActual) => await importActual<typeof import('node:crypto')>());

import { HealthServer } from '../server/healthServer.js';
import { RemoteMcpTransport } from '../server/remoteMcpTransport.js';
import type { McpHandlerDeps } from '../server/registerMcpHandlers.js';

const TEST_TOKEN = 'test-token-do-not-use-in-prod';

// Spy executor records the connectionId it is called with and returns canned results.
const executorCalls: Array<{ tool: string; connectionId?: string }> = [];
const stubExecutor = vi.fn(async (toolName: string, _args: any, ctx?: { connectionId?: string }) => {
  executorCalls.push({ tool: toolName, connectionId: ctx?.connectionId });
  if (toolName === 'mandrel_ping') {
    return { content: [{ type: 'text', text: 'pong (stub)' }] };
  }
  return { content: [{ type: 'text', text: `stub:${toolName}` }] };
});

const deps: McpHandlerDeps = {
  executeMcpTool: stubExecutor as any,
  deserializeParameters: (a: any) => a,
  getServerStatus: async () => ({ version: 'test' }),
};

let health: HealthServer;
let baseUrl: string;

// Fixed test port so the host:port can be pre-listed in MCP_ALLOWED_HOSTS
// (the SDK's DNS-rebinding protection validates the full Host header incl. port).
const TEST_PORT = 18097;

beforeAll(async () => {
  process.env.MCP_AUTH_TOKEN = TEST_TOKEN;
  process.env.MCP_ALLOWED_HOSTS = `127.0.0.1:${TEST_PORT},localhost:${TEST_PORT},127.0.0.1,localhost`;
  process.env.MANDREL_AIDIS_MCP_PORT = String(TEST_PORT);
  process.env.AIDIS_PORT_REGISTRY = '/tmp/mandrel-itest-port-registry.json';

  // Construct AFTER env is set so allowedHosts include the test host:port.
  const remoteMcp = new RemoteMcpTransport(deps);
  health = new HealthServer(stubExecutor as any, (a: any) => a, remoteMcp);
  const port = await health.start();
  const addr = health.address() as AddressInfo | null;
  const actualPort = addr?.port ?? port;
  baseUrl = `http://127.0.0.1:${actualPort}`;
});

afterAll(async () => {
  if (health) await health.stop();
  delete process.env.MCP_AUTH_TOKEN;
});

describe('Remote MCP transport — bearer auth', () => {
  it('rejects POST /mcp with NO token (401, JSON-RPC error body)', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.jsonrpc).toBe('2.0');
  });

  it('rejects POST /mcp with WRONG token (401)', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer not-the-real-token',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

describe('Remote MCP transport — full MCP handshake with valid token', () => {
  it('initializes, lists tools, and calls mandrel_ping over Streamable HTTP', async () => {
    const client = new Client({ name: 'itest-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: {
        headers: { Authorization: `Bearer ${TEST_TOKEN}` },
      },
    });

    await client.connect(transport); // performs initialize

    // serverInfo from initialize
    const serverInfo = client.getServerVersion();
    expect(serverInfo?.name).toBe('aidis-mcp-server');

    // tools/list
    const tools = await client.listTools();
    const names = tools.tools.map(t => t.name);
    expect(names).toContain('mandrel_ping');
    expect(names.length).toBeGreaterThan(10);
    // Disabled tools must be filtered out
    expect(names).not.toContain('complexity_analyze');

    // tools/call on a safe read-only tool
    const result: any = await client.callTool({ name: 'mandrel_ping', arguments: { message: 'hi' } });
    expect(JSON.stringify(result)).toContain('pong (stub)');

    // The stub executor must have received a non-stdio per-session connectionId
    const pingCall = executorCalls.find(c => c.tool === 'mandrel_ping');
    expect(pingCall).toBeDefined();
    expect(pingCall?.connectionId).toBeTruthy();
    expect(pingCall?.connectionId).not.toBe('stdio');

    await client.close();
  });
});
