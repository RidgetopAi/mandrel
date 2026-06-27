import { Response } from 'express';
import { AuthenticatedRequest } from '../types/auth';
import { SurveyorService, GetGraphOptions, GetFindingsOptions } from '../services/surveyor';
import { logger } from '../config/logger';

/**
 * Surveyor Controller (Surveyor P4c-backend, Mandrel task e5a650e4, decision 8f330f96).
 *
 * The REST surface the upcoming Surveyor panel (P4c-frontend) drives:
 *   POST /surveyor/projects/:projectId/scan      — trigger a scan of a server-side path
 *   GET  /surveyor/projects/:projectId/graph     — nodes + connections for the canvas
 *   GET  /surveyor/projects/:projectId/file      — one file card (?file=<key|path>)
 *   GET  /surveyor/projects/:projectId/findings  — findings (?minConfidence=&category=)
 *
 * Response envelope follows the command-backend convention exactly: success →
 * { success: true, data: {...} }; error → { success: false, error: '...' }.
 *
 * Not-found contract (mirrors the mcp-server surveyor_* tools, the system of record):
 *   - project doesn't exist                       → 404 (a real missing resource)
 *   - project exists but has NO stored scan yet   → 200 { found: false } (valid empty state)
 *   - a file ref that matches no node in the scan → 200 { found: false } (empty card)
 * The frontend renders the empty state from `found:false` and a CTA to run a scan; a 404 is
 * reserved for a genuinely bad project id.
 */
export class SurveyorController {
  /** Parse `nodeTypes` (csv or repeated) into a clean string[] (or undefined). */
  private static parseNodeTypes(raw: unknown): string[] | undefined {
    if (raw === undefined) return undefined;
    const list = Array.isArray(raw) ? (raw as string[]) : String(raw).split(',');
    const cleaned = list.map((t) => String(t).trim()).filter((t) => t.length > 0);
    return cleaned.length > 0 ? cleaned : undefined;
  }

  /** Parse a positive integer query param (or undefined when absent/garbage). */
  private static parsePositiveInt(raw: unknown): number | undefined {
    if (raw === undefined) return undefined;
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 ? Math.trunc(v) : undefined;
  }

  /** Parse a finite float query param (or undefined when absent/garbage). */
  private static parseFloatParam(raw: unknown): number | undefined {
    if (raw === undefined) return undefined;
    const v = Number(raw);
    return Number.isFinite(v) ? v : undefined;
  }

  /**
   * POST /surveyor/projects/:projectId/scan — trigger a scan of a server-side path.
   * Body: { path: string, scanId?: string }. Proxies to the surveyor_scan MCP tool.
   */
  static async scan(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const { path, scanId } = req.body as { path?: string; scanId?: string };

      if (!path || typeof path !== 'string' || path.trim().length === 0) {
        res.status(400).json({ success: false, error: 'path is required' });
        return;
      }

      if (!(await SurveyorService.projectExists(projectId))) {
        res.status(404).json({ success: false, error: 'Project not found' });
        return;
      }

      const result = await SurveyorService.triggerScan(projectId, path.trim(), scanId);

      if (!result.ok) {
        // The scan flow failed upstream (service down / timeout / job error / not configured).
        // 502: we are a healthy gateway, but the dependency we proxied to could not fulfill it.
        res.status(502).json({
          success: false,
          error: result.message,
          errorKind: result.errorKind,
        });
        return;
      }

      res.status(201).json({ success: true, data: { scan: result.scan } });
    } catch (error) {
      logger.error('Surveyor scan error', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to trigger Surveyor scan',
      });
    }
  }

  /**
   * GET /surveyor/projects/:projectId/graph — the stored graph (nodes + connections).
   * Query: ?scanId= &nodeTypes=file,function &limit=
   */
  static async getGraph(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;

      if (!(await SurveyorService.projectExists(projectId))) {
        res.status(404).json({ success: false, error: 'Project not found' });
        return;
      }

      const opts: GetGraphOptions = {
        scanId: req.query.scanId ? String(req.query.scanId) : undefined,
        nodeTypes: SurveyorController.parseNodeTypes(req.query.nodeTypes),
        limit: SurveyorController.parsePositiveInt(req.query.limit),
      };

      const graph = await SurveyorService.getGraph(projectId, opts);

      if (!graph) {
        res.json({
          success: true,
          data: { found: false, scan: null, nodes: [], connections: [], truncated: false },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          found: true,
          scan: graph.scan,
          nodes: graph.nodes,
          connections: graph.connections,
          truncated: graph.truncated,
        },
      });
    } catch (error) {
      logger.error('Surveyor get graph error', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get Surveyor graph',
      });
    }
  }

  /**
   * GET /surveyor/projects/:projectId/file — one file's card. Query: ?file=<key|path> &scanId=
   */
  static async getFile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const fileRef = req.query.file ? String(req.query.file) : '';

      if (fileRef.trim().length === 0) {
        res.status(400).json({ success: false, error: 'file (node key or path) is required' });
        return;
      }

      if (!(await SurveyorService.projectExists(projectId))) {
        res.status(404).json({ success: false, error: 'Project not found' });
        return;
      }

      const result = await SurveyorService.getFile(projectId, fileRef.trim(), {
        scanId: req.query.scanId ? String(req.query.scanId) : undefined,
      });

      if (!result) {
        // No stored scan for the project yet — valid empty state.
        res.json({ success: true, data: { found: false, scan: null, file: null } });
        return;
      }

      if (!result.file) {
        // The scan exists but no node matches the reference — empty card (mirror the MCP tool).
        res.json({ success: true, data: { found: false, scan: result.scan, file: null } });
        return;
      }

      res.json({
        success: true,
        data: { found: true, scan: result.scan, file: result.file },
      });
    } catch (error) {
      logger.error('Surveyor get file error', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get Surveyor file',
      });
    }
  }

  /**
   * GET /surveyor/projects/:projectId/findings — the stored findings.
   * Query: ?scanId= &minConfidence= &category= &limit=
   */
  static async getFindings(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;

      if (!(await SurveyorService.projectExists(projectId))) {
        res.status(404).json({ success: false, error: 'Project not found' });
        return;
      }

      const opts: GetFindingsOptions = {
        scanId: req.query.scanId ? String(req.query.scanId) : undefined,
        minConfidence: SurveyorController.parseFloatParam(req.query.minConfidence),
        category: req.query.category ? String(req.query.category) : undefined,
        limit: SurveyorController.parsePositiveInt(req.query.limit),
      };

      const result = await SurveyorService.getFindings(projectId, opts);

      if (!result) {
        res.json({
          success: true,
          data: { found: false, scan: null, warnings: [], totalInScan: 0, filtered: false },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          found: true,
          scan: result.scan,
          warnings: result.warnings,
          totalInScan: result.totalInScan,
          filtered: result.filtered,
        },
      });
    } catch (error) {
      logger.error('Surveyor get findings error', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get Surveyor findings',
      });
    }
  }
}
