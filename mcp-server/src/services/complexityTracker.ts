/**
 * TC015: Code Complexity Tracking Service
 * 
 * Comprehensive system for tracking code complexity evolution and identifying complexity hotspots:
 * 
 * 1. Multi-Dimensional Complexity Analysis:
 *    - Cyclomatic complexity (independent paths)
 *    - Cognitive complexity (mental effort)
 *    - Halstead complexity (program vocabulary)
 *    - Dependency complexity (coupling/cohesion)
 *    - Nesting depth and branching analysis
 *    - Maintainability index calculation
 * 
 * 2. Real-time Complexity Monitoring:
 *    - Complexity calculation on git commits
 *    - Complexity trend analysis over time
 *    - Complexity hotspot identification
 *    - Complexity threshold alerting
 *    - Complexity regression detection
 * 
 * 3. Complexity Intelligence:
 *    - Complexity growth prediction
 *    - Refactoring opportunity identification
 *    - Complexity-based risk scoring
 *    - Technical debt quantification
 *    - Maintenance effort estimation
 * 
 * Performance Target: Sub-100ms complexity queries for dashboard integration
 * Integration: Git tracking system, metrics collection, real-time monitoring
 */

import { db } from '../config/database.js';
import { logEvent } from '../middleware/eventLogger.js';
import { getCurrentSession } from './sessionManager.js';
import { readFileSync, existsSync } from 'fs';
import { extname, basename } from 'path';

// Complexity Analysis Configuration
export interface ComplexityTrackerConfig {
  // Performance settings
  enableRealTimeAnalysis: boolean;
  enableBatchProcessing: boolean;
  analysisTimeoutMs: number;
  maxFilesPerBatch: number;
  
  // Analysis triggers
  autoAnalyzeOnCommit: boolean;
  autoAnalyzeOnFileChange: boolean;
  autoAnalyzeOnThresholdBreach: boolean;
  scheduledAnalysisIntervalMs: number;
  
  // Complexity thresholds
  cyclomaticComplexityThresholds: {
    low: number;
    moderate: number;
    high: number;
    veryHigh: number;
    critical: number;
  };
  
  cognitiveComplexityThresholds: {
    low: number;
    moderate: number;
    high: number;
    veryHigh: number;
    critical: number;
  };
  
  halsteadEffortThresholds: {
    low: number;
    moderate: number;
    high: number;
    veryHigh: number;
    critical: number;
  };
  
  couplingThresholds: {
    low: number;
    moderate: number;
    high: number;
    veryHigh: number;
    critical: number;
  };
  
  // Risk assessment weights
  complexityWeights: {
    cyclomatic: number;
    cognitive: number;
    halstead: number;
    coupling: number;
    nesting: number;
    maintainability: number;
  };
  
  // Hotspot detection
  hotspotMinComplexity: number;
  hotspotMinChangeFrequency: number;
  hotspotChangeTimeFrameDays: number;
  
  // Alert settings
  alertOnThresholdBreach: boolean;
  alertOnComplexityRegression: number; // % increase to trigger alert
  alertOnHotspotDetection: boolean;
  
  // File type support
  supportedFileTypes: string[];
  excludePatterns: string[];
}

// Complexity Analysis Results
export interface ComplexityAnalysisResult {
  analysisSessionId: string;
  projectId: string;
  analysisTimestamp: Date;
  executionTimeMs: number;
  
  // Analysis metadata
  analyzerVersion: string;
  commitSha?: string;
  analysisTrigger: 'manual' | 'git_commit' | 'scheduled' | 'threshold_breach' | 'batch_analysis';
  
  // Analysis summary
  filesAnalyzed: number;
  functionsAnalyzed: number;
  classesAnalyzed: number;
  complexityMetricsCalculated: number;
  
  // Complexity scores
  totalComplexityScore: number;
  avgComplexityScore: number;
  maxComplexityScore: number;
  
  // Results by type
  cyclomaticMetrics: CyclomaticComplexityMetric[];
  cognitiveMetrics: CognitiveComplexityMetric[];
  halsteadMetrics: HalsteadComplexityMetric[];
  dependencyMetrics: DependencyComplexityMetric[];
  fileSummaries: FileComplexitySummary[];
  
  // Intelligence insights
  hotspotsIdentified: ComplexityHotspot[];
  refactoringOpportunities: RefactoringOpportunity[];
  complexityAlerts: ComplexityAlert[];
  
  // Performance and quality
  analysisCompletenessScore: number;
  confidenceScore: number;
  dataFreshnessHours: number;
  
  success: boolean;
  errors: string[];
}

// Individual complexity metric interfaces
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

// Language-specific complexity analyzers
interface LanguageComplexityAnalyzer {
  fileExtensions: string[];
  analyzeCyclomaticComplexity(code: string, filePath: string): CyclomaticComplexityMetric[];
  analyzeCognitiveComplexity(code: string, filePath: string): CognitiveComplexityMetric[];
  analyzeHalsteadComplexity(code: string, filePath: string): HalsteadComplexityMetric[];
  analyzeDependencyComplexity(code: string, filePath: string): DependencyComplexityMetric[];
}

const DEFAULT_CONFIG: ComplexityTrackerConfig = {
  enableRealTimeAnalysis: true,
  enableBatchProcessing: true,
  analysisTimeoutMs: 100, // Sub-100ms target
  maxFilesPerBatch: 50,
  
  autoAnalyzeOnCommit: true,
  autoAnalyzeOnFileChange: false,
  autoAnalyzeOnThresholdBreach: true,
  scheduledAnalysisIntervalMs: 3600000, // 1 hour
  
  cyclomaticComplexityThresholds: {
    low: 10,
    moderate: 20,
    high: 50,
    veryHigh: 100,
    critical: 200
  },
  
  cognitiveComplexityThresholds: {
    low: 15,
    moderate: 25,
    high: 50,
    veryHigh: 100,
    critical: 150
  },
  
  halsteadEffortThresholds: {
    low: 1000,
    moderate: 5000,
    high: 20000,
    veryHigh: 50000,
    critical: 100000
  },
  
  couplingThresholds: {
    low: 0.2,
    moderate: 0.4,
    high: 0.6,
    veryHigh: 0.8,
    critical: 0.9
  },
  
  complexityWeights: {
    cyclomatic: 0.3,
    cognitive: 0.25,
    halstead: 0.15,
    coupling: 0.15,
    nesting: 0.1,
    maintainability: 0.05
  },
  
  hotspotMinComplexity: 30,
  hotspotMinChangeFrequency: 5,
  hotspotChangeTimeFrameDays: 90,
  
  alertOnThresholdBreach: true,
  alertOnComplexityRegression: 25, // 25% increase
  alertOnHotspotDetection: true,
  
  supportedFileTypes: ['.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.cs', '.cpp', '.c', '.go', '.rb', '.php'],
  excludePatterns: ['node_modules/', '.git/', 'dist/', 'build/', '*.min.js', '*.test.ts', '*.spec.ts']
};

/**
 * Code Complexity Tracking Service
 */
export class ComplexityTracker {
  private static instance: ComplexityTracker | null = null;
  private config: ComplexityTrackerConfig;
  private isRunning: boolean = false;
  private scheduledTimer: NodeJS.Timeout | null = null;
  
  // Language analyzers
  private languageAnalyzers: Map<string, LanguageComplexityAnalyzer> = new Map();
  
  // Performance metrics
  private performanceMetrics = {
    totalAnalyses: 0,
    totalExecutionTime: 0,
    averageExecutionTime: 0,
    filesAnalyzed: 0,
    functionsAnalyzed: 0,
    alertsGenerated: 0,
    hotspotsIdentified: 0,
    lastPerformanceCheck: new Date()
  };

  private constructor(config: Partial<ComplexityTrackerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeLanguageAnalyzers();
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<ComplexityTrackerConfig>): ComplexityTracker {
    if (!ComplexityTracker.instance) {
      ComplexityTracker.instance = new ComplexityTracker(config);
    }
    return ComplexityTracker.instance;
  }

  /**
   * Start complexity tracking service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚡ Complexity tracker already running');
      return;
    }

    try {
      console.log('🔍 Starting code complexity tracking service...');
      
      this.isRunning = true;

      // Start scheduled analysis if enabled
      if (this.config.enableBatchProcessing) {
        this.startScheduledAnalysis();
      }

      // Log service start
      await logEvent({
        actor: 'system',
        event_type: 'complexity_tracking_started',
        status: 'open',
        metadata: {
          realTimeAnalysis: this.config.enableRealTimeAnalysis,
          batchProcessing: this.config.enableBatchProcessing,
          scheduledInterval: this.config.scheduledAnalysisIntervalMs,
          performanceTarget: this.config.analysisTimeoutMs,
          supportedFileTypes: this.config.supportedFileTypes
        },
        tags: ['complexity', 'tracking', 'service']
      });

      console.log('✅ Complexity tracking service started successfully');

    } catch (error) {
      console.error('❌ Failed to start complexity tracking:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop complexity tracking service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('⚡ Complexity tracker not running');
      return;
    }

    try {
      console.log('🛑 Stopping complexity tracking service...');

      this.isRunning = false;

      // Stop scheduled analysis
      if (this.scheduledTimer) {
        clearInterval(this.scheduledTimer);
        this.scheduledTimer = null;
      }

      // Log service stop
      await logEvent({
        actor: 'system',
        event_type: 'complexity_tracking_stopped',
        status: 'closed',
        metadata: {
          totalAnalyses: this.performanceMetrics.totalAnalyses,
          averageExecutionTime: this.performanceMetrics.averageExecutionTime,
          filesAnalyzed: this.performanceMetrics.filesAnalyzed,
          alertsGenerated: this.performanceMetrics.alertsGenerated
        },
        tags: ['complexity', 'tracking', 'service']
      });

      console.log('✅ Complexity tracking service stopped successfully');

    } catch (error) {
      console.error('❌ Failed to stop complexity tracking:', error);
      throw error;
    }
  }

  /**
   * Analyze complexity for specific files (main entry point)
   */
  async analyzeComplexity(
    projectId: string,
    filePaths: string[],
    trigger: 'manual' | 'git_commit' | 'scheduled' | 'threshold_breach' | 'batch_analysis' = 'manual',
    commitSha?: string
  ): Promise<ComplexityAnalysisResult> {
    const startTime = Date.now();
    
    try {
      console.log(`🔍 Starting complexity analysis for ${filePaths.length} files...`);

      // Get current session
      const sessionId = await getCurrentSession();

      // Validate project and files
      const validFiles = await this.validateAndFilterFiles(projectId, filePaths);
      if (validFiles.length === 0) {
        throw new Error('No valid files to analyze');
      }

      // Create analysis session
      const analysisSessionId = await this.createAnalysisSession(projectId, sessionId, trigger, commitSha);

      // Initialize result structure
      const result: ComplexityAnalysisResult = {
        analysisSessionId,
        projectId,
        analysisTimestamp: new Date(),
        executionTimeMs: 0,
        analyzerVersion: 'tc015_v1.0',
        commitSha,
        analysisTrigger: trigger,
        filesAnalyzed: validFiles.length,
        functionsAnalyzed: 0,
        classesAnalyzed: 0,
        complexityMetricsCalculated: 0,
        totalComplexityScore: 0,
        avgComplexityScore: 0,
        maxComplexityScore: 0,
        cyclomaticMetrics: [],
        cognitiveMetrics: [],
        halsteadMetrics: [],
        dependencyMetrics: [],
        fileSummaries: [],
        hotspotsIdentified: [],
        refactoringOpportunities: [],
        complexityAlerts: [],
        analysisCompletenessScore: 0,
        confidenceScore: 0,
        dataFreshnessHours: 0,
        success: false,
        errors: []
      };

      // Check performance timeout early
      if (Date.now() - startTime > this.config.analysisTimeoutMs) {
        result.errors.push('Analysis timeout exceeded before processing');
        return result;
      }

      // Process files in batches to maintain performance
      const batchSize = Math.min(this.config.maxFilesPerBatch, validFiles.length);
      
      for (let i = 0; i < validFiles.length; i += batchSize) {
        const batch = validFiles.slice(i, i + batchSize);
        
        try {
          const batchResult = await this.analyzeFileBatch(batch, analysisSessionId, projectId);
          
          // Merge batch results
          result.cyclomaticMetrics.push(...batchResult.cyclomaticMetrics);
          result.cognitiveMetrics.push(...batchResult.cognitiveMetrics);
          result.halsteadMetrics.push(...batchResult.halsteadMetrics);
          result.dependencyMetrics.push(...batchResult.dependencyMetrics);
          result.fileSummaries.push(...batchResult.fileSummaries);
          
          result.functionsAnalyzed += batchResult.functionsAnalyzed;
          result.classesAnalyzed += batchResult.classesAnalyzed;
          result.complexityMetricsCalculated += batchResult.complexityMetricsCalculated;
          
        } catch (error) {
          result.errors.push(`Batch ${Math.floor(i / batchSize) + 1} analysis failed: ${error}`);
        }
        
        // Check timeout between batches
        if (Date.now() - startTime > this.config.analysisTimeoutMs) {
          result.errors.push('Analysis timeout exceeded during batch processing');
          break;
        }
      }

      // Calculate summary metrics
      if (result.fileSummaries.length > 0) {
        result.totalComplexityScore = result.fileSummaries.reduce((sum, f) => sum + f.overallComplexityScore, 0);
        result.avgComplexityScore = result.totalComplexityScore / result.fileSummaries.length;
        result.maxComplexityScore = Math.max(...result.fileSummaries.map(f => f.overallComplexityScore));
      }

      // Identify hotspots and opportunities
      result.hotspotsIdentified = await this.identifyComplexityHotspots(result, analysisSessionId);
      result.refactoringOpportunities = await this.identifyRefactoringOpportunities(result, analysisSessionId);

      // Generate alerts
      result.complexityAlerts = await this.generateComplexityAlerts(result);

      // Calculate quality metrics
      result.analysisCompletenessScore = result.errors.length === 0 ? 1.0 : Math.max(0.5, 1 - (result.errors.length / validFiles.length));
      result.confidenceScore = this.calculateOverallConfidence(result);
      result.dataFreshnessHours = 0; // Real-time analysis

      result.executionTimeMs = Date.now() - startTime;
      result.success = result.errors.length === 0 && result.fileSummaries.length > 0;

      // Store all results in database
      await this.storeAnalysisResults(result);

      // Update analysis session
      await this.updateAnalysisSession(analysisSessionId, result);

      // Update performance metrics
      this.updatePerformanceMetrics(result);

      // Log completion
      await logEvent({
        actor: 'system',
        event_type: 'complexity_analysis_completed',
        status: result.success ? 'closed' : 'error',
        metadata: {
          executionTimeMs: result.executionTimeMs,
          filesAnalyzed: result.filesAnalyzed,
          functionsAnalyzed: result.functionsAnalyzed,
          hotspotsIdentified: result.hotspotsIdentified.length,
          alertsGenerated: result.complexityAlerts.length,
          avgComplexityScore: result.avgComplexityScore,
          errors: result.errors
        },
        tags: ['complexity', 'analysis', 'completed']
      });

      console.log(`✅ Complexity analysis completed in ${result.executionTimeMs}ms`);
      console.log(`📊 Analyzed ${result.filesAnalyzed} files, ${result.functionsAnalyzed} functions`);
      console.log(`🔥 Identified ${result.hotspotsIdentified.length} hotspots, ${result.complexityAlerts.length} alerts`);

      return result;

    } catch (error) {
      console.error('❌ Complexity analysis failed:', error);
      const errorResult: ComplexityAnalysisResult = {
        analysisSessionId: '',
        projectId,
        analysisTimestamp: new Date(),
        executionTimeMs: Date.now() - startTime,
        analyzerVersion: 'tc015_v1.0',
        commitSha,
        analysisTrigger: trigger,
        filesAnalyzed: 0,
        functionsAnalyzed: 0,
        classesAnalyzed: 0,
        complexityMetricsCalculated: 0,
        totalComplexityScore: 0,
        avgComplexityScore: 0,
        maxComplexityScore: 0,
        cyclomaticMetrics: [],
        cognitiveMetrics: [],
        halsteadMetrics: [],
        dependencyMetrics: [],
        fileSummaries: [],
        hotspotsIdentified: [],
        refactoringOpportunities: [],
        complexityAlerts: [],
        analysisCompletenessScore: 0,
        confidenceScore: 0,
        dataFreshnessHours: 0,
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
      return errorResult;
    }
  }

  /**
   * Analyze complexity for git commits (triggered by git events)
   */
  async analyzeComplexityForCommits(commitShas: string[]): Promise<ComplexityAnalysisResult | null> {
    if (!this.config.autoAnalyzeOnCommit || !this.isRunning) {
      return null;
    }

    try {
      // Get files changed in commits
      const changedFilesQuery = `
        SELECT DISTINCT gfc.file_path, gc.project_id, gc.commit_sha
        FROM git_commits gc
        JOIN git_file_changes gfc ON gc.id = gfc.commit_id
        WHERE gc.commit_sha = ANY($1)
        AND gfc.change_type != 'deleted'
      `;
      
      const result = await db.query(changedFilesQuery, [commitShas]);
      const changedFiles = result.rows;

      if (changedFiles.length === 0) {
        return null;
      }

      // Group by project
      const projectFiles: Map<string, { files: string[], commitSha: string }> = new Map();
      for (const file of changedFiles) {
        if (!projectFiles.has(file.project_id)) {
          projectFiles.set(file.project_id, { files: [], commitSha: file.commit_sha });
        }
        projectFiles.get(file.project_id)!.files.push(file.file_path);
      }

      // Analyze each project's changed files
      const analysisResults: ComplexityAnalysisResult[] = [];
      
      for (const [projectId, data] of Array.from(projectFiles)) {
        console.log(`⚡ Git commit triggered complexity analysis for ${data.files.length} files`);
        
        const analysisResult = await this.analyzeComplexity(
          projectId, 
          data.files, 
          'git_commit', 
          data.commitSha
        );
        
        analysisResults.push(analysisResult);
      }

      // Return the result for the largest batch (most representative)
      return analysisResults.reduce((largest, current) => 
        current.filesAnalyzed > largest.filesAnalyzed ? current : largest
      );

    } catch (error) {
      console.error('❌ Git commit complexity analysis failed:', error);
      return null;
    }
  }

  /**
   * Get complexity trends for a project over time
   */
  async getComplexityTrends(
    projectId: string,
    filePath?: string,
    complexityType: 'cyclomatic' | 'cognitive' | 'halstead_effort' | 'coupling' | 'overall' = 'overall',
    days: number = 30
  ): Promise<any[]> {
    try {
      const startDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
      
      let whereClause = 'WHERE project_id = $1 AND measurement_date >= $2';
      let queryParams: any[] = [projectId, startDate];
      let paramIndex = 3;

      if (filePath) {
        whereClause += ` AND file_path = $${paramIndex}`;
        queryParams.push(filePath);
        paramIndex++;
      }

      whereClause += ` AND complexity_type = $${paramIndex}`;
      queryParams.push(complexityType);

      const trendsQuery = `
        SELECT 
          measurement_date,
          file_path,
          complexity_value,
          moving_average,
          trend_direction,
          trend_slope,
          anomaly_score,
          is_anomaly,
          change_point_detected,
          forecast_next_week,
          forecast_confidence
        FROM complexity_trends
        ${whereClause}
        ORDER BY measurement_date ASC
      `;

      const result = await db.query(trendsQuery, queryParams);
      return result.rows;

    } catch (error) {
      console.error('❌ Failed to get complexity trends:', error);
      return [];
    }
  }

  /**
   * Get active complexity alerts for a project
   */
  async getActiveComplexityAlerts(
    projectId: string,
    severities?: ('info' | 'warning' | 'error' | 'critical')[],
    limit: number = 20
  ): Promise<any[]> {
    try {
      let whereClause = 'WHERE project_id = $1 AND status IN (\'open\', \'acknowledged\')';
      let queryParams: any[] = [projectId];
      let paramIndex = 2;

      if (severities && severities.length > 0) {
        whereClause += ` AND violation_severity = ANY($${paramIndex})`;
        queryParams.push(severities);
        paramIndex++;
      }

      const alertsQuery = `
        SELECT 
          id, alert_type, complexity_type, file_path, function_name,
          current_value, threshold_value, violation_magnitude, violation_severity,
          title, description, immediate_actions, recommended_actions,
          estimated_effort_hours, triggered_at, status, priority
        FROM complexity_alerts
        ${whereClause}
        ORDER BY 
          CASE violation_severity 
            WHEN 'critical' THEN 1 
            WHEN 'error' THEN 2 
            WHEN 'warning' THEN 3 
            ELSE 4 
          END,
          priority ASC,
          triggered_at DESC
        LIMIT $${paramIndex}
      `;

      queryParams.push(limit);

      const result = await db.query(alertsQuery, queryParams);
      return result.rows;

    } catch (error) {
      console.error('❌ Failed to get complexity alerts:', error);
      return [];
    }
  }

  /**
   * Get refactoring opportunities for a project
   */
  async getRefactoringOpportunities(
    projectId: string,
    minRoiScore: number = 0.5,
    limit: number = 10
  ): Promise<any[]> {
    try {
      const opportunitiesQuery = `
        SELECT 
          file_path, class_name, function_name, opportunity_type,
          current_complexity_score, estimated_complexity_reduction,
          refactoring_effort_hours, roi_score, priority_score,
          description, refactoring_steps, urgency_level, status
        FROM refactoring_opportunities
        WHERE project_id = $1 
        AND roi_score >= $2
        AND status IN ('identified', 'planned')
        ORDER BY roi_score DESC, priority_score DESC
        LIMIT $3
      `;

      const result = await db.query(opportunitiesQuery, [projectId, minRoiScore, limit]);
      return result.rows;

    } catch (error) {
      console.error('❌ Failed to get refactoring opportunities:', error);
      return [];
    }
  }

  /**
   * Private method implementations
   */

  private initializeLanguageAnalyzers(): void {
    // Initialize TypeScript/JavaScript analyzer
    this.languageAnalyzers.set('typescript', new TypeScriptComplexityAnalyzer());
    this.languageAnalyzers.set('javascript', new TypeScriptComplexityAnalyzer()); // Same analyzer
    
    // Additional language analyzers would be added here
    // this.languageAnalyzers.set('python', new PythonComplexityAnalyzer());
    // this.languageAnalyzers.set('java', new JavaComplexityAnalyzer());
  }

  private async validateAndFilterFiles(_projectId: string, filePaths: string[]): Promise<string[]> {
    const validFiles: string[] = [];

    for (const filePath of filePaths) {
      try {
        // Check if file exists
        if (!existsSync(filePath)) {
          continue;
        }

        // Check file extension
        const ext = extname(filePath);
        if (!this.config.supportedFileTypes.includes(ext)) {
          continue;
        }

        // Check exclude patterns
        const isExcluded = this.config.excludePatterns.some(pattern => 
          filePath.includes(pattern)
        );
        if (isExcluded) {
          continue;
        }

        validFiles.push(filePath);

      } catch (error) {
        console.warn(`⚠️ Failed to validate file ${filePath}:`, error);
      }
    }

    return validFiles;
  }

  private async analyzeFileBatch(
    filePaths: string[],
    _analysisSessionId: string,
    _projectId: string
  ): Promise<{
    cyclomaticMetrics: CyclomaticComplexityMetric[];
    cognitiveMetrics: CognitiveComplexityMetric[];
    halsteadMetrics: HalsteadComplexityMetric[];
    dependencyMetrics: DependencyComplexityMetric[];
    fileSummaries: FileComplexitySummary[];
    functionsAnalyzed: number;
    classesAnalyzed: number;
    complexityMetricsCalculated: number;
  }> {
    
    const batchResult = {
      cyclomaticMetrics: [] as CyclomaticComplexityMetric[],
      cognitiveMetrics: [] as CognitiveComplexityMetric[],
      halsteadMetrics: [] as HalsteadComplexityMetric[],
      dependencyMetrics: [] as DependencyComplexityMetric[],
      fileSummaries: [] as FileComplexitySummary[],
      functionsAnalyzed: 0,
      classesAnalyzed: 0,
      complexityMetricsCalculated: 0
    };

    for (const filePath of filePaths) {
      try {
        const fileExt = extname(filePath);
        let analyzer: LanguageComplexityAnalyzer | undefined;

        // Select appropriate analyzer
        if (['.ts', '.tsx', '.js', '.jsx'].includes(fileExt)) {
          analyzer = this.languageAnalyzers.get('typescript');
        }

        if (!analyzer) {
          console.warn(`⚠️ No analyzer available for file type: ${fileExt}`);
          continue;
        }

        // Read file content
        const code = readFileSync(filePath, 'utf-8');
        
        // Analyze with selected analyzer
        const cyclomaticMetrics = analyzer.analyzeCyclomaticComplexity(code, filePath);
        const cognitiveMetrics = analyzer.analyzeCognitiveComplexity(code, filePath);
        const halsteadMetrics = analyzer.analyzeHalsteadComplexity(code, filePath);
        const dependencyMetrics = analyzer.analyzeDependencyComplexity(code, filePath);

        // Create file summary
        const fileSummary = this.createFileSummary(
          filePath, 
          cyclomaticMetrics, 
          cognitiveMetrics, 
          halsteadMetrics, 
          dependencyMetrics
        );

        // Add to batch results
        batchResult.cyclomaticMetrics.push(...cyclomaticMetrics);
        batchResult.cognitiveMetrics.push(...cognitiveMetrics);
        batchResult.halsteadMetrics.push(...halsteadMetrics);
        batchResult.dependencyMetrics.push(...dependencyMetrics);
        batchResult.fileSummaries.push(fileSummary);

        batchResult.functionsAnalyzed += cyclomaticMetrics.length;
        batchResult.classesAnalyzed += halsteadMetrics.filter(m => m.scopeType === 'class').length;
        batchResult.complexityMetricsCalculated += 
          cyclomaticMetrics.length + cognitiveMetrics.length + 
          halsteadMetrics.length + dependencyMetrics.length;

      } catch (error) {
        console.error(`❌ Failed to analyze file ${filePath}:`, error);
      }
    }

    return batchResult;
  }

  private createFileSummary(
    filePath: string,
    cyclomaticMetrics: CyclomaticComplexityMetric[],
    cognitiveMetrics: CognitiveComplexityMetric[],
    halsteadMetrics: HalsteadComplexityMetric[],
    dependencyMetrics: DependencyComplexityMetric[]
  ): FileComplexitySummary {
    // Calculate aggregated metrics
    const avgCyclomatic = cyclomaticMetrics.length > 0 ? 
      cyclomaticMetrics.reduce((sum, m) => sum + m.cyclomaticComplexity, 0) / cyclomaticMetrics.length : 0;
    
    const maxCyclomatic = cyclomaticMetrics.length > 0 ? 
      Math.max(...cyclomaticMetrics.map(m => m.cyclomaticComplexity)) : 0;
    
    const totalCognitive = cognitiveMetrics.reduce((sum, m) => sum + m.cognitiveComplexity, 0);
    const avgCognitive = cognitiveMetrics.length > 0 ? totalCognitive / cognitiveMetrics.length : 0;
    
    const fileHalstead = halsteadMetrics.find(m => m.scopeType === 'file');
    const maintainabilityIndex = fileHalstead?.maintainabilityIndex || 100;
    
    const avgCoupling = dependencyMetrics.length > 0 ?
      dependencyMetrics.reduce((sum, m) => sum + m.couplingFactor, 0) / dependencyMetrics.length : 0;
    
    const avgCohesion = dependencyMetrics.length > 0 ?
      dependencyMetrics.reduce((sum, m) => sum + m.cohesionScore, 0) / dependencyMetrics.length : 1.0;

    // Calculate overall complexity score using weights
    const weights = this.config.complexityWeights;
    const overallScore = 
      (avgCyclomatic / 20) * weights.cyclomatic +
      (avgCognitive / 30) * weights.cognitive +
      ((fileHalstead?.effort || 0) / 10000) * weights.halstead +
      avgCoupling * weights.coupling +
      (Math.max(...cyclomaticMetrics.map(m => m.nestingDepth)) / 10) * weights.nesting +
      ((100 - maintainabilityIndex) / 100) * weights.maintainability;

    // Determine complexity grade and risk level
    const complexityGrade = this.calculateComplexityGrade(overallScore);
    const riskLevel = this.calculateRiskLevel(overallScore, avgCyclomatic, avgCognitive);
    
    // Determine if it's a hotspot (placeholder - would integrate with git data)
    const isHotspot = overallScore > 0.6 || maxCyclomatic > 30;
    const hotspotScore = isHotspot ? Math.min(overallScore * 1.5, 1.0) : 0;
    
    // Calculate refactoring priority
    const refactoringPriority = this.calculateRefactoringPriority(overallScore, maxCyclomatic);
    
    // Estimate technical debt in minutes
    const technicalDebtMinutes = Math.round(overallScore * 120 + Math.max(0, maxCyclomatic - 10) * 15);

    return {
      filePath,
      fileType: extname(filePath),
      linesOfCode: 0, // Would be calculated from code analysis
      linesOfComments: 0, // Would be calculated from code analysis
      totalFunctions: cyclomaticMetrics.length,
      totalClasses: halsteadMetrics.filter(m => m.scopeType === 'class').length,
      avgCyclomaticComplexity: Math.round(avgCyclomatic * 100) / 100,
      maxCyclomaticComplexity: maxCyclomatic,
      totalCognitiveComplexity: totalCognitive,
      avgCognitiveComplexity: Math.round(avgCognitive * 100) / 100,
      totalHalsteadVolume: fileHalstead?.volume || 0,
      maintainabilityIndex: Math.round(maintainabilityIndex * 100) / 100,
      couplingScore: Math.round(avgCoupling * 1000) / 1000,
      cohesionScore: Math.round(avgCohesion * 1000) / 1000,
      overallComplexityScore: Math.round(overallScore * 1000) / 1000,
      complexityGrade,
      riskLevel,
      isComplexityHotspot: isHotspot,
      hotspotScore: Math.round(hotspotScore * 1000) / 1000,
      refactoringPriority,
      technicalDebtMinutes
    };
  }

  private calculateComplexityGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score <= 0.2) return 'A';
    if (score <= 0.4) return 'B';
    if (score <= 0.6) return 'C';
    if (score <= 0.8) return 'D';
    return 'F';
  }

  private calculateRiskLevel(
    overallScore: number, 
    avgCyclomatic: number, 
    avgCognitive: number
  ): 'very_low' | 'low' | 'moderate' | 'high' | 'very_high' | 'critical' {
    const cyclomaticRisk = avgCyclomatic > 50 ? 'critical' : 
                          avgCyclomatic > 30 ? 'very_high' :
                          avgCyclomatic > 20 ? 'high' :
                          avgCyclomatic > 10 ? 'moderate' : 'low';
    
    const cognitiveRisk = avgCognitive > 80 ? 'critical' :
                         avgCognitive > 50 ? 'very_high' :
                         avgCognitive > 30 ? 'high' :
                         avgCognitive > 15 ? 'moderate' : 'low';
    
    const overallRisk = overallScore > 0.8 ? 'critical' :
                       overallScore > 0.6 ? 'very_high' :
                       overallScore > 0.4 ? 'high' :
                       overallScore > 0.2 ? 'moderate' : 'low';

    // Return the highest risk level
    const riskLevels = [cyclomaticRisk, cognitiveRisk, overallRisk];
    if (riskLevels.includes('critical')) return 'critical';
    if (riskLevels.includes('very_high')) return 'very_high';
    if (riskLevels.includes('high')) return 'high';
    if (riskLevels.includes('moderate')) return 'moderate';
    return 'low';
  }

  private calculateRefactoringPriority(overallScore: number, maxCyclomatic: number): 1 | 2 | 3 | 4 | 5 {
    if (overallScore > 0.8 || maxCyclomatic > 100) return 1; // Urgent
    if (overallScore > 0.6 || maxCyclomatic > 50) return 2;  // High
    if (overallScore > 0.4 || maxCyclomatic > 30) return 3;  // Medium
    if (overallScore > 0.2 || maxCyclomatic > 20) return 4;  // Low
    return 5; // Very low
  }

  private async identifyComplexityHotspots(
    result: ComplexityAnalysisResult,
    _analysisSessionId: string
  ): Promise<ComplexityHotspot[]> {
    const hotspots: ComplexityHotspot[] = [];

    // Identify files with high complexity scores
    for (const file of result.fileSummaries) {
      if (file.overallComplexityScore >= 0.6 || file.isComplexityHotspot) {
        // Find the worst function in the file
        const worstCyclomatic = result.cyclomaticMetrics
          .filter(m => m.filePath === file.filePath)
          .reduce((worst, current) => 
            current.cyclomaticComplexity > worst.cyclomaticComplexity ? current : worst
          , result.cyclomaticMetrics.filter(m => m.filePath === file.filePath)[0]);

        const worstCognitive = result.cognitiveMetrics
          .filter(m => m.filePath === file.filePath)
          .reduce((worst, current) => 
            current.cognitiveComplexity > worst.cognitiveComplexity ? current : worst
          , result.cognitiveMetrics.filter(m => m.filePath === file.filePath)[0]);

        const affectedMetrics: string[] = [];
        if (file.avgCyclomaticComplexity > 20) affectedMetrics.push('cyclomatic_complexity');
        if (file.avgCognitiveComplexity > 30) affectedMetrics.push('cognitive_complexity');
        if (file.maintainabilityIndex < 70) affectedMetrics.push('maintainability_index');
        if (file.couplingScore > 0.5) affectedMetrics.push('coupling');

        const recommendations: string[] = [];
        if (worstCyclomatic && worstCyclomatic.cyclomaticComplexity > 30) {
          recommendations.push(`Break down ${worstCyclomatic.functionName} function (complexity: ${worstCyclomatic.cyclomaticComplexity})`);
        }
        if (worstCognitive && worstCognitive.cognitiveComplexity > 50) {
          recommendations.push(`Simplify logic in ${worstCognitive.functionName} (cognitive complexity: ${worstCognitive.cognitiveComplexity})`);
        }
        if (file.couplingScore > 0.5) {
          recommendations.push('Reduce dependencies and improve decoupling');
        }
        if (recommendations.length === 0) {
          recommendations.push('Consider refactoring to improve maintainability');
        }

        hotspots.push({
          filePath: file.filePath,
          functionName: worstCyclomatic?.functionName || worstCognitive?.functionName,
          className: worstCyclomatic?.className || worstCognitive?.className,
          hotspotType: file.couplingScore > 0.5 ? 'coupling_hotspot' : 'high_complexity',
          complexityScore: file.overallComplexityScore,
          changeFrequency: 0, // Would be populated from git data
          hotspotScore: file.hotspotScore,
          riskLevel: file.riskLevel === 'very_low' || file.riskLevel === 'low' || file.riskLevel === 'moderate' ? 'high' : file.riskLevel,
          affectedMetrics,
          recommendations,
          urgencyLevel: file.refactoringPriority <= 2 ? 'urgent' : file.refactoringPriority === 3 ? 'high' : 'medium'
        });
      }
    }

    return hotspots;
  }

  private async identifyRefactoringOpportunities(
    result: ComplexityAnalysisResult,
    _analysisSessionId: string
  ): Promise<RefactoringOpportunity[]> {
    const opportunities: RefactoringOpportunity[] = [];

    // Analyze cyclomatic complexity for refactoring opportunities
    for (const metric of result.cyclomaticMetrics) {
      if (metric.cyclomaticComplexity > 20) {
        const opportunityType = metric.cyclomaticComplexity > 50 ? 'split_function' :
                               metric.nestingDepth > 4 ? 'reduce_nesting' :
                               metric.decisionPoints > 15 ? 'simplify_conditionals' :
                               'extract_method';

        const currentScore = metric.cyclomaticComplexity / 10; // Normalize to 0-10 scale
        const estimatedReduction = Math.min(currentScore * 0.6, currentScore - 1); // 60% reduction or -1 minimum
        
        const effortMultiplier = opportunityType === 'split_function' ? 2.5 :
                                opportunityType === 'reduce_nesting' ? 1.5 :
                                1.0;
        
        const refactoringEffort = Math.max(1, Math.round(metric.cyclomaticComplexity * 0.1 * effortMultiplier));
        const priorityScore = estimatedReduction * (100 - refactoringEffort) / 100;
        const roiScore = estimatedReduction / Math.max(refactoringEffort, 1);

        const refactoringSteps: string[] = [];
        if (opportunityType === 'extract_method') {
          refactoringSteps.push('Identify logical code blocks that can be extracted');
          refactoringSteps.push('Create new methods with clear single responsibilities');
          refactoringSteps.push('Update unit tests for extracted methods');
        } else if (opportunityType === 'split_function') {
          refactoringSteps.push('Analyze function responsibilities');
          refactoringSteps.push('Split into multiple focused functions');
          refactoringSteps.push('Create integration tests for new function interactions');
        } else if (opportunityType === 'reduce_nesting') {
          refactoringSteps.push('Apply early return patterns');
          refactoringSteps.push('Extract nested logic into separate methods');
          refactoringSteps.push('Use guard clauses to reduce indentation');
        } else {
          refactoringSteps.push('Simplify conditional expressions');
          refactoringSteps.push('Consider using strategy pattern for complex conditions');
          refactoringSteps.push('Extract boolean methods for complex conditions');
        }

        opportunities.push({
          filePath: metric.filePath,
          className: metric.className,
          functionName: metric.functionName,
          startLine: metric.startLine,
          endLine: metric.endLine,
          opportunityType,
          currentComplexityScore: currentScore,
          estimatedComplexityReduction: estimatedReduction,
          refactoringEffortHours: refactoringEffort,
          priorityScore: Math.round(priorityScore * 1000) / 1000,
          roiScore: Math.round(roiScore * 1000) / 1000,
          description: `${opportunityType.replace('_', ' ')} to reduce cyclomatic complexity from ${metric.cyclomaticComplexity} to ~${Math.round(metric.cyclomaticComplexity * 0.4)}`,
          refactoringSteps,
          blockedBy: metric.cyclomaticComplexity > 100 ? ['Requires design review', 'May need architecture changes'] : []
        });
      }
    }

    // Analyze cognitive complexity for additional opportunities
    for (const metric of result.cognitiveMetrics) {
      if (metric.cognitiveComplexity > 30 && metric.refactoringBenefitScore > 0.5) {
        // Only add if not already covered by cyclomatic analysis
        const existingOpportunity = opportunities.find(o => 
          o.filePath === metric.filePath && o.functionName === metric.functionName
        );

        if (!existingOpportunity) {
          const opportunityType = metric.maxNestingLevel > 5 ? 'reduce_nesting' :
                                 metric.ifStatements > 10 ? 'simplify_conditionals' :
                                 'extract_method';

          const currentScore = metric.cognitiveComplexity / 15; // Normalize
          const estimatedReduction = currentScore * metric.refactoringBenefitScore;
          const refactoringEffort = Math.max(1, Math.round(metric.cognitiveComplexity * 0.08));
          
          opportunities.push({
            filePath: metric.filePath,
            className: metric.className,
            functionName: metric.functionName,
            startLine: metric.startLine,
            endLine: metric.endLine,
            opportunityType,
            currentComplexityScore: currentScore,
            estimatedComplexityReduction: estimatedReduction,
            refactoringEffortHours: refactoringEffort,
            priorityScore: estimatedReduction * (100 - refactoringEffort) / 100,
            roiScore: estimatedReduction / refactoringEffort,
            description: `Reduce cognitive complexity from ${metric.cognitiveComplexity} to improve readability`,
            refactoringSteps: ['Simplify nested logic', 'Extract complex conditions', 'Improve variable naming'],
            blockedBy: []
          });
        }
      }
    }

    // Sort opportunities by ROI score
    return opportunities
      .sort((a, b) => b.roiScore - a.roiScore)
      .slice(0, 20); // Limit to top 20 opportunities
  }

  private async generateComplexityAlerts(result: ComplexityAnalysisResult): Promise<ComplexityAlert[]> {
    const alerts: ComplexityAlert[] = [];

    if (!this.config.alertOnThresholdBreach) {
      return alerts;
    }

    // Check cyclomatic complexity thresholds
    for (const metric of result.cyclomaticMetrics) {
      if (metric.cyclomaticComplexity >= this.config.cyclomaticComplexityThresholds.critical) {
        alerts.push({
          alertType: 'threshold_exceeded',
          complexityType: 'cyclomatic',
          filePath: metric.filePath,
          functionName: metric.functionName,
          currentValue: metric.cyclomaticComplexity,
          thresholdValue: this.config.cyclomaticComplexityThresholds.critical,
          violationMagnitude: metric.cyclomaticComplexity - this.config.cyclomaticComplexityThresholds.critical,
          severity: 'critical',
          title: `Critical Cyclomatic Complexity: ${metric.functionName}`,
          description: `Function ${metric.functionName} has cyclomatic complexity of ${metric.cyclomaticComplexity}, exceeding critical threshold of ${this.config.cyclomaticComplexityThresholds.critical}`,
          immediateActions: [
            'Review function for immediate refactoring',
            'Add comprehensive unit tests',
            'Consider breaking into smaller functions'
          ],
          recommendedActions: [
            'Apply extract method refactoring',
            'Reduce nested conditionals',
            'Implement guard clauses'
          ],
          estimatedEffortHours: Math.max(2, Math.round(metric.cyclomaticComplexity * 0.15))
        });
      }
    }

    // Check cognitive complexity thresholds
    for (const metric of result.cognitiveMetrics) {
      if (metric.cognitiveComplexity >= this.config.cognitiveComplexityThresholds.veryHigh) {
        const severity = metric.cognitiveComplexity >= this.config.cognitiveComplexityThresholds.critical ? 'critical' : 'error';
        
        alerts.push({
          alertType: 'threshold_exceeded',
          complexityType: 'cognitive',
          filePath: metric.filePath,
          functionName: metric.functionName,
          currentValue: metric.cognitiveComplexity,
          thresholdValue: this.config.cognitiveComplexityThresholds.veryHigh,
          violationMagnitude: metric.cognitiveComplexity - this.config.cognitiveComplexityThresholds.veryHigh,
          severity,
          title: `High Cognitive Complexity: ${metric.functionName}`,
          description: `Function ${metric.functionName} has cognitive complexity of ${metric.cognitiveComplexity}, making it difficult to understand and maintain`,
          immediateActions: [
            'Review function for readability issues',
            'Consider pair programming for maintenance',
            'Document complex logic thoroughly'
          ],
          recommendedActions: [
            'Simplify nested conditions',
            'Extract complex expressions into well-named variables',
            'Break down into smaller, focused functions'
          ],
          estimatedEffortHours: Math.round(metric.cognitiveComplexity * 0.1)
        });
      }
    }

    // Check Halstead effort thresholds
    for (const metric of result.halsteadMetrics) {
      if (metric.effort >= this.config.halsteadEffortThresholds.veryHigh) {
        const severity = metric.effort >= this.config.halsteadEffortThresholds.critical ? 'critical' : 'warning';
        
        alerts.push({
          alertType: 'threshold_exceeded',
          complexityType: 'halstead',
          filePath: metric.filePath,
          functionName: metric.functionName,
          currentValue: metric.effort,
          thresholdValue: this.config.halsteadEffortThresholds.veryHigh,
          violationMagnitude: metric.effort - this.config.halsteadEffortThresholds.veryHigh,
          severity,
          title: `High Halstead Effort: ${metric.functionName || metric.scopeType}`,
          description: `${metric.scopeType} has Halstead effort of ${Math.round(metric.effort)}, indicating high implementation difficulty`,
          immediateActions: [
            'Review for potential simplification',
            'Ensure adequate test coverage',
            'Consider code review by senior developer'
          ],
          recommendedActions: [
            'Reduce vocabulary complexity',
            'Simplify operators and operands',
            'Extract complex calculations'
          ],
          estimatedEffortHours: Math.round(metric.effort / 10000)
        });
      }
    }

    // Check overall file complexity for hotspot alerts
    if (this.config.alertOnHotspotDetection) {
      for (const file of result.fileSummaries) {
        if (file.isComplexityHotspot && file.riskLevel === 'critical') {
          alerts.push({
            alertType: 'hotspot_detected',
            complexityType: 'overall',
            filePath: file.filePath,
            currentValue: file.overallComplexityScore,
            thresholdValue: 0.6,
            violationMagnitude: file.overallComplexityScore - 0.6,
            severity: 'error',
            title: `Complexity Hotspot Detected: ${basename(file.filePath)}`,
            description: `File ${basename(file.filePath)} is a complexity hotspot with overall score ${file.overallComplexityScore.toFixed(3)} and ${file.technicalDebtMinutes} minutes of technical debt`,
            immediateActions: [
              'Prioritize for refactoring sprint',
              'Increase test coverage',
              'Add code review requirements'
            ],
            recommendedActions: [
              'Break down into smaller modules',
              'Apply single responsibility principle',
              'Consider architectural refactoring'
            ],
            estimatedEffortHours: Math.round(file.technicalDebtMinutes / 60)
          });
        }
      }
    }

    return alerts;
  }

  private calculateOverallConfidence(result: ComplexityAnalysisResult): number {
    if (result.filesAnalyzed === 0) return 0;

    // Base confidence on analysis completeness and error rate
    const completenessScore = result.analysisCompletenessScore;
    const errorFactor = Math.max(0, 1 - (result.errors.length * 0.1));
    const metricsDensity = result.complexityMetricsCalculated / Math.max(result.filesAnalyzed, 1);
    const metricsDensityScore = Math.min(1, metricsDensity / 10); // Expect ~10 metrics per file

    return Math.max(0, Math.min(1, completenessScore * errorFactor * 0.6 + metricsDensityScore * 0.4));
  }

  // Database operations
  private async createAnalysisSession(
    projectId: string, 
    sessionId: string | null, 
    trigger: string, 
    commitSha?: string
  ): Promise<string> {
    const insertQuery = `
      INSERT INTO complexity_analysis_sessions (
        project_id, session_id, commit_sha, analysis_trigger, analyzer_version
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;
    
    const result = await db.query(insertQuery, [
      projectId, sessionId, commitSha, trigger, 'tc015_v1.0'
    ]);
    
    return result.rows[0].id;
  }

  private async storeAnalysisResults(result: ComplexityAnalysisResult): Promise<void> {
    try {
      // Store cyclomatic complexity metrics
      if (result.cyclomaticMetrics.length > 0) {
        await this.storeCyclomaticMetrics(result.cyclomaticMetrics, result.analysisSessionId, result.projectId);
      }

      // Store cognitive complexity metrics
      if (result.cognitiveMetrics.length > 0) {
        await this.storeCognitiveMetrics(result.cognitiveMetrics, result.analysisSessionId, result.projectId);
      }

      // Store Halstead complexity metrics
      if (result.halsteadMetrics.length > 0) {
        await this.storeHalsteadMetrics(result.halsteadMetrics, result.analysisSessionId, result.projectId);
      }

      // Store dependency complexity metrics
      if (result.dependencyMetrics.length > 0) {
        await this.storeDependencyMetrics(result.dependencyMetrics, result.analysisSessionId, result.projectId);
      }

      // Store file complexity summaries
      if (result.fileSummaries.length > 0) {
        await this.storeFileComplexitySummaries(result.fileSummaries, result.analysisSessionId, result.projectId);
      }

      // Store complexity alerts
      if (result.complexityAlerts.length > 0) {
        await this.storeComplexityAlerts(result.complexityAlerts, result.analysisSessionId, result.projectId);
      }

      // Store refactoring opportunities
      if (result.refactoringOpportunities.length > 0) {
        await this.storeRefactoringOpportunities(result.refactoringOpportunities, result.analysisSessionId, result.projectId);
      }

    } catch (error) {
      console.error('❌ Failed to store analysis results:', error);
      throw error;
    }
  }

  private async storeCyclomaticMetrics(
    metrics: CyclomaticComplexityMetric[], 
    sessionId: string, 
    projectId: string
  ): Promise<void> {
    if (metrics.length === 0) return;

    const values = metrics.flatMap(m => [
      sessionId, projectId, m.filePath, m.className, m.functionName, m.functionSignature,
      m.startLine, m.endLine, m.cyclomaticComplexity, m.essentialComplexity, m.designComplexity,
      m.complexityGrade, m.riskLevel, m.decisionPoints, m.nestingDepth, m.logicalOperators, m.testingEffortEstimate
    ]);

    const placeholders = metrics.map((_, i) => 
      `($${i * 17 + 1}, $${i * 17 + 2}, $${i * 17 + 3}, $${i * 17 + 4}, $${i * 17 + 5}, $${i * 17 + 6}, $${i * 17 + 7}, $${i * 17 + 8}, $${i * 17 + 9}, $${i * 17 + 10}, $${i * 17 + 11}, $${i * 17 + 12}, $${i * 17 + 13}, $${i * 17 + 14}, $${i * 17 + 15}, $${i * 17 + 16}, $${i * 17 + 17})`
    ).join(', ');

    const insertQuery = `
      INSERT INTO cyclomatic_complexity_metrics (
        analysis_session_id, project_id, file_path, class_name, function_name, function_signature,
        start_line, end_line, cyclomatic_complexity, essential_complexity, design_complexity,
        complexity_grade, risk_level, decision_points, nesting_depth, logical_operators, testing_effort_estimate
      ) VALUES ${placeholders}
    `;

    await db.query(insertQuery, values);
  }

  private async storeCognitiveMetrics(
    metrics: CognitiveComplexityMetric[], 
    sessionId: string, 
    projectId: string
  ): Promise<void> {
    if (metrics.length === 0) return;

    const values = metrics.flatMap(m => [
      sessionId, projectId, m.filePath, m.className, m.functionName, m.functionSignature,
      m.startLine, m.endLine, m.cognitiveComplexity, m.baseComplexity, m.nestingIncrement,
      m.maxNestingLevel, m.ifStatements, m.switchStatements, m.loops, m.tryCatchBlocks,
      m.readabilityScore, m.understandabilityGrade, m.mentalEffortEstimate, m.refactoringBenefitScore
    ]);

    const placeholders = metrics.map((_, i) => 
      `($${i * 20 + 1}, $${i * 20 + 2}, $${i * 20 + 3}, $${i * 20 + 4}, $${i * 20 + 5}, $${i * 20 + 6}, $${i * 20 + 7}, $${i * 20 + 8}, $${i * 20 + 9}, $${i * 20 + 10}, $${i * 20 + 11}, $${i * 20 + 12}, $${i * 20 + 13}, $${i * 20 + 14}, $${i * 20 + 15}, $${i * 20 + 16}, $${i * 20 + 17}, $${i * 20 + 18}, $${i * 20 + 19}, $${i * 20 + 20})`
    ).join(', ');

    const insertQuery = `
      INSERT INTO cognitive_complexity_metrics (
        analysis_session_id, project_id, file_path, class_name, function_name, function_signature,
        start_line, end_line, cognitive_complexity, base_complexity, nesting_increment,
        max_nesting_level, if_statements, switch_statements, loops, try_catch_blocks,
        readability_score, understandability_grade, mental_effort_estimate, refactoring_benefit_score
      ) VALUES ${placeholders}
    `;

    await db.query(insertQuery, values);
  }

  private async storeHalsteadMetrics(
    metrics: HalsteadComplexityMetric[], 
    sessionId: string, 
    projectId: string
  ): Promise<void> {
    if (metrics.length === 0) return;

    const values = metrics.flatMap(m => [
      sessionId, projectId, m.filePath, m.className, m.functionName, m.scopeType,
      m.startLine, m.endLine, m.distinctOperators, m.distinctOperands, m.totalOperators, m.totalOperands,
      m.programVocabulary, m.programLength, m.calculatedLength, m.volume, m.difficulty, m.effort,
      m.programmingTime, m.deliveredBugs, m.maintainabilityIndex, m.halsteadGrade, m.defectProbability
    ]);

    const placeholders = metrics.map((_, i) => 
      `($${i * 23 + 1}, $${i * 23 + 2}, $${i * 23 + 3}, $${i * 23 + 4}, $${i * 23 + 5}, $${i * 23 + 6}, $${i * 23 + 7}, $${i * 23 + 8}, $${i * 23 + 9}, $${i * 23 + 10}, $${i * 23 + 11}, $${i * 23 + 12}, $${i * 23 + 13}, $${i * 23 + 14}, $${i * 23 + 15}, $${i * 23 + 16}, $${i * 23 + 17}, $${i * 23 + 18}, $${i * 23 + 19}, $${i * 23 + 20}, $${i * 23 + 21}, $${i * 23 + 22}, $${i * 23 + 23})`
    ).join(', ');

    const insertQuery = `
      INSERT INTO halstead_complexity_metrics (
        analysis_session_id, project_id, file_path, class_name, function_name, scope_type,
        start_line, end_line, distinct_operators, distinct_operands, total_operators, total_operands,
        program_vocabulary, program_length, calculated_length, volume, difficulty, effort,
        programming_time, delivered_bugs, maintainability_index, halstead_grade, defect_probability
      ) VALUES ${placeholders}
    `;

    await db.query(insertQuery, values);
  }

  private async storeDependencyMetrics(
    metrics: DependencyComplexityMetric[], 
    sessionId: string, 
    projectId: string
  ): Promise<void> {
    if (metrics.length === 0) return;

    const values = metrics.flatMap(m => [
      sessionId, projectId, m.filePath, m.className, m.elementType, m.elementName,
      m.afferentCoupling, m.efferentCoupling, m.couplingFactor, m.lackOfCohesion, m.cohesionScore,
      m.directDependencies, m.circularDependencies, m.dependencyDepth, m.abstractness, m.instability,
      m.distanceFromMainSequence, m.changeImpactScore, m.rippleEffectSize, m.couplingRiskLevel, m.architecturalViolation
    ]);

    const placeholders = metrics.map((_, i) => 
      `($${i * 21 + 1}, $${i * 21 + 2}, $${i * 21 + 3}, $${i * 21 + 4}, $${i * 21 + 5}, $${i * 21 + 6}, $${i * 21 + 7}, $${i * 21 + 8}, $${i * 21 + 9}, $${i * 21 + 10}, $${i * 21 + 11}, $${i * 21 + 12}, $${i * 21 + 13}, $${i * 21 + 14}, $${i * 21 + 15}, $${i * 21 + 16}, $${i * 21 + 17}, $${i * 21 + 18}, $${i * 21 + 19}, $${i * 21 + 20}, $${i * 21 + 21})`
    ).join(', ');

    const insertQuery = `
      INSERT INTO dependency_complexity_metrics (
        analysis_session_id, project_id, file_path, class_name, element_type, element_name,
        afferent_coupling, efferent_coupling, coupling_factor, lack_of_cohesion, cohesion_score,
        direct_dependencies, circular_dependencies, dependency_depth, abstractness, instability,
        distance_from_main_sequence, change_impact_score, ripple_effect_size, coupling_risk_level, architectural_violation
      ) VALUES ${placeholders}
    `;

    await db.query(insertQuery, values);
  }

  private async storeFileComplexitySummaries(
    summaries: FileComplexitySummary[], 
    sessionId: string, 
    projectId: string
  ): Promise<void> {
    if (summaries.length === 0) return;

    const values = summaries.flatMap(s => [
      sessionId, projectId, s.filePath, s.fileType, s.linesOfCode, s.linesOfComments,
      s.totalFunctions, s.totalClasses, s.avgCyclomaticComplexity, s.maxCyclomaticComplexity,
      s.totalCognitiveComplexity, s.avgCognitiveComplexity, s.totalHalsteadVolume, s.maintainabilityIndex,
      s.couplingScore, s.cohesionScore, s.overallComplexityScore, s.complexityGrade, s.riskLevel,
      s.isComplexityHotspot, s.hotspotScore, s.refactoringPriority, s.technicalDebtMinutes
    ]);

    const placeholders = summaries.map((_, i) => 
      `($${i * 23 + 1}, $${i * 23 + 2}, $${i * 23 + 3}, $${i * 23 + 4}, $${i * 23 + 5}, $${i * 23 + 6}, $${i * 23 + 7}, $${i * 23 + 8}, $${i * 23 + 9}, $${i * 23 + 10}, $${i * 23 + 11}, $${i * 23 + 12}, $${i * 23 + 13}, $${i * 23 + 14}, $${i * 23 + 15}, $${i * 23 + 16}, $${i * 23 + 17}, $${i * 23 + 18}, $${i * 23 + 19}, $${i * 23 + 20}, $${i * 23 + 21}, $${i * 23 + 22}, $${i * 23 + 23})`
    ).join(', ');

    const insertQuery = `
      INSERT INTO file_complexity_summary (
        analysis_session_id, project_id, file_path, file_type, lines_of_code, lines_of_comments,
        total_functions, total_classes, avg_cyclomatic_complexity, max_cyclomatic_complexity,
        total_cognitive_complexity, avg_cognitive_complexity, total_halstead_volume, maintainability_index,
        coupling_score, cohesion_score, overall_complexity_score, complexity_grade, risk_level,
        is_complexity_hotspot, hotspot_score, refactoring_priority, technical_debt_minutes
      ) VALUES ${placeholders}
    `;

    await db.query(insertQuery, values);
  }

  private async storeComplexityAlerts(
    alerts: ComplexityAlert[], 
    sessionId: string, 
    projectId: string
  ): Promise<void> {
    if (alerts.length === 0) return;

    const values = alerts.flatMap(a => [
      projectId, sessionId, a.alertType, a.complexityType, a.filePath, a.functionName,
      a.currentValue, a.thresholdValue, a.violationMagnitude, a.severity,
      a.title, a.description, a.immediateActions, a.recommendedActions, a.estimatedEffortHours
    ]);

    const placeholders = alerts.map((_, i) => 
      `($${i * 15 + 1}, $${i * 15 + 2}, $${i * 15 + 3}, $${i * 15 + 4}, $${i * 15 + 5}, $${i * 15 + 6}, $${i * 15 + 7}, $${i * 15 + 8}, $${i * 15 + 9}, $${i * 15 + 10}, $${i * 15 + 11}, $${i * 15 + 12}, $${i * 15 + 13}, $${i * 15 + 14}, $${i * 15 + 15})`
    ).join(', ');

    const insertQuery = `
      INSERT INTO complexity_alerts (
        project_id, analysis_session_id, alert_type, complexity_type, file_path, function_name,
        current_value, threshold_value, violation_magnitude, violation_severity,
        title, description, immediate_actions, recommended_actions, estimated_effort_hours
      ) VALUES ${placeholders}
    `;

    await db.query(insertQuery, values);
  }

  private async storeRefactoringOpportunities(
    opportunities: RefactoringOpportunity[], 
    sessionId: string, 
    projectId: string
  ): Promise<void> {
    if (opportunities.length === 0) return;

    const values = opportunities.flatMap(o => [
      projectId, sessionId, o.filePath, o.className, o.functionName, o.startLine, o.endLine,
      o.opportunityType, o.currentComplexityScore, o.estimatedComplexityReduction, o.refactoringEffortHours,
      o.priorityScore, o.roiScore, o.description, o.refactoringSteps, o.blockedBy
    ]);

    const placeholders = opportunities.map((_, i) => 
      `($${i * 16 + 1}, $${i * 16 + 2}, $${i * 16 + 3}, $${i * 16 + 4}, $${i * 16 + 5}, $${i * 16 + 6}, $${i * 16 + 7}, $${i * 16 + 8}, $${i * 16 + 9}, $${i * 16 + 10}, $${i * 16 + 11}, $${i * 16 + 12}, $${i * 16 + 13}, $${i * 16 + 14}, $${i * 16 + 15}, $${i * 16 + 16})`
    ).join(', ');

    const insertQuery = `
      INSERT INTO refactoring_opportunities (
        project_id, analysis_session_id, file_path, class_name, function_name, start_line, end_line,
        opportunity_type, current_complexity_score, estimated_complexity_reduction, refactoring_effort_hours,
        priority_score, roi_score, description, refactoring_steps, blocked_by
      ) VALUES ${placeholders}
    `;

    await db.query(insertQuery, values);
  }

  private async updateAnalysisSession(sessionId: string, result: ComplexityAnalysisResult): Promise<void> {
    const updateQuery = `
      UPDATE complexity_analysis_sessions 
      SET 
        execution_time_ms = $2,
        files_analyzed = $3,
        functions_analyzed = $4,
        complexity_metrics_calculated = $5,
        total_complexity_score = $6,
        avg_complexity_score = $7,
        max_complexity_score = $8,
        hotspots_identified = $9,
        refactoring_opportunities = $10,
        analysis_completeness_score = $11,
        confidence_score = $12,
        data_freshness_hours = $13,
        status = $14,
        error_message = $15,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
    
    await db.query(updateQuery, [
      sessionId,
      result.executionTimeMs,
      result.filesAnalyzed,
      result.functionsAnalyzed,
      result.complexityMetricsCalculated,
      result.totalComplexityScore,
      result.avgComplexityScore,
      result.maxComplexityScore,
      result.hotspotsIdentified.length,
      result.refactoringOpportunities.length,
      result.analysisCompletenessScore,
      result.confidenceScore,
      result.dataFreshnessHours,
      result.success ? 'completed' : 'failed',
      result.errors.length > 0 ? result.errors.join('; ') : null
    ]);
  }

  private updatePerformanceMetrics(result: ComplexityAnalysisResult): void {
    this.performanceMetrics.totalAnalyses++;
    this.performanceMetrics.totalExecutionTime += result.executionTimeMs;
    this.performanceMetrics.averageExecutionTime = 
      this.performanceMetrics.totalExecutionTime / this.performanceMetrics.totalAnalyses;
    this.performanceMetrics.filesAnalyzed += result.filesAnalyzed;
    this.performanceMetrics.functionsAnalyzed += result.functionsAnalyzed;
    this.performanceMetrics.alertsGenerated += result.complexityAlerts.length;
    this.performanceMetrics.hotspotsIdentified += result.hotspotsIdentified.length;
    this.performanceMetrics.lastPerformanceCheck = new Date();
  }

  private startScheduledAnalysis(): void {
    this.scheduledTimer = setInterval(async () => {
      if (this.isRunning) {
        try {
          // Get recently active projects
          const recentProjectsQuery = `
            SELECT DISTINCT p.id, p.root_directory
            FROM projects p
            JOIN git_commits gc ON p.id = gc.project_id 
            WHERE gc.author_date >= CURRENT_TIMESTAMP - INTERVAL '1 day'
          `;
          
          const result = await db.query(recentProjectsQuery);
          const activeProjects = result.rows;

          for (const project of activeProjects) {
            // Get recently changed files
            const changedFilesQuery = `
              SELECT DISTINCT gfc.file_path
              FROM git_commits gc
              JOIN git_file_changes gfc ON gc.id = gfc.commit_id
              WHERE gc.project_id = $1
              AND gc.author_date >= CURRENT_TIMESTAMP - INTERVAL '1 day'
              AND gfc.change_type != 'deleted'
              LIMIT 20
            `;
            
            const filesResult = await db.query(changedFilesQuery, [project.id]);
            const changedFiles = filesResult.rows.map(r => r.file_path);

            if (changedFiles.length > 0) {
              await this.analyzeComplexity(project.id, changedFiles, 'scheduled');
            }
          }

        } catch (error) {
          console.error('❌ Scheduled complexity analysis failed:', error);
        }
      }
    }, this.config.scheduledAnalysisIntervalMs);

    console.log(`⏰ Started scheduled complexity analysis every ${this.config.scheduledAnalysisIntervalMs}ms`);
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return { ...this.performanceMetrics };
  }
}

/**
 * TypeScript/JavaScript Complexity Analyzer
 * Simplified implementation for TC015 demonstration
 */
class TypeScriptComplexityAnalyzer implements LanguageComplexityAnalyzer {
  fileExtensions = ['.ts', '.tsx', '.js', '.jsx'];

  analyzeCyclomaticComplexity(code: string, filePath: string): CyclomaticComplexityMetric[] {
    const metrics: CyclomaticComplexityMetric[] = [];

    // Simplified analysis - in production would use proper AST parsing
    const functions = this.extractFunctions(code);
    
    for (const func of functions) {
      const complexity = this.calculateCyclomaticComplexity(func.body);
      const grade = this.getCyclomaticGrade(complexity);
      const riskLevel = this.getCyclomaticRiskLevel(complexity);
      
      metrics.push({
        filePath,
        className: func.className,
        functionName: func.name,
        functionSignature: func.signature,
        startLine: func.startLine,
        endLine: func.endLine,
        cyclomaticComplexity: complexity,
        essentialComplexity: Math.max(1, complexity - func.structuredReductions),
        designComplexity: Math.max(1, Math.round(complexity * 0.8)),
        complexityGrade: grade,
        riskLevel: riskLevel,
        decisionPoints: func.decisionPoints,
        nestingDepth: func.maxNestingDepth,
        logicalOperators: func.logicalOperators,
        testingEffortEstimate: Math.max(1, Math.round(complexity / 3))
      });
    }
    
    return metrics;
  }

  analyzeCognitiveComplexity(code: string, filePath: string): CognitiveComplexityMetric[] {
    const metrics: CognitiveComplexityMetric[] = [];
    const functions = this.extractFunctions(code);
    
    for (const func of functions) {
      const cognitiveScore = this.calculateCognitiveComplexity(func.body);
      const readabilityScore = this.calculateReadabilityScore(func.body);
      const understandabilityGrade = this.getUnderstandabilityGrade(cognitiveScore);
      
      metrics.push({
        filePath,
        className: func.className,
        functionName: func.name,
        functionSignature: func.signature,
        startLine: func.startLine,
        endLine: func.endLine,
        cognitiveComplexity: cognitiveScore.total,
        baseComplexity: cognitiveScore.base,
        nestingIncrement: cognitiveScore.nesting,
        maxNestingLevel: func.maxNestingDepth,
        ifStatements: cognitiveScore.ifStatements,
        switchStatements: cognitiveScore.switchStatements,
        loops: cognitiveScore.loops,
        tryCatchBlocks: cognitiveScore.tryCatch,
        readabilityScore,
        understandabilityGrade,
        mentalEffortEstimate: Math.max(1, Math.round(cognitiveScore.total * 0.5)),
        refactoringBenefitScore: cognitiveScore.total > 20 ? Math.min(1, (cognitiveScore.total - 20) / 50) : 0
      });
    }
    
    return metrics;
  }

  analyzeHalsteadComplexity(code: string, filePath: string): HalsteadComplexityMetric[] {
    const metrics: HalsteadComplexityMetric[] = [];
    
    // File-level analysis
    const halsteadMetrics = this.calculateHalsteadMetrics(code);
    const grade = this.getHalsteadGrade(halsteadMetrics.effort);
    
    metrics.push({
      filePath,
      scopeType: 'file',
      startLine: 1,
      endLine: code.split('\n').length,
      distinctOperators: halsteadMetrics.n1,
      distinctOperands: halsteadMetrics.n2,
      totalOperators: halsteadMetrics.N1,
      totalOperands: halsteadMetrics.N2,
      programVocabulary: halsteadMetrics.vocabulary,
      programLength: halsteadMetrics.length,
      calculatedLength: halsteadMetrics.calculatedLength,
      volume: halsteadMetrics.volume,
      difficulty: halsteadMetrics.difficulty,
      effort: halsteadMetrics.effort,
      programmingTime: halsteadMetrics.time,
      deliveredBugs: halsteadMetrics.bugs,
      maintainabilityIndex: halsteadMetrics.maintainabilityIndex,
      halsteadGrade: grade,
      defectProbability: Math.min(1, halsteadMetrics.bugs)
    });

    // Function-level analysis
    const functions = this.extractFunctions(code);
    for (const func of functions) {
      const funcHalstead = this.calculateHalsteadMetrics(func.body);
      const funcGrade = this.getHalsteadGrade(funcHalstead.effort);
      
      metrics.push({
        filePath,
        className: func.className,
        functionName: func.name,
        scopeType: 'function',
        startLine: func.startLine,
        endLine: func.endLine,
        distinctOperators: funcHalstead.n1,
        distinctOperands: funcHalstead.n2,
        totalOperators: funcHalstead.N1,
        totalOperands: funcHalstead.N2,
        programVocabulary: funcHalstead.vocabulary,
        programLength: funcHalstead.length,
        calculatedLength: funcHalstead.calculatedLength,
        volume: funcHalstead.volume,
        difficulty: funcHalstead.difficulty,
        effort: funcHalstead.effort,
        programmingTime: funcHalstead.time,
        deliveredBugs: funcHalstead.bugs,
        maintainabilityIndex: funcHalstead.maintainabilityIndex,
        halsteadGrade: funcGrade,
        defectProbability: Math.min(1, funcHalstead.bugs)
      });
    }
    
    return metrics;
  }

  analyzeDependencyComplexity(code: string, filePath: string): DependencyComplexityMetric[] {
    const metrics: DependencyComplexityMetric[] = [];
    
    // Simplified dependency analysis
    const imports = this.extractImports(code);
    const exports = this.extractExports(code);

    // File-level dependency metrics
    const efferentCoupling = imports.length;
    const afferentCoupling = 0; // Would need project-wide analysis
    const couplingFactor = efferentCoupling * 0.1; // Simplified calculation
    
    metrics.push({
      filePath,
      elementType: 'module',
      elementName: basename(filePath),
      afferentCoupling,
      efferentCoupling,
      couplingFactor: Math.min(1, couplingFactor),
      lackOfCohesion: 0, // Would calculate LCOM
      cohesionScore: 0.8, // Default good cohesion
      directDependencies: imports.length,
      circularDependencies: 0, // Would need project-wide analysis
      dependencyDepth: 1,
      abstractness: exports.filter(e => e.type === 'interface').length / Math.max(exports.length, 1),
      instability: efferentCoupling / Math.max(efferentCoupling + afferentCoupling, 1),
      distanceFromMainSequence: 0, // Would calculate |A + I - 1|
      changeImpactScore: couplingFactor * 0.5,
      rippleEffectSize: efferentCoupling,
      couplingRiskLevel: couplingFactor > 0.6 ? 'high' : couplingFactor > 0.3 ? 'moderate' : 'low',
      architecturalViolation: false
    });
    
    return metrics;
  }

  // Helper methods for simplified analysis
  private extractFunctions(code: string): any[] {
    // Simplified function extraction - would use proper AST in production
    const functionRegex = /(?:function\s+(\w+)|(?:(\w+)\s*[:=]\s*(?:async\s+)?function)|(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{]*)?{)/g;
    const functions: any[] = [];
    let match;

    while ((match = functionRegex.exec(code)) !== null) {
      const functionName = match[1] || match[2] || match[3] || 'anonymous';
      const startLine = code.substring(0, match.index).split('\n').length;
      
      // Find function body and end
      let braceCount = 1;
      let i = match.index + match[0].length;
      while (i < code.length && braceCount > 0) {
        if (code[i] === '{') braceCount++;
        if (code[i] === '}') braceCount--;
        i++;
      }
      
      const endLine = code.substring(0, i).split('\n').length;
      const body = code.substring(match.index, i);
      
      functions.push({
        name: functionName,
        className: undefined, // Would extract class context
        signature: match[0],
        startLine,
        endLine,
        body,
        decisionPoints: this.countDecisionPoints(body),
        maxNestingDepth: this.calculateMaxNestingDepth(body),
        logicalOperators: this.countLogicalOperators(body),
        structuredReductions: 0
      });
    }
    
    return functions;
  }

  private calculateCyclomaticComplexity(code: string): number {
    let complexity = 1; // Base complexity
    
    // Count decision points
    const decisionPatterns = [
      /\bif\b/g,
      /\belse\s+if\b/g,
      /\bwhile\b/g,
      /\bfor\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /\b&&\b/g,
      /\b\|\|\b/g,
      /\?[^:]*:/g // Ternary operator
    ];
    
    for (const pattern of decisionPatterns) {
      const matches = code.match(pattern);
      complexity += matches ? matches.length : 0;
    }
    
    return complexity;
  }

  private calculateCognitiveComplexity(code: string): any {
    let total = 0;
    let base = 0;
    let nesting = 0;
    let ifStatements = 0;
    let switchStatements = 0;
    let loops = 0;
    let tryCatch = 0;
    
    // Simplified cognitive complexity calculation
    const lines = code.split('\n');
    let currentNesting = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Track nesting level
      if (trimmed.includes('{')) currentNesting++;
      if (trimmed.includes('}')) currentNesting = Math.max(0, currentNesting - 1);
      
      // Count complexity contributors
      if (trimmed.includes('if (')) {
        ifStatements++;
        base += 1;
        nesting += currentNesting;
      }
      
      if (trimmed.includes('switch (')) {
        switchStatements++;
        base += 1;
        nesting += currentNesting;
      }
      
      if (trimmed.match(/\b(for|while)\b/)) {
        loops++;
        base += 1;
        nesting += currentNesting;
      }
      
      if (trimmed.includes('catch (')) {
        tryCatch++;
        base += 1;
        nesting += currentNesting;
      }
      
      // Logical operators add to nesting
      const logicalOps = (trimmed.match(/&&|\|\|/g) || []).length;
      nesting += logicalOps * currentNesting;
    }
    
    total = base + nesting;
    
    return { total, base, nesting, ifStatements, switchStatements, loops, tryCatch };
  }

  private calculateHalsteadMetrics(code: string): any {
    // Simplified Halstead metrics - would use proper token analysis in production
    const operators = ['=', '+', '-', '*', '/', '%', '++', '--', '==', '!=', '<', '>', '<=', '>=', '&&', '||', '!', '?', ':', '{', '}', '(', ')', '[', ']', ';', ','];
    const operatorCounts: Map<string, number> = new Map();
    const operandPattern = /\b[a-zA-Z_][a-zA-Z0-9_]*\b|\b\d+\b/g;
    const operandCounts: Map<string, number> = new Map();
    
    // Count operators
    for (const op of operators) {
      const regex = new RegExp(`\\${op.split('').join('\\')}`, 'g');
      const matches = code.match(regex);
      if (matches) {
        operatorCounts.set(op, matches.length);
      }
    }
    
    // Count operands
    let match;
    while ((match = operandPattern.exec(code)) !== null) {
      const operand = match[0];
      operandCounts.set(operand, (operandCounts.get(operand) || 0) + 1);
    }
    
    const n1 = operatorCounts.size;
    const n2 = operandCounts.size;
    const N1 = Array.from(operatorCounts.values()).reduce((sum, count) => sum + count, 0);
    const N2 = Array.from(operandCounts.values()).reduce((sum, count) => sum + count, 0);
    
    const vocabulary = n1 + n2;
    const length = N1 + N2;
    const calculatedLength = n1 * Math.log2(n1) + n2 * Math.log2(n2);
    const volume = length * Math.log2(vocabulary);
    const difficulty = (n1 / 2) * (N2 / n2);
    const effort = difficulty * volume;
    const time = effort / 18; // Seconds
    const bugs = volume / 3000; // Expected delivered bugs
    
    // Simplified maintainability index
    const loc = code.split('\n').filter(line => line.trim().length > 0).length;
    const cyclomaticComplexity = this.calculateCyclomaticComplexity(code);
    const maintainabilityIndex = Math.max(0, 
      (171 - 5.2 * Math.log(volume) - 0.23 * cyclomaticComplexity - 16.2 * Math.log(loc)) * 100 / 171
    );
    
    return {
      n1, n2, N1, N2, vocabulary, length, calculatedLength, volume,
      difficulty, effort, time, bugs, maintainabilityIndex
    };
  }

  private calculateReadabilityScore(code: string): number {
    // Simplified readability score based on various factors
    const lines = code.split('\n');
    const avgLineLength = lines.reduce((sum, line) => sum + line.length, 0) / lines.length;
    const maxNesting = this.calculateMaxNestingDepth(code);
    const commentRatio = lines.filter(line => line.trim().startsWith('//')).length / lines.length;
    
    let score = 1.0;
    
    // Penalty for long lines
    if (avgLineLength > 100) score -= 0.2;
    if (avgLineLength > 150) score -= 0.2;
    
    // Penalty for deep nesting
    if (maxNesting > 4) score -= 0.3;
    if (maxNesting > 6) score -= 0.3;
    
    // Bonus for comments
    score += commentRatio * 0.2;
    
    return Math.max(0, Math.min(1, score));
  }

  private countDecisionPoints(code: string): number {
    const patterns = [/\bif\b/g, /\belse\s+if\b/g, /\bcase\b/g, /\bcatch\b/g];
    return patterns.reduce((count, pattern) => {
      const matches = code.match(pattern);
      return count + (matches ? matches.length : 0);
    }, 0);
  }

  private calculateMaxNestingDepth(code: string): number {
    let maxDepth = 0;
    let currentDepth = 0;
    
    for (const char of code) {
      if (char === '{') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === '}') {
        currentDepth = Math.max(0, currentDepth - 1);
      }
    }
    
    return maxDepth;
  }

  private countLogicalOperators(code: string): number {
    const logicalOps = code.match(/&&|\|\|/g);
    return logicalOps ? logicalOps.length : 0;
  }

  private extractImports(code: string): any[] {
    const importRegex = /import.*from\s+['"]([^'"]+)['"]/g;
    const imports: any[] = [];
    let match;
    
    while ((match = importRegex.exec(code)) !== null) {
      imports.push({ module: match[1] });
    }
    
    return imports;
  }

  private extractExports(code: string): any[] {
    const exportRegex = /export\s+(interface|class|function|const|let|var)\s+(\w+)/g;
    const exports: any[] = [];
    let match;
    
    while ((match = exportRegex.exec(code)) !== null) {
      exports.push({ type: match[1], name: match[2] });
    }
    
    return exports;
  }

  private extractClasses(code: string): any[] {
    const classRegex = /class\s+(\w+)/g;
    const classes: any[] = [];
    let match;
    
    while ((match = classRegex.exec(code)) !== null) {
      classes.push({ name: match[1] });
    }
    
    return classes;
  }

  private getCyclomaticGrade(complexity: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (complexity <= 10) return 'A';
    if (complexity <= 20) return 'B';
    if (complexity <= 50) return 'C';
    if (complexity <= 100) return 'D';
    return 'F';
  }

  private getCyclomaticRiskLevel(complexity: number): 'very_low' | 'low' | 'moderate' | 'high' | 'very_high' | 'critical' {
    if (complexity <= 10) return 'very_low';
    if (complexity <= 20) return 'low';
    if (complexity <= 50) return 'moderate';
    if (complexity <= 100) return 'high';
    if (complexity <= 200) return 'very_high';
    return 'critical';
  }

  private getUnderstandabilityGrade(cognitiveComplexity: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (cognitiveComplexity <= 15) return 'A';
    if (cognitiveComplexity <= 25) return 'B';
    if (cognitiveComplexity <= 50) return 'C';
    if (cognitiveComplexity <= 100) return 'D';
    return 'F';
  }

  private getHalsteadGrade(effort: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (effort <= 1000) return 'A';
    if (effort <= 5000) return 'B';
    if (effort <= 20000) return 'C';
    if (effort <= 50000) return 'D';
    return 'F';
  }
}

/**
 * Utility functions for external usage
 */

/**
 * Start complexity tracking service
 */
export async function startComplexityTracking(config?: Partial<ComplexityTrackerConfig>): Promise<void> {
  const tracker = ComplexityTracker.getInstance(config);
  await tracker.start();
}

/**
 * Stop complexity tracking service
 */
export async function stopComplexityTracking(): Promise<void> {
  const tracker = ComplexityTracker.getInstance();
  await tracker.stop();
}

/**
 * Analyze complexity for specific files
 */
export async function analyzeFileComplexity(
  projectId: string,
  filePaths: string[],
  trigger?: 'manual' | 'git_commit' | 'scheduled' | 'threshold_breach' | 'batch_analysis'
): Promise<ComplexityAnalysisResult> {
  const tracker = ComplexityTracker.getInstance();
  return await tracker.analyzeComplexity(projectId, filePaths, trigger);
}

/**
 * Analyze complexity triggered by git commits
 */
export async function analyzeComplexityOnCommit(commitShas: string[]): Promise<ComplexityAnalysisResult | null> {
  const tracker = ComplexityTracker.getInstance();
  return await tracker.analyzeComplexityForCommits(commitShas);
}

/**
 * Get complexity trends
 */
export async function getComplexityTrends(
  projectId: string,
  filePath?: string,
  complexityType?: 'cyclomatic' | 'cognitive' | 'halstead_effort' | 'coupling' | 'overall',
  days?: number
): Promise<any[]> {
  const tracker = ComplexityTracker.getInstance();
  return await tracker.getComplexityTrends(projectId, filePath, complexityType, days);
}

/**
 * Get active complexity alerts
 */
export async function getComplexityAlerts(
  projectId: string,
  severities?: ('info' | 'warning' | 'error' | 'critical')[],
  limit?: number
): Promise<any[]> {
  const tracker = ComplexityTracker.getInstance();
  return await tracker.getActiveComplexityAlerts(projectId, severities, limit);
}

/**
 * Get refactoring opportunities
 */
export async function getRefactoringOpportunities(
  projectId: string,
  minRoiScore?: number,
  limit?: number
): Promise<any[]> {
  const tracker = ComplexityTracker.getInstance();
  return await tracker.getRefactoringOpportunities(projectId, minRoiScore, limit);
}

/**
 * Get complexity tracking performance metrics
 */
export function getComplexityTrackingPerformance() {
  const tracker = ComplexityTracker.getInstance();
  return tracker.getPerformanceMetrics();
}

/**
 * Export the main class
 */
export default ComplexityTracker;