#!/usr/bin/env npx tsx
/**
 * Setup Git Tracking for AIDIS Projects
 *
 * This script initializes git tracking for a project by:
 * 1. Setting the project's root_directory
 * 2. Scanning the git repository
 * 3. Importing git commits into the database
 *
 * Usage:
 *   npx tsx setup-git-tracking.ts <project-name> <git-repo-path>
 *
 * Example:
 *   npx tsx setup-git-tracking.ts "AIDIS COMMAND" /home/ridgetop/aidis
 */

import { GitService } from './src/services/gitService';
import { db as pool } from './src/database/connection';

async function setupGitTracking() {
  const args = process.argv.slice(2);

  if (args.length !== 2) {
    console.error('❌ Usage: npx tsx setup-git-tracking.ts <project-name> <git-repo-path>');
    console.error('');
    console.error('Example:');
    console.error('  npx tsx setup-git-tracking.ts "AIDIS COMMAND" /home/ridgetop/aidis');
    console.error('');
    process.exit(1);
  }

  const [projectName, repoPath] = args;

  console.log('🚀 Setting up Git Tracking');
  console.log('=' .repeat(80));
  console.log(`Project Name: ${projectName}`);
  console.log(`Repository Path: ${repoPath}`);
  console.log('');

  try {
    // Step 1: Find the project
    console.log('1️⃣ Finding project in database...');
    const projectResult = await pool.query(
      'SELECT id, name, root_directory, git_repo_url FROM projects WHERE name = $1',
      [projectName]
    );

    if (projectResult.rows.length === 0) {
      console.error(`❌ Project "${projectName}" not found in database`);
      console.log('\nAvailable projects:');
      const allProjects = await pool.query('SELECT name FROM projects ORDER BY name');
      allProjects.rows.forEach(p => console.log(`  - ${p.name}`));
      process.exit(1);
    }

    const project = projectResult.rows[0];
    console.log(`✅ Found project: ${project.name} (${project.id})`);

    // Step 2: Update project root_directory
    console.log('\n2️⃣ Updating project root_directory...');
    await pool.query(
      'UPDATE projects SET root_directory = $1 WHERE id = $2',
      [repoPath, project.id]
    );
    console.log(`✅ Set root_directory to: ${repoPath}`);

    // Step 3: Initialize git repository tracking
    console.log('\n3️⃣ Initializing git repository...');
    const initResult = await GitService.initializeRepository({
      project_id: project.id,
      repo_path: repoPath
    });

    console.log('✅ Git repository initialized successfully!');
    console.log(`   - Commits collected: ${initResult.initial_commits_collected}`);
    console.log(`   - Branches found: ${initResult.branch_count}`);

    // Step 4: Show summary
    console.log('\n4️⃣ Verifying git data...');
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total_commits,
        SUM(insertions) as total_insertions,
        SUM(deletions) as total_deletions,
        MAX(committer_date) as latest_commit_date
      FROM git_commits
      WHERE project_id = $1
    `, [project.id]);

    const stats = statsResult.rows[0];
    console.log('✅ Git tracking is now active!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   Total Commits: ${stats.total_commits}`);
    console.log(`   Lines Added: +${stats.total_insertions || 0}`);
    console.log(`   Lines Removed: -${stats.total_deletions || 0}`);
    console.log(`   Latest Commit: ${stats.latest_commit_date ? new Date(stats.latest_commit_date).toLocaleString() : 'N/A'}`);
    console.log('');
    console.log('🎉 Done! Project Insights will now show git activity.');

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    console.error('\nStack trace:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupGitTracking();
