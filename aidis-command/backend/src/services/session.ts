import { db as pool } from '../database/connection';

export interface SessionDetail {
  id: string;
  user_id: string;
  username?: string;
  project_id?: string;
  project_name?: string;
  started_at: string;
  ended_at?: string;
  last_activity?: string;
  duration_ms?: number;
  is_active: boolean;
  ip_address?: string;
  user_agent?: string;
  
  // Activity counters
  contexts_created: number;
  decisions_created: number;
  tasks_created: number;
  api_requests: number;
  
  // Token usage
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  
  // Session metadata
  session_type: string;
  metadata: Record<string, any>;
  
  // Related contexts
  contexts?: {
    id: string;
    type: string;
    content: string;
    created_at: string;
    tags?: string[];
  }[];
}

export class SessionService {
  /**
   * Get session detail with contexts from user_sessions table
   */
  static async getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
    try {
      const query = `
        SELECT 
          s.*,
          p.name as project_name,
          au.username,
          ARRAY_AGG(
            CASE WHEN c.id IS NOT NULL THEN 
              json_build_object(
                'id', c.id,
                'content', SUBSTRING(c.content, 1, 200),
                'type', c.type,
                'created_at', c.created_at,
                'tags', c.tags
              )
            ELSE NULL END
          ) FILTER (WHERE c.id IS NOT NULL) as contexts
        FROM user_sessions s
        LEFT JOIN projects p ON s.project_id = p.id  
        LEFT JOIN admin_users au ON s.user_id = au.id
        LEFT JOIN contexts c ON s.id = c.session_id
        WHERE s.id = $1
        GROUP BY s.id, s.user_id, s.started_at, s.ended_at, s.last_activity, 
                 s.duration_ms, s.is_active, s.ip_address, s.user_agent,
                 s.contexts_created, s.decisions_created, s.tasks_created, s.api_requests,
                 s.total_tokens, s.prompt_tokens, s.completion_tokens,
                 s.project_id, s.session_type, s.metadata, s.created_at, s.updated_at,
                 p.name, au.username
      `;

      const result = await pool.query(query, [sessionId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      
      return {
        id: row.id,
        user_id: row.user_id,
        username: row.username,
        project_id: row.project_id,
        project_name: row.project_name,
        started_at: row.started_at,
        ended_at: row.ended_at,
        last_activity: row.last_activity,
        duration_ms: row.duration_ms,
        is_active: row.is_active,
        ip_address: row.ip_address,
        user_agent: row.user_agent,
        contexts_created: row.contexts_created || 0,
        decisions_created: row.decisions_created || 0,
        tasks_created: row.tasks_created || 0,
        api_requests: row.api_requests || 0,
        total_tokens: row.total_tokens || 0,
        prompt_tokens: row.prompt_tokens || 0,
        completion_tokens: row.completion_tokens || 0,
        session_type: row.session_type || 'web',
        metadata: row.metadata || {},
        contexts: row.contexts || []
      };
    } catch (error) {
      console.error('Error getting session detail:', error);
      throw error;
    }
  }

  /**
   * Create or update session activity
   */
  static async trackActivity(sessionId: string, activityType: 'context' | 'decision' | 'task' | 'api'): Promise<void> {
    try {
      const updates = {
        context: 'contexts_created = contexts_created + 1',
        decision: 'decisions_created = decisions_created + 1', 
        task: 'tasks_created = tasks_created + 1',
        api: 'api_requests = api_requests + 1'
      };

      await pool.query(`
        UPDATE user_sessions 
        SET ${updates[activityType]},
            last_activity = NOW(),
            updated_at = NOW()
        WHERE id = $1 AND is_active = true
      `, [sessionId]);
    } catch (error) {
      console.error('Error tracking session activity:', error);
      // Don't throw - activity tracking shouldn't break the main operation
    }
  }

  /**
   * End a session and calculate duration
   */
  static async endSession(sessionId: string): Promise<void> {
    try {
      await pool.query(`
        UPDATE user_sessions 
        SET ended_at = NOW(),
            duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
            is_active = false,
            updated_at = NOW()
        WHERE id = $1 AND is_active = true
      `, [sessionId]);
    } catch (error) {
      console.error('Error ending session:', error);
      throw error;
    }
  }

  /**
   * Get active sessions for cleanup
   */
  static async getActiveSessions(olderThanHours: number = 24): Promise<string[]> {
    try {
      const result = await pool.query(`
        SELECT id 
        FROM user_sessions 
        WHERE is_active = true 
          AND last_activity < NOW() - INTERVAL '${olderThanHours} hours'
      `);
      
      return result.rows.map(row => row.id);
    } catch (error) {
      console.error('Error getting active sessions:', error);
      return [];
    }
  }

  /**
   * Clean up inactive sessions
   */
  static async cleanupInactiveSessions(olderThanHours: number = 24): Promise<number> {
    try {
      const inactiveSessions = await this.getActiveSessions(olderThanHours);
      
      if (inactiveSessions.length === 0) {
        return 0;
      }

      // End all inactive sessions
      for (const sessionId of inactiveSessions) {
        await this.endSession(sessionId);
      }

      return inactiveSessions.length;
    } catch (error) {
      console.error('Error cleaning up inactive sessions:', error);
      return 0;
    }
  }
}
