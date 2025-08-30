import { db as pool } from '../database/connection';

// Define Task interface locally since shared types are not in rootDir
interface Task {
  id: string;
  project_id: string;
  title: string;
  description?: string;
  type: string;
  status: 'todo' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: string;
  dependencies: string[];
  tags: string[];
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/**
 * Task Service
 * Comprehensive task management operations for AIDIS
 */

export interface CreateTaskRequest {
  project_id: string;
  title: string;
  description?: string;
  type?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: string;
  dependencies?: string[];
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  type?: string;
  status?: 'todo' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: string;
  dependencies?: string[];
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface TaskFilter {
  project_id?: string;
  assigned_to?: string;
  status?: string | string[];
  priority?: string | string[];
  type?: string;
  tags?: string[];
  search?: string;
}

export interface TaskStats {
  total: number;
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  by_type: Record<string, number>;
  completion_rate: number;
  avg_completion_time?: number;
}

export interface TaskDependency {
  id: string;
  title: string;
  status: string;
  blocking_tasks: string[];
}

export class TaskService {
  /**
   * Count active tasks (Oracle Phase 2 dashboard requirement)
   * Active = NOT completed (todo, in_progress, blocked)
   */
  static async countActive(projectId?: string): Promise<number> {
    try {
      let query = "SELECT COUNT(*) FROM tasks WHERE status != 'completed' AND status != 'cancelled'";
      const params: any[] = [];
      
      if (projectId) {
        query += " AND project_id = $1";
        params.push(projectId);
      }
      
      const result = await pool.query(query, params);
      const count = parseInt(result.rows[0].count);
      
      console.log(`📊 TaskService.countActive - Project: ${projectId || 'ALL'}, Count: ${count}`);
      return count;
    } catch (error) {
      console.error('Task count active error:', error);
      throw new Error('Failed to get active task count');
    }
  }

  /**
   * Get all tasks with optional filtering
   */
  static async getTasks(filter: TaskFilter = {}): Promise<Task[]> {
    try {
      let query = `
        SELECT 
          t.id, t.project_id, t.title, t.description, t.type,
          t.status, t.priority, t.assigned_to, t.dependencies,
          t.tags, t.metadata, t.created_at, t.updated_at,
          p.name as project_name,
          a.name as assigned_to_name
        FROM tasks t
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN agents a ON t.assigned_to = a.id
        WHERE 1=1
      `;
      
      const params: any[] = [];
      let paramIndex = 1;

      if (filter.project_id) {
        query += ` AND t.project_id = $${paramIndex++}`;
        params.push(filter.project_id);
      }

      if (filter.assigned_to) {
        query += ` AND t.assigned_to = $${paramIndex++}`;
        params.push(filter.assigned_to);
      }

      if (filter.status) {
        if (Array.isArray(filter.status)) {
          query += ` AND t.status = ANY($${paramIndex++})`;
          params.push(filter.status);
        } else {
          query += ` AND t.status = $${paramIndex++}`;
          params.push(filter.status);
        }
      }

      if (filter.priority) {
        if (Array.isArray(filter.priority)) {
          query += ` AND t.priority = ANY($${paramIndex++})`;
          params.push(filter.priority);
        } else {
          query += ` AND t.priority = $${paramIndex++}`;
          params.push(filter.priority);
        }
      }

      if (filter.type) {
        query += ` AND t.type = $${paramIndex++}`;
        params.push(filter.type);
      }

      if (filter.tags && filter.tags.length > 0) {
        query += ` AND t.tags && $${paramIndex++}`;
        params.push(filter.tags);
      }

      if (filter.search) {
        query += ` AND (t.title ILIKE $${paramIndex++} OR t.description ILIKE $${paramIndex++})`;
        const searchTerm = `%${filter.search}%`;
        params.push(searchTerm, searchTerm);
      }

      query += ` ORDER BY 
        CASE t.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END,
        t.created_at DESC
      `;

      const result = await pool.query(query, params);

      return result.rows.map((row: any) => ({
        id: row.id,
        project_id: row.project_id,
        title: row.title,
        description: row.description,
        type: row.type,
        status: row.status,
        priority: row.priority,
        assigned_to: row.assigned_to,
        dependencies: row.dependencies,
        tags: row.tags,
        metadata: row.metadata,
        created_at: row.created_at,
        updated_at: row.updated_at
      }));
    } catch (error) {
      console.error('Get tasks error:', error);
      throw new Error('Failed to get tasks');
    }
  }

  /**
   * Get single task by ID
   */
  static async getTaskById(id: string): Promise<Task | null> {
    try {
      const result = await pool.query(`
        SELECT 
          t.id, t.project_id, t.title, t.description, t.type,
          t.status, t.priority, t.assigned_to, t.dependencies,
          t.tags, t.metadata, t.created_at, t.updated_at,
          p.name as project_name,
          a.name as assigned_to_name
        FROM tasks t
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN agents a ON t.assigned_to = a.id
        WHERE t.id = $1
      `, [id]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        project_id: row.project_id,
        title: row.title,
        description: row.description,
        type: row.type,
        status: row.status,
        priority: row.priority,
        assigned_to: row.assigned_to,
        dependencies: row.dependencies,
        tags: row.tags,
        metadata: row.metadata,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    } catch (error) {
      console.error('Get task by ID error:', error);
      throw new Error('Failed to get task');
    }
  }

  /**
   * Create new task
   */
  static async createTask(taskData: CreateTaskRequest): Promise<Task> {
    const { 
      project_id, title, description, type = 'general', 
      priority = 'medium', assigned_to, dependencies = [], 
      tags = [], metadata = {} 
    } = taskData;

    try {
      console.log('TaskService.createTask called with:', {
        project_id, title, description, type, priority, 
        assigned_to, dependencies, tags, metadata
      });
      
      const result = await pool.query(`
        INSERT INTO tasks (
          project_id, title, description, type, priority, 
          assigned_to, dependencies, tags, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        project_id, title, description, type, priority, 
        assigned_to, dependencies, tags, JSON.stringify(metadata)
      ]);

      const row = result.rows[0];
      return {
        id: row.id,
        project_id: row.project_id,
        title: row.title,
        description: row.description,
        type: row.type,
        status: row.status,
        priority: row.priority,
        assigned_to: row.assigned_to,
        dependencies: row.dependencies,
        tags: row.tags,
        metadata: row.metadata,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    } catch (error) {
      console.error('Create task error:', error);
      throw new Error('Failed to create task');
    }
  }

  /**
   * Update task
   */
  static async updateTask(id: string, updates: UpdateTaskRequest): Promise<Task | null> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.title !== undefined) {
      setClauses.push(`title = $${paramIndex++}`);
      values.push(updates.title);
    }

    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }

    if (updates.type !== undefined) {
      setClauses.push(`type = $${paramIndex++}`);
      values.push(updates.type);
    }

    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }

    if (updates.priority !== undefined) {
      setClauses.push(`priority = $${paramIndex++}`);
      values.push(updates.priority);
    }

    if (updates.assigned_to !== undefined) {
      setClauses.push(`assigned_to = $${paramIndex++}`);
      values.push(updates.assigned_to);
    }

    if (updates.dependencies !== undefined) {
      setClauses.push(`dependencies = $${paramIndex++}`);
      values.push(updates.dependencies);
    }

    if (updates.tags !== undefined) {
      setClauses.push(`tags = $${paramIndex++}`);
      values.push(updates.tags);
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
        UPDATE tasks 
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `, values);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        project_id: row.project_id,
        title: row.title,
        description: row.description,
        type: row.type,
        status: row.status,
        priority: row.priority,
        assigned_to: row.assigned_to,
        dependencies: row.dependencies,
        tags: row.tags,
        metadata: row.metadata,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    } catch (error) {
      console.error('Update task error:', error);
      throw new Error('Failed to update task');
    }
  }

  /**
   * Delete task
   */
  static async deleteTask(id: string): Promise<boolean> {
    try {
      const result = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error('Delete task error:', error);
      throw new Error('Failed to delete task');
    }
  }

  /**
   * Get task statistics
   */
  static async getTaskStats(projectId?: string): Promise<TaskStats> {
    try {
      let baseQuery = 'FROM tasks';
      const params: any[] = [];
      
      if (projectId) {
        baseQuery += ' WHERE project_id = $1';
        params.push(projectId);
      }

      const [totalResult, statusResult, priorityResult, typeResult] = await Promise.all([
        pool.query(`SELECT COUNT(*) as total ${baseQuery}`, params),
        pool.query(`SELECT status, COUNT(*) as count ${baseQuery} GROUP BY status`, params),
        pool.query(`SELECT priority, COUNT(*) as count ${baseQuery} GROUP BY priority`, params),
        pool.query(`SELECT type, COUNT(*) as count ${baseQuery} GROUP BY type`, params)
      ]);

      const total = parseInt(totalResult.rows[0].total);
      const by_status: Record<string, number> = {};
      const by_priority: Record<string, number> = {};
      const by_type: Record<string, number> = {};

      statusResult.rows.forEach((row: any) => {
        by_status[row.status] = parseInt(row.count);
      });

      priorityResult.rows.forEach((row: any) => {
        by_priority[row.priority] = parseInt(row.count);
      });

      typeResult.rows.forEach((row: any) => {
        by_type[row.type] = parseInt(row.count);
      });

      const completed = by_status.completed || 0;
      const completion_rate = total > 0 ? (completed / total) * 100 : 0;

      return {
        total,
        by_status,
        by_priority,
        by_type,
        completion_rate: Math.round(completion_rate * 100) / 100
      };
    } catch (error) {
      console.error('Get task stats error:', error);
      throw new Error('Failed to get task statistics');
    }
  }

  /**
   * Get task dependencies (what this task depends on and what depends on it)
   */
  static async getTaskDependencies(taskId: string): Promise<{
    dependencies: TaskDependency[];
    dependents: TaskDependency[];
  }> {
    try {
      // Get tasks that this task depends on
      const dependenciesResult = await pool.query(`
        SELECT id, title, status
        FROM tasks 
        WHERE id = ANY(
          SELECT unnest(dependencies) FROM tasks WHERE id = $1
        )
      `, [taskId]);

      // Get tasks that depend on this task
      const dependentsResult = await pool.query(`
        SELECT id, title, status, dependencies
        FROM tasks 
        WHERE $1 = ANY(dependencies)
      `, [taskId]);

      const dependencies: TaskDependency[] = dependenciesResult.rows.map((row: any) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        blocking_tasks: []
      }));

      const dependents: TaskDependency[] = dependentsResult.rows.map((row: any) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        blocking_tasks: row.dependencies
      }));

      return { dependencies, dependents };
    } catch (error) {
      console.error('Get task dependencies error:', error);
      throw new Error('Failed to get task dependencies');
    }
  }

  /**
   * Bulk update task status (for Kanban drag-and-drop)
   */
  static async bulkUpdateStatus(updates: Array<{ id: string; status: string }>): Promise<Task[]> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const updatedTasks: Task[] = [];
      
      for (const update of updates) {
        const result = await client.query(`
          UPDATE tasks 
          SET status = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING *
        `, [update.status, update.id]);
        
        if (result.rows.length > 0) {
          updatedTasks.push(result.rows[0]);
        }
      }
      
      await client.query('COMMIT');
      return updatedTasks;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Bulk update status error:', error);
      throw new Error('Failed to bulk update task statuses');
    } finally {
      client.release();
    }
  }
}
