/**
 * TC013: Pattern Detection MCP Handlers
 * 
 * MCP API handlers for the comprehensive pattern detection system.
 * Provides real-time pattern detection, batch analysis, pattern insights,
 * and alert management through AIDIS MCP protocol.
 * 
 * Key Features:
 * - Real-time pattern detection for commits
 * - Batch historical pattern analysis  
 * - Pattern insights and recommendations
 * - Pattern-based alerts and notifications
 * - Performance monitoring and metrics
 * - Integration with existing AIDIS tools
 */

import { 
  PatternDetector, 
  startPatternDetection, 
  stopPatternDetection,
  detectPatterns,
  bufferCommitsForProcessing,
  getPatternDetectionMetrics,
  type PatternDetectionResult,
  type PatternAlert
} from '../services/patternDetector.js';
import { 
  detectPatternsForRecentCommits,
  getSessionPatternInsights,
  trackRealtimeGitActivityWithPatterns
} from './git.js';
import { db } from '../config/database.js';
import { logEvent } from '../middleware/eventLogger.js';
import { getCurrentSession } from '../services/sessionManager.js';

/**
 * Pattern Detection MCP Handler
 */
export class PatternDetectionHandler {
  
  /**
   * Start the pattern detection service
   * MCP Tool: pattern_detection_start
   */
  static async startPatternDetection(params: {
    enableRealTime?: boolean;
    enableBatchProcessing?: boolean;
    detectionTimeoutMs?: number;
    updateIntervalMs?: number;
  }): Promise<{
    success: boolean;
    message: string;
    config?: any;
    error?: string;
  }> {
    try {
      console.log('🚀 Starting pattern detection service...');

      const config = {
        enableRealTimeDetection: params.enableRealTime ?? true,
        enableBatchProcessing: params.enableBatchProcessing ?? true,
        detectionTimeoutMs: params.detectionTimeoutMs ?? 100,
        patternUpdateIntervalMs: params.updateIntervalMs ?? 5000
      };

      await startPatternDetection(config);

      // Log service start
      await logEvent({
        actor: 'ai',
        event_type: 'pattern_detection_service_started',
        status: 'open',
        metadata: {
          config,
          startedAt: new Date().toISOString()
        },
        tags: ['pattern_detection', 'service', 'mcp', 'tc013']
      });

      console.log('✅ Pattern detection service started successfully');

      return {
        success: true,
        message: 'Pattern detection service started successfully',
        config
      };

    } catch (error) {
      console.error('❌ Failed to start pattern detection service:', error);
      return {
        success: false,
        message: 'Failed to start pattern detection service',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Stop the pattern detection service
   * MCP Tool: pattern_detection_stop
   */
  static async stopPatternDetection(): Promise<{
    success: boolean;
    message: string;
    metrics?: any;
    error?: string;
  }> {
    try {
      console.log('🛑 Stopping pattern detection service...');

      // Get final metrics before stopping
      const metrics = getPatternDetectionMetrics();

      await stopPatternDetection();

      // Log service stop
      await logEvent({
        actor: 'ai',
        event_type: 'pattern_detection_service_stopped',
        status: 'closed',
        metadata: {
          finalMetrics: metrics,
          stoppedAt: new Date().toISOString()
        },
        tags: ['pattern_detection', 'service', 'mcp', 'tc013']
      });

      console.log('✅ Pattern detection service stopped successfully');

      return {
        success: true,
        message: 'Pattern detection service stopped successfully',
        metrics
      };

    } catch (error) {
      console.error('❌ Failed to stop pattern detection service:', error);
      return {
        success: false,
        message: 'Failed to stop pattern detection service',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Detect patterns for specific commits
   * MCP Tool: pattern_detect_commits
   */
  static async detectPatternsForCommits(params: {
    commitShas?: string[];
    sessionId?: string;
    projectId?: string;
    realTimeMode?: boolean;
  }): Promise<{
    success: boolean;
    result?: PatternDetectionResult;
    error?: string;
  }> {
    try {
      console.log(`🔍 Detecting patterns for commits...`);

      const sessionId = params.sessionId || await getCurrentSession();
      if (!sessionId) {
        throw new Error('No active session found');
      }

      let commitShas = params.commitShas;

      // If no commits specified, get recent commits for the session/project
      if (!commitShas || commitShas.length === 0) {
        const recentResult = await detectPatternsForRecentCommits({
          sessionId,
          projectId: params.projectId,
          commitLimitCount: 10,
          realTime: params.realTimeMode
        });

        if (!recentResult.success) {
          throw new Error(recentResult.error || 'Failed to get recent commits');
        }

        return {
          success: true,
          result: recentResult.detectionResult
        };
      }

      // Detect patterns for specified commits
      const result = await detectPatterns(commitShas);

      // Log the detection
      await logEvent({
        actor: 'ai',
        event_type: 'pattern_detection_triggered',
        status: result.success ? 'closed' : 'error',
        metadata: {
          sessionId,
          commitsAnalyzed: result.commitsAnalyzed,
          patternsFound: result.totalPatternsFound,
          executionTimeMs: result.executionTimeMs,
          alertsGenerated: result.alertsGenerated
        },
        tags: ['pattern_detection', 'mcp', 'tc013']
      });

      console.log(`✅ Pattern detection completed: ${result.totalPatternsFound} patterns found`);

      return {
        success: true,
        result
      };

    } catch (error) {
      console.error('❌ Pattern detection failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get pattern insights for current session
   * MCP Tool: pattern_get_session_insights
   */
  static async getSessionPatternInsights(params: {
    sessionId?: string;
    confidenceThreshold?: number;
    includeHistorical?: boolean;
    riskLevelFilter?: string[];
    insightTypeFilter?: string[];
  }): Promise<{
    success: boolean;
    sessionId: string;
    insights: any[];
    totalInsights: number;
    highRiskInsights: number;
    criticalInsights: number;
    error?: string;
  }> {
    try {
      console.log('💡 Getting pattern insights for session...');

      const sessionId = params.sessionId || await getCurrentSession();
      if (!sessionId) {
        throw new Error('No active session found');
      }

      // Get base insights
      const baseResult = await getSessionPatternInsights({
        sessionId,
        includeHistorical: params.includeHistorical,
        confidenceThreshold: params.confidenceThreshold || 0.5
      });

      if (!baseResult.success) {
        throw new Error(baseResult.error || 'Failed to get session insights');
      }

      let insights = baseResult.insights;

      // Apply additional filters
      if (params.riskLevelFilter && params.riskLevelFilter.length > 0) {
        insights = insights.filter(insight => 
          params.riskLevelFilter!.includes(insight.risk_level)
        );
      }

      if (params.insightTypeFilter && params.insightTypeFilter.length > 0) {
        insights = insights.filter(insight => 
          params.insightTypeFilter!.includes(insight.insight_type)
        );
      }

      // Calculate risk metrics
      const highRiskInsights = insights.filter(i => i.risk_level === 'high').length;
      const criticalInsights = insights.filter(i => i.risk_level === 'critical').length;

      console.log(`💡 Found ${insights.length} insights (${criticalInsights} critical, ${highRiskInsights} high risk)`);

      return {
        success: true,
        sessionId,
        insights,
        totalInsights: insights.length,
        highRiskInsights,
        criticalInsights
      };

    } catch (error) {
      console.error('❌ Failed to get session pattern insights:', error);
      return {
        success: false,
        sessionId: params.sessionId || '',
        insights: [],
        totalInsights: 0,
        highRiskInsights: 0,
        criticalInsights: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get project-wide pattern analysis
   * MCP Tool: pattern_analyze_project
   */
  static async analyzeProjectPatterns(params: {
    projectId?: string;
    sessionId?: string;
    timeRangeHours?: number;
    includeArchived?: boolean;
    patternTypes?: string[];
  }): Promise<{
    success: boolean;
    projectId: string;
    analysis: {
      cooccurrencePatterns: number;
      temporalPatterns: number;
      developerPatterns: number;
      magnitudePatterns: number;
      insights: number;
      criticalRiskFiles: number;
      highRiskFiles: number;
      avgConfidence: number;
    };
    topInsights: any[];
    error?: string;
  }> {
    try {
      console.log('📊 Analyzing project-wide patterns...');

      const sessionId = params.sessionId || await getCurrentSession();
      if (!sessionId && !params.projectId) {
        throw new Error('No active session or project ID provided');
      }

      // Get project ID if not provided
      let projectId = params.projectId;
      if (!projectId && sessionId) {
        const sessionQuery = `
          SELECT project_id FROM user_sessions WHERE id = $1
          UNION ALL
          SELECT project_id FROM sessions WHERE id = $1
        `;
        
        const sessionResult = await db.query(sessionQuery, [sessionId]);
        if (sessionResult.rows.length === 0 || !sessionResult.rows[0].project_id) {
          // Fallback to first available project
          const fallbackProjectQuery = `SELECT id FROM projects ORDER BY created_at DESC LIMIT 1`;
          const fallbackResult = await db.query(fallbackProjectQuery);
          if (fallbackResult.rows.length > 0) {
            projectId = fallbackResult.rows[0].id;
          } else {
            throw new Error('No projects available for analysis');
          }
        } else {
          projectId = sessionResult.rows[0].project_id;
        }
      }

      // Get time range filter
      const hoursAgo = params.timeRangeHours || 72; // Default 3 days
      const timeFilter = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

      // Query pattern analysis summary
      const analysisQuery = `
        SELECT 
          -- Co-occurrence patterns
          COALESCE((
            SELECT COUNT(*) 
            FROM file_cooccurrence_patterns fcp
            JOIN pattern_discovery_sessions pds ON fcp.discovery_session_id = pds.id
            WHERE pds.project_id = $1 
            AND fcp.is_active = TRUE
            AND pds.discovery_timestamp >= $2
          ), 0) as cooccurrence_patterns,
          
          -- Temporal patterns  
          COALESCE((
            SELECT COUNT(*) 
            FROM temporal_patterns tp
            JOIN pattern_discovery_sessions pds ON tp.discovery_session_id = pds.id
            WHERE pds.project_id = $1 
            AND tp.is_active = TRUE
            AND pds.discovery_timestamp >= $2
          ), 0) as temporal_patterns,
          
          -- Developer patterns
          COALESCE((
            SELECT COUNT(*) 
            FROM developer_patterns dp
            JOIN pattern_discovery_sessions pds ON dp.discovery_session_id = pds.id
            WHERE pds.project_id = $1 
            AND dp.is_active = TRUE
            AND pds.discovery_timestamp >= $2
          ), 0) as developer_patterns,
          
          -- Magnitude patterns
          COALESCE((
            SELECT COUNT(*) 
            FROM change_magnitude_patterns cmp
            JOIN pattern_discovery_sessions pds ON cmp.discovery_session_id = pds.id
            WHERE pds.project_id = $1 
            AND cmp.is_active = TRUE
            AND pds.discovery_timestamp >= $2
          ), 0) as magnitude_patterns,
          
          -- Insights
          COALESCE((
            SELECT COUNT(*) 
            FROM pattern_insights pi
            JOIN pattern_discovery_sessions pds ON pi.discovery_session_id = pds.id
            WHERE pds.project_id = $1 
            AND pi.is_active = TRUE
            AND pds.discovery_timestamp >= $2
          ), 0) as insights,
          
          -- Critical risk files
          COALESCE((
            SELECT COUNT(*) 
            FROM change_magnitude_patterns cmp
            JOIN pattern_discovery_sessions pds ON cmp.discovery_session_id = pds.id
            WHERE pds.project_id = $1 
            AND cmp.risk_level = 'critical'
            AND cmp.is_active = TRUE
            AND pds.discovery_timestamp >= $2
          ), 0) as critical_risk_files,
          
          -- High risk files
          COALESCE((
            SELECT COUNT(*) 
            FROM change_magnitude_patterns cmp
            JOIN pattern_discovery_sessions pds ON cmp.discovery_session_id = pds.id
            WHERE pds.project_id = $1 
            AND cmp.risk_level = 'high'
            AND cmp.is_active = TRUE
            AND pds.discovery_timestamp >= $2
          ), 0) as high_risk_files,
          
          -- Average confidence
          COALESCE((
            SELECT AVG(pi.confidence_score) 
            FROM pattern_insights pi
            JOIN pattern_discovery_sessions pds ON pi.discovery_session_id = pds.id
            WHERE pds.project_id = $1 
            AND pi.is_active = TRUE
            AND pds.discovery_timestamp >= $2
          ), 0) as avg_confidence
      `;

      const analysisResult = await db.query(analysisQuery, [projectId, timeFilter]);
      const analysis = analysisResult.rows[0];

      // Convert string numbers to integers
      Object.keys(analysis).forEach(key => {
        if (key !== 'avg_confidence' && analysis[key]) {
          analysis[key] = parseInt(analysis[key]);
        } else if (key === 'avg_confidence' && analysis[key]) {
          analysis[key] = parseFloat(analysis[key]);
        }
      });

      // Get top insights
      const topInsightsQuery = `
        SELECT 
          pi.insight_type,
          pi.title,
          pi.description,
          pi.confidence_score,
          pi.risk_level,
          pi.business_impact,
          pi.recommendations,
          pi.created_at
        FROM pattern_insights pi
        JOIN pattern_discovery_sessions pds ON pi.discovery_session_id = pds.id
        WHERE pds.project_id = $1
        AND pi.is_active = TRUE
        AND pds.discovery_timestamp >= $2
        ORDER BY pi.confidence_score DESC, pi.created_at DESC
        LIMIT 10
      `;

      const topInsightsResult = await db.query(topInsightsQuery, [projectId, timeFilter]);
      const topInsights = topInsightsResult.rows;

      // Log the analysis request
      await logEvent({
        actor: 'ai',
        event_type: 'project_pattern_analysis',
        status: 'closed',
        metadata: {
          projectId,
          timeRangeHours: hoursAgo,
          analysis,
          topInsightsCount: topInsights.length
        },
        tags: ['pattern_analysis', 'project', 'mcp', 'tc013']
      });

      console.log(`📊 Project analysis completed: ${analysis.insights} insights, ${analysis.critical_risk_files} critical files`);

      return {
        success: true,
        projectId,
        analysis,
        topInsights
      };

    } catch (error) {
      console.error('❌ Project pattern analysis failed:', error);
      return {
        success: false,
        projectId: params.projectId || '',
        analysis: {
          cooccurrencePatterns: 0,
          temporalPatterns: 0,
          developerPatterns: 0,
          magnitudePatterns: 0,
          insights: 0,
          criticalRiskFiles: 0,
          highRiskFiles: 0,
          avgConfidence: 0
        },
        topInsights: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get real-time pattern alerts
   * MCP Tool: pattern_get_alerts
   */
  static async getPatternAlerts(params: {
    projectId?: string;
    sessionId?: string;
    severityFilter?: string[];
    alertTypeFilter?: string[];
    timeRangeHours?: number;
    limit?: number;
  }): Promise<{
    success: boolean;
    alerts: PatternAlert[];
    totalAlerts: number;
    criticalAlerts: number;
    warningAlerts: number;
    error?: string;
  }> {
    try {
      console.log('🚨 Getting pattern alerts...');

      const sessionId = params.sessionId || await getCurrentSession();
      
      // For now, generate sample alerts based on recent patterns
      // In a full implementation, this would query a pattern_alerts table
      const alerts: PatternAlert[] = [];
      
      // Get recent high-risk patterns to generate alerts
      const timeRangeHours = params.timeRangeHours || 24;
      const timeFilter = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);

      if (sessionId) {
        // Get session project
        const sessionQuery = `
          SELECT project_id FROM user_sessions WHERE id = $1
          UNION ALL
          SELECT project_id FROM sessions WHERE id = $1
        `;
        
        const sessionResult = await db.query(sessionQuery, [sessionId]);
        const projectId = sessionResult.rows.length > 0 ? sessionResult.rows[0].project_id : params.projectId;

        if (projectId) {
          // Check for critical risk files
          const criticalFilesQuery = `
            SELECT cmp.file_path, cmp.risk_level, cmp.anomaly_score, cmp.hotspot_score
            FROM change_magnitude_patterns cmp
            JOIN pattern_discovery_sessions pds ON cmp.discovery_session_id = pds.id
            WHERE pds.project_id = $1
            AND cmp.risk_level = 'critical'
            AND cmp.is_active = TRUE
            AND pds.discovery_timestamp >= $2
            ORDER BY cmp.anomaly_score DESC
            LIMIT 5
          `;

          const criticalFilesResult = await db.query(criticalFilesQuery, [projectId, timeFilter]);

          for (const file of criticalFilesResult.rows) {
            alerts.push({
              alertId: `critical_file_${Date.now()}_${file.file_path.split('/').pop()}`,
              alertType: 'high_risk_pattern',
              severity: 'critical',
              title: `Critical Risk File Detected: ${file.file_path}`,
              description: `File shows critical risk patterns with anomaly score ${file.anomaly_score} and hotspot score ${file.hotspot_score}`,
              recommendedActions: [
                'Review recent changes to this file',
                'Add additional testing coverage',
                'Consider refactoring to reduce complexity',
                'Implement monitoring for this file'
              ],
              affectedFiles: [file.file_path],
              confidenceScore: file.anomaly_score,
              timestamp: new Date(),
              metadata: {
                riskLevel: file.risk_level,
                anomalyScore: file.anomaly_score,
                hotspotScore: file.hotspot_score
              }
            });
          }

          // Check for high coupling patterns
          const couplingQuery = `
            SELECT fcp.file_path_1, fcp.file_path_2, fcp.lift_score, fcp.confidence_score
            FROM file_cooccurrence_patterns fcp
            JOIN pattern_discovery_sessions pds ON fcp.discovery_session_id = pds.id
            WHERE pds.project_id = $1
            AND fcp.pattern_strength IN ('very_strong', 'strong')
            AND fcp.is_active = TRUE
            AND pds.discovery_timestamp >= $2
            ORDER BY fcp.lift_score DESC
            LIMIT 3
          `;

          const couplingResult = await db.query(couplingQuery, [projectId, timeFilter]);

          for (const coupling of couplingResult.rows) {
            alerts.push({
              alertId: `coupling_${Date.now()}_${coupling.file_path_1.split('/').pop()}`,
              alertType: 'new_pattern_discovered',
              severity: 'warning',
              title: `Strong File Coupling Detected`,
              description: `Strong coupling between ${coupling.file_path_1} and ${coupling.file_path_2} with lift score ${coupling.lift_score}`,
              recommendedActions: [
                'Review architectural dependencies',
                'Consider decoupling if appropriate',
                'Document intentional coupling relationships'
              ],
              affectedFiles: [coupling.file_path_1, coupling.file_path_2],
              confidenceScore: coupling.confidence_score,
              timestamp: new Date(),
              metadata: {
                liftScore: coupling.lift_score,
                confidenceScore: coupling.confidence_score
              }
            });
          }
        }
      }

      // Apply filters
      let filteredAlerts = alerts;
      
      if (params.severityFilter && params.severityFilter.length > 0) {
        filteredAlerts = filteredAlerts.filter(alert => 
          params.severityFilter!.includes(alert.severity)
        );
      }

      if (params.alertTypeFilter && params.alertTypeFilter.length > 0) {
        filteredAlerts = filteredAlerts.filter(alert => 
          params.alertTypeFilter!.includes(alert.alertType)
        );
      }

      // Apply limit
      const limit = params.limit || 20;
      filteredAlerts = filteredAlerts.slice(0, limit);

      // Calculate metrics
      const criticalAlerts = filteredAlerts.filter(a => a.severity === 'critical').length;
      const warningAlerts = filteredAlerts.filter(a => a.severity === 'warning').length;

      console.log(`🚨 Found ${filteredAlerts.length} alerts (${criticalAlerts} critical, ${warningAlerts} warnings)`);

      return {
        success: true,
        alerts: filteredAlerts,
        totalAlerts: filteredAlerts.length,
        criticalAlerts,
        warningAlerts
      };

    } catch (error) {
      console.error('❌ Failed to get pattern alerts:', error);
      return {
        success: false,
        alerts: [],
        totalAlerts: 0,
        criticalAlerts: 0,
        warningAlerts: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get pattern detection service status and metrics
   * MCP Tool: pattern_detection_status
   */
  static async getPatternDetectionStatus(): Promise<{
    success: boolean;
    isActive: boolean;
    metrics: any;
    config?: any;
    error?: string;
  }> {
    try {
      console.log('📊 Getting pattern detection status...');

      const metrics = getPatternDetectionMetrics();

      // Get service status from PatternDetector
      const detector = PatternDetector.getInstance();
      const status = {
        isActive: true, // This would come from detector status
        lastAnalysisTime: metrics.lastPerformanceCheck,
        uptime: Date.now() - metrics.lastPerformanceCheck.getTime()
      };

      console.log(`📊 Pattern detection status: ${status.isActive ? 'Active' : 'Inactive'}`);

      return {
        success: true,
        isActive: status.isActive,
        metrics: {
          ...metrics,
          uptime: status.uptime
        },
        config: {
          realTimeDetection: true,
          batchProcessing: true,
          averageExecutionTime: metrics.averageExecutionTime
        }
      };

    } catch (error) {
      console.error('❌ Failed to get pattern detection status:', error);
      return {
        success: false,
        isActive: false,
        metrics: {},
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Trigger real-time git activity tracking with patterns
   * MCP Tool: pattern_track_git_activity
   */
  static async trackGitActivityWithPatterns(): Promise<{
    success: boolean;
    recentCommits: number;
    patternsDetected: number;
    autoCorrelated: boolean;
    insights: number;
    error?: string;
  }> {
    try {
      console.log('⚡ Tracking git activity with pattern detection...');

      const result = await trackRealtimeGitActivityWithPatterns();

      if (!result.success) {
        throw new Error(result.error || 'Git activity tracking failed');
      }

      // Get recent insights count
      let insights = 0;
      const sessionId = await getCurrentSession();
      if (sessionId) {
        const insightsResult = await getSessionPatternInsights({ 
          sessionId, 
          confidenceThreshold: 0.5 
        });
        insights = insightsResult.totalInsights;
      }

      console.log(`⚡ Git tracking: ${result.recentCommits} commits, ${result.patternsDetected} patterns`);

      return {
        success: true,
        recentCommits: result.recentCommits,
        patternsDetected: result.patternsDetected,
        autoCorrelated: result.autoCorrelated,
        insights
      };

    } catch (error) {
      console.error('❌ Git activity tracking with patterns failed:', error);
      return {
        success: false,
        recentCommits: 0,
        patternsDetected: 0,
        autoCorrelated: false,
        insights: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

/**
 * Export all pattern detection handlers
 */
export const patternDetectionHandlers = {
  // Service management
  pattern_detection_start: PatternDetectionHandler.startPatternDetection,
  pattern_detection_stop: PatternDetectionHandler.stopPatternDetection,
  pattern_detection_status: PatternDetectionHandler.getPatternDetectionStatus,

  // Pattern detection
  pattern_detect_commits: PatternDetectionHandler.detectPatternsForCommits,
  pattern_analyze_project: PatternDetectionHandler.analyzeProjectPatterns,
  
  // Insights and alerts
  pattern_get_session_insights: PatternDetectionHandler.getSessionPatternInsights,
  pattern_get_alerts: PatternDetectionHandler.getPatternAlerts,
  
  // Real-time integration
  pattern_track_git_activity: PatternDetectionHandler.trackGitActivityWithPatterns
};

/**
 * Export the main handler class
 */
export default PatternDetectionHandler;