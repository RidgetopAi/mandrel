/**
 * Attempt to infer project_id for sessions where it is NULL
 * – If every analytics_event for that session has the same project_id, adopt it
 * – else assign __unassigned__ sentinel project
 */
import { db } from '../config/database.js';

async function backfillSessions() {
  console.log('🔄 Starting session backfill process...');
  
  const orphanRows = await db.query(`SELECT id FROM sessions WHERE project_id IS NULL`);
  console.log(`Found ${orphanRows.rows.length} orphan sessions`);
  
  for (const { id } of orphanRows.rows) {
    const { rows } = await db.query(`
        SELECT DISTINCT project_id FROM analytics_events WHERE session_id = $1 AND project_id IS NOT NULL
    `, [id]);
    
    if (rows.length === 1) {
       // Single consistent project_id found in analytics events
       await db.query(`UPDATE sessions SET project_id=$1 WHERE id=$2`, [rows[0].project_id, id]);
       console.log(`✅ Session ${id} back-filled with project ${rows[0].project_id}`);
    } else {
       // No consistent project or multiple projects - mark as unassigned
       await db.query(`UPDATE sessions SET project_id='00000000-0000-0000-0000-000000000000' WHERE id=$1`, [id]);
       console.log(`⚠️  Session ${id} marked as unassigned (${rows.length} distinct projects in events)`);
    }
  }
  
  // Verification
  const remainingNulls = await db.query(`SELECT COUNT(*) FROM sessions WHERE project_id IS NULL`);
  console.log(`✅ Backfill complete. Remaining NULL sessions: ${remainingNulls.rows[0].count}`);
  
  process.exit(0);
}

backfillSessions().catch(error => {
  console.error('❌ Backfill failed:', error);
  process.exit(1);
});
