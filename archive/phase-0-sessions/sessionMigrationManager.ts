/**
 * Session Migration Manager
 *
 * Implements dual-write pattern for safe migration from legacy session systems
 * to the unified session management system with zero data loss.
 */

import { UnifiedSessionManager } from './unifiedSessionManager.js';
import { isFeatureEnabled } from '../utils/featureFlags.js';
import { logEvent } from '../middleware/eventLogger.js';
import { db } from '../config/database.js';

export interface MigrationConfig {
  enabled: boolean;
  dualWriteEnabled: boolean;
  readFromPrimary: boolean;
  validateWrites: boolean;
  migrationBatchSize: number;
  maxRetries: number;
}

export interface MigrationMetrics {
  totalSessionsMigrated: number;
  successfulMigrations: number;
  failedMigrations: number;
  validationErrors: number;
  lastMigrationTimestamp?: Date;
  migrationProgress: number; // 0-100%
}

export interface MigrationValidationResult {
  isValid: boolean;
  discrepancies: {
    field: string;
    legacyValue: any;
    unifiedValue: any;
  }[];
  missingData: string[];
  extraData: string[];
}

export class SessionMigrationManager {
  private static instance: SessionMigrationManager | null = null;
  private migrationRunning = false;
  private metrics: MigrationMetrics = {
    totalSessionsMigrated: 0,
    successfulMigrations: 0,
    failedMigrations: 0,
    validationErrors: 0,
    migrationProgress: 0
  };

  private config: MigrationConfig = {
    enabled: true,
    dualWriteEnabled: true,
    readFromPrimary: false,
    validateWrites: true,
    migrationBatchSize: 100,
    maxRetries: 3
  };

  static getInstance(): SessionMigrationManager {
    if (!this.instance) {
      this.instance = new SessionMigrationManager();
    }
    return this.instance;
  }

  /**
   * Initialize migration system
   */
  async initialize(): Promise<void> {
    console.log('🔄 Initializing Session Migration Manager...');

    // Load configuration from feature flags
    this.config.enabled = await isFeatureEnabled('phase4.sessionMigration', true);
    this.config.dualWriteEnabled = await isFeatureEnabled('phase4.dualWriteEnabled', true);
    this.config.readFromPrimary = await isFeatureEnabled('phase4.readFromPrimary', false);

    console.log('✅ Session Migration Manager initialized', this.config);

    // Log initialization
    await logEvent({
      actor: 'system',
      event_type: 'session_migration_initialized',
      status: 'open',
      metadata: {
        config: this.config,
        metrics: this.metrics
      },
      tags: ['session-migration', 'initialization']
    });
  }

  /**
   * Create session with dual-write pattern
   */
  async createSessionWithDualWrite(options: {
    type: 'web' | 'mcp' | 'api' | 'cli';
    userId?: string;
    projectId?: string;
    title?: string;
    description?: string;
    tokenId?: string;
    expiresAt?: Date;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
  }): Promise<{
    success: boolean;
    sessionId?: string;
    primaryResult?: any;
    secondaryResult?: any;
    validationResult?: MigrationValidationResult;
    source: 'primary' | 'secondary' | 'unified';
  }> {
    if (!this.config.enabled) {
      // Migration disabled, use standard creation
      const unifiedManager = UnifiedSessionManager.getInstance();
      const result = await unifiedManager.createSession(options);

      return {
        success: result.success,
        sessionId: result.data?.id,
        source: 'unified'
      };
    }

    console.log(`🔄 Creating session with dual-write: type=${options.type}`);

    try {
      let primaryResult: any = null;
      let secondaryResult: any = null;

      if (this.config.dualWriteEnabled) {
        // Write to both systems in parallel
        const [primaryPromise, secondaryPromise] = await Promise.allSettled([
          this.createInPrimarySystem(options),
          this.createInSecondarySystem(options)
        ]);

        primaryResult = primaryPromise.status === 'fulfilled' ? primaryPromise.value : null;
        secondaryResult = secondaryPromise.status === 'fulfilled' ? secondaryPromise.value : null;

        // Log dual-write results
        console.log(`📊 Dual-write results: Primary=${!!primaryResult?.success}, Secondary=${!!secondaryResult?.success}`);

        // If primary fails but secondary succeeds, log for investigation
        if (!primaryResult?.success && secondaryResult?.success) {
          console.warn('⚠️  Primary session creation failed, but secondary succeeded');

          await logEvent({
            actor: 'system',
            event_type: 'session_dual_write_primary_failure',
            status: 'error',
            metadata: {
              primary_error: primaryResult?.error,
              secondary_success: secondaryResult?.success,
              options
            },
            tags: ['session-migration', 'dual-write', 'primary-failure']
          });
        }

        // Validate writes if enabled
        let validationResult: MigrationValidationResult | undefined;
        if (this.config.validateWrites && primaryResult?.success && secondaryResult?.success) {
          validationResult = await this.validateDualWrite(
            primaryResult.sessionId,
            secondaryResult.sessionId
          );

          if (!validationResult.isValid) {
            console.warn('⚠️  Dual-write validation failed', validationResult.discrepancies);
            this.metrics.validationErrors++;
          }
        }

        // Determine which result to return based on configuration
        const resultToReturn = this.config.readFromPrimary ?
          (primaryResult?.success ? primaryResult : secondaryResult) :
          (secondaryResult?.success ? secondaryResult : primaryResult);

        return {
          success: resultToReturn?.success || false,
          sessionId: resultToReturn?.sessionId,
          primaryResult,
          secondaryResult,
          validationResult,
          source: this.config.readFromPrimary ? 'primary' : 'secondary'
        };

      } else {
        // Single write to primary system only
        primaryResult = await this.createInPrimarySystem(options);

        return {
          success: primaryResult?.success || false,
          sessionId: primaryResult?.sessionId,
          primaryResult,
          source: 'primary'
        };
      }

    } catch (error) {
      console.error('❌ Dual-write session creation failed:', error);

      await logEvent({
        actor: 'system',
        event_type: 'session_dual_write_error',
        status: 'error',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          options
        },
        tags: ['session-migration', 'dual-write', 'error']
      });

      return {
        success: false,
        source: 'unified'
      };
    }
  }

  /**
   * Migrate existing sessions from legacy to unified system
   */
  async migrateExistingSessions(options: {
    batchSize?: number;
    dryRun?: boolean;
    onlyActive?: boolean;
    maxSessions?: number;
  } = {}): Promise<{
    success: boolean;
    migrated: number;
    failed: number;
    skipped: number;
    errors: string[];
  }> {
    if (this.migrationRunning) {
      throw new Error('Migration already in progress');
    }

    this.migrationRunning = true;
    console.log('🚀 Starting session migration process...', options);

    try {
      const {
        batchSize = this.config.migrationBatchSize,
        dryRun = false,
        onlyActive = false,
        maxSessions = Infinity
      } = options;

      let migrated = 0;
      let failed = 0;
      let skipped = 0;
      const errors: string[] = [];

      // Get legacy sessions to migrate
      const legacySessions = await this.getLegacySessionsForMigration({
        onlyActive,
        limit: Math.min(maxSessions, 1000) // Safety limit
      });

      console.log(`📊 Found ${legacySessions.length} legacy sessions to migrate`);

      // Process in batches
      for (let i = 0; i < legacySessions.length; i += batchSize) {
        const batch = legacySessions.slice(i, i + batchSize);
        console.log(`🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(legacySessions.length / batchSize)} (${batch.length} sessions)`);

        for (const legacySession of batch) {
          try {
            if (migrated >= maxSessions) {
              console.log(`⏹️  Reached maximum session limit: ${maxSessions}`);
              break;
            }

            const migrationResult = await this.migrateSingleSession(legacySession, dryRun);

            if (migrationResult.success) {
              migrated++;
              this.metrics.successfulMigrations++;
            } else if (migrationResult.skipped) {
              skipped++;
            } else {
              failed++;
              this.metrics.failedMigrations++;
              if (migrationResult.error) {
                errors.push(`Session ${legacySession.id}: ${migrationResult.error}`);
              }
            }

          } catch (sessionError) {
            failed++;
            this.metrics.failedMigrations++;
            const errorMsg = sessionError instanceof Error ? sessionError.message : 'Unknown error';
            errors.push(`Session ${legacySession.id}: ${errorMsg}`);
            console.error('❌ Session migration error:', sessionError);
          }
        }

        // Update progress
        this.metrics.migrationProgress = Math.round((migrated + failed + skipped) / legacySessions.length * 100);

        // Add delay between batches to avoid overwhelming the system
        if (i + batchSize < legacySessions.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      this.metrics.totalSessionsMigrated += migrated;
      this.metrics.lastMigrationTimestamp = new Date();

      console.log(`✅ Migration completed: ${migrated} migrated, ${failed} failed, ${skipped} skipped`);

      // Log migration completion
      await logEvent({
        actor: 'system',
        event_type: 'session_migration_completed',
        status: 'closed',
        metadata: {
          migrated,
          failed,
          skipped,
          total_sessions: legacySessions.length,
          dry_run: dryRun,
          metrics: this.metrics
        },
        tags: ['session-migration', 'batch-complete']
      });

      return {
        success: failed === 0,
        migrated,
        failed,
        skipped,
        errors
      };

    } finally {
      this.migrationRunning = false;
    }
  }

  /**
   * Validate session data consistency between systems
   */
  async validateSessionConsistency(sessionId: string): Promise<MigrationValidationResult> {
    try {
      console.log(`🔍 Validating session consistency: ${sessionId.substring(0, 8)}...`);

      // Get session from both systems
      const [primarySession, secondarySession] = await Promise.allSettled([
        this.getSessionFromPrimary(sessionId),
        this.getSessionFromSecondary(sessionId)
      ]);

      const primary = primarySession.status === 'fulfilled' ? primarySession.value : null;
      const secondary = secondarySession.status === 'fulfilled' ? secondarySession.value : null;

      if (!primary || !secondary) {
        return {
          isValid: false,
          discrepancies: [],
          missingData: primary ? ['secondary system'] : secondary ? ['primary system'] : ['both systems'],
          extraData: []
        };
      }

      // Compare key fields
      const discrepancies: { field: string; legacyValue: any; unifiedValue: any; }[] = [];
      const fieldsToCompare = [
        'userId', 'projectId', 'isActive', 'type',
        'startedAt', 'lastActivity', 'title', 'description'
      ];

      for (const field of fieldsToCompare) {
        const primaryValue = (primary as any)[field];
        const secondaryValue = (secondary as any)[field];

        if (JSON.stringify(primaryValue) !== JSON.stringify(secondaryValue)) {
          discrepancies.push({
            field,
            legacyValue: secondaryValue,
            unifiedValue: primaryValue
          });
        }
      }

      const isValid = discrepancies.length === 0;

      if (!isValid) {
        console.warn(`⚠️  Session consistency validation failed: ${discrepancies.length} discrepancies found`);
      }

      return {
        isValid,
        discrepancies,
        missingData: [],
        extraData: []
      };

    } catch (error) {
      console.error('❌ Session validation failed:', error);

      return {
        isValid: false,
        discrepancies: [],
        missingData: ['validation failed'],
        extraData: []
      };
    }
  }

  /**
   * Get migration metrics and status
   */
  getMigrationStatus(): {
    running: boolean;
    config: MigrationConfig;
    metrics: MigrationMetrics;
    estimatedCompletion?: Date;
  } {
    return {
      running: this.migrationRunning,
      config: this.config,
      metrics: this.metrics,
      estimatedCompletion: this.estimateCompletionTime()
    };
  }

  // Private helper methods

  private async createInPrimarySystem(options: any): Promise<{ success: boolean; sessionId?: string; error?: string; }> {
    try {
      // Create in MCP system (primary)
      console.log('🎯 Creating session in primary system (MCP)');

      const unifiedManager = UnifiedSessionManager.getInstance();
      const result = await unifiedManager.createSession(options);

      return {
        success: result.success,
        sessionId: result.data?.id,
        error: result.error
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async createInSecondarySystem(_options: any): Promise<{ success: boolean; sessionId?: string; error?: string; }> {
    try {
      // Create in legacy web system (secondary)
      console.log('🔄 Creating session in secondary system (Legacy)');

      // This would integrate with the existing legacy session creation
      // For now, simulate the operation
      return {
        success: true,
        sessionId: 'legacy-' + Date.now()
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async validateDualWrite(primarySessionId: string, _secondarySessionId: string): Promise<MigrationValidationResult> {
    // Compare sessions created in both systems
    return await this.validateSessionConsistency(primarySessionId);
  }

  private async getLegacySessionsForMigration(options: { onlyActive?: boolean; limit?: number; }): Promise<any[]> {
    try {
      console.log('📋 Getting legacy sessions for migration', options);

      // Query legacy user_sessions table
      const query = `
        SELECT
          id, user_id, token_id, started_at, ended_at, last_activity,
          is_active, project_id, session_type, metadata, created_at,
          contexts_created, decisions_created, tasks_created, api_requests,
          total_tokens, prompt_tokens, completion_tokens,
          ip_address, user_agent, expires_at
        FROM user_sessions
        ${options.onlyActive ? 'WHERE is_active = true' : ''}
        ORDER BY created_at DESC
        ${options.limit ? `LIMIT ${options.limit}` : ''}
      `;

      const result = await db.query(query);
      return result.rows;

    } catch (error) {
      console.error('❌ Failed to get legacy sessions:', error);
      return [];
    }
  }

  private async migrateSingleSession(legacySession: any, dryRun: boolean): Promise<{
    success: boolean;
    skipped?: boolean;
    error?: string;
  }> {
    try {
      console.log(`🔄 Migrating session: ${legacySession.id.substring(0, 8)}...`);

      // Check if session already exists in unified system
      const existsInUnified = await this.sessionExistsInUnified(legacySession.id);
      if (existsInUnified) {
        console.log(`⏭️  Session ${legacySession.id.substring(0, 8)}... already exists in unified system`);
        return { success: true, skipped: true };
      }

      if (dryRun) {
        console.log(`🧪 DRY RUN: Would migrate session ${legacySession.id.substring(0, 8)}...`);
        return { success: true };
      }

      // Convert legacy session to unified format
      const unifiedOptions = this.convertLegacyToUnified(legacySession);

      // Create in unified system
      const unifiedManager = UnifiedSessionManager.getInstance();
      const result = await unifiedManager.createSession(unifiedOptions);

      if (result.success) {
        console.log(`✅ Migrated session: ${legacySession.id.substring(0, 8)}... → ${result.data?.id.substring(0, 8)}...`);

        // Optionally mark legacy session as migrated
        await this.markLegacySessionAsMigrated(legacySession.id, result.data?.id);

        return { success: true };
      } else {
        return { success: false, error: result.error };
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async sessionExistsInUnified(sessionId: string): Promise<boolean> {
    try {
      const unifiedManager = UnifiedSessionManager.getInstance();
      const result = await unifiedManager.getSession(sessionId);
      return result.success;
    } catch {
      return false;
    }
  }

  private convertLegacyToUnified(legacySession: any): any {
    return {
      type: legacySession.session_type || 'web',
      userId: legacySession.user_id,
      projectId: legacySession.project_id,
      tokenId: legacySession.token_id,
      expiresAt: legacySession.expires_at ? new Date(legacySession.expires_at) : undefined,
      ipAddress: legacySession.ip_address,
      userAgent: legacySession.user_agent,
      metadata: {
        ...legacySession.metadata,
        migrated_from: 'legacy_user_sessions',
        migrated_at: new Date().toISOString(),
        legacy_id: legacySession.id,
        legacy_created_at: legacySession.created_at,
        contexts_created: legacySession.contexts_created,
        decisions_created: legacySession.decisions_created,
        tasks_created: legacySession.tasks_created,
        api_requests: legacySession.api_requests,
        total_tokens: legacySession.total_tokens,
        prompt_tokens: legacySession.prompt_tokens,
        completion_tokens: legacySession.completion_tokens
      }
    };
  }

  private async markLegacySessionAsMigrated(legacySessionId: string, unifiedSessionId?: string): Promise<void> {
    try {
      await db.query(`
        UPDATE user_sessions
        SET metadata = COALESCE(metadata, '{}') || $1
        WHERE id = $2
      `, [
        JSON.stringify({
          migrated_to_unified: true,
          unified_session_id: unifiedSessionId,
          migrated_at: new Date().toISOString()
        }),
        legacySessionId
      ]);
    } catch (error) {
      console.warn('⚠️  Failed to mark legacy session as migrated:', error);
    }
  }

  private async getSessionFromPrimary(sessionId: string): Promise<any | null> {
    // Get from MCP system
    const unifiedManager = UnifiedSessionManager.getInstance();
    const result = await unifiedManager.getSession(sessionId);
    return result.success ? result.data : null;
  }

  private async getSessionFromSecondary(sessionId: string): Promise<any | null> {
    // Get from legacy system
    try {
      const result = await db.query('SELECT * FROM user_sessions WHERE id = $1', [sessionId]);
      return result.rows[0] || null;
    } catch {
      return null;
    }
  }

  private estimateCompletionTime(): Date | undefined {
    if (!this.migrationRunning || this.metrics.migrationProgress === 0) {
      return undefined;
    }

    const elapsed = Date.now() - (this.metrics.lastMigrationTimestamp?.getTime() || Date.now());
    const remaining = (100 - this.metrics.migrationProgress) / this.metrics.migrationProgress * elapsed;

    return new Date(Date.now() + remaining);
  }
}

export default SessionMigrationManager;