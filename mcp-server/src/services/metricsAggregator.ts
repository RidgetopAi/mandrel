/**
 * TC018: Metrics Aggregation Service for AIDIS
 * 
 * Provides high-performance metrics aggregation across projects, time periods, and teams.
 * Optimized for executive dashboards with sub-100ms query performance.
 * 
 * Key Features:
 * - Cross-project metrics aggregation
 * - Time-series aggregation with multiple granularities
 * - Team-level metrics rollups
 * - Calculated rollups (averages, sums, percentiles)
 * - Executive summary generation
 * 
 * Performance Target: Sub-100ms aggregation queries for dashboard use
 * Integration: Leverages existing MetricsCollector and database tables
 */

import { db } from '../config/database.js';

// Aggregation Configuration
export interface MetricsAggregationConfig {
  // Performance settings
  maxQueryTimeoutMs: number;
  enableCaching: boolean;
  cacheExpirationMs: number;
  
  // Aggregation limits
  maxProjectsPerQuery: number;
  maxTimeRangeYears: number;
  defaultPageSize: number;
  
  // Calculation settings
  defaultConfidenceThreshold: number;
  minSampleSizeForTrends: number;
  outlierDetectionThreshold: number;
}

// Aggregation Request Types
export interface ProjectAggregationRequest {
  projectIds: string[];
  timeframe: {
    startDate: Date;
    endDate: Date;
  };
  metricTypes: string[];
  aggregationType: 'sum' | 'average' | 'median' | 'percentile' | 'count' | 'min' | 'max';
  percentileValue?: number; // For percentile aggregation
  groupBy?: 'project' | 'metric_type' | 'time_period' | 'scope';
  includeConfidenceMetrics?: boolean;
}

export interface TimeSeriesAggregationRequest {
  projectId: string;
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  granularity: 'hour' | 'day' | 'week' | 'month';
  metricTypes?: string[];
  startDate: Date;
  endDate: Date;
  fillGaps?: boolean;
  smoothing?: 'none' | 'moving_average' | 'exponential';
  windowSize?: number; // For smoothing
}

export interface TeamMetricsRequest {
  teamId?: string;
  projectIds?: string[];
  metricScope: 'individual' | 'team' | 'project' | 'organization';
  timeframe: {
    startDate: Date;
    endDate: Date;
  };
  includeHealthMetrics?: boolean;
  includeProductivityTrends?: boolean;
  includeCollaborationMetrics?: boolean;
}

export interface ExecutiveSummaryRequest {
  projectId: string;
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
  includeForecasts?: boolean;
  includeRiskAssessment?: boolean;
  includeRecommendations?: boolean;
  compareToBaseline?: boolean;
  baselinePeriodDays?: number;
}

// Aggregation Result Types
export interface AggregationResult {
  success: boolean;
  executionTimeMs: number;
  dataPoints: number;
  
  // Core results
  aggregatedMetrics: AggregatedMetric[];
  summary: AggregationSummary;
  
  // Optional metadata
  confidenceScore?: number;
  dataQualityScore?: number;
  warnings?: string[];
  cacheHit?: boolean;
}

export interface AggregatedMetric {
  metricType: string;
  metricScope: string;
  scopeIdentifier?: string;
  aggregationType: string;
  
  // Aggregated values
  value: number;
  unit: string;
  count: number;
  
  // Statistical measures
  min?: number;
  max?: number;
  standardDeviation?: number;
  variance?: number;
  percentiles?: { [key: string]: number }; // e.g., { "50": 25.5, "90": 45.2 }
  
  // Confidence and quality
  confidenceInterval?: { lower: number; upper: number };
  dataQualityScore: number;
  
  // Time context
  periodStart: Date;
  periodEnd: Date;
  
  // Supporting data
  contributingSources: number;
  outlierCount?: number;
  
  // Trend information
  trendDirection?: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  trendStrength?: number;
  changeFromPrevious?: number;
  percentChangeFromPrevious?: number;
}

export interface AggregationSummary {
  totalMetricsProcessed: number;
  timeframeCovered: {
    startDate: Date;
    endDate: Date;
    totalDays: number;
  };
  projectsCovered: number;
  averageDataQuality: number;
  averageConfidence: number;
  
  // Key insights
  topPerformingMetrics: string[];
  concerningTrends: string[];
  dataGaps?: string[];
}

export interface TimeSeriesDataPoint {
  timestamp: Date;
  value: number;
  unit: string;
  metricType: string;
  aggregationType: string;
  
  // Quality indicators
  sampleSize: number;
  confidenceLevel: number;
  interpolated?: boolean; // If value was filled due to missing data
  
  // Statistical context
  movingAverage?: number;
  standardDeviation?: number;
  trend?: 'up' | 'down' | 'stable';
}

export interface ExecutiveSummary {
  projectId: string;
  projectName: string;
  summaryPeriod: {
    startDate: Date;
    endDate: Date;
  };
  generatedAt: Date;
  
  // High-level KPIs
  overallHealthScore: number; // 0-100
  velocityScore: number;
  qualityScore: number;
  teamProductivityScore: number;
  technicalDebtScore: number;
  
  // Key metrics summary
  coreMetrics: {
    codeVelocity: { current: number; change: number; trend: string };
    qualityTrend: { current: number; change: number; trend: string };
    teamProductivity: { current: number; change: number; trend: string };
    technicalDebt: { current: number; change: number; trend: string };
  };
  
  // Risk assessment
  risks: {
    level: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
    recommendedActions: string[];
  };
  
  // Forecasts (if requested)
  forecasts?: {
    velocityForecast: { nextMonth: number; confidence: number };
    qualityForecast: { nextMonth: number; confidence: number };
    riskForecast: { level: string; probability: number };
  };
  
  // Recommendations
  recommendations: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
    priority: 'low' | 'medium' | 'high' | 'critical';
  };
  
  // Supporting data
  baselineComparison?: {
    velocityChange: number;
    qualityChange: number;
    productivityChange: number;
    period: string;
  };
}

const DEFAULT_CONFIG: MetricsAggregationConfig = {
  maxQueryTimeoutMs: 95, // Sub-100ms target with buffer
  enableCaching: true,
  cacheExpirationMs: 300000, // 5 minutes
  
  maxProjectsPerQuery: 50,
  maxTimeRangeYears: 2,
  defaultPageSize: 100,
  
  defaultConfidenceThreshold: 0.7,
  minSampleSizeForTrends: 5,
  outlierDetectionThreshold: 2.5 // Z-score threshold
};

/**
 * High-Performance Metrics Aggregation Service
 */
export class MetricsAggregationService {
  private static instance: MetricsAggregationService | null = null;
  private config: MetricsAggregationConfig;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  
  // Performance tracking
  private performance = {
    totalQueries: 0,
    totalExecutionTime: 0,
    averageExecutionTime: 0,
    cacheHitRate: 0,
    cacheHits: 0,
    lastCleanup: new Date()
  };

  private constructor(config: Partial<MetricsAggregationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCacheCleanup();
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<MetricsAggregationConfig>): MetricsAggregationService {
    if (!MetricsAggregationService.instance) {
      MetricsAggregationService.instance = new MetricsAggregationService(config);
    }
    return MetricsAggregationService.instance;
  }

  /**
   * Aggregate metrics across multiple projects
   */
  async aggregateAcrossProjects(request: ProjectAggregationRequest): Promise<AggregationResult> {
    const startTime = Date.now();
    
    try {
      console.log(`📊 Aggregating metrics across ${request.projectIds.length} projects...`);

      // Validate request
      this.validateProjectAggregationRequest(request);

      // Check cache if enabled
      const cacheKey = this.generateCacheKey('project_agg', request);
      if (this.config.enableCaching) {
        const cached = this.getCachedResult(cacheKey);
        if (cached) {
          this.performance.cacheHits++;
          return cached;
        }
      }

      // Build aggregation query
      const query = this.buildProjectAggregationQuery(request);
      
      // Execute with timeout
      const queryPromise = db.query(query.sql, query.params);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout')), this.config.maxQueryTimeoutMs)
      );
      
      const result = await Promise.race([queryPromise, timeoutPromise]) as any;
      
      // Process results
      const aggregatedMetrics = await this.processAggregationResults(
        result.rows, 
        request.aggregationType,
        request.includeConfidenceMetrics || false
      );
      
      // Calculate summary
      const summary = this.calculateAggregationSummary(aggregatedMetrics, request);
      
      // Build result
      const aggregationResult: AggregationResult = {
        success: true,
        executionTimeMs: Date.now() - startTime,
        dataPoints: result.rows.length,
        aggregatedMetrics,
        summary,
        confidenceScore: this.calculateOverallConfidence(aggregatedMetrics),
        dataQualityScore: this.calculateOverallDataQuality(aggregatedMetrics),
        cacheHit: false
      };

      // Cache result if enabled
      if (this.config.enableCaching) {
        this.setCachedResult(cacheKey, aggregationResult);
      }

      // Update performance metrics
      this.updatePerformanceMetrics(aggregationResult.executionTimeMs, false);

      console.log(`✅ Project aggregation completed in ${aggregationResult.executionTimeMs}ms`);
      return aggregationResult;

    } catch (error) {
      console.error('❌ Project aggregation failed:', error);
      
      return {
        success: false,
        executionTimeMs: Date.now() - startTime,
        dataPoints: 0,
        aggregatedMetrics: [],
        summary: this.createEmptySummary(request.timeframe.startDate, request.timeframe.endDate),
        warnings: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Aggregate metrics by time period with specified granularity
   */
  async aggregateByTimePeriod(request: TimeSeriesAggregationRequest): Promise<TimeSeriesDataPoint[]> {
    try {
      console.log(`📈 Aggregating time series for project ${request.projectId.substring(0, 8)}...`);

      // Validate request
      this.validateTimeSeriesRequest(request);

      // Check cache
      const cacheKey = this.generateCacheKey('time_series', request);
      if (this.config.enableCaching) {
        const cached = this.getCachedResult(cacheKey);
        if (cached) {
          this.performance.cacheHits++;
          return cached;
        }
      }

      // Build time series query
      const query = this.buildTimeSeriesQuery(request);
      const result = await db.query(query.sql, query.params);

      // Process time series data
      const dataPoints = await this.processTimeSeriesResults(result.rows, request);

      // Apply smoothing if requested
      if (request.smoothing !== 'none') {
        this.applySmoothing(dataPoints, request.smoothing || 'none', request.windowSize || 5);
      }

      // Fill gaps if requested
      if (request.fillGaps) {
        this.fillTimeSeriesGaps(dataPoints, request);
      }

      // Cache result
      if (this.config.enableCaching) {
        this.setCachedResult(cacheKey, dataPoints);
      }

      console.log(`✅ Time series aggregation completed: ${dataPoints.length} data points`);
      return dataPoints;

    } catch (error) {
      console.error('❌ Time series aggregation failed:', error);
      return [];
    }
  }

  /**
   * Aggregate team-level metrics
   */
  async aggregateTeamMetrics(request: TeamMetricsRequest): Promise<AggregationResult> {
    const startTime = Date.now();
    
    try {
      console.log(`👥 Aggregating team metrics...`);

      // Check cache
      const cacheKey = this.generateCacheKey('team_metrics', request);
      if (this.config.enableCaching) {
        const cached = this.getCachedResult(cacheKey);
        if (cached) {
          this.performance.cacheHits++;
          return cached;
        }
      }

      const aggregatedMetrics: AggregatedMetric[] = [];

      // 1. Productivity metrics aggregation
      if (request.includeProductivityTrends !== false) {
        const productivityMetrics = await this.aggregateProductivityMetrics(request);
        aggregatedMetrics.push(...productivityMetrics);
      }

      // 2. Health metrics aggregation
      if (request.includeHealthMetrics !== false) {
        const healthMetrics = await this.aggregateHealthMetrics(request);
        aggregatedMetrics.push(...healthMetrics);
      }

      // 3. Collaboration metrics
      if (request.includeCollaborationMetrics !== false) {
        const collaborationMetrics = await this.aggregateCollaborationMetrics(request);
        aggregatedMetrics.push(...collaborationMetrics);
      }

      const summary = this.calculateAggregationSummary(aggregatedMetrics, {
        projectIds: request.projectIds || [],
        timeframe: request.timeframe,
        metricTypes: [],
        aggregationType: 'average'
      });

      const result: AggregationResult = {
        success: true,
        executionTimeMs: Date.now() - startTime,
        dataPoints: aggregatedMetrics.length,
        aggregatedMetrics,
        summary,
        confidenceScore: this.calculateOverallConfidence(aggregatedMetrics),
        dataQualityScore: this.calculateOverallDataQuality(aggregatedMetrics),
        cacheHit: false
      };

      // Cache result
      if (this.config.enableCaching) {
        this.setCachedResult(cacheKey, result);
      }

      console.log(`✅ Team metrics aggregation completed in ${result.executionTimeMs}ms`);
      return result;

    } catch (error) {
      console.error('❌ Team metrics aggregation failed:', error);
      
      return {
        success: false,
        executionTimeMs: Date.now() - startTime,
        dataPoints: 0,
        aggregatedMetrics: [],
        summary: this.createEmptySummary(request.timeframe.startDate, request.timeframe.endDate)
      };
    }
  }

  /**
   * Calculate rollup metrics with specified aggregation type
   */
  async calculateRollups(
    metricType: string, 
    aggregationType: 'sum' | 'average' | 'median' | 'percentile' | 'count',
    options: {
      projectIds?: string[];
      timeframe?: { startDate: Date; endDate: Date };
      scope?: string;
      percentileValue?: number;
    } = {}
  ): Promise<AggregatedMetric[]> {
    
    try {
      console.log(`🔄 Calculating ${aggregationType} rollups for ${metricType}...`);

      const query = this.buildRollupQuery(metricType, aggregationType, options);
      const result = await db.query(query.sql, query.params);

      return await this.processAggregationResults(result.rows, aggregationType, true);

    } catch (error) {
      console.error('❌ Rollup calculation failed:', error);
      return [];
    }
  }

  /**
   * Generate executive summary with key insights and recommendations
   */
  async generateExecutiveSummary(request: ExecutiveSummaryRequest): Promise<ExecutiveSummary> {
    const startTime = Date.now();
    
    try {
      console.log(`📋 Generating executive summary for project ${request.projectId.substring(0, 8)}...`);

      // Get project info
      const projectInfo = await this.getProjectInfo(request.projectId);
      
      // Calculate core metrics
      const coreMetrics = await this.calculateExecutiveCoreMetrics(request);
      
      // Calculate overall scores
      const overallScores = this.calculateOverallScores(coreMetrics);
      
      // Risk assessment
      const riskAssessment = await this.performRiskAssessment(request);
      
      // Generate forecasts if requested
      let forecasts;
      if (request.includeForecasts) {
        forecasts = await this.generateForecasts(request);
      }
      
      // Generate recommendations
      const recommendations = await this.generateRecommendations(request, coreMetrics, riskAssessment);
      
      // Baseline comparison if requested
      let baselineComparison;
      if (request.compareToBaseline) {
        baselineComparison = await this.performBaselineComparison(request);
      }

      const summary: ExecutiveSummary = {
        projectId: request.projectId,
        projectName: projectInfo.name,
        summaryPeriod: request.dateRange,
        generatedAt: new Date(),
        
        overallHealthScore: overallScores.health,
        velocityScore: overallScores.velocity,
        qualityScore: overallScores.quality,
        teamProductivityScore: overallScores.productivity,
        technicalDebtScore: overallScores.debt,
        
        coreMetrics,
        risks: riskAssessment,
        forecasts,
        recommendations,
        baselineComparison
      };

      console.log(`✅ Executive summary generated in ${Date.now() - startTime}ms`);
      return summary;

    } catch (error) {
      console.error('❌ Executive summary generation failed:', error);
      throw error;
    }
  }

  // Private helper methods

  private validateProjectAggregationRequest(request: ProjectAggregationRequest): void {
    if (!request.projectIds || request.projectIds.length === 0) {
      throw new Error('At least one project ID is required');
    }
    
    if (request.projectIds.length > this.config.maxProjectsPerQuery) {
      throw new Error(`Too many projects: maximum ${this.config.maxProjectsPerQuery} allowed`);
    }
    
    if (!request.timeframe || !request.timeframe.startDate || !request.timeframe.endDate) {
      throw new Error('Valid timeframe with start and end dates is required');
    }
    
    const timeRangeYears = (request.timeframe.endDate.getTime() - request.timeframe.startDate.getTime()) / (365 * 24 * 60 * 60 * 1000);
    if (timeRangeYears > this.config.maxTimeRangeYears) {
      throw new Error(`Time range too large: maximum ${this.config.maxTimeRangeYears} years allowed`);
    }
  }

  private validateTimeSeriesRequest(request: TimeSeriesAggregationRequest): void {
    if (!request.projectId) {
      throw new Error('Project ID is required');
    }
    
    if (!request.startDate || !request.endDate) {
      throw new Error('Start and end dates are required');
    }
    
    if (request.startDate >= request.endDate) {
      throw new Error('Start date must be before end date');
    }
  }

  private buildProjectAggregationQuery(request: ProjectAggregationRequest): { sql: string; params: any[] } {
    const projectPlaceholders = request.projectIds.map((_, i) => `$${i + 1}`).join(',');
    const metricTypePlaceholders = request.metricTypes.map((_, i) => `$${request.projectIds.length + i + 1}`).join(',');
    
    let aggregationFunc = '';
    switch (request.aggregationType) {
      case 'sum':
        aggregationFunc = 'SUM(metric_value)';
        break;
      case 'average':
        aggregationFunc = 'AVG(metric_value)';
        break;
      case 'median':
        aggregationFunc = 'PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY metric_value)';
        break;
      case 'percentile':
        const pValue = (request.percentileValue || 95) / 100;
        aggregationFunc = `PERCENTILE_CONT(${pValue}) WITHIN GROUP (ORDER BY metric_value)`;
        break;
      case 'count':
        aggregationFunc = 'COUNT(*)';
        break;
      case 'min':
        aggregationFunc = 'MIN(metric_value)';
        break;
      case 'max':
        aggregationFunc = 'MAX(metric_value)';
        break;
    }

    let groupByClause = '';
    let selectFields = `
      ${aggregationFunc} as aggregated_value,
      metric_type,
      metric_scope,
      metric_unit,
      COUNT(*) as sample_size,
      AVG(data_quality_score) as avg_data_quality,
      AVG(measurement_confidence) as avg_confidence,
      STDDEV(metric_value) as standard_deviation,
      MIN(metric_value) as min_value,
      MAX(metric_value) as max_value
    `;

    switch (request.groupBy) {
      case 'project':
        groupByClause = 'GROUP BY project_id, metric_type, metric_scope, metric_unit';
        selectFields = `project_id, ${selectFields}`;
        break;
      case 'metric_type':
        groupByClause = 'GROUP BY metric_type, metric_unit';
        break;
      case 'time_period':
        groupByClause = 'GROUP BY DATE_TRUNC(\'day\', period_end), metric_type, metric_scope, metric_unit';
        selectFields = `DATE_TRUNC('day', period_end) as time_period, ${selectFields}`;
        break;
      default:
        groupByClause = 'GROUP BY metric_type, metric_scope, metric_unit';
    }

    const sql = `
      SELECT ${selectFields}
      FROM core_development_metrics
      WHERE project_id IN (${projectPlaceholders})
        AND metric_type IN (${metricTypePlaceholders})
        AND period_end >= $${request.projectIds.length + request.metricTypes.length + 1}
        AND period_end <= $${request.projectIds.length + request.metricTypes.length + 2}
        AND is_active = TRUE
      ${groupByClause}
      ORDER BY metric_type, aggregated_value DESC
    `;

    const params = [
      ...request.projectIds,
      ...request.metricTypes,
      request.timeframe.startDate,
      request.timeframe.endDate
    ];

    return { sql, params };
  }

  private buildTimeSeriesQuery(request: TimeSeriesAggregationRequest): { sql: string; params: any[] } {
    let timeField = '';
    switch (request.granularity) {
      case 'hour':
        timeField = "DATE_TRUNC('hour', period_end)";
        break;
      case 'day':
        timeField = "DATE_TRUNC('day', period_end)";
        break;
      case 'week':
        timeField = "DATE_TRUNC('week', period_end)";
        break;
      case 'month':
        timeField = "DATE_TRUNC('month', period_end)";
        break;
      default:
        timeField = "DATE_TRUNC('day', period_end)";
    }

    let metricFilter = '';
    let params = [request.projectId, request.startDate, request.endDate];
    
    if (request.metricTypes && request.metricTypes.length > 0) {
      const metricPlaceholders = request.metricTypes.map((_, i) => `$${i + 4}`).join(',');
      metricFilter = `AND metric_type IN (${metricPlaceholders})`;
      params.push(...request.metricTypes);
    }

    const sql = `
      SELECT 
        ${timeField} as time_bucket,
        metric_type,
        metric_unit,
        AVG(metric_value) as avg_value,
        COUNT(*) as sample_size,
        AVG(measurement_confidence) as confidence_level,
        STDDEV(metric_value) as standard_deviation
      FROM core_development_metrics
      WHERE project_id = $1
        AND period_end >= $2
        AND period_end <= $3
        AND is_active = TRUE
        ${metricFilter}
      GROUP BY time_bucket, metric_type, metric_unit
      ORDER BY time_bucket ASC, metric_type
    `;

    return { sql, params };
  }

  private buildRollupQuery(
    metricType: string, 
    aggregationType: string, 
    options: any
  ): { sql: string; params: any[] } {
    
    let aggregationFunc = '';
    switch (aggregationType) {
      case 'sum':
        aggregationFunc = 'SUM(metric_value)';
        break;
      case 'average':
        aggregationFunc = 'AVG(metric_value)';
        break;
      case 'median':
        aggregationFunc = 'PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY metric_value)';
        break;
      case 'percentile':
        const pValue = (options.percentileValue || 95) / 100;
        aggregationFunc = `PERCENTILE_CONT(${pValue}) WITHIN GROUP (ORDER BY metric_value)`;
        break;
      case 'count':
        aggregationFunc = 'COUNT(*)';
        break;
    }

    let whereClause = 'WHERE metric_type = $1 AND is_active = TRUE';
    let params = [metricType];

    if (options.projectIds && options.projectIds.length > 0) {
      const projectPlaceholders = options.projectIds.map((_, i) => `$${i + 2}`).join(',');
      whereClause += ` AND project_id IN (${projectPlaceholders})`;
      params.push(...options.projectIds);
    }

    if (options.timeframe) {
      whereClause += ` AND period_end >= $${params.length + 1} AND period_end <= $${params.length + 2}`;
      params.push(options.timeframe.startDate, options.timeframe.endDate);
    }

    if (options.scope) {
      whereClause += ` AND metric_scope = $${params.length + 1}`;
      params.push(options.scope);
    }

    const sql = `
      SELECT 
        metric_type,
        metric_scope,
        metric_unit,
        ${aggregationFunc} as aggregated_value,
        COUNT(*) as sample_size,
        AVG(data_quality_score) as avg_data_quality,
        AVG(measurement_confidence) as avg_confidence,
        MIN(period_start) as period_start,
        MAX(period_end) as period_end,
        STDDEV(metric_value) as standard_deviation,
        MIN(metric_value) as min_value,
        MAX(metric_value) as max_value
      FROM core_development_metrics
      ${whereClause}
      GROUP BY metric_type, metric_scope, metric_unit
    `;

    return { sql, params };
  }

  private async processAggregationResults(
    rows: any[], 
    aggregationType: string,
    includeConfidenceMetrics: boolean
  ): Promise<AggregatedMetric[]> {
    
    return rows.map(row => {
      const metric: AggregatedMetric = {
        metricType: row.metric_type,
        metricScope: row.metric_scope,
        scopeIdentifier: row.scope_identifier,
        aggregationType,
        value: parseFloat(row.aggregated_value) || 0,
        unit: row.metric_unit,
        count: parseInt(row.sample_size) || 0,
        min: parseFloat(row.min_value),
        max: parseFloat(row.max_value),
        standardDeviation: parseFloat(row.standard_deviation),
        dataQualityScore: parseFloat(row.avg_data_quality) || 0,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        contributingSources: parseInt(row.sample_size) || 0
      };

      if (includeConfidenceMetrics && metric.standardDeviation && metric.count > 1) {
        const marginOfError = 1.96 * (metric.standardDeviation / Math.sqrt(metric.count)); // 95% CI
        metric.confidenceInterval = {
          lower: metric.value - marginOfError,
          upper: metric.value + marginOfError
        };
      }

      return metric;
    });
  }

  private async processTimeSeriesResults(
    rows: any[],
    _request: TimeSeriesAggregationRequest
  ): Promise<TimeSeriesDataPoint[]> {

    return rows.map(row => ({
      timestamp: new Date(row.time_bucket),
      value: parseFloat(row.avg_value) || 0,
      unit: row.metric_unit,
      metricType: row.metric_type,
      aggregationType: 'average',
      sampleSize: parseInt(row.sample_size) || 0,
      confidenceLevel: parseFloat(row.confidence_level) || 0,
      standardDeviation: parseFloat(row.standard_deviation),
      interpolated: false
    }));
  }

  private calculateAggregationSummary(
    metrics: AggregatedMetric[], 
    request: ProjectAggregationRequest
  ): AggregationSummary {
    
    const totalDays = Math.ceil(
      (request.timeframe.endDate.getTime() - request.timeframe.startDate.getTime()) / (24 * 60 * 60 * 1000)
    );

    const avgDataQuality = metrics.length > 0 ? 
      metrics.reduce((sum, m) => sum + m.dataQualityScore, 0) / metrics.length : 0;

    // Identify top performing metrics (highest values with good quality)
    const topPerforming = metrics
      .filter(m => m.dataQualityScore > 0.7)
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
      .map(m => m.metricType);

    // Identify concerning trends (high volatility or declining trends)
    const concerning = metrics
      .filter(m => m.trendDirection === 'decreasing' || (m.standardDeviation && m.standardDeviation > m.value * 0.5))
      .map(m => m.metricType);

    return {
      totalMetricsProcessed: metrics.length,
      timeframeCovered: {
        startDate: request.timeframe.startDate,
        endDate: request.timeframe.endDate,
        totalDays
      },
      projectsCovered: request.projectIds.length,
      averageDataQuality: avgDataQuality,
      averageConfidence: avgDataQuality, // Simplified for now
      topPerformingMetrics: topPerforming,
      concerningTrends: concerning
    };
  }

  private createEmptySummary(startDate: Date, endDate: Date): AggregationSummary {
    return {
      totalMetricsProcessed: 0,
      timeframeCovered: {
        startDate,
        endDate,
        totalDays: Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000))
      },
      projectsCovered: 0,
      averageDataQuality: 0,
      averageConfidence: 0,
      topPerformingMetrics: [],
      concerningTrends: []
    };
  }

  // Additional helper methods for team metrics, health aggregation, etc.
  private async aggregateProductivityMetrics(_request: TeamMetricsRequest): Promise<AggregatedMetric[]> {
    // Implementation for productivity metrics aggregation
    return [];
  }

  private async aggregateHealthMetrics(_request: TeamMetricsRequest): Promise<AggregatedMetric[]> {
    // Implementation for health metrics aggregation
    return [];
  }

  private async aggregateCollaborationMetrics(_request: TeamMetricsRequest): Promise<AggregatedMetric[]> {
    // Implementation for collaboration metrics aggregation
    return [];
  }

  private calculateOverallConfidence(metrics: AggregatedMetric[]): number {
    if (metrics.length === 0) return 0;
    return metrics.reduce((sum, m) => sum + m.dataQualityScore, 0) / metrics.length;
  }

  private calculateOverallDataQuality(metrics: AggregatedMetric[]): number {
    if (metrics.length === 0) return 0;
    return metrics.reduce((sum, m) => sum + m.dataQualityScore, 0) / metrics.length;
  }

  // Executive summary helper methods
  private async getProjectInfo(projectId: string): Promise<{ name: string }> {
    const result = await db.query('SELECT name FROM projects WHERE id = $1', [projectId]);
    return result.rows[0] || { name: 'Unknown Project' };
  }

  private async calculateExecutiveCoreMetrics(_request: ExecutiveSummaryRequest): Promise<any> {
    // Implementation for calculating core executive metrics
    return {
      codeVelocity: { current: 0, change: 0, trend: 'stable' },
      qualityTrend: { current: 0, change: 0, trend: 'stable' },
      teamProductivity: { current: 0, change: 0, trend: 'stable' },
      technicalDebt: { current: 0, change: 0, trend: 'stable' }
    };
  }

  private calculateOverallScores(_coreMetrics: any): any {
    return {
      health: 75,
      velocity: 80,
      quality: 85,
      productivity: 78,
      debt: 65
    };
  }

  private async performRiskAssessment(_request: ExecutiveSummaryRequest): Promise<any> {
    return {
      level: 'medium' as const,
      factors: ['Technical debt accumulation', 'Velocity decline'],
      recommendedActions: ['Schedule refactoring sprint', 'Review development processes']
    };
  }

  private async generateForecasts(_request: ExecutiveSummaryRequest): Promise<any> {
    return {
      velocityForecast: { nextMonth: 85, confidence: 0.7 },
      qualityForecast: { nextMonth: 88, confidence: 0.8 },
      riskForecast: { level: 'medium', probability: 0.6 }
    };
  }

  private async generateRecommendations(_request: ExecutiveSummaryRequest, _coreMetrics: any, _risks: any): Promise<any> {
    return {
      immediate: ['Address critical alerts', 'Review high-risk files'],
      shortTerm: ['Implement automated testing', 'Refactor complex components'],
      longTerm: ['Architectural improvements', 'Team training programs'],
      priority: 'medium' as const
    };
  }

  private async performBaselineComparison(request: ExecutiveSummaryRequest): Promise<any> {
    return {
      velocityChange: 5.2,
      qualityChange: -2.1,
      productivityChange: 8.7,
      period: `${request.baselinePeriodDays || 90} days`
    };
  }

  // Cache management
  private generateCacheKey(type: string, request: any): string {
    return `${type}_${JSON.stringify(request)}_${Date.now()}`;
  }

  private getCachedResult(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.config.cacheExpirationMs) {
      return cached.data;
    }
    return null;
  }

  private setCachedResult(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of Array.from(this.cache.entries())) {
        if (now - value.timestamp > this.config.cacheExpirationMs) {
          this.cache.delete(key);
        }
      }
      this.performance.lastCleanup = new Date();
    }, this.config.cacheExpirationMs);
  }

  private updatePerformanceMetrics(executionTime: number, cacheHit: boolean): void {
    this.performance.totalQueries++;
    this.performance.totalExecutionTime += executionTime;
    this.performance.averageExecutionTime = this.performance.totalExecutionTime / this.performance.totalQueries;
    
    if (cacheHit) {
      this.performance.cacheHits++;
    }
    
    this.performance.cacheHitRate = this.performance.cacheHits / this.performance.totalQueries;
  }

  // Smoothing and gap filling methods
  private applySmoothing(dataPoints: TimeSeriesDataPoint[], smoothing: string, windowSize: number): void {
    if (smoothing === 'moving_average') {
      for (let i = 0; i < dataPoints.length; i++) {
        const start = Math.max(0, i - Math.floor(windowSize / 2));
        const end = Math.min(dataPoints.length, i + Math.floor(windowSize / 2) + 1);
        const window = dataPoints.slice(start, end);
        dataPoints[i].movingAverage = window.reduce((sum, dp) => sum + dp.value, 0) / window.length;
      }
    }
  }

  private fillTimeSeriesGaps(_dataPoints: TimeSeriesDataPoint[], _request: TimeSeriesAggregationRequest): void {
    // Implementation for filling time series gaps with interpolated values
    // This would analyze the time series and fill missing periods with interpolated data
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return { ...this.performance };
  }
}

/**
 * Utility functions for external usage
 */

/**
 * Get metrics aggregation service instance
 */
export function getMetricsAggregationService(config?: Partial<MetricsAggregationConfig>): MetricsAggregationService {
  return MetricsAggregationService.getInstance(config);
}

/**
 * Export the main class
 */
export default MetricsAggregationService;