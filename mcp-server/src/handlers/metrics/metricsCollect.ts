/**
 * TT009-2-1: Metrics Collect Consolidated Tool
 *
 * Unified metrics collection tool that replaces:
 * - metrics_collect_project: Trigger comprehensive metrics collection
 * - metrics_get_core_metrics: Get core development metrics (velocity, quality, debt)
 * - metrics_get_pattern_intelligence: Get pattern-based intelligence metrics
 * - metrics_get_productivity_health: Get developer productivity and health metrics
 *
 * Consolidation reduces 4 tools → 1 tool with unified interface.
 * Part of Phase 2 Tool Consolidation (TT009-2)
 */

import { db } from '../../config/database.js';
import { logEvent } from '../../middleware/eventLogger.js';
import {
  collectProjectMetrics as collectProjectMetricsService,
} from '../../services/metricsCollector.js';

/**
 * Unified metrics collection interface
 * Consolidates multiple collection endpoints into one coherent API
 */
export async function handleMetricsCollect(args: any): Promise<any> {
  const startTime = Date.now();

  try {
    const { scope, target, options = {} } = args;

    console.log(`🎯 metrics_collect(scope: ${scope}, target: ${target})`);

    // Validate required parameters
    if (!scope) {
      return {
        success: false,
        error: 'scope parameter is required',
        validScopes: ['project', 'core', 'patterns', 'productivity']
      };
    }

    let result;
    const executionTime = Date.now() - startTime;

    switch (scope) {
      case 'project':
        result = await collectProjectMetrics(target, options);
        break;

      case 'core':
        result = await collectCoreMetrics(target, options);
        break;

      case 'patterns':
        result = await collectPatternIntelligence(target, options);
        break;

      case 'productivity':
        result = await collectProductivityHealth(target, options);
        break;

      default:
        return {
          success: false,
          error: `Invalid scope: ${scope}`,
          validScopes: ['project', 'core', 'patterns', 'productivity'],
          providedScope: scope
        };
    }

    // Log successful metrics collection
    await logEvent({
      actor: 'ai',
      event_type: 'metrics_collection_consolidated',
      status: 'closed',
      metadata: {
        scope,
        target,
        executionTimeMs: executionTime,
        toolType: 'consolidated',
        phase: 'TT009-2',
        originalTools: scope === 'project' ? ['metrics_collect_project'] :
                      scope === 'core' ? ['metrics_get_core_metrics'] :
                      scope === 'patterns' ? ['metrics_get_pattern_intelligence'] :
                      ['metrics_get_productivity_health']
      }
    });

    return {
      success: true,
      scope,
      target,
      executionTimeMs: executionTime,
      data: result,
      consolidationInfo: {
        phase: 'TT009-2-1',
        originalToolReplaced: getOriginalTool(scope),
        tokenSavings: 'Part of ~6,500 token Phase 2 savings'
      }
    };

  } catch (error) {
    const executionTime = Date.now() - startTime;

    console.error(`❌ metrics_collect failed:`, error);

    // Log failed metrics collection
    await logEvent({
      actor: 'ai',
      event_type: 'metrics_collection_consolidated_failed',
      status: 'error',
      metadata: {
        scope: args.scope,
        target: args.target,
        executionTimeMs: executionTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        phase: 'TT009-2'
      }
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      scope: args.scope,
      target: args.target,
      executionTimeMs: executionTime
    };
  }
}

/**
 * Collect comprehensive project metrics
 * Replaces: metrics_collect_project
 */
async function collectProjectMetrics(projectId: string, options: any): Promise<any> {
  const {
    trigger = 'manual',
    startDate,
    endDate
  } = options;

  console.log(`📊 Collecting project metrics for: ${projectId}`);

  // Use existing service - need to check correct function signature
  return await collectProjectMetricsService(
    projectId,
    trigger as 'manual' | 'git_commit' | 'scheduled' | 'pattern_update' | 'session_end',
    startDate,
    endDate
  );
}

/**
 * Collect core development metrics
 * Replaces: metrics_get_core_metrics
 */
async function collectCoreMetrics(projectId: string, options: any): Promise<any> {
  const {
    metricTypes = ['code_velocity', 'development_focus', 'change_frequency', 'technical_debt_accumulation'],
    scope = 'project',
    timeframe = '30d',
    includeBaselines = true
  } = options;

  console.log(`🔍 Collecting core metrics for: ${projectId}`);

  // Query core metrics from database
  const query = `
    SELECT
      metric_type,
      value,
      unit,
      timestamp,
      metadata
    FROM metrics_snapshots
    WHERE project_id = $1
      AND metric_type = ANY($2)
      AND timestamp >= NOW() - INTERVAL '${timeframe}'
    ORDER BY timestamp DESC
  `;

  const result = await db.query(query, [projectId, metricTypes]);

  return {
    projectId,
    scope,
    timeframe,
    metricTypes,
    includeBaselines,
    metrics: result.rows,
    summary: generateCoreMetricsSummary(result.rows)
  };
}

/**
 * Collect pattern intelligence metrics
 * Replaces: metrics_get_pattern_intelligence
 */
async function collectPatternIntelligence(projectId: string, options: any): Promise<any> {
  const {
    intelligenceTypes = ['coupling_strength', 'hotspot_risk', 'specialization_depth'],
    riskLevels = ['moderate', 'high', 'very_high', 'critical'],
    minConfidence = 0.5
  } = options;

  console.log(`🧠 Collecting pattern intelligence for: ${projectId}`);

  // Query pattern intelligence from database
  const query = `
    SELECT
      pi.intelligence_type,
      pi.risk_level,
      pi.confidence_score,
      pi.value,
      pi.metadata,
      pi.timestamp
    FROM pattern_intelligence pi
    WHERE pi.project_id = $1
      AND pi.intelligence_type = ANY($2)
      AND pi.risk_level = ANY($3)
      AND pi.confidence_score >= $4
    ORDER BY pi.confidence_score DESC, pi.timestamp DESC
  `;

  const result = await db.query(query, [projectId, intelligenceTypes, riskLevels, minConfidence]);

  return {
    projectId,
    intelligenceTypes,
    riskLevels,
    minConfidence,
    patterns: result.rows,
    summary: generatePatternIntelligenceSummary(result.rows)
  };
}

/**
 * Collect productivity and health metrics
 * Replaces: metrics_get_productivity_health
 */
async function collectProductivityHealth(projectId: string, options: any): Promise<any> {
  const {
    developerEmail,
    teamIdentifier,
    productivityTypes = ['session_productivity', 'rhythm_consistency', 'focus_depth'],
    timeframe = '30d',
    includeHealthRisks = true
  } = options;

  console.log(`💪 Collecting productivity health for: ${projectId}`);

  // Build dynamic query based on parameters
  let query = `
    SELECT
      ph.developer_email,
      ph.team_identifier,
      ph.productivity_type,
      ph.value,
      ph.health_risk_level,
      ph.timestamp,
      ph.metadata
    FROM productivity_health ph
    WHERE ph.project_id = $1
      AND ph.productivity_type = ANY($2)
      AND ph.timestamp >= NOW() - INTERVAL '${timeframe}'
  `;

  const params = [projectId, productivityTypes];
  let paramCount = 2;

  if (developerEmail) {
    query += ` AND ph.developer_email = $${++paramCount}`;
    params.push(developerEmail);
  }

  if (teamIdentifier) {
    query += ` AND ph.team_identifier = $${++paramCount}`;
    params.push(teamIdentifier);
  }

  query += ` ORDER BY ph.timestamp DESC`;

  const result = await db.query(query, params);

  return {
    projectId,
    developerEmail,
    teamIdentifier,
    productivityTypes,
    timeframe,
    includeHealthRisks,
    metrics: result.rows,
    summary: generateProductivityHealthSummary(result.rows)
  };
}

/**
 * Generate summary for core metrics
 */
function generateCoreMetricsSummary(metrics: any[]): any {
  const summary = {
    totalMetrics: metrics.length,
    metricTypes: [...new Set(metrics.map(m => m.metric_type))],
    latestTimestamp: metrics[0]?.timestamp,
    averageValues: {} as Record<string, number>
  };

  // Calculate averages by metric type
  for (const type of summary.metricTypes) {
    const typeMetrics = metrics.filter(m => m.metric_type === type);
    const values = typeMetrics.map(m => parseFloat(m.value)).filter(v => !isNaN(v));
    if (values.length > 0) {
      summary.averageValues[type] = values.reduce((a, b) => a + b, 0) / values.length;
    }
  }

  return summary;
}

/**
 * Generate summary for pattern intelligence
 */
function generatePatternIntelligenceSummary(patterns: any[]): any {
  const riskDistribution: Record<string, number> = {};
  for (const p of patterns) {
    riskDistribution[p.risk_level] = (riskDistribution[p.risk_level] || 0) + 1;
  }

  // Convert Set to Array manually to avoid downlevelIteration issues
  const intelligenceTypesSet = new Set(patterns.map(p => p.intelligence_type));
  const intelligenceTypes = Array.from(intelligenceTypesSet);

  return {
    totalPatterns: patterns.length,
    intelligenceTypes,
    riskDistribution,
    averageConfidence: patterns.length > 0
      ? patterns.reduce((sum, p) => sum + p.confidence_score, 0) / patterns.length
      : 0,
    highRiskCount: patterns.filter(p => ['high', 'very_high', 'critical'].includes(p.risk_level)).length
  };
}

/**
 * Generate summary for productivity health
 */
function generateProductivityHealthSummary(metrics: any[]): any {
  const healthRisks = metrics.filter(m => m.health_risk_level && m.health_risk_level !== 'low');

  // Convert Sets to Arrays manually
  const productivityTypesSet = new Set(metrics.map(m => m.productivity_type));
  const productivityTypes = Array.from(productivityTypesSet);

  const developersSet = new Set(metrics.map(m => m.developer_email));
  const developers = Array.from(developersSet);

  const teamsSet = new Set(metrics.map(m => m.team_identifier).filter(Boolean));
  const teams = Array.from(teamsSet);

  return {
    totalMetrics: metrics.length,
    productivityTypes,
    healthRiskCount: healthRisks.length,
    developersTracked: developers.length,
    teamsTracked: teams.length
  };
}

/**
 * Get original tool name for tracking
 */
function getOriginalTool(scope: string): string {
  switch (scope) {
    case 'project': return 'metrics_collect_project';
    case 'core': return 'metrics_get_core_metrics';
    case 'patterns': return 'metrics_get_pattern_intelligence';
    case 'productivity': return 'metrics_get_productivity_health';
    default: return 'unknown';
  }
}