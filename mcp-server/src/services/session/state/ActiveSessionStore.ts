/**
 * In-memory store for active session state
 * Singleton pattern - manages which session is currently active
 */

let activeSessionId: string | null = null;

export const ActiveSessionStore = {
  get(): string | null {
    return activeSessionId;
  },

  set(sessionId: string | null): void {
    activeSessionId = sessionId;
  },

  clear(): void {
    activeSessionId = null;
  },

  clearIfActive(sessionId: string): void {
    if (activeSessionId === sessionId) {
      activeSessionId = null;
    }
  },

  isActive(sessionId: string): boolean {
    return activeSessionId === sessionId;
  }
};
