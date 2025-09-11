import { Pool } from 'pg';
import { db } from '../config/database.js';

export interface Task {
    id: string;
    projectId: string;
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
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `INSERT INTO tasks 
                 (project_id, title, description, type, priority, assigned_to, created_by, tags, dependencies, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING *`,
                [projectId, title, description, type, priority, assignedTo, createdBy, tags, dependencies, metadata]
            );
            return this.mapTask(result.rows[0]);
        } finally {
            client.release();
        }
    }

    async listTasks(projectId: string, assignedTo?: string, status?: string, type?: string): Promise<Task[]> {
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
            if (status) {
                query += ` AND status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }
            if (type) {
                query += ` AND type = $${paramIndex}`;
                params.push(type);
                paramIndex++;
            }

            query += ` ORDER BY priority DESC, created_at DESC`;
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
        } finally {
            client.release();
        }
    }

    private mapTask(row: any): Task {
        return {
            id: row.id,
            projectId: row.project_id,
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
