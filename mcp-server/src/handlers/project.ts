/**
 * AIDIS Project Management Handler
 * 
 * This handles all project management operations:
 * - Creating and managing projects
 * - Session state (current active project)
 * - Project switching for AI agents
 * - Project discovery and listing
 * 
 * This enables AI agents to seamlessly work across multiple projects!
 */

import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
// Re-export types from shared types file (to avoid circular dependency with projectSwitchValidator)
export type { ProjectInfo, CreateProjectRequest, SessionState } from '../types/project.js';
// Import for internal use
import type { ProjectInfo, CreateProjectRequest, SessionState } from '../types/project.js';

class ProjectHandler {
  // In-memory session state (in production, this could be Redis/database)
  private sessionStates = new Map<string, SessionState>();
  private defaultSessionId = 'default-session';

  /**
   * List all projects with optional statistics
   */
  async listProjects(includeStats: boolean = true): Promise<ProjectInfo[]> {
    logger.info('📋 Listing all projects...');

    try {
      let sql = `
        SELECT 
          p.id, p.name, p.description, p.status, 
          p.created_at, p.updated_at, p.git_repo_url, 
          p.root_directory, p.metadata
      `;

      if (includeStats) {
        sql += `, COUNT(c.id) as context_count`;
      }

      sql += ` FROM projects p`;

      if (includeStats) {
        sql += ` LEFT JOIN contexts c ON p.id = c.project_id`;
      }

      sql += ` GROUP BY p.id, p.name, p.description, p.status, p.created_at, p.updated_at, p.git_repo_url, p.root_directory, p.metadata`;
      sql += ` ORDER BY p.updated_at DESC`;

      const result = await db.query(sql);

      // Get current project ID once before mapping (now async)
      const currentProjectId = await this.getCurrentProjectId();

      const projects: ProjectInfo[] = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        gitRepoUrl: row.git_repo_url,
        rootDirectory: row.root_directory,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
        contextCount: includeStats ? parseInt(row.context_count || '0') : undefined,
        isActive: currentProjectId === row.id
      }));

      logger.info(`✅ Found ${projects.length} projects`);
      return projects;

    } catch (error) {
      logger.error('❌ Failed to list projects', error as Error);
      throw new Error(`Failed to list projects: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a new project
   */
  async createProject(request: CreateProjectRequest): Promise<ProjectInfo> {
    logger.info(`🆕 Creating new project: "${request.name}"`);

    try {
      // Validate name uniqueness
      const existingCheck = await db.query('SELECT id FROM projects WHERE name = $1', [request.name]);
      if (existingCheck.rows.length > 0) {
        throw new Error(`Project with name "${request.name}" already exists`);
      }

      // Insert new project
      const result = await db.query(`
        INSERT INTO projects (name, description, git_repo_url, root_directory, metadata)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [
        request.name,
        request.description || null,
        request.gitRepoUrl || null,
        request.rootDirectory || null,
        JSON.stringify(request.metadata || {})
      ]);

      const row = result.rows[0];
      const project: ProjectInfo = {
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        gitRepoUrl: row.git_repo_url,
        rootDirectory: row.root_directory,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
        contextCount: 0
      };

      logger.info(`✅ Created project: ${project.id}`);
      return project;

    } catch (error) {
      logger.error('❌ Failed to create project', error as Error);
      throw new Error(`Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get project details by ID or name
   */
  async getProject(identifier: string): Promise<ProjectInfo | null> {
    logger.info(`🔍 Getting project: "${identifier}"`);

    try {
      // Try by ID first (UUID format), then by name
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);
      
      const field = isUUID ? 'id' : 'name';
      const result = await db.query(`
        SELECT 
          p.id, p.name, p.description, p.status,
          p.created_at, p.updated_at, p.git_repo_url,
          p.root_directory, p.metadata,
          COUNT(c.id) as context_count
        FROM projects p
        LEFT JOIN contexts c ON p.id = c.project_id
        WHERE p.${field} = $1
        GROUP BY p.id, p.name, p.description, p.status, p.created_at, p.updated_at, p.git_repo_url, p.root_directory, p.metadata
      `, [identifier]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];

      // Get current project ID (now async)
      const currentProjectId = await this.getCurrentProjectId();

      const project: ProjectInfo = {
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        gitRepoUrl: row.git_repo_url,
        rootDirectory: row.root_directory,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
        contextCount: parseInt(row.context_count || '0'),
        isActive: currentProjectId === row.id
      };

      logger.info(`✅ Found project: ${project.name} (${project.contextCount} contexts)`);
      return project;

    } catch (error) {
      logger.error('❌ Failed to get project', error as Error);
      throw new Error(`Failed to get project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Set the current active project for the session
   */
  setCurrentProject(projectId: string, sessionId: string = this.defaultSessionId, manualOverride: boolean = false): void {
    logger.info(`🔄 Setting current project to: ${projectId} (session: ${sessionId}, manual: ${manualOverride})`);

    const existing = this.sessionStates.get(sessionId) || {};
    this.sessionStates.set(sessionId, {
      ...existing,
      currentProjectId: projectId,
      sessionId,
      manualOverride  // Store whether this was a manual switch
    });

    logger.info(`✅ Current project set for session ${sessionId}${manualOverride ? ' (manual override)' : ''}`);
  }

  /**
   * Clear all session caches - forces re-initialization on next access
   * Used when primary project changes to ensure sessions sync with new default
   */
  clearSessionCache(): void {
    logger.info('🗑️  Clearing all session caches');
    const sessionCount = this.sessionStates.size;
    this.sessionStates.clear();
    logger.info(`✅ Cleared ${sessionCount} session cache(s)`);
  }

  /**
   * Get the current active project ID
   * Now async with cache validation to prevent stale project IDs
   */
  async getCurrentProjectId(sessionId: string = this.defaultSessionId): Promise<string | null> {
    const state = this.sessionStates.get(sessionId);
    const cachedId = state?.currentProjectId;

    if (!cachedId) {
      return null;
    }

    // Validate cached ID still exists in database
    const result = await db.query(
      'SELECT 1 FROM projects WHERE id = $1',
      [cachedId]
    );

    if (result.rows.length === 0) {
      // Clear invalid cached state
      logger.warn(`Clearing stale project cache for session ${sessionId}: project ${cachedId} no longer exists`);
      this.sessionStates.delete(sessionId);
      return null;
    }

    return cachedId;
  }

  /**
   * Get the current active project details
   */
  async getCurrentProject(sessionId: string = this.defaultSessionId): Promise<ProjectInfo | null> {
    const projectId = await this.getCurrentProjectId(sessionId);
    if (!projectId) {
      return null;
    }

    return await this.getProject(projectId);
  }

  /**
   * Switch to a project (by ID or name) and set as current
   * Enhanced with TS012 validation framework
   */
  async switchProject(identifier: string, sessionId: string = this.defaultSessionId): Promise<ProjectInfo> {
    logger.info(`🔄 Switching to project: "${identifier}" (session: ${sessionId.substring(0, 8)}...)`);

    // Basic validation for backwards compatibility
    const project = await this.getProject(identifier);
    if (!project) {
      throw new Error(`Project "${identifier}" not found`);
    }

    // Mark as manual override so initializeSession() won't override this choice
    this.setCurrentProject(project.id, sessionId, true);

    logger.info(`✅ Switched to project: ${project.name}`);
    return { ...project, isActive: true };
  }

  // Note: switchProjectWithValidation moved to projectSwitchValidator.ts to avoid circular dependency
  // Use ProjectSwitchValidator.switchProjectWithValidation() instead

  /**
   * Get session state information
   */
  getSessionInfo(sessionId: string = this.defaultSessionId): SessionState {
    return this.sessionStates.get(sessionId) || {
      currentProjectId: null,
      sessionId
    };
  }

  /**
   * Initialize session with default project (if available)
   */
  async initializeSession(sessionId: string = this.defaultSessionId): Promise<ProjectInfo | null> {
    logger.info(`🔄 Initializing session: ${sessionId}`);

    // Get all projects first
    const projects = await this.listProjects(false);
    if (projects.length === 0) {
      logger.info('⚠️  No projects available');
      return null;
    }

    // Priority 0: Check if user manually switched - respect their choice!
    const sessionState = this.sessionStates.get(sessionId);
    const existing = await this.getCurrentProjectId(sessionId);

    if (sessionState?.manualOverride && existing) {
      const manualProject = await this.getProject(existing);
      if (manualProject) {
        logger.info(`✅ Respecting manual project switch: ${manualProject.name}`);
        return { ...manualProject, isActive: true };
      }
    }

    // Priority 1: Check for primary project (respects user's default preference)
    const primaryProject = projects.find(p => p.metadata && p.metadata.is_primary === true);

    if (primaryProject) {
      logger.info(`✅ Found primary project: ${primaryProject.name}`);

      // Check if we're already on the primary project
      if (existing === primaryProject.id) {
        logger.info(`✅ Already on primary project: ${primaryProject.name}`);
        return { ...primaryProject, isActive: true };
      }

      // Switch from cached project to primary
      if (existing) {
        const old = await this.getProject(existing);
        logger.info(`🔄 Switching from ${old?.name} to primary project: ${primaryProject.name}`);
      }

      this.setCurrentProject(primaryProject.id, sessionId);
      return { ...primaryProject, isActive: true };
    }

    // Priority 2: No primary - check cached session state
    if (existing) {
      const project = await this.getProject(existing);
      if (project) {
        logger.info(`✅ Using cached project: ${project.name} (no primary set)`);
        return project;
      }
    }

    // Priority 3: Fall back to system defaults
    let defaultProject = projects.find(p => p.name === 'aidis-bootstrap');
    if (defaultProject) {
      logger.info(`✅ Using system default project: ${defaultProject.name}`);
    } else {
      // Priority 4: Use first available project
      defaultProject = projects[0];
      logger.info(`✅ Using first available project: ${defaultProject.name}`);
    }

    this.setCurrentProject(defaultProject.id, sessionId);
    logger.info(`✅ Session initialized with project: ${defaultProject.name}`);

    return { ...defaultProject, isActive: true };
  }

  /**
   * Update project details
   */
  async updateProject(projectId: string, updates: Partial<CreateProjectRequest>): Promise<ProjectInfo> {
    logger.info(`📝 Updating project: ${projectId}`);

    try {
      // Build dynamic update query
      const updateFields = [];
      const values = [];
      let paramIndex = 1;

      if (updates.name !== undefined) {
        updateFields.push(`name = $${paramIndex}`);
        values.push(updates.name);
        paramIndex++;
      }

      if (updates.description !== undefined) {
        updateFields.push(`description = $${paramIndex}`);
        values.push(updates.description);
        paramIndex++;
      }

      if (updates.gitRepoUrl !== undefined) {
        updateFields.push(`git_repo_url = $${paramIndex}`);
        values.push(updates.gitRepoUrl);
        paramIndex++;
      }

      if (updates.rootDirectory !== undefined) {
        updateFields.push(`root_directory = $${paramIndex}`);
        values.push(updates.rootDirectory);
        paramIndex++;
      }

      if (updates.metadata !== undefined) {
        updateFields.push(`metadata = $${paramIndex}`);
        values.push(JSON.stringify(updates.metadata));
        paramIndex++;
      }

      if (updateFields.length === 0) {
        throw new Error('No update fields provided');
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(projectId);

      const sql = `
        UPDATE projects 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await db.query(sql, values);
      
      if (result.rows.length === 0) {
        throw new Error(`Project ${projectId} not found`);
      }

      const row = result.rows[0];

      // Get current project ID (now async)
      const currentProjectId = await this.getCurrentProjectId();

      const project: ProjectInfo = {
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        gitRepoUrl: row.git_repo_url,
        rootDirectory: row.root_directory,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
        isActive: currentProjectId === row.id
      };

      logger.info(`✅ Updated project: ${project.name}`);
      return project;

    } catch (error) {
      logger.error('❌ Failed to update project', error as Error);
      throw new Error(`Failed to update project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton instance
export const projectHandler = new ProjectHandler();
