/**
 * TT009-3-1: Pattern Analyze Consolidated Tool
 *
 * Unified pattern analysis tool that replaces:
 * - pattern_detection_start: Start the real-time pattern detection service
 * - pattern_detection_stop: Stop the pattern detection service and get final metrics
 * - pattern_detection_status: Get pattern detection service status and performance metrics
 * - pattern_detect_commits: Detect patterns in specific commits or recent commits
 * - pattern_track_git_activity: Track git activity with automatic pattern detection
 * - pattern_analyze_project: Get comprehensive pattern analysis for project
 * - pattern_analyze_session: Analyze patterns for specific session context
 * - pattern_analyze_commit: Analyze patterns for specific git commits with impact analysis
 * - pattern_get_discovered: Get discovered patterns with advanced filtering
 * - pattern_get_performance: Get pattern detection system performance metrics
 *
 * Consolidation reduces 10 tools → 1 tool with unified interface.
 * Part of Phase 3 Tool Consolidation (TT009-3)
 */

import { logEvent } from '../../middleware/eventLogger.js';
import { projectHandler } from '../project.js';
import {
  PatternDetector,
  startPatternDetection,
  stopPatternDetection,
  detectPatterns,
  getPatternDetectionMetrics,
  type PatternDetectionResult,
  type PatternAlert
} from '../../services/patternDetector.js';
import { PatternDetectionHandler } from '../_deprecated_tt009/patternDetection.js';
import { PatternAnalysisHandler } from '../_deprecated_tt009/patternAnalysis.js';

/**
 * Unified pattern analysis interface
 * Consolidates multiple pattern detection and analysis endpoints into one coherent API
 */
export async function handlePatternAnalyze(args: any): Promise<any> {
  const startTime = Date.now();

  try {
    const { target, action, options = {} } = args;

    console.log(`🎯 pattern_analyze(target: ${target}, action: ${action})`);

    // Validate required parameters
    if (!target || !action) {
      return {
        success: false,
        error: 'target and action parameters are required',
        validTargets: ['project', 'session', 'commit', 'git', 'service'],
        validActions: ['start', 'stop', 'status', 'analyze', 'detect', 'track', 'discovered', 'performance']
      };
    }

    let result;
    const executionTime = Date.now() - startTime;

    switch (target) {
      case 'service':
        result = await analyzeService(action, options);
        break;

      case 'project':
        result = await analyzeProject(action, options);
        break;

      case 'session':
        result = await analyzeSession(action, options);
        break;

      case 'commit':
        result = await analyzeCommit(action, options);
        break;

      case 'git':
        result = await analyzeGit(action, options);
        break;

      default:
        return {
          success: false,
          error: `Invalid target: ${target}`,
          validTargets: ['project', 'session', 'commit', 'git', 'service'],
          providedTarget: target
        };
    }

    // Log successful pattern analysis
    await logEvent({
      actor: 'ai',
      event_type: 'pattern_analysis_consolidated',
      status: 'info',
      metadata: {
        target,
        action,
        executionTimeMs: executionTime,
        toolType: 'consolidated',
        phase: 'TT009-3',
        originalTools: getOriginalTools(target, action)
      }
    });

    return {
      success: true,
      target,
      action,
      executionTimeMs: executionTime,
      data: result,
      consolidationInfo: {
        phase: 'TT009-3-1',
        originalToolReplaced: getOriginalTool(target, action),
        tokenSavings: 'Part of ~7,000 token Phase 3 savings'
      }
    };

  } catch (error) {
    const executionTime = Date.now() - startTime;

    console.error(`❌ pattern_analyze failed:`, error);

    // Log failed pattern analysis
    await logEvent({
      actor: 'ai',
      event_type: 'pattern_analysis_consolidated_failed',
      status: 'error',
      metadata: {
        target: args.target,
        action: args.action,
        executionTimeMs: executionTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        phase: 'TT009-3'
      }
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      target: args.target,
      action: args.action,
      executionTimeMs: executionTime
    };
  }
}

/**
 * Analyze service operations
 * Replaces: pattern_detection_start, pattern_detection_stop, pattern_detection_status, pattern_get_performance
 */
async function analyzeService(action: string, options: any): Promise<any> {
  const {
    enableRealTime = true,
    enableBatchProcessing = true,
    detectionTimeoutMs = 30000,
    updateIntervalMs = 5000
  } = options;

  console.log(`🔧 Service operation: ${action}`);

  switch (action) {
    case 'start':
      return await PatternDetectionHandler.startPatternDetection({
        enableRealTime,
        enableBatchProcessing,
        detectionTimeoutMs,
        updateIntervalMs
      });

    case 'stop':
      return await PatternDetectionHandler.stopPatternDetection();

    case 'status':
      return await PatternDetectionHandler.getPatternDetectionStatus();

    case 'performance':
      return { message: 'Pattern detection performance tracking deprecated', status: 'ok' };

    default:
      throw new Error(`Invalid service action: ${action}. Valid actions: start, stop, status, performance`);
  }
}

/**
 * Analyze project patterns
 * Replaces: pattern_analyze_project
 */
async function analyzeProject(action: string, options: any): Promise<any> {
  const {
    projectId,
    includeGitPatterns = true,
    includeSessionPatterns = true,
    includeHistoricalData = true,
    analysisDepth = 'comprehensive',
    patternTypes = ['all']
  } = options;

  console.log(`🏢 Project analysis: ${action} for project: ${projectId}`);

  if (action !== 'analyze') {
    throw new Error(`Invalid project action: ${action}. Valid actions: analyze`);
  }

  // Auto-detect current project if not provided
  const actualProjectId = projectId || await projectHandler.getCurrentProjectId('default-session');

  if (!actualProjectId) {
    throw new Error('No current project set and no projectId provided. Use project_switch to set an active project.');
  }

  // Delegate to the working pattern analysis handler
  return await PatternDetectionHandler.analyzeProjectPatterns({
    projectId: actualProjectId,
    includeGitPatterns,
    includeSessionPatterns,
    includeHistoricalData,
    analysisDepth,
    patternTypes
  });
}

/**
 * Analyze session patterns
 * Replaces: pattern_analyze_session
 */
async function analyzeSession(action: string, options: any): Promise<any> {
  const {
    sessionId,
    includeContextPatterns = true,
    includeTimePatterns = true,
    includeActivityPatterns = true,
    confidenceThreshold = 0.7
  } = options;

  console.log(`📝 Session analysis: ${action} for session: ${sessionId}`);

  if (action !== 'analyze') {
    throw new Error(`Invalid session action: ${action}. Valid actions: analyze`);
  }

  return await PatternAnalysisHandler.analyzeSessionPatterns({
    sessionId,
    includeContextPatterns,
    includeTimePatterns,
    includeActivityPatterns,
    confidenceThreshold
  });
}

/**
 * Analyze commit patterns
 * Replaces: pattern_analyze_commit, pattern_detect_commits
 */
async function analyzeCommit(action: string, options: any): Promise<any> {
  const {
    commitSha,
    commitShas,
    includeImpactAnalysis = true,
    includeFilePatterns = true,
    includeChangePatterns = true,
    maxCommits = 10
  } = options;

  console.log(`📊 Commit analysis: ${action}`);

  switch (action) {
    case 'analyze':
      if (!commitSha) {
        throw new Error('commitSha is required for single commit analysis');
      }
      return await PatternAnalysisHandler.analyzeCommitPatterns({
        commitSha,
        includeImpactAnalysis,
        includeFilePatterns,
        includeChangePatterns
      });

    case 'detect':
      return await PatternDetectionHandler.detectPatternsForCommits({
        commitShas,
        maxCommits,
        includeFilePatterns,
        includeChangePatterns
      });

    default:
      throw new Error(`Invalid commit action: ${action}. Valid actions: analyze, detect`);
  }
}

/**
 * Analyze git activity patterns
 * Replaces: pattern_track_git_activity, pattern_get_discovered
 */
async function analyzeGit(action: string, options: any): Promise<any> {
  const {
    enableRealTimeTracking = true,
    trackingIntervalMs = 30000,
    patternTypes = ['all'],
    minConfidence = 0.6,
    includeMetadata = true,
    limitResults = 100
  } = options;

  console.log(`🔄 Git analysis: ${action}`);

  switch (action) {
    case 'track':
      return await PatternDetectionHandler.trackGitActivityWithPatterns();

    case 'discovered':
      return await PatternAnalysisHandler.getDiscoveredPatterns({
        patternTypes,
        minConfidence,
        includeMetadata,
        limitResults
      });

    default:
      throw new Error(`Invalid git action: ${action}. Valid actions: track, discovered`);
  }
}

/**
 * Get original tool name for tracking
 */
function getOriginalTool(target: string, action: string): string {
  switch (`${target}:${action}`) {
    case 'service:start': return 'pattern_detection_start';
    case 'service:stop': return 'pattern_detection_stop';
    case 'service:status': return 'pattern_detection_status';
    case 'service:performance': return 'pattern_get_performance';
    case 'project:analyze': return 'pattern_analyze_project';
    case 'session:analyze': return 'pattern_analyze_session';
    case 'commit:analyze': return 'pattern_analyze_commit';
    case 'commit:detect': return 'pattern_detect_commits';
    case 'git:track': return 'pattern_track_git_activity';
    case 'git:discovered': return 'pattern_get_discovered';
    default: return 'unknown';
  }
}

/**
 * Get original tools array for metadata
 */
function getOriginalTools(target: string, action: string): string[] {
  switch (`${target}:${action}`) {
    case 'service:start': return ['pattern_detection_start'];
    case 'service:stop': return ['pattern_detection_stop'];
    case 'service:status': return ['pattern_detection_status'];
    case 'service:performance': return ['pattern_get_performance'];
    case 'project:analyze': return ['pattern_analyze_project'];
    case 'session:analyze': return ['pattern_analyze_session'];
    case 'commit:analyze': return ['pattern_analyze_commit'];
    case 'commit:detect': return ['pattern_detect_commits'];
    case 'git:track': return ['pattern_track_git_activity'];
    case 'git:discovered': return ['pattern_get_discovered'];
    default: return [];
  }
}