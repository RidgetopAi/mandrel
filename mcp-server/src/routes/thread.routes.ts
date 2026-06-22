import { projectHandler } from '../handlers/project.js';
import { formatMcpError } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';
import type { RouteContext } from './index.js';
import { db } from '../config/database.js';
import { resolveEntityId, idErrorResponse, isFullUuid } from '../utils/idResolver.js';

/**
 * SESSION ACTIVE-THREAD ANCHOR ROUTES (Mandrel Core Redesign T5b, task ce5d119c,
 * decision 9fbbcd08) — THE deterministic auto-threading layer's control surface.
 *
 * Handles: thread_set (set the session's active task and/or decision),
 *          thread_current (show the resolved anchor), thread_clear (clear it).
 *
 * The anchor itself lives on projectHandler (in-memory per-connection session state,
 * keyed by connectionId exactly like current-project). While it is set, context_store
 * auto-threads its capture onto it (see context.routes.handleStore). These three tools
 * are the EXPLICIT set/read/clear; the AUTOMATIC mint happens on the write path.
 *
 * Full pattern (matches link/recall_thread): zod strict → route → derived inputSchema →
 * structuredContent, actionable errors, id8 accepted (resolved project-scoped),
 * parameterized SQL, project-scoped.
 */
class ThreadRoutes {
  /** Resolve the active project id (connection-scoped), same idiom as the other routes. */
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

  private getSessionId(context?: RouteContext): string {
    return context?.connectionId || 'default-session';
  }

  /**
   * Resolve a referent (full UUID or id8) for the given entity type, project-scoped.
   * Returns the resolved id, or an McpResponse (the actionable id-error) to return.
   */
  private async resolveRef(
    rawId: string,
    type: 'task' | 'decision',
    toolName: string,
    projectId: string | undefined
  ): Promise<{ id: string } | { error: McpResponse }> {
    if (isFullUuid(rawId)) return { id: rawId };
    try {
      const id = await resolveEntityId(type, rawId, projectId);
      return { id };
    } catch (e) {
      const findTool = type === 'task' ? 'task_list' : 'decision_search';
      const handled = idErrorResponse(e, toolName, type, rawId, findTool);
      if (handled) return { error: handled };
      throw e;
    }
  }

  /** Best-effort title for an anchored task (null if gone/unreadable — never throws). */
  private async taskTitle(id: string): Promise<string | null> {
    try {
      const r = await db.query('SELECT title FROM tasks WHERE id = $1', [id]);
      return r.rows[0]?.title ?? null;
    } catch {
      return null;
    }
  }

  /** Best-effort title for an anchored decision (null if gone/unreadable — never throws). */
  private async decisionTitle(id: string): Promise<string | null> {
    try {
      const r = await db.query('SELECT title FROM technical_decisions WHERE id = $1', [id]);
      return r.rows[0]?.title ?? null;
    } catch {
      return null;
    }
  }

  /**
   * thread_set — set the session's active task and/or decision. Accepts id8|uuid for
   * each, resolved project-scoped BEFORE the anchor is set. At LEAST one of task/decision
   * is required (an actionable error if neither). Returns the resolved anchor.
   *
   * MERGE semantics: setting only `task` leaves a previously-set `decision` in place (and
   * vice-versa), so you can build the anchor incrementally. Use thread_clear to reset.
   */
  async handleSet(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      if (
        (args.task === undefined || args.task === null || args.task === '') &&
        (args.decision === undefined || args.decision === null || args.decision === '')
      ) {
        return {
          content: [{
            type: 'text',
            text: '❌ thread_set requires at least one of `task` or `decision`.\n\n' +
                  '💡 Pass an active task and/or decision (full UUID or 8+-hex short id) to anchor ' +
                  'this session. Captures stored while the thread is active auto-thread onto it.',
          }],
          isError: true,
          structuredContent: { ok: false, action: 'rejected' },
        };
      }

      const projectId = await this.resolveProjectId(args.projectId, context);
      const sessionId = this.getSessionId(context);

      let taskId: string | undefined;
      let decisionId: string | undefined;

      if (args.task !== undefined && args.task !== null && args.task !== '') {
        const r = await this.resolveRef(String(args.task), 'task', 'thread_set', projectId);
        if ('error' in r) return r.error;
        taskId = r.id;
      }
      if (args.decision !== undefined && args.decision !== null && args.decision !== '') {
        const r = await this.resolveRef(String(args.decision), 'decision', 'thread_set', projectId);
        if ('error' in r) return r.error;
        decisionId = r.id;
      }

      const anchor = projectHandler.setActiveThread({ task: taskId, decision: decisionId }, sessionId);

      const taskTitle = anchor.taskId ? await this.taskTitle(anchor.taskId) : null;
      const decisionTitle = anchor.decisionId ? await this.decisionTitle(anchor.decisionId) : null;

      const lines: string[] = ['🧵 Active thread set. Captures will auto-thread onto it:'];
      if (anchor.taskId) lines.push(`   • task: ${anchor.taskId}${taskTitle ? ` ("${taskTitle}")` : ''} (informs)`);
      if (anchor.decisionId) lines.push(`   • decision: ${anchor.decisionId}${decisionTitle ? ` ("${decisionTitle}")` : ''} (decided_by)`);

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        structuredContent: {
          // ok:true explicit (task df4c3745): the success path was omitting it (the seam
          // stamps it, but emit it here so the handler return is self-consistent with the
          // rejected path's {ok:false,...} and the schema's required `ok`).
          ok: true,
          action: 'set',
          activeThread: {
            taskId: anchor.taskId,
            taskTitle,
            decisionId: anchor.decisionId,
            decisionTitle,
          },
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'thread_set');
    }
  }

  /**
   * thread_current — show the session's active thread (resolved titles), or a clear
   * "no active thread" message if none is set.
   */
  async handleCurrent(_args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const sessionId = this.getSessionId(context);
      const anchor = projectHandler.getActiveThread(sessionId);

      if (!anchor) {
        return {
          content: [{
            type: 'text',
            text: '🧵 No active thread set for this session.\n\n' +
                  '💡 Use thread_set(task=… and/or decision=…) to anchor captures so they thread automatically.',
          }],
          structuredContent: { ok: true, action: 'current', activeThread: null },
        };
      }

      const taskTitle = anchor.taskId ? await this.taskTitle(anchor.taskId) : null;
      const decisionTitle = anchor.decisionId ? await this.decisionTitle(anchor.decisionId) : null;

      const lines: string[] = ['🧵 Active thread for this session:'];
      if (anchor.taskId) lines.push(`   • task: ${anchor.taskId}${taskTitle ? ` ("${taskTitle}")` : ''} (informs)`);
      if (anchor.decisionId) lines.push(`   • decision: ${anchor.decisionId}${decisionTitle ? ` ("${decisionTitle}")` : ''} (decided_by)`);
      lines.push('   (captures stored now auto-thread onto the above — pass noAutoThread:true on a store to skip)');

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        structuredContent: {
          ok: true,
          action: 'current',
          activeThread: {
            taskId: anchor.taskId,
            taskTitle,
            decisionId: anchor.decisionId,
            decisionTitle,
          },
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'thread_current');
    }
  }

  /**
   * thread_clear — clear the session's active thread. Idempotent: clearing when nothing
   * is set reports "already empty" (not an error).
   */
  async handleClear(_args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const sessionId = this.getSessionId(context);
      const cleared = projectHandler.clearActiveThread(sessionId);
      return {
        content: [{
          type: 'text',
          text: cleared
            ? '🧵 Active thread cleared. New captures will no longer auto-thread.'
            : 'ℹ️  No active thread was set (nothing to clear).',
        }],
        structuredContent: { ok: true, action: cleared ? 'cleared' : 'absent', activeThread: null },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'thread_clear');
    }
  }
}

export const threadRoutes = new ThreadRoutes();
