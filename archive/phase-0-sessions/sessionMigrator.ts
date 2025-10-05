/**
 * TS013 - Session Migration for Existing Users
 * 
 * Enterprise-grade session migration system with comprehensive validation
 * and safety features. This service provides:
 * - Pre-migration analysis with confidence scoring
 * - Safe, transaction-based migration with rollback capability
 * - Integration with TS012 validation framework
 * - Detailed audit trails and migration reports
 * - Rollback and recovery mechanisms
 */

import { db } from '../config/database.js';
import { ProjectSwitchValidator } from './projectSwitchValidator.js';
import { randomUUID } from 'crypto';

export interface MigrationSession {
  id: string;
  project_id: string | null;
  started_at: Date;
  agent_type: string;
  title?: string;
  description?: string;
  analyticsEvents: AnalyticsEvent[];
}

export interface AnalyticsEvent {
  event_id: string;
  session_id: string;
  project_id: string | null;
  event_type: string;
  timestamp: Date;
}

export interface MigrationAnalysis {
  session: MigrationSession;
  assignmentType: 'confident' | 'tentative' | 'manual_review' | 'unassigned';
  targetProjectId: string | null;
  confidence: number; // 0-1 scale
  reasoning: string;
  warnings: string[];
  analyticsEventsSummary: {
    total: number;
    uniqueProjects: number;
    projectDistribution: Record<string, number>;
  };
}

export interface MigrationPlan {
  migrationId: string;
  analysisDate: Date;
  sessions: MigrationAnalysis[];
  summary: {
    total: number;
    confident: number;
    tentative: number;
    manual_review: number;
    unassigned: number;
  };
  risks: string[];
  recommendations: string[];
}

export interface MigrationResult {
  success: boolean;
  sessionId: string;
  sourceProjectId: string | null;
  targetProjectId: string | null;
  migrationMethod: string;
  timestamp: Date;
  rollbackData?: any;
  error?: string;
}

export interface MigrationReport {
  migrationId: string;
  startTime: Date;
  endTime?: Date;
  results: MigrationResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
  };
  errors: string[];
  rollbacksPerformed: number;
  validationErrors: number;
}

/**
 * SessionMigrator - Enhanced migration service with validation and safety
 */
export class SessionMigrator {
  private static readonly UNASSIGNED_PROJECT_ID = '00000000-0000-0000-0000-000000000000';
  private static readonly CONFIDENCE_THRESHOLDS = {
    CONFIDENT: 0.9,
    TENTATIVE: 0.6,
    MANUAL_REVIEW: 0.3
  };

  /**
   * Analyze orphan sessions and create a migration plan
   */
  static async analyzeOrphanSessions(): Promise<MigrationPlan> {
    const migrationId = randomUUID();
    console.log(`🔍 [TS013] Starting migration analysis (${migrationId.substring(0, 8)}...)`);

    try {
      // Get all orphan sessions with their analytics events
      const orphanSessions = await this.getOrphanSessions();
      console.log(`Found ${orphanSessions.length} orphan sessions to analyze`);

      const analyses: MigrationAnalysis[] = [];
      for (const session of orphanSessions) {
        const analysis = await this.analyzeSession(session);
        analyses.push(analysis);
      }

      // Create summary
      const summary = {
        total: analyses.length,
        confident: analyses.filter(a => a.assignmentType === 'confident').length,
        tentative: analyses.filter(a => a.assignmentType === 'tentative').length,
        manual_review: analyses.filter(a => a.assignmentType === 'manual_review').length,
        unassigned: analyses.filter(a => a.assignmentType === 'unassigned').length
      };

      // Identify risks and recommendations
      const risks = this.identifyMigrationRisks(analyses);
      const recommendations = this.generateRecommendations(analyses, summary);

      const plan: MigrationPlan = {
        migrationId,
        analysisDate: new Date(),
        sessions: analyses,
        summary,
        risks,
        recommendations
      };

      console.log(`✅ [TS013] Migration analysis complete:`);
      console.log(`  - Confident assignments: ${summary.confident}`);
      console.log(`  - Tentative assignments: ${summary.tentative}`);
      console.log(`  - Manual review needed: ${summary.manual_review}`);
      console.log(`  - Will remain unassigned: ${summary.unassigned}`);

      return plan;

    } catch (error) {
      console.error(`❌ [TS013] Migration analysis failed:`, error);
      throw error;
    }
  }

  /**
   * Execute migration plan with comprehensive validation and safety
   */
  static async executeMigrationPlan(
    plan: MigrationPlan,
    options: {
      dryRun?: boolean;
      skipValidation?: boolean;
      skipLowConfidence?: boolean;
    } = {}
  ): Promise<MigrationReport> {
    const migrationId = plan.migrationId;
    const startTime = new Date();
    
    console.log(`🚀 [TS013] Starting migration execution (${migrationId.substring(0, 8)}...)${options.dryRun ? ' [DRY RUN]' : ''}`);

    const report: MigrationReport = {
      migrationId,
      startTime,
      results: [],
      summary: { total: 0, successful: 0, failed: 0, skipped: 0 },
      errors: [],
      rollbacksPerformed: 0,
      validationErrors: 0
    };

    try {
      // Create database backup point if not dry run
      if (!options.dryRun) {
        await this.createMigrationBackup(migrationId);
      }

      // Process each session
      for (const analysis of plan.sessions) {
        report.summary.total++;

        try {
          // Skip low confidence assignments if requested
          if (options.skipLowConfidence && 
              (analysis.assignmentType === 'manual_review' || analysis.assignmentType === 'tentative')) {
            console.log(`⏭️  Skipping session ${analysis.session.id} (${analysis.assignmentType})`);
            report.summary.skipped++;
            continue;
          }

          const result = await this.migrateSession(analysis, {
            dryRun: options.dryRun,
            skipValidation: options.skipValidation
          });

          report.results.push(result);

          if (result.success) {
            report.summary.successful++;
            console.log(`✅ Migrated session ${result.sessionId} -> ${result.targetProjectId}`);
          } else {
            report.summary.failed++;
            report.errors.push(`Session ${result.sessionId}: ${result.error}`);
            console.log(`❌ Failed to migrate session ${result.sessionId}: ${result.error}`);
          }

        } catch (error) {
          report.summary.failed++;
          const errorMsg = `Session ${analysis.session.id} migration error: ${error instanceof Error ? error.message : 'Unknown error'}`;
          report.errors.push(errorMsg);
          console.error(`❌ ${errorMsg}`);
        }
      }

      report.endTime = new Date();
      const duration = report.endTime.getTime() - startTime.getTime();

      console.log(`\n📊 [TS013] Migration ${options.dryRun ? 'simulation' : 'execution'} complete (${duration}ms):`);
      console.log(`  - Total: ${report.summary.total}`);
      console.log(`  - Successful: ${report.summary.successful}`);
      console.log(`  - Failed: ${report.summary.failed}`);
      console.log(`  - Skipped: ${report.summary.skipped}`);
      console.log(`  - Rollbacks: ${report.rollbacksPerformed}`);

      return report;

    } catch (error) {
      report.endTime = new Date();
      const errorMsg = `Migration execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      report.errors.push(errorMsg);
      console.error(`❌ [TS013] ${errorMsg}`);
      return report;
    }
  }

  /**
   * Rollback migration using backup data
   */
  static async rollbackMigration(migrationId: string): Promise<{ success: boolean; error?: string }> {
    console.log(`🔄 [TS013] Starting migration rollback (${migrationId.substring(0, 8)}...)`);

    try {
      // Find the backup table
      const backupTableName = `sessions_backup_${migrationId.replace(/-/g, '_')}`;
      
      // Check if backup exists
      const backupExists = await db.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = $1
        )
      `, [backupTableName]);

      if (!backupExists.rows[0].exists) {
        return { success: false, error: 'Backup table not found' };
      }

      // Begin transaction for rollback
      await db.query('BEGIN');

      try {
        // Restore sessions from backup
        await db.query(`
          UPDATE sessions 
          SET project_id = backup.project_id
          FROM ${backupTableName} backup
          WHERE sessions.id = backup.id
        `);

        // Commit rollback transaction
        await db.query('COMMIT');

        console.log(`✅ [TS013] Migration rollback completed successfully`);
        return { success: true };

      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }

    } catch (error) {
      const errorMsg = `Rollback failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`❌ [TS013] ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  // ===========================================
  // Private Helper Methods
  // ===========================================

  private static async getOrphanSessions(): Promise<MigrationSession[]> {
    const sessionsQuery = `
      SELECT id, project_id, started_at, agent_type, title, description
      FROM sessions 
      WHERE project_id IS NULL
      ORDER BY started_at DESC
    `;

    const sessionsResult = await db.query(sessionsQuery);
    const sessions: MigrationSession[] = [];

    for (const row of sessionsResult.rows) {
      // Get analytics events for this session
      const eventsQuery = `
        SELECT event_id, session_id, project_id, event_type, timestamp
        FROM analytics_events
        WHERE session_id = $1
        ORDER BY timestamp
      `;

      const eventsResult = await db.query(eventsQuery, [row.id]);
      
      sessions.push({
        ...row,
        analyticsEvents: eventsResult.rows
      });
    }

    return sessions;
  }

  private static async analyzeSession(session: MigrationSession): Promise<MigrationAnalysis> {
    const events = session.analyticsEvents;
    
    // Calculate project distribution from analytics events
    const projectCounts: Record<string, number> = {};
    let totalProjectEvents = 0;

    for (const event of events) {
      if (event.project_id) {
        projectCounts[event.project_id] = (projectCounts[event.project_id] || 0) + 1;
        totalProjectEvents++;
      }
    }

    const uniqueProjects = Object.keys(projectCounts).length;
    const mostCommonProject = Object.entries(projectCounts)
      .sort(([,a], [,b]) => b - a)[0];

    // Analyze assignment strategy
    let assignmentType: 'confident' | 'tentative' | 'manual_review' | 'unassigned';
    let targetProjectId: string | null = null;
    let confidence = 0;
    let reasoning = '';
    const warnings: string[] = [];

    if (uniqueProjects === 0) {
      assignmentType = 'unassigned';
      targetProjectId = this.UNASSIGNED_PROJECT_ID;
      confidence = 1.0;
      reasoning = 'No analytics events with project_id found';
    } else if (uniqueProjects === 1) {
      const [projectId, eventCount] = mostCommonProject;
      assignmentType = 'confident';
      targetProjectId = projectId;
      confidence = Math.min(1.0, eventCount / Math.max(10, events.length * 0.5));
      reasoning = `All ${eventCount} project-related analytics events point to same project`;
      
      if (confidence < this.CONFIDENCE_THRESHOLDS.CONFIDENT) {
        assignmentType = 'tentative';
        warnings.push('Low number of analytics events for confident assignment');
      }
    } else {
      // Multiple projects - analyze distribution
      const [primaryProject, primaryCount] = mostCommonProject;
      const primaryRatio = primaryCount / totalProjectEvents;
      
      if (primaryRatio >= 0.8) {
        assignmentType = 'confident';
        targetProjectId = primaryProject;
        confidence = primaryRatio;
        reasoning = `${Math.round(primaryRatio * 100)}% of events (${primaryCount}/${totalProjectEvents}) point to primary project`;
      } else if (primaryRatio >= 0.6) {
        assignmentType = 'tentative';
        targetProjectId = primaryProject;
        confidence = primaryRatio;
        reasoning = `${Math.round(primaryRatio * 100)}% of events point to primary project, but other projects present`;
        warnings.push('Multiple projects in analytics events, assignment may be incorrect');
      } else {
        assignmentType = 'manual_review';
        targetProjectId = null;
        confidence = 0;
        reasoning = `Too many conflicting projects in analytics events (${uniqueProjects} unique projects)`;
        warnings.push('Manual review required - no clear primary project');
      }
    }

    return {
      session,
      assignmentType,
      targetProjectId,
      confidence,
      reasoning,
      warnings,
      analyticsEventsSummary: {
        total: events.length,
        uniqueProjects,
        projectDistribution: projectCounts
      }
    };
  }

  private static identifyMigrationRisks(analyses: MigrationAnalysis[]): string[] {
    const risks: string[] = [];

    const totalSessions = analyses.length;
    const lowConfidenceSessions = analyses.filter(a => a.confidence < 0.7).length;
    const manualReviewSessions = analyses.filter(a => a.assignmentType === 'manual_review').length;

    if (lowConfidenceSessions > totalSessions * 0.3) {
      risks.push(`High number of low-confidence assignments (${lowConfidenceSessions}/${totalSessions})`);
    }

    if (manualReviewSessions > 0) {
      risks.push(`${manualReviewSessions} sessions require manual review`);
    }

    const sessionsWithWarnings = analyses.filter(a => a.warnings.length > 0).length;
    if (sessionsWithWarnings > totalSessions * 0.2) {
      risks.push(`Multiple sessions have warnings (${sessionsWithWarnings}/${totalSessions})`);
    }

    return risks;
  }

  private static generateRecommendations(_analyses: MigrationAnalysis[], summary: any): string[] {
    const recommendations: string[] = [];

    if (summary.manual_review > 0) {
      recommendations.push('Review sessions marked for manual review before migration');
    }

    if (summary.tentative > summary.confident) {
      recommendations.push('Consider using dry-run mode first due to high number of tentative assignments');
    }

    if (summary.unassigned > 0) {
      recommendations.push(`${summary.unassigned} sessions will be marked as unassigned - verify this is acceptable`);
    }

    recommendations.push('Create database backup before executing migration');
    recommendations.push('Run migration during low-traffic period');

    return recommendations;
  }

  private static async migrateSession(
    analysis: MigrationAnalysis,
    options: { dryRun?: boolean; skipValidation?: boolean } = {}
  ): Promise<MigrationResult> {
    const sessionId = analysis.session.id;
    const targetProjectId = analysis.targetProjectId;

    console.log(`🔄 Migrating session ${sessionId.substring(0, 8)}... -> ${targetProjectId || 'unassigned'}${options.dryRun ? ' [DRY RUN]' : ''}`);

    const result: MigrationResult = {
      success: false,
      sessionId,
      sourceProjectId: analysis.session.project_id,
      targetProjectId,
      migrationMethod: analysis.assignmentType,
      timestamp: new Date()
    };

    try {
      // Skip actual migration in dry run mode
      if (options.dryRun) {
        result.success = true;
        return result;
      }

      // Prepare rollback data
      result.rollbackData = {
        originalProjectId: analysis.session.project_id,
        timestamp: new Date()
      };

      // Use TS012 validation if not skipped
      if (!options.skipValidation && targetProjectId && targetProjectId !== this.UNASSIGNED_PROJECT_ID) {
        const validationResult = await ProjectSwitchValidator.validatePreSwitch(sessionId, targetProjectId);
        if (!validationResult.isValid) {
          const errorMsg = `Pre-switch validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`;
          result.error = errorMsg;
          return result;
        }
      }

      // Perform the migration in a transaction
      await db.query('BEGIN');

      try {
        await db.query(
          'UPDATE sessions SET project_id = $1 WHERE id = $2',
          [targetProjectId, sessionId]
        );

        await db.query('COMMIT');
        result.success = true;

      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }

    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return result;
  }

  private static async createMigrationBackup(migrationId: string): Promise<void> {
    const backupTableName = `sessions_backup_${migrationId.replace(/-/g, '_')}`;
    
    console.log(`💾 [TS013] Creating migration backup table: ${backupTableName}`);

    // Create backup table with current session data
    await db.query(`
      CREATE TABLE ${backupTableName} AS 
      SELECT id, project_id, started_at, ended_at, agent_type, title, description, updated_at
      FROM sessions 
      WHERE project_id IS NULL
    `);

    console.log(`✅ [TS013] Migration backup created successfully`);
  }

  /**
   * Get migration statistics and health check
   */
  static async getMigrationHealth(): Promise<{
    orphanSessions: number;
    totalSessions: number;
    lastMigration?: Date;
    activeMigrations: number;
  }> {
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN project_id IS NULL THEN 1 END) as orphan_sessions
      FROM sessions
    `);

    return {
      orphanSessions: parseInt(stats.rows[0].orphan_sessions),
      totalSessions: parseInt(stats.rows[0].total_sessions),
      activeMigrations: 0 // Could be enhanced to track active migrations
    };
  }
}
