/**
 * Session Lifecycle Routes (session-rework SR-2, task af51c035)
 *
 * Re-introduces EXPLICIT, user-controlled session lifecycle as MCP tools — the
 * capability the old "Phase 6" removed when it deleted the session MCP tools and
 * left sessions fully auto-managed. Brian's current direction: "the user can start
 * or stop a session whenever they choose."
 *
 * These tools are thin ORCHESTRATION over the SR-1 per-connection model. They add no
 * new persistence logic and contain NO raw SQL — every read/write goes through the
 * existing SessionTracker façade / SessionLifecycleService and the existing
 * SessionManagementHandler (reused, not rebuilt). The connection identity is the SAME
 * stable X-Connection-ID the route layer already threads into every other tool
 * (context?.connectionId), so "the current session" here means exactly the one
 * getActiveSession(connectionId) resolves — honoring SR-1's one-active-per-connection
 * invariant (the partial unique index + app guard).
 *
 *   session_start — finalize this connection's current session (if any) via the full
 *                   endSession() path, then OPEN a new one (optional title/goal/project).
 *   session_end   — finalize this connection's current session via endSession()
 *                   (productivity/flush/analytics); no-op-safe when none is active.
 *                   The next ACTION tool auto-starts a fresh session lazily.
 *   session_status— read-only summary of this connection's current active session.
 *
 * CONNECTION-SCOPED, NEVER GLOBAL: unlike the legacy dashboard readers (which opt into
 * allowGlobalFallback), these user-facing tools resolve strictly within the caller's
 * connection. A user who ends their session must not accidentally finalize another
 * connection's work.
 */

import { SessionTracker } from '../services/sessionTracker.js';
import { SessionManagementHandler } from '../handlers/sessionAnalytics/management/SessionManagementHandler.js';
import { projectHandler } from '../handlers/project.js';
import { formatMcpError } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';
import type { RouteContext } from './index.js';
import { logger } from '../utils/logger.js';

/**
 * Resolve a project NAME-or-id to its canonical {id,name} using the SAME matching the
 * existing manual-session path uses (exact-or-substring, case-insensitive) so the UX is
 * consistent. Returns the resolved project, or a structured "not found" with the list of
 * available names (mirrors SessionManagementHandler.createNewSession). No raw SQL here —
 * delegates to projectHandler.listProjects.
 */
async function resolveProject(
  projectName: string
): Promise<{ ok: true; id: string; name: string } | { ok: false; message: string }> {
  const projects = await projectHandler.listProjects();
  if (!projects || !Array.isArray(projects)) {
    return { ok: false, message: 'Project service error: invalid response from project service' };
  }
  const lower = projectName.toLowerCase();
  const project =
    projects.find((p) => p.name.toLowerCase() === lower) ??
    projects.find((p) => p.name.toLowerCase().includes(lower));
  if (!project) {
    const available = projects.map((p) => p.name).join(', ');
    return { ok: false, message: `Project '${projectName}' not found. Available projects: ${available}` };
  }
  return { ok: true, id: project.id, name: project.name };
}

/**
 * Build the read-only summary for a session id by REUSING the existing
 * SessionManagementHandler.getSessionDetailsWithMeta (which already assembles the rich
 * record the Session View consumes — title, session_goal, project, counts, duration).
 * We pass the explicit session id (connection-resolved by the caller) so this never
 * touches the legacy global fallback.
 */
async function summarizeSession(sessionId: string): Promise<Record<string, any> | null> {
  const details = await SessionManagementHandler.getSessionDetailsWithMeta(sessionId);
  if (!details.success || !details.session) return null;
  return details.session;
}

class SessionRoutes {
  /**
   * session_start — open a NEW session for this connection, ending the prior one first.
   *
   * Order matters for SR-1's one-active-per-connection guard: we END the current active
   * session (full finalize) BEFORE opening the new one, so the partial unique index is
   * never violated and analytics for the closed session are flushed. Accepts optional
   * title, goal, and project; title/goal are stamped onto the session row (session_goal
   * column → Session View "Session Goal" field).
   */
  async handleStart(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const connectionId = context?.connectionId;
      const title: string | undefined = args.title;
      const goal: string | undefined = args.goal;
      const projectName: string | undefined = args.project;

      // Resolve the project FIRST (before mutating any session state) so a bad project
      // name fails fast without leaving the connection sessionless.
      let projectId: string | undefined;
      let resolvedProjectName: string | undefined;
      if (projectName) {
        const resolved = await resolveProject(projectName);
        if (!resolved.ok) {
          return formatMcpError(resolved.message, 'session_start');
        }
        projectId = resolved.id;
        resolvedProjectName = resolved.name;
      }

      // End this connection's current session (if any) via the full finalize path.
      const priorSessionId = await SessionTracker.getActiveSession(connectionId);
      let endedSessionId: string | undefined;
      if (priorSessionId) {
        await SessionTracker.endSession(priorSessionId);
        endedSessionId = priorSessionId;
        logger.info(
          `🔁 session_start: finalized prior session ${priorSessionId.substring(0, 8)}... before opening a new one` +
            `${connectionId ? ` (connection: ${connectionId})` : ''}`
        );
      }

      // If no project was specified, inherit the connection's current project (same key
      // the lazy action-gate uses), so a manual start mirrors the auto-start default.
      if (!projectId && connectionId) {
        try {
          projectId = (await projectHandler.getCurrentProjectId(connectionId)) ?? undefined;
        } catch {
          projectId = undefined;
        }
      }

      // Open the new session for THIS connection. title/goal persist to the session row.
      const newSessionId = await SessionTracker.startSession(
        projectId,
        title,
        undefined, // description
        goal,
        undefined, // tags
        undefined, // aiModel
        undefined, // sessionType (defaults)
        connectionId
      );

      const session = await summarizeSession(newSessionId);

      const titleSuffix = title ? ` ("${title}")` : '';
      const projectSuffix = (resolvedProjectName ?? session?.project_name)
        ? ` for project '${resolvedProjectName ?? session?.project_name}'`
        : '';
      return {
        content: [
          {
            type: 'text',
            text:
              `✅ New session started: ${newSessionId.substring(0, 8)}...${titleSuffix}${projectSuffix}` +
              (endedSessionId ? ` (finalized prior session ${endedSessionId.substring(0, 8)}...)` : ''),
          },
        ],
        structuredContent: {
          ok: true,
          action: 'started',
          sessionId: newSessionId,
          endedSessionId: endedSessionId ?? null,
          session: session ?? { id: newSessionId },
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'session_start');
    }
  }

  /**
   * session_end — finalize this connection's current active session.
   *
   * Runs the full endSession() path (git file sync, productivity, token/activity flush,
   * analytics event, in-memory eviction). No-op-safe: if the connection has no active
   * session, returns success with action 'noop' (ending nothing is not an error). The
   * next ACTION tool on this connection lazily auto-starts a fresh session.
   */
  async handleEnd(_args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const connectionId = context?.connectionId;
      const activeSessionId = await SessionTracker.getActiveSession(connectionId);

      if (!activeSessionId) {
        return {
          content: [
            {
              type: 'text',
              text: 'ℹ️ No active session to end for this connection — nothing to do. The next action will start a fresh session.',
            },
          ],
          structuredContent: { ok: true, action: 'noop', sessionId: null },
        };
      }

      // Snapshot the summary BEFORE finalize (endSession evicts in-memory counts).
      const session = await summarizeSession(activeSessionId);
      const finalData = await SessionTracker.endSession(activeSessionId);

      logger.info(
        `🏁 session_end: finalized session ${activeSessionId.substring(0, 8)}...` +
          `${connectionId ? ` (connection: ${connectionId})` : ''}`
      );

      return {
        content: [
          {
            type: 'text',
            text:
              `✅ Session ended: ${activeSessionId.substring(0, 8)}...` +
              ` (duration ${Math.round((finalData.duration_ms ?? 0) / 1000)}s, ` +
              `productivity ${finalData.productivity_score ?? 0}). ` +
              `The next action will start a fresh session.`,
          },
        ],
        structuredContent: {
          ok: true,
          action: 'ended',
          sessionId: activeSessionId,
          session: session ?? { id: activeSessionId },
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'session_end');
    }
  }

  /**
   * session_status — read-only summary of this connection's current active session.
   *
   * Connection-scoped: resolves via getActiveSession(connectionId) (NO global fallback),
   * then reuses the existing rich summary. Returns ok:true with active:false when the
   * connection has no session yet (a clean "none" state, not an error).
   */
  async handleStatus(_args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const connectionId = context?.connectionId;
      const activeSessionId = await SessionTracker.getActiveSession(connectionId);

      if (!activeSessionId) {
        return {
          content: [{ type: 'text', text: 'ℹ️ No active session for this connection.' }],
          structuredContent: { ok: true, active: false, session: null },
        };
      }

      const session = await summarizeSession(activeSessionId);
      if (!session) {
        // Edge: getActiveSession returned an id but the row vanished between calls.
        return {
          content: [{ type: 'text', text: 'ℹ️ No active session for this connection.' }],
          structuredContent: { ok: true, active: false, session: null },
        };
      }

      return {
        content: [
          {
            type: 'text',
            text:
              `📊 Active session: ${session.id.substring(0, 8)}...` +
              `${session.title ? ` "${session.title}"` : ''}` +
              ` | project: ${session.project_name ?? 'none'}` +
              ` | duration ${session.duration_minutes ?? 0}m`,
          },
        ],
        structuredContent: { ok: true, active: true, session },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'session_status');
    }
  }
}

export const sessionRoutes = new SessionRoutes();
