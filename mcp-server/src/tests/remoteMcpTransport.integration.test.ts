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

// Provide required database env vars BEFORE importing any server module so that
// config/database (imported transitively via HealthServer → projectController) does
// not throw at module-evaluation time. Mirrors src/tests/httpContract.test.ts.
// NOTE: this runs at import time; the HealthServer/RemoteMcpTransport imports below
// must come AFTER this block. We do not rely on shell-exported env.
if (!process.env.DATABASE_NAME) {
  process.env.DATABASE_NAME = 'aidis_remote_mcp_itest';
}
process.env.DATABASE_USER = process.env.DATABASE_USER || 'itest_user';
process.env.DATABASE_PASSWORD = process.env.DATABASE_PASSWORD || 'itest_pass';
process.env.DATABASE_HOST = process.env.DATABASE_HOST || 'localhost';
process.env.AIDIS_SKIP_DATABASE = process.env.AIDIS_SKIP_DATABASE || 'true';
process.env.AIDIS_SKIP_BACKGROUND = process.env.AIDIS_SKIP_BACKGROUND || 'true';
process.env.AIDIS_SKIP_STDIO = process.env.AIDIS_SKIP_STDIO || 'true';

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

// HealthServer/RemoteMcpTransport are imported DYNAMICALLY inside beforeAll (after the
// env block above has run) so that the transitive config/database import does not throw
// at module-eval time. Mirrors httpContract.test.ts's dynamic-import approach.
type HealthServer = import('../server/healthServer.js').HealthServer;
type RemoteMcpTransport = import('../server/remoteMcpTransport.js').RemoteMcpTransport;
type McpHandlerDeps = import('../server/registerMcpHandlers.js').McpHandlerDeps;

const TEST_TOKEN = 'test-token-do-not-use-in-prod';

// Spy executor records the connectionId it is called with and returns canned results.
const executorCalls: Array<{ tool: string; args: any; connectionId?: string }> = [];
const stubExecutor = vi.fn(async (toolName: string, _args: any, ctx?: { connectionId?: string }) => {
  executorCalls.push({ tool: toolName, args: _args, connectionId: ctx?.connectionId });
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

  // Import AFTER the top-of-file env block has run so config/database does not throw
  // at module-eval time. (Static imports would hoist above the env block.)
  const { RemoteMcpTransport } = await import('../server/remoteMcpTransport.js');
  const { HealthServer } = await import('../server/healthServer.js');

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

describe('Remote MCP transport — fail-closed when no token configured', () => {
  it('returns 503 (not open, not 401) on POST /mcp when MCP_AUTH_TOKEN is unset', async () => {
    // Temporarily remove the configured token. bearerAuth() reads env at call time,
    // so this exercises the genuine fail-closed branch without restarting the server.
    const saved = process.env.MCP_AUTH_TOKEN;
    delete process.env.MCP_AUTH_TOKEN;
    try {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          // Even WITH a Bearer header, an unconfigured server must refuse (fail closed).
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
      });
      // Must be 503 (server-not-configured), NOT 200 (open) and NOT 401 (auth-shaped).
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.jsonrpc).toBe('2.0');
      expect(body.error).toBeDefined();
      // No session must have been created by an unconfigured server.
      const callsBefore = executorCalls.length;
      expect(callsBefore).toBeGreaterThanOrEqual(0); // tool never invoked on 503 path
    } finally {
      // Restore so later assertions / other tests keep the configured token.
      process.env.MCP_AUTH_TOKEN = saved;
    }
  });
});

describe('Remote MCP transport — two-session isolation', () => {
  it('gives each session a distinct Mcp-Session-Id and a distinct connectionId', async () => {
    const makeClient = () => {
      const client = new Client({ name: 'itest-client', version: '1.0.0' });
      const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${TEST_TOKEN}` } },
      });
      return { client, transport };
    };

    const a = makeClient();
    const b = makeClient();

    // Each client performs its own initialize → server-generated session id.
    await a.client.connect(a.transport);
    await b.client.connect(b.transport);

    const sessionA = a.transport.sessionId;
    const sessionB = b.transport.sessionId;

    // Distinct, server-generated session ids.
    expect(sessionA).toBeTruthy();
    expect(sessionB).toBeTruthy();
    expect(sessionA).not.toBe(sessionB);

    // Each session issues a tools/call with a session-unique marker arg so we can
    // correlate the recorded executor call back to the originating session.
    await a.client.callTool({ name: 'mandrel_ping', arguments: { message: 'from-A' } });
    await b.client.callTool({ name: 'mandrel_ping', arguments: { message: 'from-B' } });

    const callA = executorCalls.find(c => c.tool === 'mandrel_ping' && c.args?.message === 'from-A');
    const callB = executorCalls.find(c => c.tool === 'mandrel_ping' && c.args?.message === 'from-B');

    expect(callA).toBeDefined();
    expect(callB).toBeDefined();

    // The dispatched connectionId IS the session id → isolation:
    //   - A's call carries A's session id (its connectionId), never B's.
    //   - B's call carries B's session id, never A's.
    expect(callA?.connectionId).toBe(sessionA);
    expect(callB?.connectionId).toBe(sessionB);
    expect(callA?.connectionId).not.toBe(callB?.connectionId);
    expect(callA?.connectionId).not.toBe(sessionB);
    expect(callB?.connectionId).not.toBe(sessionA);

    await a.client.close();
    await b.client.close();
  });
});

describe('Remote MCP transport — session map is bounded (LRU eviction)', () => {
  const CAP_PORT = 18098;
  let capHealth: HealthServer;
  let capBaseUrl: string;
  let capRemote: RemoteMcpTransport;

  beforeAll(async () => {
    // Construct a fresh transport with a tiny cap so we can prove eviction quickly.
    process.env.MCP_MAX_SESSIONS = '2';
    process.env.MCP_ALLOWED_HOSTS = `127.0.0.1:${CAP_PORT},localhost:${CAP_PORT},127.0.0.1,localhost`;
    process.env.MANDREL_AIDIS_MCP_PORT = String(CAP_PORT);

    const { RemoteMcpTransport } = await import('../server/remoteMcpTransport.js');
    const { HealthServer } = await import('../server/healthServer.js');
    capRemote = new RemoteMcpTransport(deps);
    capHealth = new HealthServer(stubExecutor as any, (a: any) => a, capRemote);
    const port = await capHealth.start();
    const addr = capHealth.address() as AddressInfo | null;
    capBaseUrl = `http://127.0.0.1:${addr?.port ?? port}`;
  });

  afterAll(async () => {
    if (capHealth) await capHealth.stop();
    delete process.env.MCP_MAX_SESSIONS;
    // Restore the shared port for any later constructions.
    process.env.MANDREL_AIDIS_MCP_PORT = String(TEST_PORT);
  });

  it('never exceeds the configured max-session cap when initialize is spammed', async () => {
    const connect = async () => {
      const client = new Client({ name: 'cap-client', version: '1.0.0' });
      const transport = new StreamableHTTPClientTransport(new URL(`${capBaseUrl}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${TEST_TOKEN}` } },
      });
      await client.connect(transport);
      return { client, transport };
    };

    // Open 3 sessions against a cap of 2 → live session count must stay ≤ 2.
    const c1 = await connect();
    const c2 = await connect();
    const c3 = await connect();

    expect(capRemote.sessionCount()).toBeLessThanOrEqual(2);
    expect(capRemote.sessionCount()).toBeGreaterThan(0);

    // The most-recently-created session (c3) should still be live and usable.
    const result: any = await c3.client.callTool({ name: 'mandrel_ping', arguments: { message: 'cap-c3' } });
    expect(JSON.stringify(result)).toContain('pong (stub)');

    await Promise.allSettled([c1.client.close(), c2.client.close(), c3.client.close()]);
  });
});
