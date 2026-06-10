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
import { registerMcpHandlers, type McpHandlerDeps } from './registerMcpHandlers.js';

const MCP_SESSION_HEADER = 'mcp-session-id';
const JSONRPC_INVALID_REQUEST = -32600;

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: Server;
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
  private sessions = new Map<string, SessionEntry>();
  private readonly allowedHosts: string[];

  constructor(private readonly deps: McpHandlerDeps) {
    this.allowedHosts = resolveAllowedHosts();
    logger.info(
      `🌐 Remote MCP transport configured (DNS-rebinding protection on; allowedHosts=${this.allowedHosts.join(',')})`
    );
  }

  /** Number of live HTTP MCP sessions (for diagnostics/tests). */
  public sessionCount(): number {
    return this.sessions.size;
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
        await entry.transport.handleRequest(req, res, req.body);
        return;
      }

      // No session id + initialize request → create a new session.
      if (!sessionId && isInitializeRequest(req.body)) {
        await this.createSession(req, res);
        return;
      }

      // Anything else is a protocol error (missing/unknown session, non-init).
      logger.warn(`MCP POST rejected: no valid session (sessionId=${sessionId ?? 'none'})`);
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: JSONRPC_INVALID_REQUEST,
          message: 'Bad Request: no valid session ID provided for non-initialize request.',
        },
        id: null,
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
      { name: 'aidis-mcp-server', version: '0.1.0-hardened' },
      { capabilities: { tools: {}, resources: {} } }
    );

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableDnsRebindingProtection: true,
      allowedHosts: this.allowedHosts,
      onsessioninitialized: (sid: string) => {
        // Store under the SDK-generated id so subsequent requests resolve.
        this.sessions.set(sid, { transport, server });
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
