import { db as pool } from '../database/connection';

export interface Context {
  id: string;
  project_id: string;
  project_name?: string;
  type: 'code' | 'decision' | 'error' | 'discussion' | 'planning' | 'completion';
  content: string;
  metadata?: Record<string, any>;
  tags?: string[];
  relevance_score?: number;
  session_id?: string;
  embedding?: number[];
  created_at: string;
  updated_at: string;
}

export interface ContextSearchParams {
  query?: string;
  project_id?: string;
  session_id?: string;
  type?: string;
  tags?: string[];
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
  sort_by?: 'created_at' | 'relevance' | 'updated_at';
  sort_order?: 'asc' | 'desc';
}

export interface ContextStats {
  total_contexts: number;
  by_type: Record<string, number>;
  by_project: Record<string, number>;
  recent_contexts: number;
  total_projects: number;
  most_recent_timestamp?: string;
}

export class ContextService {
  /**
   * Get context count for a project (Oracle Phase 2 dashboard requirement)
   * This provides the core count used in dashboard aggregation
   */
  static async count(projectId?: string): Promise<number> {
    try {
      let query: string;
      const params: any[] = [];
      
      if (projectId) {
        query = 'SELECT COUNT(*) FROM contexts WHERE project_id = $1';
        params.push(projectId);
      } else {
        query = 'SELECT COUNT(*) FROM contexts';
      }
      
      const result = await pool.query(query, params);
      const count = parseInt(result.rows[0].count);
      
      console.log(`📊 ContextService.count - Project: ${projectId || 'ALL'}, Count: ${count}`);
      return count;
    } catch (error) {
      console.error('Context count error:', error);
      throw new Error('Failed to get context count');
    }
  }

  /**
   * Get contexts with filtering, search, and pagination
   */
  static async searchContexts(params: ContextSearchParams): Promise<{
    contexts: Context[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      query,
      project_id,
      session_id,
      type,
      tags,
      date_from,
      date_to,
      limit = 20,
      offset = 0,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = params;

    let sql = `
      SELECT 
        c.id, c.project_id, c.context_type as type, c.content, c.metadata, c.tags,
        c.relevance_score, c.session_id, c.created_at, c.created_at as updated_at,
        p.name as project_name,
        COUNT(*) OVER() as total_count
      FROM contexts c
      LEFT JOIN projects p ON c.project_id = p.id
      WHERE 1=1
    `;

    const sqlParams: any[] = [];
    let paramIndex = 1;

    // Text search: matches content, tags, or context type
    if (query) {
      const likeParam = `%${query}%`;
      sql += ` AND (
        c.content ILIKE $${paramIndex++}
        OR $${paramIndex++} = ANY(c.tags)
        OR LOWER(c.context_type) = LOWER($${paramIndex++})
      )`;
      sqlParams.push(likeParam, query, query);
    }

    if (project_id) {
      sql += ` AND c.project_id = $${paramIndex++}`;
      sqlParams.push(project_id);
    }

    if (session_id) {
      sql += ` AND c.session_id = $${paramIndex++}`;
      sqlParams.push(session_id);
    }

    if (type) {
      sql += ` AND c.context_type = $${paramIndex++}`;
      sqlParams.push(type);
    }

    if (tags && tags.length > 0) {
      sql += ` AND c.tags && $${paramIndex++}::text[]`;
      sqlParams.push(tags);
    }

    if (date_from) {
      sql += ` AND c.created_at >= $${paramIndex++}`;
      sqlParams.push(date_from);
    }

    if (date_to) {
      sql += ` AND c.created_at <= $${paramIndex++}`;
      sqlParams.push(date_to);
    }

    // Sorting
    let sortColumn = 'c.created_at'; // default
    if (sort_by === 'relevance') {
      sortColumn = 'c.relevance_score';
    } else if (sort_by === 'updated_at') {
      sortColumn = 'c.created_at'; // contexts table doesn't have updated_at
    } else if (sort_by === 'created_at') {
      sortColumn = 'c.created_at';
    }
    sql += ` ORDER BY ${sortColumn} ${sort_order.toUpperCase()}`;

    // Pagination
    sql += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    sqlParams.push(limit, offset);

    try {
      const result = await pool.query(sql, sqlParams);
      
      const contexts = result.rows.map(row => ({
        id: row.id,
        project_id: row.project_id,
        project_name: row.project_name,
        type: row.type,
        content: row.content,
        metadata: row.metadata,
        tags: row.tags,
        relevance_score: row.relevance_score,
        session_id: row.session_id,
        created_at: row.created_at,
        updated_at: row.updated_at
      }));

      const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;

      return {
        contexts,
        total,
        page: Math.floor(offset / limit) + 1,
        limit
      };
    } catch (error) {
      console.error('Context search error:', error);
      throw new Error('Failed to search contexts');
    }
  }

  /**
   * Get single context by ID
   */
  static async getContextById(id: string): Promise<Context | null> {
    try {
      const result = await pool.query(`
        SELECT 
          c.id, c.project_id, c.context_type as type, c.content, c.metadata, c.tags,
          c.relevance_score, c.session_id, c.created_at, c.created_at as updated_at,
          p.name as project_name
        FROM contexts c
        LEFT JOIN projects p ON c.project_id = p.id
        WHERE c.id = $1
      `, [id]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        project_id: row.project_id,
        project_name: row.project_name,
        type: row.type,
        content: row.content,
        metadata: row.metadata,
        tags: row.tags,
        relevance_score: row.relevance_score,
        session_id: row.session_id,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    } catch (error) {
      console.error('Get context error:', error);
      throw new Error('Failed to get context');
    }
  }

  /**
   * Update context
   */
  static async updateContext(id: string, updates: {
    content?: string;
    tags?: string[];
    metadata?: Record<string, any>;
    relevance_score?: number;
    project_id?: string;
  }): Promise<Context | null> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.content !== undefined) {
      setClauses.push(`content = $${paramIndex++}`);
      values.push(updates.content);
    }

    if (updates.tags !== undefined) {
      setClauses.push(`tags = $${paramIndex++}`);
      values.push(updates.tags);
    }

    if (updates.metadata !== undefined) {
      setClauses.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(updates.metadata));
    }

    if (updates.relevance_score !== undefined) {
      setClauses.push(`relevance_score = $${paramIndex++}`);
      values.push(updates.relevance_score);
    }

    if (updates.project_id !== undefined) {
      setClauses.push(`project_id = $${paramIndex++}`);
      values.push(updates.project_id);
    }

    if (setClauses.length === 0) {
      throw new Error('No updates provided');
    }

    // Note: contexts table doesn't have updated_at column
    values.push(id);

    try {
      const result = await pool.query(`
        UPDATE contexts
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING
          id, project_id, context_type as type, content, metadata, tags,
          relevance_score, session_id, created_at, created_at as updated_at
      `, values);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      console.error('Update context error:', error);
      throw new Error('Failed to update context');
    }
  }

  /**
   * Delete context
   */
  static async deleteContext(id: string): Promise<boolean> {
    try {
      const result = await pool.query('DELETE FROM contexts WHERE id = $1', [id]);
      return result.rowCount! > 0;
    } catch (error) {
      console.error('Delete context error:', error);
      throw new Error('Failed to delete context');
    }
  }

  /**
   * Bulk delete contexts
   */
  static async bulkDeleteContexts(ids: string[]): Promise<{ deleted: number }> {
    if (ids.length === 0) {
      return { deleted: 0 };
    }

    try {
      const result = await pool.query(
        'DELETE FROM contexts WHERE id = ANY($1::uuid[])',
        [ids]
      );
      
      return { deleted: result.rowCount || 0 };
    } catch (error) {
      console.error('Bulk delete contexts error:', error);
      throw new Error('Failed to bulk delete contexts');
    }
  }

  /**
   * Get context statistics
   */
  static async getContextStats(project_id?: string): Promise<ContextStats> {
    try {
      const projectFilter = project_id ? 'WHERE c.project_id = $1' : '';
      const params = project_id ? [project_id] : [];

      // Get basic counts first
      const basicResult = await pool.query(`
        SELECT
          COUNT(*) as total_contexts,
          COUNT(*) FILTER (WHERE c.created_at >= NOW() - INTERVAL '7 days') as recent_contexts,
          COUNT(DISTINCT c.project_id) as total_projects,
          MAX(c.created_at) as most_recent_timestamp
        FROM contexts c
        ${projectFilter}
      `, params);

      // Get type counts
      const typeResult = await pool.query(`
        SELECT 
          c.context_type,
          COUNT(*) as count
        FROM contexts c
        ${projectFilter}
        GROUP BY c.context_type
      `, params);

      // Get project counts
      const projectResult = await pool.query(`
        SELECT 
          COALESCE(p.name, 'Unknown') as project_name,
          COUNT(*) as count
        FROM contexts c
        LEFT JOIN projects p ON c.project_id = p.id
        ${projectFilter}
        GROUP BY p.name
      `, params);

      // Build the by_type object
      const by_type: Record<string, number> = {};
      typeResult.rows.forEach(row => {
        by_type[row.context_type] = parseInt(row.count);
      });

      // Build the by_project object  
      const by_project: Record<string, number> = {};
      projectResult.rows.forEach(row => {
        by_project[row.project_name] = parseInt(row.count);
      });

      const basicRow = basicResult.rows[0];

      return {
        total_contexts: parseInt(basicRow.total_contexts),
        recent_contexts: parseInt(basicRow.recent_contexts),
        total_projects: parseInt(basicRow.total_projects),
        most_recent_timestamp: basicRow.most_recent_timestamp,
        by_type,
        by_project
      };
    } catch (error) {
      console.error('Get context stats error:', error);
      throw new Error('Failed to get context statistics');
    }
  }

  /**
   * Get weekly context velocity analytics
   */
  static async getWeeklyVelocity(project_id?: string): Promise<Array<{ 
    week: string; 
    contexts: number; 
    weekStart: string;
  }>> {
    try {
      const projectFilter = project_id ? 'WHERE project_id = $1' : '';
      const params = project_id ? [project_id] : [];

      const result = await pool.query(`
        SELECT 
          DATE_TRUNC('week', created_at) as week_start,
          TO_CHAR(DATE_TRUNC('week', created_at), 'YYYY-MM-DD') as week,
          COUNT(*) as contexts
        FROM contexts
        ${projectFilter}
        GROUP BY DATE_TRUNC('week', created_at)
        ORDER BY week_start DESC
        LIMIT 12
      `, params);

      return result.rows.map(row => ({
        week: row.week,
        contexts: parseInt(row.contexts),
        weekStart: row.week
      })).reverse(); // Reverse to show oldest first for chart display
    } catch (error) {
      console.error('Get weekly velocity error:', error);
      throw new Error('Failed to get weekly context velocity');
    }
  }

  /**
   * Export contexts
   */
  static async exportContexts(
    params: ContextSearchParams,
    format: 'json' | 'csv' | 'md' = 'json'
  ): Promise<{ data: string; filename: string; contentType: string }> {
    // Get all matching contexts (no pagination for export)
    const searchResult = await this.searchContexts({ ...params, limit: 10000, offset: 0 });

    const timestamp = new Date().toISOString().slice(0, 10);

    if (format === 'json') {
      return {
        data: JSON.stringify({
          contexts: searchResult.contexts,
          exported_at: new Date().toISOString(),
          total_exported: searchResult.contexts.length,
          filters: params
        }, null, 2),
        filename: `contexts-export-${timestamp}.json`,
        contentType: 'application/json'
      };
    } else if (format === 'csv') {
      // CSV format
      const headers = [
        'ID', 'Project', 'Type', 'Content Preview', 'Tags',
        'Relevance Score', 'Created At', 'Updated At'
      ].join(',');

      const rows = searchResult.contexts.map(ctx => [
        `"${ctx.id}"`,
        `"${ctx.project_name || 'Unknown'}"`,
        `"${ctx.type}"`,
        `"${ctx.content.substring(0, 100).replace(/"/g, '""')}..."`,
        `"${(ctx.tags || []).join('; ')}"`,
        ctx.relevance_score || 0,
        `"${ctx.created_at}"`,
        `"${ctx.updated_at}"`
      ].join(',')).join('\n');

      return {
        data: `${headers}\n${rows}`,
        filename: `contexts-export-${timestamp}.csv`,
        contentType: 'text/csv'
      };
    } else if (format === 'md') {
      // Markdown format - full content with all metadata
      const header = `# AIDIS Context Export\n\n**Exported:** ${new Date().toISOString()}\n**Total Contexts:** ${searchResult.contexts.length}\n\n---\n\n`;

      const content = searchResult.contexts.map((ctx, index) => {
        const metadata = ctx.metadata ? JSON.stringify(ctx.metadata, null, 2) : 'None';
        const tags = ctx.tags && ctx.tags.length > 0 ? ctx.tags.join(', ') : 'None';
        const sessionId = ctx.session_id || 'None';
        const relevance = ctx.relevance_score || 'N/A';

        return `## Context ${index + 1}: ${ctx.type}

**Project:** ${ctx.project_name || 'Unknown'}
**Tags:** ${tags}
**Relevance Score:** ${relevance}
**Session ID:** ${sessionId}
**Created:** ${ctx.created_at}
**Updated:** ${ctx.updated_at}

### Content

${ctx.content}

### Metadata

\`\`\`json
${metadata}
\`\`\`

---

`;
      }).join('\n');

      return {
        data: header + content,
        filename: `contexts-export-${timestamp}.md`,
        contentType: 'text/markdown'
      };
    }

    throw new Error(`Unsupported export format: ${format}`);
  }

  /**
   * Get related contexts using semantic similarity
   */
  static async getRelatedContexts(contextId: string, limit = 5): Promise<Context[]> {
    try {
      const result = await pool.query(`
        SELECT 
          c2.id, c2.project_id, c2.context_type as type, c2.content, c2.metadata, c2.tags,
          c2.relevance_score, c2.session_id, c2.created_at, c2.created_at as updated_at,
          p.name as project_name,
          c1.embedding <-> c2.embedding as distance
        FROM contexts c1
        JOIN contexts c2 ON c1.id != c2.id
        LEFT JOIN projects p ON c2.project_id = p.id
        WHERE c1.id = $1 AND c1.embedding IS NOT NULL AND c2.embedding IS NOT NULL
        ORDER BY c1.embedding <-> c2.embedding ASC
        LIMIT $2
      `, [contextId, limit]);

      return result.rows.map(row => ({
        id: row.id,
        project_id: row.project_id,
        project_name: row.project_name,
        type: row.type,
        content: row.content,
        metadata: row.metadata,
        tags: row.tags,
        relevance_score: row.relevance_score,
        session_id: row.session_id,
        created_at: row.created_at,
        updated_at: row.updated_at
      }));
    } catch (error) {
      console.error('Get related contexts error:', error);
      return [];
    }
  }
}
