/**
 * Session Management Monitoring and Alerting
 *
 * Provides comprehensive monitoring, alerting, and automatic rollback capabilities
 * for the session management feature flag rollout.
 */

import { SessionRouter } from './sessionRouter.js';
import { isFeatureEnabled, ensureFeatureFlags } from '../utils/featureFlags.js';
import { logEvent } from '../middleware/eventLogger.js';
import fs from 'fs/promises';
import path from 'path';

export interface AlertRule {
  name: string;
  metric: keyof import('./sessionRouter.js').SessionRouterMetrics;
  threshold: number;
  operator: 'gt' | 'lt' | 'eq';
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
}

export interface MonitoringConfig {
  checkIntervalMs: number;
  alertRules: AlertRule[];
  autoRollbackEnabled: boolean;
  rollbackThresholds: {
    errorRate: number;
    failoverRate: number;
    consecutiveFailures: number;
  };
}

export interface Alert {
  id: string;
  rule: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  currentValue: number;
  threshold: number;
  timestamp: Date;
  acknowledged: boolean;
  resolved: boolean;
}

export class SessionMonitoring {
  private static instance: SessionMonitoring | null = null;
  private monitoring = false;
  private alerts: Alert[] = [];
  private checkInterval: NodeJS.Timer | null = null;
  private consecutiveFailures = 0;

  private config: MonitoringConfig = {
    checkIntervalMs: 30000, // 30 seconds
    alertRules: [
      {
        name: 'High Error Rate',
        metric: 'errorRate',
        threshold: 0.05, // 5%
        operator: 'gt',
        severity: 'critical',
        enabled: true
      },
      {
        name: 'High Failover Rate',
        metric: 'failoverCount',
        threshold: 10,
        operator: 'gt',
        severity: 'high',
        enabled: true
      },
      {
        name: 'High Average Latency',
        metric: 'averageLatency',
        threshold: 5000, // 5 seconds
        operator: 'gt',
        severity: 'medium',
        enabled: true
      },
      {
        name: 'No V2 Traffic',
        metric: 'v2Requests',
        threshold: 0,
        operator: 'eq',
        severity: 'low',
        enabled: true
      }
    ],
    autoRollbackEnabled: true,
    rollbackThresholds: {
      errorRate: 0.10, // 10% error rate triggers rollback
      failoverRate: 0.25, // 25% failover rate triggers rollback
      consecutiveFailures: 5
    }
  };

  static getInstance(): SessionMonitoring {
    if (!this.instance) {
      this.instance = new SessionMonitoring();
    }
    return this.instance;
  }

  /**
   * Start monitoring session routing metrics
   */
  async startMonitoring(): Promise<void> {
    if (this.monitoring) {
      console.log('⚠️  Session monitoring already running');
      return;
    }

    console.log('🔍 Starting session management monitoring...');
    this.monitoring = true;

    // Log monitoring start
    await logEvent({
      actor: 'system',
      event_type: 'session_monitoring_started',
      status: 'open',
      metadata: {
        check_interval_ms: this.config.checkIntervalMs,
        auto_rollback_enabled: this.config.autoRollbackEnabled,
        alert_rules_count: this.config.alertRules.length
      },
      tags: ['session-monitoring', 'start']
    });

    // Start periodic checks
    this.checkInterval = setInterval(() => {
      this.performHealthCheck().catch(error => {
        console.error('❌ Session monitoring check failed:', error);
        this.consecutiveFailures++;
      });
    }, this.config.checkIntervalMs);

    console.log(`✅ Session monitoring started (check interval: ${this.config.checkIntervalMs}ms)`);
  }

  /**
   * Stop monitoring
   */
  async stopMonitoring(): Promise<void> {
    if (!this.monitoring) {
      return;
    }

    console.log('🛑 Stopping session management monitoring...');
    this.monitoring = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Log monitoring stop
    await logEvent({
      actor: 'system',
      event_type: 'session_monitoring_stopped',
      status: 'closed',
      metadata: {
        alerts_active: this.alerts.filter(a => !a.resolved).length,
        total_alerts: this.alerts.length
      },
      tags: ['session-monitoring', 'stop']
    });

    console.log('✅ Session monitoring stopped');
  }

  /**
   * Perform comprehensive health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      // Get current metrics and health status
      const healthCheck = await SessionRouter.healthCheck();
      const metrics = healthCheck.metrics;

      console.log(`🔍 Session health check - Requests: ${metrics.totalRequests}, Error Rate: ${(metrics.errorRate * 100).toFixed(2)}%, Failovers: ${metrics.failoverCount}`);

      // Check each alert rule
      for (const rule of this.config.alertRules) {
        if (!rule.enabled) continue;

        const currentValue = metrics[rule.metric] as number;
        const triggered = this.checkAlertRule(rule, currentValue);

        if (triggered) {
          await this.triggerAlert(rule, currentValue);
        }
      }

      // Check for automatic rollback conditions
      if (this.config.autoRollbackEnabled) {
        await this.checkAutoRollback(metrics);
      }

      // Reset consecutive failures on successful check
      this.consecutiveFailures = 0;

    } catch (error) {
      console.error('❌ Health check failed:', error);
      this.consecutiveFailures++;

      if (this.consecutiveFailures >= this.config.rollbackThresholds.consecutiveFailures) {
        console.warn('⚠️  Too many consecutive monitoring failures, triggering rollback');
        await this.executeAutoRollback('consecutive_monitoring_failures', {
          consecutive_failures: this.consecutiveFailures,
          last_error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  /**
   * Check if an alert rule is triggered
   */
  private checkAlertRule(rule: AlertRule, currentValue: number): boolean {
    switch (rule.operator) {
      case 'gt': return currentValue > rule.threshold;
      case 'lt': return currentValue < rule.threshold;
      case 'eq': return currentValue === rule.threshold;
      default: return false;
    }
  }

  /**
   * Trigger an alert
   */
  private async triggerAlert(rule: AlertRule, currentValue: number): Promise<void> {
    // Check if this alert is already active
    const existingAlert = this.alerts.find(a =>
      a.rule === rule.name && !a.resolved &&
      (Date.now() - a.timestamp.getTime()) < 300000 // 5 minutes
    );

    if (existingAlert) {
      return; // Don't spam alerts
    }

    const alert: Alert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      rule: rule.name,
      severity: rule.severity,
      message: `${rule.name}: ${rule.metric} is ${currentValue} (threshold: ${rule.threshold})`,
      currentValue,
      threshold: rule.threshold,
      timestamp: new Date(),
      acknowledged: false,
      resolved: false
    };

    this.alerts.push(alert);

    console.warn(`🚨 ALERT [${rule.severity.toUpperCase()}]: ${alert.message}`);

    // Log the alert
    await logEvent({
      actor: 'system',
      event_type: 'session_monitoring_alert',
      status: 'error',
      metadata: {
        alert_id: alert.id,
        rule_name: rule.name,
        severity: rule.severity,
        metric: rule.metric,
        current_value: currentValue,
        threshold: rule.threshold,
        message: alert.message
      },
      tags: ['session-monitoring', 'alert', rule.severity, rule.metric]
    });

    // Trigger rollback for critical alerts
    if (rule.severity === 'critical' && this.config.autoRollbackEnabled) {
      await this.executeAutoRollback('critical_alert', {
        alert_id: alert.id,
        rule_name: rule.name,
        current_value: currentValue,
        threshold: rule.threshold
      });
    }
  }

  /**
   * Check for automatic rollback conditions
   */
  private async checkAutoRollback(metrics: import('./sessionRouter.js').SessionRouterMetrics): Promise<void> {
    const { rollbackThresholds } = this.config;

    // Check error rate threshold
    if (metrics.errorRate > rollbackThresholds.errorRate) {
      await this.executeAutoRollback('error_rate_threshold', {
        error_rate: metrics.errorRate,
        threshold: rollbackThresholds.errorRate
      });
      return;
    }

    // Check failover rate threshold
    const failoverRate = metrics.totalRequests > 0 ?
      metrics.failoverCount / metrics.totalRequests : 0;

    if (failoverRate > rollbackThresholds.failoverRate) {
      await this.executeAutoRollback('failover_rate_threshold', {
        failover_rate: failoverRate,
        threshold: rollbackThresholds.failoverRate,
        failover_count: metrics.failoverCount,
        total_requests: metrics.totalRequests
      });
      return;
    }
  }

  /**
   * Execute automatic rollback
   */
  private async executeAutoRollback(reason: string, metadata: any): Promise<void> {
    console.warn(`🔄 EXECUTING AUTO-ROLLBACK: ${reason}`);

    try {
      // Disable V2 feature flag
      const configPath = path.resolve(process.cwd(), '..', 'config', 'feature-flags.json');

      try {
        const configData = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(configData);

        // Update flags to disable V2
        config.flags['phase4.sessionManagementV2'] = false;
        config.flags['phase4.sessionTrafficSplit'] = 0;
        config.overrides = config.overrides || {};
        config.overrides['phase4.sessionManagementV2'] = false;
        config.overrides['phase4.sessionTrafficSplit'] = 0;
        config.version = (config.version || 0) + 1;
        config.updatedAt = new Date().toISOString();

        await fs.writeFile(configPath, JSON.stringify(config, null, 2));

        // Refresh feature flags
        const flagStore = await ensureFeatureFlags();
        await flagStore.refresh();

        console.log('✅ Auto-rollback executed successfully');

        // Log rollback
        await logEvent({
          actor: 'system',
          event_type: 'session_auto_rollback',
          status: 'closed',
          metadata: {
            reason,
            rollback_metadata: metadata,
            config_updated: true
          },
          tags: ['session-monitoring', 'auto-rollback', 'critical']
        });

      } catch (configError) {
        console.error('❌ Failed to update feature flag config:', configError);

        // Log rollback failure
        await logEvent({
          actor: 'system',
          event_type: 'session_auto_rollback_failed',
          status: 'error',
          metadata: {
            reason,
            rollback_metadata: metadata,
            config_error: configError instanceof Error ? configError.message : 'Unknown error'
          },
          tags: ['session-monitoring', 'auto-rollback', 'failure']
        });
      }

    } catch (error) {
      console.error('❌ Auto-rollback execution failed:', error);
    }
  }

  /**
   * Get current alerts
   */
  getAlerts(filter?: { severity?: string; resolved?: boolean }): Alert[] {
    let filtered = [...this.alerts];

    if (filter?.severity) {
      filtered = filtered.filter(a => a.severity === filter.severity);
    }

    if (filter?.resolved !== undefined) {
      filtered = filtered.filter(a => a.resolved === filter.resolved);
    }

    return filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      console.log(`✅ Alert acknowledged: ${alert.rule}`);
      return true;
    }
    return false;
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.acknowledged = true;
      console.log(`✅ Alert resolved: ${alert.rule}`);
      return true;
    }
    return false;
  }

  /**
   * Get monitoring status
   */
  getStatus(): {
    monitoring: boolean;
    checkIntervalMs: number;
    totalAlerts: number;
    activeAlerts: number;
    consecutiveFailures: number;
    config: MonitoringConfig;
  } {
    return {
      monitoring: this.monitoring,
      checkIntervalMs: this.config.checkIntervalMs,
      totalAlerts: this.alerts.length,
      activeAlerts: this.alerts.filter(a => !a.resolved).length,
      consecutiveFailures: this.consecutiveFailures,
      config: this.config
    };
  }

  /**
   * Update monitoring configuration
   */
  updateConfig(newConfig: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('🔧 Session monitoring configuration updated');
  }
}

export default SessionMonitoring;