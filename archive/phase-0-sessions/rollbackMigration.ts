#!/usr/bin/env npx tsx

/**
 * TS013 - Session Migration Rollback Script
 * 
 * Safe rollback utility for session migrations with comprehensive
 * validation and recovery features.
 */

import { SessionMigrator } from '../services/sessionMigrator.js';
import { db } from '../config/database.js';

async function showUsage(): Promise<void> {
  console.log(`
TS013 - Session Migration Rollback Script

USAGE:
  npx tsx rollbackMigration.ts <migration-id> [options]

OPTIONS:
  --dry-run, -d              Show what would be rolled back without making changes
  --force                    Force rollback even if validation fails
  --verify                   Verify rollback integrity after completion
  --help, -h                 Show this help message

EXAMPLES:
  npx tsx rollbackMigration.ts abc123de-f456-7890-abcd-ef1234567890
  npx tsx rollbackMigration.ts abc123de-f456-7890-abcd-ef1234567890 --dry-run
  npx tsx rollbackMigration.ts abc123de-f456-7890-abcd-ef1234567890 --verify

SAFETY FEATURES:
  - Pre-rollback validation of backup data integrity
  - Transaction-based rollback operations
  - Post-rollback verification
  - Detailed logging of all rollback operations
`);
}

async function validateBackupIntegrity(migrationId: string): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];
  
  try {
    const backupTableName = `sessions_backup_${migrationId.replace(/-/g, '_')}`;
    
    // Check if backup table exists
    const backupExists = await db.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = $1
      )
    `, [backupTableName]);

    if (!backupExists.rows[0].exists) {
      errors.push('Backup table not found');
      return { valid: false, errors };
    }

    // Check backup data integrity
    const backupStats = await db.query(`
      SELECT 
        COUNT(*) as backup_count,
        COUNT(CASE WHEN project_id IS NULL THEN 1 END) as null_project_count,
        MIN(started_at) as earliest_session,
        MAX(started_at) as latest_session
      FROM ${backupTableName}
    `);

    const stats = backupStats.rows[0];
    console.log(`📊 Backup validation:`);
    console.log(`  - Sessions in backup: ${stats.backup_count}`);
    console.log(`  - Sessions with null project_id: ${stats.null_project_count}`);
    console.log(`  - Date range: ${stats.earliest_session} to ${stats.latest_session}`);

    if (parseInt(stats.backup_count) === 0) {
      errors.push('Backup table is empty');
    }

    // Verify backup sessions exist in main table
    const matchingCount = await db.query(`
      SELECT COUNT(*) as matching_count
      FROM sessions s
      INNER JOIN ${backupTableName} b ON s.id = b.id
    `);

    const matching = parseInt(matchingCount.rows[0].matching_count);
    const backup = parseInt(stats.backup_count);

    if (matching !== backup) {
      errors.push(`Backup/current session mismatch: ${matching} current vs ${backup} backup`);
    }

    return { valid: errors.length === 0, errors };

  } catch (error) {
    errors.push(`Backup validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { valid: false, errors };
  }
}

async function performRollbackVerification(migrationId: string): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    const backupTableName = `sessions_backup_${migrationId.replace(/-/g, '_')}`;
    
    // Verify sessions match backup data
    const verificationQuery = `
      SELECT 
        COUNT(*) as mismatch_count
      FROM sessions s
      INNER JOIN ${backupTableName} b ON s.id = b.id
      WHERE s.project_id IS DISTINCT FROM b.project_id
    `;

    const verification = await db.query(verificationQuery);
    const mismatches = parseInt(verification.rows[0].mismatch_count);

    if (mismatches > 0) {
      errors.push(`Rollback incomplete: ${mismatches} sessions still don't match backup`);
    }

    // Check for any remaining data inconsistencies
    const consistencyCheck = await db.query(`
      SELECT COUNT(*) as orphan_count
      FROM sessions
      WHERE project_id IS NULL
    `);

    const orphanCount = parseInt(consistencyCheck.rows[0].orphan_count);
    console.log(`🔍 Post-rollback verification:`);
    console.log(`  - Sessions with mismatched project_id: ${mismatches}`);
    console.log(`  - Current orphan sessions: ${orphanCount}`);

    return { success: errors.length === 0, errors };

  } catch (error) {
    errors.push(`Verification error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { success: false, errors };
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    await showUsage();
    process.exit(0);
  }

  const migrationId = args[0];
  const dryRun = args.includes('--dry-run') || args.includes('-d');
  const force = args.includes('--force');
  const verify = args.includes('--verify');

  if (!migrationId) {
    console.error('❌ Migration ID is required');
    await showUsage();
    process.exit(1);
  }

  console.log('🔄 TS013 - Session Migration Rollback');
  console.log('═'.repeat(50));
  console.log(`Migration ID: ${migrationId}`);
  console.log(`Dry Run: ${dryRun}`);
  console.log(`Force: ${force}`);
  console.log(`Verify: ${verify}`);
  console.log();

  try {
    // Step 1: Validate backup integrity
    console.log('🔍 Validating backup integrity...');
    const validation = await validateBackupIntegrity(migrationId);
    
    if (!validation.valid) {
      console.log('❌ Backup validation failed:');
      validation.errors.forEach(error => console.log(`  - ${error}`));
      
      if (!force) {
        console.log('\nUse --force to attempt rollback anyway (not recommended)');
        process.exit(1);
      } else {
        console.log('\n⚠️  Proceeding with rollback despite validation failures (--force specified)');
      }
    } else {
      console.log('✅ Backup validation passed');
    }

    // Step 2: Show what would be rolled back (dry run info)
    if (dryRun) {
      console.log('\n📋 Rollback simulation (dry run):');
      const backupTableName = `sessions_backup_${migrationId.replace(/-/g, '_')}`;
      
      const previewQuery = `
        SELECT 
          s.id,
          s.project_id as current_project_id,
          b.project_id as backup_project_id,
          CASE 
            WHEN s.project_id IS DISTINCT FROM b.project_id THEN 'WOULD CHANGE'
            ELSE 'NO CHANGE'
          END as rollback_action
        FROM sessions s
        INNER JOIN ${backupTableName} b ON s.id = b.id
        ORDER BY s.started_at DESC
        LIMIT 10
      `;

      const preview = await db.query(previewQuery);
      console.log('  Sample sessions that would be affected:');
      preview.rows.forEach(row => {
        console.log(`    ${row.id}: ${row.current_project_id || 'NULL'} → ${row.backup_project_id || 'NULL'} (${row.rollback_action})`);
      });

      const totalChanges = await db.query(`
        SELECT COUNT(*) as change_count
        FROM sessions s
        INNER JOIN ${backupTableName} b ON s.id = b.id
        WHERE s.project_id IS DISTINCT FROM b.project_id
      `);

      console.log(`  Total sessions that would be changed: ${totalChanges.rows[0].change_count}`);
      console.log('\n✅ Dry run complete. Use without --dry-run to execute rollback.');
      process.exit(0);
    }

    // Step 3: Perform actual rollback
    console.log('\n🎯 Performing rollback...');
    const rollbackResult = await SessionMigrator.rollbackMigration(migrationId);

    if (!rollbackResult.success) {
      console.error(`❌ Rollback failed: ${rollbackResult.error}`);
      process.exit(1);
    }

    console.log('✅ Rollback completed successfully');

    // Step 4: Verification if requested
    if (verify) {
      console.log('\n🔍 Performing post-rollback verification...');
      const verificationResult = await performRollbackVerification(migrationId);

      if (!verificationResult.success) {
        console.log('❌ Rollback verification failed:');
        verificationResult.errors.forEach(error => console.log(`  - ${error}`));
        console.log('\n⚠️  Rollback may be incomplete. Manual intervention may be required.');
        process.exit(1);
      } else {
        console.log('✅ Rollback verification passed');
      }
    }

    // Step 5: Final status
    const finalHealth = await SessionMigrator.getMigrationHealth();
    console.log(`\n📊 Final state:`);
    console.log(`  - Total sessions: ${finalHealth.totalSessions}`);
    console.log(`  - Orphan sessions: ${finalHealth.orphanSessions}`);

    console.log(`\n🎉 Rollback completed successfully!`);
    console.log(`\n💡 Next steps:`);
    console.log(`  - Review the rollback results above`);
    console.log(`  - Consider cleaning up backup table if no longer needed`);
    console.log(`  - Re-run migration analysis if you plan to retry: npx tsx backfillSessions.ts --dry-run`);

  } catch (error) {
    console.error('\n❌ Rollback operation failed:', error);
    console.error('Manual database recovery may be required.');
    process.exit(1);
  }
}

// Handle CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Script execution failed:', error);
    process.exit(1);
  });
}
