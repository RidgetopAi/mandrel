/**
 * TS013 - Enhanced Session Migration Script
 * 
 * Production-ready session migration with comprehensive validation,
 * safety features, and integration with TS012 validation framework.
 * 
 * Features:
 * - Pre-migration analysis with confidence scoring
 * - Dry-run mode for safe testing
 * - Transaction-based migration with rollback capability
 * - Comprehensive audit trails and reporting
 * - Integration with TS012 validation framework
 */
import { SessionMigrator } from '../services/sessionMigrator.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

interface ScriptOptions {
  dryRun: boolean;
  skipValidation: boolean;
  skipLowConfidence: boolean;
  generateReport: boolean;
  interactive: boolean;
}

async function parseArgs(): Promise<ScriptOptions> {
  const args = process.argv.slice(2);
  
  return {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    skipValidation: args.includes('--skip-validation'),
    skipLowConfidence: args.includes('--skip-low-confidence') || args.includes('-s'),
    generateReport: args.includes('--report') || args.includes('-r'),
    interactive: args.includes('--interactive') || args.includes('-i'),
  };
}

async function showUsage(): Promise<void> {
  console.log(`
TS013 - Enhanced Session Migration Script

USAGE:
  npx tsx backfillSessions.ts [options]

OPTIONS:
  -d, --dry-run              Run migration analysis without making changes
  -s, --skip-low-confidence  Skip tentative and manual-review sessions
  --skip-validation          Skip TS012 validation (not recommended)
  -r, --report               Generate detailed migration report file
  -i, --interactive          Interactive mode with confirmation prompts
  -h, --help                 Show this help message

EXAMPLES:
  npx tsx backfillSessions.ts --dry-run                    # Analyze without changes
  npx tsx backfillSessions.ts --dry-run --report           # Analysis with report
  npx tsx backfillSessions.ts --skip-low-confidence        # Migrate only confident assignments
  npx tsx backfillSessions.ts --interactive                # Interactive migration with prompts
  
SAFETY FEATURES:
  - Automatic database backup before migration
  - Transaction-based operations with rollback capability
  - TS012 validation framework integration
  - Comprehensive audit trails and logging
  - Rollback command: npx tsx rollbackMigration.ts <migration-id>
`);
}

async function promptConfirmation(message: string): Promise<boolean> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function generateReportFile(plan: any, report?: any): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = join(process.cwd(), `migration-report-${timestamp}.json`);
  
  const reportData = {
    timestamp,
    migrationPlan: plan,
    migrationReport: report,
    generatedBy: 'TS013 Enhanced Session Migration Script'
  };

  writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
  return reportPath;
}

async function main(): Promise<void> {
  console.log('🚀 TS013 - Enhanced Session Migration Script');
  console.log('═'.repeat(60));

  const options = await parseArgs();

  // Show help if requested
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    await showUsage();
    process.exit(0);
  }

  console.log(`Configuration:`);
  console.log(`  - Dry Run: ${options.dryRun}`);
  console.log(`  - Skip Validation: ${options.skipValidation}`);
  console.log(`  - Skip Low Confidence: ${options.skipLowConfidence}`);
  console.log(`  - Generate Report: ${options.generateReport}`);
  console.log(`  - Interactive: ${options.interactive}`);
  console.log();

  try {
    // Step 1: Check current state
    console.log('📊 Checking current migration state...');
    const health = await SessionMigrator.getMigrationHealth();
    console.log(`  - Total sessions: ${health.totalSessions}`);
    console.log(`  - Orphan sessions: ${health.orphanSessions}`);
    
    if (health.orphanSessions === 0) {
      console.log('✅ No orphan sessions found. Migration not needed.');
      process.exit(0);
    }

    // Step 2: Analyze sessions and create migration plan
    console.log('\n🔍 Analyzing orphan sessions...');
    const migrationPlan = await SessionMigrator.analyzeOrphanSessions();
    
    console.log(`\n📋 Migration Plan Summary:`);
    console.log(`  - Total Sessions: ${migrationPlan.summary.total}`);
    console.log(`  - Confident Assignments: ${migrationPlan.summary.confident}`);
    console.log(`  - Tentative Assignments: ${migrationPlan.summary.tentative}`);
    console.log(`  - Manual Review Needed: ${migrationPlan.summary.manual_review}`);
    console.log(`  - Will Remain Unassigned: ${migrationPlan.summary.unassigned}`);

    if (migrationPlan.risks.length > 0) {
      console.log(`\n⚠️  Migration Risks:`);
      migrationPlan.risks.forEach(risk => console.log(`    - ${risk}`));
    }

    if (migrationPlan.recommendations.length > 0) {
      console.log(`\n💡 Recommendations:`);
      migrationPlan.recommendations.forEach(rec => console.log(`    - ${rec}`));
    }

    // Step 3: Interactive confirmation if enabled
    if (options.interactive && !options.dryRun) {
      console.log();
      const proceed = await promptConfirmation(
        `Proceed with migration of ${migrationPlan.summary.total} sessions?`
      );
      
      if (!proceed) {
        console.log('Migration cancelled by user.');
        process.exit(0);
      }

      // Additional confirmation for risky migrations
      if (migrationPlan.risks.length > 0) {
        const proceedRisky = await promptConfirmation(
          `Migration has ${migrationPlan.risks.length} identified risks. Continue anyway?`
        );
        
        if (!proceedRisky) {
          console.log('Migration cancelled due to risks.');
          process.exit(0);
        }
      }
    }

    // Step 4: Execute migration
    console.log('\n🎯 Executing migration plan...');
    const migrationReport = await SessionMigrator.executeMigrationPlan(migrationPlan, {
      dryRun: options.dryRun,
      skipValidation: options.skipValidation,
      skipLowConfidence: options.skipLowConfidence
    });

    // Step 5: Display results
    console.log(`\n📈 Migration ${options.dryRun ? 'Simulation' : 'Execution'} Results:`);
    console.log(`  - Total Processed: ${migrationReport.summary.total}`);
    console.log(`  - Successful: ${migrationReport.summary.successful}`);
    console.log(`  - Failed: ${migrationReport.summary.failed}`);
    console.log(`  - Skipped: ${migrationReport.summary.skipped}`);
    
    if (migrationReport.rollbacksPerformed > 0) {
      console.log(`  - Rollbacks Performed: ${migrationReport.rollbacksPerformed}`);
    }

    if (migrationReport.errors.length > 0) {
      console.log(`\n❌ Errors (${migrationReport.errors.length}):`);
      migrationReport.errors.forEach(error => console.log(`    - ${error}`));
    }

    // Step 6: Generate report file if requested
    let reportPath: string | undefined;
    if (options.generateReport) {
      reportPath = await generateReportFile(migrationPlan, migrationReport);
      console.log(`\n📄 Detailed report saved to: ${reportPath}`);
    }

    // Step 7: Final verification if not dry run
    if (!options.dryRun) {
      console.log('\n🔍 Final verification...');
      const finalHealth = await SessionMigrator.getMigrationHealth();
      console.log(`  - Remaining orphan sessions: ${finalHealth.orphanSessions}`);
      
      if (finalHealth.orphanSessions === 0) {
        console.log('🎉 All orphan sessions successfully migrated!');
      } else if (finalHealth.orphanSessions < health.orphanSessions) {
        const migrated = health.orphanSessions - finalHealth.orphanSessions;
        console.log(`✅ Successfully migrated ${migrated} sessions. ${finalHealth.orphanSessions} remain (likely skipped or failed).`);
      }
    }

    // Step 8: Next steps guidance
    if (!options.dryRun && migrationReport.summary.failed > 0) {
      console.log(`\n🔧 Next Steps:`);
      console.log(`  - Review failed migrations in the ${reportPath ? 'report file' : 'logs above'}`);
      console.log(`  - Consider manual intervention for failed sessions`);
      console.log(`  - Run rollback if necessary: npx tsx rollbackMigration.ts ${migrationPlan.migrationId}`);
    } else if (options.dryRun) {
      console.log(`\n🔧 Next Steps:`);
      console.log(`  - Review the analysis above and report file (if generated)`);
      console.log(`  - Run actual migration: npx tsx backfillSessions.ts`);
      console.log(`  - Or skip low-confidence: npx tsx backfillSessions.ts --skip-low-confidence`);
    }

    console.log(`\n✅ TS013 migration ${options.dryRun ? 'analysis' : 'execution'} complete!`);

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error('Check logs above for details. If migration was started, consider rollback.');
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
