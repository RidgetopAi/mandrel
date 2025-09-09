/**
 * AIDIS Event Logging Middleware
 * 
 * This middleware captures all AIDIS operations into the analytics_events table.
 * It provides the foundation for comprehensive analytics tracking across all
 * system operations including context storage, decision recording, and more.
 * 
 * Features:
 * - Automatic session ID generation and tracking
 * - Project context integration
 * - Error handling that doesn't break existing functionality
 * - Comprehensive event metadata collection
 * - Integration with existing database connection patterns
 */

import { db } from '../config/database.js';
import { projectHandler } from '../handlers/project.js';
import { randomUUID } from 'crypto';

export interface AnalyticsEvent {
  actor: 'human' | 'ai' | 'system';
  project_id?: string;
  session_id?: string;
  context_id?: string;
  event_type: string;
  payload?: any;
  status?: 'open' | 'closed' | 'error';
  duration_ms?: number;
  tags?: string[];
  ai_model_used?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  feedback?: number;
  metadata?: any;
}

/**
 * Session management for tracking related events
 */
class SessionManager {
  private static currentSessionId: string | null = null;
  
  static generateSessionId(): string {
    this.currentSessionId = randomUUID();
    console.log(`🔄 Generated new session ID: ${this.currentSessionId.substring(0, 8)}...`);
    return this.currentSessionId;
  }
  
  static getCurrentSessionId(): string {
    if (!this.currentSessionId) {
      this.currentSessionId = this.generateSessionId();
    }
    return this.currentSessionId;
  }
  
  static setSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
  }
}

/**
 * Core event logging function
 */
export async function logEvent(event: AnalyticsEvent): Promise<string> {
  try {
    console.log(`📊 Logging event: ${event.event_type} by ${event.actor}`);
    
    // Ensure we have a session ID
    const sessionId = event.session_id || SessionManager.getCurrentSessionId();
    
    // Get current project if not specified
    let projectId = event.project_id;
    if (!projectId) {
      try {
        await projectHandler.initializeSession();
        const currentProject = await projectHandler.getCurrentProject();
        projectId = currentProject?.id;
      } catch (error) {
        console.warn('⚠️  Could not get current project for event logging:', error);
        // Continue without project_id - some events might not need it
      }
    }
    
    // Insert event into database
    const sql = `
      INSERT INTO analytics_events (
        actor, project_id, session_id, context_id, event_type, payload,
        status, duration_ms, tags, ai_model_used, prompt_tokens,
        completion_tokens, feedback, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING event_id, timestamp
    `;
    
    const params = [
      event.actor,
      projectId,
      sessionId,
      event.context_id || null,
      event.event_type,
      event.payload ? JSON.stringify(event.payload) : null,
      event.status || null,
      event.duration_ms || null,
      event.tags || [],
      event.ai_model_used || null,
      event.prompt_tokens || null,
      event.completion_tokens || null,
      event.feedback || null,
      event.metadata ? JSON.stringify(event.metadata) : null
    ];
    
    const result = await db.query(sql, params);
    const eventId = result.rows[0].event_id;
    const timestamp = result.rows[0].timestamp;
    
    console.log(`✅ Event logged: ${eventId.substring(0, 8)}... at ${timestamp}`);
    return eventId;
    
  } catch (error) {
    console.error('❌ Failed to log event:', error);
    // Don't throw - we don't want logging failures to break functionality
    return 'error';
  }
}

/**
 * Specialized function for logging context-related events
 */
export async function logContextEvent(
  contextId: string, 
  eventType: string, 
  payload: any,
  actor: 'human' | 'ai' | 'system' = 'ai'
): Promise<string> {
  return logEvent({
    actor,
    context_id: contextId,
    event_type: `context_${eventType}`,
    payload,
    status: 'closed',
    tags: ['context', eventType]
  });
}

/**
 * Specialized function for logging decision-related events  
 */
export async function logDecisionEvent(
  decisionId: string,
  eventType: string,
  payload: any,
  actor: 'human' | 'ai' | 'system' = 'ai'
): Promise<string> {
  return logEvent({
    actor,
    event_type: `decision_${eventType}`,
    payload: {
      decision_id: decisionId,
      ...payload
    },
    status: 'closed',
    tags: ['decision', eventType]
  });
}

/**
 * Log session start/end events
 */
export async function logSessionEvent(
  eventType: 'session_start' | 'session_end',
  metadata?: any
): Promise<string> {
  const sessionId = eventType === 'session_start' 
    ? SessionManager.generateSessionId() 
    : SessionManager.getCurrentSessionId();
    
  return logEvent({
    actor: 'system',
    session_id: sessionId,
    event_type: eventType,
    status: eventType === 'session_start' ? 'open' : 'closed',
    metadata,
    tags: ['session']
  });
}

/**
 * Log operation timing (for performance analytics)
 */
export async function logOperationTiming(
  operationType: string,
  durationMs: number,
  success: boolean,
  metadata?: any
): Promise<string> {
  return logEvent({
    actor: 'system',
    event_type: `operation_${operationType}`,
    duration_ms: durationMs,
    status: success ? 'closed' : 'error',
    metadata,
    tags: ['performance', operationType]
  });
}

/**
 * Export session manager for external access
 */
export { SessionManager };
