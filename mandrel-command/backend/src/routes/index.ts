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
import editorRoutes from './editor';

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
router.use('/editor', editorRoutes);

// MCP Proxy Routes - Forward session file endpoints to MCP server
// This eliminates hard-coded localhost:8080 in frontend for OSS deployment
const MCP_BASE = `http://localhost:${process.env.MANDREL_MCP_PORT || process.env.AIDIS_MCP_PORT || '8080'}`;

// Deprecation warning for AIDIS_MCP_PORT
if (process.env.AIDIS_MCP_PORT && !process.env.MANDREL_MCP_PORT) {
  console.warn('⚠️  AIDIS_MCP_PORT is deprecated. Please use MANDREL_MCP_PORT instead.');
}

/**
 * Proxy GET /api/v2/sessions/:sessionId/files to MCP server
 */
router.get('/v2/sessions/:sessionId/files', async (req: Request, res: Response): Promise<void> => {
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
    console.error('MCP proxy error (GET files):', error);
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
router.post('/v2/sessions/:sessionId/sync-files', async (req: Request, res: Response): Promise<void> => {
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
    console.error('MCP proxy error (POST sync-files):', error);
    res.status(503).json({
      success: false,
      error: 'MCP service unavailable',
      message: error instanceof Error ? error.message : 'Failed to proxy request to MCP server'
    });
  }
});

// ============================================
// SURVEYOR PROXY ROUTES
// ============================================

/**
 * Proxy POST /api/v2/surveyor/scan to MCP server
 */
router.post('/v2/surveyor/scan', async (req: Request, res: Response): Promise<void> => {
  try {
    const url = `${MCP_BASE}/api/v2/surveyor/scan`;

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
    console.error('MCP proxy error (POST surveyor/scan):', error);
    res.status(503).json({
      success: false,
      error: 'MCP service unavailable',
      message: error instanceof Error ? error.message : 'Failed to proxy request to MCP server'
    });
  }
});

/**
 * Proxy GET /api/v2/surveyor/scans to MCP server
 */
router.get('/v2/surveyor/scans', async (req: Request, res: Response): Promise<void> => {
  try {
    const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
    const url = `${MCP_BASE}/api/v2/surveyor/scans${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('MCP proxy error (GET surveyor/scans):', error);
    res.status(503).json({
      success: false,
      error: 'MCP service unavailable',
      message: error instanceof Error ? error.message : 'Failed to proxy request to MCP server'
    });
  }
});

/**
 * Proxy GET /api/v2/surveyor/scans/:id to MCP server
 */
router.get('/v2/surveyor/scans/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
    const url = `${MCP_BASE}/api/v2/surveyor/scans/${id}${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('MCP proxy error (GET surveyor/scans/:id):', error);
    res.status(503).json({
      success: false,
      error: 'MCP service unavailable',
      message: error instanceof Error ? error.message : 'Failed to proxy request to MCP server'
    });
  }
});

/**
 * Proxy DELETE /api/v2/surveyor/scans/:id to MCP server
 */
router.delete('/v2/surveyor/scans/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const url = `${MCP_BASE}/api/v2/surveyor/scans/${id}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('MCP proxy error (DELETE surveyor/scans/:id):', error);
    res.status(503).json({
      success: false,
      error: 'MCP service unavailable',
      message: error instanceof Error ? error.message : 'Failed to proxy request to MCP server'
    });
  }
});

/**
 * Proxy GET /api/v2/surveyor/warnings/:scanId to MCP server
 */
router.get('/v2/surveyor/warnings/:scanId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { scanId } = req.params;
    const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
    const url = `${MCP_BASE}/api/v2/surveyor/warnings/${scanId}${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('MCP proxy error (GET surveyor/warnings/:scanId):', error);
    res.status(503).json({
      success: false,
      error: 'MCP service unavailable',
      message: error instanceof Error ? error.message : 'Failed to proxy request to MCP server'
    });
  }
});

/**
 * Proxy GET /api/v2/surveyor/query to MCP server
 */
router.get('/v2/surveyor/query', async (req: Request, res: Response): Promise<void> => {
  try {
    const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
    const url = `${MCP_BASE}/api/v2/surveyor/query${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('MCP proxy error (GET surveyor/query):', error);
    res.status(503).json({
      success: false,
      error: 'MCP service unavailable',
      message: error instanceof Error ? error.message : 'Failed to proxy request to MCP server'
    });
  }
});

/**
 * Proxy GET /api/v2/surveyor/summary/:scanId to MCP server
 */
router.get('/v2/surveyor/summary/:scanId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { scanId } = req.params;
    const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
    const url = `${MCP_BASE}/api/v2/surveyor/summary/${scanId}${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('MCP proxy error (GET surveyor/summary/:scanId):', error);
    res.status(503).json({
      success: false,
      error: 'MCP service unavailable',
      message: error instanceof Error ? error.message : 'Failed to proxy request to MCP server'
    });
  }
});

/**
 * Proxy GET /api/v2/surveyor/file to MCP server
 */
router.get('/v2/surveyor/file', async (req: Request, res: Response): Promise<void> => {
  try {
    const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
    const url = `${MCP_BASE}/api/v2/surveyor/file${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('MCP proxy error (GET surveyor/file):', error);
    res.status(503).json({
      success: false,
      error: 'MCP service unavailable',
      message: error instanceof Error ? error.message : 'Failed to proxy request to MCP server'
    });
  }
});

/**
 * Proxy GET /api/v2/surveyor/stats/:projectId to MCP server
 */
router.get('/v2/surveyor/stats/:projectId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const url = `${MCP_BASE}/api/v2/surveyor/stats/${projectId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('MCP proxy error (GET surveyor/stats/:projectId):', error);
    res.status(503).json({
      success: false,
      error: 'MCP service unavailable',
      message: error instanceof Error ? error.message : 'Failed to proxy request to MCP server'
    });
  }
});

export default router;