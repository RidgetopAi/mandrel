import { Router } from 'express';
import { TaskController } from '../controllers/task';
import { authenticateToken } from '../middleware/auth';
import {
  validateBody,
  validateUUIDParam,
  validatePagination,
  contractEnforcementMiddleware
} from '../middleware/validation';

/**
 * Task Management Routes
 * Complete CRUD operations and advanced task management endpoints
 */

const router = Router();

// Apply authentication middleware to all task routes
router.use(authenticateToken);

// TR004-6: Apply contract enforcement middleware
router.use(contractEnforcementMiddleware);

// Core CRUD operations
router.get('/', validatePagination(), TaskController.getTasks);               // GET /tasks - List tasks with filtering
router.get('/stats', TaskController.getTaskStats);     // GET /tasks/stats - Get statistics
router.get('/lead-time', TaskController.getLeadTimeDistribution); // GET /tasks/lead-time - Lead time analytics
router.post('/', validateBody('CreateTask'), TaskController.createTask);           // POST /tasks - Create task
router.post('/bulk-update', TaskController.bulkUpdateTasks); // POST /tasks/bulk-update - Bulk updates

// Individual task operations
router.get('/:id', validateUUIDParam(), TaskController.getTask);                    // GET /tasks/:id - Get task by ID
router.put('/:id', validateUUIDParam(), validateBody('UpdateTask'), TaskController.updateTask);                 // PUT /tasks/:id - Update task
router.delete('/:id', validateUUIDParam(), TaskController.deleteTask);              // DELETE /tasks/:id - Delete task

// Task management operations
router.get('/:id/dependencies', TaskController.getTaskDependencies); // GET /tasks/:id/dependencies - Get dependencies
router.post('/:id/assign', TaskController.assignTask);               // POST /tasks/:id/assign - Assign task
router.post('/:id/status', TaskController.updateTaskStatus);         // POST /tasks/:id/status - Update status

export default router;
