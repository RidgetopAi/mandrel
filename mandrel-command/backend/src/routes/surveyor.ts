import { Router } from 'express';
import { SurveyorController } from '../controllers/surveyor';
import { authenticateToken } from '../middleware/auth';
import { validateBody, validateUUIDParam } from '../middleware/validation';

/**
 * Surveyor Routes (Surveyor P4c-backend, Mandrel task e5a650e4, decision 8f330f96).
 *
 * Project-scoped REST surface for the Surveyor panel (P4c-frontend). Mirrors the existing
 * command-backend route conventions: a Router per feature, authenticateToken on every route,
 * validateUUIDParam on the id param so a malformed projectId returns a clean 400, validateBody
 * for the write. READS hit the surveyor_* Postgres directly (like task/git/decision); the SCAN
 * WRITE proxies to the mcp-server surveyor_scan tool (like the sessions lifecycle proxy).
 */

const router = Router();

// All Surveyor routes require an authenticated user.
router.use(authenticateToken);

// POST /surveyor/projects/:projectId/scan — trigger a scan (body: { path, scanId? }).
router.post(
  '/projects/:projectId/scan',
  validateUUIDParam('projectId'),
  validateBody('SurveyorScan'),
  SurveyorController.scan,
);

// GET /surveyor/projects/:projectId/graph — nodes + connections (?scanId=&nodeTypes=&limit=).
router.get('/projects/:projectId/graph', validateUUIDParam('projectId'), SurveyorController.getGraph);

// GET /surveyor/projects/:projectId/file — one file card (?file=<key|path>&scanId=).
router.get('/projects/:projectId/file', validateUUIDParam('projectId'), SurveyorController.getFile);

// GET /surveyor/projects/:projectId/findings — findings (?minConfidence=&category=&scanId=&limit=).
router.get(
  '/projects/:projectId/findings',
  validateUUIDParam('projectId'),
  SurveyorController.getFindings,
);

export default router;
