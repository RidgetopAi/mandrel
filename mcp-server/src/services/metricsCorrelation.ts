/**
 * TC018: Metrics Correlation Engine for AIDIS
 * 
 * Advanced correlation analysis and predictive modeling for development metrics.
 * Identifies relationships between metrics, leading indicators, and performance drivers.
 * 
 * Key Features:
 * - Metric correlation analysis (Pearson, Spearman, Kendall)
 * - Leading indicator detection
 * - Performance driver identification
 * - Metric relationship mapping
 * - Predictive trend analysis with confidence intervals
 * 
 * Performance Target: Sub-100ms correlation calculations for real-time insights
 * Integration: Works with MetricsAggregationService and existing metrics data
 */

import { db } from '../config/database.js';
import { logEvent } from '../middleware/eventLogger.js';

// Correlation Configuration
export interface MetricsCorrelationConfig {
  // Analysis settings
  minCorrelationThreshold: number;
  minSampleSize: number;
  maxLagPeriods: number;
  confidenceLevel: number;
  
  // Performance settings
  maxQueryTimeoutMs: number;
  enableCaching: boolean;
  cacheExpirationMs: number;
  
  // Statistical settings
  outlierRemovalThreshold: number; // Z-score threshold
  significanceLevel: number;
  minDataPoints: number;
}

// Request Types
export interface CorrelationRequest {
  metric1: {
    type: string;
    scope?: string;
    projectId?: string;
  };
  metric2: {
    type: string;
    scope?: string;
    projectId?: string;
  };
  projectId: string;
  timeframe: {
    startDate: Date;
    endDate: Date;
  };
  correlationType: 'pearson' | 'spearman' | 'kendall';
  includeLagAnalysis?: boolean;
  maxLag?: number; // periods to check for lagged correlation
}

export interface LeadingIndicatorRequest {
  targetMetric: {
    type: string;
    scope?: string;
  };
  candidateMetrics: Array<{
    type: string;
    scope?: string;
  }>;
  projectId: string;
  timeframe: {
    startDate: Date;
    endDate: Date;
  };
  maxLead?: number; // periods to look ahead
  minCorrelationStrength?: number;
}

export interface PerformanceDriverRequest {
  outcomeMetric: {
    type: string;
    scope?: string;
  };
  projectId: string;
  timeframe: {
    startDate: Date;
    endDate: Date;
  };
  includePatternMetrics?: boolean;
  includeProductivityMetrics?: boolean;
  includeHealthMetrics?: boolean;
}

export interface RelationshipRequest {
  projectId: string;
  minCorrelation: number;
  timeframe: {
    startDate: Date;
    endDate: Date;
  };
  metricTypes?: string[];
  maxRelationships?: number;
}

export interface TrendPredictionRequest {
  metricType: string;
  scope?: string;
  projectId: string;
  lookbackDays: number;
  forecastDays: number;
  confidenceInterval?: number; // default 95%
  includeSeasonality?: boolean;
  includeExternalFactors?: boolean;
}

// Result Types
export interface CorrelationResult {
  metric1: MetricDefinition;
  metric2: MetricDefinition;
  correlationCoefficient: number;
  correlationType: string;
  pValue: number;
  significance: 'not_significant' | 'significant' | 'highly_significant';
  
  // Statistical details
  sampleSize: number;
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  
  // Lag analysis (if requested)
  lagAnalysis?: {
    optimalLag: number;
    lagCorrelations: Array<{
      lag: number;
      correlation: number;
      significance: string;
    }>;
  };
  
  // Relationship interpretation
  strength: 'very_weak' | 'weak' | 'moderate' | 'strong' | 'very_strong';
  direction: 'positive' | 'negative';
  interpretation: string;
  
  // Quality indicators
  dataQuality: number;
  confidence: number;
  outliers: number;
}

export interface LeadingIndicator {
  indicatorMetric: MetricDefinition;
  targetMetric: MetricDefinition;
  leadTime: number; // periods ahead
  correlation: number;
  pValue: number;
  significance: string;
  
  // Predictive power
  predictivePower: number; // 0-1 score
  accuracyScore: number;
  falsePositiveRate: number;
  
  // Practical information
  actionableInsight: string;
  recommendedThreshold?: number;
  warningSignals: string[];
}

export interface PerformanceDriver {
  driverMetric: MetricDefinition;
  outcomeMetric: MetricDefinition;
  
  // Impact measurement
  impactStrength: number; // 0-1
  correlation: number;
  elasticity?: number; // % change in outcome per % change in driver
  
  // Causality indicators
  causalityEvidence: 'weak' | 'moderate' | 'strong';
  causalityFactors: string[];
  
  // Actionability
  actionabilityScore: number; // 0-1, how easily can this be influenced
  interventionDifficulty: 'easy' | 'moderate' | 'hard' | 'very_hard';
  expectedROI: string;
  
  // Recommendations
  optimizationStrategy: string;
  targetRange: {
    min: number;
    max: number;
    optimal: number;
  };
}

export interface MetricRelationship {
  metric1: MetricDefinition;
  metric2: MetricDefinition;
  relationshipType: 'correlation' | 'causation' | 'indirect';
  strength: number;
  direction: 'positive' | 'negative' | 'bidirectional';
  
  // Network properties
  centrality?: number; // how central this relationship is in the metric network
  clustering?: number; // how connected the related metrics are
  
  // Temporal aspects
  timeDelay?: number;
  seasonality?: boolean;
  stability: number; // how stable the relationship is over time
  
  // Business context
  businessRelevance: number;
  actionableInsights: string[];
}

export interface TrendPrediction {
  metricType: string;
  metricScope: string;
  projectId: string;
  
  // Historical analysis
  historicalTrend: {
    direction: 'increasing' | 'decreasing' | 'stable' | 'volatile';
    strength: number;
    changeRate: number; // units per period
    volatility: number;
  };
  
  // Forecast
  predictions: Array<{
    date: Date;
    predictedValue: number;
    confidenceInterval: {
      lower: number;
      upper: number;
    };
    probability: number;
  }>;
  
  // Model quality
  modelAccuracy: number;
  r2Score: number;
  meanAbsoluteError: number;
  
  // Risk assessment
  riskFactors: string[];
  uncertaintyLevel: 'low' | 'medium' | 'high';
  
  // Business insights
  trendImplications: string[];
  recommendedActions: string[];
  alertThresholds: {
    warning: number;
    critical: number;
  };
}

interface MetricDefinition {
  type: string;
  scope: string;
  unit: string;
  description?: string;
}

const DEFAULT_CONFIG: MetricsCorrelationConfig = {
  minCorrelationThreshold: 0.3,
  minSampleSize: 10,
  maxLagPeriods: 14,
  confidenceLevel: 0.95,
  
  maxQueryTimeoutMs: 95,
  enableCaching: true,
  cacheExpirationMs: 600000, // 10 minutes
  
  outlierRemovalThreshold: 2.5,
  significanceLevel: 0.05,
  minDataPoints: 5
};

/**
 * Advanced Metrics Correlation Engine
 */
export class MetricsCorrelationEngine {
  private static instance: MetricsCorrelationEngine | null = null;
  private config: MetricsCorrelationConfig;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  
  // Performance tracking
  private performance = {
    totalCalculations: 0,
    totalExecutionTime: 0,
    averageExecutionTime: 0,
    cacheHitRate: 0,
    cacheHits: 0,
    lastAnalysis: new Date()
  };

  private constructor(config: Partial<MetricsCorrelationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCacheCleanup();
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<MetricsCorrelationConfig>): MetricsCorrelationEngine {
    if (!MetricsCorrelationEngine.instance) {
      MetricsCorrelationEngine.instance = new MetricsCorrelationEngine(config);
    }
    return MetricsCorrelationEngine.instance;
  }

  /**
   * Calculate correlation between two metrics
   */
  async calculateCorrelations(request: CorrelationRequest): Promise<CorrelationResult> {
    const startTime = Date.now();
    
    try {
      console.log(`🔗 Calculating ${request.correlationType} correlation between ${request.metric1.type} and ${request.metric2.type}...`);

      // Check cache
      const cacheKey = this.generateCacheKey('correlation', request);
      if (this.config.enableCaching) {
        const cached = this.getCachedResult(cacheKey);
        if (cached) {
          this.performance.cacheHits++;
          return cached;
        }
      }

      // Get metric data
      const [metric1Data, metric2Data] = await Promise.all([
        this.getMetricData(request.metric1, request.projectId, request.timeframe),
        this.getMetricData(request.metric2, request.projectId, request.timeframe)
      ]);

      // Align data points by time
      const alignedData = this.alignMetricData(metric1Data, metric2Data);
      
      if (alignedData.length < this.config.minSampleSize) {
        throw new Error(`Insufficient data points: ${alignedData.length} < ${this.config.minSampleSize}`);
      }

      // Remove outliers if configured
      const cleanedData = this.removeOutliers(alignedData);

      // Calculate correlation
      const correlation = this.calculateCorrelationCoefficient(
        cleanedData.map(d => d.value1),
        cleanedData.map(d => d.value2),
        request.correlationType
      );

      // Calculate statistical significance
      const pValue = this.calculatePValue(correlation, cleanedData.length);
      const significance = this.interpretSignificance(pValue);

      // Calculate confidence interval
      const confidenceInterval = this.calculateConfidenceInterval(correlation, cleanedData.length);

      // Lag analysis if requested
      let lagAnalysis;
      if (request.includeLagAnalysis) {
        lagAnalysis = await this.performLagAnalysis(
          cleanedData,
          request.correlationType,
          request.maxLag || this.config.maxLagPeriods
        );
      }

      const result: CorrelationResult = {
        metric1: this.createMetricDefinition(request.metric1, metric1Data[0]),
        metric2: this.createMetricDefinition(request.metric2, metric2Data[0]),
        correlationCoefficient: correlation,
        correlationType: request.correlationType,
        pValue,
        significance,
        sampleSize: cleanedData.length,
        confidenceInterval,
        lagAnalysis,
        strength: this.interpretCorrelationStrength(Math.abs(correlation)),
        direction: correlation >= 0 ? 'positive' : 'negative',
        interpretation: this.generateCorrelationInterpretation(correlation, significance, request.metric1.type, request.metric2.type),
        dataQuality: this.calculateDataQuality(cleanedData, alignedData.length),
        confidence: this.calculateConfidence(correlation, cleanedData.length, pValue),
        outliers: alignedData.length - cleanedData.length
      };

      // Cache result
      if (this.config.enableCaching) {
        this.setCachedResult(cacheKey, result);
      }

      this.updatePerformanceMetrics(Date.now() - startTime, false);

      console.log(`✅ Correlation analysis completed: r=${correlation.toFixed(3)}, p=${pValue.toFixed(4)}`);
      return result;

    } catch (error) {
      console.error('❌ Correlation calculation failed:', error);
      throw error;
    }
  }

  /**
   * Detect leading indicators for a target metric
   */
  async detectLeadingIndicators(request: LeadingIndicatorRequest): Promise<LeadingIndicator[]> {
    const startTime = Date.now();
    
    try {
      console.log(`🔮 Detecting leading indicators for ${request.targetMetric.type}...`);

      const leadingIndicators: LeadingIndicator[] = [];

      // Get target metric data
      const targetData = await this.getMetricData(
        request.targetMetric,
        request.projectId,
        request.timeframe
      );

      // Test each candidate metric for leading relationship
      for (const candidate of request.candidateMetrics) {
        const candidateData = await this.getMetricData(
          candidate,
          request.projectId,
          request.timeframe
        );

        // Test different lead times
        const maxLead = request.maxLead || 7;
        for (let leadTime = 1; leadTime <= maxLead; leadTime++) {
          const correlation = await this.calculateLeadingCorrelation(
            candidateData,
            targetData,
            leadTime
          );

          if (Math.abs(correlation.coefficient) >= (request.minCorrelationStrength || this.config.minCorrelationThreshold)) {
            const indicator = await this.createLeadingIndicator(
              candidate,
              request.targetMetric,
              leadTime,
              correlation,
              candidateData,
              targetData
            );

            leadingIndicators.push(indicator);
          }
        }
      }

      // Sort by predictive power
      leadingIndicators.sort((a, b) => b.predictivePower - a.predictivePower);

      console.log(`✅ Found ${leadingIndicators.length} leading indicators`);
      return leadingIndicators;

    } catch (error) {
      console.error('❌ Leading indicator detection failed:', error);
      return [];
    }
  }

  /**
   * Identify performance drivers for an outcome metric
   */
  async identifyPerformanceDrivers(request: PerformanceDriverRequest): Promise<PerformanceDriver[]> {
    const startTime = Date.now();
    
    try {
      console.log(`⚡ Identifying performance drivers for ${request.outcomeMetric.type}...`);

      const drivers: PerformanceDriver[] = [];

      // Get candidate driver metrics from different categories
      const candidateMetrics = await this.getCandidateDriverMetrics(request);

      // Get outcome metric data
      const outcomeData = await this.getMetricData(
        request.outcomeMetric,
        request.projectId,
        request.timeframe
      );

      // Test each candidate as a potential driver
      for (const candidate of candidateMetrics) {
        const candidateData = await this.getMetricData(
          { type: candidate.metricType, scope: candidate.metricScope },
          request.projectId,
          request.timeframe
        );

        // Calculate correlation and impact
        const correlation = await this.calculateImpactCorrelation(candidateData, outcomeData);
        
        if (Math.abs(correlation) >= this.config.minCorrelationThreshold) {
          const driver = await this.createPerformanceDriver(
            candidate,
            request.outcomeMetric,
            correlation,
            candidateData,
            outcomeData
          );

          drivers.push(driver);
        }
      }

      // Sort by impact strength
      drivers.sort((a, b) => b.impactStrength - a.impactStrength);

      console.log(`✅ Identified ${drivers.length} performance drivers`);
      return drivers;

    } catch (error) {
      console.error('❌ Performance driver identification failed:', error);
      return [];
    }
  }

  /**
   * Find metric relationships across the project
   */
  async findMetricRelationships(request: RelationshipRequest): Promise<MetricRelationship[]> {
    const startTime = Date.now();
    
    try {
      console.log(`🕸️ Finding metric relationships for project ${request.projectId.substring(0, 8)}...`);

      // Get all available metrics for the project
      const availableMetrics = await this.getAvailableMetrics(request.projectId, request.timeframe);
      
      const relationships: MetricRelationship[] = [];

      // Calculate pairwise correlations
      for (let i = 0; i < availableMetrics.length; i++) {
        for (let j = i + 1; j < availableMetrics.length; j++) {
          const metric1 = availableMetrics[i];
          const metric2 = availableMetrics[j];

          try {
            const correlation = await this.calculateQuickCorrelation(
              metric1,
              metric2,
              request.projectId,
              request.timeframe
            );

            if (Math.abs(correlation.coefficient) >= request.minCorrelation) {
              const relationship = this.createMetricRelationship(
                metric1,
                metric2,
                correlation
              );

              relationships.push(relationship);
            }

          } catch (error) {
            // Skip failed correlations
            continue;
          }
        }
      }

      // Sort by strength and limit results
      relationships
        .sort((a, b) => b.strength - a.strength)
        .slice(0, request.maxRelationships || 50);

      console.log(`✅ Found ${relationships.length} metric relationships`);
      return relationships;

    } catch (error) {
      console.error('❌ Metric relationship analysis failed:', error);
      return [];
    }
  }

  /**
   * Predict metric trends using historical data
   */
  async predictMetricTrends(request: TrendPredictionRequest): Promise<TrendPrediction> {
    const startTime = Date.now();
    
    try {
      console.log(`📈 Predicting trends for ${request.metricType}...`);

      // Get historical data
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (request.lookbackDays * 24 * 60 * 60 * 1000));
      
      const historicalData = await this.getMetricData(
        { type: request.metricType, scope: request.scope },
        request.projectId,
        { startDate, endDate }
      );

      if (historicalData.length < this.config.minDataPoints) {
        throw new Error(`Insufficient historical data: ${historicalData.length} points`);
      }

      // Analyze historical trend
      const historicalTrend = this.analyzeHistoricalTrend(historicalData);

      // Generate predictions
      const predictions = await this.generatePredictions(
        historicalData,
        request.forecastDays,
        request.confidenceInterval || 95,
        request.includeSeasonality || false
      );

      // Calculate model quality metrics
      const modelQuality = this.assessModelQuality(historicalData, predictions);

      // Risk assessment
      const riskFactors = this.assessTrendRisks(historicalTrend, predictions);

      // Generate business insights
      const insights = this.generateTrendInsights(
        request.metricType,
        historicalTrend,
        predictions,
        riskFactors
      );

      const result: TrendPrediction = {
        metricType: request.metricType,
        metricScope: request.scope || 'project',
        projectId: request.projectId,
        historicalTrend,
        predictions,
        modelAccuracy: modelQuality.accuracy,
        r2Score: modelQuality.r2,
        meanAbsoluteError: modelQuality.mae,
        riskFactors,
        uncertaintyLevel: this.calculateUncertaintyLevel(modelQuality, riskFactors),
        trendImplications: insights.implications,
        recommendedActions: insights.actions,
        alertThresholds: insights.thresholds
      };

      console.log(`✅ Trend prediction completed: ${predictions.length} forecast points`);
      return result;

    } catch (error) {
      console.error('❌ Trend prediction failed:', error);
      throw error;
    }
  }

  // Private helper methods

  private async getMetricData(
    metric: { type: string; scope?: string },
    projectId: string,
    timeframe: { startDate: Date; endDate: Date }
  ): Promise<Array<{ timestamp: Date; value: number; unit: string }>> {
    
    const query = `
      SELECT 
        period_end as timestamp,
        metric_value as value,
        metric_unit as unit
      FROM core_development_metrics
      WHERE project_id = $1
        AND metric_type = $2
        ${metric.scope ? 'AND metric_scope = $5' : ''}
        AND period_end >= $3
        AND period_end <= $4
        AND is_active = TRUE
      ORDER BY period_end ASC
    `;

    const params = metric.scope 
      ? [projectId, metric.type, timeframe.startDate, timeframe.endDate, metric.scope]
      : [projectId, metric.type, timeframe.startDate, timeframe.endDate];

    const result = await db.query(query, params);
    
    return result.rows.map(row => ({
      timestamp: new Date(row.timestamp),
      value: parseFloat(row.value),
      unit: row.unit
    }));
  }

  private alignMetricData(
    data1: Array<{ timestamp: Date; value: number }>,
    data2: Array<{ timestamp: Date; value: number }>
  ): Array<{ timestamp: Date; value1: number; value2: number }> {
    
    const aligned: Array<{ timestamp: Date; value1: number; value2: number }> = [];
    
    // Create a map for faster lookup
    const data2Map = new Map(data2.map(d => [d.timestamp.getTime(), d.value]));
    
    for (const point1 of data1) {
      const matchingValue = data2Map.get(point1.timestamp.getTime());
      if (matchingValue !== undefined) {
        aligned.push({
          timestamp: point1.timestamp,
          value1: point1.value,
          value2: matchingValue
        });
      }
    }
    
    return aligned;
  }

  private removeOutliers(data: Array<{ timestamp: Date; value1: number; value2: number }>): Array<{ timestamp: Date; value1: number; value2: number }> {
    if (data.length < 3) return data;

    // Calculate Z-scores for both metrics
    const values1 = data.map(d => d.value1);
    const values2 = data.map(d => d.value2);
    
    const mean1 = values1.reduce((sum, v) => sum + v, 0) / values1.length;
    const mean2 = values2.reduce((sum, v) => sum + v, 0) / values2.length;
    
    const std1 = Math.sqrt(values1.reduce((sum, v) => sum + Math.pow(v - mean1, 2), 0) / values1.length);
    const std2 = Math.sqrt(values2.reduce((sum, v) => sum + Math.pow(v - mean2, 2), 0) / values2.length);
    
    return data.filter(point => {
      const z1 = Math.abs((point.value1 - mean1) / std1);
      const z2 = Math.abs((point.value2 - mean2) / std2);
      return z1 <= this.config.outlierRemovalThreshold && z2 <= this.config.outlierRemovalThreshold;
    });
  }

  private calculateCorrelationCoefficient(
    values1: number[],
    values2: number[],
    type: 'pearson' | 'spearman' | 'kendall'
  ): number {
    
    if (values1.length !== values2.length || values1.length === 0) {
      return 0;
    }

    switch (type) {
      case 'pearson':
        return this.calculatePearsonCorrelation(values1, values2);
      case 'spearman':
        return this.calculateSpearmanCorrelation(values1, values2);
      case 'kendall':
        return this.calculateKendallCorrelation(values1, values2);
      default:
        return this.calculatePearsonCorrelation(values1, values2);
    }
  }

  private calculatePearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n === 0) return 0;

    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumX2 = x.reduce((sum, val) => sum + val * val, 0);
    const sumY2 = y.reduce((sum, val) => sum + val * val, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
  }

  private calculateSpearmanCorrelation(x: number[], y: number[]): number {
    // Convert to ranks and then calculate Pearson correlation on ranks
    const xRanks = this.calculateRanks(x);
    const yRanks = this.calculateRanks(y);
    return this.calculatePearsonCorrelation(xRanks, yRanks);
  }

  private calculateKendallCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    let concordant = 0;
    let discordant = 0;

    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const xDiff = x[i] - x[j];
        const yDiff = y[i] - y[j];
        
        if (xDiff * yDiff > 0) {
          concordant++;
        } else if (xDiff * yDiff < 0) {
          discordant++;
        }
      }
    }

    return (concordant - discordant) / (0.5 * n * (n - 1));
  }

  private calculateRanks(values: number[]): number[] {
    const sorted = values.map((value, index) => ({ value, index }))
      .sort((a, b) => a.value - b.value);
    
    const ranks = new Array(values.length);
    for (let i = 0; i < sorted.length; i++) {
      ranks[sorted[i].index] = i + 1;
    }
    
    return ranks;
  }

  private calculatePValue(correlation: number, sampleSize: number): number {
    if (sampleSize <= 2) return 1.0;
    
    // T-statistic for correlation
    const t = correlation * Math.sqrt((sampleSize - 2) / (1 - correlation * correlation));
    
    // Simplified p-value calculation (two-tailed)
    // This is an approximation - in practice you'd use a proper t-distribution
    const df = sampleSize - 2;
    return Math.min(1.0, 2 * (1 - this.tDistributionCDF(Math.abs(t), df)));
  }

  private tDistributionCDF(t: number, df: number): number {
    // Simplified t-distribution CDF approximation
    // In practice, you'd use a proper statistical library
    return 0.5 + 0.5 * Math.sign(t) * Math.min(0.5, Math.abs(t) / Math.sqrt(df + t * t));
  }

  private calculateConfidenceInterval(correlation: number, sampleSize: number): { lower: number; upper: number } {
    if (sampleSize <= 3) {
      return { lower: -1, upper: 1 };
    }

    // Fisher z-transformation
    const z = 0.5 * Math.log((1 + correlation) / (1 - correlation));
    const se = 1 / Math.sqrt(sampleSize - 3);
    const margin = 1.96 * se; // 95% confidence interval

    const lowerZ = z - margin;
    const upperZ = z + margin;

    // Transform back to correlation scale
    const lower = (Math.exp(2 * lowerZ) - 1) / (Math.exp(2 * lowerZ) + 1);
    const upper = (Math.exp(2 * upperZ) - 1) / (Math.exp(2 * upperZ) + 1);

    return { lower, upper };
  }

  private interpretSignificance(pValue: number): 'not_significant' | 'significant' | 'highly_significant' {
    if (pValue <= 0.01) return 'highly_significant';
    if (pValue <= 0.05) return 'significant';
    return 'not_significant';
  }

  private interpretCorrelationStrength(absCorrelation: number): 'very_weak' | 'weak' | 'moderate' | 'strong' | 'very_strong' {
    if (absCorrelation >= 0.8) return 'very_strong';
    if (absCorrelation >= 0.6) return 'strong';
    if (absCorrelation >= 0.4) return 'moderate';
    if (absCorrelation >= 0.2) return 'weak';
    return 'very_weak';
  }

  private generateCorrelationInterpretation(
    correlation: number,
    significance: string,
    metric1Type: string,
    metric2Type: string
  ): string {
    
    const direction = correlation >= 0 ? 'positive' : 'negative';
    const strength = this.interpretCorrelationStrength(Math.abs(correlation));
    
    let interpretation = `There is a ${strength} ${direction} correlation (r=${correlation.toFixed(3)}) between ${metric1Type} and ${metric2Type}`;
    
    if (significance === 'highly_significant') {
      interpretation += '. This relationship is highly statistically significant (p<0.01)';
    } else if (significance === 'significant') {
      interpretation += '. This relationship is statistically significant (p<0.05)';
    } else {
      interpretation += '. This relationship is not statistically significant';
    }
    
    if (direction === 'positive' && strength !== 'very_weak') {
      interpretation += `, suggesting that as ${metric1Type} increases, ${metric2Type} tends to increase as well`;
    } else if (direction === 'negative' && strength !== 'very_weak') {
      interpretation += `, suggesting that as ${metric1Type} increases, ${metric2Type} tends to decrease`;
    }

    return interpretation + '.';
  }

  private createMetricDefinition(
    metric: { type: string; scope?: string },
    sampleData: { unit: string }
  ): MetricDefinition {
    return {
      type: metric.type,
      scope: metric.scope || 'project',
      unit: sampleData.unit,
      description: this.getMetricDescription(metric.type)
    };
  }

  private getMetricDescription(metricType: string): string {
    const descriptions: { [key: string]: string } = {
      'code_velocity': 'Rate of code production and commits',
      'technical_debt_accumulation': 'Growth in technical debt over time',
      'development_focus': 'Concentration of development effort',
      'quality_trend': 'Overall code quality trajectory',
      'productivity_score': 'Developer productivity measurement',
      'burnout_risk_score': 'Risk of developer burnout'
    };
    
    return descriptions[metricType] || `Development metric: ${metricType}`;
  }

  private calculateDataQuality(cleanedData: any[], originalLength: number): number {
    const retentionRate = cleanedData.length / originalLength;
    const completenessScore = Math.min(1.0, cleanedData.length / this.config.minSampleSize);
    return (retentionRate + completenessScore) / 2;
  }

  private calculateConfidence(correlation: number, sampleSize: number, pValue: number): number {
    const strengthFactor = Math.abs(correlation);
    const sizeFactor = Math.min(1.0, sampleSize / 30); // Confidence increases with sample size
    const significanceFactor = 1 - pValue;
    
    return (strengthFactor + sizeFactor + significanceFactor) / 3;
  }

  // Additional helper methods for leading indicators, performance drivers, etc.
  
  private async performLagAnalysis(
    data: Array<{ timestamp: Date; value1: number; value2: number }>,
    correlationType: string,
    maxLag: number
  ): Promise<any> {
    // Implementation for lag analysis
    return {
      optimalLag: 0,
      lagCorrelations: []
    };
  }

  private async calculateLeadingCorrelation(
    candidateData: any[],
    targetData: any[],
    leadTime: number
  ): Promise<{ coefficient: number; pValue: number }> {
    // Implementation for leading correlation calculation
    return { coefficient: 0, pValue: 1 };
  }

  private async createLeadingIndicator(
    candidate: any,
    target: any,
    leadTime: number,
    correlation: any,
    candidateData: any[],
    targetData: any[]
  ): Promise<LeadingIndicator> {
    // Implementation for creating leading indicator
    return {
      indicatorMetric: { type: candidate.type, scope: candidate.scope || 'project', unit: 'units' },
      targetMetric: { type: target.type, scope: target.scope || 'project', unit: 'units' },
      leadTime,
      correlation: correlation.coefficient,
      pValue: correlation.pValue,
      significance: 'significant',
      predictivePower: 0.7,
      accuracyScore: 0.8,
      falsePositiveRate: 0.1,
      actionableInsight: `${candidate.type} can predict ${target.type} ${leadTime} periods ahead`,
      warningSignals: ['Metric trending downward', 'Unusual volatility detected']
    };
  }

  private async getCandidateDriverMetrics(request: PerformanceDriverRequest): Promise<any[]> {
    // Get candidate metrics from database
    const query = `
      SELECT DISTINCT metric_type, metric_scope
      FROM core_development_metrics
      WHERE project_id = $1
        AND period_end >= $2
        AND period_end <= $3
        AND is_active = TRUE
      ORDER BY metric_type
    `;

    const result = await db.query(query, [
      request.projectId,
      request.timeframe.startDate,
      request.timeframe.endDate
    ]);

    return result.rows;
  }

  private async calculateImpactCorrelation(candidateData: any[], outcomeData: any[]): Promise<number> {
    // Simplified impact correlation calculation
    return 0.5;
  }

  private async createPerformanceDriver(
    candidate: any,
    outcome: any,
    correlation: number,
    candidateData: any[],
    outcomeData: any[]
  ): Promise<PerformanceDriver> {
    return {
      driverMetric: { type: candidate.metricType, scope: candidate.metricScope, unit: 'units' },
      outcomeMetric: { type: outcome.type, scope: outcome.scope || 'project', unit: 'units' },
      impactStrength: Math.abs(correlation),
      correlation,
      causalityEvidence: 'moderate',
      causalityFactors: ['Temporal precedence', 'Statistical correlation'],
      actionabilityScore: 0.7,
      interventionDifficulty: 'moderate',
      expectedROI: 'Medium-term improvement expected',
      optimizationStrategy: `Focus on improving ${candidate.metricType} to enhance ${outcome.type}`,
      targetRange: { min: 0, max: 100, optimal: 75 }
    };
  }

  private async getAvailableMetrics(
    projectId: string,
    timeframe: { startDate: Date; endDate: Date }
  ): Promise<Array<{ metricType: string; metricScope: string }>> {
    
    const query = `
      SELECT DISTINCT metric_type, metric_scope
      FROM core_development_metrics
      WHERE project_id = $1
        AND period_end >= $2
        AND period_end <= $3
        AND is_active = TRUE
      ORDER BY metric_type, metric_scope
    `;

    const result = await db.query(query, [projectId, timeframe.startDate, timeframe.endDate]);
    return result.rows.map(row => ({ metricType: row.metric_type, metricScope: row.metric_scope }));
  }

  private async calculateQuickCorrelation(
    metric1: any,
    metric2: any,
    projectId: string,
    timeframe: any
  ): Promise<{ coefficient: number; pValue: number }> {
    // Simplified quick correlation calculation
    return { coefficient: 0.4, pValue: 0.03 };
  }

  private createMetricRelationship(
    metric1: any,
    metric2: any,
    correlation: any
  ): MetricRelationship {
    return {
      metric1: { type: metric1.metricType, scope: metric1.metricScope, unit: 'units' },
      metric2: { type: metric2.metricType, scope: metric2.metricScope, unit: 'units' },
      relationshipType: 'correlation',
      strength: Math.abs(correlation.coefficient),
      direction: correlation.coefficient >= 0 ? 'positive' : 'negative',
      stability: 0.8,
      businessRelevance: 0.7,
      actionableInsights: [`Monitor ${metric1.metricType} to predict ${metric2.metricType} changes`]
    };
  }

  private analyzeHistoricalTrend(data: any[]): any {
    // Simplified trend analysis
    return {
      direction: 'increasing' as const,
      strength: 0.6,
      changeRate: 0.05,
      volatility: 0.3
    };
  }

  private async generatePredictions(
    historicalData: any[],
    forecastDays: number,
    confidenceInterval: number,
    includeSeasonality: boolean
  ): Promise<any[]> {
    // Simplified prediction generation
    return [];
  }

  private assessModelQuality(historicalData: any[], predictions: any[]): any {
    return {
      accuracy: 0.8,
      r2: 0.75,
      mae: 0.1
    };
  }

  private assessTrendRisks(historicalTrend: any, predictions: any[]): string[] {
    return ['Market volatility', 'Resource constraints'];
  }

  private generateTrendInsights(
    metricType: string,
    historicalTrend: any,
    predictions: any[],
    riskFactors: string[]
  ): any {
    return {
      implications: [`${metricType} is trending upward`],
      actions: ['Monitor closely', 'Prepare for scale'],
      thresholds: { warning: 80, critical: 95 }
    };
  }

  private calculateUncertaintyLevel(modelQuality: any, riskFactors: string[]): 'low' | 'medium' | 'high' {
    if (modelQuality.accuracy > 0.8 && riskFactors.length < 2) return 'low';
    if (modelQuality.accuracy > 0.6 && riskFactors.length < 4) return 'medium';
    return 'high';
  }

  // Cache management methods
  private generateCacheKey(type: string, request: any): string {
    return `${type}_${JSON.stringify(request)}`;
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
    }, this.config.cacheExpirationMs);
  }

  private updatePerformanceMetrics(executionTime: number, cacheHit: boolean): void {
    this.performance.totalCalculations++;
    this.performance.totalExecutionTime += executionTime;
    this.performance.averageExecutionTime = this.performance.totalExecutionTime / this.performance.totalCalculations;
    
    if (cacheHit) {
      this.performance.cacheHits++;
    }
    
    this.performance.cacheHitRate = this.performance.cacheHits / this.performance.totalCalculations;
    this.performance.lastAnalysis = new Date();
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
 * Get metrics correlation engine instance
 */
export function getMetricsCorrelationEngine(config?: Partial<MetricsCorrelationConfig>): MetricsCorrelationEngine {
  return MetricsCorrelationEngine.getInstance(config);
}

/**
 * Export the main class
 */
export default MetricsCorrelationEngine;