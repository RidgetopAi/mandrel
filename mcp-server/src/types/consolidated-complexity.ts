/**
 * Consolidated Complexity Tool Types
 * TT0002-1: Phase 1 Tool Consolidation Implementation
 *
 * Unified interfaces that replace 16 existing complexity tools with 3 consolidated tools:
 * 1. complexity_analyze - File, commit, and function analysis
 * 2. complexity_insights - Dashboard, hotspots, trends, debt, refactoring
 * 3. complexity_manage - Control, alerts, thresholds, performance
 *
 * Maintains 100% backward compatibility through unified parameter schemas
 * Estimated token savings: ~6,000 tokens
 */

// =============================================================================
// COMPLEXITY_ANALYZE TOOL - Replaces 4 tools
// =============================================================================

/**
 * Unified analysis tool parameters
 * Replaces: analyze_files, analyze_commit, get_file_metrics, get_function_metrics
 */
export interface ComplexityAnalyzeParams {
  /** Target for analysis - file path, commit hash, or function identifier */
  target: string | string[];

  /** Type of analysis to perform */
  type: 'file' | 'files' | 'commit' | 'function';

  /** Optional analysis configuration */
  options?: {
    /** Project ID for context (auto-detected if not provided) */
    projectId?: string;

    /** Analysis trigger source */
    trigger?: 'manual' | 'git_commit' | 'scheduled' | 'threshold_breach' | 'batch_analysis';

    /** Specific complexity metrics to include */
    includeMetrics?: Array<'cyclomatic' | 'cognitive' | 'halstead' | 'dependency' | 'all'>;

    /** Function-specific options (when type = 'function') */
    functionOptions?: {
      /** Class name containing the function */
      className?: string;
      /** Function signature to match */
      functionSignature?: string;
      /** Line range for analysis */
      lineRange?: { start: number; end: number; };
    };

    /** File analysis options (when type = 'file' | 'files') */
    fileOptions?: {
      /** Include detailed function-level metrics */
      includeDetailedMetrics?: boolean;
      /** Exclude test files from analysis */
      excludeTests?: boolean;
      /** Custom file patterns to exclude */
      excludePatterns?: string[];
    };

    /** Commit analysis options (when type = 'commit') */
    commitOptions?: {
      /** Compare against specific commit (default: previous commit) */
      compareWith?: string;
      /** Include impact analysis */
      includeImpactAnalysis?: boolean;
      /** Only analyze changed files */
      changedFilesOnly?: boolean;
    };

    /** Output formatting options */
    format?: {
      /** Include raw metrics data */
      includeRawMetrics?: boolean;
      /** Include visualization data */
      includeChartData?: boolean;
      /** Group results by file/function/class */
      groupBy?: 'file' | 'function' | 'class' | 'none';
    };
  };
}

/**
 * Unified analysis response covering all original tool outputs
 */
export interface ComplexityAnalyzeResponse {
  /** Analysis metadata */
  analysis: {
    sessionId: string;
    projectId: string;
    timestamp: Date;
    executionTimeMs: number;
    analyzerVersion: string;
    type: 'file' | 'files' | 'commit' | 'function';
    target: string | string[];
    trigger: string;
  };

  /** Analysis summary */
  summary: {
    filesAnalyzed: number;
    functionsAnalyzed: number;
    classesAnalyzed: number;
    complexityMetricsCalculated: number;
    totalComplexityScore: number;
    avgComplexityScore: number;
    maxComplexityScore: number;
  };

  /** Detailed metrics (structure varies by analysis type) */
  metrics: {
    /** File-level complexity summaries */
    fileSummaries?: FileComplexitySummary[];
    /** Function-level cyclomatic complexity */
    cyclomaticMetrics?: CyclomaticComplexityMetric[];
    /** Function-level cognitive complexity */
    cognitiveMetrics?: CognitiveComplexityMetric[];
    /** Halstead complexity metrics */
    halsteadMetrics?: HalsteadComplexityMetric[];
    /** Dependency and coupling metrics */
    dependencyMetrics?: DependencyComplexityMetric[];
  };

  /** Analysis insights */
  insights?: {
    /** Identified complexity hotspots */
    hotspots?: ComplexityHotspot[];
    /** Potential refactoring opportunities */
    refactoringOpportunities?: RefactoringOpportunity[];
    /** Generated alerts for threshold violations */
    alerts?: ComplexityAlert[];
  };

  /** Chart and visualization data */
  chartData?: {
    complexityDistribution?: Array<{ range: string; count: number; }>;
    trendData?: Array<{ date: string; complexity: number; }>;
    comparisonData?: Array<{ metric: string; before: number; after: number; }>;
  };

  /** Operation status */
  success: boolean;
  errors?: string[];
  warnings?: string[];
}

// =============================================================================
// COMPLEXITY_INSIGHTS TOOL - Replaces 5 tools
// =============================================================================

/**
 * Unified insights tool parameters
 * Replaces: get_dashboard, get_hotspots, get_trends, get_technical_debt, get_refactoring_opportunities
 */
export interface ComplexityInsightsParams {
  /** Type of insights to retrieve */
  view: 'dashboard' | 'hotspots' | 'trends' | 'debt' | 'refactoring';

  /** Optional insight configuration */
  filters?: {
    /** Project ID for scoping */
    projectId?: string;

    /** Time range for trends and historical data */
    timeRange?: {
      startDate?: string; // ISO date string
      endDate?: string;   // ISO date string
      period?: 'day' | 'week' | 'month' | 'quarter' | 'year';
    };

    /** Complexity thresholds for filtering */
    thresholds?: {
      minComplexity?: number;
      maxComplexity?: number;
      riskLevels?: Array<'very_low' | 'low' | 'moderate' | 'high' | 'very_high' | 'critical'>;
    };

    /** File and function filtering */
    scope?: {
      /** Specific file paths to include */
      includePaths?: string[];
      /** File patterns to exclude */
      excludePatterns?: string[];
      /** File types to analyze */
      fileTypes?: string[];
      /** Include only changed files in recent commits */
      recentChangesOnly?: boolean;
      /** Number of days for "recent" changes */
      recentChangesDays?: number;
    };

    /** Dashboard-specific options */
    dashboardOptions?: {
      includeHotspots?: boolean;
      includeAlerts?: boolean;
      includeOpportunities?: boolean;
      includeTrends?: boolean;
      includePerformanceMetrics?: boolean;
    };

    /** Hotspots-specific options */
    hotspotOptions?: {
      /** Minimum hotspot score to include */
      minHotspotScore?: number;
      /** Types of hotspots to detect */
      hotspotTypes?: Array<'high_complexity' | 'frequent_changes' | 'combined_risk' | 'coupling_hotspot'>;
      /** Maximum number of hotspots to return */
      limit?: number;
      /** Sort order for hotspots */
      sortBy?: 'complexity' | 'change_frequency' | 'hotspot_score' | 'risk_level';
    };

    /** Trends-specific options */
    trendsOptions?: {
      /** Metrics to include in trend analysis */
      metrics?: Array<'cyclomatic' | 'cognitive' | 'halstead' | 'coupling' | 'maintainability'>;
      /** Include forecasting data */
      includeForecast?: boolean;
      /** Number of periods to forecast */
      forecastPeriods?: number;
    };

    /** Technical debt-specific options */
    debtOptions?: {
      /** Debt calculation method */
      calculationMethod?: 'conservative' | 'aggressive' | 'balanced';
      /** Include remediation estimates */
      includeRemediation?: boolean;
      /** Group debt by category */
      groupBy?: 'file' | 'function' | 'class' | 'component' | 'severity';
    };

    /** Refactoring-specific options */
    refactoringOptions?: {
      /** Minimum ROI score for opportunities */
      minRoiScore?: number;
      /** Maximum effort hours to consider */
      maxEffortHours?: number;
      /** Opportunity types to include */
      opportunityTypes?: Array<'extract_method' | 'split_function' | 'reduce_nesting' | 'eliminate_duplication' | 'simplify_conditionals' | 'reduce_parameters' | 'break_dependencies' | 'improve_cohesion'>;
      /** Sort opportunities by priority */
      sortBy?: 'priority' | 'roi' | 'effort' | 'complexity_reduction';
      /** Maximum number of opportunities to return */
      limit?: number;
    };
  };
}

/**
 * Unified insights response covering all original tool outputs
 */
export interface ComplexityInsightsResponse {
  /** Response metadata */
  metadata: {
    view: string;
    projectId: string;
    timestamp: Date;
    executionTimeMs: number;
    dataFreshnessHours: number;
  };

  /** Dashboard data (when view = 'dashboard') */
  dashboard?: {
    /** Overall project complexity summary */
    overview: {
      totalFiles: number;
      totalFunctions: number;
      avgComplexity: number;
      maxComplexity: number;
      complexityGrade: string;
      riskLevel: string;
      technicalDebtHours: number;
    };

    /** Recent complexity trends */
    trends: {
      complexityTrend: 'improving' | 'stable' | 'degrading';
      changePercent: number;
      forecastGrade: string;
    };

    /** Active alerts summary */
    alerts: {
      critical: number;
      high: number;
      medium: number;
      total: number;
    };

    /** Top hotspots */
    topHotspots: ComplexityHotspot[];

    /** Priority refactoring opportunities */
    topOpportunities: RefactoringOpportunity[];

    /** Performance metrics */
    performanceMetrics?: {
      trackingStatus: 'active' | 'inactive';
      analysisSpeed: number;
      dataQuality: number;
    };
  };

  /** Hotspots data (when view = 'hotspots') */
  hotspots?: {
    /** Detected complexity hotspots */
    items: ComplexityHotspot[];
    /** Hotspot distribution by type */
    distribution: Array<{ type: string; count: number; avgScore: number; }>;
    /** Summary statistics */
    summary: {
      totalHotspots: number;
      criticalHotspots: number;
      avgHotspotScore: number;
      hotspotsWithRecentChanges: number;
    };
  };

  /** Trends data (when view = 'trends') */
  trends?: {
    /** Historical complexity data */
    historical: Array<{
      date: string;
      cyclomaticComplexity: number;
      cognitiveComplexity: number;
      halsteadVolume: number;
      couplingScore: number;
      maintainabilityIndex: number;
    }>;

    /** Trend analysis */
    analysis: {
      overallTrend: 'improving' | 'stable' | 'degrading';
      trendStrength: number; // 0.0-1.0
      volatility: number;    // 0.0-1.0
      cyclicality: boolean;
    };

    /** Future projections */
    forecast?: Array<{
      date: string;
      predictedComplexity: number;
      confidenceInterval: { lower: number; upper: number; };
    }>;
  };

  /** Technical debt data (when view = 'debt') */
  technicalDebt?: {
    /** Overall debt summary */
    summary: {
      totalDebtHours: number;
      totalDebtCost: number;
      avgDebtPerFile: number;
      debtTrend: 'increasing' | 'stable' | 'decreasing';
    };

    /** Debt breakdown by category */
    breakdown: Array<{
      category: string;
      debtHours: number;
      percentage: number;
      priority: 'low' | 'medium' | 'high' | 'critical';
    }>;

    /** Debt by file/component */
    items: Array<{
      filePath: string;
      debtHours: number;
      debtType: string[];
      remediationEffort: number;
      businessImpact: 'low' | 'medium' | 'high';
    }>;
  };

  /** Refactoring opportunities (when view = 'refactoring') */
  refactoring?: {
    /** Available opportunities */
    opportunities: RefactoringOpportunity[];

    /** Opportunity statistics */
    statistics: {
      totalOpportunities: number;
      totalComplexityReduction: number;
      totalEffortHours: number;
      avgRoiScore: number;
    };

    /** Recommended next actions */
    recommendations: Array<{
      priority: number;
      filePath: string;
      type: string;
      description: string;
      estimatedImpact: string;
    }>;
  };

  /** Operation status */
  success: boolean;
  errors?: string[];
  warnings?: string[];
}

// =============================================================================
// COMPLEXITY_MANAGE TOOL - Replaces 7 tools
// =============================================================================

/**
 * Unified management tool parameters
 * Replaces: start_tracking, stop_tracking, get_alerts, acknowledge_alert, resolve_alert, set_thresholds, get_performance
 */
export interface ComplexityManageParams {
  /** Management action to perform */
  action: 'start' | 'stop' | 'alerts' | 'acknowledge' | 'resolve' | 'thresholds' | 'performance';

  /** Action-specific parameters */
  params?: {
    /** Project ID for scoping */
    projectId?: string;

    /** Alert management parameters */
    alertParams?: {
      /** Alert ID for acknowledge/resolve actions */
      alertId?: string;
      /** Multiple alert IDs for batch operations */
      alertIds?: string[];
      /** Acknowledgment/resolution notes */
      notes?: string;
      /** User performing the action */
      userId?: string;
      /** Filter alerts by criteria */
      filters?: {
        severity?: Array<'info' | 'warning' | 'error' | 'critical'>;
        type?: Array<'threshold_exceeded' | 'complexity_regression' | 'hotspot_detected' | 'technical_debt_spike'>;
        filePath?: string;
        dateRange?: { startDate: string; endDate: string; };
      };
    };

    /** Threshold configuration parameters */
    thresholdParams?: {
      /** Cyclomatic complexity thresholds */
      cyclomaticComplexityThresholds?: {
        low?: number;
        moderate?: number;
        high?: number;
        veryHigh?: number;
        critical?: number;
      };

      /** Cognitive complexity thresholds */
      cognitiveComplexityThresholds?: {
        low?: number;
        moderate?: number;
        high?: number;
        veryHigh?: number;
        critical?: number;
      };

      /** Halstead effort thresholds */
      halsteadEffortThresholds?: {
        low?: number;
        moderate?: number;
        high?: number;
        veryHigh?: number;
        critical?: number;
      };

      /** Coupling thresholds */
      couplingThresholds?: {
        low?: number;
        moderate?: number;
        high?: number;
        veryHigh?: number;
        critical?: number;
      };

      /** Alert configuration */
      alertConfiguration?: {
        alertOnThresholdBreach?: boolean;
        alertOnComplexityRegression?: number; // % increase to trigger alert
        alertOnHotspotDetection?: boolean;
      };

      /** Hotspot detection settings */
      hotspotConfiguration?: {
        hotspotMinComplexity?: number;
        hotspotMinChangeFrequency?: number;
        hotspotChangeTimeFrameDays?: number;
      };
    };

    /** Tracking configuration parameters */
    trackingParams?: {
      /** Enable real-time analysis */
      enableRealTimeAnalysis?: boolean;
      /** Enable batch processing */
      enableBatchProcessing?: boolean;
      /** Analysis timeout in milliseconds */
      analysisTimeoutMs?: number;
      /** Maximum files per batch */
      maxFilesPerBatch?: number;
      /** Auto-analyze on git commits */
      autoAnalyzeOnCommit?: boolean;
      /** Scheduled analysis interval */
      scheduledAnalysisIntervalMs?: number;
      /** Supported file types */
      supportedFileTypes?: string[];
      /** Patterns to exclude from analysis */
      excludePatterns?: string[];
    };

    /** Performance monitoring parameters */
    performanceParams?: {
      /** Include detailed timing breakdown */
      includeDetailedTiming?: boolean;
      /** Include memory usage statistics */
      includeMemoryStats?: boolean;
      /** Include analysis quality metrics */
      includeQualityMetrics?: boolean;
      /** Time range for performance data */
      timeRange?: { startDate: string; endDate: string; };
    };
  };
}

/**
 * Unified management response covering all original tool outputs
 */
export interface ComplexityManageResponse {
  /** Response metadata */
  metadata: {
    action: string;
    projectId?: string;
    timestamp: Date;
    executionTimeMs: number;
  };

  /** Tracking control results (start/stop actions) */
  tracking?: {
    /** Current tracking status */
    status: 'active' | 'inactive' | 'starting' | 'stopping';
    /** Configuration applied */
    configuration?: any;
    /** Start/stop timestamp */
    timestamp: Date;
    /** Success/failure message */
    message: string;
  };

  /** Alerts data (alerts action) */
  alerts?: {
    /** Active alerts */
    active: ComplexityAlert[];
    /** Alert statistics */
    statistics: {
      total: number;
      bySeverity: Record<string, number>;
      byType: Record<string, number>;
      recentlyAdded: number;
      recentlyResolved: number;
    };
    /** Alert trends */
    trends?: Array<{
      date: string;
      alertCount: number;
      severity: string;
    }>;
  };

  /** Alert operation results (acknowledge/resolve actions) */
  alertOperation?: {
    /** Operation performed */
    operation: 'acknowledge' | 'resolve';
    /** Number of alerts affected */
    affectedCount: number;
    /** Successfully processed alert IDs */
    successfulIds: string[];
    /** Failed alert IDs with reasons */
    failedIds: Array<{ id: string; reason: string; }>;
    /** Operation timestamp */
    timestamp: Date;
  };

  /** Threshold configuration results (thresholds action) */
  thresholds?: {
    /** Current threshold configuration */
    current: {
      cyclomaticComplexityThresholds: Record<string, number>;
      cognitiveComplexityThresholds: Record<string, number>;
      halsteadEffortThresholds: Record<string, number>;
      couplingThresholds: Record<string, number>;
    };
    /** Configuration changes made */
    changes?: Array<{
      setting: string;
      oldValue: any;
      newValue: any;
    }>;
    /** Validation results */
    validation: {
      valid: boolean;
      warnings: string[];
      errors: string[];
    };
  };

  /** Performance metrics (performance action) */
  performance?: {
    /** System performance statistics */
    system: {
      trackingStatus: 'active' | 'inactive';
      totalAnalyses: number;
      averageAnalysisTimeMs: number;
      successfulAnalyses: number;
      failedAnalyses: number;
      successRate: number;
    };

    /** Analysis performance breakdown */
    analysis: {
      fileAnalysisAvgMs: number;
      functionAnalysisAvgMs: number;
      commitAnalysisAvgMs: number;
      databaseQueryAvgMs: number;
    };

    /** Resource utilization */
    resources: {
      memoryUsageMB: number;
      cpuUtilizationPercent: number;
      diskUsageMB: number;
      activeConnections: number;
    };

    /** Data quality metrics */
    quality: {
      analysisCompletenessScore: number;
      confidenceScore: number;
      dataFreshnessHours: number;
      coveragePercentage: number;
    };

    /** Historical performance trends */
    trends?: Array<{
      date: string;
      avgAnalysisTime: number;
      successRate: number;
      memoryUsage: number;
    }>;
  };

  /** Operation status */
  success: boolean;
  errors?: string[];
  warnings?: string[];
}

// =============================================================================
// SHARED TYPES (imported from existing complexity types)
// =============================================================================

// These types are re-exported from the existing complexity tracker
// to maintain compatibility with existing code

export interface FileComplexitySummary {
  filePath: string;
  fileType: string;
  linesOfCode: number;
  linesOfComments: number;
  totalFunctions: number;
  totalClasses: number;
  avgCyclomaticComplexity: number;
  maxCyclomaticComplexity: number;
  totalCognitiveComplexity: number;
  avgCognitiveComplexity: number;
  totalHalsteadVolume: number;
  maintainabilityIndex: number;
  couplingScore: number;
  cohesionScore: number;
  overallComplexityScore: number;
  complexityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  riskLevel: 'very_low' | 'low' | 'moderate' | 'high' | 'very_high' | 'critical';
  isComplexityHotspot: boolean;
  hotspotScore: number;
  refactoringPriority: 1 | 2 | 3 | 4 | 5;
  technicalDebtMinutes: number;
}

export interface CyclomaticComplexityMetric {
  filePath: string;
  className?: string;
  functionName: string;
  functionSignature: string;
  startLine: number;
  endLine: number;
  cyclomaticComplexity: number;
  essentialComplexity: number;
  designComplexity: number;
  complexityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  riskLevel: 'very_low' | 'low' | 'moderate' | 'high' | 'very_high' | 'critical';
  decisionPoints: number;
  nestingDepth: number;
  logicalOperators: number;
  testingEffortEstimate: number;
}

export interface CognitiveComplexityMetric {
  filePath: string;
  className?: string;
  functionName: string;
  functionSignature: string;
  startLine: number;
  endLine: number;
  cognitiveComplexity: number;
  baseComplexity: number;
  nestingIncrement: number;
  maxNestingLevel: number;
  ifStatements: number;
  switchStatements: number;
  loops: number;
  tryCatchBlocks: number;
  readabilityScore: number;
  understandabilityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  mentalEffortEstimate: number;
  refactoringBenefitScore: number;
}

export interface HalsteadComplexityMetric {
  filePath: string;
  className?: string;
  functionName?: string;
  scopeType: 'function' | 'method' | 'class' | 'file';
  startLine: number;
  endLine: number;
  distinctOperators: number;
  distinctOperands: number;
  totalOperators: number;
  totalOperands: number;
  programVocabulary: number;
  programLength: number;
  calculatedLength: number;
  volume: number;
  difficulty: number;
  effort: number;
  programmingTime: number;
  deliveredBugs: number;
  maintainabilityIndex: number;
  halsteadGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  defectProbability: number;
}

export interface DependencyComplexityMetric {
  filePath: string;
  className?: string;
  elementType: 'class' | 'module' | 'package' | 'function';
  elementName: string;
  afferentCoupling: number;
  efferentCoupling: number;
  couplingFactor: number;
  lackOfCohesion: number;
  cohesionScore: number;
  directDependencies: number;
  circularDependencies: number;
  dependencyDepth: number;
  abstractness: number;
  instability: number;
  distanceFromMainSequence: number;
  changeImpactScore: number;
  rippleEffectSize: number;
  couplingRiskLevel: 'very_low' | 'low' | 'moderate' | 'high' | 'very_high' | 'critical';
  architecturalViolation: boolean;
}

export interface ComplexityHotspot {
  filePath: string;
  functionName?: string;
  className?: string;
  hotspotType: 'high_complexity' | 'frequent_changes' | 'combined_risk' | 'coupling_hotspot';
  complexityScore: number;
  changeFrequency: number;
  hotspotScore: number;
  riskLevel: 'high' | 'very_high' | 'critical';
  affectedMetrics: string[];
  recommendations: string[];
  urgencyLevel: 'medium' | 'high' | 'urgent';
}

export interface RefactoringOpportunity {
  filePath: string;
  className?: string;
  functionName?: string;
  startLine: number;
  endLine: number;
  opportunityType: 'extract_method' | 'split_function' | 'reduce_nesting' | 'eliminate_duplication' |
                   'simplify_conditionals' | 'reduce_parameters' | 'break_dependencies' | 'improve_cohesion';
  currentComplexityScore: number;
  estimatedComplexityReduction: number;
  refactoringEffortHours: number;
  priorityScore: number;
  roiScore: number;
  description: string;
  refactoringSteps: string[];
  blockedBy: string[];
}

export interface ComplexityAlert {
  alertType: 'threshold_exceeded' | 'complexity_regression' | 'hotspot_detected' | 'technical_debt_spike';
  complexityType: 'cyclomatic' | 'cognitive' | 'halstead' | 'coupling' | 'overall';
  filePath: string;
  functionName?: string;
  currentValue: number;
  thresholdValue: number;
  violationMagnitude: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  description: string;
  immediateActions: string[];
  recommendedActions: string[];
  estimatedEffortHours: number;
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

/**
 * Parameter validation rules for runtime type checking
 */
export const COMPLEXITY_ANALYZE_VALIDATION = {
  target: { required: true, type: ['string', 'array'] },
  type: { required: true, enum: ['file', 'files', 'commit', 'function'] },
  'options.projectId': { type: 'string', optional: true },
  'options.trigger': { enum: ['manual', 'git_commit', 'scheduled', 'threshold_breach', 'batch_analysis'], optional: true },
  'options.includeMetrics': { type: 'array', items: { enum: ['cyclomatic', 'cognitive', 'halstead', 'dependency', 'all'] }, optional: true }
} as const;

export const COMPLEXITY_INSIGHTS_VALIDATION = {
  view: { required: true, enum: ['dashboard', 'hotspots', 'trends', 'debt', 'refactoring'] },
  'filters.projectId': { type: 'string', optional: true },
  'filters.timeRange.startDate': { type: 'string', format: 'date', optional: true },
  'filters.timeRange.endDate': { type: 'string', format: 'date', optional: true },
  'filters.thresholds.minComplexity': { type: 'number', min: 0, optional: true },
  'filters.thresholds.maxComplexity': { type: 'number', min: 0, optional: true }
} as const;

export const COMPLEXITY_MANAGE_VALIDATION = {
  action: { required: true, enum: ['start', 'stop', 'alerts', 'acknowledge', 'resolve', 'thresholds', 'performance'] },
  'params.projectId': { type: 'string', optional: true },
  'params.alertParams.alertId': { type: 'string', optional: true },
  'params.alertParams.alertIds': { type: 'array', items: { type: 'string' }, optional: true },
  'params.thresholdParams': { type: 'object', optional: true }
} as const;

// =============================================================================
// PARAMETER MAPPING EXAMPLES
// =============================================================================

/**
 * Examples showing how to map old tool parameters to new consolidated parameters
 */
export const PARAMETER_MAPPING_EXAMPLES = {

  // complexity_analyze_files → complexity_analyze
  analyze_files: {
    old: { projectId: 'proj1', filePaths: ['file1.ts', 'file2.ts'], includeMetrics: ['all'] },
    new: {
      target: ['file1.ts', 'file2.ts'],
      type: 'files',
      options: { projectId: 'proj1', includeMetrics: ['all'] }
    }
  },

  // complexity_get_function_metrics → complexity_analyze
  get_function_metrics: {
    old: { projectId: 'proj1', filePath: 'file.ts', functionName: 'myFunc', className: 'MyClass' },
    new: {
      target: 'myFunc',
      type: 'function',
      options: {
        projectId: 'proj1',
        functionOptions: { className: 'MyClass' }
      }
    }
  },

  // complexity_analyze_commit → complexity_analyze
  analyze_commit: {
    old: { projectId: 'proj1', commitSha: 'abc123', includeImpactAnalysis: true },
    new: {
      target: 'abc123',
      type: 'commit',
      options: {
        projectId: 'proj1',
        commitOptions: { includeImpactAnalysis: true }
      }
    }
  },

  // complexity_get_dashboard → complexity_insights
  get_dashboard: {
    old: { projectId: 'proj1', includeHotspots: true, includeAlerts: true },
    new: {
      view: 'dashboard',
      filters: {
        projectId: 'proj1',
        dashboardOptions: { includeHotspots: true, includeAlerts: true }
      }
    }
  },

  // complexity_get_hotspots → complexity_insights
  get_hotspots: {
    old: { projectId: 'proj1', minHotspotScore: 50, limit: 10 },
    new: {
      view: 'hotspots',
      filters: {
        projectId: 'proj1',
        hotspotOptions: { minHotspotScore: 50, limit: 10 }
      }
    }
  },

  // complexity_start_tracking → complexity_manage
  start_tracking: {
    old: { projectId: 'proj1', enableRealTimeAnalysis: true },
    new: {
      action: 'start',
      params: {
        projectId: 'proj1',
        trackingParams: { enableRealTimeAnalysis: true }
      }
    }
  },

  // complexity_acknowledge_alert → complexity_manage
  acknowledge_alert: {
    old: { alertId: 'alert123', notes: 'Acknowledged' },
    new: {
      action: 'acknowledge',
      params: {
        alertParams: { alertId: 'alert123', notes: 'Acknowledged' }
      }
    }
  }

} as const;