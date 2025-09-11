import { Router } from 'express';
import { SessionController } from '../controllers/session';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Apply authentication to all session routes
router.use(authenticateToken);

// Sessions list and stats routes (place before /:id to avoid conflicts)
router.get('/stats', SessionController.getSessionStats);
router.get('/', SessionController.getSessionsList);

// Session analytics routes (place before /:id to avoid conflicts)
router.get('/analytics', SessionController.getSessionAnalytics);
router.get('/trends', SessionController.getSessionTrends);
router.get('/productive', SessionController.getProductiveSessions);
router.get('/token-patterns', SessionController.getTokenUsagePatterns);
router.get('/summaries', SessionController.getSessionSummaries);
router.get('/stats-by-period', SessionController.getSessionStatsByPeriod);

// Current session route for session recovery
router.get('/current', SessionController.getCurrentSession);

// Session assignment route
router.post('/assign', SessionController.assignCurrentSession);

// Session detail route (must be last to avoid conflicts)
router.get('/:id', SessionController.getSessionDetail);

export default router;
