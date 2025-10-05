/**
 * TT009-2-3: Metrics Control Consolidated Tool
 *
 * Unified metrics control tool that replaces:
 * - metrics_start_collection: Start the metrics collection service
 * - metrics_stop_collection: Stop the metrics collection service
 * - metrics_get_alerts: Get active metrics alerts and notifications
 * - metrics_acknowledge_alert: Acknowledge a metrics alert
 * - metrics_resolve_alert: Mark a metrics alert as resolved
 * - metrics_get_performance: Get metrics collection system performance
 * - metrics_export_data: Export aggregated metrics data in various formats
 *
 * Consolidation reduces 7 tools → 1 tool with unified interface.
 * Part of Phase 2 Tool Consolidation (TT009-2)
 */

import { db } from '../../config/database.js';
import { logEvent } from '../../middleware/eventLogger.js';
import {
  startMetricsCollection,
  stopMetricsCollection,
  getMetricsCollectionPerformance
} from '../../services/metricsCollector.js';

/**
 * Unified metrics control interface
 * Consolidates multiple control endpoints into one coherent API
 */
export async function handleMetricsControl(args: any): Promise<any> {
  const startTime = Date.now();

  try {
    const { operation, options = {} } = args;

    console.log(`🎯 metrics_control(operation: ${operation})`);

    // Validate required parameters
    if (!operation) {
      return {
        success: false,
        error: 'operation parameter is required',
        validOperations: ['start', 'stop', 'alerts', 'acknowledge', 'resolve', 'performance', 'export']
      };
    }

    let result;
    const executionTime = Date.now() - startTime;

    switch (operation) {
      case 'start':
        result = await controlStart(options);
        break;

      case 'stop':
        result = await controlStop(options);
        break;

      case 'alerts':
        result = await controlAlerts(options);
        break;

      case 'acknowledge':
        result = await controlAcknowledge(options);
        break;

      case 'resolve':
        result = await controlResolve(options);
        break;

      case 'performance':
        result = await controlPerformance(options);
        break;

      case 'export':
        result = await controlExport(options);
        break;

      default:
        return {
          success: false,
          error: `Invalid operation: ${operation}`,
          validOperations: ['start', 'stop', 'alerts', 'acknowledge', 'resolve', 'performance', 'export'],
          providedOperation: operation
        };
    }

    // Log successful metrics control operation
    await logEvent({
      actor: 'ai',
      event_type: 'metrics_control_consolidated',
      status: 'info',
      metadata: {
        operation,
        executionTimeMs: executionTime,
        toolType: 'consolidated',
        phase: 'TT009-2',
        originalTools: getOriginalTools(operation)
      }
    });

    return {
      success: true,
      operation,
      executionTimeMs: executionTime,
      data: result,
      consolidationInfo: {
        phase: 'TT009-2-3',
        originalToolReplaced: getOriginalTool(operation),
        tokenSavings: 'Part of ~6,500 token Phase 2 savings'
      }
    };

  } catch (error) {
    const executionTime = Date.now() - startTime;

    console.error(`❌ metrics_control failed:`, error);

    // Log failed metrics control operation
    await logEvent({
      actor: 'ai',
      event_type: 'metrics_control_consolidated_failed',
      status: 'error',
      metadata: {
        operation: args.operation,
        executionTimeMs: executionTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        phase: 'TT009-2'
      }
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      operation: args.operation,
      executionTimeMs: executionTime
    };
  }
}

/**
 * Start metrics collection service
 * Replaces: metrics_start_collection
 */
async function controlStart(options: any): Promise<any> {
  const {
    projectId,
    sessionId,
    intervalMs = 300000,
    autoCollectGit = true
  } = options;

  console.log(`🚀 Starting metrics collection service`);

  // Use existing service
  const startResult = await startMetricsCollection({
    projectId,
    sessionId,
    intervalMs,
    autoCollectGit
  });

  return {
    operation: 'start',
    status: 'started',
    intervalMs,
    autoCollectGit,
    result: startResult
  };
}

/**
 * Stop metrics collection service
 * Replaces: metrics_stop_collection
 */
async function controlStop(options: any): Promise<any> {
  const {
    gracefulShutdown = true,
    collectFinalMetrics = true
  } = options;

  console.log(`🛑 Stopping metrics collection service`);

  // Use existing service
  const stopResult = await stopMetricsCollection({
    gracefulShutdown,
    collectFinalMetrics
  });

  return {
    operation: 'stop',
    status: 'stopped',
    gracefulShutdown,
    collectFinalMetrics,
    result: stopResult
  };
}

/**
 * Get active metrics alerts
 * Replaces: metrics_get_alerts
 */
async function controlAlerts(options: any): Promise<any> {
  const {
    projectId,
    severity = ['low', 'medium', 'high', 'critical'],
    status = 'active',
    limit = 50,
    includeResolved = false
  } = options;

  console.log(`🚨 Getting metrics alerts for project: ${projectId}`);

  let query = `
    SELECT
      alert_id,
      project_id,
      metric_type,
      severity,
      status,
      message,
      threshold_value,
      actual_value,
      created_at,
      acknowledged_at,
      resolved_at,
      metadata
    FROM metrics_alerts
    WHERE 1=1
  `;

  const params = [];
  let paramCount = 0;

  if (projectId) {
    query += ` AND project_id = $${++paramCount}`;
    params.push(projectId);
  }

  if (!includeResolved) {
    query += ` AND status != 'resolved'`;
  }

  query += ` AND severity = ANY($${++paramCount})`;
  params.push(severity);

  if (status !== 'all') {
    query += ` AND status = $${++paramCount}`;
    params.push(status);
  }

  query += ` ORDER BY severity DESC, created_at DESC LIMIT $${++paramCount}`;
  params.push(limit);

  const result = await db.query(query, params);

  return {
    operation: 'alerts',
    projectId,
    severity,
    status,
    includeResolved,
    totalAlerts: result.rows.length,
    alerts: result.rows,
    summary: generateAlertsSummary(result.rows)
  };
}

/**
 * Acknowledge a metrics alert
 * Replaces: metrics_acknowledge_alert
 */
async function controlAcknowledge(options: any): Promise<any> {
  const {
    alertId,
    acknowledgedBy = 'ai',
    notes
  } = options;

  console.log(`✅ Acknowledging alert: ${alertId}`);

  if (!alertId) {
    throw new Error('alertId is required for acknowledge operation');
  }

  const updateQuery = `
    UPDATE metrics_alerts
    SET
      status = 'acknowledged',
      acknowledged_at = NOW(),
      acknowledged_by = $1,
      notes = COALESCE($2, notes)
    WHERE alert_id = $3
    RETURNING *
  `;

  const result = await db.query(updateQuery, [acknowledgedBy, notes, alertId]);

  if (result.rows.length === 0) {
    throw new Error(`Alert with ID ${alertId} not found`);
  }

  return {
    operation: 'acknowledge',
    alertId,
    acknowledgedBy,
    notes,
    alert: result.rows[0],
    acknowledgedAt: result.rows[0].acknowledged_at
  };
}

/**
 * Resolve a metrics alert
 * Replaces: metrics_resolve_alert
 */
async function controlResolve(options: any): Promise<any> {
  const {
    alertId,
    resolvedBy = 'ai',
    resolution,
    resolutionNotes
  } = options;

  console.log(`🔧 Resolving alert: ${alertId}`);

  if (!alertId) {
    throw new Error('alertId is required for resolve operation');
  }

  const updateQuery = `
    UPDATE metrics_alerts
    SET
      status = 'resolved',
      resolved_at = NOW(),
      resolved_by = $1,
      resolution = $2,
      resolution_notes = $3
    WHERE alert_id = $4
    RETURNING *
  `;

  const result = await db.query(updateQuery, [resolvedBy, resolution, resolutionNotes, alertId]);

  if (result.rows.length === 0) {
    throw new Error(`Alert with ID ${alertId} not found`);
  }

  return {
    operation: 'resolve',
    alertId,
    resolvedBy,
    resolution,
    resolutionNotes,
    alert: result.rows[0],
    resolvedAt: result.rows[0].resolved_at
  };
}

/**
 * Get metrics collection performance
 * Replaces: metrics_get_performance
 */
async function controlPerformance(options: any): Promise<any> {
  const {
    timeframe = '1h',
    includeSystemMetrics = true,
    includeQueueMetrics = true
  } = options;

  console.log(`📊 Getting metrics collection performance`);

  // Use existing service
  const performance = await getMetricsCollectionPerformance();

  // Add database performance metrics
  const dbStatsQuery = `
    SELECT
      COUNT(*) as total_metrics_collected,
      COUNT(DISTINCT project_id) as projects_tracked,
      AVG(collection_duration_ms) as avg_collection_time,
      MAX(timestamp) as last_collection
    FROM metrics_snapshots
    WHERE timestamp >= NOW() - INTERVAL '${timeframe}'
  `;

  const dbStats = await db.query(dbStatsQuery);

  return {
    operation: 'performance',
    timeframe,
    includeSystemMetrics,
    includeQueueMetrics,
    systemPerformance: performance,
    databaseStats: dbStats.rows[0],
    generatedAt: new Date().toISOString()
  };
}

/**
 * Export metrics data
 * Replaces: metrics_export_data
 */
async function controlExport(options: any): Promise<any> {
  const {
    projectId,
    format = 'json',
    dateRange,
    metricTypes = [],
    includeMetadata = true,
    compressionLevel = 'none'
  } = options;

  console.log(`📤 Exporting metrics data for project: ${projectId}`);

  if (!projectId || !dateRange) {
    throw new Error('projectId and dateRange are required for export operation');
  }

  // Build export query
  let query = `
    SELECT
      project_id,
      metric_type,
      value,
      unit,
      timestamp,
      session_id,
      collection_source,
      ${includeMetadata ? 'metadata,' : ''}
      created_at
    FROM metrics_snapshots
    WHERE project_id = $1
      AND timestamp >= $2
      AND timestamp <= $3
  `;

  const params = [projectId, dateRange.startDate, dateRange.endDate];

  if (metricTypes.length > 0) {
    query += ` AND metric_type = ANY($4)`;
    params.push(metricTypes);
  }

  query += ` ORDER BY timestamp DESC`;

  const result = await db.query(query, params);

  // Format data based on requested format
  let exportData;
  switch (format.toLowerCase()) {
    case 'csv':
      exportData = formatAsCSV(result.rows);
      break;
    case 'json':
    default:
      exportData = result.rows;
      break;
  }

  return {
    operation: 'export',
    projectId,
    format,
    dateRange,
    metricTypes,
    includeMetadata,
    compressionLevel,
    recordCount: result.rows.length,
    exportData,
    exportedAt: new Date().toISOString()
  };
}

/**
 * Generate summary for alerts
 */
function generateAlertsSummary(alerts: any[]): any {
  const severityCount: Record<string, number> = {};
  const statusCount: Record<string, number> = {};

  for (const alert of alerts) {
    severityCount[alert.severity] = (severityCount[alert.severity] || 0) + 1;
    statusCount[alert.status] = (statusCount[alert.status] || 0) + 1;
  }

  return {
    totalAlerts: alerts.length,
    severityDistribution: severityCount,
    statusDistribution: statusCount,
    criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
    unresolvedAlerts: alerts.filter(a => a.status !== 'resolved').length
  };
}

/**
 * Format data as CSV
 */
function formatAsCSV(data: any[]): string {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const csvHeaders = headers.join(',');

  const csvRows = data.map(row =>
    headers.map(header => {
      const value = row[header];
      // Escape quotes and wrap in quotes if contains comma
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',')
  );

  return [csvHeaders, ...csvRows].join('\n');
}

/**
 * Get original tool name for tracking
 */
function getOriginalTool(operation: string): string {
  switch (operation) {
    case 'start': return 'metrics_start_collection';
    case 'stop': return 'metrics_stop_collection';
    case 'alerts': return 'metrics_get_alerts';
    case 'acknowledge': return 'metrics_acknowledge_alert';
    case 'resolve': return 'metrics_resolve_alert';
    case 'performance': return 'metrics_get_performance';
    case 'export': return 'metrics_export_data';
    default: return 'unknown';
  }
}

/**
 * Get original tools array for metadata
 */
function getOriginalTools(operation: string): string[] {
  switch (operation) {
    case 'start': return ['metrics_start_collection'];
    case 'stop': return ['metrics_stop_collection'];
    case 'alerts': return ['metrics_get_alerts'];
    case 'acknowledge': return ['metrics_acknowledge_alert'];
    case 'resolve': return ['metrics_resolve_alert'];
    case 'performance': return ['metrics_get_performance'];
    case 'export': return ['metrics_export_data'];
    default: return [];
  }
}