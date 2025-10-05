/**
 * TC014: Development Metrics MCP API Handlers
 * 
 * Provides comprehensive API endpoints for accessing actionable development intelligence:
 * - Metrics collection and analysis
 * - Real-time dashboard queries  
 * - Alert management and monitoring
 * - Trend analysis and forecasting
 * - Performance optimization insights
 * 
 * Performance Target: Sub-100ms API response times for dashboard queries
 */

import { db } from '../../config/database.js';
import { logEvent } from '../../middleware/eventLogger.js';
import { getCurrentSession } from '../../services/sessionManager.js';
import {
  // MetricsCollector,
  startMetricsCollection,
  stopMetricsCollection,
  collectProjectMetrics,
  getMetricsCollectionPerformance,
  // MetricsCollectionResult
} from '../../services/metricsCollector.js';

// MCP Tool Definitions for Development Metrics
const DEVELOPMENT_METRICS_TOOLS = [
  {
    name: 'metrics_collect_project',
    description: 'Trigger comprehensive metrics collection for a project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID to collect metrics for'
        },
        trigger: {
          type: 'string',
          enum: ['manual', 'git_commit', 'scheduled', 'pattern_update', 'session_end'],
          description: 'What triggered this collection',
          default: 'manual'
        },
        startDate: {
          type: 'string',
          description: 'Analysis start date (ISO format), defaults to 30 days ago'
        },
        endDate: {
          type: 'string',
          description: 'Analysis end date (ISO format), defaults to now'
        }
      },
      required: ['projectId']
    }
  },
  {
    name: 'metrics_get_dashboard',
    description: 'Get comprehensive project metrics dashboard data with sub-100ms performance',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID to get dashboard for'
        },
        timeframe: {
          type: 'string',
          enum: ['1d', '7d', '30d', '90d', 'all'],
          description: 'Time period for metrics',
          default: '30d'
        },
        includeAlerts: {
          type: 'boolean',
          description: 'Include active alerts in response',
          default: true
        },
        includeTrends: {
          type: 'boolean', 
          description: 'Include trend analysis',
          default: true
        }
      },
      required: ['projectId']
    }
  },
  {
    name: 'metrics_get_core_metrics',
    description: 'Get detailed core development metrics (velocity, quality, debt, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID'
        },
        metricTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['code_velocity', 'development_focus', 'change_frequency', 'volatility_index', 'technical_debt_accumulation', 'quality_trend']
          },
          description: 'Specific metric types to retrieve'
        },
        scope: {
          type: 'string',
          enum: ['project', 'developer', 'file', 'component'],
          description: 'Scope of metrics to retrieve',
          default: 'project'
        },
        timeframe: {
          type: 'string',
          enum: ['1d', '7d', '30d', '90d'],
          description: 'Time period for metrics',
          default: '30d'
        },
        includeBaselines: {
          type: 'boolean',
          description: 'Include baseline comparisons',
          default: true
        }
      },
      required: ['projectId']
    }
  },
  {
    name: 'metrics_get_pattern_intelligence',
    description: 'Get pattern-based intelligence metrics (coupling, hotspots, specialization)',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID'
        },
        intelligenceTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['coupling_strength', 'hotspot_risk', 'specialization_depth', 'knowledge_distribution', 'change_prediction', 'quality_forecast']
          },
          description: 'Specific intelligence types to retrieve'
        },
        riskLevels: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['very_low', 'low', 'moderate', 'high', 'very_high', 'critical']
          },
          description: 'Filter by risk levels'
        },
        minConfidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Minimum confidence level (0-1)',
          default: 0.5
        }
      },
      required: ['projectId']
    }
  },
  {
    name: 'metrics_get_productivity_health',
    description: 'Get developer productivity and health metrics',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID'
        },
        developerEmail: {
          type: 'string',
          description: 'Specific developer email (optional, returns all if not provided)'
        },
        teamIdentifier: {
          type: 'string',
          description: 'Specific team identifier (optional)'
        },
        productivityTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['session_productivity', 'rhythm_consistency', 'context_switching', 'focus_depth', 'decision_speed', 'collaboration_quality']
          },
          description: 'Specific productivity metrics to retrieve'
        },
        timeframe: {
          type: 'string',
          enum: ['1d', '7d', '30d', '90d'],
          description: 'Time period for metrics',
          default: '30d'
        },
        includeHealthRisks: {
          type: 'boolean',
          description: 'Include health risk indicators',
          default: true
        }
      },
      required: ['projectId']
    }
  },
  {
    name: 'metrics_get_alerts',
    description: 'Get active metrics alerts and notifications',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID (optional, returns all projects if not provided)'
        },
        severities: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['info', 'warning', 'error', 'critical']
          },
          description: 'Filter by alert severities'
        },
        statuses: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['open', 'acknowledged', 'investigating', 'resolved', 'false_positive', 'suppressed']
          },
          description: 'Filter by alert statuses',
          default: ['open', 'acknowledged']
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of alerts to return',
          default: 20
        },
        includePriority: {
          type: 'boolean',
          description: 'Include priority scoring',
          default: true
        }
      }
    }
  },
  {
    name: 'metrics_acknowledge_alert',
    description: 'Acknowledge a metrics alert',
    inputSchema: {
      type: 'object',
      properties: {
        alertId: {
          type: 'string',
          description: 'Alert ID to acknowledge'
        },
        acknowledgedBy: {
          type: 'string',
          description: 'Name/email of person acknowledging (optional, uses current session)'
        },
        notes: {
          type: 'string',
          description: 'Optional acknowledgment notes'
        }
      },
      required: ['alertId']
    }
  },
  {
    name: 'metrics_resolve_alert',
    description: 'Mark a metrics alert as resolved',
    inputSchema: {
      type: 'object',
      properties: {
        alertId: {
          type: 'string',
          description: 'Alert ID to resolve'
        },
        resolvedBy: {
          type: 'string',
          description: 'Name/email of person resolving (optional, uses current session)'
        },
        resolutionNotes: {
          type: 'string',
          description: 'Resolution notes and actions taken'
        }
      },
      required: ['alertId', 'resolutionNotes']
    }
  },
  {
    name: 'metrics_get_trends',
    description: 'Get metrics trends and forecasting data',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID'
        },
        metricTypes: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Specific metric types to get trends for'
        },
        trendTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['linear', 'exponential', 'seasonal', 'cyclical', 'volatile', 'step_change']
          },
          description: 'Types of trends to include'
        },
        forecastDays: {
          type: 'number',
          minimum: 1,
          maximum: 365,
          description: 'Number of days to forecast',
          default: 30
        },
        minConfidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Minimum forecast confidence',
          default: 0.6
        }
      },
      required: ['projectId']
    }
  },
  {
    name: 'metrics_get_performance',
    description: 'Get metrics collection system performance statistics',
    inputSchema: {
      type: 'object',
      properties: {
        includeHistory: {
          type: 'boolean',
          description: 'Include historical performance data',
          default: false
        }
      }
    }
  },
  {
    name: 'metrics_start_collection',
    description: 'Start the metrics collection service',
    inputSchema: {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          description: 'Optional configuration overrides',
          properties: {
            enableRealTimeCollection: { type: 'boolean' },
            enableBatchProcessing: { type: 'boolean' },
            scheduledCollectionIntervalMs: { type: 'number' },
            autoCollectOnCommit: { type: 'boolean' }
          }
        }
      }
    }
  },
  {
    name: 'metrics_stop_collection',
    description: 'Stop the metrics collection service',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

/**
 * Development Metrics Handler Class
 */
export class DevelopmentMetricsHandler {
  /**
   * Get all available development metrics tools
   */
  static getTools() {
    return DEVELOPMENT_METRICS_TOOLS;
  }

  /**
   * Handle development metrics tool calls
   */
  static async handleTool(name: string, args: any): Promise<any> {
    const startTime = Date.now();

    try {
      console.log(`🔧 Handling metrics tool: ${name}`);

      let result;
      switch (name) {
        case 'metrics_collect_project':
          result = await this.collectProjectMetrics(args);
          break;
        case 'metrics_get_dashboard':
          result = await this.getDashboardMetrics(args);
          break;
        case 'metrics_get_core_metrics':
          result = await this.getCoreMetrics(args);
          break;
        case 'metrics_get_pattern_intelligence':
          result = await this.getPatternIntelligenceMetrics(args);
          break;
        case 'metrics_get_productivity_health':
          result = await this.getProductivityHealthMetrics(args);
          break;
        case 'metrics_get_alerts':
          result = await this.getMetricsAlerts(args);
          break;
        case 'metrics_acknowledge_alert':
          result = await this.acknowledgeAlert(args);
          break;
        case 'metrics_resolve_alert':
          result = await this.resolveAlert(args);
          break;
        case 'metrics_get_trends':
          result = await this.getMetricsTrends(args);
          break;
        case 'metrics_get_performance':
          result = await this.getPerformanceStats(args);
          break;
        case 'metrics_start_collection':
          result = await this.startCollection(args);
          break;
        case 'metrics_stop_collection':
          result = await this.stopCollection(args);
          break;
        default:
          throw new Error(`Unknown development metrics tool: ${name}`);
      }

      const executionTime = Date.now() - startTime;

      // Log tool execution
      await logEvent({
        actor: 'human',
        event_type: 'metrics_tool_executed',
        status: 'closed',
        metadata: {
          toolName: name,
          executionTimeMs: executionTime,
          success: true,
          args: Object.keys(args)
        },
        tags: ['metrics', 'mcp', 'tool']
      });

      console.log(`✅ Metrics tool ${name} completed in ${executionTime}ms`);
      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      console.error(`❌ Metrics tool ${name} failed:`, error);

      // Log tool error
      await logEvent({
        actor: 'human', 
        event_type: 'metrics_tool_error',
        status: 'error',
        metadata: {
          toolName: name,
          executionTimeMs: executionTime,
          error: error instanceof Error ? error.message : 'Unknown error',
          args: Object.keys(args)
        },
        tags: ['metrics', 'mcp', 'error']
      });

      throw error;
    }
  }

  /**
   * Trigger comprehensive metrics collection for a project
   */
  private static async collectProjectMetrics(args: any): Promise<any> {
    const { projectId, trigger = 'manual' } = args;

    try {
      // Trigger metrics collection
      const result = await collectProjectMetrics(projectId, trigger);

      return {
        success: true,
        message: `Metrics collection completed for project ${projectId}`,
        collectionSessionId: result.collectionSessionId,
        executionTimeMs: result.executionTimeMs,
        summary: {
          totalMetricsCalculated: result.totalMetricsCalculated,
          alertsGenerated: result.alertsGenerated,
          thresholdsExceeded: result.thresholdsExceeded,
          dataCompletenessScore: result.dataCompletenessScore,
          confidenceScore: result.confidenceScore
        },
        breakdown: {
          coreMetrics: result.coreMetrics.length,
          patternIntelligenceMetrics: result.patternIntelligenceMetrics.length,
          productivityHealthMetrics: result.productivityHealthMetrics.length,
          alertsCreated: result.alertsCreated.length,
          trendsUpdated: result.trendsUpdated.length
        },
        performance: {
          coreMetricsTimeMs: result.coreMetricsTimeMs,
          patternMetricsTimeMs: result.patternMetricsTimeMs,
          productivityMetricsTimeMs: result.productivityMetricsTimeMs,
          aggregationTimeMs: result.aggregationTimeMs
        },
        dataAnalyzed: {
          commitsAnalyzed: result.commitsAnalyzed,
          filesAnalyzed: result.filesAnalyzed,
          sessionsAnalyzed: result.sessionsAnalyzed,
          patternsAnalyzed: result.patternsAnalyzed
        },
        errors: result.errors
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Metrics collection failed',
        projectId
      };
    }
  }

  /**
   * Get comprehensive dashboard metrics with optimized performance
   */
  private static async getDashboardMetrics(args: any): Promise<any> {
    const { projectId, timeframe = '30d', includeAlerts = true, includeTrends = true } = args;

    try {
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

      const response: any = {
        success: true,
        projectId,
        projectName: dashboard.project_name,
        lastCollection: dashboard.last_collection,
        dataFreshness: {
          hoursAgo: Math.round(dashboard.hours_since_collection),
          dataCompleteness: dashboard.data_completeness_score,
          confidence: dashboard.confidence_score
        },
        coreMetrics: {
          codeVelocity: dashboard.avg_code_velocity,
          qualityTrend: dashboard.quality_trend,
          technicalDebtLevel: dashboard.technical_debt_level,
          velocityTrend: dashboard.velocity_trend
        },
        patternIntelligence: {
          highRiskFiles: dashboard.high_risk_files,
          avgCouplingStrength: dashboard.avg_coupling_strength,
          activeHotspots: dashboard.active_hotspots
        },
        productivity: {
          teamAvgProductivity: dashboard.team_avg_productivity,
          teamHealthScore: dashboard.team_health_score,
          collaborationEffectiveness: dashboard.collaboration_effectiveness,
          productivityTrend: dashboard.productivity_trend
        },
        performance: {
          lastExecutionTimeMs: dashboard.last_execution_time
        }
      };

      // Include active alerts if requested
      if (includeAlerts) {
        const alertsQuery = `
          SELECT 
            alert_type, severity, urgency, title, description,
            trigger_timestamp, priority_score, affected_areas
          FROM high_priority_alerts_summary
          WHERE project_id = $1
          ORDER BY priority_score DESC, trigger_timestamp DESC
          LIMIT 10
        `;

        const alertsResult = await db.query(alertsQuery, [projectId]);
        response.activeAlerts = {
          critical: dashboard.critical_alerts,
          warnings: dashboard.warning_alerts,
          total: dashboard.total_active_alerts,
          recent: alertsResult.rows
        };
      }

      // Include trend analysis if requested
      if (includeTrends) {
        const trendsQuery = `
          SELECT 
            metric_type, direction, strength, r_squared,
            forecast_confidence, forecast_horizon_days
          FROM metrics_trends
          WHERE project_id = $1 
            AND is_active = TRUE
            AND r_squared >= 0.5
          ORDER BY strength DESC
          LIMIT 5
        `;

        const trendsResult = await db.query(trendsQuery, [projectId]);
        response.keyTrends = trendsResult.rows;
      }

      return response;

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Dashboard query failed',
        projectId
      };
    }
  }

  /**
   * Get detailed core development metrics
   */
  private static async getCoreMetrics(args: any): Promise<any> {
    const { 
      projectId, 
      metricTypes, 
      scope = 'project', 
      timeframe = '30d', 
      includeBaselines = true 
    } = args;

    try {
      const timeframeDays = this.parseTimeframe(timeframe);
      const startDate = new Date(Date.now() - (timeframeDays * 24 * 60 * 60 * 1000));

      let whereClause = 'WHERE project_id = $1 AND period_end >= $2 AND is_active = TRUE';
      let queryParams: any[] = [projectId, startDate];
      let paramIndex = 3;

      if (metricTypes && metricTypes.length > 0) {
        whereClause += ` AND metric_type = ANY($${paramIndex})`;
        queryParams.push(metricTypes);
        paramIndex++;
      }

      if (scope !== 'all') {
        whereClause += ` AND metric_scope = $${paramIndex}`;
        queryParams.push(scope);
      }

      const metricsQuery = `
        SELECT 
          metric_type, metric_scope, scope_identifier,
          period_start, period_end, metric_value, metric_unit,
          normalized_value, percentile_rank,
          ${includeBaselines ? 'baseline_value, change_from_baseline, percent_change_from_baseline,' : ''}
          trend_direction, trend_strength, change_significance,
          data_quality_score, measurement_confidence, sample_size,
          contributing_commits, contributing_files, contributing_developers,
          alert_triggered, alert_severity,
          created_at
        FROM core_development_metrics
        ${whereClause}
        ORDER BY metric_type, period_end DESC
      `;

      const result = await db.query(metricsQuery, queryParams);
      const metrics = result.rows;

      // Group metrics by type for easier consumption
      const groupedMetrics: any = {};
      for (const metric of metrics) {
        if (!groupedMetrics[metric.metric_type]) {
          groupedMetrics[metric.metric_type] = [];
        }
        groupedMetrics[metric.metric_type].push(metric);
      }

      // Calculate summary statistics
      const summary = {
        totalMetrics: metrics.length,
        metricTypes: Object.keys(groupedMetrics).length,
        alertsTriggered: metrics.filter(m => m.alert_triggered).length,
        avgConfidence: metrics.length > 0 ? 
          metrics.reduce((sum, m) => sum + parseFloat(m.measurement_confidence), 0) / metrics.length : 0,
        timeframe: `${timeframeDays} days`,
        scope
      };

      return {
        success: true,
        projectId,
        summary,
        metricsByType: groupedMetrics,
        allMetrics: metrics
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Core metrics query failed',
        projectId
      };
    }
  }

  /**
   * Get pattern-based intelligence metrics
   */
  private static async getPatternIntelligenceMetrics(args: any): Promise<any> {
    const { 
      projectId, 
      intelligenceTypes, 
      riskLevels, 
      minConfidence = 0.5 
    } = args;

    try {
      let whereClause = 'WHERE project_id = $1 AND is_active = TRUE AND confidence_level >= $2';
      let queryParams: any[] = [projectId, minConfidence];
      let paramIndex = 3;

      if (intelligenceTypes && intelligenceTypes.length > 0) {
        whereClause += ` AND intelligence_type = ANY($${paramIndex})`;
        queryParams.push(intelligenceTypes);
        paramIndex++;
      }

      if (riskLevels && riskLevels.length > 0) {
        whereClause += ` AND risk_rating = ANY($${paramIndex})`;
        queryParams.push(riskLevels);
      }

      const intelligenceQuery = `
        SELECT 
          intelligence_type, metric_scope, scope_identifier,
          intelligence_score, confidence_level, risk_rating,
          strength_magnitude, frequency_factor, impact_radius,
          evolution_trend, trend_velocity,
          forecast_direction, forecast_confidence, forecast_horizon_days,
          business_impact_score, technical_impact_score, team_impact_score,
          intervention_urgency, intervention_difficulty, expected_improvement_score,
          created_at, updated_at, next_evaluation_date
        FROM pattern_intelligence_metrics
        ${whereClause}
        ORDER BY 
          CASE risk_rating 
            WHEN 'critical' THEN 1 
            WHEN 'very_high' THEN 2 
            WHEN 'high' THEN 3 
            ELSE 4 
          END,
          intelligence_score DESC,
          confidence_level DESC
      `;

      const result = await db.query(intelligenceQuery, queryParams);
      const intelligence = result.rows;

      // Categorize by risk level and intelligence type
      const riskCategories: any = {
        critical: intelligence.filter(i => i.risk_rating === 'critical'),
        very_high: intelligence.filter(i => i.risk_rating === 'very_high'),
        high: intelligence.filter(i => i.risk_rating === 'high'),
        moderate: intelligence.filter(i => i.risk_rating === 'moderate'),
        low: intelligence.filter(i => ['low', 'very_low'].includes(i.risk_rating))
      };

      const typeCategories: any = {};
      for (const item of intelligence) {
        if (!typeCategories[item.intelligence_type]) {
          typeCategories[item.intelligence_type] = [];
        }
        typeCategories[item.intelligence_type].push(item);
      }

      // Calculate summary insights
      const summary = {
        totalIntelligence: intelligence.length,
        highRiskItems: riskCategories.critical.length + riskCategories.very_high.length + riskCategories.high.length,
        avgConfidence: intelligence.length > 0 ? 
          intelligence.reduce((sum, i) => sum + parseFloat(i.confidence_level), 0) / intelligence.length : 0,
        urgentInterventions: intelligence.filter(i => i.intervention_urgency === 'immediate').length,
        forecastableItems: intelligence.filter(i => i.forecast_confidence && parseFloat(i.forecast_confidence) > 0.6).length
      };

      return {
        success: true,
        projectId,
        summary,
        byRiskLevel: riskCategories,
        byIntelligenceType: typeCategories,
        allIntelligence: intelligence
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Pattern intelligence query failed',
        projectId
      };
    }
  }

  /**
   * Get developer productivity and health metrics
   */
  private static async getProductivityHealthMetrics(args: any): Promise<any> {
    const { 
      projectId, 
      developerEmail, 
      teamIdentifier, 
      productivityTypes, 
      timeframe = '30d',
      includeHealthRisks = true 
    } = args;

    try {
      const timeframeDays = this.parseTimeframe(timeframe);
      const startDate = new Date(Date.now() - (timeframeDays * 24 * 60 * 60 * 1000));

      let whereClause = 'WHERE project_id = $1 AND measurement_period_end >= $2 AND is_active = TRUE';
      let queryParams: any[] = [projectId, startDate];
      let paramIndex = 3;

      if (developerEmail) {
        whereClause += ` AND developer_email = $${paramIndex}`;
        queryParams.push(developerEmail);
        paramIndex++;
      }

      if (teamIdentifier) {
        whereClause += ` AND team_identifier = $${paramIndex}`;
        queryParams.push(teamIdentifier);
        paramIndex++;
      }

      if (productivityTypes && productivityTypes.length > 0) {
        whereClause += ` AND productivity_type = ANY($${paramIndex})`;
        queryParams.push(productivityTypes);
      }

      // Use the materialized view for better performance
      const productivityQuery = `
        SELECT 
          developer_email, developer_name, team_identifier,
          current_productivity, current_efficiency, current_quality,
          workload_sustainability_score, stress_level_indicator, burnout_risk_score,
          performance_trend, baseline_comparison_score, team_relative_score,
          collaboration_frequency, communication_effectiveness_score, knowledge_sharing_score,
          learning_velocity_score, skill_acquisition_rate, problem_complexity_handled,
          last_measured, energy_pattern_type, optimal_session_length_minutes,
          health_risk_category
        FROM developer_productivity_summary
        WHERE project_id = $1
        ${developerEmail ? ' AND developer_email = $2' : ''}
        ${teamIdentifier ? ` AND team_identifier = $${developerEmail ? '3' : '2'}` : ''}
        ORDER BY current_productivity DESC, last_measured DESC
      `;

      const summaryParams = [projectId];
      if (developerEmail) summaryParams.push(developerEmail);
      if (teamIdentifier) summaryParams.push(teamIdentifier);

      const summaryResult = await db.query(productivityQuery, summaryParams);
      const productivitySummary = summaryResult.rows;

      // Get detailed metrics if needed
      const detailedQuery = `
        SELECT 
          productivity_type, developer_email, developer_name,
          measurement_period_start, measurement_period_end,
          productivity_score, efficiency_ratio, quality_score,
          rhythm_regularity_score, peak_performance_hours, energy_pattern_type,
          deep_work_percentage, context_switches_count, context_switch_cost_minutes,
          decision_latency_minutes, decision_quality_score,
          lines_per_focused_hour, commits_per_session, time_to_first_commit_minutes,
          first_time_quality_score, review_readiness_score,
          workload_sustainability_score, stress_level_indicator, burnout_risk_score,
          performance_trend, trend_confidence
        FROM productivity_health_metrics
        ${whereClause}
        ORDER BY measurement_period_end DESC, productivity_score DESC
      `;

      const detailedResult = await db.query(detailedQuery, queryParams);
      const detailedMetrics = detailedResult.rows;

      // Calculate team statistics
      const teamStats = this.calculateTeamProductivityStats(productivitySummary);

      // Identify health risks if requested
      let healthRisks: any[] = [];
      if (includeHealthRisks) {
        healthRisks = productivitySummary
          .filter(dev => ['high_burnout_risk', 'unsustainable_workload', 'performance_decline', 'excessive_stress'].includes(dev.health_risk_category))
          .map(dev => ({
            developerEmail: dev.developer_email,
            developerName: dev.developer_name,
            riskCategory: dev.health_risk_category,
            burnoutRisk: dev.burnout_risk_score,
            workloadSustainability: dev.workload_sustainability_score,
            stressLevel: dev.stress_level_indicator,
            recommendations: this.getHealthRiskRecommendations(dev.health_risk_category)
          }));
      }

      return {
        success: true,
        projectId,
        timeframe: `${timeframeDays} days`,
        summary: {
          totalDevelopers: productivitySummary.length,
          avgProductivity: teamStats.avgProductivity,
          avgHealthScore: teamStats.avgHealthScore,
          developersAtRisk: healthRisks.length,
          highPerformers: productivitySummary.filter(d => d.current_productivity > teamStats.avgProductivity * 1.2).length
        },
        teamStatistics: teamStats,
        developerSummaries: productivitySummary,
        detailedMetrics: detailedMetrics,
        healthRisks: healthRisks
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Productivity health query failed',
        projectId
      };
    }
  }

  /**
   * Get active metrics alerts
   */
  private static async getMetricsAlerts(args: any): Promise<any> {
    const {
      projectId,
      severities,
      statuses = ['open', 'acknowledged'],
      limit = 20
    } = args;

    try {
      let whereClause = '1=1';
      let queryParams: any[] = [];
      let paramIndex = 1;

      if (projectId) {
        whereClause += ` AND project_id = $${paramIndex}`;
        queryParams.push(projectId);
        paramIndex++;
      }

      if (severities && severities.length > 0) {
        whereClause += ` AND severity = ANY($${paramIndex})`;
        queryParams.push(severities);
        paramIndex++;
      }

      if (statuses && statuses.length > 0) {
        whereClause += ` AND status = ANY($${paramIndex})`;
        queryParams.push(statuses);
        paramIndex++;
      }

      const alertsQuery = `
        SELECT 
          ma.id, ma.project_id, p.name as project_name,
          ma.alert_type, ma.metric_type, ma.metric_scope, ma.scope_identifier,
          ma.severity, ma.priority, ma.urgency, ma.title, ma.description,
          ma.trigger_value, ma.threshold_value, ma.baseline_value,
          ma.estimated_impact, ma.immediate_actions, ma.recommended_actions,
          ma.affected_areas, ma.ripple_effect_score,
          ma.trigger_timestamp, ma.status, ma.acknowledged_at, ma.acknowledged_by,
          EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ma.trigger_timestamp)) / 3600 as hours_since_triggered,
          ma.follow_up_required, ma.follow_up_date, ma.escalation_level
        FROM metrics_alerts ma
        JOIN projects p ON ma.project_id = p.id
        WHERE ${whereClause}
        ORDER BY 
          CASE ma.severity 
            WHEN 'critical' THEN 1 
            WHEN 'error' THEN 2 
            WHEN 'warning' THEN 3 
            ELSE 4 
          END,
          ma.priority ASC,
          ma.trigger_timestamp DESC
        LIMIT $${paramIndex}
      `;

      queryParams.push(limit);

      const result = await db.query(alertsQuery, queryParams);
      const alerts = result.rows;

      // Calculate summary statistics
      const summary = {
        totalAlerts: alerts.length,
        bySeverity: {
          critical: alerts.filter(a => a.severity === 'critical').length,
          error: alerts.filter(a => a.severity === 'error').length,
          warning: alerts.filter(a => a.severity === 'warning').length,
          info: alerts.filter(a => a.severity === 'info').length
        },
        byStatus: {
          open: alerts.filter(a => a.status === 'open').length,
          acknowledged: alerts.filter(a => a.status === 'acknowledged').length,
          investigating: alerts.filter(a => a.status === 'investigating').length
        },
        requireFollowUp: alerts.filter(a => a.follow_up_required).length,
        avgHoursSinceTriggered: alerts.length > 0 ? 
          alerts.reduce((sum, a) => sum + parseFloat(a.hours_since_triggered), 0) / alerts.length : 0
      };

      // Group alerts by type and scope for analysis
      const groupedAlerts = {
        byType: this.groupBy(alerts, 'alert_type'),
        byMetricType: this.groupBy(alerts, 'metric_type'),
        byProject: this.groupBy(alerts, 'project_id')
      };

      return {
        success: true,
        summary,
        alerts,
        groupedAlerts,
        query: {
          filters: { projectId, severities, statuses, limit },
          resultsCount: alerts.length,
          hasMore: alerts.length === limit
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Alerts query failed'
      };
    }
  }

  /**
   * Acknowledge a metrics alert
   */
  private static async acknowledgeAlert(args: any): Promise<any> {
    const { alertId, acknowledgedBy, notes } = args;

    try {
      const sessionId = await getCurrentSession();
      const acknowledger = acknowledgedBy || `session_${sessionId}`;

      const updateQuery = `
        UPDATE metrics_alerts 
        SET 
          status = 'acknowledged',
          acknowledged_at = CURRENT_TIMESTAMP,
          acknowledged_by = $2,
          resolution_notes = COALESCE(resolution_notes || E'\\n\\n', '') || 'ACKNOWLEDGED: ' || $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status IN ('open', 'investigating')
        RETURNING id, title, severity, project_id
      `;

      const result = await db.query(updateQuery, [
        alertId,
        acknowledger,
        notes || 'Alert acknowledged'
      ]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Alert not found or cannot be acknowledged',
          alertId
        };
      }

      const alert = result.rows[0];

      await logEvent({
        actor: acknowledger,
        event_type: 'metrics_alert_acknowledged',
        status: 'closed',
        metadata: {
          alertId,
          alertTitle: alert.title,
          alertSeverity: alert.severity,
          projectId: alert.project_id,
          notes
        },
        tags: ['metrics', 'alert', 'acknowledged']
      });

      return {
        success: true,
        message: 'Alert acknowledged successfully',
        alertId,
        acknowledgedBy: acknowledger,
        acknowledgedAt: new Date().toISOString(),
        notes
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Alert acknowledgment failed',
        alertId
      };
    }
  }

  /**
   * Resolve a metrics alert
   */
  private static async resolveAlert(args: any): Promise<any> {
    const { alertId, resolvedBy, resolutionNotes } = args;

    try {
      const sessionId = await getCurrentSession();
      const resolver = resolvedBy || `session_${sessionId}`;

      const updateQuery = `
        UPDATE metrics_alerts 
        SET 
          status = 'resolved',
          resolved_at = CURRENT_TIMESTAMP,
          resolved_by = $2,
          resolution_notes = COALESCE(resolution_notes || E'\\n\\n', '') || 'RESOLVED: ' || $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status IN ('open', 'acknowledged', 'investigating')
        RETURNING id, title, severity, project_id, trigger_value, metric_type
      `;

      const result = await db.query(updateQuery, [
        alertId,
        resolver,
        resolutionNotes
      ]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Alert not found or cannot be resolved',
          alertId
        };
      }

      const alert = result.rows[0];

      await logEvent({
        actor: resolver,
        event_type: 'metrics_alert_resolved',
        status: 'closed',
        metadata: {
          alertId,
          alertTitle: alert.title,
          alertSeverity: alert.severity,
          projectId: alert.project_id,
          metricType: alert.metric_type,
          triggerValue: alert.trigger_value,
          resolutionNotes
        },
        tags: ['metrics', 'alert', 'resolved']
      });

      return {
        success: true,
        message: 'Alert resolved successfully',
        alertId,
        resolvedBy: resolver,
        resolvedAt: new Date().toISOString(),
        resolutionNotes
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Alert resolution failed',
        alertId
      };
    }
  }

  /**
   * Get metrics trends and forecasting data
   */
  private static async getMetricsTrends(args: any): Promise<any> {
    const { 
      projectId, 
      metricTypes, 
      trendTypes, 
      forecastDays = 30,
      minConfidence = 0.6 
    } = args;

    try {
      let whereClause = 'WHERE project_id = $1 AND is_active = TRUE AND forecast_confidence >= $2';
      let queryParams: any[] = [projectId, minConfidence];
      let paramIndex = 3;

      if (metricTypes && metricTypes.length > 0) {
        whereClause += ` AND metric_type = ANY($${paramIndex})`;
        queryParams.push(metricTypes);
        paramIndex++;
      }

      if (trendTypes && trendTypes.length > 0) {
        whereClause += ` AND trend_type = ANY($${paramIndex})`;
        queryParams.push(trendTypes);
        paramIndex++;
      }

      const trendsQuery = `
        SELECT 
          metric_type, metric_scope, scope_identifier, trend_type,
          trend_start_date, trend_end_date, data_points_count,
          direction, strength, consistency, acceleration,
          slope, intercept, r_squared, correlation_coefficient,
          forecast_horizon_days, forecast_confidence, forecast_method,
          change_points, anomalies, anomaly_score,
          model_accuracy, cross_validation_score, model_drift_score,
          created_at, updated_at, needs_recalculation
        FROM metrics_trends
        ${whereClause}
        ORDER BY strength DESC, r_squared DESC, forecast_confidence DESC
      `;

      const result = await db.query(trendsQuery, queryParams);
      const trends = result.rows;

      // Filter forecasts by requested horizon
      const filteredTrends = trends.filter(t => 
        !t.forecast_horizon_days || t.forecast_horizon_days >= forecastDays
      );

      // Group trends by metric type and direction
      const trendAnalysis = {
        byMetricType: this.groupBy(filteredTrends, 'metric_type'),
        byDirection: this.groupBy(filteredTrends, 'direction'),
        byTrendType: this.groupBy(filteredTrends, 'trend_type')
      };

      // Calculate summary statistics
      const summary = {
        totalTrends: filteredTrends.length,
        strongTrends: filteredTrends.filter(t => parseFloat(t.strength) > 0.7).length,
        reliableForecasts: filteredTrends.filter(t => parseFloat(t.forecast_confidence) > 0.8).length,
        averageAccuracy: filteredTrends.length > 0 ? 
          filteredTrends.reduce((sum, t) => sum + (parseFloat(t.model_accuracy) || 0), 0) / filteredTrends.length : 0,
        trendsNeedingRecalculation: trends.filter(t => t.needs_recalculation).length,
        directionBreakdown: {
          increasing: filteredTrends.filter(t => t.direction === 'increasing').length,
          decreasing: filteredTrends.filter(t => t.direction === 'decreasing').length,
          stable: filteredTrends.filter(t => t.direction === 'stable').length,
          volatile: filteredTrends.filter(t => t.direction === 'volatile').length
        }
      };

      return {
        success: true,
        projectId,
        forecastHorizon: `${forecastDays} days`,
        minConfidence,
        summary,
        trends: filteredTrends,
        analysis: trendAnalysis
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Trends query failed',
        projectId
      };
    }
  }

  /**
   * Get metrics collection system performance statistics
   */
  private static async getPerformanceStats(args: any): Promise<any> {
    const { includeHistory = false } = args;

    try {
      // Get current performance metrics from the collector
      const collectorStats = getMetricsCollectionPerformance();

      const response: any = {
        success: true,
        currentPerformance: collectorStats,
        timestamp: new Date().toISOString()
      };

      if (includeHistory) {
        // Get recent collection session performance
        const historyQuery = `
          SELECT 
            collection_timestamp,
            execution_time_ms,
            total_metrics_calculated,
            alerts_generated,
            data_completeness_score,
            confidence_score,
            collection_trigger,
            status
          FROM metrics_collection_sessions
          WHERE collection_timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 days'
            AND status = 'completed'
          ORDER BY collection_timestamp DESC
          LIMIT 100
        `;

        const historyResult = await db.query(historyQuery);
        const history = historyResult.rows;

        // Calculate historical statistics
        const avgExecutionTime = history.length > 0 ? 
          history.reduce((sum, s) => sum + s.execution_time_ms, 0) / history.length : 0;
        
        const avgMetricsPerCollection = history.length > 0 ?
          history.reduce((sum, s) => sum + s.total_metrics_calculated, 0) / history.length : 0;

        response.historicalPerformance = {
          collectionsLast7Days: history.length,
          averageExecutionTime: avgExecutionTime,
          averageMetricsPerCollection: avgMetricsPerCollection,
          performanceTrend: this.calculatePerformanceTrend(history),
          recentCollections: history.slice(0, 20)
        };
      }

      return response;

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Performance stats query failed'
      };
    }
  }

  /**
   * Start metrics collection service
   */
  private static async startCollection(args: any): Promise<any> {
    const { config } = args;

    try {
      await startMetricsCollection(config);

      return {
        success: true,
        message: 'Metrics collection service started successfully',
        config: config || 'default configuration',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start metrics collection service'
      };
    }
  }

  /**
   * Stop metrics collection service
   */
  private static async stopCollection(_args: any): Promise<any> {
    try {
      await stopMetricsCollection();

      return {
        success: true,
        message: 'Metrics collection service stopped successfully',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop metrics collection service'
      };
    }
  }

  // Utility methods

  private static parseTimeframe(timeframe: string): number {
    switch (timeframe) {
      case '1d': return 1;
      case '7d': return 7;
      case '30d': return 30;
      case '90d': return 90;
      case 'all': return 365; // Reasonable default
      default: return 30;
    }
  }

  private static groupBy(array: any[], key: string): any {
    return array.reduce((groups, item) => {
      const group = item[key];
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(item);
      return groups;
    }, {});
  }

  private static calculateTeamProductivityStats(developers: any[]): any {
    if (developers.length === 0) {
      return {
        avgProductivity: 0,
        avgHealthScore: 0,
        avgCollaboration: 0
      };
    }

    return {
      avgProductivity: developers.reduce((sum, d) => sum + (d.current_productivity || 0), 0) / developers.length,
      avgHealthScore: developers.reduce((sum, d) => sum + (1 - (d.burnout_risk_score || 0)), 0) / developers.length,
      avgCollaboration: developers.reduce((sum, d) => sum + (d.collaboration_frequency || 0), 0) / developers.length,
      avgEfficiency: developers.reduce((sum, d) => sum + (d.current_efficiency || 0), 0) / developers.length,
      avgQuality: developers.reduce((sum, d) => sum + (d.current_quality || 0), 0) / developers.length
    };
  }

  private static getHealthRiskRecommendations(riskCategory: string): string[] {
    switch (riskCategory) {
      case 'high_burnout_risk':
        return [
          'Reduce workload and redistribute tasks',
          'Encourage time off and breaks',
          'Schedule 1-on-1 check-ins',
          'Review work-life balance practices'
        ];
      case 'unsustainable_workload':
        return [
          'Analyze task distribution across team',
          'Consider additional resources',
          'Review sprint planning and capacity',
          'Implement workload monitoring'
        ];
      case 'performance_decline':
        return [
          'Identify root causes of decline',
          'Provide additional support or training',
          'Review current project assignments',
          'Consider mentoring or pair programming'
        ];
      case 'excessive_stress':
        return [
          'Address immediate stress factors',
          'Review project deadlines and expectations',
          'Provide stress management resources',
          'Consider temporary workload reduction'
        ];
      default:
        return ['Monitor situation and provide support as needed'];
    }
  }

  private static calculatePerformanceTrend(history: any[]): string {
    if (history.length < 3) return 'insufficient_data';

    const recent = history.slice(0, Math.floor(history.length / 3));
    const older = history.slice(-Math.floor(history.length / 3));

    const recentAvg = recent.reduce((sum, s) => sum + s.execution_time_ms, 0) / recent.length;
    const olderAvg = older.reduce((sum, s) => sum + s.execution_time_ms, 0) / older.length;

    const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100;

    if (Math.abs(changePercent) < 5) return 'stable';
    return changePercent < 0 ? 'improving' : 'degrading';
  }
}

export default DevelopmentMetricsHandler;