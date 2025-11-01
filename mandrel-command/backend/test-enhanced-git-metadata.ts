#!/usr/bin/env npx tsx
/**
 * TC007: Test Enhanced Git Commit Metadata Collection
 * Tests the comprehensive git commit metadata storage capabilities
 */

import { GitService } from './src/services/gitService';
import { db as pool } from './src/database/connection';

async function testEnhancedGitMetadata() {
  console.log('🔬 TC007: Testing Enhanced Git Commit Metadata Collection');
  console.log('=' .repeat(80));
  
  try {
    // Test with existing project
    const testProjectId = '7f12c4b2-a654-4ffb-9ab9-ca286195f9b9'; // api-backend project
    const currentRepoPath = process.cwd();
    
    console.log(`\n📂 Testing with repository: ${currentRepoPath}`);
    
    // Step 1: Initialize repository with enhanced metadata collection
    console.log('\n1️⃣ Initializing repository with enhanced metadata...');
    const initResult = await GitService.initializeRepository({
      project_id: testProjectId,
      repo_path: currentRepoPath,
      remote_url: 'https://github.com/example/aidis-backend'
    });
    
    console.log('✅ Repository initialized:', {
      project_id: initResult.project_id,
      commits_collected: initResult.initial_commits_collected,
      branch_count: initResult.branch_count
    });
    
    // Step 2: Test enhanced commit data collection
    console.log('\n2️⃣ Collecting recent commits with enhanced metadata...');
    const collectResult = await GitService.collectCommitData({
      project_id: testProjectId,
      limit: 10,
      force_refresh: true
    });
    
    console.log('✅ Enhanced commit data collected:', {
      commits_collected: collectResult.commits_collected,
      file_changes_tracked: collectResult.file_changes_tracked,
      processing_time: `${collectResult.processing_time_ms}ms`
    });
    
    // Step 3: Test commit metadata queries
    console.log('\n3️⃣ Testing metadata query capabilities...');
    
    // Query commits by author
    const authorQuery = await GitService.queryCommitsByMetadata({
      project_id: testProjectId,
      limit: 5
    });
    
    console.log('📊 Metadata query results:', {
      total_commits: authorQuery.total_count,
      authors: authorQuery.metadata_summary.authors.length,
      commit_types: authorQuery.metadata_summary.commit_types,
      avg_files_changed: authorQuery.metadata_summary.avg_files_changed
    });
    
    // Step 4: Test individual commit analysis
    if (authorQuery.commits.length > 0) {
      console.log('\n4️⃣ Testing commit metadata analysis...');
      const firstCommit = authorQuery.commits[0];
      
      const analysis = await GitService.getCommitMetadataAnalysis(
        testProjectId, 
        firstCommit.commit_sha
      );
      
      console.log('🔍 Commit analysis results:', {
        commit_sha: analysis.commit.commit_sha.substring(0, 12),
        complexity_score: analysis.analysis.complexity_score,
        risk_assessment: analysis.analysis.risk_assessment,
        file_changes: analysis.file_changes.length,
        languages_affected: analysis.analysis.languages_affected,
        test_coverage_impact: analysis.analysis.test_coverage_impact
      });
      
      // Display enhanced metadata
      if (analysis.commit.metadata) {
        console.log('📋 Enhanced commit metadata:', {
          message_analysis: analysis.commit.metadata.message_analysis,
          branches: analysis.commit.metadata.branches,
          commit_size: analysis.commit.metadata.commit_size,
          gpg_signature: analysis.commit.metadata.gpg_signature
        });
      }
    }
    
    // Step 5: Test file change hotspots
    console.log('\n5️⃣ Testing file change hotspots analysis...');
    const hotspots = await GitService.getFileChangeHotspots(testProjectId, {
      limit: 10,
      min_changes: 1
    });
    
    console.log('🔥 File change hotspots:', {
      total_hotspots: hotspots.summary.total_hotspots,
      high_risk_files: hotspots.summary.high_risk_files,
      most_active_category: hotspots.summary.most_active_category
    });
    
    if (hotspots.hotspots.length > 0) {
      console.log('📈 Top hotspots:');
      hotspots.hotspots.slice(0, 3).forEach((hotspot, index) => {
        console.log(`   ${index + 1}. ${hotspot.file_path}`);
        console.log(`      Changes: ${hotspot.change_count}, Contributors: ${hotspot.contributor_count}`);
        console.log(`      Risk Score: ${hotspot.risk_score}, Category: ${hotspot.file_category}`);
      });
    }
    
    // Step 6: Test recent commits with time filtering
    console.log('\n6️⃣ Testing recent commits query...');
    const recentCommits = await GitService.getRecentCommits({
      project_id: testProjectId,
      hours: 168 // Last week
    });
    
    console.log('⏰ Recent commits (last week):', {
      commits_found: recentCommits.commits.length,
      time_range: `${recentCommits.time_range_hours} hours`
    });
    
    // Step 7: Display sample enhanced metadata from database
    console.log('\n7️⃣ Verifying enhanced metadata in database...');
    const dbResult = await pool.query(`
      SELECT commit_sha, short_sha, message, metadata, files_changed, insertions, deletions
      FROM git_commits 
      WHERE project_id = $1 
      ORDER BY author_date DESC 
      LIMIT 3
    `, [testProjectId]);
    
    console.log('💾 Database verification - Enhanced metadata stored:');
    dbResult.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. ${row.short_sha} - ${row.message.substring(0, 50)}...`);
      console.log(`      Files: ${row.files_changed}, Lines: +${row.insertions}/-${row.deletions}`);
      if (row.metadata?.branches) {
        console.log(`      Branches: ${row.metadata.branches.join(', ')}`);
      }
      if (row.metadata?.message_analysis?.conventional_commit) {
        console.log(`      Conventional commit: ${row.metadata.message_analysis.type}`);
      }
    });
    
    console.log('\n✅ All enhanced git metadata tests completed successfully!');
    console.log('\n📋 Test Summary:');
    console.log(`   ✓ Repository initialization with enhanced metadata`);
    console.log(`   ✓ Enhanced commit data collection`);
    console.log(`   ✓ Metadata query capabilities`);
    console.log(`   ✓ Individual commit analysis`);
    console.log(`   ✓ File change hotspots analysis`);
    console.log(`   ✓ Time-based commit filtering`);
    console.log(`   ✓ Database metadata verification`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    // Clean up test data
    try {
      console.log('\n🧹 Cleaning up test data...');
      await pool.query('DELETE FROM git_file_changes WHERE project_id = $1', [testProjectId]);
      await pool.query('DELETE FROM git_commits WHERE project_id = $1', [testProjectId]);
      await pool.query('DELETE FROM git_branches WHERE project_id = $1', [testProjectId]);
      console.log('✅ Test data cleaned up');
    } catch (error: any) {
      console.warn('⚠️ Error cleaning up test data:', error.message);
    }
    
    // Close database connection
    await pool.end();
  }
}

// Run the test
if (require.main === module) {
  testEnhancedGitMetadata().catch(console.error);
}

export { testEnhancedGitMetadata };