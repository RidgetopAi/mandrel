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
import { verifyAccessToken } from 'better-auth/oauth2';
import { BETTER_AUTH_CONFIG, oauthJwksUrl, oauthIssuerIdentifier } from '../config/betterAuthConfig.js';

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

/** Extract the raw token from an `Authorization: Bearer <token>` header, or null. */
function extractBearer(req: Request): string | null {
  const header = req.header('authorization') || req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  const presented = header.slice('Bearer '.length).trim();
  return presented || null;
}

/**
 * Does the presented token match the configured STATIC MCP_AUTH_TOKEN (constant-time)?
 * Returns 'ok' (matches), 'mismatch' (wrong token), or 'unconfigured' (server has no
 * token set — fail-closed). This is the EXACT static logic the original guard used,
 * factored out so both the static-only guard and the dual guard share ONE implementation
 * (no drifting copies — Lesson 011).
 */
function checkStaticToken(presented: string): 'ok' | 'mismatch' | 'unconfigured' {
  const expected = process.env.MCP_AUTH_TOKEN;
  if (!expected || expected.trim() === '') return 'unconfigured';
  return constantTimeEqual(presented, expected) ? 'ok' : 'mismatch';
}

/**
 * Express middleware factory (STATIC-only). Reads the expected token from env at call
 * time so tests can set it per-process. Returns a guard suitable for `app.use('/mcp', ...)`.
 *
 * This is the pre-existing, backward-compatible behavior used whenever OAuth is disabled.
 * Its responses are UNCHANGED (503 unconfigured / 401 missing / 401 invalid).
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

    const presented = extractBearer(req);
    if (!presented) {
      logger.warn('🔒 MCP auth rejected: missing or malformed Authorization header');
      res.status(401).json(
        jsonRpcError(JSONRPC_AUTH_ERROR_CODE, 'Unauthorized: missing Bearer token.')
      );
      return;
    }

    if (!constantTimeEqual(presented, expected)) {
      logger.warn('🔒 MCP auth rejected: invalid Bearer token');
      res.status(401).json(
        jsonRpcError(JSONRPC_AUTH_ERROR_CODE, 'Unauthorized: invalid Bearer token.')
      );
      return;
    }

    next();
  };
}

/** Subject info attached to the request after a successful OAuth verification. */
export interface OAuthSubject {
  /** The `sub` claim (the authenticated user/principal id from the OAuth token). */
  sub?: string;
  /** Space-or-array scopes granted to the token, if present. */
  scope?: string;
  /** The full verified JWT payload (for downstream use). */
  claims: Record<string, unknown>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by dualBearerAuth() when the caller authenticated via an OAuth token. */
      oauthSubject?: OAuthSubject;
    }
  }
}

/**
 * Build the RFC 9728 `WWW-Authenticate` challenge value pointing the client at the
 * protected-resource metadata so a fresh (non-static) client can discover the AS and
 * start the OAuth flow. Named/derived from config — never hardcoded.
 */
function buildWwwAuthenticate(): string {
  const resourceMetadataUrl = `${BETTER_AUTH_CONFIG.issuer}/.well-known/oauth-protected-resource`;
  return `Bearer resource_metadata="${resourceMetadataUrl}", scope="openid profile email"`;
}

/**
 * DUAL-PATH guard for `/mcp` (BA-1). Accepts EITHER credential, in order:
 *   (a) the existing static MCP_AUTH_TOKEN (constant-time compare) → allow (UNCHANGED
 *       backward-compatible path; existing tenants are byte-for-byte unaffected); else
 *   (b) a better-auth OAuth JWT access token, verified IN-PROCESS via JWKS with RFC 8707
 *       audience binding (audience === resource, issuer === issuer) → allow + attach the
 *       subject to req.oauthSubject; else
 *   (c) 401 with a `WWW-Authenticate: Bearer resource_metadata=...` header so a browser
 *       OAuth client can discover the AS and begin the flow.
 *
 * Fail-closed semantics for the STATIC side are preserved: if MCP_AUTH_TOKEN is unset
 * the static path can never succeed (checkStaticToken → 'unconfigured'); the request can
 * then only pass via a valid OAuth token. (When OAuth is DISABLED entirely, the caller
 * mounts the plain `bearerAuth()` instead, which keeps the 503 fail-closed response.)
 *
 * NOTE (behavior change, documented): on a 401 this guard now emits a `WWW-Authenticate`
 * header that the plain static guard did not. The 401 JSON body is otherwise unchanged.
 * Existing non-OAuth clients that send a VALID static token never see a 401, so they are
 * unaffected; only an unauthenticated/invalid caller sees the new header (which is the
 * correct, spec-mandated hint for OAuth discovery).
 */
export function dualBearerAuth(deps?: {
  /** Override the verifier (tests). Default: better-auth verifyAccessToken against JWKS. */
  verifyOAuth?: (token: string) => Promise<OAuthSubject | null>;
}) {
  const verifyOAuth = deps?.verifyOAuth ?? defaultVerifyOAuth;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const presented = extractBearer(req);

    // (a) STATIC token path — try first so existing tenants take the identical fast path.
    if (presented) {
      const staticResult = checkStaticToken(presented);
      if (staticResult === 'ok') {
        next();
        return;
      }

      // (b) OAuth JWT path — only attempt if the static token did not match. A token that
      // is not the static secret may be a valid OAuth access token.
      try {
        const subject = await verifyOAuth(presented);
        if (subject) {
          req.oauthSubject = subject;
          logger.debug(`🔓 /mcp authorized via OAuth token (sub=${subject.sub ?? 'unknown'})`);
          next();
          return;
        }
      } catch (err) {
        // Verification failure is an auth failure, not a server error — fall through to 401.
        logger.warn(`🔒 OAuth token verification failed: ${(err as Error).message}`);
      }
    }

    // (c) Neither credential authorized → 401 with discovery hint.
    res.setHeader('WWW-Authenticate', buildWwwAuthenticate());
    logger.warn('🔒 MCP auth rejected (dual): no valid static or OAuth credential');
    res.status(401).json(
      jsonRpcError(
        JSONRPC_AUTH_ERROR_CODE,
        presented ? 'Unauthorized: invalid Bearer token.' : 'Unauthorized: missing Bearer token.'
      )
    );
  };
}

/**
 * Default OAuth verifier: verifies a JWT access token locally against the AS's JWKS,
 * enforcing issuer + audience (RFC 8707) from named config. Returns the subject on
 * success, or null if the token is not a valid OAuth access token for this resource.
 */
async function defaultVerifyOAuth(token: string): Promise<OAuthSubject | null> {
  const payload = await verifyAccessToken(token, {
    jwksUrl: oauthJwksUrl(),
    verifyOptions: {
      // GROUND TRUTH: better-auth mints iss = baseURL + basePath, not the bare origin.
      issuer: oauthIssuerIdentifier(),
      audience: BETTER_AUTH_CONFIG.resource,
    },
  });
  if (!payload) return null;
  return {
    sub: typeof payload.sub === 'string' ? payload.sub : undefined,
    scope: typeof (payload as Record<string, unknown>).scope === 'string'
      ? (payload as Record<string, unknown>).scope as string
      : undefined,
    claims: payload as Record<string, unknown>,
  };
}
