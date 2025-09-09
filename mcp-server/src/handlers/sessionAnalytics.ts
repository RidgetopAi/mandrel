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
import { db } from '../config/database.js';
import { projectHandler } from './project.js';

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
 * Session Management Handler - For session assignment and control
 */
export class SessionManagementHandler {
  /**
   * Assign current session to a project
   */
  static async assignSessionToProject(projectName: string): Promise<{
    success: boolean;
    sessionId?: string;
    projectName?: string;
    message: string;
  }> {
    try {
      // Get current active session
      const activeSessionId = await SessionTracker.getActiveSession();
      if (!activeSessionId) {
        return {
          success: false,
          message: 'No active session found. Start AIDIS to create a new session.'
        };
      }

      // Find project by name
      const projects = await projectHandler.listProjects();
      const project = projects.find(p => 
        p.name.toLowerCase() === projectName.toLowerCase() ||
        p.name.toLowerCase().includes(projectName.toLowerCase())
      );

      if (!project) {
        const availableProjects = projects.map(p => p.name).join(', ');
        return {
          success: false,
          message: `Project '${projectName}' not found. Available projects: ${availableProjects}`
        };
      }

      // Update session with project ID
      await db.query(`
        UPDATE sessions 
        SET project_id = $1, 
            metadata = COALESCE(metadata, '{}') || $2
        WHERE id = $3
      `, [
        project.id,
        JSON.stringify({ assigned_manually: true, assigned_at: new Date().toISOString() }),
        activeSessionId
      ]);

      return {
        success: true,
        sessionId: activeSessionId,
        projectName: project.name,
        message: `✅ Session ${activeSessionId.substring(0, 8)}... assigned to project '${project.name}'`
      };

    } catch (error) {
      console.error('❌ Session assignment error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to assign session to project'
      };
    }
  }

  /**
   * Get current session status
   */
  static async getSessionStatus(): Promise<{
    success: boolean;
    session?: any;
    message: string;
  }> {
    try {
      // Get current active session
      const activeSessionId = await SessionTracker.getActiveSession();
      if (!activeSessionId) {
        return {
          success: false,
          message: 'No active session found'
        };
      }

      // Get session details with project info
      const result = await db.query(`
        SELECT 
          s.id,
          s.agent_type,
          s.started_at,
          s.ended_at,
          s.project_id,
          p.name as project_name,
          s.metadata,
          COALESCE((SELECT COUNT(*) FROM contexts c WHERE c.session_id = s.id), 0) as contexts_count,
          COALESCE((SELECT COUNT(*) FROM technical_decisions td WHERE td.session_id = s.id), 0) as decisions_count
        FROM sessions s
        LEFT JOIN projects p ON s.project_id = p.id
        WHERE s.id = $1
      `, [activeSessionId]);

      if (result.rows.length === 0) {
        return {
          success: false,
          message: 'Session not found'
        };
      }

      const session = result.rows[0];
      const duration = session.ended_at 
        ? new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()
        : Date.now() - new Date(session.started_at).getTime();

      return {
        success: true,
        session: {
          id: session.id,
          type: session.agent_type,
          started_at: session.started_at,
          project_name: session.project_name || 'No project assigned',
          duration_minutes: Math.round(duration / 60000),
          contexts_created: parseInt(session.contexts_count),
          decisions_created: parseInt(session.decisions_count),
          metadata: session.metadata || {}
        },
        message: `Current session: ${session.id.substring(0, 8)}...`
      };

    } catch (error) {
      console.error('❌ Session status error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get session status'
      };
    }
  }

  /**
   * Create new session with custom title and project
   */
  static async createNewSession(title?: string, projectName?: string): Promise<{
    success: boolean;
    sessionId?: string;
    projectName?: string;
    message: string;
  }> {
    try {
      let projectId = null;

      // Find project if specified
      if (projectName) {
        const projects = await projectHandler.listProjects();
        const project = projects.find(p => 
          p.name.toLowerCase() === projectName.toLowerCase() ||
          p.name.toLowerCase().includes(projectName.toLowerCase())
        );

        if (!project) {
          const availableProjects = projects.map(p => p.name).join(', ');
          return {
            success: false,
            message: `Project '${projectName}' not found. Available projects: ${availableProjects}`
          };
        }
        projectId = project.id;
        projectName = project.name;
      }

      // End current session if exists
      const currentSessionId = await SessionTracker.getActiveSession();
      if (currentSessionId) {
        await db.query(`
          UPDATE sessions 
          SET ended_at = NOW(),
              metadata = COALESCE(metadata, '{}') || $1
          WHERE id = $2 AND ended_at IS NULL
        `, [
          JSON.stringify({ ended_reason: 'new_session_started' }),
          currentSessionId
        ]);
      }

      // Create new session
      const newSessionId = await SessionTracker.startSession(projectId);

      // Update with custom title if provided
      if (title) {
        await db.query(`
          UPDATE sessions 
          SET metadata = COALESCE(metadata, '{}') || $1
          WHERE id = $2
        `, [
          JSON.stringify({ title: title, custom_title: true }),
          newSessionId
        ]);
      }

      return {
        success: true,
        sessionId: newSessionId,
        projectName: projectName || 'No project assigned',
        message: `✅ New session created: ${newSessionId.substring(0, 8)}...${title ? ` ("${title}")` : ''}${projectName ? ` for project '${projectName}'` : ''}`
      };

    } catch (error) {
      console.error('❌ New session error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create new session'
      };
    }
  }
}

/**
 * Export the handlers
 */
export default SessionAnalyticsHandler;
