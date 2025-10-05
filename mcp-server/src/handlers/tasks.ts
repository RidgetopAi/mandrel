import { Pool } from 'pg';
import { db } from '../config/database.js';

export interface Task {
    id: string;
    projectId: string;
    sessionId?: string;  // TS005-1: Link to session where task was created
    title: string;
    description?: string;
    type: string;
    status: 'todo' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    dependencies: string[];
    tags: string[];
    metadata: Record<string, any>;
    assignedTo?: string;  // Simple string, no FK
    createdBy?: string;   // Simple string, no FK
    progress: number;
    startedAt?: Date;
    completedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export class TasksHandler {
    constructor(private pool: Pool = db) {}

    async createTask(
        projectId: string,
        title: string,
        description?: string,
        type: string = 'general',
        priority: Task['priority'] = 'medium',
        assignedTo?: string,
        createdBy?: string,
        tags: string[] = [],
        dependencies: string[] = [],
        metadata: Record<string, any> = {}
    ): Promise<Task> {
        // Validate project exists before creating task
        const projectExists = await this.pool.query(
            'SELECT 1 FROM projects WHERE id = $1',
            [projectId]
        );
        if (projectExists.rows.length === 0) {
            throw new Error(`Cannot create task: Invalid project ID ${projectId}. Project does not exist.`);
        }

        const client = await this.pool.connect();
        try {
            // TS005-1: Capture active session_id for task-session linking
            const { SessionTracker } = await import('../services/sessionTracker.js');
            const sessionId = await SessionTracker.getActiveSession();

            const result = await client.query(
                `INSERT INTO tasks
                 (project_id, session_id, title, description, type, priority, assigned_to, created_by, tags, dependencies, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                 RETURNING *`,
                [projectId, sessionId, title, description, type, priority, assignedTo, createdBy, tags, dependencies, metadata]
            );

            // TS004-1: Update session activity after task creation
            if (sessionId) {
                await SessionTracker.updateSessionActivity(sessionId);
                // TS007-2: Record task creation for activity tracking
                SessionTracker.recordTaskCreated(sessionId);
            }

            return this.mapTask(result.rows[0]);
        } finally {
            client.release();
        }
    }

    async listTasks(
        projectId: string,
        assignedTo?: string,
        status?: string,
        type?: string,
        tags?: string[],
        priority?: string,
        phase?: string,
        statuses?: string[]
    ): Promise<Task[]> {
        const client = await this.pool.connect();
        try {
            let query = `SELECT * FROM tasks WHERE project_id = $1`;
            const params: any[] = [projectId];
            let paramIndex = 2;

            if (assignedTo) {
                query += ` AND assigned_to = $${paramIndex}`;
                params.push(assignedTo);
                paramIndex++;
            }

            // Handle single status vs multiple statuses
            if (statuses && statuses.length > 0) {
                const statusPlaceholders = statuses.map(() => `$${paramIndex++}`).join(', ');
                query += ` AND status IN (${statusPlaceholders})`;
                params.push(...statuses);
            } else if (status) {
                query += ` AND status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }

            if (type) {
                query += ` AND type = $${paramIndex}`;
                params.push(type);
                paramIndex++;
            }

            // Tag filtering - match ANY of the provided tags
            if (tags && tags.length > 0) {
                query += ` AND tags && $${paramIndex}`;
                params.push(tags);
                paramIndex++;
            }

            if (priority) {
                query += ` AND priority = $${paramIndex}`;
                params.push(priority);
                paramIndex++;
            }

            // Phase filtering - check if phase exists in tags
            if (phase) {
                query += ` AND ($${paramIndex} = ANY(tags) OR tags && ARRAY[$${paramIndex + 1}])`;
                params.push(`phase-${phase}`, `phase-${phase}`);
                paramIndex += 2;
            }

            query += ` ORDER BY
                CASE priority
                    WHEN 'urgent' THEN 4
                    WHEN 'high' THEN 3
                    WHEN 'medium' THEN 2
                    WHEN 'low' THEN 1
                    ELSE 0
                END DESC,
                created_at DESC`;

            const result = await client.query(query, params);
            return result.rows.map(row => this.mapTask(row));
        } finally {
            client.release();
        }
    }

    async updateTaskStatus(taskId: string, status: string, assignedTo?: string, metadata?: any): Promise<void> {
        const client = await this.pool.connect();
        try {
            const updates = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
            const params: any[] = [status];
            let paramIndex = 2;

            if (status === 'in_progress') updates.push(`started_at = CURRENT_TIMESTAMP`);
            if (status === 'completed') updates.push(`completed_at = CURRENT_TIMESTAMP`);

            if (assignedTo !== undefined) {
                updates.push(`assigned_to = $${paramIndex}`);
                params.push(assignedTo);
                paramIndex++;
            }
            if (metadata !== undefined) {
                updates.push(`metadata = $${paramIndex}`);
                params.push(metadata);
                paramIndex++;
            }

            params.push(taskId);
            await client.query(`UPDATE tasks SET ${updates.join(', ')} WHERE id = $${paramIndex}`, params);

            // TS004-1: Update session activity after task update
            const { SessionTracker } = await import('../services/sessionTracker.js');
            const sessionId = await SessionTracker.getActiveSession();
            if (sessionId) {
                await SessionTracker.updateSessionActivity(sessionId);
                // TS007-2: Record task update for activity tracking
                const isCompleted = status === 'completed';
                SessionTracker.recordTaskUpdated(sessionId, isCompleted);
            }
        } finally {
            client.release();
        }
    }

    /**
     * Bulk update multiple tasks atomically
     * @param taskIds Array of task IDs to update
     * @param updates Partial task updates to apply
     * @returns Summary of update operation
     */
    async bulkUpdateTasks(
        taskIds: string[],
        updates: {
            status?: Task['status'];
            assignedTo?: string;
            priority?: Task['priority'];
            metadata?: Record<string, any>;
            notes?: string;
            projectId?: string; // For validation only
        }
    ): Promise<{
        totalRequested: number;
        successfullyUpdated: number;
        failed: number;
        updatedTaskIds: string[];
        errors: string[];
    }> {
        if (!taskIds || taskIds.length === 0) {
            throw new Error('No task IDs provided for bulk update');
        }

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // First, validate all task IDs exist
            const existenceCheck = await client.query(
                'SELECT id FROM tasks WHERE id = ANY($1)',
                [taskIds]
            );

            const existingTaskIds = existenceCheck.rows.map(row => row.id);
            const missingTaskIds = taskIds.filter(id => !existingTaskIds.includes(id));

            if (missingTaskIds.length > 0) {
                await client.query('ROLLBACK');
                throw new Error(`Tasks not found: ${missingTaskIds.join(', ')}`);
            }

            // Optional: Validate project ownership if projectId is provided
            if (updates.projectId) {
                const projectCheck = await client.query(
                    'SELECT id FROM tasks WHERE id = ANY($1) AND project_id != $2',
                    [taskIds, updates.projectId]
                );

                if (projectCheck.rows.length > 0) {
                    await client.query('ROLLBACK');
                    const wrongProjectTasks = projectCheck.rows.map(row => row.id);
                    throw new Error(`Tasks belong to different project: ${wrongProjectTasks.join(', ')}`);
                }
            }

            // Build dynamic update query
            const updateClauses = ['updated_at = CURRENT_TIMESTAMP'];
            const params: any[] = [];
            let paramIndex = 1;

            if (updates.status !== undefined) {
                updateClauses.push(`status = $${paramIndex}`);
                params.push(updates.status);
                paramIndex++;

                // Handle status-specific timestamp updates
                if (updates.status === 'in_progress') {
                    updateClauses.push('started_at = CURRENT_TIMESTAMP');
                } else if (updates.status === 'completed') {
                    updateClauses.push('completed_at = CURRENT_TIMESTAMP');
                }
            }

            if (updates.assignedTo !== undefined) {
                updateClauses.push(`assigned_to = $${paramIndex}`);
                params.push(updates.assignedTo);
                paramIndex++;
            }

            if (updates.priority !== undefined) {
                updateClauses.push(`priority = $${paramIndex}`);
                params.push(updates.priority);
                paramIndex++;
            }

            if (updates.metadata !== undefined) {
                updateClauses.push(`metadata = $${paramIndex}`);
                params.push(updates.metadata);
                paramIndex++;
            }

            // Handle notes by merging into metadata
            if (updates.notes !== undefined) {
                updateClauses.push(`metadata = COALESCE(metadata, '{}'::jsonb) || $${paramIndex}::jsonb`);
                params.push(JSON.stringify({ notes: updates.notes, lastUpdated: new Date().toISOString() }));
                paramIndex++;
            }

            // Add task IDs as final parameter
            params.push(taskIds);

            // Execute bulk update
            const updateQuery = `
                UPDATE tasks
                SET ${updateClauses.join(', ')}
                WHERE id = ANY($${paramIndex})
                RETURNING id
            `;

            const updateResult = await client.query(updateQuery, params);
            const updatedTaskIds = updateResult.rows.map(row => row.id);

            await client.query('COMMIT');

            // TS007-2: Record task updates for activity tracking (one per task)
            const { SessionTracker } = await import('../services/sessionTracker.js');
            const sessionId = await SessionTracker.getActiveSession();
            if (sessionId && updatedTaskIds.length > 0) {
                const isCompleted = updates.status === 'completed';
                // Record one update per task that was successfully updated
                for (let i = 0; i < updatedTaskIds.length; i++) {
                    SessionTracker.recordTaskUpdated(sessionId, isCompleted);
                }
            }

            return {
                totalRequested: taskIds.length,
                successfullyUpdated: updatedTaskIds.length,
                failed: taskIds.length - updatedTaskIds.length,
                updatedTaskIds,
                errors: []
            };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get task progress summary with grouping options
     * @param projectId Project to analyze
     * @param groupBy Grouping option: 'phase', 'status', 'priority', 'type', 'assignedTo'
     * @returns Progress summary with counts and percentages
     */
    async getTaskProgressSummary(
        projectId: string,
        groupBy: 'phase' | 'status' | 'priority' | 'type' | 'assignedTo' = 'phase'
    ): Promise<{
        totalTasks: number;
        groupedProgress: Array<{
            group: string;
            totalTasks: number;
            completedTasks: number;
            completionPercentage: number;
            pendingTasks: number;
            inProgressTasks: number;
            blockedTasks: number;
        }>;
        overallProgress: {
            completed: number;
            total: number;
            percentage: number;
        };
    }> {
        const client = await this.pool.connect();
        try {
            let groupColumn: string;
            let _extractFunction: string = '';

            switch (groupBy) {
                case 'phase':
                    // Extract phase from tags like 'phase-3', 'phase-4'
                    groupColumn = `(
                        SELECT tag
                        FROM unnest(tags) as tag
                        WHERE tag LIKE 'phase-%'
                        LIMIT 1
                    )`;
                    break;
                case 'status':
                    groupColumn = 'status';
                    break;
                case 'priority':
                    groupColumn = 'priority';
                    break;
                case 'type':
                    groupColumn = 'type';
                    break;
                case 'assignedTo':
                    groupColumn = 'COALESCE(assigned_to, \'unassigned\')';
                    break;
                default:
                    groupColumn = 'status';
            }

            // Get grouped progress summary
            const progressQuery = `
                WITH task_groups AS (
                    SELECT
                        ${groupColumn} as group_name,
                        COUNT(*) as total_tasks,
                        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
                        SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) as pending_tasks,
                        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_tasks,
                        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked_tasks
                    FROM tasks
                    WHERE project_id = $1
                        AND ${groupColumn} IS NOT NULL
                    GROUP BY ${groupColumn}
                ),
                overall_stats AS (
                    SELECT
                        COUNT(*) as total_tasks,
                        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks
                    FROM tasks
                    WHERE project_id = $1
                )
                SELECT
                    tg.group_name,
                    tg.total_tasks,
                    tg.completed_tasks,
                    ROUND((tg.completed_tasks::numeric / tg.total_tasks::numeric) * 100, 1) as completion_percentage,
                    tg.pending_tasks,
                    tg.in_progress_tasks,
                    tg.blocked_tasks,
                    os.total_tasks as overall_total,
                    os.completed_tasks as overall_completed,
                    ROUND((os.completed_tasks::numeric / os.total_tasks::numeric) * 100, 1) as overall_percentage
                FROM task_groups tg
                CROSS JOIN overall_stats os
                ORDER BY
                    CASE
                        WHEN tg.group_name ~ '^phase-[0-9]+$' THEN
                            CAST(regexp_replace(tg.group_name, 'phase-', '') AS INTEGER)
                        WHEN tg.group_name ~ '^phase-[0-9]+[a-zA-Z]+' THEN
                            CAST(regexp_replace(regexp_replace(tg.group_name, 'phase-', ''), '[a-zA-Z].*', '') AS INTEGER) + 0.5
                        ELSE 999
                    END,
                    tg.group_name
            `;

            const result = await client.query(progressQuery, [projectId]);

            // Get overall totals if no grouped results
            if (result.rows.length === 0) {
                const overallQuery = `
                    SELECT
                        COUNT(*) as total_tasks,
                        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks
                    FROM tasks
                    WHERE project_id = $1
                `;
                const overallResult = await client.query(overallQuery, [projectId]);
                const overall = overallResult.rows[0];

                return {
                    totalTasks: parseInt(overall.total_tasks) || 0,
                    groupedProgress: [],
                    overallProgress: {
                        completed: parseInt(overall.completed_tasks) || 0,
                        total: parseInt(overall.total_tasks) || 0,
                        percentage: overall.total_tasks > 0
                            ? Math.round((parseInt(overall.completed_tasks) / parseInt(overall.total_tasks)) * 100)
                            : 0
                    }
                };
            }

            const firstRow = result.rows[0];
            const overallTotal = parseInt(firstRow.overall_total) || 0;
            const overallCompleted = parseInt(firstRow.overall_completed) || 0;
            const overallPercentage = overallTotal > 0 ? Math.round((overallCompleted / overallTotal) * 100) : 0;

            return {
                totalTasks: overallTotal,
                groupedProgress: result.rows.map(row => ({
                    group: row.group_name || 'ungrouped',
                    totalTasks: parseInt(row.total_tasks) || 0,
                    completedTasks: parseInt(row.completed_tasks) || 0,
                    completionPercentage: parseFloat(row.completion_percentage) || 0,
                    pendingTasks: parseInt(row.pending_tasks) || 0,
                    inProgressTasks: parseInt(row.in_progress_tasks) || 0,
                    blockedTasks: parseInt(row.blocked_tasks) || 0
                })),
                overallProgress: {
                    completed: overallCompleted,
                    total: overallTotal,
                    percentage: overallPercentage
                }
            };

        } finally {
            client.release();
        }
    }

    private mapTask(row: any): Task {
        return {
            id: row.id,
            projectId: row.project_id,
            sessionId: row.session_id,  // TS005-1: Include session_id in mapped task
            title: row.title,
            description: row.description,
            type: row.type,
            status: row.status,
            priority: row.priority,
            dependencies: row.dependencies || [],
            tags: row.tags || [],
            metadata: row.metadata || {},
            assignedTo: row.assigned_to,
            createdBy: row.created_by,
            progress: row.progress || 0,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}

export const tasksHandler = new TasksHandler();
