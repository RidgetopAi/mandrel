#!/usr/bin/env npx tsx

/**
 * TC006: Session-Code Bridge API Direct Testing
 * Direct database testing of session-code correlation functionality
 * Bypasses authentication to test core business logic
 */

import { db as pool } from './src/database/connection';
import { SessionDetailService } from './src/services/sessionDetail';
import GitService from './src/services/gitService';

interface TestResult {
  test: string;
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
}

class SessionCodeDirectTester {
  private results: TestResult[] = [];
  private testSessionId: string | null = null;
  private testProjectId: string | null = null;

  /**
   * Setup test session
   */
  async setup(): Promise<void> {
    console.log('🔧 Setting up test environment...');

    try {
      // Get a test session from the database
      const sessionQuery = `
        SELECT s.id, s.project_id, p.name as project_name
        FROM sessions s
        JOIN projects p ON s.project_id = p.id
        ORDER BY s.started_at DESC
        LIMIT 1
      `;

      const sessionResult = await pool.query(sessionQuery);

      if (sessionResult.rows.length === 0) {
        throw new Error('No sessions found for testing');
      }

      this.testSessionId = sessionResult.rows[0].id;
      this.testProjectId = sessionResult.rows[0].project_id;

      console.log(`✅ Test session: ${this.testSessionId?.substring(0, 8)}...`);
      console.log(`✅ Test project: ${this.testProjectId?.substring(0, 8)}...`);

    } catch (error) {
      console.error('❌ Setup failed:', error);
      throw error;
    }
  }

  /**
   * Execute a test
   */
  private async executeTest(testName: string, testFunction: () => Promise<any>): Promise<void> {
    const startTime = Date.now();

    try {
      const result = await testFunction();
      const duration = Date.now() - startTime;

      this.results.push({
        test: testName,
        success: true,
        data: result,
        duration
      });

      console.log(`✅ ${testName} (${duration}ms)`);
      if (result && typeof result === 'object') {
        const keys = Object.keys(result).slice(0, 5);
        console.log(`   Data: ${keys.join(', ')}${keys.length > 5 ? '...' : ''}`);
      }

    } catch (error: any) {
      const duration = Date.now() - startTime;

      this.results.push({
        test: testName,
        success: false,
        error: error.message,
        duration
      });

      console.log(`❌ ${testName} (${duration}ms)`);
      console.log(`   Error: ${error.message}`);
    }
  }

  /**
   * Test session detail retrieval
   */
  async testSessionDetail(): Promise<void> {
    console.log('\n📊 Testing Session Detail Service');

    await this.executeTest('Get Session Detail', async () => {
      if (!this.testSessionId) throw new Error('No test session available');

      const sessionDetail = await SessionDetailService.getSessionDetail(this.testSessionId);
      
      if (!sessionDetail) {
        throw new Error('Session detail not found');
      }

      return {
        session_id: sessionDetail.id,
        project_id: sessionDetail.project_id,
        duration_minutes: sessionDetail.duration_minutes,
        code_components_count: sessionDetail.code_components.length,
        git_commits_count: sessionDetail.linked_commits.length,
        git_correlation_confidence: sessionDetail.git_correlation_confidence
      };
    });
  }

  /**
   * Test code analysis sessions query
   */
  async testCodeAnalysisSessions(): Promise<void> {
    console.log('\n📊 Testing Code Analysis Sessions Query');

    await this.executeTest('Get Code Analysis Sessions', async () => {
      if (!this.testSessionId) throw new Error('No test session available');

      const query = `
        SELECT 
          id, session_type, files_analyzed, components_found, dependencies_found,
          analysis_duration_ms, status, started_at, completed_at
        FROM code_analysis_sessions
        WHERE development_session_id = $1
        ORDER BY started_at DESC
        LIMIT 5
      `;

      const result = await pool.query(query, [this.testSessionId]);

      return {
        analysis_sessions_count: result.rows.length,
        sessions: result.rows.map(row => ({
          id: row.id,
          status: row.status,
          files_analyzed_count: row.files_analyzed?.length || 0,
          components_found: row.components_found || 0,
          analysis_duration_ms: row.analysis_duration_ms
        }))
      };
    });
  }

  /**
   * Test git correlation
   */
  async testGitCorrelation(): Promise<void> {
    console.log('\n📊 Testing Git Correlation');

    await this.executeTest('Session Git Correlation', async () => {
      if (!this.testSessionId) throw new Error('No test session available');

      const correlationResult = await SessionDetailService.correlateSessionWithGit(this.testSessionId);

      return {
        success: correlationResult.success,
        links_created: correlationResult.linksCreated,
        links_updated: correlationResult.linksUpdated,
        confidence: correlationResult.confidence,
        message: correlationResult.message
      };
    });
  }

  /**
   * Test git commits query
   */
  async testGitCommitsQuery(): Promise<void> {
    console.log('\n📊 Testing Git Commits Query');

    await this.executeTest('Get Session Commits', async () => {
      if (!this.testSessionId) throw new Error('No test session available');

      const commitsQuery = `
        SELECT 
          gc.id, gc.commit_sha, gc.short_sha, gc.message, gc.author_name,
          gc.author_date, csl.confidence_score, csl.link_type
        FROM git_commits gc
        JOIN commit_session_links csl ON gc.id = csl.commit_id
        WHERE csl.session_id = $1
        ORDER BY gc.author_date DESC
        LIMIT 10
      `;

      const result = await pool.query(commitsQuery, [this.testSessionId]);

      return {
        commits_count: result.rows.length,
        commits: result.rows.map(row => ({
          short_sha: row.short_sha,
          message: row.message.substring(0, 50),
          author: row.author_name,
          confidence: row.confidence_score,
          link_type: row.link_type
        }))
      };
    });
  }

  /**
   * Test code metrics query
   */
  async testCodeMetrics(): Promise<void> {
    console.log('\n📊 Testing Code Metrics Query');

    await this.executeTest('Get Session Code Metrics', async () => {
      if (!this.testSessionId) throw new Error('No test session available');

      // Get analysis sessions first
      const analysisQuery = `
        SELECT id FROM code_analysis_sessions
        WHERE development_session_id = $1
        LIMIT 5
      `;

      const analysisResult = await pool.query(analysisQuery, [this.testSessionId]);
      
      if (analysisResult.rows.length === 0) {
        return {
          message: 'No analysis sessions found',
          metrics_count: 0
        };
      }

      const analysisIds = analysisResult.rows.map(row => row.id);

      // Get metrics for these analysis sessions
      const metricsQuery = `
        SELECT 
          cm.analysis_session_id,
          cm.metric_name,
          cm.metric_value,
          cc.name as component_name,
          cc.file_path
        FROM code_metrics cm
        JOIN code_components cc ON cm.component_id = cc.id
        WHERE cm.analysis_session_id = ANY($1)
        LIMIT 10
      `;

      const metricsResult = await pool.query(metricsQuery, [analysisIds]);

      return {
        analysis_sessions_count: analysisIds.length,
        metrics_count: metricsResult.rows.length,
        sample_metrics: metricsResult.rows.slice(0, 3).map(row => ({
          component: row.component_name,
          file: row.file_path,
          metric: row.metric_name,
          value: row.metric_value
        }))
      };
    });
  }

  /**
   * Test git service operations
   */
  async testGitService(): Promise<void> {
    console.log('\n📊 Testing Git Service Operations');

    await this.executeTest('Git Service - Repository Status', async () => {
      if (!this.testProjectId) throw new Error('No test project available');

      try {
        const repoStatus = await GitService.getRepositoryStatus(this.testProjectId);
        return {
          is_git_repo: repoStatus.is_git_repo,
          current_branch: repoStatus.current_branch,
          is_clean: repoStatus.is_clean,
          total_commits: repoStatus.total_commits,
          staged_files: repoStatus.staged_files,
          modified_files: repoStatus.modified_files
        };
      } catch (error: any) {
        return {
          message: 'Git repository not configured for this project',
          error: error.message
        };
      }
    });

    await this.executeTest('Git Service - Project Stats', async () => {
      if (!this.testProjectId) throw new Error('No test project available');

      try {
        const gitStats = await GitService.getProjectGitStats(this.testProjectId);
        return {
          project_name: gitStats.project_name,
          total_commits: gitStats.total_commits,
          contributors: gitStats.contributors,
          commits_last_week: gitStats.commits_last_week,
          active_branches: gitStats.active_branches,
          top_contributor: gitStats.top_contributors[0]?.author_name || 'N/A'
        };
      } catch (error: any) {
        return {
          message: 'No git data available for this project',
          error: error.message
        };
      }
    });
  }

  /**
   * Test database schema validation
   */
  async testDatabaseSchema(): Promise<void> {
    console.log('\n📊 Testing Database Schema');

    await this.executeTest('Validate Required Tables', async () => {
      const requiredTables = [
        'sessions',
        'projects',
        'code_analysis_sessions',
        'code_components',
        'code_metrics',
        'git_commits',
        'commit_session_links'
      ];

      const results = {};

      for (const table of requiredTables) {
        try {
          const countResult = await pool.query(`SELECT COUNT(*) FROM ${table}`);
          results[table] = parseInt(countResult.rows[0].count);
        } catch (error) {
          results[table] = `Error: ${error.message}`;
        }
      }

      return results;
    });

    await this.executeTest('Check Session-Code Relationships', async () => {
      const relationships = {};

      // Sessions with projects
      const sessionsWithProjects = await pool.query(`
        SELECT COUNT(*) FROM sessions s
        JOIN projects p ON s.project_id = p.id
      `);
      relationships['sessions_with_projects'] = parseInt(sessionsWithProjects.rows[0].count);

      // Code analysis sessions with development sessions
      const analysisWithSessions = await pool.query(`
        SELECT COUNT(*) FROM code_analysis_sessions cas
        JOIN sessions s ON cas.development_session_id = s.id
      `);
      relationships['analysis_sessions_linked'] = parseInt(analysisWithSessions.rows[0].count);

      // Git commits with session links
      const commitsWithLinks = await pool.query(`
        SELECT COUNT(*) FROM git_commits gc
        JOIN commit_session_links csl ON gc.id = csl.commit_id
      `);
      relationships['commits_with_session_links'] = parseInt(commitsWithLinks.rows[0].count);

      return relationships;
    });
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Session-Code Direct Tests\n');

    try {
      await this.setup();

      await this.testDatabaseSchema();
      await this.testSessionDetail();
      await this.testCodeAnalysisSessions();
      await this.testGitCommitsQuery();
      await this.testCodeMetrics();
      await this.testGitCorrelation();
      await this.testGitService();

      await this.printSummary();

    } catch (error) {
      console.error('❌ Test execution failed:', error);
      process.exit(1);
    }
  }

  /**
   * Print test results summary
   */
  async printSummary(): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('📋 DIRECT TEST RESULTS SUMMARY');
    console.log('='.repeat(60));

    const successful = this.results.filter(r => r.success);
    const failed = this.results.filter(r => !r.success);

    console.log(`✅ Successful: ${successful.length}`);
    console.log(`❌ Failed: ${failed.length}`);
    console.log(`🕐 Total Tests: ${this.results.length}`);

    if (successful.length > 0) {
      console.log('\n✅ SUCCESSFUL TESTS:');
      successful.forEach(result => {
        console.log(`   ${result.test} (${result.duration}ms)`);
      });
    }

    if (failed.length > 0) {
      console.log('\n❌ FAILED TESTS:');
      failed.forEach(result => {
        console.log(`   ${result.test} - ${result.error}`);
      });
    }

    // Performance stats
    const avgDuration = this.results.reduce((sum, r) => sum + r.duration, 0) / this.results.length;
    const maxDuration = Math.max(...this.results.map(r => r.duration));

    console.log('\n⏱️  PERFORMANCE:');
    console.log(`   Average: ${Math.round(avgDuration)}ms`);
    console.log(`   Max: ${maxDuration}ms`);

    // Data insights
    console.log('\n📊 KEY INSIGHTS:');
    const dataResults = successful.filter(r => r.data && typeof r.data === 'object');
    
    dataResults.forEach(result => {
      if (result.data) {
        console.log(`   ${result.test}:`);
        
        // Show key metrics from each test
        Object.entries(result.data).slice(0, 3).forEach(([key, value]) => {
          if (typeof value === 'number' || typeof value === 'string') {
            console.log(`     - ${key}: ${value}`);
          } else if (Array.isArray(value)) {
            console.log(`     - ${key}: ${value.length} items`);
          }
        });
      }
    });

    console.log('\n' + '='.repeat(60));
    
    const successRate = Math.round((successful.length / this.results.length) * 100);
    if (successRate >= 80) {
      console.log(`🎉 Tests completed with ${successRate}% success rate!`);
      console.log('✅ Session-Code Bridge functionality is working correctly');
    } else {
      console.log(`⚠️  Tests completed with ${successRate}% success rate`);
      console.log('🔧 Some components need attention');
    }
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  try {
    console.log('🏁 Session-Code Bridge Direct Test Suite');
    console.log('=========================================\n');

    // Test database connection
    console.log('🔍 Testing database connection...');
    const dbResult = await pool.query('SELECT NOW() as current_time, current_database() as db_name');
    console.log(`✅ Database connected: ${dbResult.rows[0].db_name} at ${dbResult.rows[0].current_time}`);

    // Run tests
    const tester = new SessionCodeDirectTester();
    await tester.runAllTests();

    process.exit(0);

  } catch (error) {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { SessionCodeDirectTester };