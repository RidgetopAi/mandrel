import { projectHandler } from '../handlers/project.js';
import { formatMcpError } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';
import type { RouteContext } from './index.js';
import {
  buildThread,
  AnchorUnresolvableError,
  type ThreadResult,
  type ThreadNode,
} from '../services/recallThread.js';
import { THREAD_DEFAULT_ALTITUDE, type ThreadAltitude } from '../config/threadConfig.js';
import { TRUST_BAND_HINT, type TrustBand } from '../config/trustConfig.js';
import type { EdgeType } from '../config/edgeTypes.js';

/**
 * recall_thread route (Mandrel Core Redesign T3, task 73f9d280) — THE headline pull tool.
 *
 * "Read me in on the story of X, at altitude Y, and tell me what to trust." ONE call:
 * resolve the anchor → traverse the typed-edge graph (both directions, cycle-safe, capped)
 * → trust-annotate every node (the moat) → order causally+temporally → shape to altitude →
 * surface the abstain list. Returns BOTH a clean structuredContent thread AND a text
 * channel that reads top-to-bottom as the story (so a consuming agent can narrate it
 * directly). DETERMINISTIC — no server-side LLM (Mandrel runs in customer containers).
 *
 * Pattern matches the rest of the surface: zod strict → route → derived inputSchema →
 * structuredContent; actionable errors; project-scoped; parameterized SQL (in the service).
 */
class RecallRoutes {
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
   * recall_thread — the consolidated traverse + trust + narrate operation. One call; no
   * traverse-then-fetch dance. An unresolvable/ambiguous anchor is an ACTIONABLE error
   * (mutates nothing); an anchor with NO edges returns just the anchor node (not an error).
   */
  async handleRecallThread(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.resolveProjectId(args.projectId, context);
      const altitude: ThreadAltitude = args.altitude ?? THREAD_DEFAULT_ALTITUDE;

      let result: ThreadResult;
      try {
        result = await buildThread({
          anchor: args.anchor,
          altitude,
          edgeTypes: args.edgeTypes as EdgeType[] | undefined,
          depth: args.depth,
          minTrust: args.minTrust as TrustBand | number | undefined,
          projectId,
        });
      } catch (e) {
        if (e instanceof AnchorUnresolvableError) {
          return {
            content: [{ type: 'text', text: `❌ recall_thread: ${e.message}` }],
            isError: true,
            structuredContent: { ok: false, found: false },
          };
        }
        throw e;
      }

      return {
        content: [{ type: 'text', text: renderThreadText(result) }],
        structuredContent: {
          ok: true,
          anchor: result.anchor,
          altitude: result.altitude,
          depthUsed: result.depthUsed,
          nodes: result.nodes,
          edges: result.edges,
          abstain: result.abstain,
          truncated: result.truncated,
          truncatedCount: result.truncatedCount,
          total: result.nodes.length,
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'recall_thread');
    }
  }
}

/**
 * Render the thread as the ordered story (the text channel). Reads top-to-bottom: each node
 * is a numbered line with its type + trust band; at summary/full its content rides beneath.
 * An honest header carries the anchor, altitude, abstain count and truncation signal so the
 * agent narrating it has the whole frame.
 */
function renderThreadText(r: ThreadResult): string {
  const lines: string[] = [];
  lines.push(
    `📖 Thread for ${r.anchor} — altitude:${r.altitude}, depth:${r.depthUsed}, ${r.nodes.length} node(s)` +
      (r.truncated ? ` (⚠️ truncated — ${r.truncatedCount} more reachable; raise depth/MANDREL_THREAD_MAX_NODES or narrow edgeTypes)` : '')
  );
  if (r.abstain.length > 0) {
    lines.push(`⚠️ Do NOT rely on ${r.abstain.length} node(s): ${r.abstain.join(', ')}`);
  }
  lines.push('');

  r.nodes.forEach((n, i) => {
    lines.push(`${i + 1}. ${nodeHeadline(n)}`);
    if (n.content) {
      // Indent the body so the story reads as a list with sub-content.
      for (const bodyLine of n.content.split('\n')) lines.push(`   ${bodyLine}`);
    }
  });

  return lines.join('\n');
}

/** The 1-liner for a node: title + type + trust band hint (+ abstain marker). */
function nodeHeadline(n: ThreadNode): string {
  const band = TRUST_BAND_HINT[n.trust.band as TrustBand] ?? n.trust.band;
  const title = n.title ?? '(untitled)';
  const abstainMark = n.trust.abstain ? ' ⛔ABSTAIN' : '';
  return `[${n.type}] ${title} — 🔐 ${band}${abstainMark}  (${n.id})`;
}

export const recallRoutes = new RecallRoutes();
