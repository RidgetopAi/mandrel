#!/usr/bin/env npx tsx

/**
 * Cleanup Test Data
 * Remove duplicate test data from previous runs
 */

import { initializeDatabase, closeDatabase } from './src/config/database.js';
import { db } from './src/config/database.js';

async function cleanupTestData(): Promise<void> {
  console.log('🧹 Cleaning up test data...');
  
  await initializeDatabase();
  
  const client = await db.connect();
  try {
    // Delete test project created by agent test
    const testProjectResult = await client.query(
      `DELETE FROM projects WHERE name LIKE 'test-project-%' RETURNING name`
    );
    console.log(`✅ Removed ${testProjectResult.rows.length} test projects`);

    // Remove duplicate tasks (keep only the most recent of each title)
    const duplicateTasksResult = await client.query(`
      DELETE FROM agent_tasks 
      WHERE id NOT IN (
        SELECT DISTINCT ON (title, project_id, assigned_to) id 
        FROM agent_tasks 
        ORDER BY title, project_id, assigned_to, created_at DESC
      )
      RETURNING title
    `);
    console.log(`✅ Removed ${duplicateTasksResult.rows.length} duplicate tasks`);

    // Clean up old agent messages (keep only last 10 per project)
    const oldMessagesResult = await client.query(`
      DELETE FROM agent_messages 
      WHERE id NOT IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at DESC) as rn
          FROM agent_messages
        ) ranked WHERE rn <= 10
      )
      RETURNING id
    `);
    console.log(`✅ Removed ${oldMessagesResult.rows.length} old messages`);

    console.log('🎉 Test data cleanup completed!');
  } finally {
    client.release();
    await closeDatabase();
  }
}

cleanupTestData().catch(console.error);
