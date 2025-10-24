import { Queue, Worker, Job, QueueOptions, WorkerOptions } from 'bullmq';
import IORedis from 'ioredis';

/**
 * AIDIS Queue Manager
 * Replaces timer-based polling with proper queue system
 * Based on TR004-4 audit findings: Feature flags polling, git tracking, metrics collection
 */

const REDIS_CONFIG = {
  host: 'localhost',
  port: 6379,
  maxRetriesPerRequest: null, // Required by BullMQ
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  connectTimeout: 10000,
  lazyConnect: true,
};

const DEFAULT_QUEUE_OPTIONS: QueueOptions = {
  connection: REDIS_CONFIG,
  defaultJobOptions: {
    removeOnComplete: 50,  // Keep last 50 completed jobs
    removeOnFail: 100,     // Keep last 100 failed jobs for debugging
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
};

const DEFAULT_WORKER_OPTIONS: WorkerOptions = {
  connection: REDIS_CONFIG,
  concurrency: 1,  // Process one job at a time initially
};

export enum JobType {
  FEATURE_FLAGS_REFRESH = 'feature-flags-refresh',
  GIT_TRACKING = 'git-tracking',
  METRICS_COLLECTION = 'metrics-collection',
  COMPLEXITY_ANALYSIS = 'complexity-analysis',
  PATTERN_DETECTION = 'pattern-detection',
}

export interface QueueJobData {
  type: JobType;
  projectId?: string;
  sessionId?: string;
  config?: Record<string, any>;
  timestamp: number;
}

export class QueueManager {
  private queue: Queue;
  private workers: Map<JobType, Worker> = new Map();
  private redis: IORedis;
  private isShuttingDown = false;

  constructor(queueName = 'aidis-background-jobs') {
    this.redis = new IORedis(REDIS_CONFIG);
    this.queue = new Queue(queueName, DEFAULT_QUEUE_OPTIONS);

    // Setup error handling
    this.queue.on('error', (error) => {
      console.error('[QueueManager] Queue error:', error);
    });

    this.redis.on('error', (error) => {
      console.error('[QueueManager] Redis connection error:', error);
    });
  }

  /**
   * Initialize queue system and start workers
   */
  async initialize(): Promise<void> {
    try {
      await this.redis.ping();
      console.log('[QueueManager] Redis connection established');

      // Register all job processors
      this.registerWorkers();

      // Schedule recurring jobs to replace timers
      await this.scheduleRecurringJobs();

      console.log('[QueueManager] Queue system initialized');
    } catch (error) {
      console.error('[QueueManager] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Register worker processors for each job type
   */
  private registerWorkers(): void {
    // Feature flags refresh worker (replaces 5s timer)
    this.createWorker(JobType.FEATURE_FLAGS_REFRESH, async (_job: Job<QueueJobData>) => {
      const { default: featureFlagStore } = await import('../utils/featureFlags.js');
      await featureFlagStore.refresh();
      console.log(`[QueueManager] Feature flags refreshed at ${new Date().toISOString()}`);
      return { success: true, timestamp: Date.now() };
    });

    // Git tracking worker (replaces 30s timer)
    this.createWorker(JobType.GIT_TRACKING, async (_job: Job<QueueJobData>) => {
      // TODO: Implement git tracking logic (currently timer-based in server.ts:4931)
      console.log(`[QueueManager] Git tracking executed at ${new Date().toISOString()}`);
      return { success: true, timestamp: Date.now() };
    });

    // Metrics collection worker (replaces 5min timer)
    this.createWorker(JobType.METRICS_COLLECTION, async (_job: Job<QueueJobData>) => {
      // TODO: Implement metrics collection logic
      console.log(`[QueueManager] Metrics collection executed at ${new Date().toISOString()}`);
      return { success: true, timestamp: Date.now() };
    });

    // Complexity analysis worker (replaces 10min timer)
    this.createWorker(JobType.COMPLEXITY_ANALYSIS, async (_job: Job<QueueJobData>) => {
      // TODO: Implement complexity analysis logic
      console.log(`[QueueManager] Complexity analysis executed at ${new Date().toISOString()}`);
      return { success: true, timestamp: Date.now() };
    });

    // Pattern detection worker
    this.createWorker(JobType.PATTERN_DETECTION, async (_job: Job<QueueJobData>) => {
      // TODO: Implement pattern detection logic
      console.log(`[QueueManager] Pattern detection executed at ${new Date().toISOString()}`);
      return { success: true, timestamp: Date.now() };
    });
  }

  /**
   * Create a worker for a specific job type
   */
  private createWorker(jobType: JobType, processor: (job: Job<QueueJobData>) => Promise<any>): void {
    const worker = new Worker(
      this.queue.name,
      async (job: Job<QueueJobData>) => {
        if (job.data.type === jobType) {
          return await processor(job);
        }
      },
      {
        ...DEFAULT_WORKER_OPTIONS,
        name: `${jobType}-worker`,
      }
    );

    worker.on('error', (error) => {
      console.error(`[QueueManager] Worker ${jobType} error:`, error);
    });

    worker.on('failed', (job, error) => {
      console.error(`[QueueManager] Job ${job?.id} (${jobType}) failed:`, error);
    });

    this.workers.set(jobType, worker);
  }

  /**
   * Schedule recurring jobs to replace timer-based polling
   */
  private async scheduleRecurringJobs(): Promise<void> {
    // Feature flags refresh every 5 seconds
    await this.queue.add(
      JobType.FEATURE_FLAGS_REFRESH,
      {
        type: JobType.FEATURE_FLAGS_REFRESH,
        timestamp: Date.now(),
      },
      {
        repeat: { every: 5000 },
        jobId: 'feature-flags-refresh',
      }
    );

    // Git tracking every 30 seconds
    await this.queue.add(
      JobType.GIT_TRACKING,
      {
        type: JobType.GIT_TRACKING,
        timestamp: Date.now(),
      },
      {
        repeat: { every: 30000 },
        jobId: 'git-tracking',
      }
    );

    // Metrics collection every 5 minutes
    await this.queue.add(
      JobType.METRICS_COLLECTION,
      {
        type: JobType.METRICS_COLLECTION,
        timestamp: Date.now(),
      },
      {
        repeat: { every: 300000 },
        jobId: 'metrics-collection',
      }
    );

    // Complexity analysis every 10 minutes
    await this.queue.add(
      JobType.COMPLEXITY_ANALYSIS,
      {
        type: JobType.COMPLEXITY_ANALYSIS,
        timestamp: Date.now(),
      },
      {
        repeat: { every: 600000 },
        jobId: 'complexity-analysis',
      }
    );

    console.log('[QueueManager] Recurring jobs scheduled');
  }

  /**
   * Add a one-time job to the queue
   */
  async addJob(jobType: JobType, data: Partial<QueueJobData> = {}, options: any = {}): Promise<void> {
    const jobData: QueueJobData = {
      type: jobType,
      timestamp: Date.now(),
      ...data,
    };

    await this.queue.add(jobType, jobData, options);
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<any> {
    const waiting = await this.queue.getWaiting();
    const active = await this.queue.getActive();
    const completed = await this.queue.getCompleted();
    const failed = await this.queue.getFailed();
    const delayed = await this.queue.getDelayed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      workers: Array.from(this.workers.keys()),
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log('[QueueManager] Shutting down...');

    // Close all workers
    for (const [jobType, worker] of this.workers) {
      try {
        await worker.close();
        console.log(`[QueueManager] Worker ${jobType} closed`);
      } catch (error) {
        console.error(`[QueueManager] Error closing worker ${jobType}:`, error);
      }
    }

    // Close queue
    try {
      await this.queue.close();
      console.log('[QueueManager] Queue closed');
    } catch (error) {
      console.error('[QueueManager] Error closing queue:', error);
    }

    // Close Redis connection
    try {
      await this.redis.quit();
      console.log('[QueueManager] Redis connection closed');
    } catch (error) {
      console.error('[QueueManager] Error closing Redis:', error);
    }
  }
}

// Singleton instance
let queueManager: QueueManager | null = null;

export async function getQueueManager(): Promise<QueueManager> {
  if (!queueManager) {
    queueManager = new QueueManager();
    await queueManager.initialize();
  }
  return queueManager;
}

export async function shutdownQueue(): Promise<void> {
  if (queueManager) {
    await queueManager.shutdown();
    queueManager = null;
  }
}