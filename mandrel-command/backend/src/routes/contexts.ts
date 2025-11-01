import { Router } from 'express';
import { ContextController } from '../controllers/context';
import { authenticateToken } from '../middleware/auth';
import {
  contractEnforcementMiddleware,
  validateBody,
  validateQuery,
  validateUUIDParam,
} from '../middleware/validation';
import { ContextSearchQuerySchema } from '../validation/schemas';

const router = Router();

// Apply authentication to all context routes
router.use(authenticateToken);
router.use(contractEnforcementMiddleware);

// Context routes

/**
 * @swagger
 * /contexts:
 *   get:
 *     summary: Search contexts with filters
 *     tags: [Contexts]
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: Free-text search query
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by project ID (falls back to X-Project-ID header)
 *       - in: query
 *         name: session_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [code, decision, research, issue, note, error, test]
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *         description: Comma-separated tags filter
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Contexts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ContextSearchResponse'
 */
router.get('/', validateQuery(ContextSearchQuerySchema, { required: false }), ContextController.searchContexts);

/**
 * @swagger
 * /contexts/stats:
 *   get:
 *     summary: Retrieve context statistics for the current project
 *     tags: [Contexts]
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
 *                       $ref: '#/components/schemas/ContextStats'
 */
router.get('/stats', ContextController.getContextStats);
router.get('/weekly-velocity', ContextController.getWeeklyVelocity);
router.get('/export', ContextController.exportContexts);

/**
 * @swagger
 * /contexts/search:
 *   post:
 *     summary: Perform semantic context search
 *     tags: [Contexts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateContext'
 *     responses:
 *       200:
 *         description: Semantic search results
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ContextSearchResponse'
 */
router.post('/search', ContextController.semanticSearch);

/**
 * @swagger
 * /contexts/{id}:
 *   get:
 *     summary: Get a context by ID
 *     tags: [Contexts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Context retrieved
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ContextEntity'
 *       404:
 *         description: Context not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *   put:
 *     summary: Update an existing context
 *     tags: [Contexts]
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
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Context updated
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ContextEntity'
 *       404:
 *         description: Context not found
 *   delete:
 *     summary: Delete a context
 *     tags: [Contexts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Context deleted successfully
 *       404:
 *         description: Context not found
 */
router.get('/:id', validateUUIDParam(), ContextController.getContext);
router.put(
  '/:id',
  validateUUIDParam(),
  validateBody('UpdateContext'),
  ContextController.updateContext
);
router.delete('/:id', validateUUIDParam(), ContextController.deleteContext);

/**
 * @swagger
 * /contexts/bulk/delete:
 *   delete:
 *     summary: Bulk delete contexts by ID
 *     tags: [Contexts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ContextBulkDelete'
 *     responses:
 *       200:
 *         description: Contexts deleted successfully
 */
router.delete('/bulk/delete', validateBody('ContextBulkDelete'), ContextController.bulkDeleteContexts);

/**
 * @swagger
 * /contexts/{id}/related:
 *   get:
 *     summary: Get contexts related to the supplied context
 *     tags: [Contexts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Related contexts returned
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ContextEntity'
 */
router.get('/:id/related', validateUUIDParam(), ContextController.getRelatedContexts);

export default router;
