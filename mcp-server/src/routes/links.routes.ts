import { projectHandler } from '../handlers/project.js';
import { formatMcpError } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';
import type { RouteContext } from './index.js';
import { resolveEntityId, idErrorResponse, isFullUuid } from '../utils/idResolver.js';
import {
  mintEdge,
  unlinkEdge,
  getLinks,
  InvalidEdgeError,
  type ConnectedEdge,
} from '../services/links.js';
import { edgeTypeSpec, type EdgeNodeType, type EdgeType } from '../config/edgeTypes.js';

/**
 * Typed-Edge Graph Routes (Mandrel Core Redesign T2a, task 8a296229).
 * Handles: link (create/repair), unlink (remove/repair), get_links (read both directions).
 *
 * These are the EXPLICIT edge tools — for edges that can't be inferred at write-time and
 * to REPAIR the graph (the curate gap). Full pattern: zod strict → route → derived
 * inputSchema → structuredContent, actionable errors, id8 accepted (resolved project-
 * scoped), parameterized SQL (in the service), project-scoped.
 */
class LinksRoutes {
  private async resolveProjectId(
    argsProjectId: string | undefined,
    context?: RouteContext
  ): Promise<string | undefined> {
    if (argsProjectId) return argsProjectId;
    const sessionId = context?.connectionId || 'default-session';
    await projectHandler.initializeSession(sessionId);
    const projectId = await projectHandler.getCurrentProjectId(sessionId);
    return projectId || undefined;
  }

  /**
   * Resolve an endpoint id (full UUID or id8) to a full UUID, project-scoped. Returns the
   * resolved id, or an McpResponse (the actionable id-error) the caller should return.
   */
  private async resolveEndpoint(
    rawId: string,
    type: EdgeNodeType,
    toolName: string,
    projectId: string | undefined
  ): Promise<{ id: string } | { error: McpResponse }> {
    if (isFullUuid(rawId)) return { id: rawId };
    try {
      const id = await resolveEntityId(type, rawId, projectId);
      return { id };
    } catch (e) {
      const findTool =
        type === 'task' ? 'task_list' : type === 'decision' ? 'decision_search' : 'context_get_recent';
      const handled = idErrorResponse(e, toolName, type, rawId, findTool);
      if (handled) return { error: handled };
      throw e;
    }
  }

  /**
   * link — create a typed edge from → to. Cross-project endpoints are rejected (both
   * endpoints are resolved scoped to the active project, so an id from another project
   * surfaces as not-found here). Self-links and bad edge types are rejected with an
   * actionable error and mutate nothing. Idempotent: re-linking the same edge reports it.
   */
  async handleLink(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.resolveProjectId(args.projectId, context);

      const from = await this.resolveEndpoint(args.from, args.fromType, 'link', projectId);
      if ('error' in from) return from.error;
      const to = await this.resolveEndpoint(args.to, args.toType, 'link', projectId);
      if ('error' in to) return to.error;

      let result;
      try {
        result = await mintEdge({
          fromId: from.id,
          fromType: args.fromType,
          toId: to.id,
          toType: args.toType,
          edgeType: args.edgeType,
          projectId: projectId ?? null,
          createdBy: 'link',
          metadata: args.metadata,
        });
      } catch (e) {
        if (e instanceof InvalidEdgeError) {
          return {
            content: [{ type: 'text', text: `❌ Cannot create link: ${e.message}` }],
            isError: true,
            structuredContent: { ok: false, action: 'rejected' },
          };
        }
        throw e;
      }

      const spec = edgeTypeSpec(args.edgeType);
      const verb = result.created ? 'created' : 'already existed';
      return {
        content: [{
          type: 'text',
          text: `🔗 Edge ${verb}: ${args.fromType} ${from.id} —[${args.edgeType}]→ ${args.toType} ${to.id}\n` +
                (spec ? `   (${spec.direction}: ${spec.description})` : ''),
        }],
        structuredContent: {
          action: result.created ? 'created' : 'exists',
          edge: {
            edgeId: result.edgeId,
            edgeType: args.edgeType,
            direction: 'out',
            connectedId: to.id,
            connectedType: args.toType,
            fromId: from.id,
            fromType: args.fromType,
            created: result.created,
            metadata: args.metadata ?? {},
          },
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'link');
    }
  }

  /**
   * unlink — remove a typed edge (repair). Idempotent: removing a non-existent edge
   * reports removed:false (not an error). Endpoints accept id8 (resolved project-scoped).
   */
  async handleUnlink(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.resolveProjectId(args.projectId, context);

      // We don't know the endpoint types here (unlink takes only ids + edge_type), so
      // resolve each id against ANY entity table by trying each. A short id is resolved
      // project-scoped; a full UUID passes straight through. If a short id can't be
      // resolved against any entity, surface an actionable not-found.
      const fromId = await this.resolveAnyEndpoint(args.from, projectId);
      if ('error' in fromId) return fromId.error;
      const toId = await this.resolveAnyEndpoint(args.to, projectId);
      if ('error' in toId) return toId.error;

      let result;
      try {
        result = await unlinkEdge({ fromId: fromId.id, toId: toId.id, edgeType: args.edgeType });
      } catch (e) {
        if (e instanceof InvalidEdgeError) {
          return {
            content: [{ type: 'text', text: `❌ Cannot remove link: ${e.message}` }],
            isError: true,
            structuredContent: { ok: false, action: 'rejected' },
          };
        }
        throw e;
      }

      return {
        content: [{
          type: 'text',
          text: result.removed
            ? `🔗 Edge removed: ${fromId.id} —[${args.edgeType}]→ ${toId.id}`
            : `ℹ️  No such edge to remove: ${fromId.id} —[${args.edgeType}]→ ${toId.id} (already absent)`,
        }],
        structuredContent: {
          action: result.removed ? 'removed' : 'absent',
          edge: {
            edgeType: args.edgeType,
            direction: 'out',
            connectedId: toId.id,
            connectedType: 'unknown',
            edgeId: '',
            fromId: fromId.id,
            removed: result.removed,
          },
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'unlink');
    }
  }

  /**
   * Resolve an id that could be ANY entity (used by unlink, which doesn't carry the
   * endpoint types). A full UUID passes through. A short id is tried against task,
   * decision, then context (project-scoped); the first unambiguous resolve wins. If none
   * resolves, return an actionable not-found.
   */
  private async resolveAnyEndpoint(
    rawId: string,
    projectId: string | undefined
  ): Promise<{ id: string } | { error: McpResponse }> {
    if (isFullUuid(rawId)) return { id: rawId };
    for (const type of ['task', 'decision', 'context'] as EdgeNodeType[]) {
      try {
        const id = await resolveEntityId(type, rawId, projectId);
        return { id };
      } catch {
        // try the next entity type
      }
    }
    return {
      error: {
        content: [{
          type: 'text',
          text: `❌ Could not resolve id "${rawId}" to any task/decision/context in this project.\n\n` +
                `💡 Use a full UUID, or copy a 🆔 ID from task_list / decision_search / context_get_recent.`,
        }],
        isError: true,
        structuredContent: { ok: false, found: false },
      },
    };
  }

  /**
   * get_links — read a record's edges in both directions, each carrying the connected
   * record's id/type/title. The READ primitive for T2b trust + T3 recall_thread; the
   * consumer needs zero raw SQL. Accepts id8 (resolved project-scoped).
   */
  async handleGetLinks(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.resolveProjectId(args.projectId, context);

      // The id can be any entity; resolve it like unlink (try each entity type).
      const resolved = await this.resolveAnyEndpoint(args.id, projectId);
      if ('error' in resolved) return resolved.error;

      const edges: ConnectedEdge[] = await getLinks(resolved.id, {
        direction: args.direction,
        edgeTypes: args.edgeTypes as EdgeType[] | undefined,
      });

      if (edges.length === 0) {
        return {
          content: [{ type: 'text', text: `🔗 No edges found for ${resolved.id}.` }],
          structuredContent: { ok: true, results: [], total: 0 },
        };
      }

      const list = edges
        .map((e) => {
          const arrow = e.direction === 'out' ? '→' : '←';
          return `• [${e.edgeType}] ${arrow} ${e.connectedType} ${e.connectedId}` +
                 (e.connectedTitle ? ` ("${e.connectedTitle}")` : '');
        })
        .join('\n');

      return {
        content: [{ type: 'text', text: `🔗 ${edges.length} edge(s) for ${resolved.id}:\n${list}` }],
        structuredContent: {
          results: edges.map((e) => ({
            edgeType: e.edgeType,
            direction: e.direction,
            connectedId: e.connectedId,
            connectedType: e.connectedType,
            connectedTitle: e.connectedTitle,
            edgeId: e.edgeId,
            metadata: e.metadata,
          })),
          total: edges.length,
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'get_links');
    }
  }
}

export const linksRoutes = new LinksRoutes();
