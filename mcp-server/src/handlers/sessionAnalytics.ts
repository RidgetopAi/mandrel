/**
 * AIDIS Session Analytics Handler
 * 
 * Provides comprehensive session analytics and statistics endpoints.
 * Integrates with SessionTracker service for session management.
 * 
 * Features:
 * - Session statistics API endpoint
 * - Session productivity analysis
 * - Session retention metrics
 * - Daily session patterns
 * - Project-specific session analytics
 */

import { SessionTracker, SessionData, SessionStats } from '../services/sessionTracker.js';
import { logEvent } from '../middleware/eventLogger.js';

export interface SessionAnalyticsResult {
  success: boolean;
  data?: SessionStats;
  error?: string;
  timestamp: string;
}

export interface SessionDetailsResult {
  success: boolean;
  data?: SessionData;
  error?: string;
  timestamp: string;
}

/**
 * Session Analytics Handler Class
 */
export class SessionAnalyticsHandler {
  
  /**
   * Get comprehensive session statistics
   */
  static async getSessionStats(projectId?: string): Promise<SessionAnalyticsResult> {
    try {
      console.log(`📊 Getting session statistics for project: ${projectId || 'all'}`);
      
      // Log the analytics request
      await logEvent({
        actor: 'ai',
        project_id: projectId,
        event_type: 'analytics_session_stats_request',
        status: 'open',
        tags: ['analytics', 'session', 'statistics']
      });
      
      const startTime = Date.now();
      
      // Get session statistics from SessionTracker
      const stats = await SessionTracker.getSessionStats(projectId);
      
      const duration = Date.now() - startTime;
      
      // Log successful completion
      await logEvent({
        actor: 'ai',
        project_id: projectId,
        event_type: 'analytics_session_stats_completed',
        status: 'closed',
        duration_ms: duration,
        metadata: {
          total_sessions: stats.totalSessions,
          avg_duration: stats.avgDuration,
          productivity_score: stats.productivityScore
        },
        tags: ['analytics', 'session', 'statistics', 'completed']
      });
      
      console.log(`✅ Session statistics retrieved in ${duration}ms`);
      console.log(`   Sessions: ${stats.totalSessions}, Avg Duration: ${Math.round(stats.avgDuration/1000)}s`);
      console.log(`   Productivity: ${stats.productivityScore}, Retention: ${stats.retentionRate}`);
      
      return {
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Failed to get session statistics:', error);
      
      // Log the error
      await logEvent({
        actor: 'ai',
        project_id: projectId,
        event_type: 'analytics_session_stats_error',
        status: 'error',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        tags: ['analytics', 'session', 'statistics', 'error']
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }
  
  /**
   * Get detailed session information
   */
  static async getSessionDetails(sessionId: string): Promise<SessionDetailsResult> {
    try {
      console.log(`🔍 Getting session details for: ${sessionId.substring(0, 8)}...`);
      
      // Log the request
      await logEvent({
        actor: 'ai',
        session_id: sessionId,
        event_type: 'analytics_session_details_request',
        status: 'open',
        tags: ['analytics', 'session', 'details']
      });
      
      const startTime = Date.now();
      
      // Get session data from SessionTracker
      const sessionData = await SessionTracker.getSessionData(sessionId);
      
      const duration = Date.now() - startTime;
      
      if (!sessionData) {
        console.warn(`⚠️  Session not found: ${sessionId}`);
        
        await logEvent({
          actor: 'ai',
          session_id: sessionId,
          event_type: 'analytics_session_details_not_found',
          status: 'error',
          duration_ms: duration,
          tags: ['analytics', 'session', 'details', 'not_found']
        });
        
        return {
          success: false,
          error: 'Session not found',
          timestamp: new Date().toISOString()
        };
      }
      
      // Log successful completion
      await logEvent({
        actor: 'ai',
        session_id: sessionId,
        event_type: 'analytics_session_details_completed',
        status: 'closed',
        duration_ms: duration,
        metadata: {
          contexts_created: sessionData.contexts_created,
          decisions_created: sessionData.decisions_created,
          operations_count: sessionData.operations_count,
          productivity_score: sessionData.productivity_score,
          success_status: sessionData.success_status
        },
        tags: ['analytics', 'session', 'details', 'completed']
      });
      
      console.log(`✅ Session details retrieved in ${duration}ms`);
      console.log(`   Status: ${sessionData.success_status}, Operations: ${sessionData.operations_count}`);
      console.log(`   Contexts: ${sessionData.contexts_created}, Decisions: ${sessionData.decisions_created}`);
      
      return {
        success: true,
        data: sessionData,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Failed to get session details:', error);
      
      // Log the error
      await logEvent({
        actor: 'ai',
        session_id: sessionId,
        event_type: 'analytics_session_details_error',
        status: 'error',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        tags: ['analytics', 'session', 'details', 'error']
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }
  
  /**
   * Start a new session with analytics tracking
   */
  static async startSession(projectId?: string): Promise<SessionAnalyticsResult> {
    try {
      console.log(`🚀 Starting new session for project: ${projectId || 'none'}`);
      
      const startTime = Date.now();
      
      // Start session using SessionTracker
      const sessionId = await SessionTracker.startSession(projectId);
      
      const duration = Date.now() - startTime;
      
      // Get the newly created session data
      // const sessionData = await SessionTracker.getSessionData(sessionId);
      
      // Log session start analytics event
      await logEvent({
        actor: 'ai',
        project_id: projectId,
        session_id: sessionId,
        event_type: 'analytics_session_started',
        status: 'open',
        duration_ms: duration,
        metadata: {
          session_id: sessionId,
          project_id: projectId
        },
        tags: ['analytics', 'session', 'start']
      });
      
      console.log(`✅ Session started: ${sessionId.substring(0, 8)}... in ${duration}ms`);
      
      // Create fake SessionStats for consistency with the interface
      const stats: SessionStats = {
        totalSessions: 1,
        avgDuration: 0,
        productivityScore: 0,
        retentionRate: 0,
        sessionsByDay: []
      };
      
      return {
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Failed to start session:', error);
      
      // Log the error
      await logEvent({
        actor: 'ai',
        project_id: projectId,
        event_type: 'analytics_session_start_error',
        status: 'error',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        tags: ['analytics', 'session', 'start', 'error']
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }
  
  /**
   * End a session with analytics tracking
   */
  static async endSession(sessionId: string): Promise<SessionDetailsResult> {
    try {
      console.log(`🏁 Ending session: ${sessionId.substring(0, 8)}...`);
      
      const startTime = Date.now();
      
      // End session using SessionTracker
      const sessionData = await SessionTracker.endSession(sessionId);
      
      const duration = Date.now() - startTime;
      
      // Log session end analytics event
      await logEvent({
        actor: 'ai',
        session_id: sessionId,
        event_type: 'analytics_session_ended',
        status: 'closed',
        duration_ms: duration,
        metadata: {
          session_duration_ms: sessionData.duration_ms,
          contexts_created: sessionData.contexts_created,
          decisions_created: sessionData.decisions_created,
          productivity_score: sessionData.productivity_score,
          success_status: sessionData.success_status
        },
        tags: ['analytics', 'session', 'end', 'completed']
      });
      
      console.log(`✅ Session ended: ${sessionId.substring(0, 8)}... in ${duration}ms`);
      console.log(`   Final productivity score: ${sessionData.productivity_score}`);
      console.log(`   Status: ${sessionData.success_status}`);
      
      return {
        success: true,
        data: sessionData,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Failed to end session:', error);
      
      // Log the error
      await logEvent({
        actor: 'ai',
        session_id: sessionId,
        event_type: 'analytics_session_end_error',
        status: 'error',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        tags: ['analytics', 'session', 'end', 'error']
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }
  
  /**
   * Get current active session information
   */
  static async getActiveSession(): Promise<SessionDetailsResult> {
    try {
      console.log('🔍 Getting active session information');
      
      const startTime = Date.now();
      
      // Get active session ID
      const activeSessionId = await SessionTracker.getActiveSession();
      
      if (!activeSessionId) {
        console.log('ℹ️  No active session found');
        
        return {
          success: false,
          error: 'No active session found',
          timestamp: new Date().toISOString()
        };
      }
      
      // Get session data
      const sessionData = await SessionTracker.getSessionData(activeSessionId);
      
      const duration = Date.now() - startTime;
      
      // Log the request
      await logEvent({
        actor: 'ai',
        session_id: activeSessionId,
        event_type: 'analytics_active_session_request',
        status: 'closed',
        duration_ms: duration,
        tags: ['analytics', 'session', 'active']
      });
      
      console.log(`✅ Active session: ${activeSessionId.substring(0, 8)}... retrieved in ${duration}ms`);
      
      return {
        success: true,
        data: sessionData || undefined,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Failed to get active session:', error);
      
      // Log the error
      await logEvent({
        actor: 'ai',
        event_type: 'analytics_active_session_error',
        status: 'error',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        tags: ['analytics', 'session', 'active', 'error']
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }
  
  /**
   * Record an operation within the current session
   */
  static async recordOperation(operationType: string, projectId?: string): Promise<SessionAnalyticsResult> {
    try {
      console.log(`📝 Recording operation: ${operationType} for project: ${projectId || 'current'}`);
      
      const startTime = Date.now();
      
      // Ensure we have an active session
      let sessionId = await SessionTracker.getActiveSession();
      
      if (!sessionId) {
        // Start new session if none exists
        sessionId = await SessionTracker.startSession(projectId);
        console.log(`🚀 Auto-started session for operation: ${sessionId.substring(0, 8)}...`);
      }
      
      // Record the operation
      await SessionTracker.recordOperation(sessionId, operationType);
      
      const duration = Date.now() - startTime;
      
      // Log the operation recording
      await logEvent({
        actor: 'ai',
        project_id: projectId,
        session_id: sessionId,
        event_type: 'analytics_operation_recorded',
        status: 'closed',
        duration_ms: duration,
        metadata: {
          operation_type: operationType
        },
        tags: ['analytics', 'session', 'operation', operationType]
      });
      
      console.log(`✅ Operation recorded: ${operationType} in ${duration}ms`);
      
      // Return minimal stats response
      const stats: SessionStats = {
        totalSessions: 1,
        avgDuration: 0,
        productivityScore: 0,
        retentionRate: 0,
        sessionsByDay: []
      };
      
      return {
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Failed to record operation:', error);
      
      // Log the error
      await logEvent({
        actor: 'ai',
        project_id: projectId,
        event_type: 'analytics_operation_record_error',
        status: 'error',
        metadata: {
          operation_type: operationType,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        tags: ['analytics', 'session', 'operation', 'error']
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }
}

/**
 * Utility functions for external usage
 */

/**
 * Simple function to get session statistics
 */
export async function getSessionStatistics(projectId?: string): Promise<SessionStats | null> {
  try {
    const result = await SessionAnalyticsHandler.getSessionStats(projectId);
    return result.success ? result.data || null : null;
  } catch (error) {
    console.error('❌ Failed to get session statistics:', error);
    return null;
  }
}

/**
 * Simple function to record session operation
 */
export async function recordSessionOperation(operationType: string, projectId?: string): Promise<boolean> {
  try {
    const result = await SessionAnalyticsHandler.recordOperation(operationType, projectId);
    return result.success;
  } catch (error) {
    console.error('❌ Failed to record session operation:', error);
    return false;
  }
}

/**
 * Simple function to start session tracking
 */
export async function startSessionTracking(projectId?: string): Promise<string | null> {
  try {
    const result = await SessionAnalyticsHandler.startSession(projectId);
    if (result.success) {
      // Get the actual session ID from active session
      const activeSessionId = await SessionTracker.getActiveSession();
      return activeSessionId;
    }
    return null;
  } catch (error) {
    console.error('❌ Failed to start session tracking:', error);
    return null;
  }
}

/**
 * Export the main handler
 */
export default SessionAnalyticsHandler;
