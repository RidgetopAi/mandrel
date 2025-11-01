import { db as pool } from '../database/connection';

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'inactive' | 'archived';
  git_repo_url?: string;
  root_directory?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  context_count?: number;
  session_count?: number;
  last_activity?: string;
}

export interface Session {
  id: string;
  project_id: string;
  project_name?: string;
  created_at: string;
  session_type: string;
  context_count?: number;
  last_context_at?: string;
}

export interface ProjectStats {
  total_projects: number;
  active_projects: number;
  total_contexts: number;
  total_sessions: number;
  contexts_by_type: Record<string, number>;
  recent_activity: {
    contexts_last_week: number;
    sessions_last_week: number;
  };
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  git_repo_url?: string;
  root_directory?: string;
  metadata?: Record<string, any>;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  status?: 'active' | 'inactive' | 'archived';
  git_repo_url?: string;
  root_directory?: string;
  metadata?: Record<string, any>;
}

export class ProjectService {
  /**
   * Get all projects with statistics
   */
  static async getAllProjects(): Promise<Project[]> {
    try {
      const result = await pool.query(`
        SELECT 
          p.id, p.name, p.description, p.status, p.git_repo_url, p.root_directory,
          p.metadata, p.created_at, p.updated_at,
          COUNT(DISTINCT c.id) as context_count,
          COUNT(DISTINCT c.session_id) as session_count,
          MAX(c.created_at) as last_activity
        FROM projects p
        LEFT JOIN contexts c ON p.id = c.project_id
        GROUP BY p.id, p.name, p.description, p.status, p.git_repo_url, p.root_directory,
                 p.metadata, p.created_at, p.updated_at
        ORDER BY p.updated_at DESC
      `);

      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status,
        git_repo_url: row.git_repo_url,
        root_directory: row.root_directory,
        metadata: row.metadata,
        created_at: row.created_at,
        updated_at: row.updated_at,
        context_count: parseInt(row.context_count) || 0,
        session_count: parseInt(row.session_count) || 0,
        last_activity: row.last_activity
      }));
    } catch (error) {
      console.error('Get all projects error:', error);
      throw new Error('Failed to get projects');
    }
  }

  /**
   * Get single project by ID with statistics
   */
  static async getProjectById(id: string): Promise<Project | null> {
    try {
      const result = await pool.query(`
        SELECT 
          p.id, p.name, p.description, p.status, p.git_repo_url, p.root_directory,
          p.metadata, p.created_at, p.updated_at,
          COUNT(DISTINCT c.id) as context_count,
          COUNT(DISTINCT c.session_id) as session_count,
          MAX(c.created_at) as last_activity
        FROM projects p
        LEFT JOIN contexts c ON p.id = c.project_id
        WHERE p.id = $1
        GROUP BY p.id, p.name, p.description, p.status, p.git_repo_url, p.root_directory,
                 p.metadata, p.created_at, p.updated_at
      `, [id]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status,
        git_repo_url: row.git_repo_url,
        root_directory: row.root_directory,
        metadata: row.metadata,
        created_at: row.created_at,
        updated_at: row.updated_at,
        context_count: parseInt(row.context_count) || 0,
        session_count: parseInt(row.session_count) || 0,
        last_activity: row.last_activity
      };
    } catch (error) {
      console.error('Get project by ID error:', error);
      throw new Error('Failed to get project');
    }
  }

  /**
   * Create new project
   */
  static async createProject(projectData: CreateProjectRequest): Promise<Project> {
    const { name, description, git_repo_url, root_directory, metadata } = projectData;

    try {
      const result = await pool.query(`
        INSERT INTO projects (name, description, git_repo_url, root_directory, metadata)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, description, status, git_repo_url, root_directory,
                  metadata, created_at, updated_at
      `, [name, description, git_repo_url, root_directory, JSON.stringify(metadata || {})]);

      const row = result.rows[0];
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status,
        git_repo_url: row.git_repo_url,
        root_directory: row.root_directory,
        metadata: row.metadata,
        created_at: row.created_at,
        updated_at: row.updated_at,
        context_count: 0,
        session_count: 0
      };
    } catch (error: any) {
      console.error('Create project error:', error);
      if (error.code === '23505') { // Unique constraint violation
        throw new Error('Project name already exists');
      }
      throw new Error('Failed to create project');
    }
  }

  /**
   * Update project
   */
  static async updateProject(id: string, updates: UpdateProjectRequest): Promise<Project | null> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }

    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }

    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }

    if (updates.git_repo_url !== undefined) {
      setClauses.push(`git_repo_url = $${paramIndex++}`);
      values.push(updates.git_repo_url);
    }

    if (updates.root_directory !== undefined) {
      setClauses.push(`root_directory = $${paramIndex++}`);
      values.push(updates.root_directory);
    }

    if (updates.metadata !== undefined) {
      setClauses.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(updates.metadata));
    }

    if (setClauses.length === 0) {
      throw new Error('No updates provided');
    }

    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    try {
      const result = await pool.query(`
        UPDATE projects 
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id, name, description, status, git_repo_url, root_directory,
                  metadata, created_at, updated_at
      `, values);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error: any) {
      console.error('Update project error:', error);
      if (error.code === '23505') { // Unique constraint violation
        throw new Error('Project name already exists');
      }
      throw new Error('Failed to update project');
    }
  }

  /**
   * Delete project
   */
  static async deleteProject(id: string): Promise<boolean> {
    try {
      const result = await pool.query('DELETE FROM projects WHERE id = $1', [id]);
      return result.rowCount! > 0;
    } catch (error) {
      console.error('Delete project error:', error);
      throw new Error('Failed to delete project');
    }
  }

  /**
   * Get project sessions with context counts
   */
  static async getProjectSessions(projectId: string): Promise<Session[]> {
    try {
      const result = await pool.query(`
        SELECT 
          COALESCE(c.session_id, gen_random_uuid()) as id,
          c.project_id,
          p.name as project_name,
          MIN(c.created_at) as created_at,
          COUNT(*) as context_count,
          MAX(c.created_at) as last_context_at
        FROM contexts c
        LEFT JOIN projects p ON c.project_id = p.id
        WHERE c.project_id = $1 AND c.session_id IS NOT NULL
        GROUP BY c.session_id, c.project_id, p.name
        ORDER BY MIN(c.created_at) DESC
      `, [projectId]);

      return result.rows.map(row => ({
        id: row.id,
        project_id: row.project_id,
        project_name: row.project_name,
        created_at: row.created_at,
        session_type: 'context-based', // Legacy context-based sessions
        context_count: parseInt(row.context_count) || 0,
        last_context_at: row.last_context_at
      }));
    } catch (error) {
      console.error('Get project sessions error:', error);
      throw new Error('Failed to get project sessions');
    }
  }

  /**
   * Get all sessions across all projects (unified from sessions table)
   */
  static async getAllSessions(): Promise<Session[]> {
    try {
      const result = await pool.query(`
        SELECT 
          s.id,
          s.project_id,
          p.name as project_name,
          s.started_at as created_at,
          s.agent_type as session_type,
          s.contexts_created as context_count,
          COALESCE(s.last_activity_at, s.ended_at, s.started_at) as last_context_at
        FROM sessions s
        LEFT JOIN projects p ON s.project_id = p.id
        ORDER BY s.started_at DESC
      `);

      return result.rows.map(row => ({
        id: row.id,
        project_id: row.project_id,
        project_name: row.project_name,
        created_at: row.created_at,
        session_type: row.session_type,
        context_count: parseInt(row.context_count) || 0,
        last_context_at: row.last_context_at
      }));
    } catch (error) {
      console.error('Get all sessions error:', error);
      throw new Error('Failed to get sessions');
    }
  }

  /**
   * Get project statistics
   */
  static async getProjectStats(): Promise<ProjectStats> {
    try {
      // Get basic project counts
      const projectResult = await pool.query(`
        SELECT 
          COUNT(*) as total_projects,
          COUNT(*) FILTER (WHERE status = 'active') as active_projects
        FROM projects
      `);

      // Get context and session counts
      const contextResult = await pool.query(`
        SELECT 
          COUNT(*) as total_contexts,
          COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL) as total_sessions,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as contexts_last_week
        FROM contexts
      `);

      // Get contexts by type
      const typeResult = await pool.query(`
        SELECT 
          context_type,
          COUNT(*) as count
        FROM contexts
        GROUP BY context_type
      `);

      // Get recent sessions
      const sessionResult = await pool.query(`
        SELECT 
          COUNT(DISTINCT session_id) as sessions_last_week
        FROM contexts
        WHERE created_at >= NOW() - INTERVAL '7 days' AND session_id IS NOT NULL
      `);

      // Build the contexts_by_type object
      const contexts_by_type: Record<string, number> = {};
      typeResult.rows.forEach(row => {
        contexts_by_type[row.context_type] = parseInt(row.count);
      });

      const projectRow = projectResult.rows[0];
      const contextRow = contextResult.rows[0];
      const sessionRow = sessionResult.rows[0];

      return {
        total_projects: parseInt(projectRow.total_projects),
        active_projects: parseInt(projectRow.active_projects),
        total_contexts: parseInt(contextRow.total_contexts),
        total_sessions: parseInt(contextRow.total_sessions),
        contexts_by_type,
        recent_activity: {
          contexts_last_week: parseInt(contextRow.contexts_last_week),
          sessions_last_week: parseInt(sessionRow.sessions_last_week) || 0
        }
      };
    } catch (error) {
      console.error('Get project stats error:', error);
      throw new Error('Failed to get project statistics');
    }
  }
}
