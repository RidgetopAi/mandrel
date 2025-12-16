import { initializeDatabase, closeDatabase } from '../mcp-server/src/config/database.js';
import { tasksHandler } from '../mcp-server/src/handlers/tasks.js';

const PROJECT_ID = '4afb236c-00d7-433d-87de-0f489b96acb2';

const phase2Tasks = [
  {
    title: 'P2.1: Select unified migration framework',
    description: 'Evaluate existing migration tooling, select a single framework (migrate-pg vs Prisma), and document adoption plan for AIDIS.',
    type: 'refactor',
    priority: 'high',
    tags: ['phase-2', 'oracle-refactor', 'migration']
  },
  {
    title: 'P2.1: Merge migration version tables',
    description: 'Consolidate legacy migration version tracking tables into schema_migrations with consistent sequencing.',
    type: 'refactor',
    priority: 'high',
    tags: ['phase-2', 'oracle-refactor', 'schema']
  },
  {
    title: 'P2.1: Consolidated migration history',
    description: 'Create the canonical migration history artifact covering all historical migrations and validate against production state.',
    type: 'refactor',
    priority: 'medium',
    tags: ['phase-2', 'oracle-refactor', 'history']
  },
  {
    title: 'P2.1: Remove duplicate migration tracking',
    description: 'Decommission superseded migration tracking systems and ensure CI/CD uses the unified workflow.',
    type: 'refactor',
    priority: 'medium',
    tags: ['phase-2', 'oracle-refactor', 'cleanup']
  },
  {
    title: 'P2.2: Normalize git tracking tables',
    description: 'Retain 010_create_git_tracking_system.sql, remove duplicates, and reconcile downstream dependencies.',
    type: 'refactor',
    priority: 'high',
    tags: ['phase-2', 'oracle-refactor', 'git']
  },
  {
    title: 'P2.2: Standardize embedding dimensions',
    description: 'Ensure all embedding columns use vector(1536) with appropriate constraints and migrations.',
    type: 'refactor',
    priority: 'high',
    tags: ['phase-2', 'oracle-refactor', 'embedding']
  },
  {
    title: 'P2.2: Apply complexity tracking migration',
    description: 'Apply the missing 015_create_code_complexity_tracking.sql migration and align ORM/data models.',
    type: 'refactor',
    priority: 'medium',
    tags: ['phase-2', 'oracle-refactor', 'complexity']
  },
  {
    title: 'P2.2: Merge pattern detection schemas',
    description: 'Unify competing pattern detection tables and ensure services use the consolidated schema.',
    type: 'refactor',
    priority: 'medium',
    tags: ['phase-2', 'oracle-refactor', 'patterns']
  },
  {
    title: 'P2.3: Create phase 2 shadow tables',
    description: 'Provision shadow tables that reflect the target consolidated schema for backfill and validation.',
    type: 'refactor',
    priority: 'high',
    tags: ['phase-2', 'oracle-refactor', 'shadow-tables']
  },
  {
    title: 'P2.3: Implement dual-write validation',
    description: 'Introduce dual-write logic for 48-hour validation window to compare legacy and new tables.',
    type: 'refactor',
    priority: 'high',
    tags: ['phase-2', 'oracle-refactor', 'dual-write']
  },
  {
    title: 'P2.3: Backfill and reindex consolidated schema',
    description: 'Backfill shadow tables via CTAS, perform reindexing, and verify integrity/performance baselines.',
    type: 'refactor',
    priority: 'medium',
    tags: ['phase-2', 'oracle-refactor', 'backfill']
  },
  {
    title: 'P2.3: Feature flag cutover to new schema',
    description: 'Cut production workload to the new schema through feature flags with staged rollout and monitoring.',
    type: 'refactor',
    priority: 'high',
    tags: ['phase-2', 'oracle-refactor', 'cutover']
  },
  {
    title: 'P2.3: Retire legacy tables post-validation',
    description: 'Remove or archive legacy tables after validation window and confirm rollback plan is documented.',
    type: 'refactor',
    priority: 'medium',
    tags: ['phase-2', 'oracle-refactor', 'cleanup']
  }
];

const metadata = {
  plan: 'ORACLE_REFACTOR',
  phase: '2'
};

function log(msg) {
  console.log(`[phase2] ${msg}`);
}

(async () => {
  await initializeDatabase();
  log('Database connection initialized');

  const existingTasks = await tasksHandler.listTasks(PROJECT_ID);
  const existingTitles = new Set(existingTasks.map(task => task.title));
  log(`Found ${existingTasks.length} existing tasks for project`);

  const results = [];

  for (const task of phase2Tasks) {
    if (existingTitles.has(task.title)) {
      log(`Skipping existing task: ${task.title}`);
      continue;
    }

    const created = await tasksHandler.createTask(
      PROJECT_ID,
      task.title,
      task.description,
      task.type,
      task.priority,
      undefined,
      undefined,
      task.tags,
      [],
      { ...metadata }
    );
    results.push(created);
    log(`Created task ${created.id} :: ${created.title}`);
  }

  log(`Completed creation. Added ${results.length} task(s).`);
  await closeDatabase();
})();
