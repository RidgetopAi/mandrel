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

      // Find project by name with improved error handling for service dependencies
      // Fixed TS009: Better project service dependency management
      let projects;
      try {
        projects = await projectHandler.listProjects();
        if (!projects || !Array.isArray(projects)) {
          return {
            success: false,
            message: 'Project service error: Invalid response from project service'
          };
        }
      } catch (error) {
        return {
          success: false,
          message: `Project service dependency error: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }

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

      // Update session with project ID with improved error handling
      // Fixed TS009: Better database dependency error handling
      try {
        const updateResult = await db.query(`
          UPDATE sessions 
          SET project_id = $1, 
              metadata = COALESCE(metadata, '{}') || $2
          WHERE id = $3
        `, [
          project.id,
          JSON.stringify({ assigned_manually: true, assigned_at: new Date().toISOString() }),
          activeSessionId
        ]);

        // Verify the update actually affected a row
        if (updateResult.rowCount === 0) {
          return {
            success: false,
            message: `Session ${activeSessionId.substring(0, 8)}... not found or already ended`
          };
        }
      } catch (dbError) {
        console.error('❌ Database error during session assignment:', dbError);
        return {
          success: false,
          message: `Database dependency error: ${dbError instanceof Error ? dbError.message : 'Unknown database error'}`
        };
      }

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

      // Get session details with project info (TS006-2: includes token columns, TS007-2: includes activity columns)
      const result = await db.query(`
        SELECT
          s.id,
          s.agent_type,
          s.started_at,
          s.ended_at,
          s.project_id,
          p.name as project_name,
          s.metadata,
          s.input_tokens,
          s.output_tokens,
          s.total_tokens,
          s.tasks_created,
          s.tasks_updated,
          s.tasks_completed,
          s.contexts_created,
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

      // TS006-2: Get in-memory token usage if session is active
      const tokenUsage = SessionTracker.getTokenUsage(activeSessionId);

      // TS007-2: Get in-memory activity counts if session is active
      const activityCounts = SessionTracker.getActivityCounts(activeSessionId);

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
          input_tokens: tokenUsage.input || parseInt(session.input_tokens) || 0,
          output_tokens: tokenUsage.output || parseInt(session.output_tokens) || 0,
          total_tokens: tokenUsage.total || parseInt(session.total_tokens) || 0,
          tasks_created: activityCounts.tasks_created || parseInt(session.tasks_created) || 0,
          tasks_updated: activityCounts.tasks_updated || parseInt(session.tasks_updated) || 0,
          tasks_completed: activityCounts.tasks_completed || parseInt(session.tasks_completed) || 0,
          contexts_created_tracked: activityCounts.contexts_created || parseInt(session.contexts_created) || 0,
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
   * Update session title and description
   */
  static async updateSessionDetails(
    sessionId: string, 
    title?: string, 
    description?: string
  ): Promise<{
    success: boolean;
    session?: any;
    message: string;
  }> {
    try {
      console.log(`✏️  Updating session ${sessionId.substring(0, 8)}... with title: "${title || ''}" description: "${description ? description.substring(0, 50) + '...' : ''}"`);

      // Verify session exists
      const sessionCheck = await db.query(`
        SELECT id, title, description, project_id 
        FROM sessions 
        WHERE id = $1
      `, [sessionId]);

      if (sessionCheck.rows.length === 0) {
        return {
          success: false,
          message: `Session ${sessionId} not found`
        };
      }

      const currentSession = sessionCheck.rows[0];

      // Build update query dynamically based on provided fields
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (title !== undefined) {
        updates.push(`title = $${paramIndex}`);
        values.push(title.trim() || null);
        paramIndex++;
      }

      if (description !== undefined) {
        updates.push(`description = $${paramIndex}`);
        values.push(description.trim() || null);
        paramIndex++;
      }

      // Always update the updated_at timestamp and metadata
      updates.push(`updated_at = NOW()`);
      updates.push(`metadata = COALESCE(metadata, '{}') || $${paramIndex}`);
      values.push(JSON.stringify({
        last_updated: new Date().toISOString(),
        updated_fields: {
          title: title !== undefined,
          description: description !== undefined
        },
        updated_by: 'session_management'
      }));
      paramIndex++;

      // Add session ID as final parameter
      values.push(sessionId);

      const updateQuery = `
        UPDATE sessions 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id, title, description, project_id, updated_at
      `;

      const updateResult = await db.query(updateQuery, values);
      const updatedSession = updateResult.rows[0];

      // Get project name if assigned
      let projectName = null;
      if (updatedSession.project_id) {
        const projectResult = await db.query(`
          SELECT name FROM projects WHERE id = $1
        `, [updatedSession.project_id]);
        if (projectResult.rows.length > 0) {
          projectName = projectResult.rows[0].name;
        }
      }

      // Log the update event
      await logEvent({
        actor: 'ai',
        session_id: sessionId,
        project_id: updatedSession.project_id,
        event_type: 'session_details_updated',
        status: 'closed',
        metadata: {
          previous_title: currentSession.title,
          new_title: updatedSession.title,
          previous_description: currentSession.description,
          new_description: updatedSession.description,
          fields_updated: {
            title: title !== undefined,
            description: description !== undefined
          }
        },
        tags: ['session', 'update', 'management']
      });

      console.log(`✅ Session ${sessionId.substring(0, 8)}... updated successfully`);

      return {
        success: true,
        session: {
          id: updatedSession.id,
          title: updatedSession.title,
          description: updatedSession.description,
          project_id: updatedSession.project_id,
          project_name: projectName,
          updated_at: updatedSession.updated_at
        },
        message: `Session details updated successfully`
      };

    } catch (error) {
      console.error('❌ Session update error:', error);
      
      // Log the error
      await logEvent({
        actor: 'ai',
        session_id: sessionId,
        event_type: 'session_update_error',
        status: 'error',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          attempted_title: title,
          attempted_description: description
        },
        tags: ['session', 'update', 'error']
      });

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to update session details'
      };
    }
  }

  /**
   * Get session details with title and description
   */
  static async getSessionDetailsWithMeta(sessionId: string): Promise<{
    success: boolean;
    session?: any;
    message: string;
  }> {
    try {
      console.log(`🔍 Getting detailed session info for: ${sessionId.substring(0, 8)}...`);

      const result = await db.query(`
        SELECT
          s.id,
          s.title,
          s.description,
          s.agent_type,
          s.started_at,
          s.ended_at,
          s.project_id,
          s.context_summary,
          s.updated_at,
          s.metadata,
          s.input_tokens,
          s.output_tokens,
          s.total_tokens,
          s.tasks_created,
          s.tasks_updated,
          s.tasks_completed,
          s.contexts_created,
          p.name as project_name,
          COALESCE((SELECT COUNT(*) FROM contexts c WHERE c.session_id = s.id), 0) as contexts_count,
          COALESCE((SELECT COUNT(*) FROM technical_decisions td WHERE td.session_id = s.id), 0) as decisions_count
        FROM sessions s
        LEFT JOIN projects p ON s.project_id = p.id
        WHERE s.id = $1
      `, [sessionId]);

      if (result.rows.length === 0) {
        return {
          success: false,
          message: `Session ${sessionId} not found`
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
          title: session.title,
          description: session.description,
          type: session.agent_type,
          started_at: session.started_at,
          ended_at: session.ended_at,
          updated_at: session.updated_at,
          project_id: session.project_id,
          project_name: session.project_name || 'No project assigned',
          context_summary: session.context_summary,
          duration_minutes: Math.round(duration / 60000),
          contexts_created: parseInt(session.contexts_count),
          decisions_created: parseInt(session.decisions_count),
          input_tokens: parseInt(session.input_tokens) || 0,
          output_tokens: parseInt(session.output_tokens) || 0,
          total_tokens: parseInt(session.total_tokens) || 0,
          tasks_created: parseInt(session.tasks_created) || 0,
          tasks_updated: parseInt(session.tasks_updated) || 0,
          tasks_completed: parseInt(session.tasks_completed) || 0,
          contexts_created_tracked: parseInt(session.contexts_created) || 0,
          metadata: session.metadata || {}
        },
        message: `Session details retrieved successfully`
      };

    } catch (error) {
      console.error('❌ Session details error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get session details'
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

      // Create new session with title
      const newSessionId = await SessionTracker.startSession(projectId || undefined, title);

      // Update with custom metadata
      if (title) {
        await db.query(`
          UPDATE sessions 
          SET metadata = COALESCE(metadata, '{}') || $1
          WHERE id = $2
        `, [
          JSON.stringify({ custom_title: true, session_type: 'manual' }),
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
