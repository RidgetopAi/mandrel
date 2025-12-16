import { Router } from 'express';
import { DecisionController } from '../controllers/decision';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Apply authentication to all decision routes
router.use(authenticateToken);

// Decision routes

/**
 * @swagger
 * /decisions:
 *   get:
 *     summary: Search technical decisions
 *     tags: [Decisions]
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: Free-text search term to locate decisions
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, under_review, superseded, deprecated]
 *         description: Filter decisions by lifecycle status
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Scope search to a specific project
 *       - in: query
 *         name: created_by
 *         schema:
 *           type: string
 *         description: Filter by author username
 *       - in: query
 *         name: date_from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Inclusive lower bound for creation date
 *       - in: query
 *         name: date_to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Inclusive upper bound for creation date
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
 *         description: Decisions retrieved
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/DecisionSearchResponse'
 */
router.get('/', DecisionController.searchDecisions);

/**
 * @swagger
 * /decisions:
 *   post:
 *     summary: Record a new technical decision
 *     tags: [Decisions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateDecisionRequest'
 *     responses:
 *       201:
 *         description: Decision recorded successfully
 */
router.post('/', DecisionController.recordDecision);

/**
 * @swagger
 * /decisions/stats:
 *   get:
 *     summary: Retrieve decision statistics
 *     tags: [Decisions]
 *     parameters:
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional project scope for statistics
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
 *                       $ref: '#/components/schemas/DecisionStats'
 */
router.get('/stats', DecisionController.getDecisionStats);

/**
 * @swagger
 * /decisions/{id}:
 *   get:
 *     summary: Get a decision by ID
 *     tags: [Decisions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Decision retrieved
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/DecisionEntity'
 *       404:
 *         description: Decision not found
 *   put:
 *     summary: Update a decision
 *     tags: [Decisions]
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
 *             $ref: '#/components/schemas/UpdateDecisionRequest'
 *     responses:
 *       200:
 *         description: Decision updated successfully
 *   delete:
 *     summary: Delete a decision
 *     tags: [Decisions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Decision deleted successfully
 */
router.get('/:id', DecisionController.getDecision);
router.put('/:id', DecisionController.updateDecision);
router.delete('/:id', DecisionController.deleteDecision);

export default router;
