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
import { projectHandler } from '../handlers/project.js';
import { detectAgentType } from '../utils/agentDetection.js';

export interface SessionData {
  session_id: string;
  start_time: Date;
  end_time?: Date;
  duration_ms?: number;
  project_id?: string;
  title?: string;
  description?: string;
  contexts_created: number;
  decisions_created: number;
  operations_count: number;
  productivity_score: number;
  success_status: 'active' | 'completed' | 'abandoned';
  status: 'active' | 'inactive' | 'disconnected';  // TS004-1: Session status enum
  last_activity_at?: Date;                          // TS004-1: Activity timeout tracking
  input_tokens: number;                             // TS006-2: Input tokens consumed
  output_tokens: number;                            // TS006-2: Output tokens generated
  total_tokens: number;                             // TS006-2: Total tokens (input + output)
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
  // TS006-2: In-memory token tracking for active sessions
  private static sessionTokens: Map<string, { input: number; output: number; total: number }> = new Map();
  // TS007-2: In-memory activity tracking for active sessions
  private static sessionActivity: Map<string, {
    tasks_created: number;
    tasks_updated: number;
    tasks_completed: number;
    contexts_created: number;
  }> = new Map();
  
  /**
   * Start a new session with smart project inheritance
   */
  static async startSession(projectId?: string, title?: string, description?: string): Promise<string> {
    try {
      const sessionId = randomUUID();
      const startTime = new Date();
      
      // Implement project inheritance hierarchy if no project specified
      let resolvedProjectId: string | null = projectId || null;

      if (!resolvedProjectId) {
        resolvedProjectId = await this.resolveProjectForSession(sessionId);
      }
      
      console.log(`🚀 Starting session: ${sessionId.substring(0, 8)}... for project: ${resolvedProjectId || 'none'}`);
      
      // Create actual session record in sessions table
      const sessionSql = `
        INSERT INTO sessions (
          id, project_id, agent_type, started_at, title, description, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, started_at
      `;
      
      // Auto-detect agent type based on environment
      const agentInfo = detectAgentType();

      const sessionParams = [
        sessionId,
        resolvedProjectId,
        agentInfo.type, // Auto-detected agent type (claude-code, cline, etc.)
        startTime,
        title || null,
        description || null,
        JSON.stringify({
          start_time: startTime.toISOString(),
          created_by: 'aidis-session-tracker',
          auto_created: true,
          agent_display_name: agentInfo.displayName,
          agent_detection_confidence: agentInfo.confidence,
          agent_version: agentInfo.version,
          project_resolution_method: resolvedProjectId === projectId ? 'explicit' : 'inherited',
          title_provided: !!title,
          description_provided: !!description
        })
      ];
      
      await db.query(sessionSql, sessionParams);
      
      // Also log session start event to analytics_events table for tracking
      const analyticsSql = `
        INSERT INTO analytics_events (
          actor, project_id, session_id, event_type, status, metadata, tags
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;
      
      const analyticsParams = [
        'system',
        projectId || null,
        sessionId,
        'session_start',
        'open',
        JSON.stringify({ start_time: startTime.toISOString() }),
        ['session', 'lifecycle']
      ];
      
      await db.query(analyticsSql, analyticsParams);
      
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
      
      // Count contexts created during this session
      const contextCountResult = await db.query(
        'SELECT COUNT(*) as count FROM contexts WHERE session_id = $1',
        [sessionId]
      );
      const contextsCreated = parseInt(contextCountResult.rows[0].count) || 0;

      // TS006-2: Get token usage from memory
      const tokenUsage = this.getTokenUsage(sessionId);

      // TS007-2: Get activity counts from memory
      const activityCounts = this.getActivityCounts(sessionId);

      // Update the sessions table with end time and stats
      const updateSessionSql = `
        UPDATE sessions
        SET ended_at = $1,
            tokens_used = $2,
            input_tokens = $3,
            output_tokens = $4,
            total_tokens = $5,
            tasks_created = $6,
            tasks_updated = $7,
            tasks_completed = $8,
            contexts_created = $9,
            context_summary = $10,
            metadata = metadata || $11::jsonb
        WHERE id = $12
      `;

      const sessionUpdateParams = [
        endTime,
        tokenUsage.total, // Backward compatibility with tokens_used
        tokenUsage.input,  // TS006-2: Input tokens
        tokenUsage.output, // TS006-2: Output tokens
        tokenUsage.total,  // TS006-2: Total tokens
        activityCounts.tasks_created,   // TS007-2: Tasks created
        activityCounts.tasks_updated,   // TS007-2: Tasks updated
        activityCounts.tasks_completed, // TS007-2: Tasks completed
        activityCounts.contexts_created, // TS007-2: Contexts created (overrides COUNT query)
        `Session completed with ${activityCounts.tasks_created} tasks and ${activityCounts.contexts_created} contexts`,
        JSON.stringify({
          end_time: endTime.toISOString(),
          duration_ms: durationMs,
          contexts_created: activityCounts.contexts_created,
          tasks_created: activityCounts.tasks_created,
          tasks_updated: activityCounts.tasks_updated,
          tasks_completed: activityCounts.tasks_completed,
          operations_count: sessionData.operations_count,
          productivity_score: sessionData.productivity_score,
          input_tokens: tokenUsage.input,
          output_tokens: tokenUsage.output,
          total_tokens: tokenUsage.total,
          completed_by: 'aidis-session-tracker'
        }),
        sessionId
      ];
      
      await db.query(updateSessionSql, sessionUpdateParams);
      
      // Also log session end event to analytics_events
      const analyticsSql = `
        INSERT INTO analytics_events (
          actor, project_id, session_id, event_type, status, duration_ms, metadata, tags
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;
      
      const analyticsParams = [
        'system',
        sessionData.project_id,
        sessionId,
        'session_end',
        'closed',
        durationMs,
        JSON.stringify({
          end_time: endTime.toISOString(),
          contexts_created: contextsCreated,
          decisions_created: sessionData.decisions_created,
          operations_count: sessionData.operations_count,
          productivity_score: sessionData.productivity_score
        }),
        ['session', 'lifecycle']
      ];
      
      await db.query(analyticsSql, analyticsParams);

      // Clear active session if this was it
      if (this.activeSessionId === sessionId) {
        this.activeSessionId = null;
      }

      // TS006-2: Clean up in-memory token tracking
      this.sessionTokens.delete(sessionId);

      // TS007-2: Clean up in-memory activity tracking
      this.sessionActivity.delete(sessionId);

      // Return final session data with calculated metrics
      const finalData: SessionData = {
        ...sessionData,
        end_time: endTime,
        duration_ms: durationMs,
        success_status: sessionData.operations_count > 0 ? 'completed' : 'abandoned',
        input_tokens: tokenUsage.input,
        output_tokens: tokenUsage.output,
        total_tokens: tokenUsage.total
      };
      
      console.log(`✅ Session ended: ${sessionId.substring(0, 8)}... Duration: ${Math.round(durationMs/1000)}s`);
      return finalData;
      
    } catch (error) {
      console.error('❌ Failed to end session:', error);
      throw error;
    }
  }
  
  /**
   * Get currently active session ID
   * TS003-1: Simplified logic - if server running → use memory, else last active session
   */
  static async getActiveSession(): Promise<string | null> {
    try {
      // If we have an active session in memory, return it
      if (this.activeSessionId) {
        return this.activeSessionId;
      }

      // Otherwise, get the last active session from database
      const sql = `
        SELECT id
        FROM sessions
        WHERE ended_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1
      `;

      const result = await db.query(sql);

      if (result.rows.length > 0) {
        this.activeSessionId = result.rows[0].id;
        return this.activeSessionId;
      }

      return null;

    } catch (error) {
      console.error('❌ Failed to get active session:', error);
      return null;
    }
  }


  /**
   * Clear active session from memory (for testing and explicit control)
   * Fixed TS009: Explicit session clearing without database fallback
   */
  static clearActiveSession(): void {
    if (this.activeSessionId) {
      console.log(`🧹 Clearing active session: ${this.activeSessionId.substring(0, 8)}...`);
      this.activeSessionId = null;
    }
  }

  /**
   * Set active session explicitly (for testing and recovery)
   * Fixed TS009: Explicit session control
   */
  static setActiveSession(sessionId: string | null): void {
    if (sessionId) {
      console.log(`📌 Setting active session: ${sessionId.substring(0, 8)}...`);
    } else {
      console.log(`🧹 Clearing active session explicitly`);
    }
    this.activeSessionId = sessionId;
  }

  /**
   * Update session activity timestamp
   * TS004-1: Track last activity for 2-hour timeout detection
   */
  static async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      const sql = `
        UPDATE sessions
        SET last_activity_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'active'
      `;

      await db.query(sql, [sessionId]);
    } catch (error) {
      // Don't throw - activity tracking failures shouldn't break functionality
      console.error('⚠️  Failed to update session activity:', error);
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

      // TS004-1: Update session activity timestamp
      await this.updateSessionActivity(sessionId);

      console.log(`✅ Operation recorded: ${operationType}`);

    } catch (error) {
      console.error('❌ Failed to record operation:', error);
      // Don't throw - operation logging failures shouldn't break functionality
    }
  }

  /**
   * Record token usage for a session
   * TS006-2: Track input, output, and total tokens
   */
  static recordTokenUsage(sessionId: string, inputTokens: number, outputTokens: number): void {
    try {
      // Get or create token tracking for this session
      let tokens = this.sessionTokens.get(sessionId);
      if (!tokens) {
        tokens = { input: 0, output: 0, total: 0 };
        this.sessionTokens.set(sessionId, tokens);
      }

      // Increment token counts
      tokens.input += inputTokens;
      tokens.output += outputTokens;
      tokens.total += inputTokens + outputTokens;

      console.log(`📊 Session ${sessionId.substring(0, 8)}... tokens: +${inputTokens} input, +${outputTokens} output (total: ${tokens.total})`);
    } catch (error) {
      console.error('❌ Failed to record token usage:', error);
      // Don't throw - token tracking failures shouldn't break functionality
    }
  }

  /**
   * Get current token usage for a session
   * TS006-2: Retrieve in-memory token counts
   */
  static getTokenUsage(sessionId: string): { input: number; output: number; total: number } {
    return this.sessionTokens.get(sessionId) || { input: 0, output: 0, total: 0 };
  }

  /**
   * Record task creation
   * TS007-2: Track when a task is created in this session
   */
  static recordTaskCreated(sessionId: string): void {
    try {
      const activity = this.sessionActivity.get(sessionId) || {
        tasks_created: 0,
        tasks_updated: 0,
        tasks_completed: 0,
        contexts_created: 0
      };
      activity.tasks_created += 1;
      this.sessionActivity.set(sessionId, activity);
      console.log(`📋 Session ${sessionId.substring(0, 8)}... task created (total: ${activity.tasks_created})`);
    } catch (error) {
      console.error('❌ Failed to record task creation:', error);
      // Don't throw - activity tracking failures shouldn't break functionality
    }
  }

  /**
   * Record task update
   * TS007-2: Track when a task is updated, including completion status
   */
  static recordTaskUpdated(sessionId: string, isCompleted: boolean = false): void {
    try {
      const activity = this.sessionActivity.get(sessionId) || {
        tasks_created: 0,
        tasks_updated: 0,
        tasks_completed: 0,
        contexts_created: 0
      };
      activity.tasks_updated += 1;
      if (isCompleted) {
        activity.tasks_completed += 1;
      }
      this.sessionActivity.set(sessionId, activity);
      console.log(`📋 Session ${sessionId.substring(0, 8)}... task updated (total: ${activity.tasks_updated}, completed: ${activity.tasks_completed})`);
    } catch (error) {
      console.error('❌ Failed to record task update:', error);
      // Don't throw - activity tracking failures shouldn't break functionality
    }
  }

  /**
   * Record context creation
   * TS007-2: Track when a context is created in this session
   */
  static recordContextCreated(sessionId: string): void {
    try {
      const activity = this.sessionActivity.get(sessionId) || {
        tasks_created: 0,
        tasks_updated: 0,
        tasks_completed: 0,
        contexts_created: 0
      };
      activity.contexts_created += 1;
      this.sessionActivity.set(sessionId, activity);
      console.log(`💬 Session ${sessionId.substring(0, 8)}... context created (total: ${activity.contexts_created})`);
    } catch (error) {
      console.error('❌ Failed to record context creation:', error);
      // Don't throw - activity tracking failures shouldn't break functionality
    }
  }

  /**
   * Get current activity counts for a session
   * TS007-2: Retrieve in-memory activity counts
   */
  static getActivityCounts(sessionId: string): {
    tasks_created: number;
    tasks_updated: number;
    tasks_completed: number;
    contexts_created: number;
  } {
    return this.sessionActivity.get(sessionId) || {
      tasks_created: 0,
      tasks_updated: 0,
      tasks_completed: 0,
      contexts_created: 0
    };
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

      // TS006-2: Get token usage (from memory for active sessions, or return zeros)
      const tokenUsage = this.getTokenUsage(sessionId);

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
        success_status: successStatus,
        status: !endTime ? 'active' : 'inactive',  // TS004-1: Add status field
        last_activity_at: undefined,  // TS004-1: Not populated in this method
        input_tokens: tokenUsage.input,   // TS006-2: Token tracking
        output_tokens: tokenUsage.output, // TS006-2: Token tracking
        total_tokens: tokenUsage.total    // TS006-2: Token tracking
      };
      
    } catch (error) {
      console.error('❌ Failed to get session data:', error);
      return null;
    }
  }
  
  /**
   * Resolve project for new session using TS010 hierarchy:
   * 1. Current project (from project handler context)
   * 2. User's primary project
   * 3. System default project (aidis-bootstrap)
   * 4. Create personal project
   */
  static async resolveProjectForSession(sessionId: string = 'default-session'): Promise<string | null> {
    try {
      console.log(`🔍 Resolving project for session ${sessionId} using TS010 hierarchy...`);
      
      // 1. Check current project from project handler context
      try {
        const currentProject = await projectHandler.getCurrentProject(sessionId);
        if (currentProject && currentProject.id && currentProject.id !== '00000000-0000-0000-0000-000000000000') {
          console.log(`✅ Using current project: ${currentProject.name} (${currentProject.id})`);
          return currentProject.id;
        }
      } catch (error) {
        const err = error as Error;
        console.log('⚠️  Could not access current project context:', err.message);
      }
      
      // 2. Check for user's primary project
      const primaryProjectSql = `
        SELECT id, name
        FROM projects 
        WHERE metadata->>'is_primary' = 'true'
        ORDER BY created_at DESC
        LIMIT 1
      `;
      
      const primaryResult = await db.query(primaryProjectSql);
      if (primaryResult.rows.length > 0) {
        const project = primaryResult.rows[0];
        console.log(`✅ Using primary project: ${project.name} (${project.id})`);
        return project.id;
      }
      
      // 3. Check for system default project (aidis-bootstrap)
      const systemDefaultSql = `
        SELECT id, name
        FROM projects 
        WHERE name = 'aidis-bootstrap'
        ORDER BY created_at DESC
        LIMIT 1
      `;
      
      const systemDefaultResult = await db.query(systemDefaultSql);
      if (systemDefaultResult.rows.length > 0) {
        const project = systemDefaultResult.rows[0];
        console.log(`✅ Using system default project: ${project.name} (${project.id})`);
        return project.id;
      }
      
      // 4. Create personal project as fallback
      console.log('🔧 Creating personal project as fallback...');
      const newProjectId = randomUUID();
      const createProjectSql = `
        INSERT INTO projects (
          id, name, description, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `;
      
      const projectParams = [
        newProjectId,
        'Personal Project',
        'Auto-created personal project for session management (TS010)',
        JSON.stringify({
          auto_created: true,
          created_for: 'ts010_session_management',
          is_personal: true,
          created_by: 'aidis-session-tracker',
          ts010_fallback: true
        }),
        new Date()
      ];
      
      await db.query(createProjectSql, projectParams);
      console.log(`✅ Created personal project: ${newProjectId}`);
      return newProjectId;
      
    } catch (error) {
      console.error('❌ Failed to resolve project for session:', error);
      
      // Emergency fallback - try to find ANY project
      try {
        const anyProjectSql = `SELECT id FROM projects ORDER BY created_at DESC LIMIT 1`;
        const anyResult = await db.query(anyProjectSql);
        if (anyResult.rows.length > 0) {
          const projectId = anyResult.rows[0].id;
          console.log(`⚠️  Emergency fallback to any project: ${projectId}`);
          return projectId;
        }
      } catch (fallbackError) {
        console.error('❌ Emergency fallback also failed:', fallbackError);
      }
      
      // Final fallback - return null and let database handle constraints
      console.log('⚠️  No project resolution possible, returning null');
      return null;
    }
  }

  /**
   * Update session title and description
   */
  static async updateSessionDetails(sessionId: string, title?: string, description?: string): Promise<boolean> {
    try {
      console.log(`✏️  Updating session details: ${sessionId.substring(0, 8)}...`);
      
      const updateSql = `
        UPDATE sessions 
        SET title = COALESCE($2, title),
            description = COALESCE($3, description),
            updated_at = NOW(),
            metadata = metadata || $4::jsonb
        WHERE id = $1
        RETURNING id, title, description
      `;
      
      const updateParams = [
        sessionId,
        title || null,
        description || null,
        JSON.stringify({
          title_updated: !!title,
          description_updated: !!description,
          updated_by: 'aidis-session-tracker',
          updated_at: new Date().toISOString()
        })
      ];
      
      const result = await db.query(updateSql, updateParams);
      
      if (result.rows.length > 0) {
        const updated = result.rows[0];
        console.log(`✅ Session details updated: "${updated.title}"`);
        return true;
      } else {
        console.log(`⚠️  Session ${sessionId} not found`);
        return false;
      }
      
    } catch (error) {
      console.error('❌ Failed to update session details:', error);
      return false;
    }
  }

  /**
   * Get session with title and description
   */
  static async getSessionWithDetails(sessionId: string): Promise<{
    id: string;
    title?: string;
    description?: string;
    project_id?: string;
    started_at: Date;
    ended_at?: Date;
  } | null> {
    try {
      const sql = `
        SELECT id, title, description, project_id, started_at, ended_at
        FROM sessions 
        WHERE id = $1
      `;
      
      const result = await db.query(sql, [sessionId]);
      
      if (result.rows.length > 0) {
        return result.rows[0];
      }
      
      return null;
      
    } catch (error) {
      console.error('❌ Failed to get session details:', error);
      return null;
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
export async function ensureActiveSession(projectId?: string, title?: string, description?: string): Promise<string> {
  let sessionId = await SessionTracker.getActiveSession();
  
  if (!sessionId) {
    sessionId = await SessionTracker.startSession(projectId, title, description);
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

/**
 * Get current session ID (utility wrapper)
 */
export async function getCurrentSession(): Promise<string | null> {
  return SessionTracker.getActiveSession();
}
