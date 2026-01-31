/**
 * In-memory store for active session state
 * Connection-scoped pattern - manages which session is active per connection
 * 
 * Each MCP connection (stdio or HTTP) gets its own isolated session context.
 * This prevents one connection's project_switch from affecting other connections.
 * 
 * Connection ID conventions:
 * - stdio: "stdio" (default, one per process)
 * - HTTP: extracted from X-Connection-ID header
 * - Fallback: "default" for backward compatibility
 */

const DEFAULT_CONNECTION_ID = 'default';

interface SessionEntry {
  sessionId: string;
  lastSeen: number;
}

const sessionsByConnection = new Map<string, SessionEntry>();

// Cleanup interval - remove stale entries every 10 minutes
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const MAX_IDLE_MS = 24 * 60 * 60 * 1000; // 24 hours

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [connId, entry] of sessionsByConnection.entries()) {
      if (now - entry.lastSeen > MAX_IDLE_MS) {
        console.log(`🧹 Cleaning up stale session for connection: ${connId}`);
        sessionsByConnection.delete(connId);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  // Don't prevent process exit
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }
}

function stopCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

export const ActiveSessionStore = {
  /**
   * Get active session for a connection
   * @param connectionId - Unique identifier for the connection (defaults to 'default')
   */
  get(connectionId?: string): string | null {
    const connId = connectionId ?? DEFAULT_CONNECTION_ID;
    const entry = sessionsByConnection.get(connId);
    if (entry) {
      entry.lastSeen = Date.now();
      return entry.sessionId;
    }
    return null;
  },

  /**
   * Set active session for a connection
   * @param sessionId - Session ID to set (or null to clear)
   * @param connectionId - Unique identifier for the connection (defaults to 'default')
   */
  set(sessionId: string | null, connectionId?: string): void {
    const connId = connectionId ?? DEFAULT_CONNECTION_ID;
    if (sessionId === null) {
      sessionsByConnection.delete(connId);
    } else {
      sessionsByConnection.set(connId, {
        sessionId,
        lastSeen: Date.now()
      });
      startCleanup();
    }
  },

  /**
   * Clear active session for a connection
   * @param connectionId - Unique identifier for the connection (defaults to 'default')
   */
  clear(connectionId?: string): void {
    const connId = connectionId ?? DEFAULT_CONNECTION_ID;
    sessionsByConnection.delete(connId);
  },

  /**
   * Clear session if it matches the specified sessionId
   * @param sessionId - Session ID to match
   * @param connectionId - Unique identifier for the connection (defaults to 'default')
   */
  clearIfActive(sessionId: string, connectionId?: string): void {
    const connId = connectionId ?? DEFAULT_CONNECTION_ID;
    const entry = sessionsByConnection.get(connId);
    if (entry && entry.sessionId === sessionId) {
      sessionsByConnection.delete(connId);
    }
  },

  /**
   * Check if a session is active for a connection
   * @param sessionId - Session ID to check
   * @param connectionId - Unique identifier for the connection (defaults to 'default')
   */
  isActive(sessionId: string, connectionId?: string): boolean {
    const connId = connectionId ?? DEFAULT_CONNECTION_ID;
    const entry = sessionsByConnection.get(connId);
    return entry?.sessionId === sessionId;
  },

  /**
   * Get count of active connections (for monitoring)
   */
  getConnectionCount(): number {
    return sessionsByConnection.size;
  },

  /**
   * Clear all sessions (for testing/shutdown)
   */
  clearAll(): void {
    sessionsByConnection.clear();
    stopCleanup();
  }
};
