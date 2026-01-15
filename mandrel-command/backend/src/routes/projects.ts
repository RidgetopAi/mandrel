import { Router } from 'express';
import { ProjectController } from '../controllers/project';
import { authenticateToken } from '../middleware/auth';
import {
  validateBody,
  validateUUIDParam,
  validatePagination,
  contractEnforcementMiddleware
} from '../middleware/validation';

/**
 * @swagger
 * components:
 *   schemas:
 *     Project:
 *       $ref: '#/components/schemas/ProjectEntity'
 *     CreateProject:
 *       $ref: '#/components/schemas/CreateProjectRequest'
 *     UpdateProject:
 *       $ref: '#/components/schemas/UpdateProjectRequest'
 */

const router = Router();

/**
 * @swagger
 * /projects/watchable:
 *   get:
 *     summary: Get projects with root_directory for mandrel-watcher
 *     description: Returns projects that have a local path configured. Used by mandrel-watcher daemon.
 *     tags: [Projects]
 *     security: []
 *     responses:
 *       200:
 *         description: Watchable projects retrieved successfully
 */
// Unauthenticated - used by local mandrel-watcher daemon
router.get('/watchable', ProjectController.getWatchableProjects);

// Apply authentication to all other project routes
router.use(authenticateToken);

// TR004-6: Apply contract enforcement middleware
router.use(contractEnforcementMiddleware);

/**
 * @swagger
 * /projects:
 *   get:
 *     summary: Get all projects
 *     tags: [Projects]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Items per page
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Projects retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ProjectListResponse'
 *       400:
 *         description: Invalid query parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *   post:
 *     summary: Create a new project
 *     tags: [Projects]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateProjectRequest'
 *     responses:
 *       201:
 *         description: Project created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ProjectDetailResponse'
 *       400:
 *         description: Invalid project data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get('/', validatePagination(), ProjectController.getAllProjects);
router.post('/', validateBody('CreateProject'), ProjectController.createProject);

/**
 * @swagger
 * /projects/stats:
 *   get:
 *     summary: Get project statistics
 *     tags: [Projects]
 *     responses:
 *       200:
 *         description: Project statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ProjectStats'
 */
router.get('/stats', ProjectController.getProjectStats);

/**
 * @swagger
 * /projects/sessions/all:
 *   get:
 *     summary: Get all sessions across projects
 *     tags: [Projects]
 *     responses:
 *       200:
 *         description: Sessions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ProjectSessionsResponse'
 */
router.get('/sessions/all', ProjectController.getAllSessions);

/**
 * @swagger
 * /projects/{id}/set-primary:
 *   post:
 *     summary: Set project as primary/default
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Project set as primary successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccessResponse'
 *       404:
 *         description: Project not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post('/:id/set-primary', validateUUIDParam(), ProjectController.setPrimary);

/**
 * @swagger
 * /projects/{id}:
 *   get:
 *     summary: Get project by ID
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Project retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ProjectDetailResponse'
 *       404:
 *         description: Project not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *   put:
 *     summary: Update project
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Project ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProjectRequest'
 *     responses:
 *       200:
 *         description: Project updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ProjectDetailResponse'
 *       400:
 *         description: Invalid project data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       404:
 *         description: Project not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *   delete:
 *     summary: Delete project
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Project deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ProjectSessionsResponse'
 *       404:
 *         description: Project not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get('/:id', validateUUIDParam(), ProjectController.getProject);
router.put('/:id', validateUUIDParam(), validateBody('UpdateProject'), ProjectController.updateProject);
router.delete('/:id', validateUUIDParam(), ProjectController.deleteProject);

/**
 * @swagger
 * /projects/{id}/insights:
 *   get:
 *     summary: Get project insights
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Project insights retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccessResponse'
 */
router.get('/:id/insights', validateUUIDParam(), ProjectController.getProjectInsights);

/**
 * @swagger
 * /projects/{id}/sessions:
 *   get:
 *     summary: Get project sessions
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Project sessions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccessResponse'
 */
router.get('/:id/sessions', validateUUIDParam(), ProjectController.getProjectSessions);

export default router;
