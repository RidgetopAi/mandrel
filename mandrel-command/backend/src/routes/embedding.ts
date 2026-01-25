import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { AuthenticatedRequest } from '../types/auth';
import { EmbeddingService } from '../services/EmbeddingService';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const resolveProjectScope = (
  req: AuthenticatedRequest
): { projectId?: string; projectName?: string } => {
  if (req.projectId) {
    return { projectId: req.projectId };
  }

  const legacyHeader = typeof req.headers.project === 'string' ? req.headers.project.trim() : undefined;

  if (!legacyHeader || legacyHeader === 'null' || legacyHeader === 'undefined') {
    return {};
  }

  if (uuidRegex.test(legacyHeader)) {
    return { projectId: legacyHeader };
  }

  return { projectName: legacyHeader };
};

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

/**
 * @swagger
 * /embedding/list:
 *   get:
 *     summary: Retrieve available embedding datasets
 *     tags: [Embeddings]
 *     parameters:
 *       - in: header
 *         name: X-Project-ID
 *         required: false
 *         description: Optional project context (UUID). Legacy support accepts `project` header with name.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Dataset list returned
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/EmbeddingDataset'
 */
router.get('/list', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const scope = resolveProjectScope(req);
    const datasets = await EmbeddingService.getAvailableDatasets(
      req.user.id,
      scope
    );
    return res.json(datasets);
  } catch (error) {
    console.error('Error getting embedding datasets:', error);
    return res.status(500).json({ 
      error: 'Failed to get embedding datasets',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /embedding/similarity:
 *   get:
 *     summary: Retrieve similarity matrix for an embedding dataset
 *     tags: [Embeddings]
 *     parameters:
 *       - in: header
 *         name: X-Project-ID
 *         required: true
 *         description: Project context (UUID). Legacy support accepts `project` header with project name.
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: rows
 *         schema:
 *           type: integer
 *           default: 100
 *       - in: query
 *         name: cols
 *         schema:
 *           type: integer
 *           default: 100
 *     responses:
 *       200:
 *         description: Similarity matrix returned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmbeddingSimilarityMatrix'
 */
router.get('/similarity', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { id, rows = '100', cols = '100' } = req.query;
    
    if (!id) {
      return res.status(400).json({ error: 'Dataset ID is required' });
    }

    const scope = resolveProjectScope(req);

    if (!scope.projectId && !scope.projectName) {
      return res.status(400).json({
        error: 'Project context required',
        details: 'Provide X-Project-ID header to scope embedding analytics'
      });
    }

    const similarity = await EmbeddingService.getSimilarityMatrix(
      req.user.id,
      scope,
      id as string,
      parseInt(rows as string, 10),
      parseInt(cols as string, 10)
    );
    
    return res.json(similarity);
  } catch (error) {
    console.error('Error getting similarity matrix:', error);
    return res.status(500).json({ 
      error: 'Failed to get similarity matrix',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /embedding/projection:
 *   get:
 *     summary: Retrieve 2D/3D projection of embeddings
 *     tags: [Embeddings]
 *     parameters:
 *       - in: header
 *         name: X-Project-ID
 *         required: true
 *         description: Project context (UUID). Legacy support accepts `project` header with project name.
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: algo
 *         schema:
 *           type: string
 *           default: pca
 *       - in: query
 *         name: n
 *         schema:
 *           type: integer
 *           default: 1000
 *     responses:
 *       200:
 *         description: Projection data returned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmbeddingProjection'
 */
router.get('/projection', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { id, algo = 'pca', n = '1000' } = req.query;
    
    if (!id) {
      return res.status(400).json({ error: 'Dataset ID is required' });
    }

    const scope = resolveProjectScope(req);

    if (!scope.projectId && !scope.projectName) {
      return res.status(400).json({
        error: 'Project context required',
        details: 'Provide X-Project-ID header to scope embedding analytics'
      });
    }

    const projection = await EmbeddingService.getProjection(
      req.user.id,
      scope,
      id as string,
      algo as string,
      parseInt(n as string, 10)
    );
    
    return res.json(projection);
  } catch (error) {
    console.error('Error getting projection:', error);
    return res.status(500).json({ 
      error: 'Failed to get projection',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /embedding/cluster:
 *   get:
 *     summary: Retrieve clustering results for an embedding dataset
 *     tags: [Embeddings]
 *     parameters:
 *       - in: header
 *         name: X-Project-ID
 *         required: true
 *         description: Project context (UUID). Legacy support accepts `project` header with project name.
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: k
 *         schema:
 *           type: integer
 *           default: 8
 *     responses:
 *       200:
 *         description: Clustering data returned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmbeddingClusterResult'
 */
router.get('/cluster', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { id, k = '8' } = req.query;
    
    if (!id) {
      return res.status(400).json({ error: 'Dataset ID is required' });
    }

    const scope = resolveProjectScope(req);

    if (!scope.projectId && !scope.projectName) {
      return res.status(400).json({
        error: 'Project context required',
        details: 'Provide X-Project-ID header to scope embedding analytics'
      });
    }

    const clusters = await EmbeddingService.getClusters(
      req.user.id,
      scope,
      id as string,
      parseInt(k as string, 10)
    );
    
    return res.json(clusters);
  } catch (error) {
    console.error('Error getting clusters:', error);
    return res.status(500).json({ 
      error: 'Failed to get clusters',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /embedding/metrics:
 *   get:
 *     summary: Retrieve embedding quality metrics
 *     tags: [Embeddings]
 *     parameters:
 *       - in: header
 *         name: X-Project-ID
 *         required: true
 *         description: Project context (UUID). Legacy support accepts `project` header with project name.
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Quality metrics returned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmbeddingQualityMetrics'
 */
router.get('/metrics', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { id } = req.query;
    
    if (!id) {
      return res.status(400).json({ error: 'Dataset ID is required' });
    }

    const scope = resolveProjectScope(req);

    if (!scope.projectId && !scope.projectName) {
      return res.status(400).json({
        error: 'Project context required',
        details: 'Provide X-Project-ID header to scope embedding analytics'
      });
    }

    const metrics = await EmbeddingService.getQualityMetrics(
      req.user.id,
      scope,
      id as string
    );
    
    return res.json(metrics);
  } catch (error) {
    console.error('Error getting metrics:', error);
    return res.status(500).json({ 
      error: 'Failed to get metrics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /embedding/relationships:
 *   get:
 *     summary: Retrieve project relationship network for the active project
 *     tags: [Embeddings]
 *     parameters:
 *       - in: header
 *         name: X-Project-ID
 *         required: true
 *         description: Project context (UUID). Legacy support accepts `project` header with project name.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Project relationship network returned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmbeddingProjectRelationships'
 */
router.get('/relationships', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const scope = resolveProjectScope(req);

    if (!scope.projectId && !scope.projectName) {
      return res.status(400).json({
        error: 'Project context required',
        details: 'Provide X-Project-ID header to scope project relationship analytics',
      });
    }

    const relationships = await EmbeddingService.getProjectRelationships(
      req.user.id,
      scope
    );

    return res.json(relationships);
  } catch (error) {
    console.error('Error getting project relationships:', error);
    return res.status(500).json({
      error: 'Failed to get project relationships',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /embedding/knowledge-gaps:
 *   get:
 *     summary: Retrieve knowledge gap analytics for the active project
 *     tags: [Embeddings]
 *     parameters:
 *       - in: header
 *         name: X-Project-ID
 *         required: true
  *         description: Project context (UUID). Legacy support accepts `project` header with project name.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Knowledge gap metrics returned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmbeddingKnowledgeGaps'
 */
router.get('/knowledge-gaps', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const scope = resolveProjectScope(req);

    if (!scope.projectId && !scope.projectName) {
      return res.status(400).json({
        error: 'Project context required',
        details: 'Provide X-Project-ID header to scope knowledge-gap analytics',
      });
    }

    const gaps = await EmbeddingService.getKnowledgeGapMetrics(
      req.user.id,
      scope
    );

    return res.json(gaps);
  } catch (error) {
    console.error('Error getting knowledge gap metrics:', error);
    return res.status(500).json({
      error: 'Failed to get knowledge gap metrics',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /embedding/usage:
 *   get:
 *     summary: Retrieve usage pattern analytics for the active project
 *     tags: [Embeddings]
 *     parameters:
 *       - in: header
 *         name: X-Project-ID
 *         required: true
 *         description: Project context (UUID). Legacy support accepts `project` header with project name.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Usage pattern metrics returned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmbeddingUsagePatterns'
 */
router.get('/usage', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const scope = resolveProjectScope(req);

    if (!scope.projectId && !scope.projectName) {
      return res.status(400).json({
        error: 'Project context required',
        details: 'Provide X-Project-ID header to scope usage pattern analytics',
      });
    }

    const usage = await EmbeddingService.getUsagePatterns(
      req.user.id,
      scope
    );

    return res.json(usage);
  } catch (error) {
    console.error('Error getting usage patterns:', error);
    return res.status(500).json({
      error: 'Failed to get usage patterns',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
