/**
 * TC003: Git Commit Data Collection Service Implementation
 * Comprehensive git service for AIDIS with commit tracking, branch management, and session correlation
 * Follows existing AIDIS service patterns with robust error handling and TypeScript safety
 */

import { simpleGit, SimpleGit, LogResult } from 'simple-git';
import { db as pool } from '../database/connection';
import path from 'path';
import fs from 'fs';
import {
  GitCommit,
  GitBranch,
  GitFileChange,
  InitializeRepositoryRequest,
  InitializeRepositoryResponse,
  CollectCommitDataRequest,
  CollectCommitDataResponse,
  GetRecentCommitsRequest,
  GetRecentCommitsResponse,
  GetCurrentCommitInfoResponse,
  GetBranchInfoRequest,
  GetBranchInfoResponse,
  TrackFileChangesRequest,
  TrackFileChangesResponse,
  CorrelateCommitsWithSessionsRequest,
  CorrelateCommitsWithSessionsResponse,
  GitProjectStats,
  GitRepositoryStatus,
  GitServiceError,
  BranchInfo,
  CommitType,
  BranchType,
  FileChangeType,
  DEFAULT_GIT_SERVICE_CONFIG,
  GitServiceConfig
} from '../types/git';

/**
 * GitService: Comprehensive git data collection and analysis service
 * Integrates with AIDIS database schema from TC002
 */
export class GitService {
  private static config: GitServiceConfig = DEFAULT_GIT_SERVICE_CONFIG;
  private static repositoryCache = new Map<string, SimpleGit>();

  /**
   * Initialize git repository tracking for a project
   * Sets up git repo access and performs initial data collection
   */
  static async initializeRepository(request: InitializeRepositoryRequest): Promise<InitializeRepositoryResponse> {
    const { project_id, repo_path, remote_url } = request;
    const startTime = Date.now();
    
    try {
      console.log(`🔧 GitService.initializeRepository - Project: ${project_id}, Path: ${repo_path}`);
      
      // Validate project exists
      const project = await this.validateProject(project_id);
      if (!project) {
        throw new Error(`Project ${project_id} not found`);
      }

      // Validate and setup repository
      const resolvedPath = path.resolve(repo_path);
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Repository path does not exist: ${resolvedPath}`);
      }

      // Initialize simple-git instance
      const git = simpleGit(resolvedPath);
      
      // Verify it's a git repository
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        throw new Error(`Path is not a git repository: ${resolvedPath}`);
      }

      // Cache the git instance
      this.repositoryCache.set(project_id, git);
      
      // Get initial repository status
      const status = await git.status();
      const branches = await git.branch(['--all']);
      const branchCount = Object.keys(branches.branches).length;

      // Store repository information in project metadata
      await this.updateProjectGitInfo(project_id, {
        git_repo_path: resolvedPath,
        git_repo_url: remote_url || await this.getRemoteUrl(git),
        git_initialized_at: new Date().toISOString(),
        git_current_branch: status.current || 'main'
      });

      // Perform initial commit collection (limited to recent commits)
      const collectResult = await this.collectCommitData({
        project_id,
        limit: 100, // Initial collection limit
        force_refresh: true
      });

      const processingTime = Date.now() - startTime;
      console.log(`✅ GitService.initializeRepository completed in ${processingTime}ms`);

      return {
        success: true,
        project_id,
        repo_path: resolvedPath,
        branch_count: branchCount,
        initial_commits_collected: collectResult.commits_collected,
        message: `Repository initialized successfully with ${collectResult.commits_collected} commits and ${branchCount} branches`
      };
    } catch (error) {
      console.error('Initialize repository error:', error);
      throw this.createServiceError('INIT_REPO_FAILED', `Failed to initialize repository: ${error}`, { project_id, repo_path });
    }
  }

  /**
   * Collect commit data from git repository and store in database
   * Main function for syncing git history with AIDIS
   */
  static async collectCommitData(request: CollectCommitDataRequest): Promise<CollectCommitDataResponse> {
    const { project_id, limit = 500, since, branch } = request;
    const startTime = Date.now();
    const errors: string[] = [];
    
    try {
      console.log(`📊 GitService.collectCommitData - Project: ${project_id}, Limit: ${limit}`);
      
      // Get git instance
      const git = await this.getGitInstance(project_id);
      
      // Build enhanced log options with comprehensive metadata
      const logOptions: any = {
        maxCount: limit,
        format: {
          hash: '%H',
          short_hash: '%h',
          date: '%ai',
          author_date: '%ad',
          committer_date: '%cd',
          message: '%s',
          body: '%b',
          author_name: '%an',
          author_email: '%ae',
          committer_name: '%cn',
          committer_email: '%ce',
          refs: '%D',
          parent_hashes: '%P',
          tree_hash: '%T',
          subject: '%s',
          body_raw: '%B',
          notes: '%N',
          gpg_key: '%GK',
          gpg_signer: '%GS',
          author_date_rel: '%ar',
          committer_date_rel: '%cr'
        }
      };

      if (since) {
        logOptions.since = since.toISOString();
      }
      if (branch) {
        logOptions.from = branch;
      }

      // Get commit log from git with enhanced metadata
      const log: LogResult = await git.log(logOptions);
      console.log(`📈 Found ${log.all.length} commits to process`);

      let commitsCollected = 0;
      let branchesUpdated = 0;
      let fileChangesTracked = 0;

      // Process commits in batches with enhanced metadata collection
      const batchSize = this.config.batch_size;
      for (let i = 0; i < log.all.length; i += batchSize) {
        const batch = log.all.slice(i, i + batchSize);
        
        try {
          const batchResult = await this.processBatchCommitsWithMetadata(project_id, batch, git);
          commitsCollected += batchResult.commitsProcessed;
          branchesUpdated += batchResult.branchesUpdated;
          fileChangesTracked += batchResult.fileChangesTracked;
        } catch (error) {
          errors.push(`Batch ${i}-${i + batchSize}: ${error}`);
          console.error(`❌ Error processing batch ${i}-${i + batchSize}:`, error);
        }
      }

      const processingTime = Date.now() - startTime;
      console.log(`✅ GitService.collectCommitData completed in ${processingTime}ms`);

      return {
        success: true,
        project_id,
        commits_collected: commitsCollected,
        branches_updated: branchesUpdated,
        file_changes_tracked: fileChangesTracked,
        processing_time_ms: processingTime,
        errors: errors.length > 0 ? errors : []
      };
    } catch (error) {
      console.error('Collect commit data error:', error);
      throw this.createServiceError('COLLECT_COMMITS_FAILED', `Failed to collect commits: ${error}`, request);
    }
  }

  /**
   * Get recent commits within a time window
   */
  static async getRecentCommits(request: GetRecentCommitsRequest): Promise<GetRecentCommitsResponse> {
    const { project_id, hours, branch, author } = request;
    
    try {
      console.log(`🕒 GitService.getRecentCommits - Project: ${project_id}, Hours: ${hours}`);
      
      let sql = `
        SELECT 
          id, project_id, commit_sha, short_sha, message, author_name, author_email,
          author_date, committer_name, committer_email, committer_date, branch_name,
          parent_shas, is_merge_commit, files_changed, insertions, deletions,
          commit_type, tags, metadata, created_at, updated_at
        FROM git_commits
        WHERE project_id = $1 
        AND author_date >= NOW() - INTERVAL '${hours} hours'
      `;
      
      const params: any[] = [project_id];
      let paramIndex = 2;
      
      if (branch) {
        sql += ` AND branch_name = $${paramIndex++}`;
        params.push(branch);
      }
      
      if (author) {
        sql += ` AND author_email = $${paramIndex++}`;
        params.push(author);
      }
      
      sql += ` ORDER BY author_date DESC`;
      
      const result = await pool.query(sql, params);
      
      const commits = result.rows.map(this.mapRowToGitCommit);
      
      return {
        commits,
        total_count: commits.length,
        time_range_hours: hours,
        branch_filter: branch || '',
        author_filter: author || ''
      };
    } catch (error) {
      console.error('Get recent commits error:', error);
      throw this.createServiceError('GET_RECENT_COMMITS_FAILED', `Failed to get recent commits: ${error}`, request);
    }
  }

  /**
   * Get current commit information from working directory
   */
  static async getCurrentCommitInfo(project_id: string): Promise<GetCurrentCommitInfoResponse> {
    try {
      console.log(`📍 GitService.getCurrentCommitInfo - Project: ${project_id}`);
      
      const git = await this.getGitInstance(project_id);
      
      // Get current commit
      const log = await git.log({ maxCount: 1 });
      const currentCommit = log.latest;
      
      if (!currentCommit) {
        throw new Error('No commits found in repository');
      }
      
      // Get current status
      const status = await git.status();
      
      // Build response
      const response: GetCurrentCommitInfoResponse = {
        commit_sha: currentCommit.hash,
        short_sha: currentCommit.hash.substring(0, 12),
        message: currentCommit.message,
        author_name: currentCommit.author_name,
        author_email: currentCommit.author_email,
        branch_name: status.current || 'HEAD',
        is_clean: status.isClean()
      };
      
      if (!status.isClean()) {
        response.uncommitted_changes = {
          staged_files: status.staged,
          modified_files: status.modified,
          untracked_files: status.not_added
        };
      }
      
      return response;
    } catch (error) {
      console.error('Get current commit info error:', error);
      throw this.createServiceError('GET_CURRENT_COMMIT_FAILED', `Failed to get current commit info: ${error}`, { project_id });
    }
  }

  /**
   * Get comprehensive branch information with statistics
   */
  static async getBranchInfo(request: GetBranchInfoRequest): Promise<GetBranchInfoResponse> {
    const { project_id, include_remote = false, include_stats = true } = request;
    
    try {
      console.log(`🌿 GitService.getBranchInfo - Project: ${project_id}`);
      
      const git = await this.getGitInstance(project_id);
      
      // Get git branches - fix the options format
      const branchOptions = include_remote ? ['-a'] : ['-l'];
      const branches = await git.branch(branchOptions);
      
      // Get database branch information
      const dbBranches = await this.getDatabaseBranches(project_id);
      const dbBranchMap = new Map(dbBranches.map(b => [b.branch_name, b]));
      
      // Combine git and database information
      const branchInfoList: BranchInfo[] = [];
      
      for (const [branchName, branchData] of Object.entries(branches.branches)) {
        const dbBranch = dbBranchMap.get(branchName);
        
        let branchInfo: BranchInfo = {
          // Default values if not in database
          id: dbBranch?.id || '',
          project_id,
          branch_name: branchName,
          current_sha: branchData.commit,
          is_default: branchName === 'main' || branchName === 'master',
          is_protected: false,
          branch_type: this.classifyBranchType(branchName),
          commit_count: 0,
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
          is_current: branchData.current,
          ...dbBranch // Override with database values if available
        };
        
        // Add git-specific information
        if (include_stats && branchData.commit) {
          try {
            const lastCommitLog = await git.log({ from: branchName, maxCount: 1 });
            if (lastCommitLog.latest) {
              branchInfo.last_commit = {
                sha: lastCommitLog.latest.hash,
                message: lastCommitLog.latest.message,
                author: lastCommitLog.latest.author_name,
                date: new Date(lastCommitLog.latest.date)
              };
            }
          } catch (error) {
            console.warn(`Could not get last commit for branch ${branchName}:`, error);
          }
        }
        
        branchInfoList.push(branchInfo);
      }
      
      return {
        branches: branchInfoList,
        current_branch: branches.current,
        default_branch: this.findDefaultBranch(branchInfoList) || '',
        total_count: branchInfoList.length
      };
    } catch (error) {
      console.error('Get branch info error:', error);
      throw this.createServiceError('GET_BRANCH_INFO_FAILED', `Failed to get branch info: ${error}`, request);
    }
  }

  /**
   * Track detailed file changes for a specific commit with enhanced metadata
   */
  static async trackFileChangesWithMetadata(request: TrackFileChangesRequest & { enhanced_metadata?: any }): Promise<TrackFileChangesResponse> {
    const { commit_sha, project_id, include_binary = false, enhanced_metadata } = request;
    const startTime = Date.now();
    
    try {
      console.log(`📁 GitService.trackFileChangesWithMetadata - Commit: ${commit_sha.substring(0, 12)}`);
      
      const git = await this.getGitInstance(project_id);
      
      // Get commit from database
      const commitResult = await pool.query(
        'SELECT id FROM git_commits WHERE project_id = $1 AND commit_sha = $2',
        [project_id, commit_sha]
      );
      
      if (commitResult.rows.length === 0) {
        throw new Error(`Commit ${commit_sha} not found in database`);
      }
      
      const commit_id = commitResult.rows[0].id;
      
      // Use enhanced metadata if available, otherwise get diff summary
      let fileChanges: GitFileChange[] = [];
      
      if (enhanced_metadata?.commit_stats?.file_stats) {
        // Use the enhanced file stats we already collected
        fileChanges = await this.processEnhancedFileStats(
          enhanced_metadata.commit_stats.file_stats,
          project_id,
          commit_id,
          commit_sha,
          git,
          include_binary
        );
      } else {
        // Fallback to original diff summary method
        const diffSummary = await git.diffSummary([commit_sha + '^', commit_sha]);
        
        for (const file of diffSummary.files) {
          // Skip binary files if not requested
          if (file.binary && !include_binary) {
            continue;
          }
          
          const fileChange = await this.createFileChangeFromDiff(file, project_id, commit_id, commit_sha, git);
          fileChanges.push(fileChange);
        }
      }
      
      // Store file changes in database with enhanced metadata
      const storedChanges = await this.storeFileChangesWithMetadata(fileChanges, enhanced_metadata);
      
      const processingTime = Date.now() - startTime;
      
      return {
        commit_id,
        file_changes: storedChanges,
        total_files: storedChanges.length,
        processing_time_ms: processingTime
      };
    } catch (error) {
      console.error('Track file changes with metadata error:', error);
      throw this.createServiceError('TRACK_FILE_CHANGES_FAILED', `Failed to track file changes: ${error}`, request);
    }
  }

  /**
   * Original method for backward compatibility
   */
  static async trackFileChanges(request: TrackFileChangesRequest): Promise<TrackFileChangesResponse> {
    return this.trackFileChangesWithMetadata(request);
  }

  /**
   * Correlate commits with AIDIS sessions based on timing and context
   */
  static async correlateCommitsWithSessions(request: CorrelateCommitsWithSessionsRequest): Promise<CorrelateCommitsWithSessionsResponse> {
    const { project_id, since, confidence_threshold = 0.3 } = request;
    const startTime = Date.now();
    
    try {
      console.log(`🔗 GitService.correlateCommitsWithSessions - Project: ${project_id}`);
      
      // Get commits to correlate
      let commitSql = `
        SELECT gc.*, p.name as project_name
        FROM git_commits gc
        JOIN projects p ON gc.project_id = p.id
        WHERE gc.project_id = $1
      `;
      const params = [project_id];
      
      if (since) {
        commitSql += ` AND gc.author_date >= $2`;
        params.push(since.toISOString());
      }
      
      commitSql += ` ORDER BY gc.author_date DESC`;
      
      const commitsResult = await pool.query(commitSql, params);
      const commits = commitsResult.rows;
      
      // Get sessions for correlation
      const sessionsResult = await pool.query(`
        SELECT id, started_at, ended_at, agent_type
        FROM sessions 
        WHERE project_id = $1
        UNION ALL
        SELECT id, started_at, last_activity as ended_at, 'web' as agent_type
        FROM user_sessions
        WHERE project_id = $1
        ORDER BY started_at DESC
      `, [project_id]);
      const sessions = sessionsResult.rows;
      
      let linksCreated = 0;
      let linksUpdated = 0;
      let highConfidenceLinks = 0;
      const correlationStats = {
        author_matches: 0,
        time_proximity_matches: 0,
        content_similarity_matches: 0
      };
      
      // Process correlation for each commit
      for (const commit of commits) {
        const correlationResults = await this.correlateCommitWithSessions(
          commit,
          sessions,
          confidence_threshold
        );
        
        for (const correlation of correlationResults) {
          const existingLink = await this.findExistingSessionLink(commit.id, correlation.session_id);
          
          if (existingLink) {
            // Update existing link if confidence improved
            if (correlation.confidence_score > existingLink.confidence_score) {
              await this.updateSessionLink(existingLink.id, correlation);
              linksUpdated++;
            }
          } else {
            // Create new link
            await this.createSessionLink(commit.id, correlation);
            linksCreated++;
          }
          
          if (correlation.confidence_score > 0.7) {
            highConfidenceLinks++;
          }
          
          // Update stats
          if (correlation.author_match) correlationStats.author_matches++;
          if (correlation.time_proximity_minutes !== undefined && correlation.time_proximity_minutes < 60) {
            correlationStats.time_proximity_matches++;
          }
          if (correlation.content_similarity && correlation.content_similarity > 0.5) {
            correlationStats.content_similarity_matches++;
          }
        }
      }
      
      const processingTime = Date.now() - startTime;
      console.log(`✅ GitService.correlateCommitsWithSessions completed in ${processingTime}ms`);
      
      return {
        project_id,
        links_created: linksCreated,
        links_updated: linksUpdated,
        high_confidence_links: highConfidenceLinks,
        processing_time_ms: processingTime,
        correlation_stats: correlationStats
      };
    } catch (error) {
      console.error('Correlate commits with sessions error:', error);
      throw this.createServiceError('CORRELATE_SESSIONS_FAILED', `Failed to correlate commits with sessions: ${error}`, request);
    }
  }

  /**
   * Query commits by metadata attributes
   */
  static async queryCommitsByMetadata(request: {
    project_id: string;
    author?: string;
    date_range?: { start: Date; end: Date };
    file_patterns?: string[];
    commit_types?: CommitType[];
    branches?: string[];
    has_breaking_changes?: boolean;
    is_merge_commit?: boolean;
    ticket_references?: string[];
    min_files_changed?: number;
    max_files_changed?: number;
    min_lines_changed?: number;
    max_lines_changed?: number;
    limit?: number;
    offset?: number;
  }): Promise<{
    commits: GitCommit[];
    total_count: number;
    metadata_summary: {
      authors: string[];
      commit_types: Record<CommitType, number>;
      branches: string[];
      avg_files_changed: number;
      avg_lines_changed: number;
    };
  }> {
    try {
      console.log(`🔍 GitService.queryCommitsByMetadata - Project: ${request.project_id}`);
      
      let whereConditions: string[] = ['gc.project_id = $1'];
      let queryParams: any[] = [request.project_id];
      let paramIndex = 2;
      
      // Build WHERE conditions based on request parameters
      if (request.author) {
        whereConditions.push(`(gc.author_email = $${paramIndex} OR gc.author_name ILIKE $${paramIndex + 1})`);
        queryParams.push(request.author, `%${request.author}%`);
        paramIndex += 2;
      }
      
      if (request.date_range) {
        whereConditions.push(`gc.author_date >= $${paramIndex} AND gc.author_date <= $${paramIndex + 1}`);
        queryParams.push(request.date_range.start.toISOString(), request.date_range.end.toISOString());
        paramIndex += 2;
      }
      
      if (request.commit_types && request.commit_types.length > 0) {
        whereConditions.push(`gc.commit_type = ANY($${paramIndex})`);
        queryParams.push(request.commit_types);
        paramIndex++;
      }
      
      if (request.branches && request.branches.length > 0) {
        whereConditions.push(`gc.branch_name = ANY($${paramIndex})`);
        queryParams.push(request.branches);
        paramIndex++;
      }
      
      if (request.is_merge_commit !== undefined) {
        whereConditions.push(`gc.is_merge_commit = $${paramIndex}`);
        queryParams.push(request.is_merge_commit);
        paramIndex++;
      }
      
      if (request.has_breaking_changes) {
        whereConditions.push(`(gc.metadata->>'message_analysis')::jsonb->'breaking_change' = 'true'`);
      }
      
      if (request.ticket_references && request.ticket_references.length > 0) {
        whereConditions.push(`gc.metadata->'message_analysis'->'ticket_references' ?| $${paramIndex}`);
        queryParams.push(request.ticket_references);
        paramIndex++;
      }
      
      if (request.min_files_changed !== undefined) {
        whereConditions.push(`gc.files_changed >= $${paramIndex}`);
        queryParams.push(request.min_files_changed);
        paramIndex++;
      }
      
      if (request.max_files_changed !== undefined) {
        whereConditions.push(`gc.files_changed <= $${paramIndex}`);
        queryParams.push(request.max_files_changed);
        paramIndex++;
      }
      
      if (request.min_lines_changed !== undefined) {
        whereConditions.push(`(gc.insertions + gc.deletions) >= $${paramIndex}`);
        queryParams.push(request.min_lines_changed);
        paramIndex++;
      }
      
      if (request.max_lines_changed !== undefined) {
        whereConditions.push(`(gc.insertions + gc.deletions) <= $${paramIndex}`);
        queryParams.push(request.max_lines_changed);
        paramIndex++;
      }
      
      // Handle file patterns by joining with git_file_changes
      let fromClause = 'git_commits gc';
      if (request.file_patterns && request.file_patterns.length > 0) {
        fromClause = `git_commits gc INNER JOIN git_file_changes gfc ON gc.id = gfc.commit_id`;
        const filePatternConditions = request.file_patterns.map((_, index) => 
          `gfc.file_path ILIKE $${paramIndex + index}`
        ).join(' OR ');
        whereConditions.push(`(${filePatternConditions})`);
        queryParams.push(...request.file_patterns.map(pattern => `%${pattern}%`));
        paramIndex += request.file_patterns.length;
      }
      
      // Build the main query
      let sql = `
        SELECT DISTINCT gc.* 
        FROM ${fromClause}
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY gc.author_date DESC
      `;
      
      if (request.limit) {
        sql += ` LIMIT $${paramIndex}`;
        queryParams.push(request.limit);
        paramIndex++;
      }
      
      if (request.offset) {
        sql += ` OFFSET $${paramIndex}`;
        queryParams.push(request.offset);
        paramIndex++;
      }
      
      // Execute main query
      const result = await pool.query(sql, queryParams);
      const commits = result.rows.map(this.mapRowToGitCommit);
      
      // Get total count (without limit/offset)
      const countSql = `
        SELECT COUNT(DISTINCT gc.id) as total 
        FROM ${fromClause}
        WHERE ${whereConditions.join(' AND ')}
      `;
      const countParams = queryParams.slice(0, queryParams.length - 
        (request.limit ? 1 : 0) - (request.offset ? 1 : 0));
      const countResult = await pool.query(countSql, countParams);
      const totalCount = parseInt(countResult.rows[0].total);
      
      // Generate metadata summary
      const metadataSummary = await this.generateMetadataSummary(commits);
      
      return {
        commits,
        total_count: totalCount,
        metadata_summary: metadataSummary
      };
    } catch (error) {
      console.error('Query commits by metadata error:', error);
      throw this.createServiceError('QUERY_COMMITS_FAILED', `Failed to query commits by metadata: ${error}`, request);
    }
  }

  /**
   * Get commit metadata analysis for a specific commit
   */
  static async getCommitMetadataAnalysis(project_id: string, commit_sha: string): Promise<{
    commit: GitCommit;
    file_changes: GitFileChange[];
    analysis: {
      complexity_score: number;
      risk_assessment: string;
      file_categories: Record<string, number>;
      languages_affected: string[];
      test_coverage_impact: boolean;
    };
  }> {
    try {
      console.log(`🗓 GitService.getCommitMetadataAnalysis - Commit: ${commit_sha.substring(0, 12)}`);
      
      // Get commit data
      const commitResult = await pool.query(
        `SELECT * FROM git_commits WHERE project_id = $1 AND commit_sha = $2`,
        [project_id, commit_sha]
      );
      
      if (commitResult.rows.length === 0) {
        throw new Error(`Commit ${commit_sha} not found`);
      }
      
      const commit = this.mapRowToGitCommit(commitResult.rows[0]);
      
      // Get file changes
      const fileChangesResult = await pool.query(
        `SELECT * FROM git_file_changes WHERE project_id = $1 AND commit_id = $2`,
        [project_id, commit.id]
      );
      
      const fileChanges = fileChangesResult.rows.map(row => ({
        id: row.id,
        project_id: row.project_id,
        commit_id: row.commit_id,
        file_path: row.file_path,
        old_file_path: row.old_file_path,
        change_type: row.change_type as FileChangeType,
        lines_added: row.lines_added || 0,
        lines_removed: row.lines_removed || 0,
        is_binary: row.is_binary || false,
        is_generated: row.is_generated || false,
        file_size_bytes: row.file_size_bytes,
        metadata: row.metadata || {},
        created_at: new Date(row.created_at)
      }));
      
      // Analyze commit complexity and risk
      const analysis = this.analyzeCommitComplexity(commit, fileChanges);
      
      return {
        commit,
        file_changes: fileChanges,
        analysis
      };
    } catch (error) {
      console.error('Get commit metadata analysis error:', error);
      throw this.createServiceError('COMMIT_ANALYSIS_FAILED', `Failed to analyze commit metadata: ${error}`, { project_id, commit_sha });
    }
  }

  /**
   * Get file change hotspots - most frequently changed files
   */
  static async getFileChangeHotspots(project_id: string, options: {
    since?: Date;
    limit?: number;
    min_changes?: number;
  } = {}): Promise<{
    hotspots: Array<{
      file_path: string;
      change_count: number;
      contributor_count: number;
      last_changed: Date;
      file_category: string;
      languages: string[];
      avg_change_size: number;
      risk_score: number;
    }>;
    summary: {
      total_hotspots: number;
      high_risk_files: number;
      most_active_category: string;
    };
  }> {
    try {
      console.log(`🔥 GitService.getFileChangeHotspots - Project: ${project_id}`);
      
      let whereConditions = ['gfc.project_id = $1'];
      let queryParams: any[] = [project_id];
      let paramIndex = 2;
      
      if (options.since) {
        whereConditions.push(`gc.author_date >= $${paramIndex}`);
        queryParams.push(options.since.toISOString());
        paramIndex++;
      }
      
      const sql = `
        SELECT 
          gfc.file_path,
          COUNT(*) as change_count,
          COUNT(DISTINCT gc.author_email) as contributor_count,
          MAX(gc.author_date) as last_changed,
          AVG(gfc.lines_added + gfc.lines_removed) as avg_change_size,
          STRING_AGG(DISTINCT gfc.metadata->>'language', ', ') as languages,
          STRING_AGG(DISTINCT gfc.metadata->>'file_category', ', ') as categories
        FROM git_file_changes gfc
        JOIN git_commits gc ON gfc.commit_id = gc.id
        WHERE ${whereConditions.join(' AND ')}
        GROUP BY gfc.file_path
        HAVING COUNT(*) >= ${options.min_changes || 3}
        ORDER BY change_count DESC, contributor_count DESC
        ${options.limit ? `LIMIT ${options.limit}` : 'LIMIT 50'}
      `;
      
      const result = await pool.query(sql, queryParams);
      
      const hotspots = result.rows.map(row => {
        const riskScore = this.calculateFileRiskScore(
          row.change_count,
          row.contributor_count,
          row.avg_change_size,
          new Date(row.last_changed)
        );
        
        return {
          file_path: row.file_path,
          change_count: parseInt(row.change_count),
          contributor_count: parseInt(row.contributor_count),
          last_changed: new Date(row.last_changed),
          file_category: row.categories?.split(', ')[0] || 'unknown',
          languages: row.languages ? row.languages.split(', ').filter(Boolean) : [],
          avg_change_size: parseFloat(row.avg_change_size) || 0,
          risk_score: riskScore
        };
      });
      
      // Generate summary
      const summary = {
        total_hotspots: hotspots.length,
        high_risk_files: hotspots.filter(h => h.risk_score > 0.7).length,
        most_active_category: this.getMostActiveCategory(hotspots)
      };
      
      return { hotspots, summary };
    } catch (error) {
      console.error('Get file change hotspots error:', error);
      throw this.createServiceError('FILE_HOTSPOTS_FAILED', `Failed to get file change hotspots: ${error}`, { project_id, options });
    }
  }

  /**
   * Get comprehensive git statistics for a project
   */
  static async getProjectGitStats(project_id: string): Promise<GitProjectStats> {
    try {
      console.log(`📊 GitService.getProjectGitStats - Project: ${project_id}`);
      
      // Get basic project info
      const projectResult = await pool.query(`
        SELECT p.id, p.name,
          COUNT(DISTINCT gc.id) as total_commits,
          COUNT(DISTINCT gc.author_email) as contributors,
          COUNT(DISTINCT gc.id) FILTER (WHERE gc.author_date >= NOW() - INTERVAL '7 days') as commits_last_week,
          COUNT(DISTINCT gc.id) FILTER (WHERE gc.author_date >= NOW() - INTERVAL '30 days') as commits_last_month,
          COUNT(DISTINCT gb.id) as total_branches,
          COUNT(DISTINCT gb.id) FILTER (WHERE gb.last_commit_date >= NOW() - INTERVAL '30 days') as active_branches,
          MIN(gc.author_date) as first_commit_date,
          MAX(gc.author_date) as last_commit_date
        FROM projects p
        LEFT JOIN git_commits gc ON p.id = gc.project_id
        LEFT JOIN git_branches gb ON p.id = gb.project_id
        WHERE p.id = $1
        GROUP BY p.id, p.name
      `, [project_id]);
      
      if (projectResult.rows.length === 0) {
        throw new Error(`Project ${project_id} not found`);
      }
      
      const projectData = projectResult.rows[0];
      
      // Get file change statistics
      const fileStatsResult = await pool.query(`
        SELECT 
          COUNT(DISTINCT gfc.id) as total_file_changes
        FROM git_file_changes gfc
        WHERE gfc.project_id = $1
      `, [project_id]);
      
      // Get most changed files
      const mostChangedResult = await pool.query(`
        SELECT 
          gfc.file_path,
          COUNT(*) as change_count,
          MAX(gc.author_date) as last_changed
        FROM git_file_changes gfc
        JOIN git_commits gc ON gfc.commit_id = gc.id
        WHERE gfc.project_id = $1
        GROUP BY gfc.file_path
        ORDER BY change_count DESC, last_changed DESC
        LIMIT 10
      `, [project_id]);
      
      // Get top contributors
      const contributorsResult = await pool.query(`
        SELECT 
          gc.author_email,
          gc.author_name,
          COUNT(*) as commit_count,
          SUM(gc.insertions + gc.deletions) as lines_contributed
        FROM git_commits gc
        WHERE gc.project_id = $1
        GROUP BY gc.author_email, gc.author_name
        ORDER BY commit_count DESC, lines_contributed DESC
        LIMIT 10
      `, [project_id]);
      
      return {
        project_id,
        project_name: projectData.name,
        total_commits: parseInt(projectData.total_commits) || 0,
        contributors: parseInt(projectData.contributors) || 0,
        commits_last_week: parseInt(projectData.commits_last_week) || 0,
        commits_last_month: parseInt(projectData.commits_last_month) || 0,
        total_branches: parseInt(projectData.total_branches) || 0,
        active_branches: parseInt(projectData.active_branches) || 0,
        total_file_changes: parseInt(fileStatsResult.rows[0]?.total_file_changes) || 0,
        most_changed_files: mostChangedResult.rows.map(row => ({
          file_path: row.file_path,
          change_count: parseInt(row.change_count),
          last_changed: new Date(row.last_changed)
        })),
        top_contributors: contributorsResult.rows.map(row => ({
          author_email: row.author_email,
          author_name: row.author_name,
          commit_count: parseInt(row.commit_count),
          lines_contributed: parseInt(row.lines_contributed) || 0
        })),
        first_commit_date: projectData.first_commit_date ? new Date(projectData.first_commit_date) : new Date(),
        last_commit_date: projectData.last_commit_date ? new Date(projectData.last_commit_date) : new Date()
      };
    } catch (error) {
      console.error('Get project git stats error:', error);
      throw this.createServiceError('GET_PROJECT_STATS_FAILED', `Failed to get project git stats: ${error}`, { project_id });
    }
  }

  /**
   * Get current repository status
   */
  static async getRepositoryStatus(project_id: string): Promise<GitRepositoryStatus> {
    try {
      const git = await this.getGitInstance(project_id);
      
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        throw new Error('Not a git repository');
      }
      
      const status = await git.status();
      const remotes = await git.getRemotes(true);
      const log = await git.log({ maxCount: 1000 });
      
      return {
        is_git_repo: true,
        repo_path: await git.revparse(['--show-toplevel']),
        current_branch: status.current || 'HEAD',
        is_clean: status.isClean(),
        has_remote: remotes.length > 0,
        remote_url: remotes[0]?.refs?.fetch,
        total_commits: log.total,
        untracked_files: status.not_added.length,
        staged_files: status.staged.length,
        modified_files: status.modified.length
      };
    } catch (error) {
      return {
        is_git_repo: false,
        repo_path: '',
        current_branch: '',
        is_clean: false,
        has_remote: false,
        total_commits: 0,
        untracked_files: 0,
        staged_files: 0,
        modified_files: 0
      };
    }
  }

  // Private helper methods

  private static async getGitInstance(project_id: string): Promise<SimpleGit> {
    // Check cache first
    if (this.repositoryCache.has(project_id)) {
      return this.repositoryCache.get(project_id)!;
    }
    
    // Get repository path from project
    const project = await pool.query(
      'SELECT root_directory, metadata FROM projects WHERE id = $1',
      [project_id]
    );
    
    if (project.rows.length === 0) {
      throw new Error(`Project ${project_id} not found`);
    }
    
    const projectData = project.rows[0];
    const repoPath = projectData.metadata?.git_repo_path || projectData.root_directory;
    
    if (!repoPath) {
      throw new Error(`No git repository path configured for project ${project_id}`);
    }
    
    const git = simpleGit(repoPath);
    this.repositoryCache.set(project_id, git);
    
    return git;
  }

  private static async validateProject(project_id: string): Promise<any> {
    const result = await pool.query('SELECT * FROM projects WHERE id = $1', [project_id]);
    return result.rows[0];
  }

  /**
   * Enhanced batch commit processing with comprehensive metadata collection
   */
  private static async processBatchCommitsWithMetadata(project_id: string, commits: any[], git: SimpleGit): Promise<{
    commitsProcessed: number;
    branchesUpdated: number;
    fileChangesTracked: number;
  }> {
    let commitsProcessed = 0;
    let branchesUpdated = 0;
    let fileChangesTracked = 0;

    for (const commit of commits) {
      try {
        // Check if commit already exists
        const existingCommit = await pool.query(
          'SELECT id FROM git_commits WHERE project_id = $1 AND commit_sha = $2',
          [project_id, commit.hash]
        );

        if (existingCommit.rows.length === 0) {
          // Collect enhanced commit metadata
          const enhancedMetadata = await this.collectCommitMetadata(commit, git);

          // Skip dependency-heavy commits to avoid inflating metrics
          if (this.isDependencyCommit(enhancedMetadata, commit)) {
            console.log(`⏭️  Skipping dependency commit: ${commit.hash.substring(0, 12)} - ${commit.message}`);
            continue;
          }

          // Store new commit with enhanced metadata
          await this.storeCommitWithMetadata(project_id, commit, enhancedMetadata);
          commitsProcessed++;

          // Track file changes if enabled with enhanced metadata
          if (this.config.enable_file_tracking) {
            try {
              const fileChangeResult = await this.trackFileChangesWithMetadata({
                commit_sha: commit.hash,
                project_id,
                include_binary: false,
                enhanced_metadata: enhancedMetadata
              });
              fileChangesTracked += fileChangeResult.total_files;
            } catch (error) {
              console.warn(`Failed to track file changes for commit ${commit.hash}:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`Failed to process commit ${commit.hash}:`, error);
        throw error;
      }
    }

    return { commitsProcessed, branchesUpdated, fileChangesTracked };
  }


  /**
   * Check if a commit is primarily a dependency installation/update
   * These commits should be excluded from code contribution metrics
   */
  private static isDependencyCommit(metadata: any, commit: any): boolean {
    const insertions = metadata.insertions || 0;
    const deletions = metadata.deletions || 0;
    const filesChanged = metadata.files_changed || 0;
    const message = commit.message.toLowerCase();

    // Filter 1: Excessive line changes (likely dependency install)
    if (insertions > 10000) {
      return true;
    }

    // Filter 2: Excessive file changes (likely node_modules commit)
    if (filesChanged > 1000) {
      return true;
    }

    // Filter 3: Check file stats for dependency patterns
    const fileStats = metadata.commit_stats?.file_stats || [];
    if (fileStats.length > 0) {
      const dependencyFilePatterns = [
        /^node_modules\//,
        /^package-lock\.json$/,
        /^yarn\.lock$/,
        /^pnpm-lock\.yaml$/,
        /^Cargo\.lock$/,
        /^Gemfile\.lock$/,
        /^composer\.lock$/,
        /^Pipfile\.lock$/,
        /\.min\.(js|css)$/,
        /^vendor\//,
        /^dist\/.*\.(js|css)$/
      ];

      let dependencyFileCount = 0;
      for (const fileStat of fileStats) {
        const filePath = fileStat.file_path;
        if (dependencyFilePatterns.some(pattern => pattern.test(filePath))) {
          dependencyFileCount++;
        }
      }

      // If more than 50% of files are dependency-related, skip this commit
      const dependencyRatio = dependencyFileCount / fileStats.length;
      if (dependencyRatio > 0.5) {
        return true;
      }
    }

    // Filter 4: Check commit message for dependency keywords
    const dependencyKeywords = [
      'package-lock',
      'yarn.lock',
      'npm install',
      'yarn add',
      'update dependencies',
      'bump dependencies',
      'lockfile',
      'node_modules'
    ];

    if (dependencyKeywords.some(keyword => message.includes(keyword))) {
      // Only skip if also has high insertion count (> 1000 lines)
      if (insertions > 1000) {
        return true;
      }
    }

    return false;
  }

  /**
   * Collect comprehensive metadata for a commit
   */
  private static async collectCommitMetadata(commit: any, git: SimpleGit): Promise<any> {
    try {
      // Get detailed commit information
      const commitDetails = await git.show([commit.hash, '--stat', '--numstat', '--shortstat']);
      
      // Get parent information
      const parents = commit.parent_hashes ? commit.parent_hashes.split(' ').filter(Boolean) : [];
      
      // Determine if it's a merge commit
      const isMergeCommit = parents.length > 1;
      
      // Parse commit statistics from git show output
      const stats = this.parseCommitStats(commitDetails);
      
      // Get branch information this commit appears on
      let branches: string[] = [];
      try {
        const branchInfo = await git.branch(['--contains', commit.hash]);
        branches = Object.keys(branchInfo.branches).filter(branch => !branch.startsWith('remotes/'));
      } catch (error) {
        console.warn(`Could not get branches for commit ${commit.hash}:`, error);
        branches = commit.refs ? this.extractBranches(commit.refs) : ['main'];
      }
      
      // Analyze commit message for conventional commit patterns
      const messageAnalysis = this.analyzeCommitMessage(commit.message, commit.body);
      
      // Get merge information if it's a merge commit
      let mergeInfo = null;
      if (isMergeCommit) {
        mergeInfo = await this.getMergeCommitInfo(commit, git);
      }
      
      return {
        parent_shas: parents,
        is_merge_commit: isMergeCommit,
        files_changed: stats.files_changed || 0,
        insertions: stats.insertions || 0,
        deletions: stats.deletions || 0,
        branches: branches,
        primary_branch: branches[0] || 'main',
        commit_size: (stats.insertions || 0) + (stats.deletions || 0),
        message_analysis: messageAnalysis,
        merge_info: mergeInfo,
        tree_hash: commit.tree_hash,
        gpg_signature: {
          key_id: commit.gpg_key || null,
          signer: commit.gpg_signer || null
        },
        commit_stats: stats,
        processing_timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      console.warn(`Failed to collect metadata for commit ${commit.hash}:`, error);
      return {
        parent_shas: [],
        is_merge_commit: false,
        files_changed: 0,
        insertions: 0,
        deletions: 0,
        branches: ['main'],
        primary_branch: 'main',
        error: error.message
      };
    }
  }

  /**
   * Store commit with enhanced metadata
   */
  private static async storeCommitWithMetadata(project_id: string, commit: any, metadata: any): Promise<string> {
    const commitType = this.classifyCommitType(commit.message);
    
    // Extract enhanced commit data
    const committerName = commit.committer_name || commit.author_name;
    const committerEmail = commit.committer_email || commit.author_email;
    const committerDate = commit.committer_date || commit.date;
    
    const result = await pool.query(`
      INSERT INTO git_commits (
        project_id, commit_sha, message, author_name, author_email, author_date,
        committer_name, committer_email, committer_date, branch_name,
        parent_shas, files_changed, insertions, deletions,
        commit_type, tags, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id
    `, [
      project_id,
      commit.hash,
      commit.message,
      commit.author_name,
      commit.author_email,
      new Date(commit.date),
      committerName,
      committerEmail,
      new Date(committerDate),
      metadata.primary_branch,
      metadata.parent_shas,
      metadata.files_changed,
      metadata.insertions,
      metadata.deletions,
      commitType,
      metadata.message_analysis?.tags || [],
      JSON.stringify({
        body: commit.body,
        refs: commit.refs,
        branches: metadata.branches,
        tree_hash: metadata.tree_hash,
        commit_size: metadata.commit_size,
        message_analysis: metadata.message_analysis,
        merge_info: metadata.merge_info,
        gpg_signature: metadata.gpg_signature,
        commit_stats: metadata.commit_stats,
        processing_timestamp: metadata.processing_timestamp,
        is_merge_commit: metadata.is_merge_commit // Store in metadata for reference
      })
    ]);
    
    return result.rows[0].id;
  }


  /**
   * Parse commit statistics from git show output
   */
  private static parseCommitStats(gitShowOutput: string): any {
    const stats = {
      files_changed: 0,
      insertions: 0,
      deletions: 0,
      file_stats: [] as Array<{
        file_path: string;
        insertions: number;
        deletions: number;
        is_binary: boolean;
      }>
    };

    try {
      // Parse shortstat line (e.g., " 3 files changed, 45 insertions(+), 12 deletions(-)")
      const shortstatMatch = gitShowOutput.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
      if (shortstatMatch) {
        stats.files_changed = parseInt(shortstatMatch[1]) || 0;
        stats.insertions = parseInt(shortstatMatch[2]) || 0;
        stats.deletions = parseInt(shortstatMatch[3]) || 0;
      }

      // Parse numstat lines for individual file statistics
      const numstatRegex = /^(\d+|-)\t(\d+|-)\t(.+)$/gm;
      let match;
      while ((match = numstatRegex.exec(gitShowOutput)) !== null) {
        const [, insertions, deletions, filePath] = match;
        stats.file_stats.push({
          file_path: filePath,
          insertions: insertions === '-' ? 0 : parseInt(insertions),
          deletions: deletions === '-' ? 0 : parseInt(deletions),
          is_binary: insertions === '-' && deletions === '-'
        });
      }
    } catch (error) {
      console.warn('Failed to parse commit stats:', error);
    }

    return stats;
  }

  /**
   * Analyze commit message for patterns and metadata
   */
  private static analyzeCommitMessage(message: string, body?: string): any {
    const analysis = {
      type: 'feature' as CommitType,
      scope: null as string | null,
      breaking_change: false,
      conventional_commit: false,
      tags: [] as string[],
      ticket_references: [] as string[],
      co_authors: [] as Array<{ name: string; email: string }>
    };

    // Check for conventional commit format
    const conventionalMatch = message.match(/^(\w+)(\(([^)]+)\))?(!?):\s*(.+)$/);
    if (conventionalMatch) {
      analysis.conventional_commit = true;
      analysis.type = this.mapConventionalCommitType(conventionalMatch[1]);
      analysis.scope = conventionalMatch[3] || null;
      analysis.breaking_change = conventionalMatch[4] === '!';
    } else {
      // Fallback to basic classification
      analysis.type = this.classifyCommitType(message);
    }

    // Check for breaking change indicators
    const fullText = `${message} ${body || ''}`;
    if (fullText.includes('BREAKING CHANGE') || fullText.includes('breaking change')) {
      analysis.breaking_change = true;
    }

    // Extract ticket references (e.g., #123, JIRA-456, closes #789)
    const ticketMatches = fullText.match(/(?:#(\d+)|([A-Z]+-\d+)|(?:closes?|fixes?|resolves?)\s+#(\d+))/gi);
    if (ticketMatches) {
      analysis.ticket_references = [...new Set(ticketMatches.map(match => match.trim()))];
    }

    // Extract co-authors from body
    if (body) {
      const coAuthorMatches = body.match(/Co-authored-by:\s*(.+?)\s*<(.+?)>/gi);
      if (coAuthorMatches) {
        analysis.co_authors = coAuthorMatches.map(match => {
          const authorMatch = match.match(/Co-authored-by:\s*(.+?)\s*<(.+?)>/);
          return authorMatch ? { name: authorMatch[1].trim(), email: authorMatch[2].trim() } : null;
        }).filter((author): author is { name: string; email: string } => author !== null);
      }
    }

    // Add semantic tags
    if (analysis.breaking_change) analysis.tags.push('breaking');
    if (analysis.conventional_commit) analysis.tags.push('conventional');
    if (analysis.ticket_references.length > 0) analysis.tags.push('references-ticket');
    if (analysis.co_authors.length > 0) analysis.tags.push('collaborative');

    return analysis;
  }

  /**
   * Map conventional commit types to our CommitType enum
   */
  private static mapConventionalCommitType(conventionalType: string): CommitType {
    const typeMapping: Record<string, CommitType> = {
      'feat': 'feature',
      'fix': 'fix',
      'docs': 'docs',
      'style': 'style',
      'refactor': 'refactor',
      'test': 'test',
      'chore': 'chore',
      'build': 'chore',
      'ci': 'chore',
      'perf': 'refactor',
      'revert': 'fix'
    };
    
    return typeMapping[conventionalType.toLowerCase()] || 'feature';
  }

  /**
   * Get merge commit information
   */
  private static async getMergeCommitInfo(commit: any, git: SimpleGit): Promise<any> {
    try {
      // For merge commits, get the branches involved
      const parents = commit.parent_hashes ? commit.parent_hashes.split(' ').filter(Boolean) : [];
      
      if (parents.length < 2) {
        return null;
      }

      // Try to determine source and target branches
      let sourceBranch = null;
      let targetBranch = null;
      
      try {
        // This is a heuristic - merge commits often have the target as first parent
        const targetBranchInfo = await git.branch(['--contains', parents[0]]);
        const targetBranches = Object.keys(targetBranchInfo.branches).filter(b => !b.startsWith('remotes/'));
        targetBranch = targetBranches[0] || null;
        
        const sourceBranchInfo = await git.branch(['--contains', parents[1]]);
        const sourceBranches = Object.keys(sourceBranchInfo.branches).filter(b => !b.startsWith('remotes/'));
        sourceBranch = sourceBranches[0] || null;
      } catch (error) {
        console.warn(`Could not determine merge branches for commit ${commit.hash}:`, error);
      }

      return {
        parent_commits: parents,
        source_branch: sourceBranch,
        target_branch: targetBranch,
        merge_strategy: this.determineMergeStrategy(commit.message)
      };
    } catch (error) {
      console.warn(`Failed to get merge info for commit ${commit.hash}:`, error);
      return null;
    }
  }

  /**
   * Determine merge strategy from commit message
   */
  private static determineMergeStrategy(message: string): string {
    if (message.includes('Squash merge') || message.includes('squash')) return 'squash';
    if (message.includes('Rebase') || message.includes('rebase')) return 'rebase';
    if (message.includes('Fast-forward') || message.includes('fast-forward')) return 'fast-forward';
    return 'merge';
  }

  private static classifyCommitType(message: string): CommitType {
    const msg = message.toLowerCase();
    
    if (msg.match(/^(fix|fixed|fixes|bug)[\s\(\[]/)) return 'fix';
    if (msg.match(/^(feat|feature|add)[\s\(\[]/)) return 'feature';
    if (msg.match(/^(docs|doc)[\s\(\[]/)) return 'docs';
    if (msg.match(/^(refactor|refact)[\s\(\[]/)) return 'refactor';
    if (msg.match(/^(test|tests)[\s\(\[]/)) return 'test';
    if (msg.match(/^(style|format)[\s\(\[]/)) return 'style';
    if (msg.match(/^(chore|build|ci)[\s\(\[]/)) return 'chore';
    if (msg.match(/^(merge|merged)/)) return 'merge';
    
    return 'feature';
  }

  private static classifyBranchType(branchName: string): BranchType {
    if (branchName.match(/^(main|master)$/)) return 'main';
    if (branchName.match(/^(feature|feat)\//)) return 'feature';
    if (branchName.match(/^(hotfix|fix)\//)) return 'hotfix';
    if (branchName.match(/^release\//)) return 'release';
    if (branchName.match(/^develop$/)) return 'develop';
    
    return 'feature';
  }

  private static extractBranches(refs: string): string[] {
    if (!refs) return [];
    
    return refs.split(', ')
      .filter(ref => !ref.includes('tag:') && !ref.includes('HEAD'))
      .map(ref => ref.replace(/^origin\//, ''));
  }

  /**
   * Get file extension from path
   */
  private static getFileExtension(filePath: string): string | null {
    const match = filePath.match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : null;
  }

  /**
   * Categorize file type
   */
  private static categorizeFile(filePath: string): string {
    const ext = this.getFileExtension(filePath);
    
    if (!ext) return 'unknown';
    
    const categories = {
      'source': ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'go', 'rs', 'php', 'rb', 'swift', 'kt'],
      'web': ['html', 'css', 'scss', 'sass', 'less'],
      'config': ['json', 'yaml', 'yml', 'toml', 'ini', 'conf', 'config', 'env'],
      'documentation': ['md', 'rst', 'txt', 'adoc'],
      'data': ['sql', 'csv', 'xml', 'graphql'],
      'image': ['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico'],
      'archive': ['zip', 'tar', 'gz', 'rar'],
      'executable': ['exe', 'dll', 'so', 'dylib']
    };
    
    for (const [category, extensions] of Object.entries(categories)) {
      if (extensions.includes(ext)) {
        return category;
      }
    }
    
    return 'other';
  }

  /**
   * Calculate change magnitude
   */
  private static calculateChangeMagnitude(insertions: number, deletions: number): string {
    const total = insertions + deletions;
    
    if (total === 0) return 'none';
    if (total <= 5) return 'minimal';
    if (total <= 25) return 'small';
    if (total <= 100) return 'medium';
    if (total <= 500) return 'large';
    return 'massive';
  }

  /**
   * Check if file is a configuration file
   */
  private static isConfigurationFile(filePath: string): boolean {
    const configPatterns = [
      /\.config\.(js|ts|json)$/,
      /^\.(env|gitignore|dockerignore|eslintrc|prettierrc)/,
      /package\.json$/,
      /tsconfig\.json$/,
      /webpack\.config/,
      /babel\.config/,
      /jest\.config/,
      /tailwind\.config/,
      /vite\.config/,
      /rollup\.config/,
      /dockerfile$/i,
      /docker-compose/,
      /\.ya?ml$/
    ];
    
    return configPatterns.some(pattern => pattern.test(filePath.toLowerCase()));
  }

  /**
   * Check if file is documentation
   */
  private static isDocumentationFile(filePath: string): boolean {
    const docPatterns = [
      /\.(md|rst|txt|adoc)$/,
      /readme/i,
      /changelog/i,
      /license/i,
      /contributing/i,
      /^docs\//,
      /\.docs\./
    ];
    
    return docPatterns.some(pattern => pattern.test(filePath.toLowerCase()));
  }

  /**
   * Check if file is a test file
   */
  private static isTestFile(filePath: string): boolean {
    const testPatterns = [
      /\.(test|spec)\.(js|ts|jsx|tsx|py|java|cpp|cs|go|rs|php|rb)$/,
      /^tests?\//,
      /__tests__\//,
      /\.test\./,
      /\.spec\./,
      /test_.*\.(py|rb|php)$/,
      /.*_test\.(go|rs|cpp)$/
    ];
    
    return testPatterns.some(pattern => pattern.test(filePath.toLowerCase()));
  }

  /**
   * Detect programming language from file path
   */
  private static detectProgrammingLanguage(filePath: string): string | null {
    const ext = this.getFileExtension(filePath);
    
    if (!ext) return null;
    
    const languageMap = {
      'js': 'JavaScript',
      'jsx': 'JavaScript',
      'ts': 'TypeScript',
      'tsx': 'TypeScript',
      'py': 'Python',
      'java': 'Java',
      'cpp': 'C++',
      'c': 'C',
      'cs': 'C#',
      'go': 'Go',
      'rs': 'Rust',
      'php': 'PHP',
      'rb': 'Ruby',
      'swift': 'Swift',
      'kt': 'Kotlin',
      'html': 'HTML',
      'css': 'CSS',
      'scss': 'SCSS',
      'sass': 'Sass',
      'less': 'Less',
      'sql': 'SQL',
      'sh': 'Shell',
      'bash': 'Bash',
      'yml': 'YAML',
      'yaml': 'YAML',
      'json': 'JSON',
      'xml': 'XML',
      'graphql': 'GraphQL'
    };
    
    return languageMap[ext as keyof typeof languageMap] || null;
  }

  private static isGeneratedFile(filePath: string): boolean {
    const generatedPatterns = [
      /\.min\.(js|css)$/,
      /\.(map|d\.ts)$/,
      /^dist\//,
      /^build\//,
      /^node_modules\//,
      /package-lock\.json$/,
      /yarn\.lock$/,
      /^coverage\//,
      /\.generated\./,
      /auto-generated/i,
      /generated/i,
      /^target\//,  // Java/Scala build output
      /^bin\//,     // Compiled binaries
      /^out\//      // TypeScript/C# output
    ];
    
    return generatedPatterns.some(pattern => pattern.test(filePath));
  }

  /**
   * Process enhanced file statistics from git show output
   */
  private static async processEnhancedFileStats(
    fileStats: any[],
    project_id: string,
    commit_id: string,
    commit_sha: string,
    git: SimpleGit,
    include_binary: boolean
  ): Promise<GitFileChange[]> {
    const fileChanges: GitFileChange[] = [];
    
    for (const fileStat of fileStats) {
      // Skip binary files if not requested
      if (fileStat.is_binary && !include_binary) {
        continue;
      }
      
      const fileChange = await this.createFileChangeFromStats(fileStat, project_id, commit_id, commit_sha, git);
      fileChanges.push(fileChange);
    }
    
    return fileChanges;
  }

  /**
   * Create file change object from enhanced statistics
   */
  private static async createFileChangeFromStats(
    fileStat: any,
    project_id: string,
    commit_id: string,
    commit_sha: string,
    git: SimpleGit
  ): Promise<GitFileChange> {
    // Determine change type based on stats
    let changeType: FileChangeType = 'modified';
    if (fileStat.insertions > 0 && fileStat.deletions === 0) {
      changeType = 'added';
    } else if (fileStat.insertions === 0 && fileStat.deletions > 0) {
      changeType = 'deleted';
    }
    
    // Check for renames by analyzing file path patterns
    let oldFilePath = '';
    if (fileStat.file_path.includes(' => ')) {
      const parts = fileStat.file_path.split(' => ');
      oldFilePath = parts[0].replace(/\{.*?\}/, '');
      changeType = 'renamed';
    }
    
    // Get file size if possible
    let fileSizeBytes: number | undefined;
    try {
      if (changeType !== 'deleted') {
        const fileInfo = await git.raw(['ls-tree', '-l', commit_sha, '--', fileStat.file_path]);
        const sizeMatch = fileInfo.match(/\s(\d+)\s/);
        if (sizeMatch) {
          fileSizeBytes = parseInt(sizeMatch[1]);
        }
      }
    } catch (error) {
      // File size detection failed, continue without it
    }
    
    // Analyze file type and characteristics
    const fileAnalysis = this.analyzeFileChange(fileStat.file_path, fileStat);
    
    return {
      id: '', // Will be set by database
      project_id,
      commit_id,
      file_path: fileStat.file_path,
      old_file_path: oldFilePath,
      change_type: changeType,
      lines_added: fileStat.insertions,
      lines_removed: fileStat.deletions,
      is_binary: fileStat.is_binary,
      is_generated: this.isGeneratedFile(fileStat.file_path),
      file_size_bytes: fileSizeBytes || undefined,
      metadata: {
        ...fileAnalysis,
        processing_timestamp: new Date().toISOString()
      },
      created_at: new Date()
    };
  }

  /**
   * Create file change object from git diff summary
   */
  private static async createFileChangeFromDiff(
    file: any,
    project_id: string,
    commit_id: string,
    commit_sha: string,
    git: SimpleGit
  ): Promise<GitFileChange> {
    // Determine change type
    let changeType: FileChangeType = 'modified';
    const insertions = 'insertions' in file ? file.insertions : 0;
    const deletions = 'deletions' in file ? file.deletions : 0;
    if (insertions > 0 && deletions === 0) {
      changeType = 'added';
    } else if (insertions === 0 && deletions > 0) {
      changeType = 'deleted';
    }
    
    // Check for renames
    let oldFilePath = '';
    if (file.file.includes(' => ')) {
      const parts = file.file.split(' => ');
      oldFilePath = parts[0].replace(/\{.*?\}/, '');
      changeType = 'renamed';
    }
    
    // Get file size if possible
    let fileSizeBytes: number | undefined;
    try {
      if (changeType !== 'deleted') {
        const fileInfo = await git.raw(['ls-tree', '-l', commit_sha, '--', file.file]);
        const sizeMatch = fileInfo.match(/\s(\d+)\s/);
        if (sizeMatch) {
          fileSizeBytes = parseInt(sizeMatch[1]);
        }
      }
    } catch (error) {
      // File size detection failed, continue without it
    }
    
    // Analyze file type and characteristics
    const fileAnalysis = this.analyzeFileChange(file.file, { insertions, deletions, is_binary: file.binary });
    
    return {
      id: '', // Will be set by database
      project_id,
      commit_id,
      file_path: file.file,
      old_file_path: oldFilePath,
      change_type: changeType,
      lines_added: insertions,
      lines_removed: deletions,
      is_binary: file.binary,
      is_generated: this.isGeneratedFile(file.file),
      file_size_bytes: fileSizeBytes || undefined,
      metadata: {
        ...fileAnalysis,
        processing_timestamp: new Date().toISOString()
      },
      created_at: new Date()
    };
  }

  /**
   * Analyze file change characteristics
   */
  private static analyzeFileChange(filePath: string, stats: any): any {
    const analysis = {
      file_extension: this.getFileExtension(filePath),
      file_category: this.categorizeFile(filePath),
      change_magnitude: this.calculateChangeMagnitude(stats.insertions || 0, stats.deletions || 0),
      is_configuration: this.isConfigurationFile(filePath),
      is_documentation: this.isDocumentationFile(filePath),
      is_test: this.isTestFile(filePath),
      language: this.detectProgrammingLanguage(filePath)
    };
    
    return analysis;
  }

  /**
   * Store file changes with enhanced metadata
   */
  private static async storeFileChangesWithMetadata(
    fileChanges: GitFileChange[],
    enhancedMetadata?: any
  ): Promise<GitFileChange[]> {
    const storedChanges: GitFileChange[] = [];
    
    for (const fileChange of fileChanges) {
      try {
        const result = await pool.query(`
          INSERT INTO git_file_changes (
            project_id, commit_id, file_path, old_file_path, change_type,
            lines_added, lines_removed, is_binary, is_generated, file_size_bytes, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id, created_at
        `, [
          fileChange.project_id,
          fileChange.commit_id,
          fileChange.file_path,
          fileChange.old_file_path,
          fileChange.change_type,
          fileChange.lines_added,
          fileChange.lines_removed,
          fileChange.is_binary,
          fileChange.is_generated,
          fileChange.file_size_bytes,
          JSON.stringify({
            ...fileChange.metadata,
            enhanced_metadata: enhancedMetadata ? {
              commit_context: enhancedMetadata.message_analysis,
              is_merge_commit: enhancedMetadata.is_merge_commit
            } : null
          })
        ]);
        
        storedChanges.push({
          ...fileChange,
          id: result.rows[0].id,
          created_at: new Date(result.rows[0].created_at)
        });
      } catch (error) {
        console.error(`Failed to store file change for ${fileChange.file_path}:`, error);
      }
    }
    
    return storedChanges;
  }

  /**
   * Keep original method for backward compatibility
   */

  private static async getDatabaseBranches(project_id: string): Promise<GitBranch[]> {
    const result = await pool.query(`
      SELECT * FROM git_branches WHERE project_id = $1 ORDER BY updated_at DESC
    `, [project_id]);
    
    return result.rows.map(this.mapRowToGitBranch);
  }

  private static findDefaultBranch(branches: BranchInfo[]): string | undefined {
    return branches.find(b => b.is_default)?.branch_name ||
           branches.find(b => b.branch_name === 'main')?.branch_name ||
           branches.find(b => b.branch_name === 'master')?.branch_name;
  }

  private static async correlateCommitWithSessions(commit: any, sessions: any[], threshold: number): Promise<any[]> {
    const correlations: any[] = [];
    const commitDate = new Date(commit.author_date);
    
    for (const session of sessions) {
      const sessionStart = new Date(session.started_at);
      const sessionEnd = session.ended_at ? new Date(session.ended_at) : new Date();
      
      // Calculate time proximity
      const timeProximity = this.calculateTimeProximity(commitDate, sessionStart, sessionEnd);
      
      if (timeProximity !== null && timeProximity <= 120) { // Within 2 hours
        let confidence = 0.3; // Base confidence
        
        // Boost confidence for time proximity
        if (timeProximity <= 30) confidence += 0.4; // Very close
        else if (timeProximity <= 60) confidence += 0.2; // Close
        
        // Check author match (would need to correlate with session user data)
        const authorMatch = false; // Placeholder - would need user correlation
        if (authorMatch) confidence += 0.3;
        
        if (confidence >= threshold) {
          correlations.push({
            session_id: session.id,
            confidence_score: Math.min(confidence, 1.0),
            time_proximity_minutes: timeProximity,
            author_match: authorMatch,
            link_type: 'contributed'
          });
        }
      }
    }
    
    return correlations;
  }

  private static calculateTimeProximity(commitDate: Date, sessionStart: Date, sessionEnd: Date): number | null {
    // Check if commit is within session timeframe or close to it
    const commitTime = commitDate.getTime();
    const startTime = sessionStart.getTime();
    const endTime = sessionEnd.getTime();
    
    if (commitTime >= startTime && commitTime <= endTime) {
      return 0; // Commit during session
    }
    
    // Calculate proximity to session
    const beforeStart = Math.abs(commitTime - startTime) / (1000 * 60); // minutes
    const afterEnd = Math.abs(commitTime - endTime) / (1000 * 60); // minutes
    
    return Math.min(beforeStart, afterEnd);
  }

  private static async findExistingSessionLink(commit_id: string, session_id: string): Promise<any> {
    const result = await pool.query(
      'SELECT * FROM commit_session_links WHERE commit_id = $1 AND session_id = $2',
      [commit_id, session_id]
    );
    
    return result.rows[0];
  }

  private static async createSessionLink(commit_id: string, correlation: any): Promise<void> {
    await pool.query(`
      INSERT INTO commit_session_links (
        project_id, commit_id, session_id, link_type, confidence_score,
        time_proximity_minutes, author_match, metadata
      ) VALUES (
        (SELECT project_id FROM git_commits WHERE id = $1),
        $1, $2, $3, $4, $5, $6, $7
      )
    `, [
      commit_id,
      correlation.session_id,
      correlation.link_type,
      correlation.confidence_score,
      correlation.time_proximity_minutes,
      correlation.author_match,
      JSON.stringify({})
    ]);
  }

  private static async updateSessionLink(link_id: string, correlation: any): Promise<void> {
    await pool.query(`
      UPDATE commit_session_links 
      SET confidence_score = $2, time_proximity_minutes = $3, 
          author_match = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [
      link_id,
      correlation.confidence_score,
      correlation.time_proximity_minutes,
      correlation.author_match
    ]);
  }

  private static async updateProjectGitInfo(project_id: string, gitInfo: Record<string, any>): Promise<void> {
    await pool.query(`
      UPDATE projects 
      SET metadata = COALESCE(metadata, '{}') || $2::jsonb,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [project_id, JSON.stringify(gitInfo)]);
  }

  private static async getRemoteUrl(git: SimpleGit): Promise<string | undefined> {
    try {
      const remotes = await git.getRemotes(true);
      return remotes[0]?.refs?.fetch;
    } catch {
      return undefined;
    }
  }

  private static mapRowToGitCommit(row: any): GitCommit {
    return {
      id: row.id,
      project_id: row.project_id,
      commit_sha: row.commit_sha,
      short_sha: row.short_sha,
      message: row.message,
      author_name: row.author_name,
      author_email: row.author_email,
      author_date: new Date(row.author_date),
      committer_name: row.committer_name,
      committer_email: row.committer_email,
      committer_date: new Date(row.committer_date),
      branch_name: row.branch_name,
      parent_shas: row.parent_shas || [],
      is_merge_commit: row.is_merge_commit || false,
      files_changed: row.files_changed || 0,
      insertions: row.insertions || 0,
      deletions: row.deletions || 0,
      commit_type: row.commit_type as CommitType,
      tags: row.tags || [],
      metadata: row.metadata || {},
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at)
    };
  }

  private static mapRowToGitBranch(row: any): GitBranch {
    return {
      id: row.id,
      project_id: row.project_id,
      branch_name: row.branch_name,
      current_sha: row.current_sha,
      is_default: row.is_default || false,
      is_protected: row.is_protected || false,
      branch_type: row.branch_type as BranchType,
      upstream_branch: row.upstream_branch,
      commit_count: row.commit_count || 0,
      last_commit_date: row.last_commit_date ? new Date(row.last_commit_date) : new Date(),
      first_commit_date: row.first_commit_date ? new Date(row.first_commit_date) : new Date(),
      base_branch: row.base_branch,
      merge_target: row.merge_target,
      session_id: row.session_id,
      description: row.description,
      metadata: row.metadata || {},
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at)
    };
  }

  /**
   * Generate metadata summary for commits
   */
  private static async generateMetadataSummary(commits: GitCommit[]): Promise<{
    authors: string[];
    commit_types: Record<CommitType, number>;
    branches: string[];
    avg_files_changed: number;
    avg_lines_changed: number;
  }> {
    const authors = new Set<string>();
    const commitTypes: Record<CommitType, number> = {
      feature: 0, fix: 0, docs: 0, refactor: 0, test: 0, style: 0, chore: 0, merge: 0
    };
    const branches = new Set<string>();
    let totalFilesChanged = 0;
    let totalLinesChanged = 0;
    
    for (const commit of commits) {
      authors.add(commit.author_email);
      commitTypes[commit.commit_type]++;
      if (commit.branch_name) branches.add(commit.branch_name);
      totalFilesChanged += commit.files_changed;
      totalLinesChanged += commit.insertions + commit.deletions;
    }
    
    return {
      authors: Array.from(authors),
      commit_types: commitTypes,
      branches: Array.from(branches),
      avg_files_changed: commits.length > 0 ? Math.round(totalFilesChanged / commits.length * 100) / 100 : 0,
      avg_lines_changed: commits.length > 0 ? Math.round(totalLinesChanged / commits.length * 100) / 100 : 0
    };
  }

  /**
   * Analyze commit complexity and risk
   */
  private static analyzeCommitComplexity(commit: GitCommit, fileChanges: GitFileChange[]): {
    complexity_score: number;
    risk_assessment: string;
    file_categories: Record<string, number>;
    languages_affected: string[];
    test_coverage_impact: boolean;
  } {
    let complexityScore = 0;
    const fileCategories: Record<string, number> = {};
    const languagesAffected = new Set<string>();
    let testCoverageImpact = false;
    
    // Base complexity from commit size
    complexityScore += Math.min(commit.files_changed * 0.1, 2.0);
    complexityScore += Math.min((commit.insertions + commit.deletions) * 0.001, 2.0);
    
    // Analyze file changes
    for (const fileChange of fileChanges) {
      const metadata = fileChange.metadata || {};
      const category = metadata.file_category || 'unknown';
      const language = metadata.language;
      
      fileCategories[category] = (fileCategories[category] || 0) + 1;
      
      if (language) {
        languagesAffected.add(language);
      }
      
      // Increase complexity for certain file types
      if (metadata.is_configuration) complexityScore += 0.3;
      if (metadata.is_test) {
        testCoverageImpact = true;
        complexityScore += 0.1;
      }
      if (fileChange.change_type === 'deleted') complexityScore += 0.2;
      if (fileChange.change_type === 'renamed') complexityScore += 0.1;
      
      // Large file changes add complexity
      const changeSize = fileChange.lines_added + fileChange.lines_removed;
      if (changeSize > 100) complexityScore += 0.2;
      if (changeSize > 500) complexityScore += 0.3;
    }
    
    // Multiple languages add complexity
    if (languagesAffected.size > 1) complexityScore += 0.3;
    if (languagesAffected.size > 3) complexityScore += 0.2;
    
    // Merge commits add complexity
    if (commit.is_merge_commit) complexityScore += 0.5;
    
    // Breaking changes add significant complexity
    const messageAnalysis = commit.metadata?.message_analysis;
    if (messageAnalysis?.breaking_change) complexityScore += 1.0;
    
    // Determine risk assessment
    let riskAssessment = 'low';
    if (complexityScore > 1.5) riskAssessment = 'medium';
    if (complexityScore > 3.0) riskAssessment = 'high';
    if (complexityScore > 5.0) riskAssessment = 'critical';
    
    return {
      complexity_score: Math.round(complexityScore * 100) / 100,
      risk_assessment: riskAssessment,
      file_categories: fileCategories,
      languages_affected: Array.from(languagesAffected),
      test_coverage_impact: testCoverageImpact
    };
  }

  /**
   * Calculate file risk score based on change patterns
   */
  private static calculateFileRiskScore(
    changeCount: number,
    contributorCount: number,
    avgChangeSize: number,
    lastChanged: Date
  ): number {
    let riskScore = 0;
    
    // High change frequency increases risk
    if (changeCount > 10) riskScore += 0.3;
    if (changeCount > 25) riskScore += 0.2;
    if (changeCount > 50) riskScore += 0.2;
    
    // Many contributors can indicate complexity
    if (contributorCount > 5) riskScore += 0.2;
    if (contributorCount > 10) riskScore += 0.1;
    
    // Large average changes suggest complexity
    if (avgChangeSize > 50) riskScore += 0.2;
    if (avgChangeSize > 200) riskScore += 0.2;
    
    // Recent activity suggests ongoing work
    const daysSinceLastChange = (Date.now() - lastChanged.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastChange < 7) riskScore += 0.1;
    
    return Math.min(Math.round(riskScore * 100) / 100, 1.0);
  }

  /**
   * Get most active file category
   */
  private static getMostActiveCategory(hotspots: Array<{ file_category: string; change_count: number }>): string {
    const categoryTotals: Record<string, number> = {};
    
    for (const hotspot of hotspots) {
      categoryTotals[hotspot.file_category] = 
        (categoryTotals[hotspot.file_category] || 0) + hotspot.change_count;
    }
    
    return Object.entries(categoryTotals)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || 'unknown';
  }

  private static createServiceError(code: string, message: string, details?: any): GitServiceError {
    return {
      code,
      message,
      details,
      stack: new Error().stack || ''
    };
  }
}

// Export the service for use in other modules
export default GitService;