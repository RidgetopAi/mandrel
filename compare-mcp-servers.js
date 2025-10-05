#!/usr/bin/env node

/**
 * Compare Playwright MCP vs AIDIS MCP server initialization
 */

const { spawn } = require('child_process');

function testServer(name, command, args, options = {}) {
  return new Promise((resolve) => {
    console.log(`\n=== Testing ${name} ===`);
    console.log(`Command: ${command} ${args.join(' ')}`);
    
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options
    });

    let stdoutData = '';
    let stderrData = '';
    let startTime = Date.now();

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdoutData += chunk;
      console.log(`[${name} STDOUT]`, chunk.trim());
    });

    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderrData += chunk;
      console.log(`[${name} STDERR]`, chunk.trim());
    });

    // Send a simple MCP request after 3 seconds
    setTimeout(() => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      };
      
      console.log(`[${name}] Sending MCP request...`);
      child.stdin.write(JSON.stringify(request) + '\n');
    }, 3000);

    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      console.log(`[${name}] Process exited with code ${code} after ${duration}ms`);
      
      resolve({
        name,
        exitCode: code,
        duration,
        stdout: stdoutData,
        stderr: stderrData,
        hasJSONResponse: stdoutData.includes('"jsonrpc":')
      });
    });

    child.on('error', (error) => {
      console.error(`[${name}] Error:`, error);
      resolve({
        name,
        error: error.message,
        stdout: stdoutData,
        stderr: stderrData,
        hasJSONResponse: false
      });
    });

    // Kill after 8 seconds
    setTimeout(() => {
      child.kill();
    }, 8000);
  });
}

async function compareServers() {
  console.log('🔍 Comparing MCP Server Implementations\n');

  // Test Playwright MCP (known working)
  const playwrightResult = await testServer(
    'Playwright MCP',
    'npx',
    ['-y', '@playwright/mcp@latest', '--headless', '--isolated']
  );

  // Test AIDIS MCP
  const aidisResult = await testServer(
    'AIDIS MCP',
    '/home/ridgetop/aidis/mcp-server/node_modules/.bin/tsx',
    ['/home/ridgetop/aidis/mcp-server/src/server.ts'],
    {
      cwd: '/home/ridgetop/aidis/mcp-server',
      env: {
        ...process.env,
        NODE_ENV: 'development',
        AMP_CONNECTING: 'true',
        AIDIS_FORCE_STDIO: 'true',
        AIDIS_MCP_DEBUG: '1',
        AIDIS_SKIP_DATABASE: 'true',
        AIDIS_SKIP_BACKGROUND: 'true',
        AIDIS_PID_FILE: '/tmp/aidis-test.pid'
      }
    }
  );

  console.log('\n=== Comparison Results ===');
  console.log(`Playwright MCP:`);
  console.log(`  - Exit code: ${playwrightResult.exitCode}`);
  console.log(`  - Duration: ${playwrightResult.duration}ms`);
  console.log(`  - Has JSON response: ${playwrightResult.hasJSONResponse ? '✅' : '❌'}`);
  console.log(`  - Error: ${playwrightResult.error || 'None'}`);

  console.log(`\nAIDIS MCP:`);
  console.log(`  - Exit code: ${aidisResult.exitCode}`);
  console.log(`  - Duration: ${aidisResult.duration}ms`);
  console.log(`  - Has JSON response: ${aidisResult.hasJSONResponse ? '✅' : '❌'}`);
  console.log(`  - Error: ${aidisResult.error || 'None'}`);

  console.log('\n=== Key Differences ===');
  if (playwrightResult.hasJSONResponse && !aidisResult.hasJSONResponse) {
    console.log('❌ AIDIS is not responding with JSON over stdout');
    console.log('🔍 This is the core issue - AIDIS MCP server is not implementing stdio transport correctly');
  } else if (!playwrightResult.hasJSONResponse && !aidisResult.hasJSONResponse) {
    console.log('⚠️  Both servers failed to respond - check test methodology');
  } else if (aidisResult.hasJSONResponse) {
    console.log('✅ AIDIS is responding correctly - issue may be elsewhere');
  }

  return { playwrightResult, aidisResult };
}

compareServers().catch(console.error);
