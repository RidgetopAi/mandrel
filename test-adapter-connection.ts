#!/usr/bin/env npx tsx

/**
 * Test HTTP Adapter Connection
 * 
 * Simple test to verify the adapter can connect to AIDIS Core Service.
 */

import { CONFIG } from './adapters/mcp-http-adapter.js';
import * as http from 'http';

const AIDIS_URL = CONFIG.aidisUrl;

/**
 * Test HTTP connection to AIDIS Core Service
 */
async function testConnection(): Promise<void> {
  console.log('🔌 Testing HTTP adapter connection...');
  console.log(`🌐 AIDIS URL: ${AIDIS_URL}`);

  try {
    // Test health endpoint
    const healthResult = await httpRequest(`${AIDIS_URL}/healthz`);
    if (healthResult.statusCode === 200) {
      const health = JSON.parse(healthResult.data);
      console.log(`✅ Health check passed: ${health.status}`);
    } else {
      throw new Error(`Health check failed: ${healthResult.statusCode}`);
    }

    // Test tools endpoint
    const toolsResult = await httpRequest(`${AIDIS_URL}/mcp/tools`);
    if (toolsResult.statusCode === 200) {
      const tools = JSON.parse(toolsResult.data);
      console.log(`✅ Tools discovered: ${tools.tools.length} tools available`);
      console.log(`📋 Sample tools: ${tools.tools.slice(0, 3).map((t: any) => t.name).join(', ')}`);
    } else {
      throw new Error(`Tools discovery failed: ${toolsResult.statusCode}`);
    }

    // Test tool execution
    const pingResult = await httpRequest(`${AIDIS_URL}/mcp/tools/aidis_ping`, {
      method: 'POST',
      body: JSON.stringify({ arguments: { message: 'Adapter Connection Test' } })
    });

    if (pingResult.statusCode === 200) {
      const result = JSON.parse(pingResult.data);
      if (result.success) {
        console.log('✅ Tool execution successful');
      } else {
        throw new Error('Tool execution returned failure');
      }
    } else {
      throw new Error(`Tool execution failed: ${pingResult.statusCode}`);
    }

    console.log('\n🎉 HTTP Adapter connection test PASSED');
    console.log('✅ Adapter is ready for Claude Code integration');

  } catch (error) {
    console.error('❌ Connection test failed:', (error as Error).message);
    process.exit(1);
  }
}

/**
 * Simple HTTP request helper
 */
function httpRequest(
  url: string,
  options: { method?: string; body?: string } = {}
): Promise<{ statusCode: number; data: string }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const requestOptions: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    };

    if (options.body) {
      (requestOptions.headers as any)['Content-Length'] = Buffer.byteLength(options.body);
    }

    const req = http.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode || 0, data }));
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

// Run test
testConnection();
