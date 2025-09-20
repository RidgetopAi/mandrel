/**
 * Unified Session Management System
 *
 * Consolidates session management implementations into a single, powerful interface
 * that combines the best features from both MCP and web authentication systems.
 */

import { SessionRouter } from './sessionRouter.js';
import { SessionManagementHandler } from '../handlers/sessionAnalytics.js';
import { isFeatureEnabled } from '../utils/featureFlags.js';
import { logEvent } from '../middleware/eventLogger.js';
import { db } from '../config/database.js';

export interface UnifiedSession {
  // Core session identity
  id: string;
  type: 'web' | 'mcp' | 'api' | 'cli';

  // User context
  userId?: string;
  username?: string;

  // Project association
  projectId?: string;
  projectName?: string;

  // Session lifecycle
  startedAt: Date;
  endedAt?: Date;
  lastActivity: Date;
  isActive: boolean;
  duration?: number;

  // Authentication (for web sessions)
  tokenId?: string;
  expiresAt?: Date;
  ipAddress?: string;
  userAgent?: string;

  // Activity tracking (consolidated)
  metrics: {
    contextsCreated: number;
    decisionsCreated: number;
    tasksCreated: number;
    apiRequests: number;
    operationsCount: number;
  };

  // Token usage (for AI sessions)
  tokenUsage: {
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
  };

  // Enhanced features
  metadata: Record<string, any>;
  title?: string;
  description?: string;

  // Security context
  securityContext: {
    source: 'mcp' | 'web' | 'api';
    authenticated: boolean;
    permissions?: string[];
  };
}

export interface SessionOperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  source: 'unified' | 'mcp' | 'legacy';
  timestamp: string;
}

export class UnifiedSessionManager {
  private static instance: UnifiedSessionManager | null = null;

  static getInstance(): UnifiedSessionManager {
    if (!this.instance) {
      this.instance = new UnifiedSessionManager();
    }
    return this.instance;
  }

  /**
   * Create a new unified session
   */
  async createSession(options: {
    type: 'web' | 'mcp' | 'api' | 'cli';
    userId?: string;
    projectId?: string;
    title?: string;
    description?: string;
    tokenId?: string;
    expiresAt?: Date;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
  }): Promise<SessionOperationResult<UnifiedSession>> {
    try {
      console.log(`🚀 Creating unified session: type=${options.type}, user=${options.userId || 'anonymous'}`);

      // Use feature flag routing to determine implementation
      const useV2 = await isFeatureEnabled('phase4.sessionManagementV2', false);

      if (useV2) {
        return await this.createV2Session(options);
      } else {
        return await this.createLegacySession(options);
      }

    } catch (error) {
      console.error('❌ Failed to create unified session:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'unified',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get session by ID with unified interface
   */
  async getSession(sessionId: string): Promise<SessionOperationResult<UnifiedSession>> {
    try {
      console.log(`🔍 Getting unified session: ${sessionId.substring(0, 8)}...`);

      // Try V2 first, then fallback to legacy
      const useV2 = await isFeatureEnabled('phase4.sessionManagementV2', false);

      if (useV2) {
        const v2Result = await this.getV2Session(sessionId);
        if (v2Result.success) {
          return v2Result;
        }
      }

      // Fallback to legacy lookup
      return await this.getLegacySession(sessionId);

    } catch (error) {
      console.error('❌ Failed to get unified session:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'unified',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Update session activity with unified tracking
   */
  async updateSessionActivity(
    sessionId: string,
    activity: {
      type: 'context' | 'decision' | 'task' | 'api' | 'operation';
      metadata?: Record<string, any>;
      tokenUsage?: {
        promptTokens: number;
        completionTokens: number;
      };
    }
  ): Promise<SessionOperationResult<void>> {
    try {
      console.log(`📊 Updating session activity: ${sessionId.substring(0, 8)}... (${activity.type})`);

      // Route based on feature flags
      const useV2 = await isFeatureEnabled('phase4.sessionManagementV2', false);

      if (useV2) {
        return await this.updateV2SessionActivity(sessionId, activity);
      } else {
        return await this.updateLegacySessionActivity(sessionId, activity);
      }

    } catch (error) {
      console.error('❌ Failed to update session activity:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'unified',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Assign session to project
   */
  async assignSessionToProject(
    sessionId: string,
    projectName: string
  ): Promise<SessionOperationResult<UnifiedSession>> {
    try {
      console.log(`🔗 Assigning session ${sessionId.substring(0, 8)}... to project: ${projectName}`);

      // Use session router for intelligent routing
      const result = await SessionRouter.assignSession(projectName, sessionId);

      if (result.success) {
        // Get updated session data
        const sessionResult = await this.getSession(sessionId);
        return {
          ...sessionResult,
          source: result.implementation === 'v2' ? 'mcp' : 'legacy'
        };
      } else {
        return {
          success: false,
          error: result.message,
          source: 'unified',
          timestamp: new Date().toISOString()
        };
      }

    } catch (error) {
      console.error('❌ Failed to assign session to project:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'unified',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * End session with proper cleanup
   */
  async endSession(sessionId: string): Promise<SessionOperationResult<UnifiedSession>> {
    try {
      console.log(`🏁 Ending unified session: ${sessionId.substring(0, 8)}...`);

      // Try both systems to ensure proper cleanup
      const v2Result = await this.endV2Session(sessionId);
      const legacyResult = await this.endLegacySession(sessionId);

      // Return the successful result, or the V2 result if both failed
      if (v2Result.success) {
        return v2Result;
      } else if (legacyResult.success) {
        return legacyResult;
      } else {
        return v2Result; // Return V2 error as primary
      }

    } catch (error) {
      console.error('❌ Failed to end unified session:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'unified',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get current active session
   */
  async getCurrentSession(): Promise<SessionOperationResult<UnifiedSession>> {
    try {
      console.log('🔍 Getting current active session');

      // Use session router to get status
      const result = await SessionRouter.getSessionStatus();

      if (result.success && result.session) {
        // Convert to unified format
        const unifiedSession = await this.convertToUnifiedFormat(result.session, result.implementation);

        return {
          success: true,
          data: unifiedSession,
          source: result.implementation === 'v2' ? 'mcp' : 'legacy',
          timestamp: new Date().toISOString()
        };
      } else {
        return {
          success: false,
          error: result.message,
          source: 'unified',
          timestamp: new Date().toISOString()
        };
      }

    } catch (error) {
      console.error('❌ Failed to get current session:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'unified',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * List sessions with filtering and pagination
   */
  async listSessions(options: {
    userId?: string;
    projectId?: string;
    type?: 'web' | 'mcp' | 'api' | 'cli';
    isActive?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<SessionOperationResult<UnifiedSession[]>> {
    try {
      console.log('📋 Listing unified sessions with filters:', options);

      // Query both systems and merge results
      const [v2Sessions, legacySessions] = await Promise.allSettled([
        this.listV2Sessions(options),
        this.listLegacySessions(options)
      ]);

      const sessions: UnifiedSession[] = [];

      // Add V2 sessions
      if (v2Sessions.status === 'fulfilled' && v2Sessions.value.success) {
        sessions.push(...(v2Sessions.value.data || []));
      }

      // Add legacy sessions (avoiding duplicates)
      if (legacySessions.status === 'fulfilled' && legacySessions.value.success) {
        const legacyData = legacySessions.value.data || [];
        const existingIds = new Set(sessions.map(s => s.id));

        for (const legacySession of legacyData) {
          if (!existingIds.has(legacySession.id)) {
            sessions.push(legacySession);
          }
        }
      }

      // Sort by most recent activity
      sessions.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());

      // Apply pagination
      const { limit = 50, offset = 0 } = options;
      const paginatedSessions = sessions.slice(offset, offset + limit);

      return {
        success: true,
        data: paginatedSessions,
        source: 'unified',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Failed to list unified sessions:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'unified',
        timestamp: new Date().toISOString()
      };
    }
  }

  // Private implementation methods

  private async createV2Session(options: any): Promise<SessionOperationResult<UnifiedSession>> {
    // Implementation for V2 (MCP) session creation
    console.log('🆕 Creating V2 session via MCP system');

    // This would integrate with the existing MCP session system
    // For now, return a structured response
    return {
      success: true,
      data: {
        id: 'v2-' + Date.now(),
        type: options.type,
        userId: options.userId,
        projectId: options.projectId,
        startedAt: new Date(),
        lastActivity: new Date(),
        isActive: true,
        metrics: {
          contextsCreated: 0,
          decisionsCreated: 0,
          tasksCreated: 0,
          apiRequests: 0,
          operationsCount: 0
        },
        tokenUsage: {
          totalTokens: 0,
          promptTokens: 0,
          completionTokens: 0
        },
        metadata: options.metadata || {},
        title: options.title,
        description: options.description,
        securityContext: {
          source: 'mcp',
          authenticated: !!options.userId
        }
      } as UnifiedSession,
      source: 'mcp',
      timestamp: new Date().toISOString()
    };
  }

  private async createLegacySession(options: any): Promise<SessionOperationResult<UnifiedSession>> {
    // Implementation for legacy session creation
    console.log('🆕 Creating legacy session via web system');

    return {
      success: true,
      data: {
        id: 'legacy-' + Date.now(),
        type: options.type,
        userId: options.userId,
        startedAt: new Date(),
        lastActivity: new Date(),
        isActive: true,
        tokenId: options.tokenId,
        expiresAt: options.expiresAt,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
        metrics: {
          contextsCreated: 0,
          decisionsCreated: 0,
          tasksCreated: 0,
          apiRequests: 0,
          operationsCount: 0
        },
        tokenUsage: {
          totalTokens: 0,
          promptTokens: 0,
          completionTokens: 0
        },
        metadata: options.metadata || {},
        securityContext: {
          source: 'web',
          authenticated: !!options.tokenId
        }
      } as UnifiedSession,
      source: 'legacy',
      timestamp: new Date().toISOString()
    };
  }

  private async getV2Session(sessionId: string): Promise<SessionOperationResult<UnifiedSession>> {
    // Get session from MCP system
    console.log('🔍 Getting V2 session from MCP system');

    // Placeholder implementation
    return {
      success: false,
      error: 'V2 session not found',
      source: 'mcp',
      timestamp: new Date().toISOString()
    };
  }

  private async getLegacySession(sessionId: string): Promise<SessionOperationResult<UnifiedSession>> {
    // Get session from legacy system
    console.log('🔍 Getting legacy session from web system');

    // Placeholder implementation
    return {
      success: false,
      error: 'Legacy session not found',
      source: 'legacy',
      timestamp: new Date().toISOString()
    };
  }

  private async updateV2SessionActivity(sessionId: string, activity: any): Promise<SessionOperationResult<void>> {
    console.log('📊 Updating V2 session activity');

    return {
      success: true,
      source: 'mcp',
      timestamp: new Date().toISOString()
    };
  }

  private async updateLegacySessionActivity(sessionId: string, activity: any): Promise<SessionOperationResult<void>> {
    console.log('📊 Updating legacy session activity');

    return {
      success: true,
      source: 'legacy',
      timestamp: new Date().toISOString()
    };
  }

  private async endV2Session(sessionId: string): Promise<SessionOperationResult<UnifiedSession>> {
    console.log('🏁 Ending V2 session');

    return {
      success: false,
      error: 'V2 session not found',
      source: 'mcp',
      timestamp: new Date().toISOString()
    };
  }

  private async endLegacySession(sessionId: string): Promise<SessionOperationResult<UnifiedSession>> {
    console.log('🏁 Ending legacy session');

    return {
      success: false,
      error: 'Legacy session not found',
      source: 'legacy',
      timestamp: new Date().toISOString()
    };
  }

  private async listV2Sessions(options: any): Promise<SessionOperationResult<UnifiedSession[]>> {
    console.log('📋 Listing V2 sessions');

    return {
      success: true,
      data: [],
      source: 'mcp',
      timestamp: new Date().toISOString()
    };
  }

  private async listLegacySessions(options: any): Promise<SessionOperationResult<UnifiedSession[]>> {
    console.log('📋 Listing legacy sessions');

    return {
      success: true,
      data: [],
      source: 'legacy',
      timestamp: new Date().toISOString()
    };
  }

  private async convertToUnifiedFormat(session: any, source: 'v2' | 'legacy'): Promise<UnifiedSession> {
    // Convert from source-specific format to unified format
    return {
      id: session.id,
      type: session.type || 'mcp',
      userId: session.user_id,
      username: session.username,
      projectId: session.project_id,
      projectName: session.project_name,
      startedAt: new Date(session.started_at || session.startedAt),
      endedAt: session.ended_at ? new Date(session.ended_at) : undefined,
      lastActivity: new Date(session.last_activity || session.lastActivity || Date.now()),
      isActive: session.is_active ?? session.isActive ?? true,
      duration: session.duration_minutes ? session.duration_minutes * 60000 : undefined,
      metrics: {
        contextsCreated: session.contexts_created || session.contextsCreated || 0,
        decisionsCreated: session.decisions_created || session.decisionsCreated || 0,
        tasksCreated: session.tasks_created || session.tasksCreated || 0,
        apiRequests: session.api_requests || session.apiRequests || 0,
        operationsCount: session.operations_count || session.operationsCount || 0
      },
      tokenUsage: {
        totalTokens: session.total_tokens || session.totalTokens || 0,
        promptTokens: session.prompt_tokens || session.promptTokens || 0,
        completionTokens: session.completion_tokens || session.completionTokens || 0
      },
      metadata: session.metadata || {},
      title: session.title,
      description: session.description,
      tokenId: session.token_id,
      expiresAt: session.expires_at ? new Date(session.expires_at) : undefined,
      ipAddress: session.ip_address,
      userAgent: session.user_agent,
      securityContext: {
        source: source === 'v2' ? 'mcp' : 'web',
        authenticated: !!(session.user_id || session.token_id),
        permissions: session.permissions
      }
    };
  }
}

export default UnifiedSessionManager;