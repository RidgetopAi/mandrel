/**
 * Session Analytics Handler
 * 
 * Provides comprehensive session analytics and statistics.
 * - Session statistics retrieval
 * - Session details lookup
 * - Session lifecycle (start/end)
 * - Operation recording
 */

import { SessionTracker, SessionStats } from '../../../services/sessionTracker.js';
import { logEvent } from '../../../middleware/eventLogger.js';
import { SessionAnalyticsResult, SessionDetailsResult } from '../types.js';

export class SessionAnalyticsHandler {
  
  /**
   * Get comprehensive session statistics
   */
  static async getSessionStats(projectId?: string): Promise<SessionAnalyticsResult> {
    try {
      console.log(`📊 Getting session statistics for project: ${projectId || 'all'}`);
      
      await logEvent({
        actor: 'ai',
        project_id: projectId,
        event_type: 'analytics_session_stats_request',
        status: 'open',
        tags: ['analytics', 'session', 'statistics']
      });
      
      const startTime = Date.now();
      const stats = await SessionTracker.getSessionStats(projectId);
      const duration = Date.now() - startTime;
      
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
      
      await logEvent({
        actor: 'ai',
        session_id: sessionId,
        event_type: 'analytics_session_details_request',
        status: 'open',
        tags: ['analytics', 'session', 'details']
      });
      
      const startTime = Date.now();
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
  static async startSession(
    projectId?: string,
    title?: string,
    description?: string,
    sessionGoal?: string,
    tags?: string[],
    aiModel?: string,
    sessionType?: 'mcp-server' | 'AI Model'
  ): Promise<SessionDetailsResult> {
    try {
      console.log(`🚀 Starting new session for project: ${projectId || 'auto-detect'}`);
      if (title) console.log(`   Title: ${title}`);
      if (sessionGoal) console.log(`   Goal: ${sessionGoal}`);
      if (sessionType) console.log(`   Type: ${sessionType}`);

      const startTime = Date.now();

      const sessionId = await SessionTracker.startSession(
        projectId,
        title,
        description,
        sessionGoal,
        tags,
        aiModel,
        sessionType
      );

      const duration = Date.now() - startTime;
      const sessionData = await SessionTracker.getSessionData(sessionId);

      await logEvent({
        actor: 'ai',
        project_id: projectId,
        session_id: sessionId,
        event_type: 'analytics_session_started',
        status: 'open',
        duration_ms: duration,
        metadata: {
          session_id: sessionId,
          project_id: projectId,
          title,
          session_goal: sessionGoal,
          tags,
          ai_model: aiModel
        },
        tags: ['analytics', 'session', 'start']
      });

      console.log(`✅ Session started: ${sessionId.substring(0, 8)}... in ${duration}ms`);

      return {
        success: true,
        data: sessionData || undefined,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Failed to start session:', error);

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
      const sessionData = await SessionTracker.endSession(sessionId);
      const duration = Date.now() - startTime;
      
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
      const activeSessionId = await SessionTracker.getActiveSession();
      
      if (!activeSessionId) {
        console.log('ℹ️  No active session found');
        
        return {
          success: false,
          error: 'No active session found',
          timestamp: new Date().toISOString()
        };
      }
      
      const sessionData = await SessionTracker.getSessionData(activeSessionId);
      const duration = Date.now() - startTime;
      
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
      let sessionId = await SessionTracker.getActiveSession();
      
      if (!sessionId) {
        sessionId = await SessionTracker.startSession(projectId);
        console.log(`🚀 Auto-started session for operation: ${sessionId.substring(0, 8)}...`);
      }
      
      await SessionTracker.recordOperation(sessionId, operationType);
      const duration = Date.now() - startTime;
      
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
