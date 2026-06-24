/**
 * BA-1 integration test: better-auth OAuth 2.1 authorization-server on the mcp-server.
 *
 * Boots the real HealthServer Express app with OAuth ENABLED + a real RemoteMcpTransport
 * + a real better-auth instance against the disposable, fully-migrated CI DB (the same
 * DB ci.sh provisions + migrates and exports as DATABASE_* — the better-auth OAuth schema
 * is migration 052, so it is present after the standard migrate), and proves the five
 * required behaviors WITHOUT a browser:
 *
 *   (a) REGRESSION / BACKWARD-COMPAT GATE: no token → 401; valid MCP_AUTH_TOKEN → /mcp
 *       authorizes exactly as today (the existing static-bearer path is byte-for-byte intact).
 *   (b) METADATA: /.well-known/oauth-authorization-server, /.well-known/openid-configuration,
 *       and /.well-known/oauth-protected-resource return the correct fields.
 *   (c) DCR: dynamic client registration succeeds.
 *   (d) OAUTH ON /mcp: mint a real access token via better-auth in-test (no browser),
 *       present it on /mcp → authorized; wrong audience/issuer → 401.
 *   (e) (covered by requireRemoteMcpEnv.contract.test.ts — boot fails-closed without
 *       MCP_AUTH_TOKEN; asserted here too at the guard level for completeness.)
 *
 * Token minting bypasses the browser by signing a JWT with the SAME JWKS key better-auth
 * generated (read from the scratch DB jwks table), so verifyAccessToken's local JWKS
 * verification accepts it — exercising the genuine /mcp dual-path guard end-to-end.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { AddressInfo } from 'node:net';

// ---- Env MUST be set before importing any server/auth/config module (module-eval reads it).
// CI-PORTABLE DB SELECTION (configs-not-hardcoded): point the test at the DB ci.sh
// provisions + migrates and exports as DATABASE_* (the better-auth OAuth schema is
// migration 052, so it's present after the standard migrate). Precedence:
//   1. BA1_DB_* explicit override (a manual run can pin a specific scratch DB)
//   2. the ambient DATABASE_* exported by ci.sh / provision-test-db.sh
//   3. a last-resort local default (ci_better_auth_ba1) so a bare `vitest` run
//      against a hand-provisioned DB still works exactly as before.
// No hardcoded scratch DB is forced over the CI-provided one — that was the
// non-portability bug (the DB only existed because a human created it).
const SCRATCH_DB = process.env.BA1_DB_NAME || process.env.DATABASE_NAME || 'ci_better_auth_ba1';
const SCRATCH_USER = process.env.BA1_DB_USER || process.env.DATABASE_USER || 'ci_role_better_auth_ba1';
const SCRATCH_PASS = process.env.BA1_DB_PASS || process.env.DATABASE_PASSWORD || 'throwaway_7320f4cd5b6e1346';
// 19097: deliberately OUTSIDE the live fleet's docker-proxy port ranges (13xxx/15xxx/
// 16xxx/18080-18099 are bound by running tenant containers — do NOT collide with them).
const TEST_PORT = 19097;
const TEST_TOKEN = 'static-mcp-token-ba1-test';
const ISSUER = `http://127.0.0.1:${TEST_PORT}`; // baseURL / public origin
const BASE_PATH = '/api/auth';
// GROUND TRUTH (better-auth 1.6.20): the OAuth issuer identifier the AS advertises +
// mints as the token `iss` is baseURL + basePath, NOT the bare origin.
const ISSUER_IDENTIFIER = `${ISSUER}${BASE_PATH}`;
const RESOURCE = `${ISSUER}/mcp`;

process.env.DATABASE_NAME = SCRATCH_DB;
process.env.DATABASE_USER = SCRATCH_USER;
process.env.DATABASE_PASSWORD = SCRATCH_PASS;
process.env.DATABASE_HOST = process.env.DATABASE_HOST || 'localhost';
process.env.DATABASE_PORT = process.env.DATABASE_PORT || '5432';
process.env.AIDIS_SKIP_BACKGROUND = 'true';
process.env.AIDIS_SKIP_STDIO = 'true';

process.env.MANDREL_OAUTH_ENABLED = 'true';
process.env.MANDREL_OAUTH_ISSUER = ISSUER;
process.env.MANDREL_OAUTH_RESOURCE = RESOURCE;
process.env.MANDREL_OAUTH_SECRET = 'ba1-test-secret-not-for-prod-0123456789abcdef';
process.env.MCP_AUTH_TOKEN = TEST_TOKEN;
process.env.MCP_ALLOWED_HOSTS = `127.0.0.1:${TEST_PORT},localhost:${TEST_PORT},127.0.0.1,localhost`;
process.env.MANDREL_AIDIS_MCP_PORT = String(TEST_PORT);
process.env.AIDIS_PORT_REGISTRY = '/tmp/mandrel-ba1-port-registry.json';

// vitest.setup mocks crypto with ONLY randomUUID; restore real crypto for the genuine
// JWT/JWKS + constant-time-compare paths.
vi.mock('crypto', async (importActual) => await importActual<typeof import('crypto')>());
vi.mock('node:crypto', async (importActual) => await importActual<typeof import('node:crypto')>());

import { Pool } from 'pg';
import { SignJWT, importJWK, exportJWK, generateKeyPair } from 'jose';

type HealthServer = import('../server/healthServer.js').HealthServer;

const stubExecutor = vi.fn(async (toolName: string) => ({
  content: [{ type: 'text', text: `stub:${toolName}` }],
  structuredContent: { ok: true, tool: toolName },
}));

const deps = {
  executeMcpTool: stubExecutor as any,
  deserializeParameters: (a: any) => a,
  getServerStatus: async () => ({ version: 'test' }),
};

let health: HealthServer;
let baseUrl: string;
let authPool: Pool;

/**
 * Mint a real RS256/EdDSA access token signed with a key whose PUBLIC half is published
 * at the AS's JWKS endpoint, so verifyAccessToken's local JWKS check accepts it. We
 * insert our own keypair into the scratch `jwks` table (the same place the jwt() plugin
 * reads from) so the published JWKS contains our public key. This bypasses the browser
 * while exercising the GENUINE local-JWKS verification path of the /mcp guard.
 */
async function mintAccessToken(opts: { issuer: string; audience: string; sub: string }): Promise<string> {
  const { publicKey, privateKey } = await generateKeyPair('EdDSA', { extractable: true });
  const pubJwk = await exportJWK(publicKey);
  const privJwk = await exportJWK(privateKey);
  const kid = 'ba1-test-key';
  pubJwk.kid = kid;
  pubJwk.alg = 'EdDSA';
  pubJwk.use = 'sig';

  // Publish: insert a jwks row whose publicKey is the JWK better-auth's JWKS endpoint serves.
  // better-auth stores publicKey as a JSON JWK string and privateKey (we don't need priv here).
  await authPool.query(
    `INSERT INTO "jwks" ("id","publicKey","privateKey","createdAt") VALUES ($1,$2,$3, now())
     ON CONFLICT ("id") DO UPDATE SET "publicKey"=EXCLUDED."publicKey"`,
    [kid, JSON.stringify(pubJwk), JSON.stringify(privJwk)]
  );

  const key = await importJWK(privJwk, 'EdDSA');
  return await new SignJWT({ sub: opts.sub, scope: 'openid profile email' })
    .setProtectedHeader({ alg: 'EdDSA', kid })
    .setIssuer(opts.issuer)
    .setAudience(opts.audience)
    .setSubject(opts.sub)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}

beforeAll(async () => {
  const { RemoteMcpTransport } = await import('../server/remoteMcpTransport.js');
  const { HealthServer } = await import('../server/healthServer.js');

  authPool = new Pool({
    user: SCRATCH_USER, host: process.env.DATABASE_HOST, database: SCRATCH_DB,
    password: SCRATCH_PASS, port: parseInt(process.env.DATABASE_PORT!, 10),
  });

  const remoteMcp = new RemoteMcpTransport(deps);
  health = new HealthServer(stubExecutor as any, (a: any) => a, remoteMcp);
  const port = await health.start();
  const addr = health.address() as AddressInfo | null;
  baseUrl = `http://127.0.0.1:${addr?.port ?? port}`;
}, 30000);

afterAll(async () => {
  if (health) await health.stop();
  if (authPool) await authPool.end().catch(() => {});
  const { closeAuth } = await import('../server/auth.js');
  await closeAuth();
});

// ---------------------------------------------------------------------------------------
describe('(a) REGRESSION — static bearer path is byte-for-byte intact (BACKWARD-COMPAT GATE)', () => {
  it('no token → 401', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.jsonrpc).toBe('2.0');
    expect(body.error).toBeDefined();
    // The discovery hint is the documented behavior change for the 401 path.
    expect(res.headers.get('www-authenticate')).toContain('resource_metadata=');
  });

  it('valid MCP_AUTH_TOKEN → /mcp authorizes (full MCP handshake works exactly as today)', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
    const client = new Client({ name: 'ba1-static', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${TEST_TOKEN}` } },
    });
    await client.connect(transport);
    expect(client.getServerVersion()?.name).toBe('aidis-mcp-server');
    const tools = await client.listTools();
    expect(tools.tools.map(t => t.name)).toContain('mandrel_ping');
    await client.close();
  });

  it('wrong static token AND not a valid OAuth token → 401', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer totally-wrong-not-a-jwt',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------------------
describe('(b) METADATA — discovery docs return correct fields', () => {
  it('/.well-known/oauth-authorization-server (RFC 8414)', async () => {
    const res = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`);
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.issuer).toBe(ISSUER_IDENTIFIER);
    expect(typeof doc.authorization_endpoint).toBe('string');
    expect(typeof doc.token_endpoint).toBe('string');
    expect(typeof doc.registration_endpoint).toBe('string'); // DCR advertised
    expect(typeof doc.jwks_uri).toBe('string');
    expect(doc.code_challenge_methods_supported).toContain('S256'); // PKCE S256
  });

  it('/.well-known/openid-configuration', async () => {
    const res = await fetch(`${baseUrl}/.well-known/openid-configuration`);
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.issuer).toBe(ISSUER_IDENTIFIER);
    expect(typeof doc.authorization_endpoint).toBe('string');
    expect(typeof doc.token_endpoint).toBe('string');
    expect(typeof doc.jwks_uri).toBe('string');
    expect(doc.code_challenge_methods_supported).toContain('S256');
  });

  it('/.well-known/oauth-protected-resource (RFC 9728) names the exact resource + AS', async () => {
    const res = await fetch(`${baseUrl}/.well-known/oauth-protected-resource`);
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.resource).toBe(RESOURCE);
    expect(doc.authorization_servers).toContain(ISSUER_IDENTIFIER);
    expect(doc.scopes_supported).toEqual(expect.arrayContaining(['openid', 'profile', 'email']));
  });
});

// ---------------------------------------------------------------------------------------
describe('(c) DCR — dynamic client registration succeeds', () => {
  it('POST <registration_endpoint> registers a client and returns a client_id', async () => {
    const meta = await (await fetch(`${baseUrl}/.well-known/oauth-authorization-server`)).json();
    const res = await fetch(meta.registration_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'BA1 Test Connector',
        redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      }),
    });
    expect([200, 201]).toContain(res.status);
    const reg = await res.json();
    expect(reg.client_id).toBeTruthy();
    expect(reg.redirect_uris).toContain('https://claude.ai/api/mcp/auth_callback');
  });
});

// ---------------------------------------------------------------------------------------
describe('(d) OAUTH on /mcp — a minted access token authorizes; wrong aud/iss does not', () => {
  it('valid OAuth access token (correct issuer + audience) → /mcp authorizes', async () => {
    const token = await mintAccessToken({ issuer: ISSUER_IDENTIFIER, audience: RESOURCE, sub: 'user-ba1' });
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
    const client = new Client({ name: 'ba1-oauth', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    await client.connect(transport); // initialize over /mcp with an OAuth JWT
    expect(client.getServerVersion()?.name).toBe('aidis-mcp-server');
    const result: any = await client.callTool({ name: 'mandrel_ping', arguments: {} });
    expect(JSON.stringify(result)).toContain('mandrel_ping');
    await client.close();
  });

  it('wrong AUDIENCE → 401 (RFC 8707 audience binding enforced)', async () => {
    const token = await mintAccessToken({ issuer: ISSUER_IDENTIFIER, audience: 'https://evil.example/mcp', sub: 'user-ba1' });
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(res.status).toBe(401);
  });

  it('wrong ISSUER → 401', async () => {
    const token = await mintAccessToken({ issuer: 'https://evil.example', audience: RESOURCE, sub: 'user-ba1' });
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------------------
describe('(e) FAIL-CLOSED — static path cannot authorize when MCP_AUTH_TOKEN is unset', () => {
  it('with MCP_AUTH_TOKEN unset, the OLD static token no longer authorizes (only OAuth can)', async () => {
    const saved = process.env.MCP_AUTH_TOKEN;
    delete process.env.MCP_AUTH_TOKEN;
    try {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${TEST_TOKEN}`, // the (now-unconfigured) static token
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
      });
      // The static secret is unconfigured → that path can't match; the token isn't a valid
      // OAuth JWT either → 401. (Boot-level fail-closed is asserted in
      // requireRemoteMcpEnv.contract.test.ts.)
      expect(res.status).toBe(401);
    } finally {
      process.env.MCP_AUTH_TOKEN = saved;
    }
  });
});
