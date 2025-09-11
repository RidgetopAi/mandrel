/**
 * TC013: Real-time File Change Pattern Detection Service
 * 
 * Comprehensive pattern detection system that analyzes code changes in real-time
 * and identifies patterns across multiple dimensions:
 * 
 * 1. File Co-occurrence Patterns (Market Basket Analysis)
 * 2. Temporal Development Patterns (Statistical Analysis)
 * 3. Developer Behavior Patterns (Behavioral Analysis) 
 * 4. Change Magnitude Patterns (Anomaly Detection)
 * 5. Cross-Pattern Insights Generation (Meta-Analysis)
 * 
 * Performance Target: Sub-100ms detection for real-time use
 * Integration: Git tracking system, session management, TC012 schema
 */

import { db } from '../config/database.js';
import { logEvent } from '../middleware/eventLogger.js';
import { getCurrentSession } from './sessionManager.js';

// Pattern Detection Configuration
export interface PatternDetectorConfig {
  // Performance settings
  enableRealTimeDetection: boolean;
  enableBatchProcessing: boolean;
  detectionTimeoutMs: number;
  batchSizeLimit: number;
  
  // Algorithm thresholds
  cooccurrenceMinSupport: number;
  cooccurrenceMinConfidence: number;
  cooccurrenceMinLift: number;
  temporalSignificanceThreshold: number;
  developmentVelocityThreshold: number;
  magnitudeAnomalyThreshold: number;
  
  // Real-time settings
  bufferCommitsCount: number;
  patternUpdateIntervalMs: number;
  alertThresholdScore: number;
}

// Pattern Detection Results
export interface PatternDetectionResult {
  sessionId: string;
  projectId: string;
  detectionTimestamp: Date;
  executionTimeMs: number;
  
  // Algorithm execution times
  cooccurrenceTimeMs: number;
  temporalTimeMs: number;
  developerTimeMs: number;
  magnitudeTimeMs: number;
  insightsTimeMs: number;
  
  // Detection results
  cooccurrencePatterns: CooccurrencePattern[];
  temporalPatterns: TemporalPattern[];
  developerPatterns: DeveloperPattern[];
  magnitudePatterns: MagnitudePattern[];
  insights: PatternInsight[];
  
  // Metadata
  commitsAnalyzed: number;
  filesAnalyzed: number;
  totalPatternsFound: number;
  alertsGenerated: number;
  
  success: boolean;
  errors: string[];
}

// Algorithm-specific pattern interfaces
export interface CooccurrencePattern {
  filePath1: string;
  filePath2: string;
  cooccurrenceCount: number;
  supportScore: number;
  confidenceScore: number;
  liftScore: number;
  patternStrength: 'weak' | 'moderate' | 'strong' | 'very_strong';
  contributingCommits: string[];
}

export interface TemporalPattern {
  patternType: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'seasonal';
  patternStrength: number;
  statisticalSignificance: number;
  chiSquareStatistic: number;
  pValue: number;
  peakPeriods: number[];
  commitDistribution: number[];
}

export interface DeveloperPattern {
  authorEmail: string;
  authorName: string;
  specialtyFiles: string[];
  specializationScore: number;
  knowledgeBreadthScore: number;
  changeVelocity: number;
  consistencyScore: number;
  knowledgeSiloRiskScore: number;
  workPattern: 'feature_focused' | 'maintenance_focused' | 'mixed' | 'experimental';
}

export interface MagnitudePattern {
  filePath: string;
  changeCategory: 'small' | 'medium' | 'large' | 'massive';
  avgLinesPerChange: number;
  changeFrequency: number;
  volatilityScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  anomalyScore: number;
  hotspotScore: number;
  technicalDebtIndicator: number;
}

export interface PatternInsight {
  insightType: string;
  title: string;
  description: string;
  confidenceScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  businessImpact: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
  supportingPatternIds: string[];
  priority: number;
}

// Pattern alert interface
export interface PatternAlert {
  alertId: string;
  alertType: 'high_risk_pattern' | 'new_pattern_discovered' | 'pattern_anomaly' | 'pattern_insight';
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  description: string;
  recommendedActions: string[];
  affectedFiles: string[];
  confidenceScore: number;
  timestamp: Date;
  metadata: Record<string, any>;
}

const DEFAULT_CONFIG: PatternDetectorConfig = {
  enableRealTimeDetection: true,
  enableBatchProcessing: true,
  detectionTimeoutMs: 100,  // Sub-100ms target
  batchSizeLimit: 50,
  
  // TC011 validated thresholds
  cooccurrenceMinSupport: 0.1,
  cooccurrenceMinConfidence: 0.3,
  cooccurrenceMinLift: 1.5,
  temporalSignificanceThreshold: 0.7,
  developmentVelocityThreshold: 2.0,
  magnitudeAnomalyThreshold: 0.8,
  
  // Real-time settings
  bufferCommitsCount: 10,
  patternUpdateIntervalMs: 5000,
  alertThresholdScore: 0.75
};

/**
 * Real-time Pattern Detection Service
 */
export class PatternDetector {
  private static instance: PatternDetector | null = null;
  private config: PatternDetectorConfig;
  private isRunning: boolean = false;
  private updateTimer: NodeJS.Timeout | null = null;
  private commitBuffer: string[] = [];
  private lastAnalysisTime: Date = new Date();
  
  // Performance metrics
  private metrics = {
    totalDetections: 0,
    totalExecutionTime: 0,
    averageExecutionTime: 0,
    patternsDetected: 0,
    alertsGenerated: 0,
    lastPerformanceCheck: new Date()
  };

  private constructor(config: Partial<PatternDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<PatternDetectorConfig>): PatternDetector {
    if (!PatternDetector.instance) {
      PatternDetector.instance = new PatternDetector(config);
    }
    return PatternDetector.instance;
  }

  /**
   * Start pattern detection service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚡ Pattern detector already running');
      return;
    }

    try {
      console.log('🔍 Starting real-time pattern detection service...');
      
      this.isRunning = true;
      this.lastAnalysisTime = new Date();

      // Start periodic pattern updates if enabled
      if (this.config.enableRealTimeDetection) {
        this.startPeriodicUpdates();
      }

      // Log service start
      await logEvent({
        actor: 'system',
        event_type: 'pattern_detection_started',
        status: 'open',
        metadata: {
          realTimeDetection: this.config.enableRealTimeDetection,
          batchProcessing: this.config.enableBatchProcessing,
          updateInterval: this.config.patternUpdateIntervalMs,
          performanceTarget: this.config.detectionTimeoutMs
        },
        tags: ['pattern_detection', 'realtime', 'service']
      });

      console.log('✅ Pattern detection service started successfully');

    } catch (error) {
      console.error('❌ Failed to start pattern detection:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop pattern detection service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('⚡ Pattern detector not running');
      return;
    }

    try {
      console.log('🛑 Stopping pattern detection service...');

      this.isRunning = false;

      // Stop periodic updates
      if (this.updateTimer) {
        clearInterval(this.updateTimer);
        this.updateTimer = null;
      }

      // Log service stop
      await logEvent({
        actor: 'system',
        event_type: 'pattern_detection_stopped',
        status: 'closed',
        metadata: {
          totalDetections: this.metrics.totalDetections,
          averageExecutionTime: this.metrics.averageExecutionTime,
          patternsDetected: this.metrics.patternsDetected,
          alertsGenerated: this.metrics.alertsGenerated
        },
        tags: ['pattern_detection', 'service']
      });

      console.log('✅ Pattern detection service stopped successfully');

    } catch (error) {
      console.error('❌ Failed to stop pattern detection:', error);
      throw error;
    }
  }

  /**
   * Detect patterns for new commits (real-time)
   */
  async detectPatternsForCommits(commitShas: string[]): Promise<PatternDetectionResult> {
    const startTime = Date.now();
    
    try {
      // Get current session and project
      const sessionId = await getCurrentSession();
      if (!sessionId) {
        throw new Error('No active session found');
      }

      const projectId = await this.getProjectIdForSession(sessionId);
      if (!projectId) {
        throw new Error('Session not assigned to project');
      }

      console.log(`🔍 Detecting patterns for ${commitShas.length} commits...`);

      // Initialize result structure
      const result: PatternDetectionResult = {
        sessionId,
        projectId,
        detectionTimestamp: new Date(),
        executionTimeMs: 0,
        cooccurrenceTimeMs: 0,
        temporalTimeMs: 0,
        developerTimeMs: 0,
        magnitudeTimeMs: 0,
        insightsTimeMs: 0,
        cooccurrencePatterns: [],
        temporalPatterns: [],
        developerPatterns: [],
        magnitudePatterns: [],
        insights: [],
        commitsAnalyzed: commitShas.length,
        filesAnalyzed: 0,
        totalPatternsFound: 0,
        alertsGenerated: 0,
        success: false,
        errors: []
      };

      // Check performance timeout
      if (Date.now() - startTime > this.config.detectionTimeoutMs) {
        result.errors.push('Detection timeout exceeded');
        return result;
      }

      // Create or get pattern discovery session
      const discoverySessionId = await this.createPatternDiscoverySession(projectId);

      // 1. Analyze file co-occurrence patterns
      const cooccurrenceStart = Date.now();
      try {
        result.cooccurrencePatterns = await this.analyzeCooccurrencePatterns(
          projectId, commitShas, discoverySessionId
        );
        result.cooccurrenceTimeMs = Date.now() - cooccurrenceStart;
      } catch (error) {
        result.errors.push(`Co-occurrence analysis failed: ${error}`);
      }

      // 2. Analyze temporal patterns
      const temporalStart = Date.now();
      try {
        result.temporalPatterns = await this.analyzeTemporalPatterns(
          projectId, commitShas, discoverySessionId
        );
        result.temporalTimeMs = Date.now() - temporalStart;
      } catch (error) {
        result.errors.push(`Temporal analysis failed: ${error}`);
      }

      // 3. Analyze developer patterns
      const developerStart = Date.now();
      try {
        result.developerPatterns = await this.analyzeDeveloperPatterns(
          projectId, commitShas, discoverySessionId
        );
        result.developerTimeMs = Date.now() - developerStart;
      } catch (error) {
        result.errors.push(`Developer analysis failed: ${error}`);
      }

      // 4. Analyze change magnitude patterns
      const magnitudeStart = Date.now();
      try {
        result.magnitudePatterns = await this.analyzeMagnitudePatterns(
          projectId, commitShas, discoverySessionId
        );
        result.magnitudeTimeMs = Date.now() - magnitudeStart;
      } catch (error) {
        result.errors.push(`Magnitude analysis failed: ${error}`);
      }

      // 5. Generate cross-pattern insights
      const insightsStart = Date.now();
      try {
        result.insights = await this.generatePatternInsights(
          result, discoverySessionId
        );
        result.insightsTimeMs = Date.now() - insightsStart;
      } catch (error) {
        result.errors.push(`Insights generation failed: ${error}`);
      }

      // Calculate final metrics
      result.executionTimeMs = Date.now() - startTime;
      result.filesAnalyzed = await this.countFilesInCommits(commitShas);
      result.totalPatternsFound = 
        result.cooccurrencePatterns.length +
        result.temporalPatterns.length +
        result.developerPatterns.length +
        result.magnitudePatterns.length +
        result.insights.length;

      // Generate alerts for high-priority patterns
      const alerts = await this.generatePatternAlerts(result);
      result.alertsGenerated = alerts.length;

      result.success = result.errors.length === 0;

      // Update performance metrics
      this.updateMetrics(result);

      // Log detection completion
      await logEvent({
        actor: 'system',
        event_type: 'pattern_detection_completed',
        status: result.success ? 'closed' : 'error',
        metadata: {
          executionTimeMs: result.executionTimeMs,
          patternsFound: result.totalPatternsFound,
          alertsGenerated: result.alertsGenerated,
          commitsAnalyzed: result.commitsAnalyzed,
          filesAnalyzed: result.filesAnalyzed,
          errors: result.errors
        },
        tags: ['pattern_detection', 'realtime', 'analysis']
      });

      console.log(`✅ Pattern detection completed in ${result.executionTimeMs}ms`);
      console.log(`📊 Found ${result.totalPatternsFound} patterns, generated ${result.alertsGenerated} alerts`);

      return result;

    } catch (error) {
      console.error('❌ Pattern detection failed:', error);
      const errorResult: PatternDetectionResult = {
        sessionId: '',
        projectId: '',
        detectionTimestamp: new Date(),
        executionTimeMs: Date.now() - startTime,
        cooccurrenceTimeMs: 0,
        temporalTimeMs: 0,
        developerTimeMs: 0,
        magnitudeTimeMs: 0,
        insightsTimeMs: 0,
        cooccurrencePatterns: [],
        temporalPatterns: [],
        developerPatterns: [],
        magnitudePatterns: [],
        insights: [],
        commitsAnalyzed: commitShas.length,
        filesAnalyzed: 0,
        totalPatternsFound: 0,
        alertsGenerated: 0,
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
      return errorResult;
    }
  }

  /**
   * Batch process patterns for historical analysis
   */
  async batchProcessPatterns(
    projectId: string,
    commitRangeStart?: string,
    commitRangeEnd?: string
  ): Promise<PatternDetectionResult> {
    const startTime = Date.now();

    try {
      console.log(`📦 Starting batch pattern processing for project ${projectId.substring(0, 8)}...`);

      // Get commits in range
      const commits = await this.getCommitsInRange(projectId, commitRangeStart, commitRangeEnd);
      const commitShas = commits.map(c => c.commit_sha);

      // Process in batches to avoid memory issues
      const batchSize = this.config.batchSizeLimit;
      const results: PatternDetectionResult[] = [];

      for (let i = 0; i < commitShas.length; i += batchSize) {
        const batch = commitShas.slice(i, i + batchSize);
        console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(commitShas.length / batchSize)}`);
        
        const batchResult = await this.detectPatternsForCommits(batch);
        results.push(batchResult);
        
        // Small delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Aggregate results
      const aggregatedResult = this.aggregateBatchResults(results, projectId);
      aggregatedResult.executionTimeMs = Date.now() - startTime;

      console.log(`✅ Batch processing completed in ${aggregatedResult.executionTimeMs}ms`);
      console.log(`📊 Total patterns found: ${aggregatedResult.totalPatternsFound}`);

      return aggregatedResult;

    } catch (error) {
      console.error('❌ Batch pattern processing failed:', error);
      throw error;
    }
  }

  /**
   * Analyze file co-occurrence patterns using market basket analysis
   */
  private async analyzeCooccurrencePatterns(
    projectId: string,
    commitShas: string[],
    discoverySessionId: string
  ): Promise<CooccurrencePattern[]> {
    
    try {
      // Get file changes for the commits
      const fileChangesQuery = `
        SELECT 
          gc.commit_sha,
          gfc.file_path
        FROM git_commits gc
        JOIN git_file_changes gfc ON gc.id = gfc.commit_id
        WHERE gc.project_id = $1 
        AND gc.commit_sha = ANY($2)
        AND gfc.change_type != 'deleted'
      `;
      
      const fileChangesResult = await db.query(fileChangesQuery, [projectId, commitShas]);
      const fileChanges = fileChangesResult.rows;

      if (fileChanges.length === 0) {
        return [];
      }

      // Group files by commit to create transactions
      const transactions: Map<string, string[]> = new Map();
      for (const change of fileChanges) {
        if (!transactions.has(change.commit_sha)) {
          transactions.set(change.commit_sha, []);
        }
        transactions.get(change.commit_sha)!.push(change.file_path);
      }

      // Calculate co-occurrence statistics
      const patterns: CooccurrencePattern[] = [];
      const fileFrequency: Map<string, number> = new Map();
      const cooccurrenceCount: Map<string, number> = new Map();

      // Count individual file frequencies
      for (const [, files] of transactions) {
        const uniqueFiles = [...new Set(files)];
        for (const file of uniqueFiles) {
          fileFrequency.set(file, (fileFrequency.get(file) || 0) + 1);
        }
      }

      // Count file co-occurrences
      for (const [commitSha, files] of transactions) {
        const uniqueFiles = [...new Set(files)];
        for (let i = 0; i < uniqueFiles.length; i++) {
          for (let j = i + 1; j < uniqueFiles.length; j++) {
            const file1 = uniqueFiles[i];
            const file2 = uniqueFiles[j];
            const pair = file1 < file2 ? `${file1}|${file2}` : `${file2}|${file1}`;
            cooccurrenceCount.set(pair, (cooccurrenceCount.get(pair) || 0) + 1);
          }
        }
      }

      const totalTransactions = transactions.size;

      // Calculate market basket metrics and filter by thresholds
      for (const [pair, count] of cooccurrenceCount) {
        const [file1, file2] = pair.split('|');
        const file1Freq = fileFrequency.get(file1) || 0;
        const file2Freq = fileFrequency.get(file2) || 0;

        const support = count / totalTransactions;
        const confidence1to2 = count / file1Freq;
        const confidence2to1 = count / file2Freq;
        const confidence = Math.max(confidence1to2, confidence2to1);
        const lift = count / ((file1Freq * file2Freq) / totalTransactions);

        // Apply thresholds
        if (support >= this.config.cooccurrenceMinSupport &&
            confidence >= this.config.cooccurrenceMinConfidence &&
            lift >= this.config.cooccurrenceMinLift) {

          // Classify pattern strength
          let patternStrength: 'weak' | 'moderate' | 'strong' | 'very_strong';
          if (lift >= 10.0 && confidence >= 0.8) {
            patternStrength = 'very_strong';
          } else if (lift >= 5.0 && confidence >= 0.6) {
            patternStrength = 'strong';
          } else if (lift >= 2.0 && confidence >= 0.4) {
            patternStrength = 'moderate';
          } else {
            patternStrength = 'weak';
          }

          // Get contributing commits
          const contributingCommits = Array.from(transactions.entries())
            .filter(([, files]) => files.includes(file1) && files.includes(file2))
            .map(([commitSha]) => commitSha);

          patterns.push({
            filePath1: file1,
            filePath2: file2,
            cooccurrenceCount: count,
            supportScore: support,
            confidenceScore: confidence,
            liftScore: lift,
            patternStrength,
            contributingCommits
          });
        }
      }

      // Store patterns in database
      await this.storeCooccurrencePatterns(patterns, discoverySessionId, projectId);

      console.log(`📊 Found ${patterns.length} co-occurrence patterns`);
      return patterns;

    } catch (error) {
      console.error('❌ Co-occurrence analysis failed:', error);
      throw error;
    }
  }

  /**
   * Analyze temporal development patterns
   */
  private async analyzeTemporalPatterns(
    projectId: string,
    commitShas: string[],
    discoverySessionId: string
  ): Promise<TemporalPattern[]> {
    
    try {
      // Get commit timestamps
      const commitsQuery = `
        SELECT author_date, commit_sha
        FROM git_commits 
        WHERE project_id = $1 AND commit_sha = ANY($2)
        ORDER BY author_date
      `;
      
      const commitsResult = await db.query(commitsQuery, [projectId, commitShas]);
      const commits = commitsResult.rows;

      if (commits.length < 5) {
        // Need sufficient data for temporal analysis
        return [];
      }

      const patterns: TemporalPattern[] = [];

      // Analyze different temporal patterns
      const patternTypes: Array<'hourly' | 'daily' | 'weekly' | 'monthly'> = ['hourly', 'daily', 'weekly', 'monthly'];

      for (const patternType of patternTypes) {
        const pattern = await this.analyzeSpecificTemporalPattern(commits, patternType);
        if (pattern && pattern.statisticalSignificance >= this.config.temporalSignificanceThreshold) {
          patterns.push(pattern);
        }
      }

      // Store patterns in database
      await this.storeTemporalPatterns(patterns, discoverySessionId, projectId);

      console.log(`⏰ Found ${patterns.length} temporal patterns`);
      return patterns;

    } catch (error) {
      console.error('❌ Temporal analysis failed:', error);
      throw error;
    }
  }

  /**
   * Analyze developer behavior patterns
   */
  private async analyzeDeveloperPatterns(
    projectId: string,
    commitShas: string[],
    discoverySessionId: string
  ): Promise<DeveloperPattern[]> {
    
    try {
      // Get developer commit data with file changes
      const developerQuery = `
        SELECT 
          gc.author_email,
          gc.author_name,
          gc.commit_sha,
          gc.author_date,
          gc.insertions,
          gc.deletions,
          gc.files_changed,
          ARRAY_AGG(DISTINCT gfc.file_path) FILTER (WHERE gfc.file_path IS NOT NULL) as files
        FROM git_commits gc
        LEFT JOIN git_file_changes gfc ON gc.id = gfc.commit_id
        WHERE gc.project_id = $1 AND gc.commit_sha = ANY($2)
        GROUP BY gc.author_email, gc.author_name, gc.commit_sha, gc.author_date, gc.insertions, gc.deletions, gc.files_changed
      `;
      
      const result = await db.query(developerQuery, [projectId, commitShas]);
      const commitData = result.rows;

      if (commitData.length === 0) {
        return [];
      }

      // Group commits by developer
      const developerCommits: Map<string, typeof commitData> = new Map();
      for (const commit of commitData) {
        const key = commit.author_email;
        if (!developerCommits.has(key)) {
          developerCommits.set(key, []);
        }
        developerCommits.get(key)!.push(commit);
      }

      const patterns: DeveloperPattern[] = [];

      // Analyze each developer's patterns
      for (const [authorEmail, commits] of developerCommits) {
        if (commits.length < 2) continue; // Need multiple commits for pattern analysis

        const pattern = await this.analyzeDeveloperSpecificPatterns(authorEmail, commits);
        if (pattern) {
          patterns.push(pattern);
        }
      }

      // Store patterns in database
      await this.storeDeveloperPatterns(patterns, discoverySessionId, projectId);

      console.log(`👨‍💻 Found ${patterns.length} developer patterns`);
      return patterns;

    } catch (error) {
      console.error('❌ Developer analysis failed:', error);
      throw error;
    }
  }

  /**
   * Analyze change magnitude patterns and detect anomalies
   */
  private async analyzeMagnitudePatterns(
    projectId: string,
    commitShas: string[],
    discoverySessionId: string
  ): Promise<MagnitudePattern[]> {
    
    try {
      // Get file change statistics
      const magnitudeQuery = `
        SELECT 
          gfc.file_path,
          COUNT(*) as change_count,
          AVG(gfc.lines_added + gfc.lines_removed) as avg_lines_changed,
          MAX(gfc.lines_added + gfc.lines_removed) as max_lines_changed,
          MIN(gfc.lines_added + gfc.lines_removed) as min_lines_changed,
          STDDEV(gfc.lines_added + gfc.lines_removed) as stddev_lines_changed,
          COUNT(DISTINCT gc.author_email) as contributor_count,
          EXTRACT(EPOCH FROM (MAX(gc.author_date) - MIN(gc.author_date))) / 3600 as timespan_hours
        FROM git_file_changes gfc
        JOIN git_commits gc ON gfc.commit_id = gc.id
        WHERE gc.project_id = $1 AND gc.commit_sha = ANY($2)
        GROUP BY gfc.file_path
        HAVING COUNT(*) > 1
      `;
      
      const result = await db.query(magnitudeQuery, [projectId, commitShas]);
      const fileStats = result.rows;

      if (fileStats.length === 0) {
        return [];
      }

      const patterns: MagnitudePattern[] = [];

      // Calculate z-scores for anomaly detection
      const avgLines = fileStats.map(f => parseFloat(f.avg_lines_changed));
      const avgMean = avgLines.reduce((a, b) => a + b, 0) / avgLines.length;
      const avgStdDev = Math.sqrt(avgLines.reduce((a, b) => a + (b - avgMean) ** 2, 0) / avgLines.length);

      for (const fileStat of fileStats) {
        const avgLinesPerChange = parseFloat(fileStat.avg_lines_changed);
        const changeCount = parseInt(fileStat.change_count);
        const timespanHours = parseFloat(fileStat.timespan_hours) || 1;
        
        // Calculate z-score for anomaly detection
        const zScore = avgStdDev > 0 ? Math.abs(avgLinesPerChange - avgMean) / avgStdDev : 0;
        const anomalyScore = Math.min(zScore / 3.0, 1.0); // Normalize to 0-1

        // Calculate frequency and volatility
        const changeFrequency = changeCount / Math.max(timespanHours / 24 / 7, 1); // changes per week
        const volatilityScore = Math.min(
          (parseFloat(fileStat.stddev_lines_changed) || 0) / Math.max(avgLinesPerChange, 1), 
          1.0
        );

        // Classify change category
        let changeCategory: 'small' | 'medium' | 'large' | 'massive';
        if (avgLinesPerChange <= 10) {
          changeCategory = 'small';
        } else if (avgLinesPerChange <= 50) {
          changeCategory = 'medium';
        } else if (avgLinesPerChange <= 200) {
          changeCategory = 'large';
        } else {
          changeCategory = 'massive';
        }

        // Calculate risk level
        let riskLevel: 'low' | 'medium' | 'high' | 'critical';
        const riskScore = (anomalyScore * 0.4) + (volatilityScore * 0.3) + 
                         (Math.min(changeFrequency / 5, 1) * 0.3);
        
        if (riskScore >= 0.8 || anomalyScore >= this.config.magnitudeAnomalyThreshold) {
          riskLevel = 'critical';
        } else if (riskScore >= 0.6) {
          riskLevel = 'high';
        } else if (riskScore >= 0.4) {
          riskLevel = 'medium';
        } else {
          riskLevel = 'low';
        }

        // Calculate additional metrics
        const hotspotScore = Math.min((changeCount / 10) * (changeFrequency / 2), 1.0);
        const technicalDebtIndicator = Math.min(
          (volatilityScore * 0.5) + (hotspotScore * 0.3) + (anomalyScore * 0.2), 
          1.0
        );

        patterns.push({
          filePath: fileStat.file_path,
          changeCategory,
          avgLinesPerChange,
          changeFrequency,
          volatilityScore,
          riskLevel,
          anomalyScore,
          hotspotScore,
          technicalDebtIndicator
        });
      }

      // Store patterns in database
      await this.storeMagnitudePatterns(patterns, discoverySessionId, projectId);

      console.log(`📈 Found ${patterns.length} magnitude patterns`);
      return patterns;

    } catch (error) {
      console.error('❌ Magnitude analysis failed:', error);
      throw error;
    }
  }

  /**
   * Generate cross-pattern insights through meta-analysis
   */
  private async generatePatternInsights(
    detectionResult: PatternDetectionResult,
    discoverySessionId: string
  ): Promise<PatternInsight[]> {
    
    try {
      const insights: PatternInsight[] = [];

      // 1. High-risk file coupling insights
      const strongCooccurrences = detectionResult.cooccurrencePatterns
        .filter(p => p.patternStrength === 'very_strong' || p.patternStrength === 'strong');

      if (strongCooccurrences.length > 0) {
        insights.push({
          insightType: 'file_coupling',
          title: `Strong File Coupling Detected`,
          description: `Found ${strongCooccurrences.length} strong file coupling patterns that may indicate tight architectural dependencies.`,
          confidenceScore: 0.85,
          riskLevel: strongCooccurrences.some(p => p.liftScore > 10) ? 'high' : 'medium',
          businessImpact: 'medium',
          recommendations: [
            'Review architectural dependencies between tightly coupled files',
            'Consider refactoring to reduce coupling where appropriate',
            'Document intentional coupling relationships'
          ],
          supportingPatternIds: [],
          priority: 2
        });
      }

      // 2. High-risk file alerts
      const criticalFiles = detectionResult.magnitudePatterns
        .filter(p => p.riskLevel === 'critical');

      if (criticalFiles.length > 0) {
        insights.push({
          insightType: 'high_risk_files',
          title: `Critical Risk Files Identified`,
          description: `${criticalFiles.length} files show critical risk patterns including high volatility, frequent changes, or anomalous behavior.`,
          confidenceScore: 0.90,
          riskLevel: 'critical',
          businessImpact: 'high',
          recommendations: [
            'Prioritize code review for critical risk files',
            'Add additional testing coverage',
            'Consider breaking down large, volatile files',
            'Implement monitoring for these files'
          ],
          supportingPatternIds: [],
          priority: 1
        });
      }

      // 3. Developer specialization insights
      const specialists = detectionResult.developerPatterns
        .filter(p => p.specializationScore > 0.8 && p.knowledgeBreadthScore < 0.3);

      if (specialists.length > 0) {
        insights.push({
          insightType: 'developer_specialization',
          title: `High Developer Specialization Detected`,
          description: `${specialists.length} developers show high specialization patterns which may create knowledge silos.`,
          confidenceScore: 0.75,
          riskLevel: 'medium',
          businessImpact: 'medium',
          recommendations: [
            'Encourage cross-training and knowledge sharing',
            'Document specialized knowledge areas',
            'Plan for knowledge transfer and backup coverage'
          ],
          supportingPatternIds: [],
          priority: 3
        });
      }

      // 4. Temporal pattern insights
      const significantTemporal = detectionResult.temporalPatterns
        .filter(p => p.statisticalSignificance > 0.8);

      if (significantTemporal.length > 0) {
        insights.push({
          insightType: 'temporal_patterns',
          title: `Development Rhythm Patterns Identified`,
          description: `Strong temporal patterns detected that could inform optimal development scheduling and resource allocation.`,
          confidenceScore: 0.80,
          riskLevel: 'low',
          businessImpact: 'medium',
          recommendations: [
            'Align critical releases with high-activity periods',
            'Schedule maintenance during low-activity periods',
            'Use patterns to optimize team coordination'
          ],
          supportingPatternIds: [],
          priority: 4
        });
      }

      // Store insights in database
      await this.storePatternInsights(insights, discoverySessionId, detectionResult.projectId);

      console.log(`💡 Generated ${insights.length} pattern insights`);
      return insights;

    } catch (error) {
      console.error('❌ Insights generation failed:', error);
      throw error;
    }
  }

  // Database storage methods (implementing TC012 schema)
  
  private async createPatternDiscoverySession(projectId: string): Promise<string> {
    const sessionId = await getCurrentSession();
    
    const insertQuery = `
      INSERT INTO pattern_discovery_sessions (
        project_id, session_id, algorithm_version, status
      ) VALUES ($1, $2, $3, $4)
      RETURNING id
    `;
    
    const result = await db.query(insertQuery, [
      projectId, 
      sessionId, 
      'tc013_v1.0', 
      'running'
    ]);
    
    return result.rows[0].id;
  }

  private async storeCooccurrencePatterns(
    patterns: CooccurrencePattern[], 
    discoverySessionId: string, 
    projectId: string
  ): Promise<void> {
    if (patterns.length === 0) return;

    const insertQuery = `
      INSERT INTO file_cooccurrence_patterns (
        discovery_session_id, project_id, file_path_1, file_path_2,
        cooccurrence_count, support_score, confidence_score, lift_score,
        pattern_strength, contributing_commits
      ) VALUES ${patterns.map((_, i) => `($${i * 8 + 1}, $${i * 8 + 2}, $${i * 8 + 3}, $${i * 8 + 4}, $${i * 8 + 5}, $${i * 8 + 6}, $${i * 8 + 7}, $${i * 8 + 8})`).join(', ')}
    `;

    const values = patterns.flatMap(p => [
      discoverySessionId, projectId, p.filePath1, p.filePath2,
      p.cooccurrenceCount, p.supportScore, p.confidenceScore, p.liftScore
    ]);

    await db.query(insertQuery, values);
  }

  private async storeTemporalPatterns(
    patterns: TemporalPattern[], 
    discoverySessionId: string, 
    projectId: string
  ): Promise<void> {
    if (patterns.length === 0) return;

    const insertQuery = `
      INSERT INTO temporal_patterns (
        discovery_session_id, project_id, pattern_type, pattern_strength,
        statistical_significance, chi_square_statistic, p_value,
        peak_periods, commit_distribution
      ) VALUES ${patterns.map((_, i) => `($${i * 8 + 1}, $${i * 8 + 2}, $${i * 8 + 3}, $${i * 8 + 4}, $${i * 8 + 5}, $${i * 8 + 6}, $${i * 8 + 7}, $${i * 8 + 8})`).join(', ')}
    `;

    const values = patterns.flatMap(p => [
      discoverySessionId, projectId, p.patternType, p.patternStrength,
      p.statisticalSignificance, p.chiSquareStatistic, p.pValue,
      p.peakPeriods, p.commitDistribution
    ]);

    await db.query(insertQuery, values);
  }

  private async storeDeveloperPatterns(
    patterns: DeveloperPattern[], 
    discoverySessionId: string, 
    projectId: string
  ): Promise<void> {
    if (patterns.length === 0) return;

    const insertQuery = `
      INSERT INTO developer_patterns (
        discovery_session_id, project_id, author_email, author_name,
        specialty_files, specialization_score, knowledge_breadth_score,
        change_velocity, consistency_score, knowledge_silo_risk_score,
        work_pattern_classification
      ) VALUES ${patterns.map((_, i) => `($${i * 10 + 1}, $${i * 10 + 2}, $${i * 10 + 3}, $${i * 10 + 4}, $${i * 10 + 5}, $${i * 10 + 6}, $${i * 10 + 7}, $${i * 10 + 8}, $${i * 10 + 9}, $${i * 10 + 10})`).join(', ')}
    `;

    const values = patterns.flatMap(p => [
      discoverySessionId, projectId, p.authorEmail, p.authorName,
      p.specialtyFiles, p.specializationScore, p.knowledgeBreadthScore,
      p.changeVelocity, p.consistencyScore, p.knowledgeSiloRiskScore,
      p.workPattern
    ]);

    await db.query(insertQuery, values);
  }

  private async storeMagnitudePatterns(
    patterns: MagnitudePattern[], 
    discoverySessionId: string, 
    projectId: string
  ): Promise<void> {
    if (patterns.length === 0) return;

    const insertQuery = `
      INSERT INTO change_magnitude_patterns (
        discovery_session_id, project_id, file_path, change_category,
        avg_lines_per_change, change_frequency, volatility_score,
        risk_level, anomaly_score, hotspot_score, technical_debt_indicator
      ) VALUES ${patterns.map((_, i) => `($${i * 10 + 1}, $${i * 10 + 2}, $${i * 10 + 3}, $${i * 10 + 4}, $${i * 10 + 5}, $${i * 10 + 6}, $${i * 10 + 7}, $${i * 10 + 8}, $${i * 10 + 9}, $${i * 10 + 10})`).join(', ')}
    `;

    const values = patterns.flatMap(p => [
      discoverySessionId, projectId, p.filePath, p.changeCategory,
      p.avgLinesPerChange, p.changeFrequency, p.volatilityScore,
      p.riskLevel, p.anomalyScore, p.hotspotScore, p.technicalDebtIndicator
    ]);

    await db.query(insertQuery, values);
  }

  private async storePatternInsights(
    insights: PatternInsight[], 
    discoverySessionId: string, 
    projectId: string
  ): Promise<void> {
    if (insights.length === 0) return;

    const insertQuery = `
      INSERT INTO pattern_insights (
        discovery_session_id, project_id, insight_type, title, description,
        confidence_score, risk_level, business_impact, recommendations,
        supporting_pattern_ids, insight_priority
      ) VALUES ${insights.map((_, i) => `($${i * 10 + 1}, $${i * 10 + 2}, $${i * 10 + 3}, $${i * 10 + 4}, $${i * 10 + 5}, $${i * 10 + 6}, $${i * 10 + 7}, $${i * 10 + 8}, $${i * 10 + 9}, $${i * 10 + 10})`).join(', ')}
    `;

    const values = insights.flatMap(p => [
      discoverySessionId, projectId, p.insightType, p.title, p.description,
      p.confidenceScore, p.riskLevel, p.businessImpact, p.recommendations,
      p.supportingPatternIds, p.priority
    ]);

    await db.query(insertQuery, values);
  }

  // Helper methods for pattern analysis
  
  private async analyzeSpecificTemporalPattern(
    commits: any[], 
    patternType: 'hourly' | 'daily' | 'weekly' | 'monthly'
  ): Promise<TemporalPattern | null> {
    try {
      // Extract time periods from commits
      const periods: number[] = [];
      const periodCounts: Map<number, number> = new Map();

      for (const commit of commits) {
        const date = new Date(commit.author_date);
        let period: number;

        switch (patternType) {
          case 'hourly':
            period = date.getHours();
            break;
          case 'daily':
            period = date.getDay(); // 0-6 (Sunday-Saturday)
            break;
          case 'weekly':
            // Week number of year
            const startOfYear = new Date(date.getFullYear(), 0, 1);
            const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
            period = Math.floor(dayOfYear / 7);
            break;
          case 'monthly':
            period = date.getMonth(); // 0-11
            break;
          default:
            return null;
        }

        periods.push(period);
        periodCounts.set(period, (periodCounts.get(period) || 0) + 1);
      }

      if (periods.length < 5) return null; // Need sufficient data

      // Calculate expected uniform distribution
      const totalCommits = commits.length;
      const numPeriods = patternType === 'hourly' ? 24 : 
                        patternType === 'daily' ? 7 : 
                        patternType === 'monthly' ? 12 : 52;
      const expectedFrequency = totalCommits / numPeriods;

      // Perform chi-square test
      let chiSquare = 0;
      const observed: number[] = [];
      const expected: number[] = [];

      for (let i = 0; i < numPeriods; i++) {
        const observedCount = periodCounts.get(i) || 0;
        observed.push(observedCount);
        expected.push(expectedFrequency);
        
        const deviation = observedCount - expectedFrequency;
        chiSquare += (deviation * deviation) / expectedFrequency;
      }

      // Calculate degrees of freedom and p-value approximation
      const degreesOfFreedom = numPeriods - 1;
      const criticalValue = 14.067; // For alpha = 0.05, df varies by pattern type
      const pValue = chiSquare > criticalValue ? 0.01 : 0.5; // Simplified approximation

      // Calculate statistical significance
      const statisticalSignificance = Math.min(chiSquare / criticalValue, 1.0);

      // Find peak periods (top 20% of activity)
      const sortedPeriods = Array.from(periodCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, Math.ceil(numPeriods * 0.2))
        .map(([period]) => period);

      return {
        patternType,
        patternStrength: statisticalSignificance,
        statisticalSignificance,
        chiSquareStatistic: chiSquare,
        pValue,
        peakPeriods: sortedPeriods,
        commitDistribution: observed
      };

    } catch (error) {
      console.error('❌ Temporal pattern analysis failed:', error);
      return null;
    }
  }

  private async analyzeDeveloperSpecificPatterns(
    authorEmail: string, 
    commits: any[]
  ): Promise<DeveloperPattern | null> {
    try {
      if (commits.length === 0) return null;

      const authorName = commits[0].author_name;
      const allFiles: string[] = [];
      const fileFrequency: Map<string, number> = new Map();
      
      let totalInsertions = 0;
      let totalDeletions = 0;
      let totalFilesChanged = 0;

      // Collect file statistics
      for (const commit of commits) {
        if (commit.files && commit.files.length > 0) {
          for (const file of commit.files) {
            allFiles.push(file);
            fileFrequency.set(file, (fileFrequency.get(file) || 0) + 1);
          }
        }

        totalInsertions += commit.insertions || 0;
        totalDeletions += commit.deletions || 0;
        totalFilesChanged += commit.files_changed || 0;
      }

      const uniqueFiles = [...new Set(allFiles)];
      
      // Calculate specialization metrics
      const totalFiles = uniqueFiles.length;
      const specialtyFiles: string[] = [];
      
      // Find files this developer touches most frequently (top 20%)
      const sortedFiles = Array.from(fileFrequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, Math.ceil(totalFiles * 0.2));

      for (const [file, count] of sortedFiles) {
        if (count >= 2) { // Modified at least twice
          specialtyFiles.push(file);
        }
      }

      // Calculate specialization score (concentration in specific files)
      const specializationScore = specialtyFiles.length > 0 ? 
        Math.min(specialtyFiles.length / Math.max(totalFiles, 1), 1.0) : 0;

      // Calculate knowledge breadth score (inverse of specialization)
      const knowledgeBreadthScore = Math.max(0, 1 - specializationScore);

      // Calculate change velocity (commits per week approximation)
      const timeSpan = Math.max(1, 
        (new Date(commits[commits.length - 1].author_date).getTime() - 
         new Date(commits[0].author_date).getTime()) / (1000 * 60 * 60 * 24 * 7)
      );
      const changeVelocity = commits.length / timeSpan;

      // Calculate consistency score based on commit frequency variance
      const commitDates = commits.map(c => new Date(c.author_date));
      const intervals: number[] = [];
      for (let i = 1; i < commitDates.length; i++) {
        intervals.push(commitDates[i].getTime() - commitDates[i-1].getTime());
      }
      
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / Math.max(intervals.length, 1);
      const variance = intervals.reduce((a, b) => a + Math.pow(b - avgInterval, 2), 0) / Math.max(intervals.length, 1);
      const consistencyScore = Math.max(0, 1 - (Math.sqrt(variance) / Math.max(avgInterval, 1)));

      // Calculate knowledge silo risk
      const exclusiveFiles = specialtyFiles.length; // Simplified: assume all specialty files are exclusive
      const knowledgeSiloRiskScore = Math.min(
        (exclusiveFiles / Math.max(totalFiles, 1)) * 0.6 + 
        (1 - knowledgeBreadthScore) * 0.4, 
        1.0
      );

      // Classify work pattern based on commit patterns
      let workPattern: 'feature_focused' | 'maintenance_focused' | 'mixed' | 'experimental';
      const avgLinesPerCommit = (totalInsertions + totalDeletions) / commits.length;
      
      if (avgLinesPerCommit > 100 && specializationScore > 0.6) {
        workPattern = 'feature_focused';
      } else if (avgLinesPerCommit < 20 && totalDeletions > totalInsertions) {
        workPattern = 'maintenance_focused';
      } else if (knowledgeBreadthScore > 0.7) {
        workPattern = 'mixed';
      } else {
        workPattern = 'experimental';
      }

      return {
        authorEmail,
        authorName,
        specialtyFiles,
        specializationScore,
        knowledgeBreadthScore,
        changeVelocity,
        consistencyScore,
        knowledgeSiloRiskScore,
        workPattern
      };

    } catch (error) {
      console.error('❌ Developer pattern analysis failed:', error);
      return null;
    }
  }

  private async generatePatternAlerts(result: PatternDetectionResult): Promise<PatternAlert[]> {
    const alerts: PatternAlert[] = [];
    
    try {
      // 1. Critical risk file alerts
      const criticalFiles = result.magnitudePatterns.filter(p => p.riskLevel === 'critical');
      for (const file of criticalFiles) {
        alerts.push({
          alertId: `critical_file_${Date.now()}_${file.filePath.split('/').pop()}`,
          alertType: 'high_risk_pattern',
          severity: 'critical',
          title: `Critical Risk File: ${file.filePath}`,
          description: `File shows critical risk patterns with anomaly score ${file.anomalyScore.toFixed(2)} and technical debt indicator ${file.technicalDebtIndicator.toFixed(2)}`,
          recommendedActions: [
            'Immediate code review required',
            'Add comprehensive testing coverage',
            'Consider refactoring to reduce complexity',
            'Implement monitoring and alerts'
          ],
          affectedFiles: [file.filePath],
          confidenceScore: file.anomalyScore,
          timestamp: new Date(),
          metadata: {
            riskLevel: file.riskLevel,
            anomalyScore: file.anomalyScore,
            hotspotScore: file.hotspotScore,
            technicalDebtIndicator: file.technicalDebtIndicator
          }
        });
      }

      // 2. Very strong file coupling alerts
      const strongCoupling = result.cooccurrencePatterns.filter(p => 
        p.patternStrength === 'very_strong' && p.liftScore > 10
      );
      for (const pattern of strongCoupling) {
        alerts.push({
          alertId: `coupling_${Date.now()}_${pattern.filePath1.split('/').pop()}`,
          alertType: 'new_pattern_discovered',
          severity: 'warning',
          title: `Very Strong File Coupling Detected`,
          description: `Extremely strong coupling between ${pattern.filePath1} and ${pattern.filePath2} with lift score ${pattern.liftScore.toFixed(2)}`,
          recommendedActions: [
            'Review architectural dependencies',
            'Evaluate if coupling is intentional',
            'Consider decoupling strategies',
            'Document relationship rationale'
          ],
          affectedFiles: [pattern.filePath1, pattern.filePath2],
          confidenceScore: pattern.confidenceScore,
          timestamp: new Date(),
          metadata: {
            liftScore: pattern.liftScore,
            confidenceScore: pattern.confidenceScore,
            patternStrength: pattern.patternStrength,
            cooccurrenceCount: pattern.cooccurrenceCount
          }
        });
      }

      // 3. High knowledge silo risk alerts
      const siloRisks = result.developerPatterns.filter(p => p.knowledgeSiloRiskScore > 0.8);
      for (const dev of siloRisks) {
        alerts.push({
          alertId: `silo_risk_${Date.now()}_${dev.authorEmail.split('@')[0]}`,
          alertType: 'pattern_anomaly',
          severity: 'warning',
          title: `High Knowledge Silo Risk: ${dev.authorName}`,
          description: `Developer ${dev.authorName} shows high specialization (${(dev.specializationScore * 100).toFixed(0)}%) with low knowledge breadth, creating potential knowledge silos`,
          recommendedActions: [
            'Encourage cross-training initiatives',
            'Pair programming with other team members',
            'Document specialized knowledge areas',
            'Plan for knowledge transfer sessions'
          ],
          affectedFiles: dev.specialtyFiles,
          confidenceScore: dev.knowledgeSiloRiskScore,
          timestamp: new Date(),
          metadata: {
            authorEmail: dev.authorEmail,
            specializationScore: dev.specializationScore,
            knowledgeBreadthScore: dev.knowledgeBreadthScore,
            knowledgeSiloRiskScore: dev.knowledgeSiloRiskScore,
            workPattern: dev.workPattern
          }
        });
      }

      // 4. High-confidence insights as alerts
      const criticalInsights = result.insights.filter(i => 
        i.riskLevel === 'critical' && i.confidenceScore > this.config.alertThresholdScore
      );
      for (const insight of criticalInsights) {
        alerts.push({
          alertId: `insight_${Date.now()}_${insight.insightType}`,
          alertType: 'pattern_insight',
          severity: 'critical',
          title: insight.title,
          description: insight.description,
          recommendedActions: insight.recommendations,
          affectedFiles: [], // Would need to extract from supporting patterns
          confidenceScore: insight.confidenceScore,
          timestamp: new Date(),
          metadata: {
            insightType: insight.insightType,
            riskLevel: insight.riskLevel,
            businessImpact: insight.businessImpact,
            priority: insight.priority
          }
        });
      }

      // 5. Temporal pattern anomalies
      const significantTemporal = result.temporalPatterns.filter(p => 
        p.statisticalSignificance > 0.9 && p.pValue < 0.05
      );
      for (const temporal of significantTemporal) {
        alerts.push({
          alertId: `temporal_${Date.now()}_${temporal.patternType}`,
          alertType: 'new_pattern_discovered',
          severity: 'info',
          title: `Significant ${temporal.patternType} Development Pattern`,
          description: `Strong ${temporal.patternType} development pattern detected with ${(temporal.statisticalSignificance * 100).toFixed(0)}% significance`,
          recommendedActions: [
            'Consider optimizing development schedules',
            'Align critical work with peak activity periods',
            'Plan maintenance during low-activity periods'
          ],
          affectedFiles: [],
          confidenceScore: temporal.statisticalSignificance,
          timestamp: new Date(),
          metadata: {
            patternType: temporal.patternType,
            statisticalSignificance: temporal.statisticalSignificance,
            chiSquareStatistic: temporal.chiSquareStatistic,
            pValue: temporal.pValue,
            peakPeriods: temporal.peakPeriods
          }
        });
      }

      console.log(`🚨 Generated ${alerts.length} pattern alerts`);
      return alerts;

    } catch (error) {
      console.error('❌ Alert generation failed:', error);
      return alerts; // Return any alerts generated before error
    }
  }

  // Utility methods
  
  private async getProjectIdForSession(sessionId: string): Promise<string | null> {
    const query = `
      SELECT project_id FROM user_sessions WHERE id = $1
      UNION ALL
      SELECT project_id FROM sessions WHERE id = $1
    `;
    
    const result = await db.query(query, [sessionId]);
    return result.rows.length > 0 ? result.rows[0].project_id : null;
  }

  private async countFilesInCommits(commitShas: string[]): Promise<number> {
    const query = `
      SELECT COUNT(DISTINCT gfc.file_path) as file_count
      FROM git_commits gc
      JOIN git_file_changes gfc ON gc.id = gfc.commit_id
      WHERE gc.commit_sha = ANY($1)
    `;
    
    const result = await db.query(query, [commitShas]);
    return parseInt(result.rows[0].file_count) || 0;
  }

  private async getCommitsInRange(
    projectId: string, 
    startSha?: string, 
    endSha?: string
  ): Promise<any[]> {
    // Implementation to get commits in range for batch processing
    return [];
  }

  private aggregateBatchResults(
    results: PatternDetectionResult[], 
    projectId: string
  ): PatternDetectionResult {
    // Implementation to aggregate multiple batch results
    return results[0]; // Placeholder
  }

  private updateMetrics(result: PatternDetectionResult): void {
    this.metrics.totalDetections++;
    this.metrics.totalExecutionTime += result.executionTimeMs;
    this.metrics.averageExecutionTime = this.metrics.totalExecutionTime / this.metrics.totalDetections;
    this.metrics.patternsDetected += result.totalPatternsFound;
    this.metrics.alertsGenerated += result.alertsGenerated;
    this.metrics.lastPerformanceCheck = new Date();
  }

  private startPeriodicUpdates(): void {
    this.updateTimer = setInterval(async () => {
      if (this.isRunning && this.commitBuffer.length > 0) {
        const commits = [...this.commitBuffer];
        this.commitBuffer = [];
        
        try {
          await this.detectPatternsForCommits(commits);
        } catch (error) {
          console.error('❌ Periodic pattern update failed:', error);
        }
      }
    }, this.config.patternUpdateIntervalMs);
  }

  /**
   * Add commits to buffer for periodic processing
   */
  addCommitsToBuffer(commitShas: string[]): void {
    this.commitBuffer.push(...commitShas);
    
    // Limit buffer size
    if (this.commitBuffer.length > this.config.bufferCommitsCount * 2) {
      this.commitBuffer = this.commitBuffer.slice(-this.config.bufferCommitsCount);
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }
}

/**
 * Utility functions for external usage
 */

/**
 * Start pattern detection service
 */
export async function startPatternDetection(config?: Partial<PatternDetectorConfig>): Promise<void> {
  const detector = PatternDetector.getInstance(config);
  await detector.start();
}

/**
 * Stop pattern detection service
 */
export async function stopPatternDetection(): Promise<void> {
  const detector = PatternDetector.getInstance();
  await detector.stop();
}

/**
 * Detect patterns for specific commits
 */
export async function detectPatterns(commitShas: string[]): Promise<PatternDetectionResult> {
  const detector = PatternDetector.getInstance();
  return await detector.detectPatternsForCommits(commitShas);
}

/**
 * Add commits to processing buffer
 */
export function bufferCommitsForProcessing(commitShas: string[]): void {
  const detector = PatternDetector.getInstance();
  detector.addCommitsToBuffer(commitShas);
}

/**
 * Get pattern detection metrics
 */
export function getPatternDetectionMetrics() {
  const detector = PatternDetector.getInstance();
  return detector.getMetrics();
}

/**
 * Export the main class
 */
export default PatternDetector;