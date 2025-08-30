import { Router } from 'express';
import { DecisionController } from '../controllers/decision';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Apply authentication to all decision routes
router.use(authenticateToken);

// Decision routes
router.get('/', DecisionController.searchDecisions);
router.post('/', DecisionController.recordDecision);
router.get('/stats', DecisionController.getDecisionStats);
router.get('/:id', DecisionController.getDecision);
router.put('/:id', DecisionController.updateDecision);
router.delete('/:id', DecisionController.deleteDecision);

export default router;
