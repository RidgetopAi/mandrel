/**
 * TT009-2-2: Metrics Analyze Consolidated Tool
 *
 * Unified metrics analysis tool that replaces:
 * - metrics_get_dashboard: Get comprehensive project metrics dashboard
 * - metrics_get_trends: Get metrics trends and forecasting data
 * - metrics_aggregate_projects: Aggregate metrics across multiple projects
 * - metrics_aggregate_timeline: Aggregate metrics over time with granularity
 * - metrics_calculate_correlations: Calculate correlations between metrics
 * - metrics_get_executive_summary: Generate executive summary with insights
 *
 * Consolidation reduces 6 tools → 1 tool with unified interface.
 * Part of Phase 2 Tool Consolidation (TT009-2)
 */

import { db } from '../../config/database.js';
import { logEvent } from '../../middleware/eventLogger.js';
import { getMetricsAggregationService } from '../../services/metricsAggregator.js';
import { getMetricsCorrelationEngine } from '../../services/metricsCorrelation.js';

/**
 * Unified metrics analysis interface
 * Consolidates multiple analysis endpoints into one coherent API
 */
export async function handleMetricsAnalyze(args: any): Promise<any> {
  const startTime = Date.now();

  try {
    const { analysis, options = {} } = args;

    console.log(`🎯 metrics_analyze(analysis: ${analysis})`);

    // Validate required parameters
    if (!analysis) {
      return {
        success: false,
        error: 'analysis parameter is required',
        validAnalysisTypes: ['dashboard', 'trends', 'correlations', 'executive', 'aggregate_projects', 'aggregate_timeline']
      };
    }

    let result;
    const executionTime = Date.now() - startTime;

    switch (analysis) {
      case 'dashboard':
        result = await analyzeDashboard(options);
        break;

      case 'trends':
        result = await analyzeTrends(options);
        break;

      case 'correlations':
        result = await analyzeCorrelations(options);
        break;

      case 'executive':
        result = await analyzeExecutiveSummary(options);
        break;

      case 'aggregate_projects':
        result = await analyzeProjectAggregation(options);
        break;

      case 'aggregate_timeline':
        result = await analyzeTimelineAggregation(options);
        break;

      default:
        return {
          success: false,
          error: `Invalid analysis type: ${analysis}`,
          validAnalysisTypes: ['dashboard', 'trends', 'correlations', 'executive', 'aggregate_projects', 'aggregate_timeline'],
          providedAnalysis: analysis
        };
    }

    // Log successful metrics analysis
    await logEvent({
      actor: 'ai',
      event_type: 'metrics_analysis_consolidated',
      status: 'closed',
      metadata: {
        analysis,
        executionTimeMs: executionTime,
        toolType: 'consolidated',
        phase: 'TT009-2',
        originalTools: getOriginalTools(analysis)
      }
    });

    return {
      success: true,
      analysis,
      executionTimeMs: executionTime,
      data: result,
      consolidationInfo: {
        phase: 'TT009-2-2',
        originalToolReplaced: getOriginalTool(analysis),
        tokenSavings: 'Part of ~6,500 token Phase 2 savings'
      }
    };

  } catch (error) {
    const executionTime = Date.now() - startTime;

    console.error(`❌ metrics_analyze failed:`, error);

    // Log failed metrics analysis
    await logEvent({
      actor: 'ai',
      event_type: 'metrics_analysis_consolidated_failed',
      status: 'error',
      metadata: {
        analysis: args.analysis,
        executionTimeMs: executionTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        phase: 'TT009-2'
      }
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      analysis: args.analysis,
      executionTimeMs: executionTime
    };
  }
}

/**
 * Analyze dashboard metrics
 * Replaces: metrics_get_dashboard
 */
async function analyzeDashboard(options: any): Promise<any> {
  const {
    projectId,
    timeframe = '30d',
    includeAlerts = true,
    includeTrends = true
  } = options;

  console.log(`📊 Analyzing dashboard for project: ${projectId}`);

  if (!projectId) {
    throw new Error('projectId is required for dashboard analysis');
  }

  const timeframeDays = parseTimeframe(timeframe);
  const startDate = new Date(Date.now() - (timeframeDays * 24 * 60 * 60 * 1000));

  // Use materialized view for optimal performance
  const dashboardQuery = `
    SELECT * FROM project_metrics_dashboard
    WHERE project_id = $1
  `;

  const dashboardResult = await db.query(dashboardQuery, [projectId]);
  const dashboard = dashboardResult.rows[0];

  if (!dashboard) {
    return {
      success: false,
      error: 'No dashboard data found for project',
      projectId
    };
  }

  const result: Record<string, any> = {
    projectId,
    timeframe,
    dashboard,
    generatedAt: new Date().toISOString()
  };

  // Add alerts if requested
  if (includeAlerts) {
    const alertsQuery = `
      SELECT * FROM metrics_alerts
      WHERE project_id = $1 AND status = 'active'
      ORDER BY severity DESC, created_at DESC
    `;
    const alertsResult = await db.query(alertsQuery, [projectId]);
    result['alerts'] = alertsResult.rows;
  }

  // Add trends if requested
  if (includeTrends) {
    const trendsQuery = `
      SELECT metric_type, trend_direction, confidence_score, forecast_value
      FROM metrics_trends
      WHERE project_id = $1 AND timestamp >= $2
      ORDER BY confidence_score DESC
    `;
    const trendsResult = await db.query(trendsQuery, [projectId, startDate]);
    result['trends'] = trendsResult.rows;
  }

  return result;
}

/**
 * Analyze trends and forecasting data
 * Replaces: metrics_get_trends
 */
async function analyzeTrends(options: any): Promise<any> {
  const {
    projectId,
    metricTypes = [],
    timeframe = '30d',
    includeForecast = true,
    forecastPeriods = 7
  } = options;

  console.log(`📈 Analyzing trends for project: ${projectId}`);

  if (!projectId) {
    throw new Error('projectId is required for trends analysis');
  }

  const timeframeDays = parseTimeframe(timeframe);
  const startDate = new Date(Date.now() - (timeframeDays * 24 * 60 * 60 * 1000));

  let query = `
    SELECT
      metric_type,
      trend_direction,
      confidence_score,
      change_percentage,
      trend_strength,
      forecast_value,
      forecast_confidence,
      timestamp,
      metadata
    FROM metrics_trends
    WHERE project_id = $1 AND timestamp >= $2
  `;

  const params = [projectId, startDate];

  if (metricTypes.length > 0) {
    query += ` AND metric_type = ANY($3)`;
    params.push(metricTypes);
  }

  query += ` ORDER BY timestamp DESC, confidence_score DESC`;

  const result = await db.query(query, params);

  return {
    projectId,
    timeframe,
    metricTypes,
    trends: result.rows,
    summary: generateTrendsSummary(result.rows),
    includeForecast,
    forecastPeriods
  };
}

/**
 * Analyze correlations between metrics
 * Replaces: metrics_calculate_correlations
 */
async function analyzeCorrelations(options: any): Promise<any> {
  const {
    projectId,
    metric1,
    metric2,
    timeframe = '30d',
    correlationType = 'pearson',
    includeLagAnalysis = false,
    maxLag = 7
  } = options;

  console.log(`🔗 Analyzing correlations for project: ${projectId}`);

  if (!projectId || !metric1 || !metric2) {
    throw new Error('projectId, metric1, and metric2 are required for correlation analysis');
  }

  // Use correlation service
  const correlationEngine = getMetricsCorrelationEngine();

  const correlationRequest = {
    projectId,
    metric1,
    metric2,
    timeframe: {
      startDate: new Date(Date.now() - (parseTimeframe(timeframe) * 24 * 60 * 60 * 1000)).toISOString(),
      endDate: new Date().toISOString()
    },
    correlationType,
    includeLagAnalysis,
    maxLag
  };

  const correlationResult = await correlationEngine.calculateCorrelation(correlationRequest);

  return {
    projectId,
    metric1,
    metric2,
    timeframe,
    correlationType,
    correlation: correlationResult,
    includeLagAnalysis,
    maxLag
  };
}

/**
 * Analyze executive summary
 * Replaces: metrics_get_executive_summary
 */
async function analyzeExecutiveSummary(options: any): Promise<any> {
  const {
    projectId,
    dateRange,
    includeForecasts = true,
    includeRiskAssessment = true,
    includeRecommendations = true,
    compareToBaseline = false,
    baselinePeriodDays = 30
  } = options;

  console.log(`📋 Analyzing executive summary for project: ${projectId}`);

  if (!projectId || !dateRange) {
    throw new Error('projectId and dateRange are required for executive summary');
  }

  // Use aggregation service
  const aggregationService = getMetricsAggregationService();

  const summaryRequest = {
    projectId,
    dateRange,
    includeForecasts,
    includeRiskAssessment,
    includeRecommendations,
    compareToBaseline,
    baselinePeriodDays
  };

  const executiveSummary = await aggregationService.generateExecutiveSummary(summaryRequest);

  return {
    projectId,
    dateRange,
    summary: executiveSummary,
    options: {
      includeForecasts,
      includeRiskAssessment,
      includeRecommendations,
      compareToBaseline,
      baselinePeriodDays
    },
    generatedAt: new Date().toISOString()
  };
}

/**
 * Analyze project aggregation
 * Replaces: metrics_aggregate_projects
 */
async function analyzeProjectAggregation(options: any): Promise<any> {
  const {
    projectIds,
    timeframe,
    metricTypes,
    aggregationType = 'average',
    groupBy = 'project',
    includeConfidenceMetrics = false
  } = options;

  console.log(`🏢 Analyzing project aggregation for ${projectIds?.length} projects`);

  if (!projectIds || !timeframe || !metricTypes) {
    throw new Error('projectIds, timeframe, and metricTypes are required for project aggregation');
  }

  // Use aggregation service
  const aggregationService = getMetricsAggregationService();

  const aggregationRequest = {
    projectIds,
    timeframe,
    metricTypes,
    aggregationType,
    groupBy,
    includeConfidenceMetrics
  };

  const aggregationResult = await aggregationService.aggregateAcrossProjects(aggregationRequest);

  return {
    projectIds,
    timeframe,
    metricTypes,
    aggregationType,
    groupBy,
    aggregation: aggregationResult,
    includeConfidenceMetrics
  };
}

/**
 * Analyze timeline aggregation
 * Replaces: metrics_aggregate_timeline
 */
async function analyzeTimelineAggregation(options: any): Promise<any> {
  const {
    projectId,
    period = 'daily',
    granularity = 'day',
    metricTypes = [],
    timeframe,
    fillGaps = true,
    smoothing = 'none',
    windowSize = 3
  } = options;

  console.log(`⏰ Analyzing timeline aggregation for project: ${projectId}`);

  if (!projectId || !timeframe) {
    throw new Error('projectId and timeframe are required for timeline aggregation');
  }

  // Use aggregation service
  const aggregationService = getMetricsAggregationService();

  const timelineRequest = {
    projectId,
    period,
    granularity,
    metricTypes,
    startDate: timeframe?.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDate: timeframe?.end || new Date(),
    fillGaps,
    smoothing,
    windowSize
  };

  const timelineResult = await aggregationService.aggregateByTimePeriod(timelineRequest);

  return {
    projectId,
    period,
    granularity,
    metricTypes,
    timeframe,
    timeline: timelineResult,
    options: {
      fillGaps,
      smoothing,
      windowSize
    }
  };
}

/**
 * Parse timeframe string to days
 */
function parseTimeframe(timeframe: string): number {
  switch (timeframe) {
    case '1d': return 1;
    case '7d': return 7;
    case '30d': return 30;
    case '90d': return 90;
    case 'all': return 365 * 2; // 2 years max
    default: return 30;
  }
}

/**
 * Generate summary for trends data
 */
function generateTrendsSummary(trends: any[]): any {
  const trendDirections: Record<string, number> = {};
  let totalConfidence = 0;

  for (const trend of trends) {
    trendDirections[trend.trend_direction] = (trendDirections[trend.trend_direction] || 0) + 1;
    totalConfidence += trend.confidence_score || 0;
  }

  return {
    totalTrends: trends.length,
    averageConfidence: trends.length > 0 ? totalConfidence / trends.length : 0,
    trendDirections,
    highConfidenceTrends: trends.filter(t => t.confidence_score >= 0.8).length,
    latestTimestamp: trends[0]?.timestamp
  };
}

/**
 * Get original tool name for tracking
 */
function getOriginalTool(analysis: string): string {
  switch (analysis) {
    case 'dashboard': return 'metrics_get_dashboard';
    case 'trends': return 'metrics_get_trends';
    case 'correlations': return 'metrics_calculate_correlations';
    case 'executive': return 'metrics_get_executive_summary';
    case 'aggregate_projects': return 'metrics_aggregate_projects';
    case 'aggregate_timeline': return 'metrics_aggregate_timeline';
    default: return 'unknown';
  }
}

/**
 * Get original tools array for metadata
 */
function getOriginalTools(analysis: string): string[] {
  switch (analysis) {
    case 'dashboard': return ['metrics_get_dashboard'];
    case 'trends': return ['metrics_get_trends'];
    case 'correlations': return ['metrics_calculate_correlations'];
    case 'executive': return ['metrics_get_executive_summary'];
    case 'aggregate_projects': return ['metrics_aggregate_projects'];
    case 'aggregate_timeline': return ['metrics_aggregate_timeline'];
    default: return [];
  }
}