import { Router } from 'express';
import { SessionController } from '../controllers/session';
import { authenticateToken } from '../middleware/auth';
import {
  contractEnforcementMiddleware,
  validateBody,
  validateUUIDParam,
} from '../middleware/validation';

const router = Router();

// Current session route for session recovery (no auth required for development)

/**
 * @swagger
 * /sessions/current:
 *   get:
 *     summary: Retrieve the currently active session from MCP
 *     tags: [Sessions]
 *     responses:
 *       200:
 *         description: Current session information or null
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/SessionCurrentResponse'
 */
router.get('/current', SessionController.getCurrentSession);

// Apply authentication to all other session routes
router.use(authenticateToken);
router.use(contractEnforcementMiddleware);

// Sessions list and stats routes (place before /:id to avoid conflicts)

/**
 * @swagger
 * /sessions/stats:
 *   get:
 *     summary: Retrieve session statistics
 *     tags: [Sessions]
 *     parameters:
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Statistics returned
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/SessionStats'
 */
router.get('/stats', SessionController.getSessionStats);

/**
 * @swagger
 * /sessions:
 *   get:
 *     summary: List sessions with optional filters
 *     tags: [Sessions]
 *     parameters:
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sessions returned
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/SessionListResponse'
*/
router.get('/', SessionController.getSessionsList);

// Session analytics routes (place before /:id to avoid conflicts)
router.get('/analytics', SessionController.getSessionAnalytics);
router.get('/trends', SessionController.getSessionTrends);
router.get('/productive', SessionController.getProductiveSessions);
router.get('/token-patterns', SessionController.getTokenUsagePatterns);
router.get('/summaries', SessionController.getSessionSummaries);
router.get('/stats-by-period', SessionController.getSessionStatsByPeriod);

// Session assignment route

/**
 * @swagger
 * /sessions/assign:
 *   post:
 *     summary: Assign the current session to the specified project
 *     tags: [Sessions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               projectName:
 *                 type: string
 *             required: ['projectName']
 *     responses:
 *       200:
 *         description: Session assignment result
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/SessionAssignmentResponse'
 *       501:
 *         description: Endpoint temporarily disabled
 */
router.post('/assign', SessionController.assignCurrentSession);

/**
 * @swagger
 * /sessions/{id}:
 *   put:
 *     summary: Update session metadata
 *     tags: [Sessions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateSession'
 *     responses:
 *       200:
 *         description: Session updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         session:
 *                           $ref: '#/components/schemas/SessionEntity'
 *       400:
 *         description: Invalid session data
 *       404:
 *         description: Session not found
 */
router.put(
  '/:id',
  validateUUIDParam(),
  validateBody('UpdateSession'),
  SessionController.updateSession
);

/**
 * @swagger
 * /sessions/{id}:
 *   get:
 *     summary: Get detailed session information
 *     tags: [Sessions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Detailed session returned
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/SessionDetailResponse'
*       404:
*         description: Session not found
*/
// Session detail route (must be last to avoid conflicts)
router.get('/:id', SessionController.getSessionDetail);

export default router;
