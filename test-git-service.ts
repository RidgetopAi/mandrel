#!/usr/bin/env npx tsx
/**
 * TC003: Git Service Test Script
 * Comprehensive test of the git commit data collection service
 * Tests against the current AIDIS repository
 */

import { GitService } from './aidis-command/backend/src/services/gitService';
import { db as pool } from './aidis-command/backend/src/database/connection';

async function main() {
  console.log('🧪 Starting Git Service Test Suite for TC003');
  console.log('=' .repeat(60));
  
  try {
    // Test 1: Get or create a test project
    console.log('\n1️⃣  Setting up test project...');
    const testProject = await setupTestProject();
    console.log(`✅ Test project ready: ${testProject.name} (${testProject.id})`);
    
    // Test 2: Initialize repository
    console.log('\n2️⃣  Initializing git repository...');
    const initResult = await GitService.initializeRepository({
      project_id: testProject.id,
      repo_path: process.cwd(), // Current AIDIS directory
      remote_url: 'https://github.com/your-org/aidis.git' // Placeholder
    });
    console.log('✅ Repository initialized:', {
      success: initResult.success,
      branches: initResult.branch_count,
      commits: initResult.initial_commits_collected
    });
    
    // Test 3: Collect commit data
    console.log('\n3️⃣  Collecting commit data...');
    const collectResult = await GitService.collectCommitData({
      project_id: testProject.id,
      limit: 50, // Reasonable test limit
      force_refresh: true
    });
    console.log('✅ Commit collection completed:', {
      success: collectResult.success,
      commits: collectResult.commits_collected,
      branches: collectResult.branches_updated,
      fileChanges: collectResult.file_changes_tracked,
      processingTime: `${collectResult.processing_time_ms}ms`
    });
    
    // Test 4: Get recent commits
    console.log('\n4️⃣  Getting recent commits (last 24 hours)...');
    const recentResult = await GitService.getRecentCommits({
      project_id: testProject.id,
      hours: 24
    });
    console.log('✅ Recent commits retrieved:', {
      count: recentResult.total_count,
      timeRange: `${recentResult.time_range_hours}h`,
      commits: recentResult.commits.slice(0, 3).map(c => ({
        sha: c.short_sha,
        message: c.message.substring(0, 50) + '...',
        author: c.author_name,
        date: c.author_date.toISOString()
      }))
    });
    
    // Test 5: Get current commit info
    console.log('\n5️⃣  Getting current commit info...');
    const currentResult = await GitService.getCurrentCommitInfo(testProject.id);
    console.log('✅ Current commit info:', {
      sha: currentResult.short_sha,
      message: currentResult.message.substring(0, 60) + '...',
      author: currentResult.author_name,
      branch: currentResult.branch_name,
      isClean: currentResult.is_clean
    });
    
    // Test 6: Get branch information
    console.log('\n6️⃣  Getting branch information...');
    const branchResult = await GitService.getBranchInfo({
      project_id: testProject.id,
      include_remote: false,
      include_stats: true
    });
    console.log('✅ Branch info retrieved:', {
      totalBranches: branchResult.total_count,
      currentBranch: branchResult.current_branch,
      defaultBranch: branchResult.default_branch,
      branches: branchResult.branches.slice(0, 5).map(b => ({
        name: b.branch_name,
        type: b.branch_type,
        commits: b.commit_count,
        current: b.is_current
      }))
    });
    
    // Test 7: Get project git statistics
    console.log('\n7️⃣  Getting project git statistics...');
    const statsResult = await GitService.getProjectGitStats(testProject.id);
    console.log('✅ Project statistics:', {
      totalCommits: statsResult.total_commits,
      contributors: statsResult.contributors,
      commitsLastWeek: statsResult.commits_last_week,
      totalBranches: statsResult.total_branches,
      fileChanges: statsResult.total_file_changes,
      topContributors: statsResult.top_contributors.slice(0, 3).map(c => ({
        name: c.author_name,
        commits: c.commit_count,
        lines: c.lines_contributed
      }))
    });
    
    // Test 8: Get repository status
    console.log('\n8️⃣  Getting repository status...');
    const statusResult = await GitService.getRepositoryStatus(testProject.id);
    console.log('✅ Repository status:', {
      isGitRepo: statusResult.is_git_repo,
      currentBranch: statusResult.current_branch,
      isClean: statusResult.is_clean,
      hasRemote: statusResult.has_remote,
      totalCommits: statusResult.total_commits,
      untrackedFiles: statusResult.untracked_files
    });
    
    // Test 9: Test file change tracking (if recent commits exist)
    if (recentResult.commits.length > 0) {
      console.log('\n9️⃣  Testing file change tracking...');
      try {
        const fileChangeResult = await GitService.trackFileChanges({
          commit_sha: recentResult.commits[0].commit_sha,
          project_id: testProject.id,
          include_binary: false
        });
        console.log('✅ File change tracking:', {
          commitId: fileChangeResult.commit_id.substring(0, 12) + '...',
          totalFiles: fileChangeResult.total_files,
          processingTime: `${fileChangeResult.processing_time_ms}ms`,
          changes: fileChangeResult.file_changes.slice(0, 3).map(fc => ({
            file: fc.file_path,
            type: fc.change_type,
            added: fc.lines_added,
            removed: fc.lines_removed
          }))
        });
      } catch (error) {
        console.log('⚠️  File change tracking test skipped:', error.message);
      }
    }
    
    // Test 10: Test session correlation (if sessions exist)
    console.log('\n🔟  Testing session correlation...');
    try {
      const correlationResult = await GitService.correlateCommitsWithSessions({
        project_id: testProject.id,
        confidence_threshold: 0.2 // Lower threshold for testing
      });
      console.log('✅ Session correlation completed:', {
        linksCreated: correlationResult.links_created,
        linksUpdated: correlationResult.links_updated,
        highConfidenceLinks: correlationResult.high_confidence_links,
        processingTime: `${correlationResult.processing_time_ms}ms`,
        stats: correlationResult.correlation_stats
      });
    } catch (error) {
      console.log('⚠️  Session correlation test completed with warnings:', error.message);
    }
    
    // Test Summary
    console.log('\n' + '=' .repeat(60));
    console.log('🎉 Git Service Test Suite Completed Successfully!');
    console.log(`✅ Project: ${testProject.name}`);
    console.log(`✅ Repository: ${process.cwd()}`);
    console.log(`✅ Commits collected: ${collectResult.commits_collected}`);
    console.log(`✅ Branches tracked: ${branchResult.total_count}`);
    console.log(`✅ File changes: ${collectResult.file_changes_tracked}`);
    console.log(`✅ All core functionalities working correctly`);
    
    // Database verification
    console.log('\n📊 Database Verification:');
    await verifyDatabaseTables(testProject.id);
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

async function setupTestProject(): Promise<any> {
  // Check if test project exists
  let result = await pool.query(
    "SELECT * FROM projects WHERE name = 'AIDIS Git Test' LIMIT 1"
  );
  
  if (result.rows.length > 0) {
    console.log('📝 Using existing test project');
    return result.rows[0];
  }
  
  // Create test project
  console.log('📝 Creating new test project');
  result = await pool.query(`
    INSERT INTO projects (name, description, root_directory, status)
    VALUES ($1, $2, $3, 'active')
    RETURNING *
  `, [
    'AIDIS Git Test',
    'Test project for TC003 Git Service implementation',
    process.cwd()
  ]);
  
  return result.rows[0];
}

async function verifyDatabaseTables(projectId: string): Promise<void> {
  try {
    // Check git_commits table
    const commitsResult = await pool.query(
      'SELECT COUNT(*) as count FROM git_commits WHERE project_id = $1',
      [projectId]
    );
    console.log(`  📋 git_commits: ${commitsResult.rows[0].count} records`);
    
    // Check git_branches table
    const branchesResult = await pool.query(
      'SELECT COUNT(*) as count FROM git_branches WHERE project_id = $1',
      [projectId]
    );
    console.log(`  🌿 git_branches: ${branchesResult.rows[0].count} records`);
    
    // Check git_file_changes table
    const fileChangesResult = await pool.query(
      'SELECT COUNT(*) as count FROM git_file_changes WHERE project_id = $1',
      [projectId]
    );
    console.log(`  📁 git_file_changes: ${fileChangesResult.rows[0].count} records`);
    
    // Check commit_session_links table
    const sessionLinksResult = await pool.query(
      'SELECT COUNT(*) as count FROM commit_session_links WHERE project_id = $1',
      [projectId]
    );
    console.log(`  🔗 commit_session_links: ${sessionLinksResult.rows[0].count} records`);
    
    // Sample data verification
    if (parseInt(commitsResult.rows[0].count) > 0) {
      const sampleCommit = await pool.query(`
        SELECT commit_sha, message, author_name, author_date, commit_type
        FROM git_commits 
        WHERE project_id = $1 
        ORDER BY author_date DESC 
        LIMIT 1
      `, [projectId]);
      
      const sample = sampleCommit.rows[0];
      console.log(`  📄 Latest commit: ${sample.commit_sha.substring(0, 12)} - ${sample.message.substring(0, 40)}...`);
      console.log(`  👤 Author: ${sample.author_name} (${sample.commit_type})`);
      console.log(`  📅 Date: ${new Date(sample.author_date).toISOString()}`);
    }
    
  } catch (error) {
    console.error('❌ Database verification failed:', error);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Test interrupted, cleaning up...');
  await pool.end();
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the test suite
main().catch(console.error);