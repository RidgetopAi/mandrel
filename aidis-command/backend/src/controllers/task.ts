import { Request, Response } from 'express';
import { TaskService, CreateTaskRequest, UpdateTaskRequest, TaskFilter } from '../services/task';
import { webSocketService } from '../services/websocket';

/**
 * Task Controller
 * Handles all task management HTTP endpoints
 */

export class TaskController {
  /**
   * GET /tasks - Get all tasks with optional filtering
   */
  static async getTasks(req: Request, res: Response): Promise<void> {
    try {
      const filter: TaskFilter = {};
      
      // Extract query parameters for filtering
      if (req.query.project_id) filter.project_id = req.query.project_id as string;
      if (req.query.assigned_to) filter.assigned_to = req.query.assigned_to as string;
      if (req.query.status) {
        filter.status = Array.isArray(req.query.status) 
          ? req.query.status as string[]
          : [req.query.status as string];
      }
      if (req.query.priority) {
        filter.priority = Array.isArray(req.query.priority)
          ? req.query.priority as string[]
          : [req.query.priority as string];
      }
      if (req.query.type) filter.type = req.query.type as string;
      if (req.query.tags) {
        filter.tags = Array.isArray(req.query.tags)
          ? req.query.tags as string[]
          : [req.query.tags as string];
      }
      if (req.query.search) filter.search = req.query.search as string;

      const tasks = await TaskService.getTasks(filter);
      
      res.json({
        success: true,
        data: {
          tasks,
          total: tasks.length
        }
      });
    } catch (error) {
      console.error('Get tasks error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get tasks'
      });
    }
  }

  /**
   * GET /tasks/:id - Get single task by ID
   */
  static async getTask(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const task = await TaskService.getTaskById(id);

      if (!task) {
        res.status(404).json({
          success: false,
          error: 'Task not found'
        });
        return;
      }

      res.json({
        success: true,
        data: { task }
      });
    } catch (error) {
      console.error('Get task error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get task'
      });
    }
  }

  /**
   * POST /tasks - Create new task
   */
  static async createTask(req: Request, res: Response): Promise<void> {
    try {
      const taskData: CreateTaskRequest = req.body;

      // Validation
      if (!taskData.title || taskData.title.trim() === '') {
        res.status(400).json({
          success: false,
          error: 'Task title is required'
        });
        return;
      }

      if (!taskData.project_id) {
        res.status(400).json({
          success: false,
          error: 'Project ID is required'
        });
        return;
      }

      const task = await TaskService.createTask(taskData);

      // Broadcast task creation via WebSocket
      webSocketService.broadcast({
        type: 'task_created',
        data: { task }
      });

      res.status(201).json({
        success: true,
        data: { task }
      });
    } catch (error) {
      console.error('Create task error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create task'
      });
    }
  }

  /**
   * PUT /tasks/:id - Update task
   */
  static async updateTask(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates: UpdateTaskRequest = req.body;

      const task = await TaskService.updateTask(id, updates);

      if (!task) {
        res.status(404).json({
          success: false,
          error: 'Task not found'
        });
        return;
      }

      // Broadcast task update via WebSocket
      webSocketService.broadcast({
        type: 'task_updated',
        data: { task }
      });

      res.json({
        success: true,
        data: { task }
      });
    } catch (error) {
      console.error('Update task error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update task'
      });
    }
  }

  /**
   * DELETE /tasks/:id - Delete task
   */
  static async deleteTask(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const success = await TaskService.deleteTask(id);

      if (!success) {
        res.status(404).json({
          success: false,
          error: 'Task not found'
        });
        return;
      }

      // Broadcast task deletion via WebSocket
      webSocketService.broadcast({
        type: 'task_deleted',
        data: { taskId: id }
      });

      res.json({
        success: true,
        data: { message: 'Task deleted successfully' }
      });
    } catch (error) {
      console.error('Delete task error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete task'
      });
    }
  }

  /**
   * GET /tasks/stats - Get task statistics
   */
  static async getTaskStats(req: Request, res: Response): Promise<void> {
    try {
      const projectId = req.query.project_id as string;
      const stats = await TaskService.getTaskStats(projectId);
      
      res.json({
        success: true,
        data: { stats }
      });
    } catch (error) {
      console.error('Get task stats error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get task statistics'
      });
    }
  }

  /**
   * GET /tasks/lead-time - Get lead time distribution analytics
   */
  static async getLeadTimeDistribution(req: Request, res: Response): Promise<void> {
    try {
      const projectId = req.query.project_id as string;
      const leadTimeData = await TaskService.getLeadTimeDistribution(projectId);
      
      res.json({
        success: true,
        data: { leadTimeData }
      });
    } catch (error) {
      console.error('Get lead time distribution error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get lead time distribution'
      });
    }
  }

  /**
   * GET /tasks/:id/dependencies - Get task dependencies
   */
  static async getTaskDependencies(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const dependencies = await TaskService.getTaskDependencies(id);
      
      res.json({
        success: true,
        data: { dependencies }
      });
    } catch (error) {
      console.error('Get task dependencies error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get task dependencies'
      });
    }
  }

  /**
   * POST /tasks/bulk-update - Bulk update tasks (for Kanban drag-and-drop)
   */
  static async bulkUpdateTasks(req: Request, res: Response): Promise<void> {
    try {
      const { updates } = req.body;

      if (!Array.isArray(updates)) {
        res.status(400).json({
          success: false,
          error: 'Updates must be an array'
        });
        return;
      }

      // Validate update format
      for (const update of updates) {
        if (!update.id || !update.status) {
          res.status(400).json({
            success: false,
            error: 'Each update must have id and status'
          });
          return;
        }
      }

      const updatedTasks = await TaskService.bulkUpdateStatus(updates);

      // Broadcast bulk update via WebSocket
      webSocketService.broadcast({
        type: 'tasks_bulk_updated',
        data: { tasks: updatedTasks }
      });

      res.json({
        success: true,
        data: { 
          tasks: updatedTasks,
          updated: updatedTasks.length
        }
      });
    } catch (error) {
      console.error('Bulk update tasks error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to bulk update tasks'
      });
    }
  }

  /**
   * POST /tasks/:id/assign - Assign task to agent
   */
  static async assignTask(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { assigned_to } = req.body;

      if (!assigned_to) {
        res.status(400).json({
          success: false,
          error: 'Agent ID is required for assignment'
        });
        return;
      }

      const task = await TaskService.updateTask(id, { assigned_to });

      if (!task) {
        res.status(404).json({
          success: false,
          error: 'Task not found'
        });
        return;
      }

      // Broadcast task assignment via WebSocket
      webSocketService.broadcast({
        type: 'task_assigned',
        data: { task, assigned_to }
      });

      res.json({
        success: true,
        data: { task }
      });
    } catch (error) {
      console.error('Assign task error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to assign task'
      });
    }
  }

  /**
   * POST /tasks/:id/status - Update task status with automatic status transitions
   */
  static async updateTaskStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status, note } = req.body;

      if (!status) {
        res.status(400).json({
          success: false,
          error: 'Status is required'
        });
        return;
      }

      const validStatuses = ['todo', 'in_progress', 'blocked', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
        return;
      }

      // Update metadata with status change note if provided
      const updates: UpdateTaskRequest = { status };
      if (note) {
        // Get current task to preserve metadata
        const currentTask = await TaskService.getTaskById(id);
        if (currentTask) {
          const metadata = { ...currentTask.metadata };
          if (!metadata.status_history) metadata.status_history = [];
          metadata.status_history.push({
            status,
            note,
            timestamp: new Date().toISOString()
          });
          updates.metadata = metadata;
        }
      }

      const task = await TaskService.updateTask(id, updates);

      if (!task) {
        res.status(404).json({
          success: false,
          error: 'Task not found'
        });
        return;
      }

      // Broadcast status change via WebSocket
      webSocketService.broadcast({
        type: 'task_status_changed',
        data: { task, previous_status: status, note }
      });

      res.json({
        success: true,
        data: { task }
      });
    } catch (error) {
      console.error('Update task status error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update task status'
      });
    }
  }
}
