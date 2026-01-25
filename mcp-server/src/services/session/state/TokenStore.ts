/**
 * In-memory store for session token usage tracking
 * Accumulates token counts before flushing to database
 */

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

const sessionTokens: Map<string, TokenUsage> = new Map();

export const TokenStore = {
  record(sessionId: string, inputTokens: number, outputTokens: number): void {
    const existing = sessionTokens.get(sessionId) || { input: 0, output: 0, total: 0 };
    existing.input += inputTokens;
    existing.output += outputTokens;
    existing.total += (inputTokens + outputTokens);
    sessionTokens.set(sessionId, existing);
  },

  get(sessionId: string): TokenUsage {
    return sessionTokens.get(sessionId) || { input: 0, output: 0, total: 0 };
  },

  clear(sessionId: string): void {
    sessionTokens.delete(sessionId);
  },

  getAll(): Map<string, TokenUsage> {
    return new Map(sessionTokens);
  },

  clearAll(): void {
    sessionTokens.clear();
  },

  has(sessionId: string): boolean {
    return sessionTokens.has(sessionId);
  },

  /**
   * Get all session IDs with token data
   */
  getSessionIds(): string[] {
    return Array.from(sessionTokens.keys());
  }
};
