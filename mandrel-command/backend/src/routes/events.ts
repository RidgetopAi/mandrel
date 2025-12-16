import { Router } from 'express';
import { sseService } from '../services/sse';
import { ensureAuthForSse, extractSseProjectContext } from '../middleware/sseAuth';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

/**
 * SSE endpoint for real-time database updates
 * 
 * GET /api/events
 * 
 * Query parameters:
 *   - token: JWT authentication token (optional if Authorization header provided)
 *   - projectId: Filter events by project UUID (optional)
 *   - entities: Comma-separated entity types to subscribe to (optional)
 *               Valid values: contexts, tasks, decisions, projects, sessions
 * 
 * Example:
 *   GET /api/events?token=xxx&projectId=123&entities=tasks,contexts
 * 
 * Response format: text/event-stream
 * 
 * Events:
 *   - system: Connection confirmation and server messages
 *   - contexts: Context entity changes
 *   - tasks: Task entity changes
 *   - decisions: Technical decision entity changes
 *   - projects: Project entity changes
 *   - sessions: Session entity changes
 * 
 * Event data format:
 * {
 *   entity: string,
 *   action: 'insert' | 'update' | 'delete',
 *   id: string,
 *   projectId?: string,
 *   at: string (ISO 8601 timestamp)
 * }
 */
router.get(
  '/events',
  ensureAuthForSse,
  extractSseProjectContext,
  sseService.handleSubscribe
);

/**
 * SSE stats endpoint (for monitoring and debugging)
 * 
 * GET /api/events/stats
 * 
 * Requires authentication via Authorization header or token query param
 * 
 * Response:
 * {
 *   totalConnections: number,
 *   connectionsByUser: { [userId: string]: number },
 *   nextEventId: number,
 *   uptimeSeconds: number
 * }
 */
router.get('/events/stats', ensureAuthForSse, (req, res) => {
  const stats = sseService.getStats();
  res.json({
    success: true,
    data: stats
  });
});

/**
 * SSE clients endpoint (for debugging - shows detailed connection info)
 * 
 * GET /api/events/clients
 * 
 * Requires authentication
 * 
 * Response:
 * {
 *   success: true,
 *   data: Array<{
 *     userId: string,
 *     projectId?: string,
 *     entities?: string[],
 *     connectedAt: string,
 *     connectionDurationMs: number
 *   }>
 * }
 */
router.get('/events/clients', ensureAuthForSse, (req: AuthenticatedRequest, res) => {
  // Only allow admin users to see all clients
  if (req.user?.role !== 'admin') {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Only admin users can view client connections'
    });
    return;
  }

  const clients = sseService.getClients();
  res.json({
    success: true,
    data: clients
  });
});

export default router;
