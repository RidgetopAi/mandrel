/**
 * Spindles Proxy Server
 * Transparent proxy that captures thinking blocks from Anthropic API streaming responses
 * Listens on port 8082, forwards to api.anthropic.com
 */

import express, { Request, Response } from 'express';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { StreamProcessor } from './streamProcessor.js';
import { ProxyConfig, SpindleLogEntry } from './types.js';

const config: ProxyConfig = {
  port: 8082,
  targetUrl: 'https://api.anthropic.com',
  logFile: join(process.cwd(), 'logs', 'spindles.jsonl'),
  enableConsoleLogging: true
};

const app = express();

// Parse raw body for proxying - keep original body
app.use(express.json({
  limit: '50mb',
  verify: (req: any, res, buf) => {
    req.rawBody = buf; // Store raw buffer for forwarding
  }
}));

// Ensure logs directory exists
const logsDir = join(process.cwd(), 'logs');
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

// Create log stream for spindles
const logStream = createWriteStream(config.logFile, { flags: 'a' });

// Create raw dump directory
const rawDumpsDir = join(logsDir, 'raw-dumps');
if (!existsSync(rawDumpsDir)) {
  mkdirSync(rawDumpsDir, { recursive: true });
}

/**
 * Log a spindle to JSONL file
 */
function logSpindle(entry: SpindleLogEntry): void {
  const line = JSON.stringify(entry) + '\n';
  logStream.write(line);

  if (config.enableConsoleLogging) {
    console.log('[SPINDLE]', entry.spindle.id, '-', entry.spindle.content.substring(0, 100) + '...');
  }
}

// Health check endpoint (before proxy handler)
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'spindles-proxy',
    port: config.port,
    targetUrl: config.targetUrl,
    logFile: config.logFile
  });
});

/**
 * Proxy handler for all requests to Anthropic API
 */
app.all('*', async (req: Request, res: Response) => {
  const targetPath = req.path;
  const targetUrl = `${config.targetUrl}${targetPath}`;

  // Log the incoming request
  console.log(`[PROXY] ${req.method} ${targetPath}`);

  // Extract session ID from headers or generate one
  const sessionId = (req.headers['x-session-id'] as string) || undefined;

  // Create stream processor for this request
  const processor = new StreamProcessor(sessionId);

  try {
    // Build headers, filtering out problematic ones
    const forwardHeaders: Record<string, string> = {};
    const skipHeaders = ['host', 'connection', 'content-length', 'transfer-encoding'];

    Object.entries(req.headers).forEach(([key, value]) => {
      if (!skipHeaders.includes(key.toLowerCase()) && typeof value === 'string') {
        forwardHeaders[key] = value;
      }
    });

    forwardHeaders['host'] = 'api.anthropic.com';

    console.log(`[PROXY] Forwarding to ${targetUrl}`);

    // Forward the request to Anthropic API with extended timeout for long-running requests
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800000); // 30 minute timeout for very long sessions

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: req.method !== 'GET' && req.method !== 'HEAD'
        ? ((req as any).rawBody || JSON.stringify(req.body))
        : undefined,
      signal: controller.signal
    }).catch(err => {
      clearTimeout(timeout);
      console.error('[PROXY ERROR] Fetch failed:', err.message);
      throw err;
    }).finally(() => {
      clearTimeout(timeout);
    });

    console.log(`[PROXY] Response status: ${response.status}`);

    // Copy response headers
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    res.status(response.status);

    // Check if this is a streaming response
    const contentType = response.headers.get('content-type') || '';
    const isStreaming = contentType.includes('text/event-stream') || contentType.includes('stream');

    if (isStreaming && response.body) {
      // Handle streaming response
      console.log('[PROXY] Handling streaming response');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // Create raw dump file for this request
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rawDumpFile = join(rawDumpsDir, `raw-${timestamp}.txt`);
      const rawDumpStream = createWriteStream(rawDumpFile);
      console.log(`[PROXY] Saving raw stream to: ${rawDumpFile}`);

      try {
        let chunkCount = 0;
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            console.log(`[PROXY] Stream complete (${chunkCount} chunks)`);
            rawDumpStream.end();
            res.end();
            break;
          }

          chunkCount++;

          // Decode the chunk
          const chunk = decoder.decode(value, { stream: true });

          // Save RAW chunk to dump file (exactly as received)
          rawDumpStream.write(chunk);

          // Debug: Log chunks to see thinking blocks
          if (chunk.includes('thinking') || chunkCount <= 3) {
            console.log(`[PROXY DEBUG] Chunk ${chunkCount}:`, chunk.substring(0, 300));
          }

          // Process chunk through StreamProcessor
          const { spindles, forwardChunk } = processor.processChunk(chunk);

          // Log any extracted spindles
          if (spindles.length > 0) {
            console.log(`[PROXY] Captured ${spindles.length} spindles in chunk ${chunkCount}`);
          }

          spindles.forEach(spindle => {
            const entry: SpindleLogEntry = {
              spindle,
              capturedAt: new Date().toISOString()
            };
            logSpindle(entry);
          });

          // Forward the original chunk to the client (transparent proxy)
          res.write(value);
        }
      } catch (streamError) {
        console.error('[PROXY ERROR] Stream processing error:', streamError);
        rawDumpStream.end();
        if (!res.headersSent) {
          res.status(500).end();
        } else {
          res.end();
        }
      }
    } else {
      // Non-streaming response - just pass through
      const body = await response.arrayBuffer();
      res.send(Buffer.from(body));
    }

  } catch (error) {
    console.error('[PROXY ERROR] Full error:', error);

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Proxy error',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
    } else {
      res.end();
    }
  }
});

// Start the server
app.listen(config.port, () => {
  console.log(`🎡 Spindles Proxy running on port ${config.port}`);
  console.log(`📡 Forwarding to: ${config.targetUrl}`);
  console.log(`📝 Logging spindles to: ${config.logFile}`);
  console.log(`🏥 Health check: http://localhost:${config.port}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing log stream...');
  logStream.end();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing log stream...');
  logStream.end();
  process.exit(0);
});
