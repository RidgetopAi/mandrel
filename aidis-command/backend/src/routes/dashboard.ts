import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import DashboardController from '../controllers/dashboard';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Dashboard stats endpoint
router.get('/stats', DashboardController.getDashboardStats);

export default router;
