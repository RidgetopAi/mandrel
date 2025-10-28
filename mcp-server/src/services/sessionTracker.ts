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
import { logger } from '../utils/logger.js';

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
  // Phase 2 new fields - all optional for backward compatibility
  session_goal?: string | null;                     // User-defined goal for session
  tags?: string[];                                  // Array of tags (text[] in DB)
  lines_added?: number;                             // LOC metrics from git/tool tracking
  lines_deleted?: number;                           // LOC metrics from git/tool tracking
  lines_net?: number;                               // Net LOC change (added - deleted)
  ai_model?: string | null;                         // AI model identifier (e.g., 'claude-sonnet-4-5')
  files_modified_count?: number;                    // Count of unique files modified
  activity_count?: number;                          // Total activity events count
}

// Re-export types from shared types file (to avoid circular dependency with sessionFormatters)
export type { SessionStats, SessionActivity, SessionFile, ProductivityConfig } from '../types/session.js';

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
   * Phase 2: Added sessionGoal, tags, and aiModel parameters
   */
  static async startSession(
    projectId?: string,
    title?: string,
    description?: string,
    sessionGoal?: string,
    tags?: string[],
    aiModel?: string
  ): Promise<string> {
    try {
      const sessionId = randomUUID();
      const startTime = new Date();

      // Implement project inheritance hierarchy if no project specified
      let resolvedProjectId: string | null = projectId || null;

      if (!resolvedProjectId) {
        resolvedProjectId = await this.resolveProjectForSession(sessionId);
      }

      console.log(`🚀 Starting session: ${sessionId.substring(0, 8)}... for project: ${resolvedProjectId || 'none'}`);

      // Capture git information (branch and commit SHA)
      let activeBranch: string | null = null;
      let workingCommitSha: string | null = null;

      try {
        const { execSync } = await import('child_process');

        // Get current branch
        try {
          activeBranch = execSync('git rev-parse --abbrev-ref HEAD', {
            encoding: 'utf8',
            cwd: process.cwd(),
            stdio: ['ignore', 'pipe', 'ignore']
          }).trim();
          console.log(`🌿 Git branch: ${activeBranch}`);
        } catch (error) {
          console.warn('⚠️  Could not detect git branch (not in a git repository?)');
        }

        // Get current commit SHA
        try {
          workingCommitSha = execSync('git rev-parse HEAD', {
            encoding: 'utf8',
            cwd: process.cwd(),
            stdio: ['ignore', 'pipe', 'ignore']
          }).trim();
          console.log(`📌 Git commit: ${workingCommitSha.substring(0, 8)}...`);
        } catch (error) {
          console.warn('⚠️  Could not detect git commit SHA');
        }
      } catch (error) {
        console.warn('⚠️  Failed to capture git information:', error);
        // Continue without git info - not a fatal error
      }

      // Create actual session record in sessions table
      const sessionSql = `
        INSERT INTO sessions (
          id, project_id, agent_type, started_at, last_activity_at, title, description,
          session_goal, tags, ai_model, active_branch, working_commit_sha, metadata
        ) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id, started_at
      `;

      console.log('🐛 DEBUG: Session SQL includes last_activity_at:', sessionSql.includes('last_activity_at'));

      // Auto-detect agent type based on environment
      const agentInfo = detectAgentType();

      const sessionParams = [
        sessionId,
        resolvedProjectId,
        agentInfo.type, // Auto-detected agent type (claude-code, cline, etc.)
        startTime,
        title || null,
        description || null,
        sessionGoal || null,                           // Phase 2: Session goal
        tags || [],                                    // Phase 2: Tags array
        aiModel || null,                               // Phase 2: AI model
        activeBranch,                                  // Git: Active branch
        workingCommitSha,                              // Git: Starting commit SHA
        JSON.stringify({
          start_time: startTime.toISOString(),
          created_by: 'aidis-session-tracker',
          auto_created: true,
          agent_display_name: agentInfo.displayName,
          agent_detection_confidence: agentInfo.confidence,
          agent_version: agentInfo.version,
          ai_model: aiModel || null,
          git_branch: activeBranch,
          git_start_commit: workingCommitSha,
          project_resolution_method: resolvedProjectId === projectId ? 'explicit' : 'inherited',
          title_provided: !!title,
          description_provided: !!description,
          session_goal_provided: !!sessionGoal,
          tags_provided: !!(tags && tags.length > 0)
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

      // Sync file changes from git before calculating final metrics
      console.log(`📁 Syncing file changes from git...`);
      try {
        const fileSync = await this.syncFilesFromGit(sessionId);
        console.log(`✅ File sync complete: ${fileSync.filesProcessed} files, +${fileSync.totalLinesAdded}/-${fileSync.totalLinesDeleted} lines`);
      } catch (error) {
        console.warn('⚠️  Failed to sync files from git:', error);
        // Don't fail session end if file sync fails
      }

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

      // Calculate and update productivity score
      const productivityScore = await this.calculateProductivity(sessionId);
      await db.query(
        'UPDATE sessions SET productivity_score = $1 WHERE id = $2',
        [productivityScore, sessionId]
      );

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

      // Update session activity_count and last_activity_at
      // Also update specific metric columns based on operation type
      let updateSql = `
        UPDATE sessions
        SET activity_count = COALESCE(activity_count, 0) + 1,
            last_activity_at = NOW()`;

      // Increment specific counters based on operation type
      if (operationType.includes('context')) {
        updateSql += `,\n            contexts_created = COALESCE(contexts_created, 0) + 1`;
      }
      if (operationType.includes('task')) {
        updateSql += `,\n            tasks_created = COALESCE(tasks_created, 0) + 1`;
      }

      updateSql += `\n        WHERE id = $1`;

      await db.query(updateSql, [sessionId]);

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
   * Phase 2: Refactored to query sessions table directly for better performance
   */
  static async getSessionData(sessionId: string): Promise<SessionData | null> {
    try {
      // Query sessions table directly for better performance
      const sessionQuery = `
        SELECT
          s.id,
          s.project_id,
          s.started_at,
          s.ended_at,
          s.title,
          s.description,
          s.session_goal,
          s.tags,
          s.lines_added,
          s.lines_deleted,
          s.lines_net,
          s.productivity_score,
          s.ai_model,
          s.files_modified_count,
          s.activity_count,
          s.status,
          s.last_activity_at,
          s.input_tokens,
          s.output_tokens,
          s.total_tokens,
          s.contexts_created,
          s.tasks_created,
          s.tasks_updated,
          s.tasks_completed,
          EXTRACT(EPOCH FROM (COALESCE(s.ended_at, NOW()) - s.started_at)) * 1000 as duration_ms
        FROM sessions s
        WHERE s.id = $1
      `;

      const result = await db.query(sessionQuery, [sessionId]);

      if (result.rows.length === 0) {
        console.log(`⚠️  Session ${sessionId} not found in database`);
        return null;
      }

      const session = result.rows[0];

      // Get in-memory token usage if session is active
      const tokenUsage = this.getTokenUsage(sessionId);
      const activityCounts = this.getActivityCounts(sessionId);

      // Count decisions from technical_decisions table
      const decisionsResult = await db.query(
        'SELECT COUNT(*) as count FROM technical_decisions WHERE session_id = $1',
        [sessionId]
      );
      const decisionsCount = parseInt(decisionsResult.rows[0]?.count || '0');

      return {
        session_id: session.id,
        start_time: session.started_at,
        end_time: session.ended_at,
        duration_ms: parseFloat(session.duration_ms) || 0,
        project_id: session.project_id,
        title: session.title,
        description: session.description,

        // Phase 2 new fields from database
        session_goal: session.session_goal,
        tags: session.tags || [],
        lines_added: session.lines_added || 0,
        lines_deleted: session.lines_deleted || 0,
        lines_net: session.lines_net || 0,
        productivity_score: parseFloat(session.productivity_score) || 0,
        ai_model: session.ai_model,
        files_modified_count: session.files_modified_count || 0,
        activity_count: session.activity_count || 0,

        // Existing fields - prefer in-memory counts for active sessions
        contexts_created: activityCounts.contexts_created || session.contexts_created || 0,
        decisions_created: decisionsCount,
        operations_count: session.activity_count || 0,
        success_status: !session.ended_at ? 'active' :
                       (session.activity_count > 0 ? 'completed' : 'abandoned'),
        status: session.status || 'active',
        last_activity_at: session.last_activity_at,

        // Token usage - prefer in-memory for active sessions
        input_tokens: tokenUsage.input || session.input_tokens || 0,
        output_tokens: tokenUsage.output || session.output_tokens || 0,
        total_tokens: tokenUsage.total || session.total_tokens || 0
      };

    } catch (error) {
      console.error('❌ Failed to get session data:', error);
      return null;
    }
  }

  /**
   * Record activity event in session_activities table
   * Automatically updates session.activity_count
   */
  static async recordActivity(
    sessionId: string,
    activityType: string,
    activityData: Record<string, any> = {}
  ): Promise<void> {
    try {
      // Insert activity record
      const insertSql = `
        INSERT INTO session_activities (
          session_id, activity_type, activity_data, occurred_at
        ) VALUES ($1, $2, $3, NOW())
        RETURNING id
      `;

      await db.query(insertSql, [sessionId, activityType, JSON.stringify(activityData)]);

      // Update session activity count
      const updateSql = `
        UPDATE sessions
        SET activity_count = (SELECT COUNT(*) FROM session_activities WHERE session_id = $1),
            last_activity_at = NOW()
        WHERE id = $1
      `;

      await db.query(updateSql, [sessionId]);

      logger.debug(`Activity recorded: ${activityType}`, {
        component: 'SessionTracker',
        operation: 'recordActivity',
        metadata: {
          sessionId: sessionId.substring(0, 8),
          activityType
        }
      });

    } catch (error) {
      logger.error('Failed to record activity', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionTracker',
        operation: 'recordActivity',
        metadata: {
          sessionId,
          activityType
        }
      });
      // Don't throw - activity recording shouldn't break main flow
    }
  }

  /**
   * Get all activities for a session with optional type filtering
   */
  static async getSessionActivities(
    sessionId: string,
    activityType?: string,
    limit: number = 100
  ): Promise<SessionActivity[]> {
    try {
      const sql = activityType
        ? `SELECT id, session_id, activity_type, activity_data, occurred_at, created_at
           FROM session_activities
           WHERE session_id = $1 AND activity_type = $2
           ORDER BY occurred_at DESC
           LIMIT $3`
        : `SELECT id, session_id, activity_type, activity_data, occurred_at, created_at
           FROM session_activities
           WHERE session_id = $1
           ORDER BY occurred_at DESC
           LIMIT $2`;

      const params = activityType
        ? [sessionId, activityType, limit]
        : [sessionId, limit];

      const result = await db.query(sql, params);

      return result.rows.map(row => ({
        id: row.id,
        session_id: row.session_id,
        activity_type: row.activity_type,
        activity_data: row.activity_data,
        occurred_at: row.occurred_at,
        created_at: row.created_at
      }));

    } catch (error) {
      logger.error('Failed to get session activities', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionTracker',
        operation: 'getSessionActivities',
        metadata: {
          sessionId
        }
      });
      return [];
    }
  }

  /**
   * Record file modification in session_files table
   * Uses UPSERT pattern - adds lines to existing file records
   */
  static async recordFileModification(
    sessionId: string,
    filePath: string,
    linesAdded: number,
    linesDeleted: number,
    source: 'tool' | 'git' | 'manual' = 'tool'
  ): Promise<void> {
    try {
      // Upsert into session_files table
      // For 'git' source: REPLACE values (git diff is absolute, not incremental)
      // For 'tool'/'manual' source: ADD values (incremental edits during session)
      const upsertSql = source === 'git'
        ? `
          INSERT INTO session_files (
            session_id, file_path, lines_added, lines_deleted, source, first_modified, last_modified
          ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
          ON CONFLICT (session_id, file_path)
          DO UPDATE SET
            lines_added = EXCLUDED.lines_added,
            lines_deleted = EXCLUDED.lines_deleted,
            source = EXCLUDED.source,
            last_modified = NOW()
          RETURNING id
        `
        : `
          INSERT INTO session_files (
            session_id, file_path, lines_added, lines_deleted, source, first_modified, last_modified
          ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
          ON CONFLICT (session_id, file_path)
          DO UPDATE SET
            lines_added = session_files.lines_added + EXCLUDED.lines_added,
            lines_deleted = session_files.lines_deleted + EXCLUDED.lines_deleted,
            last_modified = NOW()
          RETURNING id
        `;

      await db.query(upsertSql, [sessionId, filePath, linesAdded, linesDeleted, source]);

      // Update session-level aggregates
      await this.updateSessionFileMetrics(sessionId);

      logger.debug(`File modification recorded: ${filePath}`, {
        component: 'SessionTracker',
        operation: 'recordFileModification',
        metadata: {
          sessionId: sessionId.substring(0, 8),
          filePath,
          linesAdded,
          linesDeleted,
          source
        }
      });

    } catch (error) {
      logger.error('Failed to record file modification', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionTracker',
        operation: 'recordFileModification',
        metadata: {
          sessionId,
          filePath
        }
      });
      // Don't throw - file tracking shouldn't break main flow
    }
  }

  /**
   * Update session-level file and LOC metrics from session_files table
   * Private helper method for recordFileModification
   */
  private static async updateSessionFileMetrics(sessionId: string): Promise<void> {
    try {
      const updateSql = `
        UPDATE sessions
        SET
          files_modified_count = (SELECT COUNT(DISTINCT file_path) FROM session_files WHERE session_id = $1),
          lines_added = (SELECT COALESCE(SUM(lines_added), 0) FROM session_files WHERE session_id = $1),
          lines_deleted = (SELECT COALESCE(SUM(lines_deleted), 0) FROM session_files WHERE session_id = $1),
          lines_net = (SELECT COALESCE(SUM(lines_added - lines_deleted), 0) FROM session_files WHERE session_id = $1)
        WHERE id = $1
      `;

      await db.query(updateSql, [sessionId]);

    } catch (error) {
      logger.error('Failed to update session file metrics', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionTracker',
        operation: 'updateSessionFileMetrics',
        metadata: {
          sessionId
        }
      });
    }
  }

  /**
   * Get all files modified in a session
   */
  static async getSessionFiles(sessionId: string): Promise<SessionFile[]> {
    try {
      const sql = `
        SELECT
          id, session_id, file_path, lines_added, lines_deleted,
          source, first_modified, last_modified
        FROM session_files
        WHERE session_id = $1
        ORDER BY last_modified DESC
      `;

      const result = await db.query(sql, [sessionId]);

      return result.rows.map(row => ({
        id: row.id,
        session_id: row.session_id,
        file_path: row.file_path,
        lines_added: row.lines_added,
        lines_deleted: row.lines_deleted,
        source: row.source,
        first_modified: row.first_modified,
        last_modified: row.last_modified
      }));

    } catch (error) {
      logger.error('Failed to get session files', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionTracker',
        operation: 'getSessionFiles',
        metadata: {
          sessionId
        }
      });
      return [];
    }
  }

  /**
   * Calculate productivity score using configurable formula
   * Supports custom formulas from productivity_config table
   */
  static async calculateProductivityScore(
    sessionId: string,
    configName: string = 'default'
  ): Promise<number> {
    try {
      // Get productivity config
      const configResult = await db.query(
        'SELECT formula_weights FROM productivity_config WHERE config_name = $1',
        [configName]
      );

      if (configResult.rows.length === 0) {
        logger.warn(`Productivity config '${configName}' not found, using fallback calculation`, {
          component: 'SessionTracker',
          operation: 'calculateProductivityScore'
        });
        // Fallback to existing calculateProductivity method
        return this.calculateProductivity(sessionId);
      }

      const weights = configResult.rows[0].formula_weights;

      // Get session data
      const sessionData = await this.getSessionData(sessionId);
      if (!sessionData) {
        logger.warn(`Session ${sessionId} not found for productivity calculation`, {
          component: 'SessionTracker',
          operation: 'calculateProductivityScore'
        });
        return 0;
      }

      // Calculate weighted score
      let score = 0;
      let totalWeight = 0;

      // Tasks component (tasks completed)
      if (weights.tasks !== undefined) {
        const tasksCompleted = sessionData.contexts_created || 0; // Using contexts as proxy
        score += weights.tasks * tasksCompleted * 10; // Scale factor
        totalWeight += weights.tasks;
      }

      // Context component (contexts created)
      if (weights.context !== undefined) {
        const contextsCreated = sessionData.contexts_created || 0;
        score += weights.context * contextsCreated * 10; // Scale factor
        totalWeight += weights.context;
      }

      // Decisions component (technical decisions)
      if (weights.decisions !== undefined) {
        const decisionsCreated = sessionData.decisions_created || 0;
        score += weights.decisions * decisionsCreated * 15; // Higher value per decision
        totalWeight += weights.decisions;
      }

      // LOC component (lines of code)
      if (weights.loc !== undefined) {
        const linesNet = sessionData.lines_net || 0;
        // Positive LOC weighted higher than negative
        const locScore = linesNet > 0 ? linesNet / 10 : linesNet / 20;
        score += weights.loc * locScore;
        totalWeight += weights.loc;
      }

      // Time component (efficiency - inverse of duration)
      if (weights.time !== undefined && sessionData.duration_ms) {
        const hours = sessionData.duration_ms / (1000 * 60 * 60);
        // Efficiency: more output in less time = higher score
        const timeEfficiency = totalWeight > 0 ? score / (hours + 1) : 0;
        score = score * (1 + weights.time * (timeEfficiency / 100));
      }

      // Normalize to 0-100 scale
      const finalScore = Math.min(Math.max(score, 0), 100);
      const roundedScore = Math.round(finalScore * 100) / 100;

      // Update session with calculated score
      await db.query(
        'UPDATE sessions SET productivity_score = $1 WHERE id = $2',
        [roundedScore, sessionId]
      );

      logger.debug(`Productivity score calculated: ${roundedScore}`, {
        component: 'SessionTracker',
        operation: 'calculateProductivityScore',
        metadata: {
          sessionId: sessionId.substring(0, 8),
          configName,
          score: roundedScore
        }
      });

      return roundedScore;

    } catch (error) {
      logger.error('Failed to calculate productivity score', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionTracker',
        operation: 'calculateProductivityScore',
        metadata: {
          sessionId
        }
      });
      return 0;
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
   * Phase 2: Added sessionGoal and tags parameters
   */
  static async updateSessionDetails(
    sessionId: string,
    title?: string,
    description?: string,
    sessionGoal?: string,
    tags?: string[]
  ): Promise<boolean> {
    try {
      console.log(`✏️  Updating session details: ${sessionId.substring(0, 8)}...`);

      const updateSql = `
        UPDATE sessions
        SET title = COALESCE($2, title),
            description = COALESCE($3, description),
            session_goal = COALESCE($4, session_goal),
            tags = COALESCE($5, tags),
            updated_at = NOW(),
            metadata = metadata || $6::jsonb
        WHERE id = $1
        RETURNING id, title, description, session_goal, tags
      `;

      const updateParams = [
        sessionId,
        title || null,
        description || null,
        sessionGoal || null,
        tags || null,
        JSON.stringify({
          title_updated: !!title,
          description_updated: !!description,
          session_goal_updated: !!sessionGoal,
          tags_updated: !!(tags && tags.length > 0),
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
          AND ae2.event_type NOT IN ('session_start', 'session_end')
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
      
      // Calculate overall productivity score from sessions table (Phase 2)
      // Productivity score is calculated and stored during endSession()
      const productivitySql = `
        SELECT AVG(productivity_score) as avg_productivity
        FROM sessions
        WHERE ended_at IS NOT NULL ${projectFilter}
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
  /**
   * Generate comprehensive session summary (Phase 3)
   */
  static async generateSessionSummary(sessionId: string): Promise<string> {
    try {
      // Get session data
      const sessionResult = await db.query(`
        SELECT * FROM v_session_summaries WHERE id = $1
      `, [sessionId]);

      if (sessionResult.rows.length === 0) {
        return `❌ Session not found: ${sessionId}`;
      }

      const session = sessionResult.rows[0];

      // Get top 5 activities
      const activities = await this.getSessionActivities(sessionId, undefined, 5);

      // Get top 3 files
      const filesResult = await db.query(`
        SELECT file_path, lines_added, lines_deleted
        FROM session_files
        WHERE session_id = $1
        ORDER BY (lines_added + lines_deleted) DESC
        LIMIT 3
      `, [sessionId]);

      // Get decisions count
      const decisionsResult = await db.query(`
        SELECT COUNT(*) as count
        FROM technical_decisions
        WHERE session_id = $1
      `, [sessionId]);

      const decisionsCount = parseInt(decisionsResult.rows[0]?.count || '0');

      // Format and return
      const { formatSessionSummary } = await import('../utils/sessionFormatters.js');
      return formatSessionSummary(session, activities, filesResult.rows, decisionsCount);
    } catch (error) {
      logger.error('Failed to generate session summary', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionTracker',
        operation: 'generateSessionSummary',
        metadata: { sessionId }
      });
      throw error;
    }
  }

  /**
   * Flush in-memory token usage to database
   * Called periodically and on shutdown
   */
  static async flushTokensToDatabase(): Promise<void> {
    try {
      const flushPromises: Array<{ sessionId: string; promise: Promise<any> }> = [];

      for (const [sessionId, tokens] of this.sessionTokens.entries()) {
        const updatePromise = db.query(
          `UPDATE sessions
           SET input_tokens = input_tokens + $1,
               output_tokens = output_tokens + $2,
               total_tokens = total_tokens + $3
           WHERE id = $4`,
          [tokens.input, tokens.output, tokens.total, sessionId]
        );
        flushPromises.push({ sessionId, promise: updatePromise });
      }

      if (flushPromises.length > 0) {
        // Use allSettled to prevent one failure from killing all flushes
        const results = await Promise.allSettled(flushPromises.map(f => f.promise));

        let successCount = 0;
        let failureCount = 0;
        const failedSessions: string[] = [];

        results.forEach((result, index) => {
          const sessionId = flushPromises[index].sessionId;

          if (result.status === 'fulfilled') {
            successCount++;
            // Remove successfully flushed session from memory
            this.sessionTokens.delete(sessionId);
          } else {
            failureCount++;
            failedSessions.push(sessionId.substring(0, 8));
            console.error(`❌ Failed to flush tokens for session ${sessionId.substring(0, 8)}:`, result.reason);
          }
        });

        console.log(`💾 Flushed token data: ${successCount} succeeded, ${failureCount} failed`);
        if (failedSessions.length > 0) {
          console.error(`⚠️  Failed sessions (will retry): ${failedSessions.join(', ')}`);
        }
      }
    } catch (error) {
      console.error('❌ FLUSH TOKENS ERROR:', error);
      console.error('Error type:', error instanceof Error ? error.constructor.name : typeof error);
      console.error('Error message:', error instanceof Error ? error.message : String(error));
      console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
      console.error('Session tokens map size:', this.sessionTokens.size);
      console.error('Session tokens:', Array.from(this.sessionTokens.entries()).map(([id, tokens]) => ({
        sessionId: id.substring(0, 8),
        input: tokens.input,
        output: tokens.output,
        total: tokens.total
      })));

      logger.error('Failed to flush tokens to database', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionTracker',
        operation: 'flushTokensToDatabase'
      });
    }
  }

  /**
   * Flush in-memory activity counts to database
   * Called periodically and on shutdown
   */
  static async flushActivityToDatabase(): Promise<void> {
    try {
      const flushPromises: Array<{ sessionId: string; promise: Promise<any> }> = [];

      for (const [sessionId, activity] of this.sessionActivity.entries()) {
        const updatePromise = db.query(
          `UPDATE sessions
           SET tasks_created = tasks_created + $1,
               tasks_updated = tasks_updated + $2,
               tasks_completed = tasks_completed + $3,
               contexts_created = contexts_created + $4,
               last_activity_at = NOW()
           WHERE id = $5`,
          [
            activity.tasks_created,
            activity.tasks_updated,
            activity.tasks_completed,
            activity.contexts_created,
            sessionId
          ]
        );
        flushPromises.push({ sessionId, promise: updatePromise });
      }

      if (flushPromises.length > 0) {
        // Use allSettled to prevent one failure from killing all flushes
        const results = await Promise.allSettled(flushPromises.map(f => f.promise));

        let successCount = 0;
        let failureCount = 0;
        const failedSessions: string[] = [];

        results.forEach((result, index) => {
          const sessionId = flushPromises[index].sessionId;

          if (result.status === 'fulfilled') {
            successCount++;
            // Remove successfully flushed session from memory
            this.sessionActivity.delete(sessionId);
          } else {
            failureCount++;
            failedSessions.push(sessionId.substring(0, 8));
            console.error(`❌ Failed to flush activity for session ${sessionId.substring(0, 8)}:`, result.reason);
          }
        });

        console.log(`💾 Flushed activity data: ${successCount} succeeded, ${failureCount} failed`);
        if (failedSessions.length > 0) {
          console.error(`⚠️  Failed sessions (will retry): ${failedSessions.join(', ')}`);
        }
      }
    } catch (error) {
      console.error('❌ FLUSH ACTIVITY ERROR:', error);
      console.error('Error type:', error instanceof Error ? error.constructor.name : typeof error);
      console.error('Error message:', error instanceof Error ? error.message : String(error));
      console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
      console.error('Session activity map size:', this.sessionActivity.size);
      console.error('Session activities:', Array.from(this.sessionActivity.entries()).map(([id, activity]) => ({
        sessionId: id.substring(0, 8),
        tasks_created: activity.tasks_created,
        tasks_updated: activity.tasks_updated,
        tasks_completed: activity.tasks_completed,
        contexts_created: activity.contexts_created
      })));

      logger.error('Failed to flush activity to database', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionTracker',
        operation: 'flushActivityToDatabase'
      });
    }
  }

  /**
   * Get project root directory for a session
   * Returns null if no project assigned or no root_directory set
   */
  private static async getProjectRootDir(sessionId: string): Promise<string | null> {
    try {
      const result = await db.query(`
        SELECT p.root_directory
        FROM sessions s
        LEFT JOIN projects p ON s.project_id = p.id
        WHERE s.id = $1
      `, [sessionId]);

      const rootDir = result.rows[0]?.root_directory;
      return rootDir && rootDir.trim() !== '' ? rootDir.trim() : null;
    } catch (error) {
      logger.error('Failed to get project root directory', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionTracker',
        operation: 'getProjectRootDir',
        metadata: { sessionId }
      });
      return null;
    }
  }

  /**
   * Sync file changes from git diff to session_files table
   * This captures all file modifications since session started
   */
  static async syncFilesFromGit(sessionId: string): Promise<{
    filesProcessed: number;
    totalLinesAdded: number;
    totalLinesDeleted: number;
    error?: string;
  }> {
    try {
      // Get session details and project root directory
      const sessionResult = await db.query(
        'SELECT started_at, working_commit_sha FROM sessions WHERE id = $1',
        [sessionId]
      );

      if (sessionResult.rows.length === 0) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const session = sessionResult.rows[0];
      const startCommitSha = session.working_commit_sha;

      // Get project root directory (falls back to process.cwd() if not set)
      const projectRootDir = await this.getProjectRootDir(sessionId);
      const gitWorkingDir = projectRootDir || process.cwd();

      logger.info('Syncing file changes from git', {
        component: 'SessionTracker',
        operation: 'syncFilesFromGit',
        metadata: {
          sessionId: sessionId.substring(0, 8),
          startCommit: startCommitSha?.substring(0, 8) || 'none',
          workingDir: gitWorkingDir,
          usingProjectDir: !!projectRootDir
        }
      });

      // Run git diff to get file changes
      // If we have a starting commit, diff from that commit to HEAD
      // Otherwise, diff from session start time
      let gitDiffCommand: string;

      if (startCommitSha) {
        // Diff from start commit to current state (including uncommitted changes)
        gitDiffCommand = `git diff ${startCommitSha} HEAD --numstat && git diff HEAD --numstat`;
      } else {
        // Diff uncommitted changes only
        gitDiffCommand = 'git diff HEAD --numstat';
      }

      const { execSync } = await import('child_process');
      let diffOutput: string;

      try {
        diffOutput = execSync(gitDiffCommand, {
          encoding: 'utf8',
          cwd: gitWorkingDir,
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large diffs
        });
      } catch (error) {
        // If git diff fails, try just uncommitted changes
        console.warn('Git diff with commit SHA failed, trying uncommitted changes only');
        diffOutput = execSync('git diff HEAD --numstat', {
          encoding: 'utf8',
          cwd: gitWorkingDir,
          maxBuffer: 10 * 1024 * 1024
        });
      }

      if (!diffOutput.trim()) {
        logger.info('No file changes detected in git diff', {
          component: 'SessionTracker',
          operation: 'syncFilesFromGit',
          metadata: { sessionId: sessionId.substring(0, 8) }
        });
        return {
          filesProcessed: 0,
          totalLinesAdded: 0,
          totalLinesDeleted: 0
        };
      }

      // Parse git diff --numstat output
      // Format: <lines-added>\t<lines-deleted>\t<filename>
      const lines = diffOutput.trim().split('\n');
      const fileChanges: Map<string, { added: number; deleted: number }> = new Map();

      for (const line of lines) {
        if (!line.trim()) continue;

        const parts = line.split('\t');
        if (parts.length < 3) continue;

        const added = parts[0] === '-' ? 0 : parseInt(parts[0]) || 0;
        const deleted = parts[1] === '-' ? 0 : parseInt(parts[1]) || 0;
        const filePath = parts[2];

        // Aggregate changes for same file (in case it appears multiple times)
        const existing = fileChanges.get(filePath) || { added: 0, deleted: 0 };
        fileChanges.set(filePath, {
          added: existing.added + added,
          deleted: existing.deleted + deleted
        });
      }

      // Record each file change to session_files table
      let filesProcessed = 0;
      let totalLinesAdded = 0;
      let totalLinesDeleted = 0;

      for (const [filePath, changes] of fileChanges.entries()) {
        await this.recordFileModification(
          sessionId,
          filePath,
          changes.added,
          changes.deleted,
          'git'
        );
        filesProcessed++;
        totalLinesAdded += changes.added;
        totalLinesDeleted += changes.deleted;
      }

      logger.info('File sync from git completed', {
        component: 'SessionTracker',
        operation: 'syncFilesFromGit',
        metadata: {
          sessionId: sessionId.substring(0, 8),
          filesProcessed,
          totalLinesAdded,
          totalLinesDeleted,
          netChange: totalLinesAdded - totalLinesDeleted
        }
      });

      return {
        filesProcessed,
        totalLinesAdded,
        totalLinesDeleted
      };

    } catch (error) {
      logger.error('Failed to sync files from git', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionTracker',
        operation: 'syncFilesFromGit',
        metadata: { sessionId }
      });

      return {
        filesProcessed: 0,
        totalLinesAdded: 0,
        totalLinesDeleted: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get enhanced session statistics with grouping (Phase 3)
   */
  static async getSessionStatsEnhanced(options: {
    projectId?: string;
    period?: 'day' | 'week' | 'month' | 'all';
    groupBy?: 'project' | 'agent' | 'tag' | 'none';
    phase2Only?: boolean;
  } = {}): Promise<any> {
    try {
      const { projectId, period = 'all', groupBy = 'none', phase2Only = false } = options;

      // Calculate date filter based on period
      let dateFilter = '';
      let dateParam: Date | null = null;
      if (period === 'day') {
        dateParam = new Date(Date.now() - 24 * 60 * 60 * 1000);
        dateFilter = 'AND s.started_at >= $2';
      } else if (period === 'week') {
        dateParam = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        dateFilter = 'AND s.started_at >= $2';
      } else if (period === 'month') {
        dateParam = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        dateFilter = 'AND s.started_at >= $2';
      }

      // Phase 2 filter
      const phase2Filter = phase2Only ? 'AND s.productivity_score IS NOT NULL' : '';

      // Build params array
      const params: any[] = [];
      let paramIndex = 1;
      if (projectId) {
        params.push(projectId);
        paramIndex++;
      }
      if (dateParam) {
        params.push(dateParam);
        paramIndex++;
      }

      // Overall stats query
      const overallStatsSQL = `
        SELECT
          COUNT(*) as total_sessions,
          ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, NOW()) - s.started_at)) / 60)::numeric, 2) as avg_duration,
          ROUND(AVG(s.productivity_score)::numeric, 2) as avg_productivity,
          SUM(s.tasks_created) as total_tasks_created,
          SUM(s.tasks_completed) as total_tasks_completed,
          SUM(s.contexts_created) as total_contexts_created,
          SUM(COALESCE(s.lines_added, 0)) as total_loc_added,
          SUM(COALESCE(s.lines_deleted, 0)) as total_loc_deleted,
          SUM(COALESCE(s.lines_net, 0)) as total_net_loc,
          SUM(s.total_tokens) as total_tokens
        FROM sessions s
        WHERE ${projectId ? `s.project_id = $1` : 'TRUE'}
          ${dateFilter}
          ${phase2Filter}
      `;

      // Get unfiltered count for phase2Only display
      let unfilteredCount = null;
      if (phase2Only) {
        const unfilteredSQL = `
          SELECT COUNT(*) as count
          FROM sessions s
          WHERE ${projectId ? `s.project_id = $1` : 'TRUE'}
            ${dateFilter}
        `;
        const unfilteredResult = await db.query(unfilteredSQL, params.slice(0, projectId && dateParam ? 2 : projectId || dateParam ? 1 : 0));
        unfilteredCount = parseInt(unfilteredResult.rows[0].count);
      }

      const overallResult = await db.query(overallStatsSQL, params);

      // Grouped stats query (if requested)
      let groupedResult = null;
      if (groupBy === 'project') {
        const groupedSQL = `
          SELECT
            p.name as group_key,
            COUNT(s.id) as count,
            ROUND(AVG(s.productivity_score)::numeric, 2) as avg_productivity,
            SUM(COALESCE(s.lines_net, 0)) as total_loc
          FROM sessions s
          LEFT JOIN projects p ON s.project_id = p.id
          WHERE ${projectId ? `s.project_id = $1` : 'TRUE'}
            ${dateFilter}
            ${phase2Filter}
          GROUP BY p.id, p.name
          ORDER BY count DESC
        `;
        groupedResult = await db.query(groupedSQL, params);
      } else if (groupBy === 'agent') {
        const groupedSQL = `
          SELECT
            s.agent_type as group_key,
            COUNT(s.id) as count,
            ROUND(AVG(s.productivity_score)::numeric, 2) as avg_productivity
          FROM sessions s
          WHERE ${projectId ? `s.project_id = $1` : 'TRUE'}
            ${dateFilter}
            ${phase2Filter}
          GROUP BY s.agent_type
          ORDER BY count DESC
        `;
        groupedResult = await db.query(groupedSQL, params);
      } else if (groupBy === 'tag') {
        const groupedSQL = `
          SELECT
            tag as group_key,
            COUNT(*) as count,
            ROUND(AVG(productivity_score)::numeric, 2) as avg_productivity
          FROM sessions s, UNNEST(s.tags) as tag
          WHERE s.tags IS NOT NULL AND array_length(s.tags, 1) > 0
            ${projectId ? `AND s.project_id = $${params.indexOf(projectId) + 1}` : ''}
            ${dateFilter.replace('s.started_at', 'started_at')}
            ${phase2Filter.replace('s.productivity_score', 'productivity_score')}
          GROUP BY tag
          ORDER BY count DESC
          LIMIT 10
        `;
        groupedResult = await db.query(groupedSQL, params);
      }

      // Time series query (if period specified)
      let timeSeriesResult = null;
      if (period !== 'all') {
        const timeSeriesSQL = `
          SELECT
            DATE(s.started_at) as date,
            COUNT(*) as session_count,
            ROUND(AVG(s.productivity_score)::numeric, 2) as avg_productivity
          FROM sessions s
          WHERE ${projectId ? `s.project_id = $1` : 'TRUE'}
            ${dateFilter}
            ${phase2Filter}
          GROUP BY DATE(s.started_at)
          ORDER BY date DESC
          LIMIT 30
        `;
        timeSeriesResult = await db.query(timeSeriesSQL, params);
      }

      // Top tags query
      const topTagsSQL = `
        SELECT tag
        FROM sessions s, UNNEST(s.tags) as tag
        WHERE s.tags IS NOT NULL AND array_length(s.tags, 1) > 0
          ${projectId ? `AND s.project_id = $${params.indexOf(projectId) + 1}` : ''}
          ${dateFilter.replace('s.started_at', 'started_at')}
          ${phase2Filter.replace('s.productivity_score', 'productivity_score')}
        GROUP BY tag
        ORDER BY COUNT(*) DESC
        LIMIT 10
      `;
      const topTagsResult = await db.query(topTagsSQL, params);

      // Build response
      return {
        overall: {
          totalSessions: parseInt(overallResult.rows[0].total_sessions),
          totalSessionsUnfiltered: unfilteredCount,
          avgDuration: parseFloat(overallResult.rows[0].avg_duration) || null,
          avgProductivity: parseFloat(overallResult.rows[0].avg_productivity) || null,
          totalTasksCreated: parseInt(overallResult.rows[0].total_tasks_created),
          totalTasksCompleted: parseInt(overallResult.rows[0].total_tasks_completed),
          totalContextsCreated: parseInt(overallResult.rows[0].total_contexts_created),
          totalLOC: parseInt(overallResult.rows[0].total_net_loc),
          totalTokens: parseInt(overallResult.rows[0].total_tokens)
        },
        groups: groupedResult?.rows.map(r => ({
          groupKey: r.group_key || 'Unknown',
          count: parseInt(r.count),
          avgProductivity: parseFloat(r.avg_productivity) || null
        })),
        timeSeries: timeSeriesResult?.rows.map(r => ({
          date: r.date,
          sessionCount: parseInt(r.session_count),
          avgProductivity: parseFloat(r.avg_productivity) || null
        })),
        topTags: topTagsResult.rows.map(r => r.tag)
      };
    } catch (error) {
      logger.error('Failed to get enhanced session stats', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionTracker',
        operation: 'getSessionStatsEnhanced',
        metadata: options
      });
      throw error;
    }
  }
}

/**
 * Utility functions for session management
 */

/**
 * Auto-start session if none exists
 * Phase 2: Added sessionGoal, tags, and aiModel parameters
 */
export async function ensureActiveSession(
  projectId?: string,
  title?: string,
  description?: string,
  sessionGoal?: string,
  tags?: string[],
  aiModel?: string
): Promise<string> {
  let sessionId = await SessionTracker.getActiveSession();

  if (!sessionId) {
    sessionId = await SessionTracker.startSession(projectId, title, description, sessionGoal, tags, aiModel);
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
