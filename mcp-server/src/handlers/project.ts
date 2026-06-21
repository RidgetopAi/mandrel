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
import { isValidUuid } from '../utils/uuid.js';
import { ActiveSessionStore } from '../services/session/state/ActiveSessionStore.js';
// Re-export types from shared types file (to avoid circular dependency with projectSwitchValidator)
export type { ProjectInfo, CreateProjectRequest, SessionState, ActiveThreadAnchor } from '../types/project.js';
// Import for internal use
import type { ProjectInfo, CreateProjectRequest, SessionState, ProjectChildCounts, DeleteProjectResult, ActiveThreadAnchor } from '../types/project.js';

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

      // Insert new project (status defaults to 'active' at the DB level when omitted)
      const result = await db.query(`
        INSERT INTO projects (name, description, status, git_repo_url, root_directory, metadata)
        VALUES ($1, $2, COALESCE($3, 'active'), $4, $5, $6)
        RETURNING *
      `, [
        request.name,
        request.description || null,
        request.status || null,
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
      const isUUID = isValidUuid(identifier);
      
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

    // ROOT FIX (b6c18866): keep the connection's session DB row in sync with its
    // current project. Previously project_switch only mutated the in-memory
    // sessionStates map, so a session's stored project_id diverged from the
    // project its newly-stored contexts landed in (cross-project misattribution).
    // Scope STRICTLY to THIS connection's own active session — never global.
    await this.syncSessionProject(sessionId, project.id);

    logger.info(`✅ Switched to project: ${project.name}`);
    return { ...project, isActive: true };
  }

  /**
   * Sync the DB `sessions` row to the current project for a SINGLE connection's
   * active session only (per-connection isolation — b6c18866).
   *
   * `connectionId` is the key used throughout the project handler (the route layer
   * passes context.connectionId as `sessionId`). The DB session that belongs to that
   * connection is resolved via ActiveSessionStore — which is itself connection-scoped.
   * If the connection has no bound DB session (e.g. internal/default callers), this is
   * a no-op: there is nothing to keep in sync, and we MUST NOT touch any other row.
   *
   * The UPDATE is always pinned to `WHERE id = <that one session id>`, so switching
   * project on connection A can never alter connection B's session row.
   */
  private async syncSessionProject(connectionId: string, projectId: string): Promise<void> {
    try {
      const activeSessionId = ActiveSessionStore.get(connectionId);
      if (!activeSessionId) {
        logger.info(
          `ℹ️  No active DB session bound to connection ${connectionId.substring(0, 8)}...; skipping session project sync`
        );
        return;
      }

      const result = await db.query(
        `UPDATE sessions SET project_id = $1 WHERE id = $2`,
        [projectId, activeSessionId]
      );

      if (result.rowCount && result.rowCount > 0) {
        logger.info(
          `✅ Synced session ${activeSessionId.substring(0, 8)}... project_id → ${projectId} (connection ${connectionId.substring(0, 8)}...)`
        );
      } else {
        logger.warn(
          `⚠️  Session ${activeSessionId.substring(0, 8)}... not found while syncing project (already ended?)`
        );
      }
    } catch (error) {
      // Never let a sync failure break the user-facing switch; log and move on.
      logger.error('❌ Failed to sync session project_id during switch', error as Error);
    }
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

  // ───────────────────────────────────────────────────────────────────────────
  // ACTIVE-THREAD ANCHOR (Mandrel Core Redesign T5b, task ce5d119c) — the
  // deterministic auto-threading layer's per-session state. Lives RIGHT HERE
  // alongside setCurrentProject/getCurrentProjectId because it is the same kind of
  // per-connection session state, keyed by connectionId the exact same way.
  //
  // IN-MEMORY (v1) — consistent with currentProjectId. DB-backed persistence for
  // cross-restart durability is a deliberate future upgrade (a restart clears the
  // anchor today, identical to how the in-memory current-project cache behaves).
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Set the session's active-thread anchor. Pass RESOLVED full UUIDs (the route resolves
   * id8|uuid project-scoped BEFORE calling this). At least one of task/decision must be
   * provided; an omitted side is left unchanged when merging, but here we MERGE over any
   * existing anchor so `thread_set({task})` then `thread_set({decision})` accumulates both.
   * Returns the resulting anchor.
   */
  setActiveThread(
    anchor: { task?: string | null; decision?: string | null },
    sessionId: string = this.defaultSessionId
  ): ActiveThreadAnchor {
    const existing = this.sessionStates.get(sessionId) || { currentProjectId: null, sessionId };
    const prior: ActiveThreadAnchor = existing.activeThread ?? { taskId: null, decisionId: null };

    const next: ActiveThreadAnchor = {
      // `undefined` = "leave unchanged"; an explicit `null` clears that side.
      taskId: anchor.task === undefined ? prior.taskId : anchor.task,
      decisionId: anchor.decision === undefined ? prior.decisionId : anchor.decision,
    };

    this.sessionStates.set(sessionId, { ...existing, sessionId, activeThread: next });
    logger.info(
      `🧵 Active thread set for session ${sessionId}: task=${next.taskId?.substring(0, 8) ?? '-'} ` +
        `decision=${next.decisionId?.substring(0, 8) ?? '-'}`
    );
    return next;
  }

  /**
   * Get the session's active-thread anchor, or null if none is set (or both sides null).
   */
  getActiveThread(sessionId: string = this.defaultSessionId): ActiveThreadAnchor | null {
    const anchor = this.sessionStates.get(sessionId)?.activeThread;
    if (!anchor) return null;
    if (!anchor.taskId && !anchor.decisionId) return null;
    return anchor;
  }

  /**
   * Clear the session's active-thread anchor. Idempotent — clearing when nothing is set
   * is a no-op. Returns true iff something was actually cleared.
   */
  clearActiveThread(sessionId: string = this.defaultSessionId): boolean {
    const existing = this.sessionStates.get(sessionId);
    const had = !!(existing?.activeThread && (existing.activeThread.taskId || existing.activeThread.decisionId));
    if (existing) {
      this.sessionStates.set(sessionId, { ...existing, activeThread: undefined });
    }
    logger.info(`🧵 Active thread ${had ? 'cleared' : '(already empty)'} for session ${sessionId}`);
    return had;
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

      if (updates.status !== undefined) {
        updateFields.push(`status = $${paramIndex}`);
        values.push(updates.status);
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

  /**
   * Count the user-owned child rows a project owns. Used by deleteProject to
   * make the blast radius explicit BEFORE any destructive action.
   *
   * IMPORTANT (b... FK audit): every project FK is ON DELETE CASCADE, so deleting
   * a project silently wipes all of these. We surface the counts so a caller must
   * knowingly opt in (confirm: true) before that happens.
   */
  async getProjectChildCounts(projectId: string): Promise<ProjectChildCounts> {
    const [contexts, decisions, tasks, sessions] = await Promise.all([
      db.query('SELECT COUNT(*)::int AS n FROM contexts WHERE project_id = $1', [projectId]),
      db.query('SELECT COUNT(*)::int AS n FROM technical_decisions WHERE project_id = $1', [projectId]),
      db.query('SELECT COUNT(*)::int AS n FROM tasks WHERE project_id = $1', [projectId]),
      db.query('SELECT COUNT(*)::int AS n FROM sessions WHERE project_id = $1', [projectId]),
    ]);

    const c = contexts.rows[0].n as number;
    const d = decisions.rows[0].n as number;
    const t = tasks.rows[0].n as number;
    const s = sessions.rows[0].n as number;

    return { contexts: c, decisions: d, tasks: t, sessions: s, total: c + d + t + s };
  }

  /**
   * Delete a project (by id or name).
   *
   * SAFETY POLICY (deliberate):
   *  - All project FKs are ON DELETE CASCADE, so deletion silently removes every
   *    context/decision/task/session (and more) the project owns. We therefore:
   *  - REFUSE to delete a non-empty project unless `confirm === true`, returning the
   *    exact child counts the caller would lose (no mutation on the refusal path).
   *  - REFUSE to delete the currently-active project (avoids pulling it out from
   *    under a live connection).
   *  - REFUSE to delete the last remaining project.
   * An empty project (no children) deletes without requiring confirm.
   */
  async deleteProject(identifier: string, confirm: boolean = false): Promise<DeleteProjectResult> {
    logger.info(`🗑️  Delete requested for project: "${identifier}" (confirm=${confirm})`);

    const project = await this.getProject(identifier);
    if (!project) {
      throw new Error(`Project "${identifier}" not found`);
    }

    const counts = await this.getProjectChildCounts(project.id);

    // Guard: never delete the last remaining project.
    const allProjects = await this.listProjects(false);
    if (allProjects.length <= 1) {
      return {
        deleted: false,
        projectName: project.name,
        counts,
        message:
          `❌ Refusing to delete "${project.name}": it is the last remaining project. ` +
          `At least one project must exist.`,
      };
    }

    // Guard: never delete the currently-active project out from under a connection.
    const currentProjectId = await this.getCurrentProjectId();
    if (currentProjectId === project.id) {
      return {
        deleted: false,
        projectId: project.id,
        projectName: project.name,
        counts,
        message:
          `❌ Refusing to delete "${project.name}": it is the currently active project. ` +
          `Switch to another project first (project_switch), then delete.`,
      };
    }

    // Guard: refuse non-empty deletes without explicit confirmation. NO mutation here.
    if (counts.total > 0 && !confirm) {
      return {
        deleted: false,
        projectId: project.id,
        projectName: project.name,
        counts,
        message:
          `⚠️  Refusing to delete non-empty project "${project.name}" without confirmation.\n` +
          `Deleting it will CASCADE-DELETE: ${counts.contexts} contexts, ` +
          `${counts.decisions} decisions, ${counts.tasks} tasks, ${counts.sessions} sessions ` +
          `(${counts.total} owned records total).\n` +
          `Re-run with { confirm: true } to permanently delete the project and all of the above.`,
      };
    }

    // Perform the delete. FKs cascade automatically.
    await db.query('DELETE FROM projects WHERE id = $1', [project.id]);

    const lostSummary =
      counts.total > 0
        ? ` Cascade-removed ${counts.contexts} contexts, ${counts.decisions} decisions, ` +
          `${counts.tasks} tasks, ${counts.sessions} sessions.`
        : '';

    logger.info(`✅ Deleted project: ${project.name} (${project.id})${lostSummary}`);

    return {
      deleted: true,
      projectId: project.id,
      projectName: project.name,
      counts,
      message: `✅ Deleted project "${project.name}".${lostSummary}`,
    };
  }
}

// Export singleton instance
export const projectHandler = new ProjectHandler();
