import { Router, Request, Response } from 'express';
import healthRoutes from './health';
import authRoutes from './auth';
import userRoutes from './users';
import contextRoutes from './contexts';
import projectRoutes from './projects';
import sessionRoutes from './sessions';
import sessionCodeRoutes from './sessionCode';
import taskRoutes from './tasks';
import decisionRoutes from './decisions';
import namingRoutes from './naming';
import dashboardRoutes from './dashboard';
import monitoringRoutes from './monitoring';
import validationRoutes from './validation';
import typeSafetyRoutes from './typeSafety';
import openApiRoutes from './openapi';
import embeddingRoutes from './embedding';
import eventsRoutes from './events';
import gitRoutes from './git';
import feedbackRoutes from './feedback';
import { SessionController } from '../controllers/session';
import { authenticateToken } from '../middleware/auth';
import { validateUUIDParam } from '../middleware/validation';
import { logger } from '../config/logger';

const router = Router();

// Mount route modules
router.use('/', healthRoutes);
router.use('/openapi', openApiRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/contexts', contextRoutes);
router.use('/projects', projectRoutes);
router.use('/sessions', sessionRoutes);
router.use('/session-code', sessionCodeRoutes);
router.use('/tasks', taskRoutes);
router.use('/decisions', decisionRoutes);
router.use('/naming', namingRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/monitoring', monitoringRoutes);
router.use('/validation', validationRoutes);
router.use('/type-safety', typeSafetyRoutes);
router.use('/embedding', embeddingRoutes);
router.use('/', eventsRoutes);
router.use('/git', gitRoutes);
router.use('/feedback', feedbackRoutes);

// MCP Proxy Routes - Forward session file endpoints to MCP server
// This eliminates hard-coded localhost:8080 in frontend for OSS deployment
// Prefer an explicit MCP base URL (needed in containerized deploys where the MCP
// server is a sibling container reachable by service name, NOT localhost). Fall
// back to host:port form for same-namespace/dev deploys.
const MCP_BASE =
  process.env.MANDREL_MCP_URL ||
  `http://localhost:${process.env.MANDREL_MCP_PORT || process.env.AIDIS_MCP_PORT || '8080'}`;

// Deprecation warning for AIDIS_MCP_PORT
if (process.env.AIDIS_MCP_PORT && !process.env.MANDREL_MCP_PORT) {
  logger.warn('⚠️  AIDIS_MCP_PORT is deprecated. Please use MANDREL_MCP_PORT instead.');
}

/**
 * GET /api/v2/sessions/current - current active session.
 *
 * Route-prefix fix: the rest of the browser session control surface lives under the
 * `/api/v2/sessions/*` family (start, end, active, list, files), but the current-session
 * endpoint was only mounted at `/api/sessions/current` (legacy controller route). Any
 * caller that reached for the consistent v2 path got a 404. We delegate to the SAME
 * controller here so `/api/v2/sessions/current` resolves; the legacy `/api/sessions/current`
 * route remains for backward compatibility (the generated OpenAPI client uses it).
 *
 * Declared BEFORE the parameterized `/v2/sessions/:sessionId/*` proxies so "current" is
 * matched as a literal segment and never captured as a :sessionId.
 */
router.get('/v2/sessions/current', SessionController.getCurrentSession);

/**
 * Proxy GET /api/v2/sessions/:sessionId/files to MCP server
 */
router.get('/v2/sessions/:sessionId/files', validateUUIDParam('sessionId'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const url = `${MCP_BASE}/api/v2/sessions/${sessionId}/files`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    logger.error('MCP proxy error (GET files)', { error });
    res.status(503).json({
      success: false,
      error: 'MCP service unavailable',
      message: error instanceof Error ? error.message : 'Failed to proxy request to MCP server'
    });
  }
});

/**
 * Proxy POST /api/v2/sessions/:sessionId/sync-files to MCP server
 */
router.post('/v2/sessions/:sessionId/sync-files', validateUUIDParam('sessionId'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const url = `${MCP_BASE}/api/v2/sessions/${sessionId}/sync-files`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    logger.error('MCP proxy error (POST sync-files)', { error });
    res.status(503).json({
      success: false,
      error: 'MCP service unavailable',
      message: error instanceof Error ? error.message : 'Failed to proxy request to MCP server'
    });
  }
});

/**
 * Proxy POST /api/v2/sessions/start to MCP server (authenticated)
 * Closes the unauthenticated /api/v2 gap on the browser path: the public route
 * requires a logged-in user, then forwards to the (unauth) MCP REST endpoint.
 */
router.post('/v2/sessions/start', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const url = `${MCP_BASE}/api/v2/sessions/start`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body || {}),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    logger.error('MCP proxy error (POST sessions/start)', { error });
    res.status(503).json({
      success: false,
      error: 'MCP service unavailable',
      message: error instanceof Error ? error.message : 'Failed to proxy request to MCP server'
    });
  }
});

/**
 * Proxy GET /api/v2/sessions/active to MCP server (authenticated)
 */
router.get('/v2/sessions/active', authenticateToken, async (_req: Request, res: Response): Promise<void> => {
  try {
    const url = `${MCP_BASE}/api/v2/sessions/active`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    logger.error('MCP proxy error (GET sessions/active)', { error });
    res.status(503).json({
      success: false,
      error: 'MCP service unavailable',
      message: error instanceof Error ? error.message : 'Failed to proxy request to MCP server'
    });
  }
});

/**
 * Proxy POST /api/v2/sessions/:sessionId/end to MCP server (authenticated)
 */
router.post('/v2/sessions/:sessionId/end', authenticateToken, validateUUIDParam('sessionId'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const url = `${MCP_BASE}/api/v2/sessions/${sessionId}/end`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body || {}),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    logger.error('MCP proxy error (POST sessions/end)', { error });
    res.status(503).json({
      success: false,
      error: 'MCP service unavailable',
      message: error instanceof Error ? error.message : 'Failed to proxy request to MCP server'
    });
  }
});

/**
 * Proxy GET /api/v2/sessions (list) to MCP server (authenticated)
 * Forwards the query string (e.g. ?limit=100).
 */
router.get('/v2/sessions', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const queryIndex = req.originalUrl.indexOf('?');
    const queryString = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
    const url = `${MCP_BASE}/api/v2/sessions${queryString}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    logger.error('MCP proxy error (GET sessions list)', { error });
    res.status(503).json({
      success: false,
      error: 'MCP service unavailable',
      message: error instanceof Error ? error.message : 'Failed to proxy request to MCP server'
    });
  }
});

export default router;