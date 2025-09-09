import { db as pool } from '../database/connection';

export interface SessionAnalytics {
  total_sessions: number;
  total_duration_minutes: number;
  average_duration_minutes: number;
  total_contexts: number;
  average_contexts_per_session: number;
  total_tokens_used: number;
  average_tokens_per_session: number;
  active_sessions_today: number;
  sessions_this_week: number;
  sessions_this_month: number;
}

export interface SessionTrend {
  date: string;
  session_count: number;
  total_duration_minutes: number;
  total_contexts: number;
  total_tokens_used: number;
  average_duration_minutes: number;
}

export interface ProductiveSession {
  id: string;
  project_id: string;
  project_name?: string;
  created_at: string;
  duration_minutes: number;
  context_count: number;
  tokens_used: number;
  productivity_score: number;
  context_summary?: string;
}

export interface TokenUsagePattern {
  hour: number;
  total_tokens: number;
  session_count: number;
  average_tokens_per_session: number;
}

export class SessionAnalyticsService {
  /**
   * Get overall session analytics
   */
  static async getSessionAnalytics(projectId?: string): Promise<SessionAnalytics> {
    try {
      const whereClause = projectId ? 'WHERE s.project_id = $1' : '';
      const params = projectId ? [projectId] : [];
      
      const query = `
        WITH session_stats AS (
          SELECT 
            s.id,
            s.project_id,
            s.started_at,
            s.ended_at,
            s.tokens_used,
            EXTRACT(EPOCH FROM (COALESCE(s.ended_at, CURRENT_TIMESTAMP) - s.started_at)) / 60 as duration_minutes,
            COUNT(c.id) as context_count
          FROM sessions s
          LEFT JOIN contexts c ON s.id = c.session_id
          ${whereClause}
          GROUP BY s.id, s.project_id, s.started_at, s.ended_at, s.tokens_used
        )
        SELECT 
          COUNT(*) as total_sessions,
          COALESCE(SUM(duration_minutes), 0) as total_duration_minutes,
          COALESCE(AVG(duration_minutes), 0) as average_duration_minutes,
          COALESCE(SUM(context_count), 0) as total_contexts,
          COALESCE(AVG(context_count), 0) as average_contexts_per_session,
          COALESCE(SUM(tokens_used), 0) as total_tokens_used,
          COALESCE(AVG(tokens_used), 0) as average_tokens_per_session,
          COUNT(CASE WHEN DATE(started_at) = CURRENT_DATE THEN 1 END) as active_sessions_today,
          COUNT(CASE WHEN started_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as sessions_this_week,
          COUNT(CASE WHEN started_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as sessions_this_month
        FROM session_stats
      `;

      const result = await pool.query(query, params);
      const row = result.rows[0];

      return {
        total_sessions: parseInt(row.total_sessions) || 0,
        total_duration_minutes: Math.round(parseFloat(row.total_duration_minutes) || 0),
        average_duration_minutes: Math.round(parseFloat(row.average_duration_minutes) || 0),
        total_contexts: parseInt(row.total_contexts) || 0,
        average_contexts_per_session: Math.round(parseFloat(row.average_contexts_per_session) || 0),
        total_tokens_used: parseInt(row.total_tokens_used) || 0,
        average_tokens_per_session: Math.round(parseFloat(row.average_tokens_per_session) || 0),
        active_sessions_today: parseInt(row.active_sessions_today) || 0,
        sessions_this_week: parseInt(row.sessions_this_week) || 0,
        sessions_this_month: parseInt(row.sessions_this_month) || 0
      };
    } catch (error) {
      console.error('Get session analytics error:', error);
      throw new Error('Failed to get session analytics');
    }
  }

  /**
   * Get session trends over time (daily aggregation)
   */
  static async getSessionTrends(days: number = 30, projectId?: string): Promise<SessionTrend[]> {
    try {
      const whereClause = projectId ? 'AND s.project_id = $2' : '';
      const params = projectId ? [days, projectId] : [days];
      
      const query = `
        WITH date_series AS (
          SELECT generate_series(
            CURRENT_DATE - INTERVAL '${days} days',
            CURRENT_DATE,
            INTERVAL '1 day'
          )::date as date
        ),
        daily_sessions AS (
          SELECT 
            DATE(s.started_at) as session_date,
            COUNT(*) as session_count,
            SUM(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, CURRENT_TIMESTAMP) - s.started_at)) / 60) as total_duration_minutes,
            SUM(s.tokens_used) as total_tokens_used,
            COUNT(c.id) as total_contexts
          FROM sessions s
          LEFT JOIN contexts c ON s.id = c.session_id
          WHERE s.started_at >= CURRENT_DATE - INTERVAL '${days} days'
          ${whereClause}
          GROUP BY DATE(s.started_at)
        )
        SELECT 
          d.date,
          COALESCE(ds.session_count, 0) as session_count,
          COALESCE(ds.total_duration_minutes, 0) as total_duration_minutes,
          COALESCE(ds.total_contexts, 0) as total_contexts,
          COALESCE(ds.total_tokens_used, 0) as total_tokens_used,
          CASE 
            WHEN COALESCE(ds.session_count, 0) > 0 
            THEN COALESCE(ds.total_duration_minutes, 0) / ds.session_count 
            ELSE 0 
          END as average_duration_minutes
        FROM date_series d
        LEFT JOIN daily_sessions ds ON d.date = ds.session_date
        ORDER BY d.date
      `;

      const result = await pool.query(query, params);
      
      return result.rows.map(row => ({
        date: row.date,
        session_count: parseInt(row.session_count) || 0,
        total_duration_minutes: Math.round(parseFloat(row.total_duration_minutes) || 0),
        total_contexts: parseInt(row.total_contexts) || 0,
        total_tokens_used: parseInt(row.total_tokens_used) || 0,
        average_duration_minutes: Math.round(parseFloat(row.average_duration_minutes) || 0)
      }));
    } catch (error) {
      console.error('Get session trends error:', error);
      throw new Error('Failed to get session trends');
    }
  }

  /**
   * Get most productive sessions (ranked by contexts, duration, and tokens)
   */
  static async getProductiveSessions(limit: number = 10, projectId?: string): Promise<ProductiveSession[]> {
    try {
      const whereClause = projectId ? 'WHERE s.project_id = $2' : '';
      const params = projectId ? [limit, projectId] : [limit];
      
      const query = `
        WITH session_productivity AS (
          SELECT 
            s.id,
            s.project_id,
            p.name as project_name,
            s.started_at as created_at,
            s.context_summary,
            s.tokens_used,
            EXTRACT(EPOCH FROM (COALESCE(s.ended_at, CURRENT_TIMESTAMP) - s.started_at)) / 60 as duration_minutes,
            COUNT(c.id) as context_count,
            -- Productivity score: weighted combination of contexts, duration, and tokens
            (COUNT(c.id) * 2.0 + 
             LEAST(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, CURRENT_TIMESTAMP) - s.started_at)) / 60 / 60, 8) * 3.0 + 
             LEAST(s.tokens_used / 1000.0, 10) * 1.0) as productivity_score
          FROM sessions s
          LEFT JOIN contexts c ON s.id = c.session_id
          LEFT JOIN projects p ON s.project_id = p.id
          ${whereClause}
          GROUP BY s.id, s.project_id, p.name, s.started_at, s.context_summary, s.tokens_used
          HAVING COUNT(c.id) > 0  -- Only sessions with contexts
        )
        SELECT 
          id,
          project_id,
          project_name,
          created_at,
          duration_minutes,
          context_count,
          tokens_used,
          productivity_score,
          context_summary
        FROM session_productivity
        ORDER BY productivity_score DESC, context_count DESC
        LIMIT $1
      `;

      const result = await pool.query(query, params);
      
      return result.rows.map(row => ({
        id: row.id,
        project_id: row.project_id,
        project_name: row.project_name,
        created_at: row.created_at,
        duration_minutes: Math.round(parseFloat(row.duration_minutes) || 0),
        context_count: parseInt(row.context_count) || 0,
        tokens_used: parseInt(row.tokens_used) || 0,
        productivity_score: Math.round(parseFloat(row.productivity_score) * 10) / 10,
        context_summary: row.context_summary
      }));
    } catch (error) {
      console.error('Get productive sessions error:', error);
      throw new Error('Failed to get productive sessions');
    }
  }

  /**
   * Get token usage patterns by hour of day
   */
  static async getTokenUsagePatterns(projectId?: string): Promise<TokenUsagePattern[]> {
    try {
      const whereClause = projectId ? 'WHERE s.project_id = $1' : '';
      const params = projectId ? [projectId] : [];
      
      const query = `
        WITH hourly_usage AS (
          SELECT 
            EXTRACT(HOUR FROM s.started_at) as hour,
            SUM(s.tokens_used) as total_tokens,
            COUNT(*) as session_count
          FROM sessions s
          ${whereClause}
          GROUP BY EXTRACT(HOUR FROM s.started_at)
        ),
        hour_series AS (
          SELECT generate_series(0, 23) as hour
        )
        SELECT 
          hs.hour,
          COALESCE(hu.total_tokens, 0) as total_tokens,
          COALESCE(hu.session_count, 0) as session_count,
          CASE 
            WHEN COALESCE(hu.session_count, 0) > 0 
            THEN COALESCE(hu.total_tokens, 0) / hu.session_count 
            ELSE 0 
          END as average_tokens_per_session
        FROM hour_series hs
        LEFT JOIN hourly_usage hu ON hs.hour = hu.hour
        ORDER BY hs.hour
      `;

      const result = await pool.query(query, params);
      
      return result.rows.map(row => ({
        hour: parseInt(row.hour),
        total_tokens: parseInt(row.total_tokens) || 0,
        session_count: parseInt(row.session_count) || 0,
        average_tokens_per_session: Math.round(parseFloat(row.average_tokens_per_session) || 0)
      }));
    } catch (error) {
      console.error('Get token usage patterns error:', error);
      throw new Error('Failed to get token usage patterns');
    }
  }
}
