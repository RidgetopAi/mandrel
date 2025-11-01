import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Ajv from 'ajv';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

// Provide required database env vars before importing the server module to
// prevent config/database from throwing during module evaluation.
if (!process.env.DATABASE_NAME) {
  process.env.DATABASE_NAME = 'aidis_contract_test';
}
process.env.DATABASE_USER = process.env.DATABASE_USER || 'contract_user';
process.env.DATABASE_PASSWORD = process.env.DATABASE_PASSWORD || 'contract_pass';
process.env.DATABASE_HOST = process.env.DATABASE_HOST || 'localhost';
process.env.AIDIS_LOCK_FILE = process.env.AIDIS_LOCK_FILE || path.join(os.tmpdir(), 'aidis-contract.lock');
process.env.AIDIS_SKIP_DATABASE = process.env.AIDIS_SKIP_DATABASE || 'true';
process.env.AIDIS_SKIP_BACKGROUND = process.env.AIDIS_SKIP_BACKGROUND || 'true';
process.env.AIDIS_SKIP_STDIO = process.env.AIDIS_SKIP_STDIO || 'true';
process.env.AIDIS_AIDIS_MCP_PORT = process.env.AIDIS_AIDIS_MCP_PORT || '0';
process.env.AIDIS_DISABLE_PROCESS_EXIT_HANDLERS = process.env.AIDIS_DISABLE_PROCESS_EXIT_HANDLERS || 'true';

let ServerCtor: typeof import('@/server/MandrelMcpServer').default;
let processLock: typeof import('@/utils/processLock').processLock;

const ajv = new Ajv({ allErrors: true, strict: false });

const successSchema = {
  type: 'object',
  required: ['success', 'result'],
  properties: {
    success: { const: true },
    result: {},
  },
  additionalProperties: true,
};

const errorSchema = {
  type: 'object',
  required: ['success', 'error'],
  properties: {
    success: { const: false },
    error: { type: 'string', minLength: 1 },
  },
  additionalProperties: true,
};

const responseSchema = {
  anyOf: [successSchema, errorSchema],
};

const validateResponse = ajv.compile(responseSchema);
async function postTool(baseUrl: string, toolName: string, args: Record<string, unknown> = {}) {
  const res = await fetch(`${baseUrl}/mcp/tools/${toolName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ arguments: args }),
  });
  const body = await res.json();
  return { res, body } as const;
}

function expectSuccessEnvelope(body: unknown) {
  expect(validateResponse(body)).toBe(true);
  const typed = body as { success: boolean; result: unknown };
  expect(typed.success).toBe(true);
  return typed;
}

function expectErrorEnvelope(body: unknown) {
  expect(validateResponse(body)).toBe(true);
  const typed = body as { success: boolean; error: string };
  expect(typed.success).toBe(false);
  expect(typed.error).toBeTypeOf('string');
  return typed;
}

async function getRegisteredToolNamesFromSource() {
  const sourcePath = fileURLToPath(new URL('../server.ts', import.meta.url));
  const source = await fs.readFile(sourcePath, 'utf8');
  const caseRegex = /case '([^']+)'/g;
  const names = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = caseRegex.exec(source)) !== null) {
    names.add(match[1]);
  }
  return Array.from(names);
}

const SUCCESS_TOOLS = new Set(['aidis_ping', 'aidis_status', 'aidis_help', 'aidis_examples']);
const TOOL_ARGUMENTS: Record<string, Record<string, unknown>> = {
  aidis_ping: { message: 'contract regression' },
  aidis_help: {},
  aidis_status: {},
  aidis_examples: { toolName: 'aidis_ping' },
};

describe('HTTP ↔ MCP contract', () => {
  let server: InstanceType<typeof ServerCtor>;
  let baseUrl: string;
  let tempDir: string;

  beforeAll(async () => {
    if (!ServerCtor) {
      const serverModule = await import('@/server/MandrelMcpServer');
      ServerCtor = serverModule.default;
    }
    if (!processLock) {
      ({ processLock } = await import('@/utils/processLock'));
    }

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidis-contract-'));
    const flagFile = path.join(tempDir, 'flags.json');
    await fs.writeFile(
      flagFile,
      JSON.stringify(
        {
          version: 1,
          updatedAt: new Date().toISOString(),
          flags: {},
        },
        null,
        2,
      ),
      'utf8',
    );

    process.env.AIDIS_FEATURE_FLAG_PATH = flagFile;
    process.env.AIDIS_LOCK_FILE = path.join(tempDir, 'aidis-server.lock');
    process.env.AIDIS_SKIP_DATABASE = 'true';
    process.env.AIDIS_SKIP_BACKGROUND = 'true';
    process.env.AIDIS_SKIP_STDIO = 'true';
    process.env.AIDIS_AIDIS_MCP_PORT = '0';

    server = new ServerCtor();
    await server.start();

    const healthServer = (server as any).healthServer as import('http').Server;
    const address = healthServer.address();
    const port = typeof address === 'object' && address ? address.port : Number(process.env.AIDIS_HEALTH_PORT || 8080);
    baseUrl = `http://localhost:${port}`;
  }, 60000);

  afterAll(async () => {
    try {
      await server.gracefulShutdown('TEST_SUITE');
    } catch (error) {
      // Swallow shutdown errors in test mode
      console.warn('Graceful shutdown warning:', error);
    } finally {
      processLock.release();
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    }
  });

  it('returns contract-compliant response for aidis_ping', async () => {
    const message = 'contract test';
    const { res, body } = await postTool(baseUrl, 'aidis_ping', { message });
    expect(res.status).toBe(200);
    const success = expectSuccessEnvelope(body) as { result: { content?: Array<{ text: string }> } };
    expect(success.result.content?.[0]?.text).toMatch(/AIDIS Pong/);
    expect(success.result.content?.[0]?.text).toContain(message);

    const directResult = await (server as any).executeMcpTool('aidis_ping', { message });
    expect(directResult.content[0].text).toContain('AIDIS Pong');
    expect(directResult.content[0].text).toContain(message);
  });

  it('returns structured error for unknown tool', async () => {
    const { res, body } = await postTool(baseUrl, 'not_a_tool');
    expect(res.status).toBe(500);
    const error = expectErrorEnvelope(body);
    expect(error.error).toMatch(/not_a_tool/i);
  }, 15000);

  it('exposes status data including feature flag summary', async () => {
    const { res, body } = await postTool(baseUrl, 'aidis_status');
    expect(res.status).toBe(200);
    const success = expectSuccessEnvelope(body) as { result: { content?: Array<{ text: string }> } };
    const text = success.result.content?.[0]?.text ?? '';
    expect(text).toMatch(/Feature Flags:/);
    expect(text).toMatch(/Environment:/);
  });

  it('serves human-readable tool help via aidis_help', async () => {
    const { res, body } = await postTool(baseUrl, 'aidis_help');
    expect(res.status).toBe(200);
    const success = expectSuccessEnvelope(body) as { result: { content?: Array<{ text: string }> } };
    const text = success.result.content?.[0]?.text ?? '';
    expect(text).toMatch(/AIDIS/);
    expect(text).toMatch(/tool/i);
  });

  it('propagates validation errors for malformed context_store payloads', async () => {
    const { res, body } = await postTool(baseUrl, 'context_store', {});
    expect(res.status).toBe(500);
    const error = expectErrorEnvelope(body);
    expect(error.error).toMatch(/Validation failed/i);
    expect(error.error).toMatch(/content/i);
  }, 15000);

  it('retains contract envelope across all registered tools', async () => {
    const toolNames = await getRegisteredToolNamesFromSource();
    expect(toolNames.length).toBeGreaterThanOrEqual(49);

    for (const toolName of toolNames) {
      const args = TOOL_ARGUMENTS[toolName] ?? {};
      const { res, body } = await postTool(baseUrl, toolName, args);

      if ((body as any)?.success === true || SUCCESS_TOOLS.has(toolName)) {
        expect(res.status).toBe(200);
        expectSuccessEnvelope(body);
      } else {
        expect(res.status).toBeGreaterThanOrEqual(400);
        const error = expectErrorEnvelope(body);
        expect(error.error.length).toBeGreaterThan(0);
      }
    }
  }, 60000);
});