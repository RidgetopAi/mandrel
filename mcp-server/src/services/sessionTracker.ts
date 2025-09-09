/**
 * AIDIS Session Tracking Service
 * 
 * Manages user session lifecycle, productivity metrics, and analytics.
 * Integrates with analytics_events table for comprehensive session tracking.
 * 
 * Features:
 * - Session lifecycle management (start/end/active)
 * - UUID-based session identification
 * - Productivity scoring based on outputs per session
 * - Session duration tracking
 * - Success rate calculation (completed vs abandoned sessions)
 * - Multi-project session tracking
 */

import { db } from '../config/database.js';
import { randomUUID } from 'crypto';

export interface SessionData {
  session_id: string;
  start_time: Date;
  end_time?: Date;
  duration_ms?: number;
  project_id?: string;
  contexts_created: number;
  decisions_created: number;
  operations_count: number;
  productivity_score: number;
  success_status: 'active' | 'completed' | 'abandoned';
}

export interface SessionStats {
  totalSessions: number;
  avgDuration: number;
  productivityScore: number;
  retentionRate: number;
  sessionsByDay: Array<{date: string, count: number}>;
}

/**
 * Main SessionTracker Service Class
 */
export class SessionTracker {
  private static activeSessionId: string | null = null;
  
  /**
   * Start a new session with optional project context
   */
  static async startSession(projectId?: string): Promise<string> {
    try {
      const sessionId = randomUUID();
      const startTime = new Date();
      
      console.log(`🚀 Starting session: ${sessionId.substring(0, 8)}... for project: ${projectId || 'none'}`);
      
      // Log session start event to analytics_events table
      const sql = `
        INSERT INTO analytics_events (
          actor, project_id, session_id, event_type, status, metadata, tags
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING event_id, timestamp
      `;
      
      const params = [
        'system',
        projectId || null,
        sessionId,
        'session_start',
        'open',
        JSON.stringify({ start_time: startTime.toISOString() }),
        ['session', 'lifecycle']
      ];
      
      await db.query(sql, params);
      
      // Set as active session
      this.activeSessionId = sessionId;
      
      console.log(`✅ Session started: ${sessionId.substring(0, 8)}...`);
      return sessionId;
      
    } catch (error) {
      console.error('❌ Failed to start session:', error);
      throw error;
    }
  }
  
  /**
   * End an active session and calculate final metrics
   */
  static async endSession(sessionId: string): Promise<SessionData> {
    try {
      const endTime = new Date();
      
      console.log(`🏁 Ending session: ${sessionId.substring(0, 8)}...`);
      
      // Get session data from analytics_events
      const sessionData = await this.getSessionData(sessionId);
      
      if (!sessionData) {
        throw new Error(`Session ${sessionId} not found`);
      }
      
      // Calculate duration
      const durationMs = endTime.getTime() - sessionData.start_time.getTime();
      
      // Log session end event
      const sql = `
        INSERT INTO analytics_events (
          actor, project_id, session_id, event_type, status, duration_ms, metadata, tags
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;
      
      const params = [
        'system',
        sessionData.project_id,
        sessionId,
        'session_end',
        'closed',
        durationMs,
        JSON.stringify({
          end_time: endTime.toISOString(),
          contexts_created: sessionData.contexts_created,
          decisions_created: sessionData.decisions_created,
          operations_count: sessionData.operations_count,
          productivity_score: sessionData.productivity_score
        }),
        ['session', 'lifecycle']
      ];
      
      await db.query(sql, params);
      
      // Clear active session if this was it
      if (this.activeSessionId === sessionId) {
        this.activeSessionId = null;
      }
      
      // Return final session data with calculated metrics
      const finalData: SessionData = {
        ...sessionData,
        end_time: endTime,
        duration_ms: durationMs,
        success_status: sessionData.operations_count > 0 ? 'completed' : 'abandoned'
      };
      
      console.log(`✅ Session ended: ${sessionId.substring(0, 8)}... Duration: ${Math.round(durationMs/1000)}s`);
      return finalData;
      
    } catch (error) {
      console.error('❌ Failed to end session:', error);
      throw error;
    }
  }
  
  /**
   * Get currently active session ID, or create new one
   */
  static async getActiveSession(): Promise<string | null> {
    try {
      // Check if we have an active session in memory
      if (this.activeSessionId) {
        // Verify it still exists in database
        const exists = await this.sessionExists(this.activeSessionId);
        if (exists) {
          return this.activeSessionId;
        } else {
          this.activeSessionId = null;
        }
      }
      
      // Look for the most recent active session in database
      const sql = `
        SELECT DISTINCT session_id 
        FROM analytics_events 
        WHERE event_type = 'session_start' 
        AND session_id NOT IN (
          SELECT session_id 
          FROM analytics_events 
          WHERE event_type = 'session_end'
        )
        ORDER BY timestamp DESC 
        LIMIT 1
      `;
      
      const result = await db.query(sql);
      
      if (result.rows.length > 0) {
        this.activeSessionId = result.rows[0].session_id;
        console.log(`🔄 Found active session: ${this.activeSessionId.substring(0, 8)}...`);
        return this.activeSessionId;
      }
      
      return null;
      
    } catch (error) {
      console.error('❌ Failed to get active session:', error);
      return null;
    }
  }
  
  /**
   * Record an operation within a session
   */
  static async recordOperation(sessionId: string, operationType: string): Promise<void> {
    try {
      console.log(`📝 Recording operation: ${operationType} for session ${sessionId.substring(0, 8)}...`);
      
      const sql = `
        INSERT INTO analytics_events (
          actor, session_id, event_type, status, tags
        ) VALUES ($1, $2, $3, $4, $5)
      `;
      
      const params = [
        'ai',
        sessionId,
        `session_operation_${operationType}`,
        'closed',
        ['session', 'operation', operationType]
      ];
      
      await db.query(sql, params);
      
      console.log(`✅ Operation recorded: ${operationType}`);
      
    } catch (error) {
      console.error('❌ Failed to record operation:', error);
      // Don't throw - operation logging failures shouldn't break functionality
    }
  }
  
  /**
   * Calculate productivity score for a session
   * Formula: (contexts_created * 2 + decisions_created * 3) / (duration_hours + 1)
   */
  static async calculateProductivity(sessionId: string): Promise<number> {
    try {
      const sessionData = await this.getSessionData(sessionId);
      
      if (!sessionData) {
        return 0;
      }
      
      const contextsWeight = sessionData.contexts_created * 2;
      const decisionsWeight = sessionData.decisions_created * 3;
      const durationHours = (sessionData.duration_ms || 0) / (1000 * 60 * 60) || 1;
      
      const productivity = (contextsWeight + decisionsWeight) / (durationHours + 1);
      
      console.log(`📊 Session ${sessionId.substring(0, 8)}... productivity: ${productivity.toFixed(2)}`);
      return Math.round(productivity * 100) / 100; // Round to 2 decimal places
      
    } catch (error) {
      console.error('❌ Failed to calculate productivity:', error);
      return 0;
    }
  }
  
  /**
   * Get comprehensive session data with metrics
   */
  static async getSessionData(sessionId: string): Promise<SessionData | null> {
    try {
      // Get session start time and project
      const sessionStartSql = `
        SELECT timestamp, project_id, metadata
        FROM analytics_events 
        WHERE session_id = $1 AND event_type = 'session_start'
        ORDER BY timestamp ASC
        LIMIT 1
      `;
      
      const startResult = await db.query(sessionStartSql, [sessionId]);
      
      if (startResult.rows.length === 0) {
        return null;
      }
      
      const startRow = startResult.rows[0];
      const startTime = startRow.timestamp;
      const projectId = startRow.project_id;
      
      // Count contexts created in this session
      const contextCountSql = `
        SELECT COUNT(*) as count
        FROM analytics_events 
        WHERE session_id = $1 AND event_type LIKE 'context_%'
      `;
      
      const contextResult = await db.query(contextCountSql, [sessionId]);
      const contextsCreated = parseInt(contextResult.rows[0].count) || 0;
      
      // Count decisions created in this session
      const decisionCountSql = `
        SELECT COUNT(*) as count
        FROM analytics_events 
        WHERE session_id = $1 AND event_type LIKE 'decision_%'
      `;
      
      const decisionResult = await db.query(decisionCountSql, [sessionId]);
      const decisionsCreated = parseInt(decisionResult.rows[0].count) || 0;
      
      // Count total operations
      const operationsCountSql = `
        SELECT COUNT(*) as count
        FROM analytics_events 
        WHERE session_id = $1 AND event_type NOT LIKE 'session_%'
      `;
      
      const operationsResult = await db.query(operationsCountSql, [sessionId]);
      const operationsCount = parseInt(operationsResult.rows[0].count) || 0;
      
      // Check if session has ended
      const sessionEndSql = `
        SELECT timestamp, duration_ms
        FROM analytics_events 
        WHERE session_id = $1 AND event_type = 'session_end'
        ORDER BY timestamp DESC
        LIMIT 1
      `;
      
      const endResult = await db.query(sessionEndSql, [sessionId]);
      const endTime = endResult.rows.length > 0 ? endResult.rows[0].timestamp : null;
      const durationMs = endResult.rows.length > 0 ? endResult.rows[0].duration_ms : null;
      
      // Calculate productivity score
      const contextsWeight = contextsCreated * 2;
      const decisionsWeight = decisionsCreated * 3;
      const durationHours = durationMs ? durationMs / (1000 * 60 * 60) : 1;
      const productivityScore = Math.round(((contextsWeight + decisionsWeight) / (durationHours + 1)) * 100) / 100;
      
      // Determine success status
      let successStatus: 'active' | 'completed' | 'abandoned';
      if (!endTime) {
        successStatus = 'active';
      } else if (operationsCount > 0) {
        successStatus = 'completed';
      } else {
        successStatus = 'abandoned';
      }
      
      return {
        session_id: sessionId,
        start_time: startTime,
        end_time: endTime,
        duration_ms: durationMs,
        project_id: projectId,
        contexts_created: contextsCreated,
        decisions_created: decisionsCreated,
        operations_count: operationsCount,
        productivity_score: productivityScore,
        success_status: successStatus
      };
      
    } catch (error) {
      console.error('❌ Failed to get session data:', error);
      return null;
    }
  }
  
  /**
   * Check if a session exists in the database
   */
  static async sessionExists(sessionId: string): Promise<boolean> {
    try {
      const sql = `
        SELECT 1 FROM analytics_events 
        WHERE session_id = $1 
        LIMIT 1
      `;
      
      const result = await db.query(sql, [sessionId]);
      return result.rows.length > 0;
      
    } catch (error) {
      console.error('❌ Failed to check session existence:', error);
      return false;
    }
  }
  
  /**
   * Get session statistics for analytics
   */
  static async getSessionStats(projectId?: string): Promise<SessionStats> {
    try {
      const projectFilter = projectId ? 'AND project_id = $1' : '';
      const params = projectId ? [projectId] : [];
      
      // Get total sessions count
      const totalSessionsSql = `
        SELECT COUNT(DISTINCT session_id) as total
        FROM analytics_events 
        WHERE event_type = 'session_start' ${projectFilter}
      `;
      
      const totalResult = await db.query(totalSessionsSql, params);
      const totalSessions = parseInt(totalResult.rows[0].total) || 0;
      
      // Get average duration for completed sessions
      const avgDurationSql = `
        SELECT AVG(duration_ms) as avg_duration
        FROM analytics_events 
        WHERE event_type = 'session_end' ${projectFilter}
      `;
      
      const avgResult = await db.query(avgDurationSql, params);
      const avgDuration = parseInt(avgResult.rows[0].avg_duration) || 0;
      
      // Calculate retention rate (sessions with operations / total sessions)
      const completedSessionsSql = `
        SELECT COUNT(DISTINCT ae1.session_id) as completed
        FROM analytics_events ae1
        WHERE ae1.event_type = 'session_start' ${projectFilter}
        AND EXISTS (
          SELECT 1 FROM analytics_events ae2 
          WHERE ae2.session_id = ae1.session_id 
          AND ae2.event_type NOT LIKE 'session_%'
        )
      `;
      
      const completedResult = await db.query(completedSessionsSql, params);
      const completedSessions = parseInt(completedResult.rows[0].completed) || 0;
      const retentionRate = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) / 100 : 0;
      
      // Get sessions by day for last 30 days
      const sessionsByDaySql = `
        SELECT 
          DATE(timestamp) as date,
          COUNT(DISTINCT session_id) as count
        FROM analytics_events 
        WHERE event_type = 'session_start' 
        AND timestamp >= NOW() - INTERVAL '30 days' 
        ${projectFilter}
        GROUP BY DATE(timestamp)
        ORDER BY date DESC
      `;
      
      const dayResult = await db.query(sessionsByDaySql, params);
      const sessionsByDay = dayResult.rows.map((row: any) => ({
        date: row.date,
        count: parseInt(row.count)
      }));
      
      // Calculate overall productivity score
      const productivitySql = `
        SELECT 
          AVG(
            CASE 
              WHEN duration_ms > 0 THEN 
                ((contexts.count * 2 + decisions.count * 3) / ((duration_ms / 3600000.0) + 1))
              ELSE 0 
            END
          ) as avg_productivity
        FROM (
          SELECT DISTINCT session_id, duration_ms
          FROM analytics_events 
          WHERE event_type = 'session_end' ${projectFilter}
        ) sessions
        LEFT JOIN (
          SELECT session_id, COUNT(*) as count
          FROM analytics_events 
          WHERE event_type LIKE 'context_%' ${projectFilter}
          GROUP BY session_id
        ) contexts ON sessions.session_id = contexts.session_id
        LEFT JOIN (
          SELECT session_id, COUNT(*) as count
          FROM analytics_events 
          WHERE event_type LIKE 'decision_%' ${projectFilter}
          GROUP BY session_id
        ) decisions ON sessions.session_id = decisions.session_id
      `;
      
      const productivityResult = await db.query(productivitySql, params);
      const productivityScore = Math.round((parseFloat(productivityResult.rows[0].avg_productivity) || 0) * 100) / 100;
      
      return {
        totalSessions,
        avgDuration,
        productivityScore,
        retentionRate,
        sessionsByDay
      };
      
    } catch (error) {
      console.error('❌ Failed to get session stats:', error);
      throw error;
    }
  }
}

/**
 * Utility functions for session management
 */

/**
 * Auto-start session if none exists
 */
export async function ensureActiveSession(projectId?: string): Promise<string> {
  let sessionId = await SessionTracker.getActiveSession();
  
  if (!sessionId) {
    sessionId = await SessionTracker.startSession(projectId);
  }
  
  return sessionId;
}

/**
 * Record operation and ensure session exists
 */
export async function recordSessionOperation(operationType: string, projectId?: string): Promise<void> {
  const sessionId = await ensureActiveSession(projectId);
  await SessionTracker.recordOperation(sessionId, operationType);
}
