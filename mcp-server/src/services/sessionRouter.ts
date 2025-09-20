/**
 * Session Management Traffic Router
 *
 * Implements feature flag-controlled routing between legacy and new session management
 * implementations with percentage-based traffic splitting and monitoring.
 */

import { isFeatureEnabled } from '../utils/featureFlags.js';
import { SessionManagementHandler, SessionAnalyticsHandler } from '../handlers/sessionAnalytics.js';
import { logEvent } from '../middleware/eventLogger.js';

export interface SessionRouterConfig {
  enableV2: boolean;
  fallbackToLegacy: boolean;
  trafficPercentage: number;
  rolloutGroups: string[];
}

export interface SessionRouterMetrics {
  totalRequests: number;
  v2Requests: number;
  legacyRequests: number;
  failoverCount: number;
  errorRate: number;
  averageLatency: number;
}

export class SessionRouter {
  private static metrics: SessionRouterMetrics = {
    totalRequests: 0,
    v2Requests: 0,
    legacyRequests: 0,
    failoverCount: 0,
    errorRate: 0,
    averageLatency: 0
  };

  /**
   * Determine which session implementation to use based on feature flags
   */
  static async getSessionStrategy(userId?: string, sessionId?: string): Promise<{
    useV2: boolean;
    reason: string;
    fallbackAvailable: boolean;
  }> {
    try {
      // Get feature flag configuration
      const enableV2 = await isFeatureEnabled('phase4.sessionManagementV2', false);
      const fallbackEnabled = await isFeatureEnabled('phase4.legacySessionFallback', true);
      const trafficSplit = await isFeatureEnabled('phase4.sessionTrafficSplit', 0);

      // If V2 is disabled globally, use legacy
      if (!enableV2) {
        return {
          useV2: false,
          reason: 'V2 globally disabled',
          fallbackAvailable: true
        };
      }

      // Implement percentage-based traffic splitting
      const userHash = this.hashUserId(userId || sessionId || 'anonymous');
      const userPercentage = userHash % 100;
      const shouldUseV2 = userPercentage < trafficSplit;

      if (!shouldUseV2) {
        return {
          useV2: false,
          reason: `Traffic split: ${userPercentage}% >= ${trafficSplit}%`,
          fallbackAvailable: true
        };
      }

      return {
        useV2: true,
        reason: `Traffic split: ${userPercentage}% < ${trafficSplit}%`,
        fallbackAvailable: fallbackEnabled
      };

    } catch (error) {
      console.error('❌ Session router configuration error:', error);

      // Fail safe to legacy implementation
      return {
        useV2: false,
        reason: 'Configuration error - defaulting to legacy',
        fallbackAvailable: true
      };
    }
  }

  /**
   * Route session assignment request with monitoring
   */
  static async assignSession(projectName: string, userId?: string): Promise<{
    success: boolean;
    sessionId?: string;
    projectName?: string;
    message: string;
    implementation: 'v2' | 'legacy';
    metrics?: any;
  }> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      const strategy = await this.getSessionStrategy(userId);

      // Log routing decision
      await logEvent({
        actor: 'ai',
        event_type: 'session_router_decision',
        status: 'open',
        metadata: {
          strategy: strategy.useV2 ? 'v2' : 'legacy',
          reason: strategy.reason,
          fallback_available: strategy.fallbackAvailable,
          user_id: userId
        },
        tags: ['session-router', 'traffic-split', strategy.useV2 ? 'v2' : 'legacy']
      });

      let result;
      let implementation: 'v2' | 'legacy' = 'legacy';

      if (strategy.useV2) {
        try {
          // Use new MCP session management
          result = await SessionManagementHandler.assignSessionToProject(projectName);
          implementation = 'v2';
          this.metrics.v2Requests++;

        } catch (v2Error) {
          console.warn('⚠️  V2 session assignment failed, falling back to legacy:', v2Error);

          if (strategy.fallbackAvailable) {
            // Fallback to legacy implementation
            result = await this.legacySessionAssignment(projectName, userId);
            implementation = 'legacy';
            this.metrics.failoverCount++;
            this.metrics.legacyRequests++;

            // Log failover event
            await logEvent({
              actor: 'ai',
              event_type: 'session_router_failover',
              status: 'closed',
              metadata: {
                error: v2Error instanceof Error ? v2Error.message : 'Unknown error',
                fallback_successful: result.success
              },
              tags: ['session-router', 'failover', 'v2-to-legacy']
            });
          } else {
            throw v2Error;
          }
        }
      } else {
        // Use legacy implementation
        result = await this.legacySessionAssignment(projectName, userId);
        this.metrics.legacyRequests++;
      }

      const duration = Date.now() - startTime;
      this.updateLatencyMetrics(duration);

      // Log successful routing
      await logEvent({
        actor: 'ai',
        event_type: 'session_router_success',
        status: 'closed',
        duration_ms: duration,
        metadata: {
          implementation,
          project_name: projectName,
          session_id: result.sessionId,
          routing_reason: strategy.reason
        },
        tags: ['session-router', 'success', implementation]
      });

      return {
        ...result,
        implementation,
        metrics: this.getMetrics()
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateErrorMetrics();

      console.error('❌ Session router assignment failed:', error);

      // Log error
      await logEvent({
        actor: 'ai',
        event_type: 'session_router_error',
        status: 'error',
        duration_ms: duration,
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          project_name: projectName,
          user_id: userId
        },
        tags: ['session-router', 'error']
      });

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Session routing failed',
        implementation: 'legacy'
      };
    }
  }

  /**
   * Route session status request
   */
  static async getSessionStatus(userId?: string): Promise<{
    success: boolean;
    session?: any;
    message: string;
    implementation: 'v2' | 'legacy';
  }> {
    const startTime = Date.now();

    try {
      const strategy = await this.getSessionStrategy(userId);
      let result;
      let implementation: 'v2' | 'legacy' = 'legacy';

      if (strategy.useV2) {
        try {
          result = await SessionManagementHandler.getSessionStatus();
          implementation = 'v2';
        } catch (v2Error) {
          if (strategy.fallbackAvailable) {
            result = await this.legacySessionStatus(userId);
            implementation = 'legacy';
            this.metrics.failoverCount++;
          } else {
            throw v2Error;
          }
        }
      } else {
        result = await this.legacySessionStatus(userId);
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Session status retrieved via ${implementation} in ${duration}ms`);

      return {
        ...result,
        implementation
      };

    } catch (error) {
      console.error('❌ Session router status failed:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Session status routing failed',
        implementation: 'legacy'
      };
    }
  }

  /**
   * Legacy session assignment (placeholder for existing implementation)
   */
  private static async legacySessionAssignment(projectName: string, userId?: string): Promise<{
    success: boolean;
    sessionId?: string;
    projectName?: string;
    message: string;
  }> {
    // This would call the existing session assignment logic
    console.log(`🔄 Using legacy session assignment for project: ${projectName}`);

    return {
      success: true,
      sessionId: 'legacy-session-' + Date.now(),
      projectName,
      message: `✅ Legacy session assigned to project '${projectName}'`
    };
  }

  /**
   * Legacy session status (placeholder for existing implementation)
   */
  private static async legacySessionStatus(userId?: string): Promise<{
    success: boolean;
    session?: any;
    message: string;
  }> {
    console.log('🔄 Using legacy session status');

    return {
      success: true,
      session: {
        id: 'legacy-session',
        type: 'legacy',
        project_name: 'Legacy Project'
      },
      message: 'Legacy session status retrieved'
    };
  }

  /**
   * Hash user ID for consistent traffic splitting
   */
  private static hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Update latency metrics
   */
  private static updateLatencyMetrics(duration: number): void {
    this.metrics.averageLatency = (
      (this.metrics.averageLatency * (this.metrics.totalRequests - 1)) + duration
    ) / this.metrics.totalRequests;
  }

  /**
   * Update error metrics
   */
  private static updateErrorMetrics(): void {
    const totalErrors = (this.metrics.errorRate * this.metrics.totalRequests) + 1;
    this.metrics.errorRate = totalErrors / this.metrics.totalRequests;
  }

  /**
   * Get current routing metrics
   */
  static getMetrics(): SessionRouterMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics (for testing)
   */
  static resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      v2Requests: 0,
      legacyRequests: 0,
      failoverCount: 0,
      errorRate: 0,
      averageLatency: 0
    };
  }

  /**
   * Health check for session routing
   */
  static async healthCheck(): Promise<{
    healthy: boolean;
    metrics: SessionRouterMetrics;
    configuration: SessionRouterConfig;
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      const configuration: SessionRouterConfig = {
        enableV2: await isFeatureEnabled('phase4.sessionManagementV2', false),
        fallbackToLegacy: await isFeatureEnabled('phase4.legacySessionFallback', true),
        trafficPercentage: await isFeatureEnabled('phase4.sessionTrafficSplit', 0),
        rolloutGroups: [] // Would be loaded from config
      };

      // Check for potential issues
      if (configuration.enableV2 && !configuration.fallbackToLegacy) {
        issues.push('V2 enabled without fallback - risky configuration');
      }

      if (configuration.trafficPercentage > 50 && this.metrics.errorRate > 0.05) {
        issues.push('High traffic split with elevated error rate');
      }

      if (this.metrics.failoverCount > (this.metrics.totalRequests * 0.1)) {
        issues.push('High failover rate indicates V2 instability');
      }

      return {
        healthy: issues.length === 0,
        metrics: this.getMetrics(),
        configuration,
        issues
      };

    } catch (error) {
      return {
        healthy: false,
        metrics: this.getMetrics(),
        configuration: {} as SessionRouterConfig,
        issues: [`Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }
}

export default SessionRouter;