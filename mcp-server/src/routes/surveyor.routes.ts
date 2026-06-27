import { projectHandler } from '../handlers/project.js';
import { formatMcpError } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';
import type { RouteContext } from './index.js';
import {
  surveyorClient,
  SurveyorClientError,
  type ISurveyorClient,
} from '../services/surveyorClient.js';
import { persistScan, getStoredGraph } from '../services/surveyorStore.js';

/**
 * Surveyor Integration Routes (Surveyor P4b, Mandrel task 8ed9e216, decision 8f330f96).
 * Handles: surveyor_scan (call the shared service → persist the ScanResult into the tenant
 * Postgres), surveyor_get_graph (read a stored project graph back).
 *
 * Mandrel is the SYSTEM OF RECORD: surveyor_scan delegates the actual scanning to the shared
 * Surveyor service (P4a) via surveyorClient, then PERSISTS the graph + warnings + summaries
 * (surveyorStore) — and returns a counts summary. Full house pattern: zod strict → route →
 * derived inputSchema → structuredContent, actionable errors, project-scoped, parameterized
 * SQL (in the store). The service client is injectable (setClient) so tests drive a faithful
 * fake without a network.
 */
class SurveyorRoutes {
  private client: ISurveyorClient;

  constructor(client: ISurveyorClient = surveyorClient) {
    this.client = client;
  }

  /** Test seam: swap the Surveyor service client (e.g. a contract-pinned faithful fake). */
  setClient(client: ISurveyorClient): void {
    this.client = client;
  }

  private async resolveProjectId(
    argsProjectId: string | undefined,
    context?: RouteContext,
  ): Promise<string | undefined> {
    if (argsProjectId) return argsProjectId;
    const sessionId = context?.connectionId || 'default-session';
    await projectHandler.initializeSession(sessionId);
    const projectId = await projectHandler.getCurrentProjectId(sessionId);
    return projectId || undefined;
  }

  /** Map a SurveyorClientError kind to actionable user text (no internals leaked). */
  private clientErrorText(e: SurveyorClientError): string {
    switch (e.kind) {
      case 'not_configured':
        return `❌ Surveyor service is not configured. ${e.message}`;
      case 'service_down':
        return `❌ Could not reach the Surveyor service. ${e.message}\n💡 Is @surveyor/server running and SURVEYOR_BASE_URL correct?`;
      case 'timeout':
        return `❌ The Surveyor scan timed out. ${e.message}`;
      case 'job_error':
        return `❌ The Surveyor scan failed. ${e.message}`;
      case 'bad_response':
        return `❌ The Surveyor service returned an unexpected response. ${e.message}`;
      case 'http_error':
      default:
        return `❌ The Surveyor service returned an error. ${e.message}`;
    }
  }

  /**
   * surveyor_scan — call the shared Surveyor service to scan a codebase path, then PERSIST
   * the result (graph + warnings + per-function summaries) into the current/target Mandrel
   * project's Postgres. Returns a counts summary. The scan is the durable system-of-record
   * write; a service/job failure surfaces as an actionable error and persists nothing.
   */
  async handleScan(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.resolveProjectId(args.projectId, context);
      if (!projectId) {
        return {
          content: [
            {
              type: 'text',
              text:
                '❌ No project selected. Use project_switch to choose a project (or pass projectId) ' +
                'before scanning — a scan is stored under a project.',
            },
          ],
          isError: true,
          structuredContent: { ok: false, action: 'rejected' },
        };
      }

      let scanResult;
      try {
        scanResult = await this.client.scan(args.path);
      } catch (e) {
        if (e instanceof SurveyorClientError) {
          return {
            content: [{ type: 'text', text: this.clientErrorText(e) }],
            isError: true,
            structuredContent: { ok: false, action: 'failed', errorKind: e.kind },
          };
        }
        throw e;
      }

      const summary = await persistScan(projectId, scanResult);

      const t = summary.totals;
      return {
        content: [
          {
            type: 'text',
            text:
              `🛰️  Surveyor scan stored (scan ${summary.scanId})\n` +
              `   Project path: ${summary.projectPath}\n` +
              `   ${t.files} files · ${t.functions} functions · ${t.classes} classes\n` +
              `   ${t.connections} connections · ${t.warnings} warnings · ${t.functionSummaries} fn summaries`,
          },
        ],
        structuredContent: {
          ok: true,
          action: 'scanned',
          scan: {
            scanId: summary.scanId,
            projectId: summary.projectId,
            projectName: summary.projectName,
            projectPath: summary.projectPath,
            status: summary.status,
            sourceScanId: summary.sourceScanId,
            totals: summary.totals,
            createdAt: summary.createdAt,
            completedAt: summary.completedAt,
          },
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'surveyor_scan');
    }
  }

  /**
   * surveyor_get_graph — read a project's stored Surveyor graph (nodes + connections) back
   * from Postgres. Defaults to the project's LATEST scan; a specific scanId (full UUID or
   * 8+-hex prefix) reads that scan. Optional nodeTypes filter + limit; when filtered, the
   * connections are scoped to the returned node set so the graph stays internally consistent.
   */
  async handleGetGraph(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.resolveProjectId(args.projectId, context);
      if (!projectId) {
        return {
          content: [
            {
              type: 'text',
              text: '❌ No project selected. Use project_switch to choose a project (or pass projectId).',
            },
          ],
          isError: true,
          structuredContent: { ok: false, found: false },
        };
      }

      const graph = await getStoredGraph(projectId, {
        scanId: args.scanId,
        nodeTypes: args.nodeTypes,
        limit: args.limit,
      });

      if (!graph) {
        return {
          content: [
            {
              type: 'text',
              text: args.scanId
                ? `🛰️  No stored Surveyor scan ${args.scanId} found in this project.`
                : '🛰️  No stored Surveyor scan for this project yet. Run surveyor_scan first.',
            },
          ],
          structuredContent: { ok: true, found: false },
        };
      }

      const { scan, nodes, connections, truncated } = graph;
      return {
        content: [
          {
            type: 'text',
            text:
              `🛰️  Surveyor graph (scan ${scan.scanId})\n` +
              `   ${nodes.length} node(s) · ${connections.length} connection(s)` +
              (truncated ? ' (filtered/limited — more in the full scan)' : '') +
              `\n   Project path: ${scan.projectPath}`,
          },
        ],
        structuredContent: {
          ok: true,
          found: true,
          truncated,
          scan: {
            scanId: scan.scanId,
            projectId: scan.projectId,
            projectName: scan.projectName,
            projectPath: scan.projectPath,
            status: scan.status,
            sourceScanId: scan.sourceScanId,
            totals: scan.totals,
            stats: scan.stats,
            createdAt: scan.createdAt,
            completedAt: scan.completedAt,
          },
          nodes,
          connections,
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'surveyor_get_graph');
    }
  }
}

export const surveyorRoutes = new SurveyorRoutes();
export { SurveyorRoutes };
