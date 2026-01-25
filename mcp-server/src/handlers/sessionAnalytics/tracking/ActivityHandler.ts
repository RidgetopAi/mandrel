/**
 * Session Activity & File Tracking Handler
 * 
 * Phase 2D/2E functionality for detailed session tracking.
 * - Activity event recording
 * - Activity timeline retrieval
 * - File modification tracking
 * - Productivity score calculation
 */

import { SessionTracker } from '../../../services/sessionTracker.js';
import { MCPToolResponse } from '../types.js';

export class ActivityHandler {
  /**
   * Record session activity event (Phase 2D/2E)
   */
  static async recordSessionActivity(
    sessionId: string,
    activityType: string,
    activityData: Record<string, any> = {}
  ): Promise<MCPToolResponse> {
    try {
      await SessionTracker.recordActivity(sessionId, activityType, activityData);

      return {
        content: [{
          type: 'text',
          text: `✅ Activity recorded successfully!\n\n` +
                `📋 Session: ${sessionId.substring(0, 8)}...\n` +
                `🔄 Type: ${activityType}\n` +
                `📊 Data: ${JSON.stringify(activityData, null, 2)}\n\n` +
                `ℹ️  View activities with session_get_activities("${sessionId}")`
        }]
      };
    } catch (error) {
      console.error('❌ Failed to record session activity:', error, {
        component: 'ActivityHandler',
        operation: 'recordSessionActivity',
        metadata: { sessionId, activityType }
      });
      throw error;
    }
  }

  /**
   * Get session activities with optional filtering (Phase 2D/2E)
   */
  static async getSessionActivitiesHandler(
    sessionId: string,
    activityType?: string,
    limit: number = 100
  ): Promise<MCPToolResponse> {
    try {
      const activities = await SessionTracker.getSessionActivities(sessionId, activityType, limit);

      if (activities.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `📋 No activities found for session ${sessionId.substring(0, 8)}...\n\n` +
                  (activityType ? `🔍 Filter: ${activityType}\n\n` : '') +
                  `ℹ️  Record activities with session_record_activity()`
          }]
        };
      }

      const activityLines = activities.map((act, index) => {
        const timestamp = new Date(act.occurred_at).toISOString();
        const data = JSON.stringify(act.activity_data, null, 2);
        return `${index + 1}. **${act.activity_type}**\n` +
               `   ⏰ ${timestamp}\n` +
               `   📊 Data: ${data}`;
      });

      return {
        content: [{
          type: 'text',
          text: `📋 Session Activities (${activities.length})\n\n` +
                `🆔 Session: ${sessionId.substring(0, 8)}...\n` +
                (activityType ? `🔍 Filter: ${activityType}\n` : '') +
                `📊 Showing: ${activities.length} of max ${limit}\n\n` +
                `## Activity Timeline\n\n` +
                activityLines.join('\n\n')
        }]
      };
    } catch (error) {
      console.error('❌ Failed to get session activities:', error, {
        component: 'ActivityHandler',
        operation: 'getSessionActivitiesHandler',
        metadata: { sessionId, activityType, limit }
      });
      throw error;
    }
  }

  /**
   * Record file modification in session (Phase 2D/2E)
   */
  static async recordFileEdit(
    sessionId: string,
    filePath: string,
    linesAdded: number,
    linesDeleted: number,
    source: 'tool' | 'git' | 'manual' = 'tool'
  ): Promise<MCPToolResponse> {
    try {
      if (!['tool', 'git', 'manual'].includes(source)) {
        throw new Error('source must be "tool", "git", or "manual"');
      }

      await SessionTracker.recordFileModification(sessionId, filePath, linesAdded, linesDeleted, source);

      const netChange = linesAdded - linesDeleted;

      return {
        content: [{
          type: 'text',
          text: `✅ File modification recorded!\n\n` +
                `📁 File: ${filePath}\n` +
                `📊 LOC: +${linesAdded} -${linesDeleted} (net: ${netChange >= 0 ? '+' : ''}${netChange})\n` +
                `🔍 Source: ${source}\n` +
                `🆔 Session: ${sessionId.substring(0, 8)}...\n\n` +
                `ℹ️  View all files with session_get_files("${sessionId}")`
        }]
      };
    } catch (error) {
      console.error('❌ Failed to record file edit:', error, {
        component: 'ActivityHandler',
        operation: 'recordFileEdit',
        metadata: { sessionId, filePath, linesAdded, linesDeleted, source }
      });
      throw error;
    }
  }

  /**
   * Get all files modified in session (Phase 2D/2E)
   */
  static async getSessionFilesHandler(
    sessionId: string
  ): Promise<MCPToolResponse> {
    try {
      const files = await SessionTracker.getSessionFiles(sessionId);

      if (files.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `📁 No files modified in session ${sessionId.substring(0, 8)}...\n\n` +
                  `ℹ️  Record file modifications with session_record_file_edit()`
          }]
        };
      }

      const totalAdded = files.reduce((sum, f) => sum + f.lines_added, 0);
      const totalDeleted = files.reduce((sum, f) => sum + f.lines_deleted, 0);
      const totalNet = totalAdded - totalDeleted;

      const fileLines = files.map((file, index) => {
        const net = file.lines_added - file.lines_deleted;
        return `${index + 1}. **${file.file_path}**\n` +
               `   📊 LOC: +${file.lines_added} -${file.lines_deleted} (net: ${net >= 0 ? '+' : ''}${net})\n` +
               `   🔍 Source: ${file.source}\n` +
               `   ⏰ Modified: ${new Date(file.last_modified).toISOString()}`;
      });

      return {
        content: [{
          type: 'text',
          text: `📁 Session Files (${files.length})\n\n` +
                `🆔 Session: ${sessionId.substring(0, 8)}...\n` +
                `📊 Total LOC: +${totalAdded} -${totalDeleted} (net: ${totalNet >= 0 ? '+' : ''}${totalNet})\n\n` +
                `## Files Modified\n\n` +
                fileLines.join('\n\n')
        }]
      };
    } catch (error) {
      console.error('❌ Failed to get session files:', error, {
        component: 'ActivityHandler',
        operation: 'getSessionFilesHandler',
        metadata: { sessionId }
      });
      throw error;
    }
  }

  /**
   * Calculate productivity score for session (Phase 2D/2E)
   */
  static async calculateSessionProductivity(
    sessionId: string,
    configName: string = 'default'
  ): Promise<MCPToolResponse> {
    try {
      const score = await SessionTracker.calculateProductivityScore(sessionId, configName);

      return {
        content: [{
          type: 'text',
          text: `⭐ Productivity Score Calculated!\n\n` +
                `🆔 Session: ${sessionId.substring(0, 8)}...\n` +
                `📊 Score: ${score}/100\n` +
                `⚙️  Config: ${configName}\n\n` +
                `ℹ️  Score is based on:\n` +
                `   • Tasks completed (30%)\n` +
                `   • Context stored (20%)\n` +
                `   • Lines of code (30%)\n` +
                `   • Decisions recorded (10%)\n` +
                `   • Time efficiency (10%)\n\n` +
                `ℹ️  View updated score with session_details("${sessionId}")`
        }]
      };
    } catch (error) {
      console.error('❌ Failed to calculate productivity score:', error, {
        component: 'ActivityHandler',
        operation: 'calculateSessionProductivity',
        metadata: { sessionId, configName }
      });
      throw error;
    }
  }
}
