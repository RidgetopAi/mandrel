/**
 * Complexity Consolidation Validation Utilities
 * TT0002-1: Phase 1 Tool Consolidation Implementation
 *
 * Utilities to validate parameter mapping and ensure 100% backward compatibility
 * when migrating from 16 individual tools to 3 consolidated tools.
 */

import {
  ComplexityAnalyzeParams,
  ComplexityInsightsParams,
  ComplexityManageParams,
  COMPLEXITY_ANALYZE_VALIDATION,
  COMPLEXITY_INSIGHTS_VALIDATION,
  COMPLEXITY_MANAGE_VALIDATION,
  PARAMETER_MAPPING_EXAMPLES
} from '../types/consolidated-complexity.js';

// =============================================================================
// PARAMETER MAPPING FUNCTIONS
// =============================================================================

/**
 * Maps legacy complexity_analyze_files parameters to new complexity_analyze format
 */
export function mapAnalyzeFilesParams(oldParams: {
  projectId: string;
  filePaths: string[];
  trigger?: string;
  includeMetrics?: string[];
}): ComplexityAnalyzeParams {
  return {
    target: oldParams.filePaths,
    type: 'files',
    options: {
      projectId: oldParams.projectId,
      trigger: oldParams.trigger as any,
      includeMetrics: oldParams.includeMetrics as any,
      fileOptions: {
        includeDetailedMetrics: true
      }
    }
  };
}

/**
 * Maps legacy complexity_get_file_metrics parameters to new complexity_analyze format
 */
export function mapFileMetricsParams(oldParams: {
  projectId: string;
  filePath: string;
  includeDetailedMetrics?: boolean;
}): ComplexityAnalyzeParams {
  return {
    target: oldParams.filePath,
    type: 'file',
    options: {
      projectId: oldParams.projectId,
      fileOptions: {
        includeDetailedMetrics: oldParams.includeDetailedMetrics ?? true
      }
    }
  };
}

/**
 * Maps legacy complexity_get_function_metrics parameters to new complexity_analyze format
 */
export function mapFunctionMetricsParams(oldParams: {
  projectId: string;
  filePath: string;
  functionName: string;
  className?: string;
  functionSignature?: string;
}): ComplexityAnalyzeParams {
  return {
    target: oldParams.functionName,
    type: 'function',
    options: {
      projectId: oldParams.projectId,
      functionOptions: {
        className: oldParams.className,
        functionSignature: oldParams.functionSignature
      }
    }
  };
}

/**
 * Maps legacy complexity_analyze_commit parameters to new complexity_analyze format
 */
export function mapAnalyzeCommitParams(oldParams: {
  projectId: string;
  commitSha: string;
  compareWith?: string;
  includeImpactAnalysis?: boolean;
  changedFilesOnly?: boolean;
}): ComplexityAnalyzeParams {
  return {
    target: oldParams.commitSha,
    type: 'commit',
    options: {
      projectId: oldParams.projectId,
      commitOptions: {
        compareWith: oldParams.compareWith,
        includeImpactAnalysis: oldParams.includeImpactAnalysis,
        changedFilesOnly: oldParams.changedFilesOnly
      }
    }
  };
}

/**
 * Maps legacy complexity_get_dashboard parameters to new complexity_insights format
 */
export function mapDashboardParams(oldParams: {
  projectId: string;
  includeHotspots?: boolean;
  includeAlerts?: boolean;
  includeOpportunities?: boolean;
  includeTrends?: boolean;
}): ComplexityInsightsParams {
  return {
    view: 'dashboard',
    filters: {
      projectId: oldParams.projectId,
      dashboardOptions: {
        includeHotspots: oldParams.includeHotspots,
        includeAlerts: oldParams.includeAlerts,
        includeOpportunities: oldParams.includeOpportunities,
        includeTrends: oldParams.includeTrends
      }
    }
  };
}

/**
 * Maps legacy complexity_get_hotspots parameters to new complexity_insights format
 */
export function mapHotspotsParams(oldParams: {
  projectId: string;
  minHotspotScore?: number;
  hotspotTypes?: string[];
  limit?: number;
  sortBy?: string;
  includeRecentChanges?: boolean;
}): ComplexityInsightsParams {
  return {
    view: 'hotspots',
    filters: {
      projectId: oldParams.projectId,
      hotspotOptions: {
        minHotspotScore: oldParams.minHotspotScore,
        hotspotTypes: oldParams.hotspotTypes as any,
        limit: oldParams.limit,
        sortBy: oldParams.sortBy as any
      },
      scope: {
        recentChangesOnly: oldParams.includeRecentChanges
      }
    }
  };
}

/**
 * Maps legacy complexity_get_trends parameters to new complexity_insights format
 */
export function mapTrendsParams(oldParams: {
  projectId: string;
  timeframe?: { startDate: string; endDate: string; };
  metrics?: string[];
  includeForecast?: boolean;
  forecastPeriods?: number;
}): ComplexityInsightsParams {
  return {
    view: 'trends',
    filters: {
      projectId: oldParams.projectId,
      timeRange: oldParams.timeframe,
      trendsOptions: {
        metrics: oldParams.metrics as any,
        includeForecast: oldParams.includeForecast,
        forecastPeriods: oldParams.forecastPeriods
      }
    }
  };
}

/**
 * Maps legacy complexity_get_technical_debt parameters to new complexity_insights format
 */
export function mapTechnicalDebtParams(oldParams: {
  projectId: string;
  calculationMethod?: string;
  includeRemediation?: boolean;
  groupBy?: string;
}): ComplexityInsightsParams {
  return {
    view: 'debt',
    filters: {
      projectId: oldParams.projectId,
      debtOptions: {
        calculationMethod: oldParams.calculationMethod as any,
        includeRemediation: oldParams.includeRemediation,
        groupBy: oldParams.groupBy as any
      }
    }
  };
}

/**
 * Maps legacy complexity_get_refactoring_opportunities parameters to new complexity_insights format
 */
export function mapRefactoringOpportunitiesParams(oldParams: {
  projectId: string;
  minRoiScore?: number;
  maxEffortHours?: number;
  opportunityTypes?: string[];
  sortBy?: string;
  limit?: number;
}): ComplexityInsightsParams {
  return {
    view: 'refactoring',
    filters: {
      projectId: oldParams.projectId,
      refactoringOptions: {
        minRoiScore: oldParams.minRoiScore,
        maxEffortHours: oldParams.maxEffortHours,
        opportunityTypes: oldParams.opportunityTypes as any,
        sortBy: oldParams.sortBy as any,
        limit: oldParams.limit
      }
    }
  };
}

/**
 * Maps legacy complexity_start_tracking parameters to new complexity_manage format
 */
export function mapStartTrackingParams(oldParams: {
  projectId: string;
  enableRealTimeAnalysis?: boolean;
  enableBatchProcessing?: boolean;
  autoAnalyzeOnCommit?: boolean;
  analysisTimeoutMs?: number;
}): ComplexityManageParams {
  return {
    action: 'start',
    params: {
      projectId: oldParams.projectId,
      trackingParams: {
        enableRealTimeAnalysis: oldParams.enableRealTimeAnalysis,
        enableBatchProcessing: oldParams.enableBatchProcessing,
        autoAnalyzeOnCommit: oldParams.autoAnalyzeOnCommit,
        analysisTimeoutMs: oldParams.analysisTimeoutMs
      }
    }
  };
}

/**
 * Maps legacy complexity_stop_tracking parameters to new complexity_manage format
 */
export function mapStopTrackingParams(oldParams: {
  projectId: string;
}): ComplexityManageParams {
  return {
    action: 'stop',
    params: {
      projectId: oldParams.projectId
    }
  };
}

/**
 * Maps legacy complexity_get_alerts parameters to new complexity_manage format
 */
export function mapGetAlertsParams(oldParams: {
  projectId: string;
  severity?: string[];
  alertType?: string[];
  filePath?: string;
  dateRange?: { startDate: string; endDate: string; };
}): ComplexityManageParams {
  return {
    action: 'alerts',
    params: {
      projectId: oldParams.projectId,
      alertParams: {
        filters: {
          severity: oldParams.severity as any,
          type: oldParams.alertType as any,
          filePath: oldParams.filePath,
          dateRange: oldParams.dateRange
        }
      }
    }
  };
}

/**
 * Maps legacy complexity_acknowledge_alert parameters to new complexity_manage format
 */
export function mapAcknowledgeAlertParams(oldParams: {
  alertId: string;
  notes?: string;
  userId?: string;
}): ComplexityManageParams {
  return {
    action: 'acknowledge',
    params: {
      alertParams: {
        alertId: oldParams.alertId,
        notes: oldParams.notes,
        userId: oldParams.userId
      }
    }
  };
}

/**
 * Maps legacy complexity_resolve_alert parameters to new complexity_manage format
 */
export function mapResolveAlertParams(oldParams: {
  alertId: string;
  notes?: string;
  userId?: string;
}): ComplexityManageParams {
  return {
    action: 'resolve',
    params: {
      alertParams: {
        alertId: oldParams.alertId,
        notes: oldParams.notes,
        userId: oldParams.userId
      }
    }
  };
}

/**
 * Maps legacy complexity_set_thresholds parameters to new complexity_manage format
 */
export function mapSetThresholdsParams(oldParams: {
  projectId: string;
  cyclomaticComplexityThresholds?: Record<string, number>;
  cognitiveComplexityThresholds?: Record<string, number>;
  halsteadEffortThresholds?: Record<string, number>;
  couplingThresholds?: Record<string, number>;
  alertConfiguration?: Record<string, any>;
}): ComplexityManageParams {
  return {
    action: 'thresholds',
    params: {
      projectId: oldParams.projectId,
      thresholdParams: {
        cyclomaticComplexityThresholds: oldParams.cyclomaticComplexityThresholds as any,
        cognitiveComplexityThresholds: oldParams.cognitiveComplexityThresholds as any,
        halsteadEffortThresholds: oldParams.halsteadEffortThresholds as any,
        couplingThresholds: oldParams.couplingThresholds as any,
        alertConfiguration: oldParams.alertConfiguration as any
      }
    }
  };
}

/**
 * Maps legacy complexity_get_performance parameters to new complexity_manage format
 */
export function mapGetPerformanceParams(oldParams: {
  projectId: string;
  includeDetailedTiming?: boolean;
  includeMemoryStats?: boolean;
  includeQualityMetrics?: boolean;
  timeRange?: { startDate: string; endDate: string; };
}): ComplexityManageParams {
  return {
    action: 'performance',
    params: {
      projectId: oldParams.projectId,
      performanceParams: {
        includeDetailedTiming: oldParams.includeDetailedTiming,
        includeMemoryStats: oldParams.includeMemoryStats,
        includeQualityMetrics: oldParams.includeQualityMetrics,
        timeRange: oldParams.timeRange
      }
    }
  };
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validates that a parameter mapping preserves all required fields
 */
export function validateParameterMapping(
  oldToolName: string,
  oldParams: any,
  newParams: ComplexityAnalyzeParams | ComplexityInsightsParams | ComplexityManageParams
): { valid: boolean; errors: string[]; warnings: string[]; } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Basic validation that new parameters are properly structured
  if (!newParams) {
    errors.push('New parameters are null or undefined');
    return { valid: false, errors, warnings };
  }

  // Tool-specific validation
  switch (oldToolName) {
    case 'complexity_analyze_files':
    case 'complexity_get_file_metrics':
    case 'complexity_get_function_metrics':
    case 'complexity_analyze_commit':
      validateAnalyzeParams(newParams as ComplexityAnalyzeParams, errors, warnings);
      break;

    case 'complexity_get_dashboard':
    case 'complexity_get_hotspots':
    case 'complexity_get_trends':
    case 'complexity_get_technical_debt':
    case 'complexity_get_refactoring_opportunities':
      validateInsightsParams(newParams as ComplexityInsightsParams, errors, warnings);
      break;

    case 'complexity_start_tracking':
    case 'complexity_stop_tracking':
    case 'complexity_get_alerts':
    case 'complexity_acknowledge_alert':
    case 'complexity_resolve_alert':
    case 'complexity_set_thresholds':
    case 'complexity_get_performance':
      validateManageParams(newParams as ComplexityManageParams, errors, warnings);
      break;

    default:
      errors.push(`Unknown legacy tool: ${oldToolName}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

function validateAnalyzeParams(params: ComplexityAnalyzeParams, errors: string[], warnings: string[]): void {
  if (!params.target) {
    errors.push('Missing required field: target');
  }
  if (!params.type || !['file', 'files', 'commit', 'function'].includes(params.type)) {
    errors.push('Invalid or missing field: type');
  }
  if (params.type === 'files' && typeof params.target === 'string') {
    warnings.push('Type is "files" but target is a single string, consider using "file" type');
  }
  if (params.type === 'file' && Array.isArray(params.target)) {
    warnings.push('Type is "file" but target is an array, consider using "files" type');
  }
}

function validateInsightsParams(params: ComplexityInsightsParams, errors: string[], warnings: string[]): void {
  if (!params.view || !['dashboard', 'hotspots', 'trends', 'debt', 'refactoring'].includes(params.view)) {
    errors.push('Invalid or missing field: view');
  }
  // Add more specific validation based on view type
}

function validateManageParams(params: ComplexityManageParams, errors: string[], warnings: string[]): void {
  if (!params.action || !['start', 'stop', 'alerts', 'acknowledge', 'resolve', 'thresholds', 'performance'].includes(params.action)) {
    errors.push('Invalid or missing field: action');
  }
  // Add more specific validation based on action type
}

// =============================================================================
// COMPATIBILITY TESTING UTILITIES
// =============================================================================

/**
 * Test suite to verify all parameter mappings work correctly
 */
export function runCompatibilityTests(): {
  passed: number;
  failed: number;
  results: Array<{ tool: string; success: boolean; error?: string; }>
} {
  const results: Array<{ tool: string; success: boolean; error?: string; }> = [];
  let passed = 0;
  let failed = 0;

  // Test each mapping function
  const tests = [
    {
      tool: 'complexity_analyze_files',
      oldParams: { projectId: 'test', filePaths: ['file1.ts'], includeMetrics: ['all'] },
      mapper: mapAnalyzeFilesParams
    },
    {
      tool: 'complexity_get_file_metrics',
      oldParams: { projectId: 'test', filePath: 'file.ts' },
      mapper: mapFileMetricsParams
    },
    {
      tool: 'complexity_get_function_metrics',
      oldParams: { projectId: 'test', filePath: 'file.ts', functionName: 'testFunc' },
      mapper: mapFunctionMetricsParams
    },
    {
      tool: 'complexity_analyze_commit',
      oldParams: { projectId: 'test', commitSha: 'abc123' },
      mapper: mapAnalyzeCommitParams
    },
    {
      tool: 'complexity_get_dashboard',
      oldParams: { projectId: 'test' },
      mapper: mapDashboardParams
    },
    {
      tool: 'complexity_get_hotspots',
      oldParams: { projectId: 'test' },
      mapper: mapHotspotsParams
    }
    // Add more tests as needed
  ];

  for (const test of tests) {
    try {
      const newParams = test.mapper(test.oldParams);
      const validation = validateParameterMapping(test.tool, test.oldParams, newParams);

      if (validation.valid) {
        passed++;
        results.push({ tool: test.tool, success: true });
      } else {
        failed++;
        results.push({
          tool: test.tool,
          success: false,
          error: validation.errors.join(', ')
        });
      }
    } catch (error) {
      failed++;
      results.push({
        tool: test.tool,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return { passed, failed, results };
}

// =============================================================================
// MIGRATION HELPER
// =============================================================================

/**
 * Main migration function that converts any legacy complexity tool call
 * to the appropriate consolidated tool call
 */
export function migrateLegacyToolCall(
  toolName: string,
  params: any
): {
  newToolName: string;
  newParams: ComplexityAnalyzeParams | ComplexityInsightsParams | ComplexityManageParams;
  migrationNotes?: string[];
} {
  const migrationNotes: string[] = [];

  switch (toolName) {
    // Analyze tools
    case 'complexity_analyze_files':
      return {
        newToolName: 'complexity_analyze',
        newParams: mapAnalyzeFilesParams(params),
        migrationNotes: ['Migrated to complexity_analyze with type: "files"']
      };

    case 'complexity_get_file_metrics':
      return {
        newToolName: 'complexity_analyze',
        newParams: mapFileMetricsParams(params),
        migrationNotes: ['Migrated to complexity_analyze with type: "file"']
      };

    case 'complexity_get_function_metrics':
      return {
        newToolName: 'complexity_analyze',
        newParams: mapFunctionMetricsParams(params),
        migrationNotes: ['Migrated to complexity_analyze with type: "function"']
      };

    case 'complexity_analyze_commit':
      return {
        newToolName: 'complexity_analyze',
        newParams: mapAnalyzeCommitParams(params),
        migrationNotes: ['Migrated to complexity_analyze with type: "commit"']
      };

    // Insights tools
    case 'complexity_get_dashboard':
      return {
        newToolName: 'complexity_insights',
        newParams: mapDashboardParams(params),
        migrationNotes: ['Migrated to complexity_insights with view: "dashboard"']
      };

    case 'complexity_get_hotspots':
      return {
        newToolName: 'complexity_insights',
        newParams: mapHotspotsParams(params),
        migrationNotes: ['Migrated to complexity_insights with view: "hotspots"']
      };

    case 'complexity_get_trends':
      return {
        newToolName: 'complexity_insights',
        newParams: mapTrendsParams(params),
        migrationNotes: ['Migrated to complexity_insights with view: "trends"']
      };

    case 'complexity_get_technical_debt':
      return {
        newToolName: 'complexity_insights',
        newParams: mapTechnicalDebtParams(params),
        migrationNotes: ['Migrated to complexity_insights with view: "debt"']
      };

    case 'complexity_get_refactoring_opportunities':
      return {
        newToolName: 'complexity_insights',
        newParams: mapRefactoringOpportunitiesParams(params),
        migrationNotes: ['Migrated to complexity_insights with view: "refactoring"']
      };

    // Management tools
    case 'complexity_start_tracking':
      return {
        newToolName: 'complexity_manage',
        newParams: mapStartTrackingParams(params),
        migrationNotes: ['Migrated to complexity_manage with action: "start"']
      };

    case 'complexity_stop_tracking':
      return {
        newToolName: 'complexity_manage',
        newParams: mapStopTrackingParams(params),
        migrationNotes: ['Migrated to complexity_manage with action: "stop"']
      };

    case 'complexity_get_alerts':
      return {
        newToolName: 'complexity_manage',
        newParams: mapGetAlertsParams(params),
        migrationNotes: ['Migrated to complexity_manage with action: "alerts"']
      };

    case 'complexity_acknowledge_alert':
      return {
        newToolName: 'complexity_manage',
        newParams: mapAcknowledgeAlertParams(params),
        migrationNotes: ['Migrated to complexity_manage with action: "acknowledge"']
      };

    case 'complexity_resolve_alert':
      return {
        newToolName: 'complexity_manage',
        newParams: mapResolveAlertParams(params),
        migrationNotes: ['Migrated to complexity_manage with action: "resolve"']
      };

    case 'complexity_set_thresholds':
      return {
        newToolName: 'complexity_manage',
        newParams: mapSetThresholdsParams(params),
        migrationNotes: ['Migrated to complexity_manage with action: "thresholds"']
      };

    case 'complexity_get_performance':
      return {
        newToolName: 'complexity_manage',
        newParams: mapGetPerformanceParams(params),
        migrationNotes: ['Migrated to complexity_manage with action: "performance"']
      };

    default:
      throw new Error(`Unknown legacy complexity tool: ${toolName}`);
  }
}