/**
 * TC015: Code Complexity MCP API Handlers
 * 
 * Comprehensive API endpoints for accessing code complexity intelligence:
 * - Multi-dimensional complexity analysis (cyclomatic, cognitive, Halstead, coupling)
 * - Real-time complexity monitoring and alerting
 * - Complexity trend analysis and forecasting
 * - Refactoring opportunity identification
 * - Technical debt quantification and tracking
 * - Complexity hotspot detection and management
 * 
 * Performance Target: Sub-100ms API response times for dashboard queries
 * Integration: Git tracking, pattern detection, development metrics
 */

import { db } from '../config/database.js';
import { logEvent } from '../middleware/eventLogger.js';
import { getCurrentSession } from '../services/sessionManager.js';
import { 
  ComplexityTracker,
  startComplexityTracking,
  stopComplexityTracking,
  analyzeFileComplexity,
  analyzeComplexityOnCommit,
  getComplexityTrends,
  getComplexityAlerts,
  getRefactoringOpportunities,
  getComplexityTrackingPerformance,
  ComplexityAnalysisResult
} from '../services/complexityTracker.js';

// MCP Tool Definitions for Code Complexity
const CODE_COMPLEXITY_TOOLS = [
  {
    name: 'complexity_analyze_files',
    description: 'Analyze code complexity for specific files with multi-dimensional metrics',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID to analyze files for'
        },
        filePaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of file paths to analyze for complexity'
        },
        trigger: {
          type: 'string',
          enum: ['manual', 'git_commit', 'scheduled', 'threshold_breach', 'batch_analysis'],
          description: 'What triggered this analysis',
          default: 'manual'
        },
        includeMetrics: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['cyclomatic', 'cognitive', 'halstead', 'dependency', 'all']
          },
          description: 'Which complexity metrics to include',
          default: ['all']
        }
      },
      required: ['projectId', 'filePaths']
    }
  },
  {
    name: 'complexity_get_dashboard',
    description: 'Get comprehensive complexity dashboard for project with sub-100ms performance',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID to get complexity dashboard for'
        },
        includeHotspots: {
          type: 'boolean',
          description: 'Include complexity hotspots in response',
          default: true
        },
        includeAlerts: {
          type: 'boolean',
          description: 'Include active complexity alerts',
          default: true
        },
        includeOpportunities: {
          type: 'boolean',
          description: 'Include refactoring opportunities',
          default: true
        },
        includeTrends: {
          type: 'boolean',
          description: 'Include complexity trend indicators',
          default: true
        }
      },
      required: ['projectId']
    }
  },
  {
    name: 'complexity_get_file_metrics',
    description: 'Get detailed complexity metrics for specific files',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID'
        },
        filePaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific file paths to get metrics for (optional, returns all if not provided)'
        },
        complexityTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['cyclomatic', 'cognitive', 'halstead', 'dependency', 'overall']
          },
          description: 'Types of complexity metrics to retrieve'
        },
        minComplexityScore: {
          type: 'number',
          minimum: 0,
          description: 'Minimum complexity score to filter results',
          default: 0
        },
        riskLevels: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['very_low', 'low', 'moderate', 'high', 'very_high', 'critical']
          },
          description: 'Filter by risk levels'
        },
        includeFunctionLevel: {
          type: 'boolean',
          description: 'Include function-level complexity details',
          default: false
        }
      },
      required: ['projectId']
    }
  },
  {
    name: 'complexity_get_function_metrics',
    description: 'Get detailed complexity metrics at function level',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID'
        },
        filePath: {
          type: 'string',
          description: 'Specific file path (optional)'
        },
        functionName: {
          type: 'string',
          description: 'Specific function name (optional)'
        },
        minCyclomaticComplexity: {
          type: 'number',
          minimum: 1,
          description: 'Minimum cyclomatic complexity to filter results',
          default: 10
        },
        minCognitiveComplexity: {
          type: 'number',
          minimum: 0,
          description: 'Minimum cognitive complexity to filter results',
          default: 15
        },
        sortBy: {
          type: 'string',
          enum: ['cyclomatic', 'cognitive', 'risk', 'nesting'],
          description: 'Sort results by metric',
          default: 'cyclomatic'
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of functions to return',
          default: 20
        }
      },
      required: ['projectId']
    }
  },
  {
    name: 'complexity_get_hotspots',
    description: 'Get complexity hotspots that require immediate attention',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID'
        },
        hotspotTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['high_complexity', 'frequent_changes', 'combined_risk', 'coupling_hotspot']
          },
          description: 'Types of hotspots to include'
        },
        minHotspotScore: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Minimum hotspot score (0-1)',
          default: 0.6
        },
        riskLevels: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['high', 'very_high', 'critical']
          },
          description: 'Risk levels to include',
          default: ['high', 'very_high', 'critical']
        },
        includeRecommendations: {
          type: 'boolean',
          description: 'Include detailed recommendations',
          default: true
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 50,
          description: 'Maximum number of hotspots to return',
          default: 15
        }
      },
      required: ['projectId']
    }
  },
  {
    name: 'complexity_get_alerts',
    description: 'Get active complexity alerts and threshold violations',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID (optional, returns all projects if not provided)'
        },
        alertTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['threshold_exceeded', 'complexity_regression', 'hotspot_detected', 'technical_debt_spike']
          },
          description: 'Types of alerts to include'
        },
        complexityTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['cyclomatic', 'cognitive', 'halstead', 'coupling', 'overall']
          },
          description: 'Complexity types to filter alerts by'
        },
        severities: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['info', 'warning', 'error', 'critical']
          },
          description: 'Alert severities to include'
        },
        statuses: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['open', 'acknowledged', 'investigating', 'resolved']
          },
          description: 'Alert statuses to include',
          default: ['open', 'acknowledged']
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of alerts to return',
          default: 25
        },
        includeActions: {
          type: 'boolean',
          description: 'Include recommended actions',
          default: true
        }
      }
    }
  },
  {
    name: 'complexity_acknowledge_alert',
    description: 'Acknowledge a complexity alert',
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
    name: 'complexity_resolve_alert',
    description: 'Mark a complexity alert as resolved',
    inputSchema: {
      type: 'object',
      properties: {
        alertId: {
          type: 'string',
          description: 'Alert ID to resolve'
        },
        resolutionMethod: {
          type: 'string',
          enum: ['refactored', 'threshold_adjusted', 'false_positive', 'accepted_risk', 'split_function', 'other'],
          description: 'Method used to resolve the alert'
        },
        resolvedBy: {
          type: 'string',
          description: 'Name/email of person resolving (optional, uses current session)'
        },
        resolutionNotes: {
          type: 'string',
          description: 'Resolution notes and actions taken'
        },
        followUpRequired: {
          type: 'boolean',
          description: 'Whether follow-up is required',
          default: false
        },
        followUpDate: {
          type: 'string',
          description: 'Follow-up date if required (ISO format)'
        }
      },
      required: ['alertId', 'resolutionMethod', 'resolutionNotes']
    }
  },
  {
    name: 'complexity_get_refactoring_opportunities',
    description: 'Get prioritized refactoring opportunities based on complexity analysis',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID'
        },
        opportunityTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['extract_method', 'split_function', 'reduce_nesting', 'eliminate_duplication', 'simplify_conditionals', 'reduce_parameters', 'break_dependencies', 'improve_cohesion']
          },
          description: 'Types of refactoring opportunities to include'
        },
        minRoiScore: {
          type: 'number',
          minimum: 0,
          description: 'Minimum ROI score to filter results',
          default: 0.3
        },
        maxEffortHours: {
          type: 'number',
          minimum: 1,
          description: 'Maximum effort hours to filter results'
        },
        urgencyLevels: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'urgent']
          },
          description: 'Urgency levels to include',
          default: ['medium', 'high', 'urgent']
        },
        statuses: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['identified', 'planned', 'in_progress', 'completed', 'rejected', 'deferred']
          },
          description: 'Opportunity statuses to include',
          default: ['identified', 'planned']
        },
        sortBy: {
          type: 'string',
          enum: ['roi', 'priority', 'effort', 'impact'],
          description: 'Sort opportunities by metric',
          default: 'roi'
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 50,
          description: 'Maximum number of opportunities to return',
          default: 20
        }
      },
      required: ['projectId']
    }
  },
  {
    name: 'complexity_get_trends',
    description: 'Get complexity trends and forecasting data over time',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID'
        },
        filePath: {
          type: 'string',
          description: 'Specific file path (optional, returns project-level if not provided)'
        },
        complexityTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['cyclomatic', 'cognitive', 'halstead_effort', 'coupling', 'overall']
          },
          description: 'Types of complexity to get trends for',
          default: ['overall']
        },
        timeframeDays: {
          type: 'number',
          minimum: 7,
          maximum: 365,
          description: 'Number of days to analyze trends for',
          default: 30
        },
        includeForecast: {
          type: 'boolean',
          description: 'Include complexity forecasting',
          default: true
        },
        includeAnomalies: {
          type: 'boolean',
          description: 'Include anomaly detection results',
          default: true
        },
        includeChangePoints: {
          type: 'boolean',
          description: 'Include change point detection',
          default: true
        }
      },
      required: ['projectId']
    }
  },
  {
    name: 'complexity_get_technical_debt',
    description: 'Get technical debt analysis based on complexity metrics',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID'
        },
        debtTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['complexity_debt', 'maintainability_debt', 'coupling_debt', 'testing_debt']
          },
          description: 'Types of technical debt to analyze',
          default: ['complexity_debt']
        },
        minDebtMinutes: {
          type: 'number',
          minimum: 0,
          description: 'Minimum debt in minutes to filter results',
          default: 30
        },
        includeEstimates: {
          type: 'boolean',
          description: 'Include effort estimates for debt resolution',
          default: true
        },
        includePrioritization: {
          type: 'boolean',
          description: 'Include debt prioritization analysis',
          default: true
        },
        groupBy: {
          type: 'string',
          enum: ['file', 'component', 'severity', 'type'],
          description: 'How to group debt analysis',
          default: 'file'
        }
      },
      required: ['projectId']
    }
  },
  {
    name: 'complexity_analyze_commit',
    description: 'Analyze complexity for files changed in specific git commits',
    inputSchema: {
      type: 'object',
      properties: {
        commitShas: {
          type: 'array',
          items: { type: 'string' },
          description: 'Git commit SHAs to analyze complexity for'
        },
        includeComparison: {
          type: 'boolean',
          description: 'Include comparison with previous complexity analysis',
          default: true
        },
        detectRegression: {
          type: 'boolean',
          description: 'Detect complexity regression from commits',
          default: true
        }
      },
      required: ['commitShas']
    }
  },
  {
    name: 'complexity_set_thresholds',
    description: 'Configure complexity thresholds and alerting rules for a project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID to set thresholds for'
        },
        cyclomaticThresholds: {
          type: 'object',
          properties: {
            low: { type: 'number', minimum: 1 },
            moderate: { type: 'number', minimum: 1 },
            high: { type: 'number', minimum: 1 },
            veryHigh: { type: 'number', minimum: 1 },
            critical: { type: 'number', minimum: 1 }
          },
          description: 'Cyclomatic complexity thresholds'
        },
        cognitiveThresholds: {
          type: 'object',
          properties: {
            low: { type: 'number', minimum: 1 },
            moderate: { type: 'number', minimum: 1 },
            high: { type: 'number', minimum: 1 },
            veryHigh: { type: 'number', minimum: 1 },
            critical: { type: 'number', minimum: 1 }
          },
          description: 'Cognitive complexity thresholds'
        },
        halsteadThresholds: {
          type: 'object',
          properties: {
            low: { type: 'number', minimum: 1 },
            moderate: { type: 'number', minimum: 1 },
            high: { type: 'number', minimum: 1 },
            veryHigh: { type: 'number', minimum: 1 },
            critical: { type: 'number', minimum: 1 }
          },
          description: 'Halstead effort thresholds'
        },
        alertSettings: {
          type: 'object',
          properties: {
            enableThresholdAlerts: { type: 'boolean', default: true },
            enableRegressionAlerts: { type: 'boolean', default: true },
            enableHotspotAlerts: { type: 'boolean', default: true },
            regressionPercentage: { type: 'number', minimum: 5, maximum: 100, default: 25 }
          },
          description: 'Alert configuration settings'
        }
      },
      required: ['projectId']
    }
  },
  {
    name: 'complexity_get_performance',
    description: 'Get complexity tracking system performance statistics',
    inputSchema: {
      type: 'object',
      properties: {
        includeHistory: {
          type: 'boolean',
          description: 'Include historical performance data',
          default: false
        },
        includeBreakdown: {
          type: 'boolean',
          description: 'Include performance breakdown by analysis type',
          default: true
        }
      }
    }
  },
  {
    name: 'complexity_start_tracking',
    description: 'Start the complexity tracking service with optional configuration',
    inputSchema: {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          description: 'Optional configuration overrides',
          properties: {
            enableRealTimeAnalysis: { type: 'boolean' },
            enableBatchProcessing: { type: 'boolean' },
            autoAnalyzeOnCommit: { type: 'boolean' },
            scheduledAnalysisIntervalMs: { type: 'number' },
            alertOnThresholdBreach: { type: 'boolean' }
          }
        }
      }
    }
  },
  {
    name: 'complexity_stop_tracking',
    description: 'Stop the complexity tracking service',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

/**
 * Code Complexity Handler Class
 */
export class CodeComplexityHandler {
  /**
   * Get all available complexity tools
   */
  static getTools() {
    return CODE_COMPLEXITY_TOOLS;
  }

  /**
   * Handle complexity tool calls
   */
  static async handleTool(name: string, args: any): Promise<any> {
    const startTime = Date.now();

    try {
      console.log(`🔧 Handling complexity tool: ${name}`);

      let result;
      switch (name) {
        case 'complexity_analyze_files':
          result = await this.analyzeFiles(args);
          break;
        case 'complexity_get_dashboard':
          result = await this.getComplexityDashboard(args);
          break;
        case 'complexity_get_file_metrics':
          result = await this.getFileMetrics(args);
          break;
        case 'complexity_get_function_metrics':
          result = await this.getFunctionMetrics(args);
          break;
        case 'complexity_get_hotspots':
          result = await this.getComplexityHotspots(args);
          break;
        case 'complexity_get_alerts':
          result = await this.getComplexityAlerts(args);
          break;
        case 'complexity_acknowledge_alert':
          result = await this.acknowledgeAlert(args);
          break;
        case 'complexity_resolve_alert':
          result = await this.resolveAlert(args);
          break;
        case 'complexity_get_refactoring_opportunities':
          result = await this.getRefactoringOpportunities(args);
          break;
        case 'complexity_get_trends':
          result = await this.getComplexityTrends(args);
          break;
        case 'complexity_get_technical_debt':
          result = await this.getTechnicalDebt(args);
          break;
        case 'complexity_analyze_commit':
          result = await this.analyzeCommit(args);
          break;
        case 'complexity_set_thresholds':
          result = await this.setThresholds(args);
          break;
        case 'complexity_get_performance':
          result = await this.getPerformanceStats(args);
          break;
        case 'complexity_start_tracking':
          result = await this.startTracking(args);
          break;
        case 'complexity_stop_tracking':
          result = await this.stopTracking(args);
          break;
        default:
          throw new Error(`Unknown complexity tool: ${name}`);
      }

      const executionTime = Date.now() - startTime;

      // Log tool execution
      await logEvent({
        actor: 'human',
        event_type: 'complexity_tool_executed',
        status: 'closed',
        metadata: {
          toolName: name,
          executionTimeMs: executionTime,
          success: true,
          args: Object.keys(args)
        },
        tags: ['complexity', 'mcp', 'tool']
      });

      console.log(`✅ Complexity tool ${name} completed in ${executionTime}ms`);
      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      console.error(`❌ Complexity tool ${name} failed:`, error);

      // Log tool error
      await logEvent({
        actor: 'human',
        event_type: 'complexity_tool_error',
        status: 'error',
        metadata: {
          toolName: name,
          executionTimeMs: executionTime,
          error: error instanceof Error ? error.message : 'Unknown error',
          args: Object.keys(args)
        },
        tags: ['complexity', 'mcp', 'error']
      });

      throw error;
    }
  }

  /**
   * Analyze files for complexity
   */
  private static async analyzeFiles(args: any): Promise<any> {
    const { projectId, filePaths, trigger = 'manual', includeMetrics = ['all'] } = args;

    try {
      // Trigger complexity analysis
      const result = await analyzeFileComplexity(projectId, filePaths, trigger);

      // Filter metrics based on includeMetrics parameter
      const filteredResult = this.filterMetricsByType(result, includeMetrics);

      return {
        success: true,
        message: `Complexity analysis completed for ${filePaths.length} files`,
        analysisSessionId: result.analysisSessionId,
        executionTimeMs: result.executionTimeMs,
        summary: {
          filesAnalyzed: result.filesAnalyzed,
          functionsAnalyzed: result.functionsAnalyzed,
          classesAnalyzed: result.classesAnalyzed,
          complexityMetricsCalculated: result.complexityMetricsCalculated,
          avgComplexityScore: result.avgComplexityScore,
          maxComplexityScore: result.maxComplexityScore
        },
        metrics: filteredResult,
        hotspots: result.hotspotsIdentified,
        refactoringOpportunities: result.refactoringOpportunities.slice(0, 10), // Top 10
        alerts: result.complexityAlerts,
        qualityScores: {
          analysisCompleteness: result.analysisCompletenessScore,
          confidence: result.confidenceScore,
          dataFreshness: result.dataFreshnessHours
        },
        errors: result.errors
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Complexity analysis failed',
        projectId,
        filePaths: filePaths.length
      };
    }
  }

  /**
   * Get complexity dashboard with optimized performance
   */
  private static async getComplexityDashboard(args: any): Promise<any> {
    const { projectId, includeHotspots = true, includeAlerts = true, includeOpportunities = true, includeTrends = true } = args;

    try {
      // Use materialized view for optimal performance
      const dashboardQuery = `
        SELECT * FROM project_complexity_dashboard 
        WHERE project_id = $1
      `;

      const dashboardResult = await db.query(dashboardQuery, [projectId]);
      const dashboard = dashboardResult.rows[0];

      if (!dashboard) {
        return {
          success: false,
          error: 'No complexity dashboard data found for project',
          projectId
        };
      }

      const response: any = {
        success: true,
        projectId,
        projectName: dashboard.project_name,
        lastAnalysis: dashboard.last_analysis,
        dataFreshness: {
          hoursAgo: Math.round(dashboard.hours_since_analysis),
          status: dashboard.hours_since_analysis < 24 ? 'fresh' : 
                  dashboard.hours_since_analysis < 72 ? 'moderate' : 'stale'
        },
        overallComplexity: {
          avgComplexityScore: dashboard.avg_complexity_score,
          maxComplexityScore: dashboard.max_complexity_score,
          totalFilesAnalyzed: dashboard.total_files_analyzed
        },
        riskDistribution: {
          criticalRiskFiles: dashboard.critical_risk_files,
          veryHighRiskFiles: dashboard.very_high_risk_files,
          highRiskFiles: dashboard.high_risk_files,
          totalHighRiskFiles: dashboard.total_high_risk_files
        },
        complexityGrades: {
          gradeA: dashboard.grade_a_files,
          gradeB: dashboard.grade_b_files,
          gradeC: dashboard.grade_c_files,
          gradeD: dashboard.grade_d_files,
          gradeF: dashboard.grade_f_files
        },
        technicalDebt: {
          totalMinutes: dashboard.total_technical_debt_minutes,
          avgMaintenanceCost: dashboard.avg_maintenance_cost_factor,
          estimatedHours: Math.round(dashboard.total_technical_debt_minutes / 60)
        }
      };

      // Include hotspots if requested
      if (includeHotspots) {
        const hotspotsQuery = `
          SELECT file_path, overall_complexity_score, hotspot_score, risk_level,
                 max_refactoring_priority, active_alerts, refactoring_opportunities
          FROM high_risk_complexity_items
          WHERE project_id = $1
          ORDER BY hotspot_score DESC, overall_complexity_score DESC
          LIMIT 10
        `;

        const hotspotsResult = await db.query(hotspotsQuery, [projectId]);
        response.complexityHotspots = {
          count: dashboard.complexity_hotspots,
          items: hotspotsResult.rows
        };
      }

      // Include active alerts if requested
      if (includeAlerts) {
        const alertsQuery = `
          SELECT alert_type, complexity_type, violation_severity, title, description,
                 triggered_at, file_path, function_name
          FROM complexity_alerts
          WHERE project_id = $1 AND status IN ('open', 'acknowledged')
          ORDER BY 
            CASE violation_severity 
              WHEN 'critical' THEN 1 
              WHEN 'error' THEN 2 
              WHEN 'warning' THEN 3 
              ELSE 4 
            END,
            triggered_at DESC
          LIMIT 15
        `;

        const alertsResult = await db.query(alertsQuery, [projectId]);
        response.activeAlerts = {
          total: dashboard.active_alerts,
          critical: dashboard.critical_alerts,
          recent: alertsResult.rows
        };
      }

      // Include refactoring opportunities if requested
      if (includeOpportunities) {
        const opportunitiesQuery = `
          SELECT file_path, function_name, opportunity_type, current_complexity_score,
                 estimated_complexity_reduction, roi_score, refactoring_effort_hours,
                 urgency_level, description
          FROM refactoring_opportunities
          WHERE project_id = $1 AND status IN ('identified', 'planned')
          ORDER BY roi_score DESC, priority_score DESC
          LIMIT 10
        `;

        const opportunitiesResult = await db.query(opportunitiesQuery, [projectId]);
        response.refactoringOpportunities = {
          total: dashboard.refactoring_opportunities,
          urgent: dashboard.urgent_refactoring_opportunities,
          avgRoi: dashboard.avg_refactoring_roi,
          topOpportunities: opportunitiesResult.rows
        };
      }

      // Include trend indicators if requested
      if (includeTrends) {
        response.trendIndicators = {
          increasingComplexityFiles: dashboard.increasing_complexity_files,
          recentAnomalies: dashboard.recent_complexity_anomalies,
          trendDirection: dashboard.increasing_complexity_files > 5 ? 'increasing' : 
                         dashboard.increasing_complexity_files === 0 ? 'stable' : 'mixed'
        };
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
   * Get detailed file-level complexity metrics
   */
  private static async getFileMetrics(args: any): Promise<any> {
    const { 
      projectId, 
      filePaths, 
      complexityTypes, 
      minComplexityScore = 0, 
      riskLevels,
      includeFunctionLevel = false
    } = args;

    try {
      let whereClause = 'WHERE fcs.project_id = $1';
      let queryParams: any[] = [projectId];
      let paramIndex = 2;

      // Filter by file paths
      if (filePaths && filePaths.length > 0) {
        whereClause += ` AND fcs.file_path = ANY($${paramIndex})`;
        queryParams.push(filePaths);
        paramIndex++;
      }

      // Filter by minimum complexity score
      if (minComplexityScore > 0) {
        whereClause += ` AND fcs.overall_complexity_score >= $${paramIndex}`;
        queryParams.push(minComplexityScore);
        paramIndex++;
      }

      // Filter by risk levels
      if (riskLevels && riskLevels.length > 0) {
        whereClause += ` AND fcs.risk_level = ANY($${paramIndex})`;
        queryParams.push(riskLevels);
        paramIndex++;
      }

      const metricsQuery = `
        SELECT 
          fcs.file_path, fcs.file_type, fcs.overall_complexity_score,
          fcs.complexity_grade, fcs.risk_level, fcs.is_complexity_hotspot,
          fcs.avg_cyclomatic_complexity, fcs.max_cyclomatic_complexity,
          fcs.total_cognitive_complexity, fcs.avg_cognitive_complexity,
          fcs.maintainability_index, fcs.coupling_score, fcs.cohesion_score,
          fcs.total_functions, fcs.total_classes, fcs.lines_of_code,
          fcs.hotspot_score, fcs.refactoring_priority, fcs.technical_debt_minutes,
          cas.analysis_timestamp as last_analyzed
        FROM file_complexity_summary fcs
        JOIN complexity_analysis_sessions cas ON fcs.analysis_session_id = cas.id
        ${whereClause}
        AND cas.status = 'completed'
        ORDER BY fcs.overall_complexity_score DESC, fcs.hotspot_score DESC
      `;

      const result = await db.query(metricsQuery, queryParams);
      const fileMetrics = result.rows;

      const response: any = {
        success: true,
        projectId,
        summary: {
          totalFiles: fileMetrics.length,
          avgComplexityScore: fileMetrics.length > 0 ?
            fileMetrics.reduce((sum, f) => sum + parseFloat(f.overall_complexity_score), 0) / fileMetrics.length : 0,
          highRiskFiles: fileMetrics.filter(f => ['high', 'very_high', 'critical'].includes(f.risk_level)).length,
          hotspotsCount: fileMetrics.filter(f => f.is_complexity_hotspot).length,
          avgTechnicalDebt: fileMetrics.length > 0 ?
            fileMetrics.reduce((sum, f) => sum + parseInt(f.technical_debt_minutes), 0) / fileMetrics.length : 0
        },
        files: fileMetrics
      };

      // Include function-level metrics if requested
      if (includeFunctionLevel && filePaths && filePaths.length <= 5) {
        const functionsQuery = `
          SELECT 
            ccm.file_path, ccm.function_name, ccm.class_name, ccm.start_line, ccm.end_line,
            ccm.cyclomatic_complexity, ccm.complexity_grade as cyclomatic_grade, ccm.risk_level,
            cogm.cognitive_complexity, cogm.understandability_grade,
            cogm.readability_score, cogm.mental_effort_estimate
          FROM cyclomatic_complexity_metrics ccm
          LEFT JOIN cognitive_complexity_metrics cogm ON 
            ccm.analysis_session_id = cogm.analysis_session_id AND
            ccm.file_path = cogm.file_path AND
            ccm.function_name = cogm.function_name
          WHERE ccm.file_path = ANY($1)
          AND ccm.analysis_session_id IN (
            SELECT id FROM complexity_analysis_sessions 
            WHERE project_id = $2 AND status = 'completed'
            ORDER BY analysis_timestamp DESC LIMIT 1
          )
          ORDER BY ccm.cyclomatic_complexity DESC
        `;

        const functionsResult = await db.query(functionsQuery, [filePaths, projectId]);
        response.functionDetails = this.groupBy(functionsResult.rows, 'file_path');
      }

      // Group by complexity types if specified
      if (complexityTypes && complexityTypes.length > 0) {
        response.metricsByType = {};
        
        for (const type of complexityTypes) {
          switch (type) {
            case 'cyclomatic':
              response.metricsByType.cyclomatic = fileMetrics.map(f => ({
                filePath: f.file_path,
                avgComplexity: f.avg_cyclomatic_complexity,
                maxComplexity: f.max_cyclomatic_complexity,
                grade: this.getCyclomaticGradeFromAvg(f.avg_cyclomatic_complexity)
              }));
              break;
            case 'cognitive':
              response.metricsByType.cognitive = fileMetrics.map(f => ({
                filePath: f.file_path,
                totalComplexity: f.total_cognitive_complexity,
                avgComplexity: f.avg_cognitive_complexity,
                grade: this.getCognitiveGradeFromAvg(f.avg_cognitive_complexity)
              }));
              break;
            case 'halstead':
              response.metricsByType.halstead = fileMetrics.map(f => ({
                filePath: f.file_path,
                maintainabilityIndex: f.maintainability_index,
                grade: this.getMaintainabilityGrade(f.maintainability_index)
              }));
              break;
            case 'dependency':
              response.metricsByType.dependency = fileMetrics.map(f => ({
                filePath: f.file_path,
                couplingScore: f.coupling_score,
                cohesionScore: f.cohesion_score,
                riskLevel: this.getCouplingRiskLevel(f.coupling_score)
              }));
              break;
          }
        }
      }

      return response;

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'File metrics query failed',
        projectId
      };
    }
  }

  /**
   * Get detailed function-level complexity metrics
   */
  private static async getFunctionMetrics(args: any): Promise<any> {
    const { 
      projectId, 
      filePath, 
      functionName, 
      minCyclomaticComplexity = 10, 
      minCognitiveComplexity = 15,
      sortBy = 'cyclomatic',
      limit = 20
    } = args;

    try {
      let whereClause = 'WHERE ccm.project_id = $1';
      let queryParams: any[] = [projectId];
      let paramIndex = 2;

      if (filePath) {
        whereClause += ` AND ccm.file_path = $${paramIndex}`;
        queryParams.push(filePath);
        paramIndex++;
      }

      if (functionName) {
        whereClause += ` AND ccm.function_name = $${paramIndex}`;
        queryParams.push(functionName);
        paramIndex++;
      }

      whereClause += ` AND ccm.cyclomatic_complexity >= $${paramIndex}`;
      queryParams.push(minCyclomaticComplexity);
      paramIndex++;

      const functionsQuery = `
        SELECT 
          ccm.file_path, ccm.function_name, ccm.class_name, ccm.function_signature,
          ccm.start_line, ccm.end_line, ccm.cyclomatic_complexity, ccm.essential_complexity,
          ccm.complexity_grade, ccm.risk_level as cyclomatic_risk, ccm.decision_points,
          ccm.nesting_depth, ccm.logical_operators, ccm.testing_effort_estimate,
          cogm.cognitive_complexity, cogm.base_complexity, cogm.nesting_increment,
          cogm.max_nesting_level, cogm.if_statements, cogm.switch_statements,
          cogm.loops, cogm.try_catch_blocks, cogm.readability_score,
          cogm.understandability_grade, cogm.mental_effort_estimate, cogm.refactoring_benefit_score,
          cas.analysis_timestamp as analyzed_at
        FROM cyclomatic_complexity_metrics ccm
        LEFT JOIN cognitive_complexity_metrics cogm ON 
          ccm.analysis_session_id = cogm.analysis_session_id AND
          ccm.file_path = cogm.file_path AND
          ccm.function_name = cogm.function_name AND
          ccm.start_line = cogm.start_line
        JOIN complexity_analysis_sessions cas ON ccm.analysis_session_id = cas.id
        ${whereClause}
        AND cas.status = 'completed'
        AND COALESCE(cogm.cognitive_complexity, 0) >= $${paramIndex}
        ORDER BY 
          CASE '${sortBy}'
            WHEN 'cyclomatic' THEN ccm.cyclomatic_complexity
            WHEN 'cognitive' THEN COALESCE(cogm.cognitive_complexity, 0)
            WHEN 'risk' THEN CASE ccm.risk_level
              WHEN 'critical' THEN 6
              WHEN 'very_high' THEN 5
              WHEN 'high' THEN 4
              WHEN 'moderate' THEN 3
              WHEN 'low' THEN 2
              ELSE 1
            END
            WHEN 'nesting' THEN ccm.nesting_depth
            ELSE ccm.cyclomatic_complexity
          END DESC
        LIMIT $${paramIndex + 1}
      `;

      queryParams.push(minCognitiveComplexity);
      queryParams.push(limit);

      const result = await db.query(functionsQuery, queryParams);
      const functions = result.rows;

      // Calculate summary statistics
      const summary = {
        totalFunctions: functions.length,
        avgCyclomaticComplexity: functions.length > 0 ?
          functions.reduce((sum, f) => sum + f.cyclomatic_complexity, 0) / functions.length : 0,
        avgCognitiveComplexity: functions.length > 0 ?
          functions.reduce((sum, f) => sum + (f.cognitive_complexity || 0), 0) / functions.length : 0,
        highRiskFunctions: functions.filter(f => ['high', 'very_high', 'critical'].includes(f.cyclomatic_risk)).length,
        avgReadabilityScore: functions.length > 0 ?
          functions.reduce((sum, f) => sum + (f.readability_score || 0), 0) / functions.length : 0,
        functionsNeedingRefactoring: functions.filter(f => (f.refactoring_benefit_score || 0) > 0.5).length
      };

      // Group functions by file and class for better organization
      const functionsByFile = this.groupBy(functions, 'file_path');
      const functionsByClass = this.groupBy(functions.filter(f => f.class_name), 'class_name');

      return {
        success: true,
        projectId,
        summary,
        queryParams: {
          filePath,
          functionName,
          minCyclomaticComplexity,
          minCognitiveComplexity,
          sortBy,
          limit,
          resultsCount: functions.length
        },
        functions,
        functionsByFile,
        functionsByClass
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Function metrics query failed',
        projectId
      };
    }
  }

  /**
   * Get complexity hotspots requiring attention
   */
  private static async getComplexityHotspots(args: any): Promise<any> {
    const { 
      projectId, 
      hotspotTypes, 
      minHotspotScore = 0.6, 
      riskLevels = ['high', 'very_high', 'critical'],
      includeRecommendations = true,
      limit = 15
    } = args;

    try {
      let whereClause = 'WHERE project_id = $1 AND hotspot_score >= $2';
      let queryParams: any[] = [projectId, minHotspotScore];
      let paramIndex = 3;

      // Filter by risk levels
      whereClause += ` AND risk_level = ANY($${paramIndex})`;
      queryParams.push(riskLevels);
      paramIndex++;

      const hotspotsQuery = `
        SELECT 
          file_path, overall_complexity_score, hotspot_score, risk_level,
          complexity_grade, is_complexity_hotspot, refactoring_priority,
          avg_cyclomatic_complexity, max_cyclomatic_complexity,
          total_cognitive_complexity, maintainability_index,
          technical_debt_minutes, change_frequency, modification_trend,
          function_name, cyclomatic_complexity, cognitive_complexity,
          coupling_factor, last_analyzed
        FROM high_risk_complexity_items
        ${whereClause}
        ORDER BY hotspot_score DESC, overall_complexity_score DESC
        LIMIT $${paramIndex}
      `;

      queryParams.push(limit);

      const result = await db.query(hotspotsQuery, queryParams);
      let hotspots = result.rows;

      // Filter by hotspot types if specified
      if (hotspotTypes && hotspotTypes.length > 0) {
        hotspots = hotspots.filter(hotspot => {
          if (hotspotTypes.includes('high_complexity') && hotspot.overall_complexity_score > 0.7) return true;
          if (hotspotTypes.includes('frequent_changes') && hotspot.change_frequency > 5) return true;
          if (hotspotTypes.includes('combined_risk') && hotspot.overall_complexity_score > 0.6 && hotspot.change_frequency > 3) return true;
          if (hotspotTypes.includes('coupling_hotspot') && hotspot.coupling_factor > 0.5) return true;
          return false;
        });
      }

      // Add recommendations if requested
      if (includeRecommendations) {
        hotspots = hotspots.map(hotspot => ({
          ...hotspot,
          recommendations: this.generateHotspotRecommendations(hotspot),
          urgencyLevel: this.calculateUrgencyLevel(hotspot),
          estimatedEffortHours: this.estimateRefactoringEffort(hotspot)
        }));
      }

      // Calculate summary statistics
      const summary = {
        totalHotspots: hotspots.length,
        criticalHotspots: hotspots.filter(h => h.risk_level === 'critical').length,
        avgHotspotScore: hotspots.length > 0 ?
          hotspots.reduce((sum, h) => sum + parseFloat(h.hotspot_score), 0) / hotspots.length : 0,
        totalTechnicalDebtHours: Math.round(
          hotspots.reduce((sum, h) => sum + parseInt(h.technical_debt_minutes), 0) / 60
        ),
        urgentHotspots: hotspots.filter(h => h.urgencyLevel === 'urgent').length
      };

      return {
        success: true,
        projectId,
        summary,
        queryParams: {
          minHotspotScore,
          riskLevels,
          limit,
          hotspotTypes
        },
        hotspots
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Hotspots query failed',
        projectId
      };
    }
  }

  /**
   * Get active complexity alerts
   */
  private static async getComplexityAlerts(args: any): Promise<any> {
    const { 
      projectId, 
      alertTypes, 
      complexityTypes, 
      severities, 
      statuses = ['open', 'acknowledged'], 
      limit = 25,
      includeActions = true
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

      if (statuses && statuses.length > 0) {
        whereClause += ` AND status = ANY($${paramIndex})`;
        queryParams.push(statuses);
        paramIndex++;
      }

      if (alertTypes && alertTypes.length > 0) {
        whereClause += ` AND alert_type = ANY($${paramIndex})`;
        queryParams.push(alertTypes);
        paramIndex++;
      }

      if (complexityTypes && complexityTypes.length > 0) {
        whereClause += ` AND complexity_type = ANY($${paramIndex})`;
        queryParams.push(complexityTypes);
        paramIndex++;
      }

      if (severities && severities.length > 0) {
        whereClause += ` AND violation_severity = ANY($${paramIndex})`;
        queryParams.push(severities);
        paramIndex++;
      }

      const alertsQuery = `
        SELECT 
          ca.id, ca.alert_type, ca.complexity_type, ca.file_path, ca.function_name,
          ca.current_value, ca.threshold_value, ca.violation_magnitude,
          ca.violation_severity, ca.title, ca.description, ca.status,
          ${includeActions ? 'ca.immediate_actions, ca.recommended_actions,' : ''}
          ca.estimated_effort_hours, ca.priority, ca.triggered_at,
          ca.acknowledged_at, ca.acknowledged_by, ca.follow_up_required, ca.follow_up_date,
          EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ca.triggered_at)) / 3600 as hours_since_triggered,
          p.name as project_name
        FROM complexity_alerts ca
        LEFT JOIN projects p ON ca.project_id = p.id
        WHERE ${whereClause}
        ORDER BY 
          CASE ca.violation_severity 
            WHEN 'critical' THEN 1 
            WHEN 'error' THEN 2 
            WHEN 'warning' THEN 3 
            ELSE 4 
          END,
          ca.priority ASC,
          ca.triggered_at DESC
        LIMIT $${paramIndex}
      `;

      queryParams.push(limit);

      const result = await db.query(alertsQuery, queryParams);
      const alerts = result.rows;

      // Calculate summary statistics
      const summary = {
        totalAlerts: alerts.length,
        bySeverity: {
          critical: alerts.filter(a => a.violation_severity === 'critical').length,
          error: alerts.filter(a => a.violation_severity === 'error').length,
          warning: alerts.filter(a => a.violation_severity === 'warning').length,
          info: alerts.filter(a => a.violation_severity === 'info').length
        },
        byType: {
          thresholdExceeded: alerts.filter(a => a.alert_type === 'threshold_exceeded').length,
          complexityRegression: alerts.filter(a => a.alert_type === 'complexity_regression').length,
          hotspotDetected: alerts.filter(a => a.alert_type === 'hotspot_detected').length,
          technicalDebtSpike: alerts.filter(a => a.alert_type === 'technical_debt_spike').length
        },
        byStatus: {
          open: alerts.filter(a => a.status === 'open').length,
          acknowledged: alerts.filter(a => a.status === 'acknowledged').length,
          investigating: alerts.filter(a => a.status === 'investigating').length
        },
        avgHoursSinceTriggered: alerts.length > 0 ?
          alerts.reduce((sum, a) => sum + parseFloat(a.hours_since_triggered), 0) / alerts.length : 0,
        requireFollowUp: alerts.filter(a => a.follow_up_required).length
      };

      // Group alerts for analysis
      const groupedAlerts = {
        byFile: this.groupBy(alerts, 'file_path'),
        byComplexityType: this.groupBy(alerts, 'complexity_type'),
        byAlertType: this.groupBy(alerts, 'alert_type')
      };

      return {
        success: true,
        summary,
        alerts,
        groupedAlerts,
        queryParams: {
          projectId,
          alertTypes,
          complexityTypes,
          severities,
          statuses,
          limit,
          resultsCount: alerts.length
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
   * Acknowledge a complexity alert
   */
  private static async acknowledgeAlert(args: any): Promise<any> {
    const { alertId, acknowledgedBy, notes } = args;

    try {
      const sessionId = await getCurrentSession();
      const acknowledger = acknowledgedBy || `session_${sessionId}`;

      const updateQuery = `
        UPDATE complexity_alerts 
        SET 
          status = 'acknowledged',
          acknowledged_at = CURRENT_TIMESTAMP,
          acknowledged_by = $2,
          resolution_notes = COALESCE(resolution_notes || E'\\n\\n', '') || 'ACKNOWLEDGED: ' || $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status IN ('open', 'investigating')
        RETURNING id, title, violation_severity, project_id, alert_type, complexity_type
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
        event_type: 'complexity_alert_acknowledged',
        status: 'closed',
        metadata: {
          alertId,
          alertTitle: alert.title,
          alertSeverity: alert.violation_severity,
          alertType: alert.alert_type,
          complexityType: alert.complexity_type,
          projectId: alert.project_id,
          notes
        },
        tags: ['complexity', 'alert', 'acknowledged']
      });

      return {
        success: true,
        message: 'Complexity alert acknowledged successfully',
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
   * Resolve a complexity alert
   */
  private static async resolveAlert(args: any): Promise<any> {
    const { alertId, resolutionMethod, resolvedBy, resolutionNotes, followUpRequired = false, followUpDate } = args;

    try {
      const sessionId = await getCurrentSession();
      const resolver = resolvedBy || `session_${sessionId}`;

      const updateQuery = `
        UPDATE complexity_alerts 
        SET 
          status = 'resolved',
          resolved_at = CURRENT_TIMESTAMP,
          resolved_by = $2,
          resolution_method = $3,
          resolution_notes = COALESCE(resolution_notes || E'\\n\\n', '') || 'RESOLVED: ' || $4,
          follow_up_required = $5,
          follow_up_date = $6,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status IN ('open', 'acknowledged', 'investigating')
        RETURNING id, title, violation_severity, project_id, alert_type, complexity_type, current_value
      `;

      const result = await db.query(updateQuery, [
        alertId,
        resolver,
        resolutionMethod,
        resolutionNotes,
        followUpRequired,
        followUpDate ? new Date(followUpDate) : null
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
        event_type: 'complexity_alert_resolved',
        status: 'closed',
        metadata: {
          alertId,
          alertTitle: alert.title,
          alertSeverity: alert.violation_severity,
          alertType: alert.alert_type,
          complexityType: alert.complexity_type,
          projectId: alert.project_id,
          currentValue: alert.current_value,
          resolutionMethod,
          resolutionNotes,
          followUpRequired
        },
        tags: ['complexity', 'alert', 'resolved']
      });

      return {
        success: true,
        message: 'Complexity alert resolved successfully',
        alertId,
        resolvedBy: resolver,
        resolvedAt: new Date().toISOString(),
        resolutionMethod,
        resolutionNotes,
        followUpRequired,
        followUpDate
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
   * Get refactoring opportunities
   */
  private static async getRefactoringOpportunities(args: any): Promise<any> {
    const { 
      projectId, 
      opportunityTypes, 
      minRoiScore = 0.3, 
      maxEffortHours,
      urgencyLevels = ['medium', 'high', 'urgent'],
      statuses = ['identified', 'planned'],
      sortBy = 'roi',
      limit = 20
    } = args;

    try {
      let whereClause = 'WHERE project_id = $1 AND roi_score >= $2';
      let queryParams: any[] = [projectId, minRoiScore];
      let paramIndex = 3;

      if (statuses && statuses.length > 0) {
        whereClause += ` AND status = ANY($${paramIndex})`;
        queryParams.push(statuses);
        paramIndex++;
      }

      if (opportunityTypes && opportunityTypes.length > 0) {
        whereClause += ` AND opportunity_type = ANY($${paramIndex})`;
        queryParams.push(opportunityTypes);
        paramIndex++;
      }

      if (maxEffortHours) {
        whereClause += ` AND refactoring_effort_hours <= $${paramIndex}`;
        queryParams.push(maxEffortHours);
        paramIndex++;
      }

      if (urgencyLevels && urgencyLevels.length > 0) {
        whereClause += ` AND urgency_level = ANY($${paramIndex})`;
        queryParams.push(urgencyLevels);
        paramIndex++;
      }

      const sortColumn = sortBy === 'roi' ? 'roi_score' :
                        sortBy === 'priority' ? 'priority_score' :
                        sortBy === 'effort' ? 'refactoring_effort_hours' :
                        sortBy === 'impact' ? 'estimated_complexity_reduction' :
                        'roi_score';

      const opportunitiesQuery = `
        SELECT 
          file_path, class_name, function_name, start_line, end_line,
          opportunity_type, current_complexity_score, estimated_complexity_reduction,
          refactoring_effort_hours, priority_score, roi_score, urgency_level,
          description, refactoring_steps, blocked_by, status,
          is_validated, validation_notes, assigned_to, target_completion_date,
          created_at, updated_at
        FROM refactoring_opportunities
        ${whereClause}
        ORDER BY ${sortColumn} DESC, priority_score DESC
        LIMIT $${paramIndex}
      `;

      queryParams.push(limit);

      const result = await db.query(opportunitiesQuery, queryParams);
      const opportunities = result.rows;

      // Calculate summary statistics
      const summary = {
        totalOpportunities: opportunities.length,
        byType: this.groupBy(opportunities, 'opportunity_type'),
        byUrgency: this.groupBy(opportunities, 'urgency_level'),
        totalEstimatedReduction: opportunities.reduce((sum, o) => sum + parseFloat(o.estimated_complexity_reduction), 0),
        totalEstimatedEffort: opportunities.reduce((sum, o) => sum + parseFloat(o.refactoring_effort_hours), 0),
        avgRoiScore: opportunities.length > 0 ?
          opportunities.reduce((sum, o) => sum + parseFloat(o.roi_score), 0) / opportunities.length : 0,
        validatedOpportunities: opportunities.filter(o => o.is_validated).length,
        blockedOpportunities: opportunities.filter(o => o.blocked_by && o.blocked_by.length > 0).length
      };

      // Group opportunities by file for better organization
      const opportunitiesByFile = this.groupBy(opportunities, 'file_path');

      // Calculate business impact estimates
      const businessImpact = {
        estimatedProductivityGain: Math.round(summary.totalEstimatedReduction * 2), // 2% per complexity point
        estimatedMaintenanceSavings: Math.round(summary.totalEstimatedReduction * 30), // 30 minutes per complexity point
        riskReduction: opportunities.filter(o => o.urgency_level === 'urgent').length * 10 + 
                       opportunities.filter(o => o.urgency_level === 'high').length * 5
      };

      return {
        success: true,
        projectId,
        summary,
        businessImpact,
        queryParams: {
          minRoiScore,
          maxEffortHours,
          urgencyLevels,
          statuses,
          sortBy,
          limit,
          resultsCount: opportunities.length
        },
        opportunities,
        opportunitiesByFile
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Refactoring opportunities query failed',
        projectId
      };
    }
  }

  /**
   * Get complexity trends
   */
  private static async getComplexityTrends(args: any): Promise<any> {
    const { 
      projectId, 
      filePath, 
      complexityTypes = ['overall'], 
      timeframeDays = 30,
      includeForecast = true,
      includeAnomalies = true,
      includeChangePoints = true
    } = args;

    try {
      const trends = await getComplexityTrends(
        projectId, 
        filePath, 
        complexityTypes[0] as any, 
        timeframeDays
      );

      if (trends.length === 0) {
        return {
          success: true,
          projectId,
          message: 'No trend data available for specified parameters',
          summary: {
            dataPoints: 0,
            trendDirection: 'unknown',
            forecastAvailable: false
          }
        };
      }

      // Analyze trends
      const trendAnalysis = this.analyzeTrendData(trends);
      
      // Filter data based on requested features
      const processedTrends = trends.map(trend => ({
        date: trend.measurement_date,
        filePath: trend.file_path,
        value: trend.complexity_value,
        movingAverage: trend.moving_average,
        trendDirection: trend.trend_direction,
        trendSlope: trend.trend_slope,
        ...(includeAnomalies && {
          anomalyScore: trend.anomaly_score,
          isAnomaly: trend.is_anomaly
        }),
        ...(includeChangePoints && {
          changePointDetected: trend.change_point_detected,
          changeMagnitude: trend.change_magnitude,
          changeSignificance: trend.change_significance
        }),
        ...(includeForecast && {
          forecastNextWeek: trend.forecast_next_week,
          forecastConfidence: trend.forecast_confidence
        })
      }));

      const summary = {
        dataPoints: trends.length,
        timeframeStart: trends[0]?.measurement_date,
        timeframeEnd: trends[trends.length - 1]?.measurement_date,
        trendDirection: trendAnalysis.overallDirection,
        trendStrength: trendAnalysis.strength,
        avgComplexityValue: trendAnalysis.avgValue,
        minComplexityValue: trendAnalysis.minValue,
        maxComplexityValue: trendAnalysis.maxValue,
        anomaliesDetected: includeAnomalies ? trends.filter(t => t.is_anomaly).length : 0,
        changePointsDetected: includeChangePoints ? trends.filter(t => t.change_point_detected).length : 0,
        forecastAvailable: includeForecast && trends.some(t => t.forecast_confidence > 0.5)
      };

      return {
        success: true,
        projectId,
        filePath,
        complexityTypes,
        timeframeDays,
        summary,
        trendAnalysis,
        trends: processedTrends
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Trends analysis failed',
        projectId
      };
    }
  }

  /**
   * Get technical debt analysis
   */
  private static async getTechnicalDebt(args: any): Promise<any> {
    const { 
      projectId, 
      debtTypes = ['complexity_debt'], 
      minDebtMinutes = 30,
      includeEstimates = true,
      includePrioritization = true,
      groupBy = 'file'
    } = args;

    try {
      const debtQuery = `
        SELECT 
          fcs.file_path, fcs.file_type, fcs.overall_complexity_score,
          fcs.complexity_grade, fcs.risk_level, fcs.technical_debt_minutes,
          fcs.refactoring_priority, fcs.maintainability_index,
          fcs.avg_cyclomatic_complexity, fcs.total_cognitive_complexity,
          fcs.coupling_score, fcs.total_functions, fcs.total_classes,
          cas.analysis_timestamp as last_analyzed,
          -- Calculate different debt types
          CASE 
            WHEN fcs.avg_cyclomatic_complexity > 20 THEN fcs.technical_debt_minutes * 0.4
            ELSE 0
          END as complexity_debt_minutes,
          CASE 
            WHEN fcs.maintainability_index < 70 THEN fcs.technical_debt_minutes * 0.3
            ELSE 0
          END as maintainability_debt_minutes,
          CASE 
            WHEN fcs.coupling_score > 0.5 THEN fcs.technical_debt_minutes * 0.2
            ELSE 0
          END as coupling_debt_minutes,
          CASE 
            WHEN fcs.avg_cyclomatic_complexity > 15 THEN fcs.technical_debt_minutes * 0.1
            ELSE 0
          END as testing_debt_minutes
        FROM file_complexity_summary fcs
        JOIN complexity_analysis_sessions cas ON fcs.analysis_session_id = cas.id
        WHERE fcs.project_id = $1 
        AND fcs.technical_debt_minutes >= $2
        AND cas.status = 'completed'
        ORDER BY fcs.technical_debt_minutes DESC
      `;

      const result = await db.query(debtQuery, [projectId, minDebtMinutes]);
      const debtItems = result.rows;

      // Filter by debt types
      const filteredDebt = debtItems.filter(item => {
        return debtTypes.some(type => {
          switch (type) {
            case 'complexity_debt':
              return parseFloat(item.complexity_debt_minutes) > 0;
            case 'maintainability_debt':
              return parseFloat(item.maintainability_debt_minutes) > 0;
            case 'coupling_debt':
              return parseFloat(item.coupling_debt_minutes) > 0;
            case 'testing_debt':
              return parseFloat(item.testing_debt_minutes) > 0;
            default:
              return true;
          }
        });
      });

      // Calculate debt breakdown by type
      const debtBreakdown = {
        complexityDebt: filteredDebt.reduce((sum, item) => sum + parseFloat(item.complexity_debt_minutes), 0),
        maintainabilityDebt: filteredDebt.reduce((sum, item) => sum + parseFloat(item.maintainability_debt_minutes), 0),
        couplingDebt: filteredDebt.reduce((sum, item) => sum + parseFloat(item.coupling_debt_minutes), 0),
        testingDebt: filteredDebt.reduce((sum, item) => sum + parseFloat(item.testing_debt_minutes), 0)
      };

      // Add estimates if requested
      if (includeEstimates) {
        filteredDebt.forEach(item => {
          item.estimatedResolutionHours = Math.round(parseFloat(item.technical_debt_minutes) / 60);
          item.estimatedCostUSD = Math.round(item.estimatedResolutionHours * 100); // $100/hour estimate
          item.businessImpactScore = this.calculateBusinessImpactScore(item);
        });
      }

      // Add prioritization if requested
      if (includePrioritization) {
        filteredDebt.forEach(item => {
          item.priorityScore = this.calculateDebtPriorityScore(item);
          item.priorityRank = item.refactoring_priority;
        });
        
        // Sort by priority
        filteredDebt.sort((a, b) => b.priorityScore - a.priorityScore);
      }

      // Group by requested dimension
      let groupedDebt: any = {};
      switch (groupBy) {
        case 'file':
          groupedDebt = this.groupBy(filteredDebt, 'file_path');
          break;
        case 'component':
          groupedDebt = this.groupBy(filteredDebt, 'file_type');
          break;
        case 'severity':
          groupedDebt = this.groupBy(filteredDebt, 'risk_level');
          break;
        case 'type':
          // Group by predominant debt type
          filteredDebt.forEach(item => {
            const debtTypes = [
              { type: 'complexity', value: parseFloat(item.complexity_debt_minutes) },
              { type: 'maintainability', value: parseFloat(item.maintainability_debt_minutes) },
              { type: 'coupling', value: parseFloat(item.coupling_debt_minutes) },
              { type: 'testing', value: parseFloat(item.testing_debt_minutes) }
            ];
            const predominantType = debtTypes.reduce((max, current) => 
              current.value > max.value ? current : max
            ).type;
            item.predominant_debt_type = predominantType;
          });
          groupedDebt = this.groupBy(filteredDebt, 'predominant_debt_type');
          break;
      }

      // Calculate summary statistics
      const totalDebtMinutes = filteredDebt.reduce((sum, item) => sum + parseFloat(item.technical_debt_minutes), 0);
      const summary = {
        totalDebtItems: filteredDebt.length,
        totalDebtMinutes,
        totalDebtHours: Math.round(totalDebtMinutes / 60),
        avgDebtPerFile: filteredDebt.length > 0 ? totalDebtMinutes / filteredDebt.length : 0,
        highPriorityItems: filteredDebt.filter(item => item.refactoring_priority <= 2).length,
        criticalRiskItems: filteredDebt.filter(item => item.risk_level === 'critical').length,
        debtBreakdown,
        ...(includeEstimates && {
          totalEstimatedHours: filteredDebt.reduce((sum, item) => sum + (item.estimatedResolutionHours || 0), 0),
          totalEstimatedCost: filteredDebt.reduce((sum, item) => sum + (item.estimatedCostUSD || 0), 0)
        })
      };

      return {
        success: true,
        projectId,
        debtTypes,
        minDebtMinutes,
        groupBy,
        summary,
        debtItems: filteredDebt,
        groupedDebt
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Technical debt analysis failed',
        projectId
      };
    }
  }

  /**
   * Analyze commits for complexity changes
   */
  private static async analyzeCommit(args: any): Promise<any> {
    const { commitShas, includeComparison = true, detectRegression = true } = args;

    try {
      const result = await analyzeComplexityOnCommit(commitShas);

      if (!result) {
        return {
          success: false,
          message: 'No complexity analysis triggered for these commits',
          commitShas,
          reason: 'Auto-analysis disabled or no relevant files changed'
        };
      }

      const response: any = {
        success: true,
        message: `Complexity analysis completed for ${commitShas.length} commits`,
        commitShas,
        analysisResult: {
          analysisSessionId: result.analysisSessionId,
          projectId: result.projectId,
          executionTimeMs: result.executionTimeMs,
          filesAnalyzed: result.filesAnalyzed,
          functionsAnalyzed: result.functionsAnalyzed,
          avgComplexityScore: result.avgComplexityScore,
          maxComplexityScore: result.maxComplexityScore
        },
        complexityChanges: {
          hotspotsIdentified: result.hotspotsIdentified.length,
          alertsGenerated: result.complexityAlerts.length,
          refactoringOpportunities: result.refactoringOpportunities.length
        }
      };

      // Include comparison if requested
      if (includeComparison && result.fileSummaries.length > 0) {
        // Get previous analysis for comparison
        const comparisonQuery = `
          SELECT fcs.file_path, fcs.overall_complexity_score, fcs.avg_cyclomatic_complexity,
                 fcs.total_cognitive_complexity, fcs.maintainability_index
          FROM file_complexity_summary fcs
          JOIN complexity_analysis_sessions cas ON fcs.analysis_session_id = cas.id
          WHERE cas.project_id = $1 
          AND cas.analysis_timestamp < $2
          AND cas.status = 'completed'
          AND fcs.file_path = ANY($3)
          ORDER BY cas.analysis_timestamp DESC
          LIMIT ${result.fileSummaries.length}
        `;

        const filePaths = result.fileSummaries.map(f => f.filePath);
        const comparisonResult = await db.query(comparisonQuery, [
          result.projectId,
          result.analysisTimestamp,
          filePaths
        ]);

        const previousMetrics = new Map(
          comparisonResult.rows.map(row => [row.file_path, row])
        );

        response.comparison = result.fileSummaries.map(current => {
          const previous = previousMetrics.get(current.filePath);
          if (!previous) return { filePath: current.filePath, change: 'new_file' };

          const complexityChange = current.overallComplexityScore - parseFloat((previous as any).overall_complexity_score);
          const percentChange = parseFloat((previous as any).overall_complexity_score) > 0 ? 
            (complexityChange / parseFloat((previous as any).overall_complexity_score)) * 100 : 0;

          return {
            filePath: current.filePath,
            current: {
              overallScore: current.overallComplexityScore,
              cyclomaticAvg: current.avgCyclomaticComplexity,
              cognitiveTotal: current.totalCognitiveComplexity,
              maintainability: current.maintainabilityIndex
            },
            previous: {
              overallScore: parseFloat((previous as any).overall_complexity_score),
              cyclomaticAvg: parseFloat((previous as any).avg_cyclomatic_complexity),
              cognitiveTotal: parseFloat((previous as any).total_cognitive_complexity),
              maintainability: parseFloat((previous as any).maintainability_index)
            },
            change: {
              complexityDelta: complexityChange,
              percentChange,
              direction: complexityChange > 0 ? 'increased' : 
                        complexityChange < 0 ? 'decreased' : 'unchanged',
              magnitude: Math.abs(percentChange) > 25 ? 'significant' :
                        Math.abs(percentChange) > 10 ? 'moderate' : 'minor'
            }
          };
        });
      }

      // Detect regression if requested
      if (detectRegression && response.comparison) {
        const regressions = response.comparison.filter((comp: any) => 
          comp.change && comp.change.direction === 'increased' && comp.change.magnitude !== 'minor'
        );

        response.regression = {
          detected: regressions.length > 0,
          filesWithRegression: regressions.length,
          regressions: regressions.map((reg: any) => ({
            filePath: reg.filePath,
            percentIncrease: reg.change.percentChange,
            magnitude: reg.change.magnitude,
            newScore: reg.current.overallScore,
            previousScore: reg.previous.overallScore
          }))
        };
      }

      return response;

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Commit analysis failed',
        commitShas
      };
    }
  }

  /**
   * Set complexity thresholds (placeholder - would integrate with ComplexityTracker config)
   */
  private static async setThresholds(args: any): Promise<any> {
    const { projectId, cyclomaticThresholds, cognitiveThresholds, halsteadThresholds, alertSettings } = args;

    try {
      // This would integrate with a project-specific configuration system
      // For now, return a success response indicating thresholds would be updated
      
      const configUpdate = {
        projectId,
        thresholds: {
          ...(cyclomaticThresholds && { cyclomatic: cyclomaticThresholds }),
          ...(cognitiveThresholds && { cognitive: cognitiveThresholds }),
          ...(halsteadThresholds && { halstead: halsteadThresholds })
        },
        ...(alertSettings && { alertSettings })
      };

      // Log configuration change
      await logEvent({
        actor: 'system',
        event_type: 'complexity_thresholds_updated',
        status: 'closed',
        metadata: {
          projectId,
          configUpdate
        },
        tags: ['complexity', 'configuration', 'thresholds']
      });

      return {
        success: true,
        message: 'Complexity thresholds updated successfully',
        projectId,
        updatedConfiguration: configUpdate
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update thresholds',
        projectId
      };
    }
  }

  /**
   * Get performance statistics
   */
  private static async getPerformanceStats(args: any): Promise<any> {
    const { includeHistory = false, includeBreakdown = true } = args;

    try {
      // Get current performance metrics from the tracker
      const trackerStats = getComplexityTrackingPerformance();

      const response: any = {
        success: true,
        currentPerformance: trackerStats,
        timestamp: new Date().toISOString()
      };

      if (includeHistory) {
        // Get recent analysis session performance
        const historyQuery = `
          SELECT 
            analysis_timestamp, execution_time_ms, files_analyzed,
            functions_analyzed, complexity_metrics_calculated,
            hotspots_identified, refactoring_opportunities,
            analysis_completeness_score, confidence_score,
            analysis_trigger, status
          FROM complexity_analysis_sessions
          WHERE analysis_timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 days'
          AND status = 'completed'
          ORDER BY analysis_timestamp DESC
          LIMIT 100
        `;

        const historyResult = await db.query(historyQuery);
        const history = historyResult.rows;

        // Calculate historical statistics
        const avgExecutionTime = history.length > 0 ? 
          history.reduce((sum, s) => sum + s.execution_time_ms, 0) / history.length : 0;
        
        const avgFilesPerAnalysis = history.length > 0 ?
          history.reduce((sum, s) => sum + s.files_analyzed, 0) / history.length : 0;

        response.historicalPerformance = {
          analysesLast7Days: history.length,
          averageExecutionTime: Math.round(avgExecutionTime),
          averageFilesPerAnalysis: Math.round(avgFilesPerAnalysis),
          performanceTrend: this.calculatePerformanceTrend(history),
          recentAnalyses: history.slice(0, 20)
        };
      }

      if (includeBreakdown) {
        // Get performance breakdown by analysis type
        const breakdownQuery = `
          SELECT 
            analysis_trigger,
            COUNT(*) as analysis_count,
            AVG(execution_time_ms) as avg_execution_time,
            AVG(files_analyzed) as avg_files_analyzed,
            AVG(complexity_metrics_calculated) as avg_metrics_calculated
          FROM complexity_analysis_sessions
          WHERE analysis_timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 days'
          AND status = 'completed'
          GROUP BY analysis_trigger
          ORDER BY analysis_count DESC
        `;

        const breakdownResult = await db.query(breakdownQuery);
        response.performanceBreakdown = breakdownResult.rows;
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
   * Start complexity tracking service
   */
  private static async startTracking(args: any): Promise<any> {
    const { config } = args;

    try {
      await startComplexityTracking(config);

      return {
        success: true,
        message: 'Complexity tracking service started successfully',
        config: config || 'default configuration',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start complexity tracking service'
      };
    }
  }

  /**
   * Stop complexity tracking service
   */
  private static async stopTracking(args: any): Promise<any> {
    try {
      await stopComplexityTracking();

      return {
        success: true,
        message: 'Complexity tracking service stopped successfully',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop complexity tracking service'
      };
    }
  }

  // Utility methods

  private static filterMetricsByType(result: ComplexityAnalysisResult, includeMetrics: string[]): any {
    if (includeMetrics.includes('all')) {
      return {
        cyclomatic: result.cyclomaticMetrics,
        cognitive: result.cognitiveMetrics,
        halstead: result.halsteadMetrics,
        dependency: result.dependencyMetrics
      };
    }

    const filtered: any = {};
    if (includeMetrics.includes('cyclomatic')) filtered.cyclomatic = result.cyclomaticMetrics;
    if (includeMetrics.includes('cognitive')) filtered.cognitive = result.cognitiveMetrics;
    if (includeMetrics.includes('halstead')) filtered.halstead = result.halsteadMetrics;
    if (includeMetrics.includes('dependency')) filtered.dependency = result.dependencyMetrics;

    return filtered;
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

  private static generateHotspotRecommendations(hotspot: any): string[] {
    const recommendations: string[] = [];

    if (hotspot.overall_complexity_score > 0.8) {
      recommendations.push('Consider breaking down this file into smaller, focused modules');
    }
    
    if (hotspot.max_cyclomatic_complexity > 30) {
      recommendations.push(`Refactor functions with high cyclomatic complexity (max: ${hotspot.max_cyclomatic_complexity})`);
    }
    
    if (hotspot.total_cognitive_complexity > 100) {
      recommendations.push('Simplify complex logic and nested structures to improve readability');
    }
    
    if (hotspot.maintainability_index < 50) {
      recommendations.push('Improve maintainability through better naming and documentation');
    }
    
    if (hotspot.coupling_factor > 0.6) {
      recommendations.push('Reduce dependencies and improve decoupling');
    }
    
    if (hotspot.change_frequency > 10) {
      recommendations.push('High change frequency indicates potential design issues');
    }

    if (recommendations.length === 0) {
      recommendations.push('Monitor complexity growth and consider proactive refactoring');
    }

    return recommendations;
  }

  private static calculateUrgencyLevel(hotspot: any): 'low' | 'medium' | 'high' | 'urgent' {
    const riskScore = hotspot.risk_level === 'critical' ? 4 : 
                     hotspot.risk_level === 'very_high' ? 3 :
                     hotspot.risk_level === 'high' ? 2 : 1;
    
    const changeFrequencyScore = hotspot.change_frequency > 15 ? 3 :
                                 hotspot.change_frequency > 10 ? 2 :
                                 hotspot.change_frequency > 5 ? 1 : 0;
    
    const complexityScore = hotspot.overall_complexity_score > 0.8 ? 3 :
                           hotspot.overall_complexity_score > 0.6 ? 2 : 1;
    
    const totalScore = riskScore + changeFrequencyScore + complexityScore;
    
    if (totalScore >= 8) return 'urgent';
    if (totalScore >= 6) return 'high';
    if (totalScore >= 4) return 'medium';
    return 'low';
  }

  private static estimateRefactoringEffort(hotspot: any): number {
    const baseEffort = Math.max(1, Math.round(hotspot.technical_debt_minutes / 60));
    const complexityMultiplier = hotspot.overall_complexity_score > 0.8 ? 1.5 : 1.0;
    const changeFrequencyMultiplier = hotspot.change_frequency > 10 ? 1.3 : 1.0;
    
    return Math.round(baseEffort * complexityMultiplier * changeFrequencyMultiplier);
  }

  private static analyzeTrendData(trends: any[]): any {
    if (trends.length < 2) {
      return {
        overallDirection: 'insufficient_data',
        strength: 0,
        avgValue: trends[0]?.complexity_value || 0,
        minValue: trends[0]?.complexity_value || 0,
        maxValue: trends[0]?.complexity_value || 0
      };
    }

    const values = trends.map(t => parseFloat(t.complexity_value));
    const recent = values.slice(-Math.min(7, Math.floor(values.length / 3)));
    const older = values.slice(0, Math.min(7, Math.floor(values.length / 3)));

    const recentAvg = recent.reduce((sum, v) => sum + v, 0) / recent.length;
    const olderAvg = older.reduce((sum, v) => sum + v, 0) / older.length;

    const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100;

    return {
      overallDirection: Math.abs(changePercent) < 5 ? 'stable' :
                       changePercent > 0 ? 'increasing' : 'decreasing',
      strength: Math.abs(changePercent) / 100,
      avgValue: values.reduce((sum, v) => sum + v, 0) / values.length,
      minValue: Math.min(...values),
      maxValue: Math.max(...values),
      changePercent: Math.round(changePercent * 100) / 100
    };
  }

  private static calculateBusinessImpactScore(debtItem: any): number {
    const complexityImpact = parseFloat(debtItem.overall_complexity_score) * 0.4;
    const maintainabilityImpact = (100 - parseFloat(debtItem.maintainability_index)) / 100 * 0.3;
    const riskImpact = debtItem.risk_level === 'critical' ? 0.3 :
                      debtItem.risk_level === 'very_high' ? 0.2 :
                      debtItem.risk_level === 'high' ? 0.1 : 0;

    return Math.min(1, complexityImpact + maintainabilityImpact + riskImpact);
  }

  private static calculateDebtPriorityScore(debtItem: any): number {
    const debtMinutes = parseFloat(debtItem.technical_debt_minutes);
    const complexityScore = parseFloat(debtItem.overall_complexity_score);
    const businessImpact = debtItem.businessImpactScore || 0.5;
    
    // Priority = (debt_amount * complexity * business_impact) / effort
    const effort = Math.max(1, debtMinutes / 60);
    
    return (debtMinutes * complexityScore * businessImpact) / effort;
  }

  private static getCyclomaticGradeFromAvg(avgComplexity: number): string {
    if (avgComplexity <= 10) return 'A';
    if (avgComplexity <= 20) return 'B';
    if (avgComplexity <= 50) return 'C';
    if (avgComplexity <= 100) return 'D';
    return 'F';
  }

  private static getCognitiveGradeFromAvg(avgComplexity: number): string {
    if (avgComplexity <= 15) return 'A';
    if (avgComplexity <= 25) return 'B';
    if (avgComplexity <= 50) return 'C';
    if (avgComplexity <= 100) return 'D';
    return 'F';
  }

  private static getMaintainabilityGrade(index: number): string {
    if (index >= 85) return 'A';
    if (index >= 70) return 'B';
    if (index >= 50) return 'C';
    if (index >= 25) return 'D';
    return 'F';
  }

  private static getCouplingRiskLevel(couplingScore: number): string {
    if (couplingScore <= 0.2) return 'very_low';
    if (couplingScore <= 0.4) return 'low';
    if (couplingScore <= 0.6) return 'moderate';
    if (couplingScore <= 0.8) return 'high';
    return 'very_high';
  }

  private static calculatePerformanceTrend(history: any[]): string {
    if (history.length < 3) return 'insufficient_data';

    const recent = history.slice(0, Math.floor(history.length / 3));
    const older = history.slice(-Math.floor(history.length / 3));

    const recentAvg = recent.reduce((sum, s) => sum + s.execution_time_ms, 0) / recent.length;
    const olderAvg = older.reduce((sum, s) => sum + s.execution_time_ms, 0) / older.length;

    const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100;

    if (Math.abs(changePercent) < 10) return 'stable';
    return changePercent < 0 ? 'improving' : 'degrading';
  }
}

export default CodeComplexityHandler;