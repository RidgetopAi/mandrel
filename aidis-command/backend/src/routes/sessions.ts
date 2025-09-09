import { Router } from 'express';
import { SessionController } from '../controllers/session';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Apply authentication to all session routes
router.use(authenticateToken);

// Session analytics routes (place before /:id to avoid conflicts)
router.get('/analytics', SessionController.getSessionAnalytics);
router.get('/trends', SessionController.getSessionTrends);
router.get('/productive', SessionController.getProductiveSessions);
router.get('/token-patterns', SessionController.getTokenUsagePatterns);

// Session detail route
router.get('/:id', SessionController.getSessionDetail);

export default router;
