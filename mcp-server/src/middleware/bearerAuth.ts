/**
 * Bearer-token auth middleware for the remote Streamable HTTP MCP endpoint.
 *
 * Option B (the container IS the tenant): a single expected token is read from the
 * environment variable `MCP_AUTH_TOKEN`. There is intentionally NO multi-tenant JWT
 * logic here — one token per container = one tenant.
 *
 * Security posture:
 *   - FAIL CLOSED: if `MCP_AUTH_TOKEN` is unset/empty, every request to the guarded
 *     route is rejected with 503 and a clear server-side log. We NEVER default-open.
 *   - Constant-time comparison to avoid timing side-channels.
 *   - On missing/invalid credentials → 401 with a JSON-RPC-shaped error body, BEFORE
 *     the request ever reaches the transport / any tool.
 *
 * This middleware is applied ONLY to the new `/mcp` route(s). The pre-existing
 * localhost `/mcp/tools/*` bridge for on-box agents is intentionally left unguarded.
 */

import type { Request, Response, NextFunction } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { logger } from '../utils/logger.js';

/** JSON-RPC error codes (subset). -32001 ≈ unauthorized in common MCP usage. */
const JSONRPC_AUTH_ERROR_CODE = -32001;

/**
 * Build a JSON-RPC 2.0 error envelope. `id` is null because auth rejection happens
 * before we can reliably parse the request id.
 */
function jsonRpcError(code: number, message: string) {
  return {
    jsonrpc: '2.0' as const,
    error: { code, message },
    id: null,
  };
}

/**
 * Constant-time string compare that does not early-return on length mismatch.
 * Hashes both inputs to fixed-length buffers so timingSafeEqual never throws on
 * differing lengths and length itself isn't leaked.
 */
function constantTimeEqual(a: string, b: string): boolean {
  // Use SHA-256 digests so both buffers are always 32 bytes regardless of input length.
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Express middleware factory. Reads the expected token from env at call time so
 * tests can set it per-process. Returns a guard suitable for `app.use('/mcp', ...)`.
 */
export function bearerAuth() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const expected = process.env.MCP_AUTH_TOKEN;

    // FAIL CLOSED: never serve the guarded route without a configured token.
    if (!expected || expected.trim() === '') {
      logger.error(
        '🔒 MCP remote transport refused: MCP_AUTH_TOKEN is not set. ' +
        'Refusing to serve /mcp (fail-closed). Set MCP_AUTH_TOKEN to enable remote MCP.'
      );
      res.status(503).json(
        jsonRpcError(
          JSONRPC_AUTH_ERROR_CODE,
          'Remote MCP transport is not configured (server missing auth token).'
        )
      );
      return;
    }

    const header = req.header('authorization') || req.header('Authorization');
    if (!header || !header.startsWith('Bearer ')) {
      logger.warn('🔒 MCP auth rejected: missing or malformed Authorization header');
      res.status(401).json(
        jsonRpcError(JSONRPC_AUTH_ERROR_CODE, 'Unauthorized: missing Bearer token.')
      );
      return;
    }

    const presented = header.slice('Bearer '.length).trim();
    if (!presented || !constantTimeEqual(presented, expected)) {
      logger.warn('🔒 MCP auth rejected: invalid Bearer token');
      res.status(401).json(
        jsonRpcError(JSONRPC_AUTH_ERROR_CODE, 'Unauthorized: invalid Bearer token.')
      );
      return;
    }

    next();
  };
}
