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

      console.log(`🚀 Starting session: ${sessionId.substring(0, 8)}... for project: ${resolvedProjectId || 'none'}`);

      // Capture git information
      const gitInfo = await GitFileSync.captureHeadInfo();
      if (gitInfo.branch) console.log(`🌿 Git branch: ${gitInfo.branch}`);
      if (gitInfo.commitSha) console.log(`📌 Git commit: ${gitInfo.commitSha.substring(0, 8)}...`);

      // Determine session type
      const finalSessionType = options.sessionType || 'AI Model';
      console.log(`📋 Session type: ${finalSessionType}${options.aiModel ? ` (${options.aiModel})` : ''}`);

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

      console.log(`✅ Session started: ${sessionId.substring(0, 8)}...${options.connectionId ? ` (connection: ${options.connectionId})` : ''}`);
      return sessionId;

    } catch (error) {
      console.error('❌ Failed to start session:', error);
      throw error;
    }
  },

  /**
   * End an active session and calculate final metrics
   */
  async endSession(sessionId: string): Promise<SessionData> {
    try {
      const endTime = new Date();
      console.log(`🏁 Ending session: ${sessionId.substring(0, 8)}...`);

      // Sync file changes from git
      console.log(`📁 Syncing file changes from git...`);
      try {
        const fileSync = await GitFileSync.syncFilesFromGit(sessionId);
        console.log(`✅ File sync complete: ${fileSync.filesProcessed} files, +${fileSync.totalLinesAdded}/-${fileSync.totalLinesDeleted} lines`);
      } catch (error) {
        console.warn('⚠️  Failed to sync files from git:', error);
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
      });

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

      console.log(`✅ Session ended: ${sessionId.substring(0, 8)}... Duration: ${Math.round(durationMs / 1000)}s`);
      return finalData;

    } catch (error) {
      console.error('❌ Failed to end session:', error);
      throw error;
    }
  },

  /**
   * Get currently active session ID for a connection
   * @param connectionId - Optional connection identifier for isolation
   */
  async getActiveSession(connectionId?: string): Promise<string | null> {
    try {
      // Check in-memory first
      const memorySession = ActiveSessionStore.get(connectionId);
      if (memorySession) {
        return memorySession;
      }

      // Fall back to database only for default connection (backwards compatibility)
      if (!connectionId) {
        const dbSession = await SessionRepo.getLastActive();
        if (dbSession) {
          ActiveSessionStore.set(dbSession, connectionId);
          return dbSession;
        }
      }

      return null;

    } catch (error) {
      console.error('❌ Failed to get active session:', error);
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
      console.log(`🧹 Clearing active session: ${currentId.substring(0, 8)}...${connectionId ? ` (connection: ${connectionId})` : ''}`);
      ActiveSessionStore.clear(connectionId);
    }
  },

  /**
   * Set active session explicitly for a connection
   * @param connectionId - Optional connection identifier for isolation
   */
  setActiveSession(sessionId: string | null, connectionId?: string): void {
    if (sessionId) {
      console.log(`📌 Setting active session: ${sessionId.substring(0, 8)}...${connectionId ? ` (connection: ${connectionId})` : ''}`);
    } else {
      console.log(`🧹 Clearing active session explicitly${connectionId ? ` (connection: ${connectionId})` : ''}`);
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
