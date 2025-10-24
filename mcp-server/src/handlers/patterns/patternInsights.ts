/**
 * TT009-3-2: Pattern Insights Consolidated Tool
 *
 * Unified pattern insights tool that replaces:
 * - pattern_get_alerts: Get real-time pattern alerts for high-risk discoveries
 * - pattern_get_session_insights: Get pattern insights for current session
 * - pattern_get_insights: Get actionable pattern insights with advanced filtering
 * - pattern_get_trends: Analyze pattern trends over time with forecasting
 * - pattern_get_correlations: Find correlations between different pattern types
 * - pattern_get_anomalies: Detect pattern anomalies and outliers with statistical analysis
 * - pattern_get_recommendations: Generate AI-driven pattern-based recommendations
 *
 * Consolidation reduces 7 tools → 1 tool with unified interface.
 * Part of Phase 3 Tool Consolidation (TT009-3)
 */

import { db } from '../../config/database.js';
import { logEvent } from '../../middleware/eventLogger.js';

/**
 * Unified pattern insights interface
 * Consolidates multiple pattern insight endpoints into one coherent API
 */
export async function handlePatternInsights(args: any): Promise<any> {
  const startTime = Date.now();

  try {
    const { type, options = {} } = args;

    console.log(`🎯 pattern_insights(type: ${type})`);

    // Validate required parameters
    if (!type) {
      return {
        success: false,
        error: 'type parameter is required',
        validTypes: ['alerts', 'session', 'insights', 'trends', 'correlations', 'anomalies', 'recommendations']
      };
    }

    let result;
    const executionTime = Date.now() - startTime;

    switch (type) {
      case 'alerts':
        result = await getPatternAlerts(options);
        break;

      case 'session':
        result = await getSessionInsights(options);
        break;

      case 'insights':
        result = await getActionableInsights(options);
        break;

      case 'trends':
        result = await getPatternTrends(options);
        break;

      case 'correlations':
        result = await getPatternCorrelations(options);
        break;

      case 'anomalies':
        result = await getPatternAnomalies(options);
        break;

      case 'recommendations':
        result = await getPatternRecommendations(options);
        break;

      default:
        return {
          success: false,
          error: `Invalid insight type: ${type}`,
          validTypes: ['alerts', 'session', 'insights', 'trends', 'correlations', 'anomalies', 'recommendations'],
          providedType: type
        };
    }

    // Log successful pattern insights operation
    await logEvent({
      actor: 'ai',
      event_type: 'pattern_insights_consolidated',
      status: 'closed',
      metadata: {
        type,
        executionTimeMs: executionTime,
        toolType: 'consolidated',
        phase: 'TT009-3',
        originalTools: getOriginalTools(type)
      }
    });

    return {
      success: true,
      type,
      executionTimeMs: executionTime,
      data: result,
      consolidationInfo: {
        phase: 'TT009-3-2',
        originalToolReplaced: getOriginalTool(type),
        tokenSavings: 'Part of ~7,000 token Phase 3 savings'
      }
    };

  } catch (error) {
    const executionTime = Date.now() - startTime;

    console.error(`❌ pattern_insights failed:`, error);

    // Log failed pattern insights operation
    await logEvent({
      actor: 'ai',
      event_type: 'pattern_insights_consolidated_failed',
      status: 'error',
      metadata: {
        type: args.type,
        executionTimeMs: executionTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        phase: 'TT009-3'
      }
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      type: args.type,
      executionTimeMs: executionTime
    };
  }
}

/**
 * Get pattern alerts
 * Replaces: pattern_get_alerts
 */
async function getPatternAlerts(options: any): Promise<any> {
  const {
    severity = ['medium', 'high', 'critical'],
    status = 'active',
    projectId,
    sessionId,
    limit = 50,
    includeResolved = false
  } = options;

  console.log(`🚨 Getting pattern alerts`);

  let query = `
    SELECT
      alert_id,
      pattern_type,
      severity,
      status,
      message,
      confidence_score,
      risk_level,
      created_at,
      acknowledged_at,
      resolved_at,
      metadata
    FROM pattern_alerts
    WHERE 1=1
  `;

  const params = [];
  let paramCount = 0;

  if (projectId) {
    query += ` AND project_id = $${++paramCount}`;
    params.push(projectId);
  }

  if (sessionId) {
    query += ` AND session_id = $${++paramCount}`;
    params.push(sessionId);
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
    type: 'alerts',
    projectId,
    sessionId,
    severity,
    status,
    includeResolved,
    totalAlerts: result.rows.length,
    alerts: result.rows,
    summary: generateAlertsSummary(result.rows)
  };
}

/**
 * Get session insights
 * Replaces: pattern_get_session_insights
 */
async function getSessionInsights(options: any): Promise<any> {
  const {
    sessionId
  } = options;

  console.log(`📝 Getting session insights for: ${sessionId}`);

  // Stub implementation - these methods are deprecated
  return {
    message: 'Session insights analysis deprecated',
    sessionId,
    insights: [],
    patterns: []
  };
}

/**
 * Get actionable insights
 * Replaces: pattern_get_insights
 */
async function getActionableInsights(options: any): Promise<any> {
  const {
    patternTypes: _patternTypes = ['all'],
    riskLevels: _riskLevels = ['medium', 'high', 'critical'],
    minConfidence: _minConfidence = 0.7,
    maxAge: _maxAge = '30d',
    includeRecommendations: _includeRecommendations = true,
    limitResults: _limitResults = 100
  } = options;

  console.log(`💡 Getting actionable insights`);

  // Stub implementation - these methods are deprecated
  return {
    message: 'Actionable insights analysis deprecated',
    insights: [],
    recommendations: []
  };
}

/**
 * Get pattern trends
 * Replaces: pattern_get_trends
 */
async function getPatternTrends(options: any): Promise<any> {
  const {
    patternTypes: _patternTypes = ['all'],
    timeframe: _timeframe = '30d',
    includeForecast: _includeForecast = true,
    forecastPeriods: _forecastPeriods = 7,
    granularity: _granularity = 'daily',
    smoothing: _smoothing = 'moving_average',
    projectId: _projectId
  } = options;

  console.log(`📈 Getting pattern trends`);

  // Stub implementation - these methods are deprecated
  return {
    message: 'Trend analysis deprecated',
    trends: [],
    forecast: []
  };
}

/**
 * Get pattern correlations
 * Replaces: pattern_get_correlations
 */
async function getPatternCorrelations(options: any): Promise<any> {
  const {
    patternType1: _patternType1,
    patternType2: _patternType2,
    correlationType: _correlationType = 'pearson',
    timeframe: _timeframe = '30d',
    minConfidence: _minConfidence = 0.5,
    includeLagAnalysis: _includeLagAnalysis = false,
    maxLag: _maxLag = 7,
    projectId: _projectId
  } = options;

  console.log(`🔗 Getting pattern correlations`);

  // Stub implementation - these methods are deprecated
  return {
    message: 'Correlation analysis deprecated',
    correlations: [],
    coefficient: 0
  };
}

/**
 * Get pattern anomalies
 * Replaces: pattern_get_anomalies
 */
async function getPatternAnomalies(options: any): Promise<any> {
  const {
    patternTypes: _patternTypes = ['all'],
    detectionMethod: _detectionMethod = 'statistical',
    sensitivityLevel: _sensitivityLevel = 'medium',
    timeframe: _timeframe = '30d',
    includeContext: _includeContext = true,
    projectId: _projectId,
    limitResults: _limitResults = 50
  } = options;

  console.log(`🔍 Getting pattern anomalies`);

  // Stub implementation - these methods are deprecated
  return {
    message: 'Anomaly detection deprecated',
    anomalies: [],
    detectedCount: 0
  };
}

/**
 * Get pattern recommendations
 * Replaces: pattern_get_recommendations
 */
async function getPatternRecommendations(options: any): Promise<any> {
  const {
    contextType: _contextType = 'development',
    includeActionItems: _includeActionItems = true,
    includePrioritization: _includePrioritization = true,
    includeRiskAssessment: _includeRiskAssessment = true,
    maxRecommendations: _maxRecommendations = 20,
    projectId,
    sessionId
  } = options;

  console.log(`🎯 Getting pattern recommendations`);

  // Stub implementation - pattern recommendations deprecated
  // Return structured response matching expected API format
  return {
    success: true,
    projectId: projectId || null,
    sessionId: sessionId || null,
    recommendations: [],
    actionItems: [],
    prioritization: {
      immediate: [],
      shortTerm: [],
      mediumTerm: [],
      longTerm: []
    },
    riskAssessment: {
      highPriority: [],
      mediumPriority: [],
      lowPriority: []
    },
    summary: {
      totalRecommendations: 0,
      implementationComplexity: 'low',
      estimatedEffort: 'minimal'
    },
    message: 'Pattern recommendations analysis is deprecated. Use alternative pattern analysis tools.'
  };
}

/**
 * Generate summary for alerts
 */
function generateAlertsSummary(alerts: any[]): any {
  const severityCount: Record<string, number> = {};
  const statusCount: Record<string, number> = {};
  const patternTypeCount: Record<string, number> = {};

  for (const alert of alerts) {
    severityCount[alert.severity] = (severityCount[alert.severity] || 0) + 1;
    statusCount[alert.status] = (statusCount[alert.status] || 0) + 1;
    patternTypeCount[alert.pattern_type] = (patternTypeCount[alert.pattern_type] || 0) + 1;
  }

  return {
    totalAlerts: alerts.length,
    severityDistribution: severityCount,
    statusDistribution: statusCount,
    patternTypeDistribution: patternTypeCount,
    criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
    unresolvedAlerts: alerts.filter(a => a.status !== 'resolved').length,
    averageConfidence: alerts.length > 0
      ? alerts.reduce((sum, a) => sum + (a.confidence_score || 0), 0) / alerts.length
      : 0
  };
}

/**
 * Get original tool name for tracking
 */
function getOriginalTool(type: string): string {
  switch (type) {
    case 'alerts': return 'pattern_get_alerts';
    case 'session': return 'pattern_get_session_insights';
    case 'insights': return 'pattern_get_insights';
    case 'trends': return 'pattern_get_trends';
    case 'correlations': return 'pattern_get_correlations';
    case 'anomalies': return 'pattern_get_anomalies';
    case 'recommendations': return 'pattern_get_recommendations';
    default: return 'unknown';
  }
}

/**
 * Get original tools array for metadata
 */
function getOriginalTools(type: string): string[] {
  switch (type) {
    case 'alerts': return ['pattern_get_alerts'];
    case 'session': return ['pattern_get_session_insights'];
    case 'insights': return ['pattern_get_insights'];
    case 'trends': return ['pattern_get_trends'];
    case 'correlations': return ['pattern_get_correlations'];
    case 'anomalies': return ['pattern_get_anomalies'];
    case 'recommendations': return ['pattern_get_recommendations'];
    default: return [];
  }
}