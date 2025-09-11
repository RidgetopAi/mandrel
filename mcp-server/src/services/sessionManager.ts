/**
 * Session Manager Service for AIDIS MCP Server
 * 
 * Manages current session tracking and integrates with
 * the event logging system for comprehensive session management.
 */

import { SessionManager as EventLoggerSessionManager } from '../middleware/eventLogger.js';

/**
 * Get current session ID
 * Returns the session ID from the MCP session context
 */
export async function getCurrentSession(): Promise<string | null> {
  // For now, return the active session from database
  // TODO: Integrate with MCP session context when available
  try {
    const { db } = await import('../config/database.js');
    const result = await db.query(
      'SELECT id FROM sessions ORDER BY updated_at DESC LIMIT 1'
    );
    if (result.rows.length > 0) {
      return result.rows[0].id;
    }
    return null;
  } catch (error) {
    console.error('❌ Error getting current session:', error);
    return null;
  }
}

/**
 * Set current session ID
 */
export function setCurrentSession(sessionId: string): void {
  EventLoggerSessionManager.setSessionId(sessionId);
}

/**
 * Generate new session ID
 */
export function generateNewSession(): string {
  return EventLoggerSessionManager.generateSessionId();
}