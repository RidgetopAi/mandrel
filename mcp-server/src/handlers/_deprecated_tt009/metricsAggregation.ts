/**
 * TC018: Metrics Aggregation MCP Handler for AIDIS
 * 
 * Provides MCP tool endpoints for advanced metrics aggregation and correlation analysis.
 * Optimized for executive dashboards with sub-100ms response times.
 * 
 * Available Tools:
 * - metrics_aggregate_projects: Cross-project aggregation
 * - metrics_aggregate_timeline: Time-series aggregation  
 * - metrics_calculate_correlations: Correlation analysis
 * - metrics_get_executive_summary: Executive dashboard
 * - metrics_export_data: Export to CSV/JSON
 * 
 * Performance Target: Sub-100ms aggregation queries for real-time dashboards
 * Integration: MetricsAggregationService, MetricsCorrelationEngine
 */

import { getMetricsAggregationService, ProjectAggregationRequest, TimeSeriesAggregationRequest, /* TeamMetricsRequest, */ ExecutiveSummaryRequest } from '../../services/metricsAggregator.js';
import { getMetricsCorrelationEngine, CorrelationRequest, LeadingIndicatorRequest, PerformanceDriverRequest } from '../../services/metricsCorrelation.js';
// import { getCurrentSession } from '../../services/sessionManager.js';
import { logEvent } from '../../middleware/eventLogger.js';

// Tool parameter interfaces
interface MetricsAggregateProjectsParams {
  projectIds: string[];
  timeframe: {
    startDate: string; // ISO date string
    endDate: string;   // ISO date string
  };
  metricTypes: string[];
  aggregationType: 'sum' | 'average' | 'median' | 'percentile' | 'count' | 'min' | 'max';
  percentileValue?: number;
  groupBy?: 'project' | 'metric_type' | 'time_period' | 'scope';
  includeConfidenceMetrics?: boolean;
}

interface MetricsAggregateTimelineParams {
  projectId: string;
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  granularity: 'hour' | 'day' | 'week' | 'month';
  metricTypes?: string[];
  timeframe: {
    startDate: string; // ISO date string
    endDate: string;   // ISO date string
  };
  fillGaps?: boolean;
  smoothing?: 'none' | 'moving_average' | 'exponential';
  windowSize?: number;
}

interface MetricsCalculateCorrelationsParams {
  projectId: string;
  metric1: {
    type: string;
    scope?: string;
  };
  metric2: {
    type: string;
    scope?: string;
  };
  timeframe: {
    startDate: string; // ISO date string
    endDate: string;   // ISO date string
  };
  correlationType?: 'pearson' | 'spearman' | 'kendall';
  includeLagAnalysis?: boolean;
  maxLag?: number;
  includeLeadingIndicators?: boolean;
  includePerformanceDrivers?: boolean;
}

interface MetricsGetExecutiveSummaryParams {
  projectId: string;
  dateRange: {
    startDate: string; // ISO date string
    endDate: string;   // ISO date string
  };
  includeForecasts?: boolean;
  includeRiskAssessment?: boolean;
  includeRecommendations?: boolean;
  compareToBaseline?: boolean;
  baselinePeriodDays?: number;
}

interface MetricsExportDataParams {
  projectId: string;
  exportType: 'csv' | 'json' | 'excel';
  metricTypes?: string[];
  timeframe: {
    startDate: string; // ISO date string
    endDate: string;   // ISO date string
  };
  aggregationType?: 'raw' | 'daily' | 'weekly' | 'monthly';
  includeMetadata?: boolean;
  includeCorrelations?: boolean;
}

/**
 * Metrics Aggregation MCP Handler
 */
export class MetricsAggregationHandler {
  
  /**
   * Main tool execution handler
   */
  static async handleTool(toolName: string, args: any): Promise<any> {
    const startTime = Date.now();
    
    try {
      console.log(`📊 Executing metrics aggregation tool: ${toolName}`);
      
      // Log tool execution
      await logEvent({
        actor: 'system',
        event_type: 'metrics_aggregation_tool_called',
        status: 'open',
        metadata: {
          toolName,
          args: JSON.stringify(args).length > 1000 ? 'large_payload' : args,
          timestamp: new Date().toISOString()
        },
        tags: ['metrics', 'aggregation', 'mcp']
      });

      let result;
      
      switch (toolName) {
        case 'metrics_aggregate_projects':
          result = await this.handleAggregateProjects(args as MetricsAggregateProjectsParams);
          break;
          
        case 'metrics_aggregate_timeline':
          result = await this.handleAggregateTimeline(args as MetricsAggregateTimelineParams);
          break;
          
        case 'metrics_calculate_correlations':
          result = await this.handleCalculateCorrelations(args as MetricsCalculateCorrelationsParams);
          break;
          
        case 'metrics_get_executive_summary':
          result = await this.handleGetExecutiveSummary(args as MetricsGetExecutiveSummaryParams);
          break;
          
        case 'metrics_export_data':
          result = await this.handleExportData(args as MetricsExportDataParams);
          break;
          
        default:
          throw new Error(`Unknown metrics aggregation tool: ${toolName}`);
      }

      const executionTime = Date.now() - startTime;
      
      // Log successful completion
      await logEvent({
        actor: 'system',
        event_type: 'metrics_aggregation_tool_completed',
        status: 'closed',
        metadata: {
          toolName,
          executionTimeMs: executionTime,
          success: true,
          resultSize: JSON.stringify(result).length
        },
        tags: ['metrics', 'aggregation', 'success']
      });

      console.log(`✅ Metrics aggregation tool ${toolName} completed in ${executionTime}ms`);
      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      console.error(`❌ Metrics aggregation tool ${toolName} failed:`, error);
      
      // Log error
      await logEvent({
        actor: 'system',
        event_type: 'metrics_aggregation_tool_error',
        status: 'error',
        metadata: {
          toolName,
          executionTimeMs: executionTime,
          error: error instanceof Error ? error.message : 'Unknown error',
          args: JSON.stringify(args).length > 1000 ? 'large_payload' : args
        },
        tags: ['metrics', 'aggregation', 'error']
      });

      throw error;
    }
  }

  /**
   * Tool 1: Aggregate metrics across multiple projects
   */
  private static async handleAggregateProjects(params: MetricsAggregateProjectsParams): Promise<any> {
    try {
      // Validate parameters
      if (!params.projectIds || params.projectIds.length === 0) {
        throw new Error('At least one project ID is required');
      }
      
      if (!params.timeframe || !params.timeframe.startDate || !params.timeframe.endDate) {
        throw new Error('Valid timeframe with start and end dates is required');
      }
      
      if (!params.metricTypes || params.metricTypes.length === 0) {
        throw new Error('At least one metric type is required');
      }

      // Convert string dates to Date objects
      const request: ProjectAggregationRequest = {
        projectIds: params.projectIds,
        timeframe: {
          startDate: new Date(params.timeframe.startDate),
          endDate: new Date(params.timeframe.endDate)
        },
        metricTypes: params.metricTypes,
        aggregationType: params.aggregationType,
        percentileValue: params.percentileValue,
        groupBy: params.groupBy,
        includeConfidenceMetrics: params.includeConfidenceMetrics
      };

      // Get aggregation service and execute
      const aggregationService = getMetricsAggregationService();
      const result = await aggregationService.aggregateAcrossProjects(request);

      return {
        content: [
          {
            type: 'text',
            text: this.formatProjectAggregationResult(result, params)
          }
        ]
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Project aggregation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  /**
   * Tool 2: Aggregate metrics by time period with specified granularity
   */
  private static async handleAggregateTimeline(params: MetricsAggregateTimelineParams): Promise<any> {
    try {
      // Validate parameters
      if (!params.projectId) {
        throw new Error('Project ID is required');
      }
      
      if (!params.timeframe || !params.timeframe.startDate || !params.timeframe.endDate) {
        throw new Error('Valid timeframe with start and end dates is required');
      }

      // Convert string dates to Date objects
      const request: TimeSeriesAggregationRequest = {
        projectId: params.projectId,
        period: params.period,
        granularity: params.granularity,
        metricTypes: params.metricTypes,
        startDate: new Date(params.timeframe.startDate),
        endDate: new Date(params.timeframe.endDate),
        fillGaps: params.fillGaps,
        smoothing: params.smoothing || 'none',
        windowSize: params.windowSize
      };

      // Get aggregation service and execute
      const aggregationService = getMetricsAggregationService();
      const dataPoints = await aggregationService.aggregateByTimePeriod(request);

      return {
        content: [
          {
            type: 'text',
            text: this.formatTimeSeriesResult(dataPoints, params)
          }
        ]
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Timeline aggregation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  /**
   * Tool 3: Calculate correlations and relationships between metrics
   */
  private static async handleCalculateCorrelations(params: MetricsCalculateCorrelationsParams): Promise<any> {
    try {
      // Validate parameters
      if (!params.projectId) {
        throw new Error('Project ID is required');
      }
      
      if (!params.metric1 || !params.metric1.type) {
        throw new Error('First metric type is required');
      }
      
      if (!params.metric2 || !params.metric2.type) {
        throw new Error('Second metric type is required');
      }
      
      if (!params.timeframe || !params.timeframe.startDate || !params.timeframe.endDate) {
        throw new Error('Valid timeframe with start and end dates is required');
      }

      // Convert string dates to Date objects
      const correlationRequest: CorrelationRequest = {
        metric1: params.metric1,
        metric2: params.metric2,
        projectId: params.projectId,
        timeframe: {
          startDate: new Date(params.timeframe.startDate),
          endDate: new Date(params.timeframe.endDate)
        },
        correlationType: params.correlationType || 'pearson',
        includeLagAnalysis: params.includeLagAnalysis,
        maxLag: params.maxLag
      };

      // Get correlation engine and execute
      const correlationEngine = getMetricsCorrelationEngine();
      const correlationResult = await correlationEngine.calculateCorrelations(correlationRequest);

      let leadingIndicators = [];
      let performanceDrivers = [];

      // Optional: Calculate leading indicators
      if (params.includeLeadingIndicators) {
        const leadingRequest: LeadingIndicatorRequest = {
          targetMetric: params.metric2,
          candidateMetrics: [params.metric1],
          projectId: params.projectId,
          timeframe: {
            startDate: new Date(params.timeframe.startDate),
            endDate: new Date(params.timeframe.endDate)
          }
        };
        
        leadingIndicators = await correlationEngine.detectLeadingIndicators(leadingRequest);
      }

      // Optional: Identify performance drivers
      if (params.includePerformanceDrivers) {
        const driverRequest: PerformanceDriverRequest = {
          outcomeMetric: params.metric2,
          projectId: params.projectId,
          timeframe: {
            startDate: new Date(params.timeframe.startDate),
            endDate: new Date(params.timeframe.endDate)
          }
        };
        
        performanceDrivers = await correlationEngine.identifyPerformanceDrivers(driverRequest);
      }

      return {
        content: [
          {
            type: 'text',
            text: this.formatCorrelationResult(correlationResult, leadingIndicators, performanceDrivers, params)
          }
        ]
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Correlation analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  /**
   * Tool 4: Generate executive summary with key insights
   */
  private static async handleGetExecutiveSummary(params: MetricsGetExecutiveSummaryParams): Promise<any> {
    try {
      // Validate parameters
      if (!params.projectId) {
        throw new Error('Project ID is required');
      }
      
      if (!params.dateRange || !params.dateRange.startDate || !params.dateRange.endDate) {
        throw new Error('Valid date range with start and end dates is required');
      }

      // Convert string dates to Date objects
      const request: ExecutiveSummaryRequest = {
        projectId: params.projectId,
        dateRange: {
          startDate: new Date(params.dateRange.startDate),
          endDate: new Date(params.dateRange.endDate)
        },
        includeForecasts: params.includeForecasts,
        includeRiskAssessment: params.includeRiskAssessment,
        includeRecommendations: params.includeRecommendations,
        compareToBaseline: params.compareToBaseline,
        baselinePeriodDays: params.baselinePeriodDays
      };

      // Get aggregation service and execute
      const aggregationService = getMetricsAggregationService();
      const summary = await aggregationService.generateExecutiveSummary(request);

      return {
        content: [
          {
            type: 'text',
            text: this.formatExecutiveSummary(summary, params)
          }
        ]
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Executive summary generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  /**
   * Tool 5: Export aggregated metrics data
   */
  private static async handleExportData(params: MetricsExportDataParams): Promise<any> {
    try {
      // Validate parameters
      if (!params.projectId) {
        throw new Error('Project ID is required');
      }
      
      if (!params.exportType) {
        throw new Error('Export type (csv, json, excel) is required');
      }
      
      if (!params.timeframe || !params.timeframe.startDate || !params.timeframe.endDate) {
        throw new Error('Valid timeframe with start and end dates is required');
      }

      // Create aggregation request for data export
      const aggregationRequest: ProjectAggregationRequest = {
        projectIds: [params.projectId],
        timeframe: {
          startDate: new Date(params.timeframe.startDate),
          endDate: new Date(params.timeframe.endDate)
        },
        metricTypes: params.metricTypes || ['code_velocity', 'technical_debt_accumulation', 'development_focus', 'quality_trend'],
        aggregationType: 'average',
        groupBy: params.aggregationType === 'daily' ? 'time_period' : 'metric_type',
        includeConfidenceMetrics: params.includeMetadata || false
      };

      // Get aggregation service and execute
      const aggregationService = getMetricsAggregationService();
      const result = await aggregationService.aggregateAcrossProjects(aggregationRequest);

      // Generate export data
      const exportData = await this.generateExportData(result, params);

      return {
        content: [
          {
            type: 'text',
            text: this.formatExportResult(exportData, params)
          }
        ]
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Data export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  // Helper methods for formatting results

  private static formatProjectAggregationResult(result: any, params: MetricsAggregateProjectsParams): string {
    const summary = result.summary;
    const metrics = result.aggregatedMetrics;
    
    let output = `📊 **Cross-Project Metrics Aggregation**\n\n`;
    
    // Summary statistics
    output += `⏱️ **Execution Summary**\n`;
    output += `• Execution Time: ${result.executionTimeMs}ms\n`;
    output += `• Projects Analyzed: ${summary.projectsCovered}\n`;
    output += `• Metrics Processed: ${summary.totalMetricsProcessed}\n`;
    output += `• Data Quality Score: ${(summary.averageDataQuality * 100).toFixed(1)}%\n`;
    output += `• Time Period: ${summary.timeframeCovered.totalDays} days\n\n`;
    
    // Aggregation settings
    output += `⚙️ **Aggregation Settings**\n`;
    output += `• Aggregation Type: ${params.aggregationType}\n`;
    output += `• Group By: ${params.groupBy || 'metric_type'}\n`;
    output += `• Metric Types: ${params.metricTypes.join(', ')}\n\n`;
    
    // Top performing metrics
    if (summary.topPerformingMetrics.length > 0) {
      output += `🏆 **Top Performing Metrics**\n`;
      summary.topPerformingMetrics.forEach((metric: string, index: number) => {
        output += `${index + 1}. ${metric.replace(/_/g, ' ')}\n`;
      });
      output += `\n`;
    }
    
    // Concerning trends
    if (summary.concerningTrends.length > 0) {
      output += `⚠️ **Concerning Trends**\n`;
      summary.concerningTrends.forEach((trend: string, index: number) => {
        output += `${index + 1}. ${trend.replace(/_/g, ' ')}\n`;
      });
      output += `\n`;
    }
    
    // Detailed metrics (top 5)
    output += `📈 **Aggregated Metrics** (Top 5)\n`;
    metrics.slice(0, 5).forEach((metric: any, index: number) => {
      output += `\n${index + 1}. **${metric.metricType.replace(/_/g, ' ')}**\n`;
      output += `   • Value: ${metric.value.toFixed(3)} ${metric.unit}\n`;
      output += `   • Sample Size: ${metric.count}\n`;
      output += `   • Scope: ${metric.metricScope}\n`;
      output += `   • Quality Score: ${(metric.dataQualityScore * 100).toFixed(1)}%\n`;
      
      if (metric.min !== undefined && metric.max !== undefined) {
        output += `   • Range: ${metric.min.toFixed(2)} - ${metric.max.toFixed(2)}\n`;
      }
      
      if (metric.standardDeviation !== undefined) {
        output += `   • Std Deviation: ${metric.standardDeviation.toFixed(3)}\n`;
      }
    });
    
    // Performance note
    output += `\n💡 **Performance**: Aggregation completed in ${result.executionTimeMs}ms for optimal dashboard performance.\n`;
    
    return output;
  }

  private static formatTimeSeriesResult(dataPoints: any[], params: MetricsAggregateTimelineParams): string {
    let output = `📈 **Time Series Metrics Aggregation**\n\n`;
    
    // Configuration summary
    output += `⚙️ **Configuration**\n`;
    output += `• Project: ${params.projectId.substring(0, 8)}...\n`;
    output += `• Period: ${params.period}\n`;
    output += `• Granularity: ${params.granularity}\n`;
    output += `• Data Points: ${dataPoints.length}\n`;
    if (params.metricTypes) {
      output += `• Metric Types: ${params.metricTypes.join(', ')}\n`;
    }
    if (params.smoothing && params.smoothing !== 'none') {
      output += `• Smoothing: ${params.smoothing} (window: ${params.windowSize || 5})\n`;
    }
    output += `\n`;
    
    if (dataPoints.length === 0) {
      output += `⚠️ No data points found for the specified timeframe and metrics.\n`;
      return output;
    }
    
    // Time series summary
    const firstPoint = dataPoints[0];
    const lastPoint = dataPoints[dataPoints.length - 1];
    const avgValue = dataPoints.reduce((sum, dp) => sum + dp.value, 0) / dataPoints.length;
    
    output += `📊 **Time Series Summary**\n`;
    output += `• Time Range: ${firstPoint.timestamp.toISOString().split('T')[0]} to ${lastPoint.timestamp.toISOString().split('T')[0]}\n`;
    output += `• Average Value: ${avgValue.toFixed(3)} ${firstPoint.unit}\n`;
    output += `• First Value: ${firstPoint.value.toFixed(3)} ${firstPoint.unit}\n`;
    output += `• Last Value: ${lastPoint.value.toFixed(3)} ${lastPoint.unit}\n`;
    output += `• Change: ${((lastPoint.value - firstPoint.value) / firstPoint.value * 100).toFixed(1)}%\n\n`;
    
    // Recent data points (last 10)
    output += `📅 **Recent Data Points** (Last 10)\n`;
    const recentPoints = dataPoints.slice(-10);
    recentPoints.forEach(point => {
      const trend = point.trend ? ` ${point.trend === 'up' ? '📈' : point.trend === 'down' ? '📉' : '➡️'}` : '';
      output += `• ${point.timestamp.toISOString().split('T')[0]}: ${point.value.toFixed(3)} ${point.unit}${trend}\n`;
    });
    
    // Quality indicators
    const avgConfidence = dataPoints.reduce((sum, dp) => sum + dp.confidenceLevel, 0) / dataPoints.length;
    const interpolatedCount = dataPoints.filter(dp => dp.interpolated).length;
    
    output += `\n📋 **Data Quality**\n`;
    output += `• Average Confidence: ${(avgConfidence * 100).toFixed(1)}%\n`;
    output += `• Interpolated Points: ${interpolatedCount}/${dataPoints.length}\n`;
    output += `• Average Sample Size: ${(dataPoints.reduce((sum, dp) => sum + dp.sampleSize, 0) / dataPoints.length).toFixed(1)}\n`;
    
    return output;
  }

  private static formatCorrelationResult(
    correlationResult: any,
    leadingIndicators: any[],
    performanceDrivers: any[],
    _params: MetricsCalculateCorrelationsParams
  ): string {
    
    let output = `🔗 **Metrics Correlation Analysis**\n\n`;
    
    // Core correlation result
    output += `📊 **Correlation Results**\n`;
    output += `• Metrics: ${correlationResult.metric1.type} ↔ ${correlationResult.metric2.type}\n`;
    output += `• Correlation Coefficient: ${correlationResult.correlationCoefficient.toFixed(4)}\n`;
    output += `• Correlation Type: ${correlationResult.correlationType}\n`;
    output += `• Strength: ${correlationResult.strength} ${correlationResult.direction}\n`;
    output += `• Significance: ${correlationResult.significance} (p=${correlationResult.pValue.toFixed(4)})\n`;
    output += `• Sample Size: ${correlationResult.sampleSize}\n\n`;
    
    // Confidence interval
    output += `📈 **Statistical Details**\n`;
    output += `• Confidence Interval: [${correlationResult.confidenceInterval.lower.toFixed(3)}, ${correlationResult.confidenceInterval.upper.toFixed(3)}]\n`;
    output += `• Data Quality: ${(correlationResult.dataQuality * 100).toFixed(1)}%\n`;
    output += `• Confidence Score: ${(correlationResult.confidence * 100).toFixed(1)}%\n`;
    if (correlationResult.outliers > 0) {
      output += `• Outliers Removed: ${correlationResult.outliers}\n`;
    }
    output += `\n`;
    
    // Interpretation
    output += `🧠 **Interpretation**\n`;
    output += `${correlationResult.interpretation}\n\n`;
    
    // Lag analysis (if included)
    if (correlationResult.lagAnalysis && correlationResult.lagAnalysis.lagCorrelations.length > 0) {
      output += `⏰ **Lag Analysis**\n`;
      output += `• Optimal Lag: ${correlationResult.lagAnalysis.optimalLag} periods\n`;
      output += `• Lag Correlations:\n`;
      correlationResult.lagAnalysis.lagCorrelations.slice(0, 5).forEach((lag: any) => {
        output += `  - Lag ${lag.lag}: r=${lag.correlation.toFixed(3)} (${lag.significance})\n`;
      });
      output += `\n`;
    }
    
    // Leading indicators (if requested)
    if (leadingIndicators.length > 0) {
      output += `🔮 **Leading Indicators**\n`;
      leadingIndicators.slice(0, 3).forEach((indicator, index) => {
        output += `${index + 1}. **${indicator.indicatorMetric.type}** → **${indicator.targetMetric.type}**\n`;
        output += `   • Lead Time: ${indicator.leadTime} periods\n`;
        output += `   • Predictive Power: ${(indicator.predictivePower * 100).toFixed(1)}%\n`;
        output += `   • Accuracy: ${(indicator.accuracyScore * 100).toFixed(1)}%\n`;
        output += `   • Insight: ${indicator.actionableInsight}\n\n`;
      });
    }
    
    // Performance drivers (if requested)
    if (performanceDrivers.length > 0) {
      output += `⚡ **Performance Drivers**\n`;
      performanceDrivers.slice(0, 3).forEach((driver, index) => {
        output += `${index + 1}. **${driver.driverMetric.type}** → **${driver.outcomeMetric.type}**\n`;
        output += `   • Impact Strength: ${(driver.impactStrength * 100).toFixed(1)}%\n`;
        output += `   • Actionability: ${(driver.actionabilityScore * 100).toFixed(1)}% (${driver.interventionDifficulty})\n`;
        output += `   • Strategy: ${driver.optimizationStrategy}\n\n`;
      });
    }
    
    return output;
  }

  private static formatExecutiveSummary(summary: any, _params: MetricsGetExecutiveSummaryParams): string {
    let output = `📋 **Executive Summary - ${summary.projectName}**\n\n`;
    
    // Time period
    output += `📅 **Analysis Period**\n`;
    output += `• From: ${summary.summaryPeriod.startDate.toISOString().split('T')[0]}\n`;
    output += `• To: ${summary.summaryPeriod.endDate.toISOString().split('T')[0]}\n`;
    output += `• Generated: ${summary.generatedAt.toISOString().split('T')[0]}\n\n`;
    
    // Overall health scores
    output += `🎯 **Overall Health Scores**\n`;
    output += `• Overall Health: ${summary.overallHealthScore}/100 ${this.getScoreEmoji(summary.overallHealthScore)}\n`;
    output += `• Velocity: ${summary.velocityScore}/100 ${this.getScoreEmoji(summary.velocityScore)}\n`;
    output += `• Quality: ${summary.qualityScore}/100 ${this.getScoreEmoji(summary.qualityScore)}\n`;
    output += `• Team Productivity: ${summary.teamProductivityScore}/100 ${this.getScoreEmoji(summary.teamProductivityScore)}\n`;
    output += `• Technical Debt: ${summary.technicalDebtScore}/100 ${this.getScoreEmoji(summary.technicalDebtScore, true)}\n\n`;
    
    // Core metrics summary
    output += `📊 **Key Metrics**\n`;
    const coreMetrics = summary.coreMetrics;
    output += `• Code Velocity: ${coreMetrics.codeVelocity.current.toFixed(2)} (${this.formatChange(coreMetrics.codeVelocity.change)}%)\n`;
    output += `• Quality Trend: ${coreMetrics.qualityTrend.current.toFixed(2)} (${this.formatChange(coreMetrics.qualityTrend.change)}%)\n`;
    output += `• Team Productivity: ${coreMetrics.teamProductivity.current.toFixed(2)} (${this.formatChange(coreMetrics.teamProductivity.change)}%)\n`;
    output += `• Technical Debt: ${coreMetrics.technicalDebt.current.toFixed(2)} (${this.formatChange(coreMetrics.technicalDebt.change)}%)\n\n`;
    
    // Risk assessment
    output += `⚠️ **Risk Assessment**\n`;
    output += `• Risk Level: ${summary.risks.level.toUpperCase()} ${this.getRiskEmoji(summary.risks.level)}\n`;
    output += `• Risk Factors:\n`;
    summary.risks.factors.forEach((factor: string) => {
      output += `  - ${factor}\n`;
    });
    output += `• Immediate Actions:\n`;
    summary.risks.recommendedActions.forEach((action: string) => {
      output += `  - ${action}\n`;
    });
    output += `\n`;
    
    // Forecasts (if included)
    if (summary.forecasts) {
      output += `🔮 **Forecasts (Next Month)**\n`;
      output += `• Velocity: ${summary.forecasts.velocityForecast.nextMonth} (${(summary.forecasts.velocityForecast.confidence * 100).toFixed(0)}% confidence)\n`;
      output += `• Quality: ${summary.forecasts.qualityForecast.nextMonth} (${(summary.forecasts.qualityForecast.confidence * 100).toFixed(0)}% confidence)\n`;
      output += `• Risk Level: ${summary.forecasts.riskForecast.level} (${(summary.forecasts.riskForecast.probability * 100).toFixed(0)}% probability)\n\n`;
    }
    
    // Recommendations
    output += `💡 **Recommendations** (Priority: ${summary.recommendations.priority.toUpperCase()})\n`;
    
    if (summary.recommendations.immediate.length > 0) {
      output += `\n**Immediate Actions:**\n`;
      summary.recommendations.immediate.forEach((action: string) => {
        output += `• ${action}\n`;
      });
    }
    
    if (summary.recommendations.shortTerm.length > 0) {
      output += `\n**Short-term (1-3 months):**\n`;
      summary.recommendations.shortTerm.forEach((action: string) => {
        output += `• ${action}\n`;
      });
    }
    
    if (summary.recommendations.longTerm.length > 0) {
      output += `\n**Long-term (3+ months):**\n`;
      summary.recommendations.longTerm.forEach((action: string) => {
        output += `• ${action}\n`;
      });
    }
    
    // Baseline comparison (if included)
    if (summary.baselineComparison) {
      output += `\n📈 **Baseline Comparison** (${summary.baselineComparison.period})\n`;
      output += `• Velocity Change: ${this.formatChange(summary.baselineComparison.velocityChange)}%\n`;
      output += `• Quality Change: ${this.formatChange(summary.baselineComparison.qualityChange)}%\n`;
      output += `• Productivity Change: ${this.formatChange(summary.baselineComparison.productivityChange)}%\n`;
    }
    
    return output;
  }

  private static async generateExportData(result: any, params: MetricsExportDataParams): Promise<any> {
    const metrics = result.aggregatedMetrics;
    
    switch (params.exportType) {
      case 'csv':
        return this.generateCSVExport(metrics, params);
      case 'json':
        return this.generateJSONExport(metrics, params);
      case 'excel':
        return this.generateExcelExport(metrics, params);
      default:
        throw new Error(`Unsupported export type: ${params.exportType}`);
    }
  }

  private static generateCSVExport(metrics: any[], _params: MetricsExportDataParams): string {
    // CSV header
    let csv = 'metric_type,metric_scope,value,unit,sample_size,data_quality,period_start,period_end\n';
    
    // CSV data rows
    metrics.forEach(metric => {
      csv += `"${metric.metricType}","${metric.metricScope}",${metric.value},"${metric.unit}",${metric.count},${metric.dataQualityScore},"${metric.periodStart}","${metric.periodEnd}"\n`;
    });
    
    return csv;
  }

  private static generateJSONExport(metrics: any[], params: MetricsExportDataParams): any {
    return {
      exportInfo: {
        projectId: params.projectId,
        exportType: params.exportType,
        timeframe: params.timeframe,
        generatedAt: new Date().toISOString(),
        totalMetrics: metrics.length
      },
      metrics: metrics.map(metric => ({
        metricType: metric.metricType,
        metricScope: metric.metricScope,
        value: metric.value,
        unit: metric.unit,
        sampleSize: metric.count,
        dataQuality: metric.dataQualityScore,
        periodStart: metric.periodStart,
        periodEnd: metric.periodEnd,
        ...(params.includeMetadata ? {
          min: metric.min,
          max: metric.max,
          standardDeviation: metric.standardDeviation,
          confidenceInterval: metric.confidenceInterval
        } : {})
      }))
    };
  }

  private static generateExcelExport(metrics: any[], params: MetricsExportDataParams): any {
    // For now, return JSON structure that could be converted to Excel
    return {
      sheets: {
        'Metrics Summary': this.generateJSONExport(metrics, params),
        'Export Info': {
          projectId: params.projectId,
          exportType: params.exportType,
          timeframe: params.timeframe,
          generatedAt: new Date().toISOString()
        }
      }
    };
  }

  private static formatExportResult(exportData: any, params: MetricsExportDataParams): string {
    let output = `📁 **Metrics Data Export**\n\n`;
    
    output += `⚙️ **Export Configuration**\n`;
    output += `• Format: ${params.exportType.toUpperCase()}\n`;
    output += `• Project: ${params.projectId.substring(0, 8)}...\n`;
    output += `• Time Range: ${params.timeframe.startDate} to ${params.timeframe.endDate}\n`;
    output += `• Aggregation: ${params.aggregationType || 'raw'}\n`;
    
    if (params.metricTypes) {
      output += `• Metric Types: ${params.metricTypes.join(', ')}\n`;
    }
    
    output += `\n📊 **Export Summary**\n`;
    
    if (params.exportType === 'csv') {
      const lines = (exportData as string).split('\n').length - 1;
      output += `• CSV Lines: ${lines}\n`;
      output += `• CSV Size: ${exportData.length} characters\n`;
      output += `\n📄 **CSV Preview** (First 5 lines)\n`;
      output += '```csv\n';
      output += exportData.split('\n').slice(0, 6).join('\n');
      output += '\n```\n';
    } else {
      const metrics = exportData.metrics || exportData.sheets?.['Metrics Summary']?.metrics || [];
      output += `• Records: ${metrics.length}\n`;
      output += `• Data Size: ${JSON.stringify(exportData).length} characters\n`;
      
      if (metrics.length > 0) {
        output += `\n📋 **Sample Records** (First 3)\n`;
        metrics.slice(0, 3).forEach((metric: any, index: number) => {
          output += `${index + 1}. ${metric.metricType}: ${metric.value} ${metric.unit}\n`;
        });
      }
    }
    
    output += `\n✅ **Export Status**: Ready for download\n`;
    output += `💡 **Usage**: This data can be imported into spreadsheets, BI tools, or used for further analysis.\n`;
    
    return output;
  }

  // Utility helper methods
  
  private static getScoreEmoji(score: number, reverse: boolean = false): string {
    const threshold = reverse ? 
      (score <= 30 ? '🟢' : score <= 60 ? '🟡' : '🔴') :
      (score >= 80 ? '🟢' : score >= 60 ? '🟡' : '🔴');
    return threshold;
  }
  
  private static getRiskEmoji(level: string): string {
    const emojis: { [key: string]: string } = {
      'low': '🟢',
      'medium': '🟡', 
      'high': '🟠',
      'critical': '🔴'
    };
    return emojis[level] || '⚪';
  }
  
  private static formatChange(change: number): string {
    const prefix = change >= 0 ? '+' : '';
    return `${prefix}${change.toFixed(1)}`;
  }
}

/**
 * Export the handler for use in server.ts
 */
export default MetricsAggregationHandler;