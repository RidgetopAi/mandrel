/**
 * Remote Streamable HTTP MCP transport.
 *
 * Mounts the MCP Streamable HTTP transport on the existing Express app (HealthServer)
 * at `POST /mcp`, `GET /mcp`, `DELETE /mcp` per the Streamable HTTP spec.
 *
 * Design:
 *   - STATEFUL sessions: `sessionIdGenerator` is set; we keep a map of
 *     { transport, server } keyed by `Mcp-Session-Id`, matching the server's existing
 *     connectionId model (the session id becomes the connectionId for tool dispatch,
 *     so HTTP sessions are isolated from stdio and from each other).
 *   - DRY: each per-session SDK `Server` registers the SAME handlers as stdio via
 *     `registerMcpHandlers()`. No tool logic is duplicated; CallTool delegates back to
 *     the shared `executeMcpTool()`.
 *   - AUTH: the `bearerAuth()` middleware is applied to the route(s) by the caller
 *     BEFORE these handlers run, so unauthorized requests never create a session.
 *   - DNS-rebinding / Origin protection via the SDK transport options.
 */

import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../utils/logger.js';
import { MANDREL_VERSION } from '../version.js';
import { registerMcpHandlers, type McpHandlerDeps } from './registerMcpHandlers.js';

const MCP_SESSION_HEADER = 'mcp-session-id';
const JSONRPC_INVALID_REQUEST = -32600;
// Session-expired (idle-evicted) is distinct from a malformed/no-session request: it is
// a recoverable state where the client should RE-INITIALIZE. We use a dedicated code in
// the implementation-defined JSON-RPC range (-32000..-32099) so a well-behaved MCP
// client can recognize "re-initialize needed" rather than treating it as a fatal
// protocol/auth error. (Auth failures stay 401/-32001 in bearerAuth — see CONSTRAINTS.)
const JSONRPC_SESSION_EXPIRED = -32002;

// Bounds on the per-session transport map. Even an AUTHENTICATED caller must not be
// able to grow memory without limit by spamming `initialize`. We cap the number of
// live sessions and evict idle ones, so memory stays bounded on the public endpoint.
const DEFAULT_MAX_SESSIONS = 100;
// Idle TTL before a session is evicted. Tuned so a working dev rarely hits idle-expiry:
// 4 hours comfortably spans normal work gaps (meetings, lunch, context-switching) while
// staying BOUNDED for memory/security (not unbounded). Override with MCP_SESSION_IDLE_MS
// (milliseconds) without a code change.
const DEFAULT_SESSION_IDLE_MS = 4 * 60 * 60 * 1000; // 4 hours

function resolveMaxSessions(): number {
  const raw = process.env.MCP_MAX_SESSIONS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_SESSIONS;
}

function resolveSessionIdleMs(): number {
  const raw = process.env.MCP_SESSION_IDLE_MS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_SESSION_IDLE_MS;
}

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: Server;
  /** Epoch ms of the last request seen on this session; drives idle eviction + LRU. */
  lastActivity: number;
}

/**
 * Parse `MCP_ALLOWED_HOSTS` (comma-separated) into a list for DNS-rebinding protection.
 * Defaults to localhost variants so local dev / on-box never breaks.
 */
function resolveAllowedHosts(): string[] {
  const raw = process.env.MCP_ALLOWED_HOSTS;
  const defaults = ['localhost', '127.0.0.1', 'localhost:8080', '127.0.0.1:8080'];
  if (!raw || raw.trim() === '') {
    return defaults;
  }
  const configured = raw.split(',').map(h => h.trim()).filter(Boolean);
  // Always keep localhost reachable for on-box health/testing alongside the public host.
  return Array.from(new Set([...configured, ...defaults]));
}

/**
 * Manages per-session Streamable HTTP MCP transports and exposes Express handlers.
 */
export class RemoteMcpTransport {
  // Insertion-ordered Map; we use the JS Map iteration order + lastActivity to evict
  // the least-recently-used entry when the cap is hit.
  private sessions = new Map<string, SessionEntry>();
  private readonly allowedHosts: string[];
  private readonly maxSessions: number;
  private readonly sessionIdleMs: number;

  constructor(private readonly deps: McpHandlerDeps) {
    this.allowedHosts = resolveAllowedHosts();
    this.maxSessions = resolveMaxSessions();
    this.sessionIdleMs = resolveSessionIdleMs();
    logger.info(
      `🌐 Remote MCP transport configured (DNS-rebinding protection on; allowedHosts=${this.allowedHosts.join(',')}; ` +
      `maxSessions=${this.maxSessions}; sessionIdleMs=${this.sessionIdleMs})`
    );
  }

  /** Number of live HTTP MCP sessions (for diagnostics/tests). */
  public sessionCount(): number {
    return this.sessions.size;
  }

  /** Mark a session as just-active (touch) so it survives LRU/idle eviction. */
  private touch(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (entry) entry.lastActivity = Date.now();
  }

  /**
   * Evict sessions that have been idle longer than the configured TTL. Closing the
   * SDK transport triggers onclose → cleanupSession, which removes the map entry.
   */
  private evictIdleSessions(now: number): void {
    for (const [sid, entry] of this.sessions) {
      if (now - entry.lastActivity > this.sessionIdleMs) {
        logger.debug(`♻️  Evicting idle MCP HTTP session ${sid.substring(0, 8)}… (idle > ${this.sessionIdleMs}ms)`);
        this.evictSession(sid, entry);
      }
    }
  }

  /**
   * Enforce the max-session cap. If still at/over the cap after idle eviction, evict
   * the least-recently-used session(s) until there is room for one more.
   */
  private enforceSessionCap(): void {
    const now = Date.now();
    this.evictIdleSessions(now);

    while (this.sessions.size >= this.maxSessions) {
      // Find the least-recently-used live session.
      let lruSid: string | undefined;
      let lruEntry: SessionEntry | undefined;
      for (const [sid, entry] of this.sessions) {
        if (!lruEntry || entry.lastActivity < lruEntry.lastActivity) {
          lruSid = sid;
          lruEntry = entry;
        }
      }
      if (!lruSid || !lruEntry) break;
      logger.debug(
        `♻️  Evicting LRU MCP HTTP session ${lruSid.substring(0, 8)}… ` +
        `(cap=${this.maxSessions} reached; live=${this.sessions.size})`
      );
      this.evictSession(lruSid, lruEntry);
    }
  }

  /**
   * Evict a single session: remove it from the map FIRST (so transport.onclose's
   * cleanupSession is a no-op) and close its SDK transport to free resources.
   */
  private evictSession(sessionId: string, entry: SessionEntry): void {
    this.sessions.delete(sessionId);
    // Close asynchronously; we don't await inside the hot path. Errors are swallowed
    // since the entry is already gone from the map.
    void Promise.resolve(entry.transport.close()).catch(() => { /* already evicted */ });
  }

  /**
   * POST /mcp — handles initialize and all subsequent JSON-RPC requests.
   * Creates a new stateful session on `initialize`; otherwise routes to the existing
   * session identified by the `Mcp-Session-Id` header.
   */
  public handlePost = async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.header(MCP_SESSION_HEADER) || undefined;

    try {
      // Existing session → reuse its transport.
      if (sessionId && this.sessions.has(sessionId)) {
        const entry = this.sessions.get(sessionId)!;
        this.touch(sessionId);
        await entry.transport.handleRequest(req, res, req.body);
        return;
      }

      // No session id + initialize request → create a new session.
      if (!sessionId && isInitializeRequest(req.body)) {
        await this.createSession(req, res);
        return;
      }

      // A session id WAS supplied but is not (or no longer) in our map. The common cause
      // is idle eviction: the session expired after inactivity. This is RECOVERABLE — the
      // bearer token is still valid (auth ran before us); the client just needs to
      // re-initialize. Return a clear, self-healing error so the agent/user re-connects
      // instead of reading a cryptic "no valid session" as an outage.
      if (sessionId) {
        logger.info(
          `MCP POST: unknown/expired session ${sessionId.substring(0, 8)}… → asking client to re-initialize`
        );
        res.status(404).json({
          jsonrpc: '2.0',
          error: {
            code: JSONRPC_SESSION_EXPIRED,
            message:
              'MCP session expired after inactivity. Re-initialize the connection ' +
              '(reconnect / restart your MCP client) to start a new session, then retry. ' +
              'Your credentials are still valid — this is not an auth failure.',
            data: {
              reason: 'session_expired',
              action: 'reinitialize',
              retryable: true,
            },
          },
          id: (req.body && typeof req.body === 'object' && 'id' in req.body) ? req.body.id : null,
        });
        return;
      }

      // No session id and not an initialize request → genuine protocol error.
      logger.warn('MCP POST rejected: no session id on a non-initialize request');
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: JSONRPC_INVALID_REQUEST,
          message:
            'Bad Request: no session ID provided for a non-initialize request. ' +
            'Send an "initialize" request first to establish an MCP session.',
        },
        id: (req.body && typeof req.body === 'object' && 'id' in req.body) ? req.body.id : null,
      });
    } catch (error) {
      logger.error('Error handling MCP POST request', error as Error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error.' },
          id: null,
        });
      }
    }
  };

  /**
   * GET /mcp — server-to-client SSE stream for an established session.
   * DELETE /mcp — explicit session termination.
   * Both require a valid existing session id.
   */
  public handleSessionRequest = async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.header(MCP_SESSION_HEADER) || undefined;
    if (!sessionId || !this.sessions.has(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    try {
      const entry = this.sessions.get(sessionId)!;
      this.touch(sessionId);
      await entry.transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error('Error handling MCP session request (GET/DELETE)', error as Error);
      if (!res.headersSent) {
        res.status(500).send('Internal server error');
      }
    }
  };

  /**
   * Create a new stateful session: build a per-session transport + SDK Server,
   * register the shared handlers (keyed by session id for isolation), connect, and
   * let the transport handle the initialize request.
   */
  private async createSession(req: Request, res: Response): Promise<void> {
    // A per-session SDK Server with the SAME capabilities as stdio.
    const server = new Server(
      { name: 'aidis-mcp-server', version: MANDREL_VERSION }, // single source of truth — CUSTOMER-VISIBLE (remote HTTP transport)
      { capabilities: { tools: {}, resources: {} } }
    );

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableDnsRebindingProtection: true,
      allowedHosts: this.allowedHosts,
      onsessioninitialized: (sid: string) => {
        // Bound the map BEFORE inserting: evict idle/LRU sessions so an authenticated
        // caller spamming `initialize` cannot grow memory without limit.
        this.enforceSessionCap();
        // Store under the SDK-generated id so subsequent requests resolve.
        this.sessions.set(sid, { transport, server, lastActivity: Date.now() });
        logger.info(`🟢 MCP HTTP session initialized: ${sid.substring(0, 8)}… (live=${this.sessions.size})`);
      },
      onsessionclosed: (sid: string) => {
        this.cleanupSession(sid);
      },
    });

    // The connectionId for tool dispatch is the session id once assigned. We bind it
    // lazily: the transport assigns transport.sessionId during handleRequest(init),
    // so we register handlers that read it at call time.
    registerMcpHandlersWithDynamicConnectionId(server, this.deps, () => transport.sessionId);

    // Clean up map entry when transport closes for any reason.
    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) this.cleanupSession(sid);
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  private cleanupSession(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    this.sessions.delete(sessionId);
    logger.info(`🔴 MCP HTTP session closed: ${sessionId.substring(0, 8)}… (live=${this.sessions.size})`);
  }

  /** Close all sessions on shutdown. */
  public async closeAll(): Promise<void> {
    const entries = Array.from(this.sessions.values());
    this.sessions.clear();
    await Promise.allSettled(entries.map(e => e.transport.close()));
  }
}

/**
 * Register MCP handlers where the connectionId is resolved dynamically at call time
 * (the HTTP session id is only known after the transport processes `initialize`).
 *
 * This wraps `registerMcpHandlers` semantics but supplies a live connectionId getter.
 */
function registerMcpHandlersWithDynamicConnectionId(
  server: Server,
  deps: McpHandlerDeps,
  getConnectionId: () => string | undefined
): void {
  // We reuse the shared registration but wrap executeMcpTool so the connectionId is
  // injected per-call from the live session id. This keeps tool logic in ONE place.
  const wrappedDeps: McpHandlerDeps = {
    ...deps,
    executeMcpTool: (toolName, args, context) => {
      const connectionId = context?.connectionId ?? getConnectionId();
      return deps.executeMcpTool(toolName, args, connectionId ? { connectionId } : undefined);
    },
  };
  registerMcpHandlers(server, wrappedDeps);
}
