/**
 * SessionTracker - Façade for session management
 * 
 * Maintains backward compatibility with the original API.
 * Delegates to domain services internally.
 */

import { SessionLifecycleService } from './domain/lifecycle/index.js';
import { TokenTracker, OperationTracker } from './domain/tracking/index.js';
import { SessionStatsService } from './domain/stats/index.js';
import { SessionRepo, ActivityRepo, FileRepo } from './infra/db/index.js';
import { GitFileSync } from './infra/git/index.js';
import type { SessionData, SessionStats, SessionActivity, SessionFile } from './types.js';

// Re-export types for backward compatibility
export type { SessionData, SessionStats, SessionActivity, SessionFile } from './types.js';
export type { ProductivityConfig } from '../../types/session.js';

/**
 * Main SessionTracker Service Class
 * Façade pattern - delegates to domain services while maintaining original API
 */
export class SessionTracker {
  /**
   * Start a new session with smart project inheritance
   */
  static async startSession(
    projectId?: string,
    title?: string,
    description?: string,
    sessionGoal?: string,
    tags?: string[],
    aiModel?: string,
    sessionType?: 'mcp-server' | 'AI Model'
  ): Promise<string> {
    return SessionLifecycleService.startSession({
      projectId,
      title,
      description,
      sessionGoal,
      tags,
      aiModel,
      sessionType
    });
  }

  /**
   * End an active session and calculate final metrics
   */
  static async endSession(sessionId: string): Promise<SessionData> {
    return SessionLifecycleService.endSession(sessionId);
  }

  /**
   * Get currently active session ID
   */
  static async getActiveSession(): Promise<string | null> {
    return SessionLifecycleService.getActiveSession();
  }

  /**
   * Clear active session from memory
   */
  static clearActiveSession(): void {
    SessionLifecycleService.clearActiveSession();
  }

  /**
   * Set active session explicitly
   */
  static setActiveSession(sessionId: string | null): void {
    SessionLifecycleService.setActiveSession(sessionId);
  }

  /**
   * Update session activity timestamp
   */
  static async updateSessionActivity(sessionId: string): Promise<void> {
    await SessionRepo.touchActivity(sessionId);
  }

  /**
   * Record an operation within a session
   */
  static async recordOperation(sessionId: string, operationType: string): Promise<void> {
    await OperationTracker.recordOperation(sessionId, operationType);
  }

  /**
   * Record token usage for a session
   */
  static recordTokenUsage(sessionId: string, inputTokens: number, outputTokens: number): void {
    TokenTracker.record(sessionId, inputTokens, outputTokens);
  }

  /**
   * Get token usage for a session
   */
  static getTokenUsage(sessionId: string): { input: number; output: number; total: number } {
    return TokenTracker.get(sessionId);
  }

  /**
   * Record task created
   */
  static recordTaskCreated(sessionId: string): void {
    OperationTracker.recordTaskCreated(sessionId);
  }

  /**
   * Record task updated
   */
  static recordTaskUpdated(sessionId: string, isCompleted: boolean = false): void {
    OperationTracker.recordTaskUpdated(sessionId, isCompleted);
  }

  /**
   * Record context created
   */
  static recordContextCreated(sessionId: string): void {
    OperationTracker.recordContextCreated(sessionId);
  }

  /**
   * Get activity counts for a session
   */
  static getActivityCounts(sessionId: string): {
    tasks_created: number;
    tasks_updated: number;
    tasks_completed: number;
    contexts_created: number;
  } {
    return OperationTracker.getActivityCounts(sessionId);
  }

  /**
   * Calculate productivity
   */
  static async calculateProductivity(sessionId: string): Promise<number> {
    return SessionStatsService.calculateProductivity(sessionId);
  }

  /**
   * Get comprehensive session data with metrics
   */
  static async getSessionData(sessionId: string): Promise<SessionData | null> {
    const data = await SessionRepo.getSessionData(sessionId);
    if (!data) return null;

    // Merge in-memory counts for active sessions
    const tokenUsage = TokenTracker.get(sessionId);
    const activityCounts = OperationTracker.getActivityCounts(sessionId);
    const decisionsCount = await SessionRepo.countDecisions(sessionId);

    return {
      ...data,
      decisions_created: decisionsCount,
      contexts_created: activityCounts.contexts_created || data.contexts_created,
      input_tokens: tokenUsage.input || data.input_tokens,
      output_tokens: tokenUsage.output || data.output_tokens,
      total_tokens: tokenUsage.total || data.total_tokens
    };
  }

  /**
   * Record activity event
   */
  static async recordActivity(
    sessionId: string,
    activityType: string,
    activityData: Record<string, any> = {}
  ): Promise<void> {
    await OperationTracker.recordActivity(sessionId, activityType, activityData);
  }

  /**
   * Get session activities
   */
  static async getSessionActivities(
    sessionId: string,
    activityType?: string,
    limit: number = 100
  ): Promise<SessionActivity[]> {
    return ActivityRepo.listBySession(sessionId, activityType, limit);
  }

  /**
   * Record file modification
   */
  static async recordFileModification(
    sessionId: string,
    filePath: string,
    linesAdded: number,
    linesDeleted: number,
    source: 'tool' | 'git' | 'manual' = 'tool'
  ): Promise<void> {
    await FileRepo.upsert(sessionId, filePath, linesAdded, linesDeleted, source);
    await SessionRepo.updateFileMetrics(sessionId);
  }

  /**
   * Get session files
   */
  static async getSessionFiles(sessionId: string): Promise<SessionFile[]> {
    return FileRepo.listBySession(sessionId);
  }

  /**
   * Calculate productivity score using configurable formula
   */
  static async calculateProductivityScore(
    sessionId: string,
    configName: string = 'default'
  ): Promise<number> {
    return SessionStatsService.calculateProductivityScore(sessionId, configName);
  }

  /**
   * Resolve project for new session
   */
  static async resolveProjectForSession(sessionId: string = 'default-session'): Promise<string | null> {
    const { resolveProjectForSession } = await import('./domain/lifecycle/projectResolution.js');
    return resolveProjectForSession(sessionId);
  }

  /**
   * Update session details
   */
  static async updateSessionDetails(
    sessionId: string,
    title?: string,
    description?: string,
    sessionGoal?: string,
    tags?: string[]
  ): Promise<boolean> {
    const result = await SessionRepo.updateDetails(sessionId, title, description, sessionGoal, tags);
    if (result) {
      console.log(`✅ Session details updated`);
    } else {
      console.log(`⚠️  Session ${sessionId} not found`);
    }
    return result;
  }

  /**
   * Get session with details
   */
  static async getSessionWithDetails(sessionId: string): Promise<{
    id: string;
    title?: string;
    description?: string;
    project_id?: string;
    started_at: Date;
    ended_at?: Date;
  } | null> {
    return SessionRepo.getWithDetails(sessionId);
  }

  /**
   * Get session statistics
   */
  static async getSessionStats(projectId?: string): Promise<SessionStats> {
    return SessionStatsService.getSessionStats(projectId);
  }

  /**
   * Generate session summary
   */
  static async generateSessionSummary(sessionId: string): Promise<string> {
    return SessionStatsService.generateSessionSummary(sessionId);
  }

  /**
   * Flush in-memory token usage to database
   */
  static async flushTokensToDatabase(): Promise<void> {
    await TokenTracker.flushToDatabase();
  }

  /**
   * Flush in-memory activity counts to database
   */
  static async flushActivityToDatabase(): Promise<void> {
    await OperationTracker.flushToDatabase();
  }

  /**
   * Sync file changes from git
   */
  static async syncFilesFromGit(sessionId: string): Promise<{
    filesProcessed: number;
    totalLinesAdded: number;
    totalLinesDeleted: number;
    error?: string;
  }> {
    return GitFileSync.syncFilesFromGit(sessionId);
  }

  /**
   * Get enhanced session statistics with grouping
   */
  static async getSessionStatsEnhanced(options: {
    projectId?: string;
    period?: 'day' | 'week' | 'month' | 'all';
    groupBy?: 'project' | 'agent' | 'tag' | 'none';
    phase2Only?: boolean;
  } = {}): Promise<any> {
    return SessionStatsService.getSessionStatsEnhanced(options);
  }
}

/**
 * Utility functions for session management
 */

/**
 * Auto-start session if none exists
 */
export async function ensureActiveSession(
  projectId?: string,
  title?: string,
  description?: string,
  sessionGoal?: string,
  tags?: string[],
  aiModel?: string
): Promise<string> {
  let sessionId = await SessionTracker.getActiveSession();

  if (!sessionId) {
    sessionId = await SessionTracker.startSession(projectId, title, description, sessionGoal, tags, aiModel);
  }

  return sessionId;
}

/**
 * Record operation and ensure session exists
 */
export async function recordSessionOperation(operationType: string, projectId?: string): Promise<void> {
  const sessionId = await ensureActiveSession(projectId);
  await SessionTracker.recordOperation(sessionId, operationType);
}

/**
 * Get current session ID
 */
export async function getCurrentSession(): Promise<string | null> {
  return SessionTracker.getActiveSession();
}
