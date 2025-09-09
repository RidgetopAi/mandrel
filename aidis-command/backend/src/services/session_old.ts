import { db as pool } from '../database/connection';

export interface SessionDetail {
  id: string;
  project_id: string;
  project_name?: string;
  created_at: string;
  context_count?: number;
  last_context_at?: string;
  contexts?: {
    id: string;
    type: string;
    content: string;
    created_at: string;
    tags?: string[];
  }[];
  duration?: number;
  metadata?: Record<string, any>;
}

export class SessionService {
  /**
   * Get session detail with contexts
   */
  static async getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
    try {
      // First get session metadata
      const sessionResult = await pool.query(`
        SELECT 
          c.session_id as id,
          c.project_id,
          p.name as project_name,
          MIN(c.created_at) as created_at,
          COUNT(*) as context_count,
          MAX(c.created_at) as last_context_at
        FROM contexts c
        LEFT JOIN projects p ON c.project_id = p.id
        WHERE c.session_id = $1
        GROUP BY c.session_id, c.project_id, p.name
      `, [sessionId]);

      if (sessionResult.rows.length === 0) {
        return null;
      }

      const sessionRow = sessionResult.rows[0];

      // Get contexts for this session
      const contextsResult = await pool.query(`
        SELECT 
          id,
          type,
          content,
          created_at,
          tags
        FROM contexts
        WHERE session_id = $1
        ORDER BY created_at ASC
      `, [sessionId]);

      // Calculate duration
      const startTime = new Date(sessionRow.created_at);
      const endTime = sessionRow.last_context_at ? new Date(sessionRow.last_context_at) : new Date();
      const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000 / 60); // duration in minutes

      return {
        id: sessionRow.id,
        project_id: sessionRow.project_id,
        project_name: sessionRow.project_name,
        created_at: sessionRow.created_at,
        context_count: parseInt(sessionRow.context_count) || 0,
        last_context_at: sessionRow.last_context_at,
        contexts: contextsResult.rows.map(row => ({
          id: row.id,
          type: row.type,
          content: row.content,
          created_at: row.created_at,
          tags: row.tags || []
        })),
        duration,
        metadata: {} // Could be extended later with additional session metadata
      };
    } catch (error) {
      console.error('Get session detail error:', error);
      throw new Error('Failed to get session details');
    }
  }
}
