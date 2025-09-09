import { Router } from 'express';
import { ContextController } from '../controllers/context';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Apply authentication to all context routes
router.use(authenticateToken);

// Context routes
router.get('/', ContextController.searchContexts);
router.get('/stats', ContextController.getContextStats);
router.get('/weekly-velocity', ContextController.getWeeklyVelocity);
router.get('/export', ContextController.exportContexts);
router.post('/search', ContextController.semanticSearch);
router.get('/:id', ContextController.getContext);
router.put('/:id', ContextController.updateContext);
router.delete('/:id', ContextController.deleteContext);
router.delete('/bulk/delete', ContextController.bulkDeleteContexts);
router.get('/:id/related', ContextController.getRelatedContexts);

export default router;
