/**
 * SessionLifecycleService - Orchestrates session start/end/management
 */

import { randomUUID } from 'crypto';
import { ActiveSessionStore, TokenStore, ActivityCountStore } from '../../state/index.js';
import { SessionRepo, AnalyticsEventsRepo } from '../../infra/db/index.js';
import { GitFileSync } from '../../infra/git/index.js';
import { TokenTracker, OperationTracker } from '../tracking/index.js';
import { calculateBasicProductivity } from '../productivity/index.js';
import { resolveProjectForSession } from './projectResolution.js';
import { logger } from '../../../../utils/logger.js';
import type { SessionData } from '../../types.js';

export interface StartSessionOptions {
  projectId?: string;
  title?: string;
  description?: string;
  sessionGoal?: string;
  tags?: string[];
  aiModel?: string;
  sessionType?: 'mcp-server' | 'AI Model';
  connectionId?: string;
}

export const SessionLifecycleService = {
  /**
   * Start a new session with smart project inheritance
   */
  async startSession(options: StartSessionOptions = {}): Promise<string> {
    try {
      const sessionId = randomUUID();
      const startTime = new Date();

      // Resolve project if not specified
      let resolvedProjectId: string | null = options.projectId || null;
      if (!resolvedProjectId) {
        resolvedProjectId = await resolveProjectForSession(sessionId);
      }

      logger.info(`🚀 Starting session: ${sessionId.substring(0, 8)}... for project: ${resolvedProjectId || 'none'}`);

      // Capture git information
      const gitInfo = await GitFileSync.captureHeadInfo();
      if (gitInfo.branch) logger.info(`🌿 Git branch: ${gitInfo.branch}`);
      if (gitInfo.commitSha) logger.info(`📌 Git commit: ${gitInfo.commitSha.substring(0, 8)}...`);

      // Determine session type
      const finalSessionType = options.sessionType || 'AI Model';
      logger.info(`📋 Session type: ${finalSessionType}${options.aiModel ? ` (${options.aiModel})` : ''}`);

      // Create session record
      await SessionRepo.create({
        sessionId,
        projectId: resolvedProjectId,
        sessionType: finalSessionType,
        startTime,
        title: options.title,
        description: options.description,
        sessionGoal: options.sessionGoal,
        tags: options.tags,
        aiModel: options.aiModel,
        activeBranch: gitInfo.branch,
        workingCommitSha: gitInfo.commitSha,
        metadata: {
          start_time: startTime.toISOString(),
          created_by: 'mandrel-session-tracker',
          auto_created: !options.sessionType,
          session_type: finalSessionType,
          ai_model: options.aiModel || null,
          git_branch: gitInfo.branch,
          git_start_commit: gitInfo.commitSha,
          project_resolution_method: resolvedProjectId === options.projectId ? 'explicit' : 'inherited',
          title_provided: !!options.title,
          description_provided: !!options.description,
          session_goal_provided: !!options.sessionGoal,
          tags_provided: !!(options.tags && options.tags.length > 0)
        }
      });

      // Log analytics event
      await AnalyticsEventsRepo.insertSessionEvent(sessionId, 'session_start', options.projectId, {
        start_time: startTime.toISOString()
      });

      // Set as active session for this connection
      ActiveSessionStore.set(sessionId, options.connectionId);

      logger.info(`✅ Session started: ${sessionId.substring(0, 8)}...${options.connectionId ? ` (connection: ${options.connectionId})` : ''}`);
      return sessionId;

    } catch (error) {
      logger.error('❌ Failed to start session', error as Error);
      throw error;
    }
  },

  /**
   * End an active session and calculate final metrics
   */
  async endSession(sessionId: string): Promise<SessionData> {
    try {
      const endTime = new Date();
      logger.info(`🏁 Ending session: ${sessionId.substring(0, 8)}...`);

      // Sync file changes from git
      logger.info(`📁 Syncing file changes from git...`);
      try {
        const fileSync = await GitFileSync.syncFilesFromGit(sessionId);
        logger.info(`✅ File sync complete: ${fileSync.filesProcessed} files, +${fileSync.totalLinesAdded}/-${fileSync.totalLinesDeleted} lines`);
      } catch (error) {
        logger.warn('⚠️  Failed to sync files from git', { metadata: { error } });
      }

      // Get session data
      const sessionData = await SessionRepo.getSessionData(sessionId);
      if (!sessionData) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Get in-memory counts
      const tokenUsage = TokenTracker.get(sessionId);
      const activityCounts = OperationTracker.getActivityCounts(sessionId);

      // Count contexts
      const contextsCreated = await SessionRepo.countContexts(sessionId);

      // Calculate duration
      const durationMs = endTime.getTime() - sessionData.start_time.getTime();

      // Build session data for productivity calculation
      const sessionDataForProd = {
        ...sessionData,
        contexts_created: activityCounts.contexts_created || contextsCreated,
        duration_ms: durationMs
      };

      // Calculate productivity
      const productivityScore = calculateBasicProductivity(sessionDataForProd);

      // Update session in database
      await SessionRepo.finish({
        sessionId,
        endTime,
        durationMs,
        tokenUsage,
        activityCounts,
        operationsCount: sessionData.operations_count,
        productivityScore
      });

      await SessionRepo.updateProductivityScore(sessionId, productivityScore);

      // Log analytics event
      await AnalyticsEventsRepo.insertSessionEvent(sessionId, 'session_end', sessionData.project_id, {
        end_time: endTime.toISOString(),
        contexts_created: contextsCreated,
        decisions_created: sessionData.decisions_created,
        operations_count: sessionData.operations_count,
        productivity_score: productivityScore
      }, durationMs);

      // Clear in-memory state
      ActiveSessionStore.clearIfActive(sessionId);
      TokenStore.clear(sessionId);
      ActivityCountStore.clear(sessionId);

      const finalData: SessionData = {
        ...sessionData,
        end_time: endTime,
        duration_ms: durationMs,
        success_status: sessionData.operations_count > 0 ? 'completed' : 'abandoned',
        input_tokens: tokenUsage.input,
        output_tokens: tokenUsage.output,
        total_tokens: tokenUsage.total
      };

      logger.info(`✅ Session ended: ${sessionId.substring(0, 8)}... Duration: ${Math.round(durationMs / 1000)}s`);
      return finalData;

    } catch (error) {
      logger.error('❌ Failed to end session', error as Error);
      throw error;
    }
  },

  /**
   * Get currently active session ID for a connection.
   *
   * CONNECTION-SCOPED BY DEFAULT (attribution-correct):
   *   A miss returns null. We NEVER silently adopt another connection's session
   *   via a global "last active anywhere" lookup — that was the per-connection
   *   attribution leak (a context/task on connection A could attach to whatever
   *   session was last touched on B). Connection-scoped write callers
   *   (context_store / task_create / decision_record, the tracking middleware)
   *   must pass their connectionId and accept null when their connection has no
   *   session yet (the route-level action gate creates it lazily before the write).
   *
   * EXPLICIT GLOBAL FALLBACK (opt-in only):
   *   A handful of legacy/dashboard READ callers genuinely want "the most recent
   *   session anywhere" (e.g. the REST /sessions/active poll that has no
   *   connection of its own). Those callers pass { allowGlobalFallback: true }
   *   so the global query is auditable, never implicit.
   *
   * @param connectionId - Optional connection identifier for isolation
   * @param opts.allowGlobalFallback - opt in to the global last-active DB lookup
   */
  async getActiveSession(
    connectionId?: string,
    opts: { allowGlobalFallback?: boolean } = {}
  ): Promise<string | null> {
    try {
      // Check in-memory first (connection-scoped).
      //
      // ROOT-CAUSE GUARD (dangling-FK fix): the in-memory store can hold a session
      // id whose DB row no longer exists — e.g. the session was ended+pruned, the
      // process retained the cache across a row deletion, or a prior global-fallback
      // read cached a `getLastActive` id that was later removed. If we returned that
      // stale id, ensureActiveSession() would treat the connection as "already has a
      // session" and SKIP startSession()/SessionRepo.create(), and the subsequent
      // contexts INSERT would violate contexts_session_id_fkey. So we VALIDATE the
      // cached id against the DB (the source of truth) and self-heal on a miss:
      // clear the stale entry and fall through, so the caller lazily re-creates a
      // real, DB-backed session.
      const memorySession = ActiveSessionStore.get(connectionId);
      if (memorySession) {
        const stillExists = await SessionRepo.exists(memorySession);
        if (stillExists) {
          return memorySession;
        }
        logger.warn(
          `⚠️  Active session ${memorySession.substring(0, 8)}... is cached in memory but ` +
          `missing from the database${connectionId ? ` (connection: ${connectionId})` : ''}; ` +
          `clearing stale entry so a fresh session is created.`
        );
        ActiveSessionStore.clear(connectionId);
        // fall through — treat as a miss
      }

      // Global "last active anywhere" lookup ONLY when a caller explicitly opts in.
      // This is intentionally NOT gated on `!connectionId` anymore: a missing
      // connectionId no longer implies "go find some other session".
      if (opts.allowGlobalFallback) {
        const dbSession = await SessionRepo.getLastActive();
        if (dbSession) {
          // Cache under the (possibly default) key for this read-only caller only.
          ActiveSessionStore.set(dbSession, connectionId);
          return dbSession;
        }
      }

      return null;

    } catch (error) {
      logger.error('❌ Failed to get active session', error as Error);
      return null;
    }
  },

  /**
   * Clear active session from memory for a connection
   * @param connectionId - Optional connection identifier for isolation
   */
  clearActiveSession(connectionId?: string): void {
    const currentId = ActiveSessionStore.get(connectionId);
    if (currentId) {
      logger.info(`🧹 Clearing active session: ${currentId.substring(0, 8)}...${connectionId ? ` (connection: ${connectionId})` : ''}`);
      ActiveSessionStore.clear(connectionId);
    }
  },

  /**
   * Set active session explicitly for a connection
   * @param connectionId - Optional connection identifier for isolation
   */
  setActiveSession(sessionId: string | null, connectionId?: string): void {
    if (sessionId) {
      logger.info(`📌 Setting active session: ${sessionId.substring(0, 8)}...${connectionId ? ` (connection: ${connectionId})` : ''}`);
    } else {
      logger.info(`🧹 Clearing active session explicitly${connectionId ? ` (connection: ${connectionId})` : ''}`);
    }
    ActiveSessionStore.set(sessionId, connectionId);
  },

  /**
   * Update session activity timestamp
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    await SessionRepo.touchActivity(sessionId);
  }
};
