/**
 * Real-time Git Tracking Service for AIDIS
 * 
 * Monitors git activity during active sessions and automatically
 * triggers correlation when commits are detected.
 * 
 * Features:
 * - File system monitoring for .git directory changes
 * - Periodic polling for recent commits
 * - Automatic session-commit correlation
 * - Background processing for minimal performance impact
 */

import { watchFile, unwatchFile, existsSync } from 'fs';
import { join } from 'path';
import { GitHandler } from '../handlers/git.js';
import { GitCorrelationService } from './gitCorrelation.js';
import { getCurrentSession } from './sessionTracker.js';
import { db } from '../config/database.js';
import { logEvent } from '../middleware/eventLogger.js';

export interface GitTrackingConfig {
  enableFileWatching: boolean;
  enablePeriodicPolling: boolean;
  pollingIntervalMs: number;
  correlationDelayMs: number;
  maxRecentCommitsCheck: number;
}

export interface GitTrackingStatus {
  isActive: boolean;
  currentSession?: string;
  projectPath?: string;
  lastCheckTime: Date;
  commitsDetected: number;
  correlationsTriggered: number;
  watchers: string[];
}

const DEFAULT_CONFIG: GitTrackingConfig = {
  enableFileWatching: true,
  enablePeriodicPolling: true,
  pollingIntervalMs: 30000, // 30 seconds
  correlationDelayMs: 5000,  // 5 seconds delay after commit detection
  maxRecentCommitsCheck: 5   // Check for commits in last 5 minutes
};

/**
 * Real-time Git Tracking Service
 */
export class GitTracker {
  private static instance: GitTracker | null = null;
  private config: GitTrackingConfig;
  private isRunning: boolean = false;
  private pollingTimer: NodeJS.Timeout | null = null;
  private watchers: Map<string, () => void> = new Map();
  private status: GitTrackingStatus;

  private constructor(config: Partial<GitTrackingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.status = {
      isActive: false,
      lastCheckTime: new Date(),
      commitsDetected: 0,
      correlationsTriggered: 0,
      watchers: []
    };
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<GitTrackingConfig>): GitTracker {
    if (!GitTracker.instance) {
      GitTracker.instance = new GitTracker(config);
    }
    return GitTracker.instance;
  }

  /**
   * Start real-time git tracking
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚡ Git tracker already running');
      return;
    }

    try {
      console.log('🚀 Starting real-time git tracking...');
      
      this.isRunning = true;
      this.status.isActive = true;
      this.status.lastCheckTime = new Date();

      // Start file watching if enabled
      if (this.config.enableFileWatching) {
        await this.startFileWatching();
      }

      // Start periodic polling if enabled
      if (this.config.enablePeriodicPolling) {
        await this.startPeriodicPolling();
      }

      // Log tracking start
      await logEvent({
        actor: 'system',
        event_type: 'git_tracking_started',
        status: 'open',
        metadata: {
          fileWatching: this.config.enableFileWatching,
          periodicPolling: this.config.enablePeriodicPolling,
          pollingInterval: this.config.pollingIntervalMs
        },
        tags: ['git', 'tracking', 'realtime']
      });

      console.log('✅ Git tracking started successfully');

    } catch (error) {
      console.error('❌ Failed to start git tracking:', error);
      this.isRunning = false;
      this.status.isActive = false;
      throw error;
    }
  }

  /**
   * Stop real-time git tracking
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('⚡ Git tracker not running');
      return;
    }

    try {
      console.log('🛑 Stopping real-time git tracking...');

      this.isRunning = false;
      this.status.isActive = false;

      // Stop periodic polling
      if (this.pollingTimer) {
        clearInterval(this.pollingTimer);
        this.pollingTimer = null;
      }

      // Stop file watching
      await this.stopFileWatching();

      // Log tracking stop
      await logEvent({
        actor: 'system',
        event_type: 'git_tracking_stopped',
        status: 'closed',
        metadata: {
          commitsDetected: this.status.commitsDetected,
          correlationsTriggered: this.status.correlationsTriggered,
          totalWatchers: this.watchers.size
        },
        tags: ['git', 'tracking', 'realtime']
      });

      console.log('✅ Git tracking stopped successfully');

    } catch (error) {
      console.error('❌ Failed to stop git tracking:', error);
      throw error;
    }
  }

  /**
   * Get current tracking status
   */
  getStatus(): GitTrackingStatus {
    return {
      ...this.status,
      watchers: Array.from(this.watchers.keys())
    };
  }

  /**
   * Check for recent git activity
   */
  async checkForRecentActivity(): Promise<{
    hasActivity: boolean;
    newCommits: number;
    correlationTriggered: boolean;
  }> {
    try {
      // Get current session
      const sessionId = await getCurrentSession();
      if (!sessionId) {
        return {
          hasActivity: false,
          newCommits: 0,
          correlationTriggered: false
        };
      }

      // Get session project
      const sessionQuery = `
        SELECT project_id FROM user_sessions WHERE id = $1
        UNION ALL
        SELECT project_id FROM sessions WHERE id = $1
      `;
      const sessionResult = await db.query(sessionQuery, [sessionId]);
      
      if (sessionResult.rows.length === 0 || !sessionResult.rows[0].project_id) {
        return {
          hasActivity: false,
          newCommits: 0,
          correlationTriggered: false
        };
      }

      // Check for new commits using GitHandler
      const result = await GitHandler.trackRealtimeGitActivity();
      
      this.status.lastCheckTime = new Date();

      if (result.recentCommits > 0) {
        console.log(`⚡ Detected ${result.recentCommits} recent commits`);
        this.status.commitsDetected += result.recentCommits;
        
        if (result.autoCorrelated) {
          this.status.correlationsTriggered++;
        }

        return {
          hasActivity: true,
          newCommits: result.recentCommits,
          correlationTriggered: result.autoCorrelated
        };
      }

      return {
        hasActivity: false,
        newCommits: 0,
        correlationTriggered: false
      };

    } catch (error) {
      console.error('❌ Error checking git activity:', error);
      return {
        hasActivity: false,
        newCommits: 0,
        correlationTriggered: false
      };
    }
  }

  /**
   * Start file system watching for git changes
   */
  private async startFileWatching(): Promise<void> {
    try {
      // Get current session and project
      const sessionId = await getCurrentSession();
      if (!sessionId) {
        console.log('📁 No active session - skipping file watching');
        return;
      }

      // Get project root directory
      const sessionQuery = `
        SELECT p.root_directory, p.metadata->>'git_repo_path' as git_path
        FROM user_sessions us
        JOIN projects p ON us.project_id = p.id
        WHERE us.id = $1
        UNION ALL
        SELECT p.root_directory, p.metadata->>'git_repo_path' as git_path
        FROM sessions s
        JOIN projects p ON s.project_id = p.id
        WHERE s.id = $1
      `;
      
      const result = await db.query(sessionQuery, [sessionId]);
      if (result.rows.length === 0) {
        console.log('📁 Session not assigned to project - skipping file watching');
        return;
      }

      const projectData = result.rows[0];
      const projectPath = projectData.git_path || projectData.root_directory;
      
      if (!projectPath) {
        console.log('📁 No project path found - skipping file watching');
        return;
      }

      this.status.projectPath = projectPath;

      // Watch key git files
      const gitFilesToWatch = [
        join(projectPath, '.git', 'HEAD'),
        join(projectPath, '.git', 'index'),
        join(projectPath, '.git', 'refs', 'heads'),
        join(projectPath, '.git', 'logs', 'HEAD')
      ];

      for (const filePath of gitFilesToWatch) {
        if (existsSync(filePath)) {
          try {
            const watchCallback = () => this.onGitFileChange(filePath);
            watchFile(filePath, { interval: 1000 }, watchCallback);
            this.watchers.set(filePath, () => unwatchFile(filePath, watchCallback));
            console.log(`👀 Watching: ${filePath}`);
          } catch (error) {
            console.warn(`⚠️  Failed to watch ${filePath}:`, error);
          }
        }
      }

      console.log(`📁 Started file watching for ${this.watchers.size} git files`);

    } catch (error) {
      console.error('❌ Failed to start file watching:', error);
    }
  }

  /**
   * Stop file system watching
   */
  private async stopFileWatching(): Promise<void> {
    try {
      for (const [filePath, stopWatcher] of this.watchers) {
        try {
          stopWatcher();
          console.log(`👁️  Stopped watching: ${filePath}`);
        } catch (error) {
          console.warn(`⚠️  Failed to stop watching ${filePath}:`, error);
        }
      }
      
      this.watchers.clear();
      console.log('📁 Stopped all file watchers');

    } catch (error) {
      console.error('❌ Failed to stop file watching:', error);
    }
  }

  /**
   * Start periodic polling for git changes
   */
  private async startPeriodicPolling(): Promise<void> {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }

    this.pollingTimer = setInterval(async () => {
      if (this.isRunning) {
        await this.checkForRecentActivity();
      }
    }, this.config.pollingIntervalMs);

    console.log(`⏰ Started periodic polling every ${this.config.pollingIntervalMs}ms`);
  }

  /**
   * Handle git file change event
   */
  private async onGitFileChange(filePath: string): Promise<void> {
    try {
      console.log(`📝 Git file changed: ${filePath}`);

      // Add small delay to allow git operation to complete
      await new Promise(resolve => setTimeout(resolve, this.config.correlationDelayMs));

      // Check for recent activity
      const activity = await this.checkForRecentActivity();
      
      if (activity.hasActivity) {
        console.log(`⚡ Git file change triggered correlation: ${activity.newCommits} commits`);
        
        // Log the file change event
        await logEvent({
          actor: 'system',
          event_type: 'git_file_change_detected',
          status: 'closed',
          metadata: {
            filePath,
            newCommits: activity.newCommits,
            correlationTriggered: activity.correlationTriggered
          },
          tags: ['git', 'tracking', 'file_change']
        });
      }

    } catch (error) {
      console.error(`❌ Error handling git file change for ${filePath}:`, error);
    }
  }

  /**
   * Force trigger correlation for current session
   */
  async forceCorrelation(): Promise<{
    success: boolean;
    sessionId?: string;
    linksCreated: number;
    message: string;
  }> {
    try {
      const sessionId = await getCurrentSession();
      if (!sessionId) {
        return {
          success: false,
          linksCreated: 0,
          message: 'No active session found'
        };
      }

      console.log(`🔗 Force triggering correlation for session: ${sessionId.substring(0, 8)}...`);

      const result = await GitCorrelationService.correlateSessionWithGit(sessionId);
      
      if (result.success) {
        this.status.correlationsTriggered++;
      }

      return {
        success: result.success,
        sessionId,
        linksCreated: result.linksCreated,
        message: result.message
      };

    } catch (error) {
      console.error('❌ Force correlation failed:', error);
      return {
        success: false,
        linksCreated: 0,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

/**
 * Utility functions for external usage
 */

/**
 * Start git tracking (singleton)
 */
export async function startGitTracking(config?: Partial<GitTrackingConfig>): Promise<void> {
  const tracker = GitTracker.getInstance(config);
  await tracker.start();
}

/**
 * Stop git tracking
 */
export async function stopGitTracking(): Promise<void> {
  const tracker = GitTracker.getInstance();
  await tracker.stop();
}

/**
 * Get git tracking status
 */
export function getGitTrackingStatus(): GitTrackingStatus {
  const tracker = GitTracker.getInstance();
  return tracker.getStatus();
}

/**
 * Check for recent git activity
 */
export async function checkGitActivity(): Promise<{
  hasActivity: boolean;
  newCommits: number;
  correlationTriggered: boolean;
}> {
  const tracker = GitTracker.getInstance();
  return await tracker.checkForRecentActivity();
}

/**
 * Force correlation for current session
 */
export async function forceGitCorrelation(): Promise<{
  success: boolean;
  sessionId?: string;
  linksCreated: number;
  message: string;
}> {
  const tracker = GitTracker.getInstance();
  return await tracker.forceCorrelation();
}

/**
 * Export the main class
 */
export default GitTracker;