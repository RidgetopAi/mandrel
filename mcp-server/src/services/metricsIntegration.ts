/**
 * TC014: Development Metrics Integration Service
 * 
 * Provides real-time integration between metrics collection and other AIDIS services:
 * - Git commit triggered metrics collection
 * - Pattern detection triggered metrics updates  
 * - Session event triggered productivity metrics
 * - Alerting and notification system
 * 
 * Performance Target: Sub-100ms integration response times
 */

import { db } from '../config/database.js';
import { logEvent } from '../middleware/eventLogger.js';
import { 
  collectMetricsOnCommit,
  collectMetricsOnPatternUpdate,
  MetricsCollectionResult 
} from './metricsCollector.js';
import { PatternDetectionResult } from './patternDetector.js';

// Integration Configuration
export interface MetricsIntegrationConfig {
  // Git integration
  enableGitTriggers: boolean;
  gitTriggerDelayMs: number; // Delay after git commit before metrics collection
  
  // Pattern integration
  enablePatternTriggers: boolean;
  patternTriggerDelayMs: number; // Delay after pattern update
  
  // Session integration
  enableSessionTriggers: boolean;
  sessionEndDelayMs: number; // Delay after session end
  
  // Alert integration
  enableAlertNotifications: boolean;
  alertThresholds: AlertThresholdConfig;
  
  // Performance settings
  maxConcurrentCollections: number;
  integrationTimeoutMs: number;
}

export interface AlertThresholdConfig {
  velocityDropThreshold: number; // % drop in velocity to trigger alert
  qualityDegradeThreshold: number; // % degradation in quality
  productivityDropThreshold: number; // % drop in productivity
  technicalDebtGrowthThreshold: number; // % growth in technical debt
  burnoutRiskThreshold: number; // Risk score threshold (0-1)
  criticalPatternThreshold: number; // Pattern confidence for critical alerts
}

const DEFAULT_CONFIG: MetricsIntegrationConfig = {
  enableGitTriggers: true,
  gitTriggerDelayMs: 5000, // 5 seconds after commit
  
  enablePatternTriggers: true,
  patternTriggerDelayMs: 3000, // 3 seconds after pattern update
  
  enableSessionTriggers: true,
  sessionEndDelayMs: 10000, // 10 seconds after session end
  
  enableAlertNotifications: true,
  alertThresholds: {
    velocityDropThreshold: 0.3, // 30% drop
    qualityDegradeThreshold: 0.2, // 20% degradation  
    productivityDropThreshold: 0.25, // 25% drop
    technicalDebtGrowthThreshold: 0.4, // 40% growth
    burnoutRiskThreshold: 0.7, // 70% risk score
    criticalPatternThreshold: 0.9 // 90% confidence
  },
  
  maxConcurrentCollections: 3,
  integrationTimeoutMs: 30000 // 30 seconds
};

/**
 * Development Metrics Integration Service
 */
export class MetricsIntegrationService {
  private static instance: MetricsIntegrationService | null = null;
  private config: MetricsIntegrationConfig;
  private isRunning: boolean = false;
  
  // Tracking active collections to prevent overload
  private activeCollections: Set<string> = new Set();
  private pendingTriggers: Map<string, NodeJS.Timeout> = new Map();
  
  // Integration metrics
  private integrationStats = {
    gitTriggersProcessed: 0,
    patternTriggersProcessed: 0,
    sessionTriggersProcessed: 0,
    alertsGenerated: 0,
    avgIntegrationTime: 0,
    lastIntegrationTime: new Date(),
    errors: 0
  };

  private constructor(config: Partial<MetricsIntegrationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<MetricsIntegrationConfig>): MetricsIntegrationService {
    if (!MetricsIntegrationService.instance) {
      MetricsIntegrationService.instance = new MetricsIntegrationService(config);
    }
    return MetricsIntegrationService.instance;
  }

  /**
   * Start integration service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚡ Metrics integration service already running');
      return;
    }

    try {
      console.log('🔗 Starting metrics integration service...');
      
      this.isRunning = true;

      // Log service start
      await logEvent({
        actor: 'system',
        event_type: 'metrics_integration_started',
        status: 'open',
        metadata: {
          gitTriggers: this.config.enableGitTriggers,
          patternTriggers: this.config.enablePatternTriggers,
          sessionTriggers: this.config.enableSessionTriggers,
          alertNotifications: this.config.enableAlertNotifications
        },
        tags: ['metrics', 'integration', 'service']
      });

      console.log('✅ Metrics integration service started successfully');

    } catch (error) {
      console.error('❌ Failed to start metrics integration:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop integration service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('⚡ Metrics integration service not running');
      return;
    }

    try {
      console.log('🛑 Stopping metrics integration service...');

      this.isRunning = false;

      // Cancel all pending triggers
      for (const [key, timeout] of this.pendingTriggers.entries()) {
        clearTimeout(timeout);
        this.pendingTriggers.delete(key);
      }

      // Wait for active collections to finish
      const maxWaitTime = 10000; // 10 seconds
      const startTime = Date.now();
      
      while (this.activeCollections.size > 0 && (Date.now() - startTime) < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Log service stop
      await logEvent({
        actor: 'system',
        event_type: 'metrics_integration_stopped',
        status: 'closed',
        metadata: {
          gitTriggersProcessed: this.integrationStats.gitTriggersProcessed,
          patternTriggersProcessed: this.integrationStats.patternTriggersProcessed,
          sessionTriggersProcessed: this.integrationStats.sessionTriggersProcessed,
          alertsGenerated: this.integrationStats.alertsGenerated,
          errors: this.integrationStats.errors
        },
        tags: ['metrics', 'integration', 'service']
      });

      console.log('✅ Metrics integration service stopped successfully');

    } catch (error) {
      console.error('❌ Failed to stop metrics integration:', error);
      throw error;
    }
  }

  /**
   * Handle git commit events for metrics collection
   */
  async handleGitCommitEvent(commitShas: string[]): Promise<void> {
    if (!this.config.enableGitTriggers || !this.isRunning) {
      return;
    }

    const startTime = Date.now();
    const triggerId = `git_${commitShas.join('_')}_${startTime}`;

    try {
      console.log(`🔗 Git commit event received: ${commitShas.length} commits`);

      // Check if we're not overloaded with collections
      if (this.activeCollections.size >= this.config.maxConcurrentCollections) {
        console.warn('⚠️  Skipping git metrics trigger - too many active collections');
        return;
      }

      // Cancel any existing pending trigger for the same commits
      const existingTrigger = Array.from(this.pendingTriggers.keys())
        .find(key => key.startsWith(`git_${commitShas[0]}`));
      if (existingTrigger) {
        clearTimeout(this.pendingTriggers.get(existingTrigger)!);
        this.pendingTriggers.delete(existingTrigger);
      }

      // Schedule delayed metrics collection to allow git operations to complete
      const timeout = setTimeout(async () => {
        try {
          this.pendingTriggers.delete(triggerId);
          this.activeCollections.add(triggerId);

          console.log(`⚡ Triggering metrics collection for git commits: ${commitShas.join(', ')}`);
          
          const result = await collectMetricsOnCommit(commitShas);
          
          if (result) {
            console.log(`✅ Git-triggered metrics collection completed in ${result.executionTimeMs}ms`);
            
            // Process any alerts generated
            await this.processMetricsResult(result, 'git_commit');
            
            this.integrationStats.gitTriggersProcessed++;
          }

        } catch (error) {
          console.error('❌ Git-triggered metrics collection failed:', error);
          this.integrationStats.errors++;

          await logEvent({
            actor: 'system',
            event_type: 'metrics_git_integration_error',
            status: 'error',
            metadata: {
              commitShas,
              error: error instanceof Error ? error.message : 'Unknown error',
              executionTime: Date.now() - startTime
            },
            tags: ['metrics', 'git', 'error']
          });
        } finally {
          this.activeCollections.delete(triggerId);
        }
      }, this.config.gitTriggerDelayMs);

      this.pendingTriggers.set(triggerId, timeout);

    } catch (error) {
      console.error('❌ Failed to handle git commit event:', error);
      this.integrationStats.errors++;
    }
  }

  /**
   * Handle pattern detection events for metrics updates
   */
  async handlePatternDetectionEvent(patternResult: PatternDetectionResult): Promise<void> {
    if (!this.config.enablePatternTriggers || !this.isRunning) {
      return;
    }

    const startTime = Date.now();
    const triggerId = `pattern_${patternResult.projectId}_${startTime}`;

    try {
      console.log(`🔗 Pattern detection event received for project ${patternResult.projectId.substring(0, 8)}...`);

      // Check collection capacity
      if (this.activeCollections.size >= this.config.maxConcurrentCollections) {
        console.warn('⚠️  Skipping pattern metrics trigger - too many active collections');
        return;
      }

      // Schedule delayed metrics collection
      const timeout = setTimeout(async () => {
        try {
          this.pendingTriggers.delete(triggerId);
          this.activeCollections.add(triggerId);

          console.log(`⚡ Triggering metrics collection for pattern update`);
          
          const result = await collectMetricsOnPatternUpdate(patternResult);
          
          if (result) {
            console.log(`✅ Pattern-triggered metrics collection completed in ${result.executionTimeMs}ms`);
            
            // Process any alerts generated
            await this.processMetricsResult(result, 'pattern_update');
            
            this.integrationStats.patternTriggersProcessed++;
          }

        } catch (error) {
          console.error('❌ Pattern-triggered metrics collection failed:', error);
          this.integrationStats.errors++;

          await logEvent({
            actor: 'system',
            event_type: 'metrics_pattern_integration_error',
            status: 'error',
            metadata: {
              projectId: patternResult.projectId,
              patternsDetected: patternResult.patternsDetected,
              error: error instanceof Error ? error.message : 'Unknown error',
              executionTime: Date.now() - startTime
            },
            tags: ['metrics', 'pattern', 'error']
          });
        } finally {
          this.activeCollections.delete(triggerId);
        }
      }, this.config.patternTriggerDelayMs);

      this.pendingTriggers.set(triggerId, timeout);

    } catch (error) {
      console.error('❌ Failed to handle pattern detection event:', error);
      this.integrationStats.errors++;
    }
  }

  /**
   * Handle session end events for productivity metrics
   */
  async handleSessionEndEvent(sessionId: string, projectId: string): Promise<void> {
    if (!this.config.enableSessionTriggers || !this.isRunning) {
      return;
    }

    const startTime = Date.now();
    const triggerId = `session_${sessionId}_${startTime}`;

    try {
      console.log(`🔗 Session end event received: ${sessionId.substring(0, 8)}...`);

      // Schedule delayed productivity metrics collection
      const timeout = setTimeout(async () => {
        try {
          this.pendingTriggers.delete(triggerId);
          this.activeCollections.add(triggerId);

          console.log(`⚡ Triggering productivity metrics for session end`);
          
          // Collect focused productivity metrics for the ended session
          const result = await this.collectSessionProductivityMetrics(sessionId, projectId);
          
          if (result) {
            console.log(`✅ Session-triggered metrics collection completed`);
            
            // Process productivity alerts
            await this.processProductivityAlerts(result);
            
            this.integrationStats.sessionTriggersProcessed++;
          }

        } catch (error) {
          console.error('❌ Session-triggered metrics collection failed:', error);
          this.integrationStats.errors++;
        } finally {
          this.activeCollections.delete(triggerId);
        }
      }, this.config.sessionEndDelayMs);

      this.pendingTriggers.set(triggerId, timeout);

    } catch (error) {
      console.error('❌ Failed to handle session end event:', error);
      this.integrationStats.errors++;
    }
  }

  /**
   * Process metrics collection results and generate alerts
   */
  private async processMetricsResult(result: MetricsCollectionResult, triggerType: string): Promise<void> {
    try {
      // Check for critical alerts in the results
      const criticalAlerts = result.alertsCreated.filter(alert => 
        alert.severity === 'critical' || alert.urgency === 'immediate'
      );

      if (criticalAlerts.length > 0) {
        console.log(`🚨 ${criticalAlerts.length} critical alerts generated from ${triggerType}`);
        
        for (const alert of criticalAlerts) {
          await this.sendCriticalAlertNotification(alert, result);
        }
      }

      // Check for significant metric changes
      const significantChanges = result.coreMetrics.filter(metric =>
        metric.changeSigificance === 'significant' || metric.changeSigificance === 'major'
      );

      if (significantChanges.length > 0) {
        console.log(`📊 ${significantChanges.length} significant metric changes detected`);
        
        await logEvent({
          actor: 'system',
          event_type: 'metrics_significant_changes_detected',
          status: 'open',
          metadata: {
            triggerType,
            changesCount: significantChanges.length,
            changes: significantChanges.map(m => ({
              type: m.metricType,
              change: m.percentChangeFromBaseline,
              significance: m.changeSigificance
            })),
            collectionSessionId: result.collectionSessionId
          },
          tags: ['metrics', 'changes', 'significant']
        });
      }

      // Update integration statistics
      this.integrationStats.alertsGenerated += result.alertsGenerated;
      this.integrationStats.avgIntegrationTime = (
        this.integrationStats.avgIntegrationTime + result.executionTimeMs
      ) / 2;
      this.integrationStats.lastIntegrationTime = new Date();

    } catch (error) {
      console.error('❌ Failed to process metrics result:', error);
    }
  }

  /**
   * Process productivity-specific alerts for burnout and health risks
   */
  private async processProductivityAlerts(result: any): Promise<void> {
    try {
      // This would be implemented to check for productivity health risks
      console.log('🔍 Processing productivity health alerts...');
      
      // Placeholder for productivity-specific alert logic
      // Would check burnout risk, workload sustainability, etc.
      
    } catch (error) {
      console.error('❌ Failed to process productivity alerts:', error);
    }
  }

  /**
   * Collect focused productivity metrics for a specific session
   */
  private async collectSessionProductivityMetrics(sessionId: string, projectId: string): Promise<any> {
    try {
      // Get session duration and activity data
      const sessionQuery = `
        SELECT 
          created_at,
          updated_at,
          EXTRACT(EPOCH FROM (updated_at - created_at)) / 60 as duration_minutes
        FROM sessions 
        WHERE id = $1
      `;
      
      const sessionResult = await db.query(sessionQuery, [sessionId]);
      
      if (sessionResult.rows.length === 0) {
        return null;
      }

      const session = sessionResult.rows[0];
      
      // Calculate basic productivity metrics for the session
      const productivityData = {
        sessionId,
        projectId,
        duration: session.duration_minutes,
        timestamp: new Date()
      };

      console.log(`📊 Collected productivity metrics for session ${sessionId.substring(0, 8)}...`);
      
      return productivityData;

    } catch (error) {
      console.error('❌ Failed to collect session productivity metrics:', error);
      return null;
    }
  }

  /**
   * Send critical alert notifications
   */
  private async sendCriticalAlertNotification(alert: any, result: MetricsCollectionResult): Promise<void> {
    try {
      console.log(`🚨 CRITICAL ALERT: ${alert.title}`);
      console.log(`   Severity: ${alert.severity.toUpperCase()}`);
      console.log(`   Description: ${alert.description}`);
      console.log(`   Trigger Value: ${alert.triggerValue}`);
      console.log(`   Immediate Actions: ${alert.immediateActions.join(', ')}`);

      // Log critical alert for monitoring systems
      await logEvent({
        actor: 'system',
        event_type: 'metrics_critical_alert',
        status: 'error',
        metadata: {
          alertId: `temp_${Date.now()}`, // Would be actual alert ID
          title: alert.title,
          severity: alert.severity,
          urgency: alert.urgency,
          triggerValue: alert.triggerValue,
          thresholdValue: alert.thresholdValue,
          metricType: alert.metricType,
          projectId: result.projectId,
          immediateActions: alert.immediateActions,
          affectedAreas: alert.affectedAreas
        },
        tags: ['metrics', 'alert', 'critical']
      });

      // Here you would integrate with external notification systems:
      // - Slack/Teams webhooks
      // - Email notifications
      // - Dashboard alerts
      // - Mobile push notifications

    } catch (error) {
      console.error('❌ Failed to send critical alert notification:', error);
    }
  }

  /**
   * Get integration service statistics
   */
  getIntegrationStats() {
    return {
      ...this.integrationStats,
      isRunning: this.isRunning,
      activeCollections: this.activeCollections.size,
      pendingTriggers: this.pendingTriggers.size,
      config: this.config
    };
  }

  /**
   * Update integration configuration
   */
  updateConfig(newConfig: Partial<MetricsIntegrationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('🔧 Metrics integration configuration updated');
  }
}

/**
 * Utility functions for external usage
 */

/**
 * Start metrics integration service
 */
export async function startMetricsIntegration(config?: Partial<MetricsIntegrationConfig>): Promise<void> {
  const service = MetricsIntegrationService.getInstance(config);
  await service.start();
}

/**
 * Stop metrics integration service
 */
export async function stopMetricsIntegration(): Promise<void> {
  const service = MetricsIntegrationService.getInstance();
  await service.stop();
}

/**
 * Handle git commit events
 */
export async function handleGitCommitForMetrics(commitShas: string[]): Promise<void> {
  const service = MetricsIntegrationService.getInstance();
  await service.handleGitCommitEvent(commitShas);
}

/**
 * Handle pattern detection events
 */
export async function handlePatternUpdateForMetrics(patternResult: PatternDetectionResult): Promise<void> {
  const service = MetricsIntegrationService.getInstance();
  await service.handlePatternDetectionEvent(patternResult);
}

/**
 * Handle session end events
 */
export async function handleSessionEndForMetrics(sessionId: string, projectId: string): Promise<void> {
  const service = MetricsIntegrationService.getInstance();
  await service.handleSessionEndEvent(sessionId, projectId);
}

/**
 * Get integration statistics
 */
export function getMetricsIntegrationStats() {
  const service = MetricsIntegrationService.getInstance();
  return service.getIntegrationStats();
}

/**
 * Export the main class
 */
export default MetricsIntegrationService;