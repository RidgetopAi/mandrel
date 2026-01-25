/**
 * Session Management Handler
 * 
 * Provides session control and assignment operations.
 * - Session-to-project assignment
 * - Session status retrieval
 * - Session details updates
 * - New session creation with metadata
 */

import { SessionTracker } from '../../../services/sessionTracker.js';
import { logEvent } from '../../../middleware/eventLogger.js';
import { db } from '../../../config/database.js';
import { projectHandler } from '../../project.js';
import { SessionOperationResult, SessionStatusResult } from '../types.js';

export class SessionManagementHandler {
  /**
   * Assign current session to a project
   */
  static async assignSessionToProject(projectName: string): Promise<SessionOperationResult> {
    try {
      const activeSessionId = await SessionTracker.getActiveSession();
      if (!activeSessionId) {
        return {
          success: false,
          message: 'No active session found. Start AIDIS to create a new session.'
        };
      }

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
  static async getSessionStatus(): Promise<SessionStatusResult> {
    try {
      const activeSessionId = await SessionTracker.getActiveSession();
      if (!activeSessionId) {
        return {
          success: false,
          message: 'No active session found'
        };
      }

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
          s.session_goal,
          s.tags,
          s.lines_added,
          s.lines_deleted,
          s.lines_net,
          s.productivity_score,
          s.ai_model,
          s.files_modified_count,
          s.activity_count,
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

      const tokenUsage = SessionTracker.getTokenUsage(activeSessionId);
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
   * Update session title, description, goal, and tags (Phase 2 enhanced)
   */
  static async updateSessionDetails(
    sessionId: string,
    title?: string,
    description?: string,
    sessionGoal?: string,
    tags?: string[]
  ): Promise<{
    success: boolean;
    session?: any;
    message: string;
  }> {
    try {
      console.log(`✏️  Updating session ${sessionId.substring(0, 8)}... with title: "${title || ''}" description: "${description ? description.substring(0, 50) + '...' : ''}"`);

      this.validateSessionParams({ sessionGoal, tags, aiModel: undefined });

      const sessionCheck = await db.query(`
        SELECT id, title, description, session_goal, tags, project_id
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

      if (sessionGoal !== undefined) {
        updates.push(`session_goal = $${paramIndex}`);
        values.push(sessionGoal.trim() || null);
        paramIndex++;
      }

      if (tags !== undefined) {
        updates.push(`tags = $${paramIndex}`);
        values.push(tags);
        paramIndex++;
      }

      updates.push(`updated_at = NOW()`);
      updates.push(`metadata = COALESCE(metadata, '{}') || $${paramIndex}`);
      values.push(JSON.stringify({
        last_updated: new Date().toISOString(),
        updated_fields: {
          title: title !== undefined,
          description: description !== undefined,
          session_goal: sessionGoal !== undefined,
          tags: tags !== undefined
        },
        updated_by: 'session_management'
      }));
      paramIndex++;

      values.push(sessionId);

      const updateQuery = `
        UPDATE sessions
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id, title, description, session_goal, tags, project_id, updated_at
      `;

      const updateResult = await db.query(updateQuery, values);
      const updatedSession = updateResult.rows[0];

      let projectName = null;
      if (updatedSession.project_id) {
        const projectResult = await db.query(`
          SELECT name FROM projects WHERE id = $1
        `, [updatedSession.project_id]);
        if (projectResult.rows.length > 0) {
          projectName = projectResult.rows[0].name;
        }
      }

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
          previous_goal: currentSession.session_goal,
          new_goal: updatedSession.session_goal,
          previous_tags: currentSession.tags,
          new_tags: updatedSession.tags,
          fields_updated: {
            title: title !== undefined,
            description: description !== undefined,
            session_goal: sessionGoal !== undefined,
            tags: tags !== undefined
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
          session_goal: updatedSession.session_goal,
          tags: updatedSession.tags,
          project_id: updatedSession.project_id,
          project_name: projectName,
          updated_at: updatedSession.updated_at
        },
        message: `Session details updated successfully`
      };

    } catch (error) {
      console.error('❌ Session update error:', error);

      await logEvent({
        actor: 'ai',
        session_id: sessionId,
        event_type: 'session_update_error',
        status: 'error',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          attempted_title: title,
          attempted_description: description,
          attempted_goal: sessionGoal,
          attempted_tags: tags
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
          s.session_goal,
          s.tags,
          s.lines_added,
          s.lines_deleted,
          s.lines_net,
          s.productivity_score,
          s.ai_model,
          s.files_modified_count,
          s.activity_count,
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
   * Validate Phase 2 session parameters
   */
  private static validateSessionParams(params: {
    sessionGoal?: string;
    tags?: string[];
    aiModel?: string;
  }): void {
    const { sessionGoal, tags, aiModel } = params;

    if (tags !== undefined) {
      if (!Array.isArray(tags)) {
        throw new Error('tags must be an array of strings');
      }
      tags.forEach((tag, index) => {
        if (typeof tag !== 'string') {
          throw new Error(`Tag at index ${index} must be a string`);
        }
        if (tag.trim().length === 0) {
          throw new Error(`Tag at index ${index} cannot be empty`);
        }
        if (tag.length > 50) {
          throw new Error(`Tag at index ${index} exceeds max length of 50 characters`);
        }
      });
    }

    if (sessionGoal !== undefined && sessionGoal.length > 1000) {
      throw new Error('sessionGoal must be 1000 characters or less');
    }

    if (aiModel !== undefined) {
      if (aiModel.trim().length === 0) {
        throw new Error('aiModel cannot be empty');
      }
      if (aiModel.length > 100) {
        throw new Error('aiModel must be 100 characters or less');
      }
    }
  }

  /**
   * Create new session with custom title and project (Phase 2 enhanced)
   */
  static async createNewSession(
    title?: string,
    projectName?: string,
    description?: string,
    sessionGoal?: string,
    tags?: string[],
    aiModel?: string
  ): Promise<SessionOperationResult> {
    try {
      this.validateSessionParams({ sessionGoal, tags, aiModel });

      let projectId = null;
      let resolvedProjectName = projectName;

      if (projectName) {
        const projects = await projectHandler.listProjects();
        const project = projects.find(p =>
          p.name.toLowerCase() === projectName?.toLowerCase() ||
          p.name.toLowerCase().includes(projectName?.toLowerCase() || '')
        );

        if (!project) {
          const availableProjects = projects.map(p => p.name).join(', ');
          return {
            success: false,
            message: `Project '${projectName}' not found. Available projects: ${availableProjects}`
          };
        }
        projectId = project.id;
        resolvedProjectName = project.name;
      }

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

      const newSessionId = await SessionTracker.startSession(
        projectId || undefined,
        title,
        description,
        sessionGoal,
        tags,
        aiModel
      );

      if (title || description || sessionGoal || tags || aiModel) {
        await db.query(`
          UPDATE sessions
          SET metadata = COALESCE(metadata, '{}') || $1
          WHERE id = $2
        `, [
          JSON.stringify({
            custom_title: !!title,
            session_type: 'manual',
            phase2_enhanced: true,
            has_goal: !!sessionGoal,
            has_tags: tags && tags.length > 0,
            has_ai_model: !!aiModel
          }),
          newSessionId
        ]);
      }

      return {
        success: true,
        sessionId: newSessionId,
        projectName: resolvedProjectName || 'No project assigned',
        message: `✅ New session created: ${newSessionId.substring(0, 8)}...${title ? ` ("${title}")` : ''}${resolvedProjectName ? ` for project '${resolvedProjectName}'` : ''}`
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
