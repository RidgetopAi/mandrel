#!/usr/bin/env tsx

/**
 * Test script for BullMQ queue system
 * Validates Redis connection and basic queue operations
 */

import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_CONFIG = {
  host: 'localhost',
  port: 6379,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  connectTimeout: 10000,
  lazyConnect: true,
};

interface TestJobData {
  type: string;
  message: string;
  timestamp: number;
}

async function testQueueSystem(): Promise<void> {
  console.log('🚀 Testing BullMQ Queue System');
  console.log('================================');

  // Test Redis connection
  console.log('\n1. Testing Redis connection...');
  const redis = new IORedis(REDIS_CONFIG);

  try {
    const pong = await redis.ping();
    console.log(`✅ Redis connection successful: ${pong}`);
  } catch (error) {
    console.error(`❌ Redis connection failed:`, error);
    process.exit(1);
  }

  // Test queue creation
  console.log('\n2. Creating test queue...');
  const queue = new Queue('test-queue', {
    connection: REDIS_CONFIG,
    defaultJobOptions: {
      removeOnComplete: 5,
      removeOnFail: 10,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });

  // Test worker creation
  console.log('\n3. Creating test worker...');
  const worker = new Worker('test-queue', async (job: Job<TestJobData>) => {
    console.log(`[Worker] Processing job ${job.id}: ${job.data.message}`);
    return { processed: true, timestamp: Date.now() };
  }, {
    connection: REDIS_CONFIG,
    concurrency: 1,
  });

  // Test job addition
  console.log('\n4. Adding test jobs...');

  await queue.add('test-job-1', {
    type: 'feature-flags-refresh',
    message: 'Test feature flags refresh',
    timestamp: Date.now(),
  });

  await queue.add('test-job-2', {
    type: 'git-tracking',
    message: 'Test git tracking',
    timestamp: Date.now(),
  });

  console.log('✅ Test jobs added successfully');

  // Test recurring job
  console.log('\n5. Adding recurring job...');
  await queue.add('recurring-test', {
    type: 'recurring',
    message: 'Test recurring job',
    timestamp: Date.now(),
  }, {
    repeat: { every: 5000 },
    jobId: 'recurring-test-job',
  });

  console.log('✅ Recurring job added successfully');

  // Wait for jobs to process
  console.log('\n6. Processing jobs (waiting 8 seconds)...');
  await new Promise(resolve => setTimeout(resolve, 8000));

  // Get queue stats
  console.log('\n7. Getting queue statistics...');
  const waiting = await queue.getWaiting();
  const active = await queue.getActive();
  const completed = await queue.getCompleted();
  const failed = await queue.getFailed();
  const delayed = await queue.getDelayed();

  console.log(`📊 Queue Stats:
  - Waiting: ${waiting.length}
  - Active: ${active.length}
  - Completed: ${completed.length}
  - Failed: ${failed.length}
  - Delayed: ${delayed.length}`);

  // Cleanup
  console.log('\n8. Cleaning up...');

  // Remove recurring job
  await queue.removeRepeatable('recurring-test', { every: 5000 });
  console.log('✅ Recurring job removed');

  // Close worker
  await worker.close();
  console.log('✅ Worker closed');

  // Close queue
  await queue.close();
  console.log('✅ Queue closed');

  // Close Redis
  await redis.quit();
  console.log('✅ Redis connection closed');

  console.log('\n🎉 BullMQ queue system test completed successfully!');
}

// Run the test
testQueueSystem().catch((error) => {
  console.error('💥 Test failed:', error);
  process.exit(1);
});