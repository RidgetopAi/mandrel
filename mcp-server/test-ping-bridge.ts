/**
 * Quick MCP client to talk to the local HTTP bridge.
 * - Lists available tools (does not need HTTP backend)
 * - Attempts aidis_ping (requires HTTP server at :8080)
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

async function run() {
  // Spawn the bridge executable located at repo root
  const bridge = spawn('node', ['claude-http-mcp-bridge.js'], {
    cwd: process.cwd().replace(/\/mcp-server$/, ''),
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  const transport = new StdioClientTransport({
    stdin: bridge.stdout!,
    stdout: bridge.stdin!,
  });

  const client = new Client(
    { name: 'aidis-quick-test', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);

  // List tools
  const tools = await client.listTools();
  console.log(`Tools available (${tools.tools.length}):`);
  for (const t of tools.tools) console.log(` - ${t.name}`);

  // Try aidis_ping via HTTP bridge
  try {
    const result = await client.callTool({ name: 'aidis_ping', arguments: { message: 'cli test' } });
    console.log('aidis_ping response:');
    for (const c of result.content) if (c.type === 'text') console.log(c.text);
  } catch (e) {
    console.error('aidis_ping error:', (e as Error).message);
  }

  await client.close();
  bridge.kill();
}

run().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});

