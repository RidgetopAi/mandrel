import { Router } from 'express';
import { GitController } from '../controllers/git';
import { authenticateToken } from '../middleware/auth';

/**
 * Git Routes
 * Endpoints for pushing git stats from local agents
 */

const router = Router();

// POST /git/push-stats - Receive git data from local agent
// NOTE: This endpoint allows unauthenticated access for agent pushes
// Security is handled via session_id + project_id validation
router.post('/push-stats', GitController.pushStats);

// Routes below require authentication
router.use(authenticateToken);

// GET /git/session/:sessionId/stats - Get git stats for a session
router.get('/session/:sessionId/stats', GitController.getSessionGitStats);

export default router;
