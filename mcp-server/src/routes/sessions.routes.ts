import { SessionManagementHandler } from '../handlers/sessionAnalytics.js';
import { formatMcpError } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';

/**
 * Session Management Routes
 * Handles: session_assign, session_status, session_new, session_update, session_details
 */
export class SessionsRoutes {
  /**
   * Handle session assign requests
   */
  async handleAssign(args: any): Promise<McpResponse> {
    try {
      console.log(`🔗 Session assign request: project="${args.projectName}"`);

      const result = await SessionManagementHandler.assignSessionToProject(args.projectName);

      return {
        content: [{
          type: 'text',
          text: result.message + (result.success ? `\n\n📝 Session ID: ${result.sessionId?.substring(0, 8)}...\n🏷️  Project: ${result.projectName}` : '')
        }]
      };
    } catch (error) {
      return formatMcpError(error as Error, 'session_assign');
    }
  }

  /**
   * Handle session status request
   */
  async handleStatus(): Promise<McpResponse> {
    try {
      console.log('📋 Session status request');

      const result = await SessionManagementHandler.getSessionStatus();

      if (!result.success) {
        return {
          content: [{
            type: 'text',
            text: `❌ ${result.message}`
          }]
        };
      }

      const session = result.session!;
      const statusLines: string[] = [];
      statusLines.push('📋 Current Session Status\n');
      statusLines.push(`🆔 Session ID: ${session.id.substring(0, 8)}...`);
      statusLines.push(`🏷️  Type: ${session.type}`);
      statusLines.push(`🏢 Project: ${session.project_name}`);
      statusLines.push(`⏰ Started: ${new Date(session.started_at).toLocaleString()}`);
      statusLines.push(`⏱️  Duration: ${session.duration_minutes} minutes`);
      statusLines.push(`📝 Contexts: ${session.contexts_created}`);
      statusLines.push(`📋 Tasks: ${session.tasks_created || 0} created, ${session.tasks_updated || 0} updated, ${session.tasks_completed || 0} completed`);
      statusLines.push(`🎯 Decisions: ${session.decisions_created}`);
      statusLines.push(`🪙 Tokens: ${session.total_tokens?.toLocaleString() || 0} (↓${session.input_tokens?.toLocaleString() || 0} ↑${session.output_tokens?.toLocaleString() || 0})`);

      // Phase 2 enhanced fields (conditional display)
      if (session.session_goal) {
        statusLines.push(`📋 Goal: ${session.session_goal}`);
      }
      if (session.tags && session.tags.length > 0) {
        statusLines.push(`🏷️  Tags: ${session.tags.join(', ')}`);
      }
      if (session.ai_model) {
        statusLines.push(`🤖 AI Model: ${session.ai_model}`);
      }
      if (session.files_modified_count > 0) {
        statusLines.push(`📁 Files Modified: ${session.files_modified_count}`);
      }
      if (session.lines_added !== undefined || session.lines_deleted !== undefined) {
        statusLines.push(`📊 LOC: +${session.lines_added || 0} -${session.lines_deleted || 0} (net: ${session.lines_net || 0})`);
      }
      if (session.productivity_score !== null && session.productivity_score !== undefined) {
        statusLines.push(`⭐ Productivity Score: ${session.productivity_score}/100`);
      }
      if (session.activity_count > 0) {
        statusLines.push(`🔄 Activities: ${session.activity_count}`);
      }

      // Original metadata fields
      if (session.metadata.title) {
        statusLines.push(`📌 Title: "${session.metadata.title}"`);
      }
      if (session.metadata.assigned_manually) {
        statusLines.push(`🔧 Manually assigned at: ${new Date(session.metadata.assigned_at).toLocaleString()}`);
      }

      const statusText = statusLines.join('\n');

      return {
        content: [{
          type: 'text',
          text: statusText
        }]
      };
    } catch (error) {
      return formatMcpError(error as Error, 'session_status');
    }
  }

  /**
   * Handle new session creation (Phase 2 enhanced)
   */
  async handleNew(args: any): Promise<McpResponse> {
    try {
      console.log(`🆕 New session request: title="${args.title}", project="${args.projectName}"`);

      const result = await SessionManagementHandler.createNewSession(
        args.title,
        args.projectName,
        args.description,
        args.sessionGoal,
        args.tags,
        args.aiModel
      );

      return {
        content: [{
          type: 'text',
          text: result.message + (result.success ? `\n\n📝 Session ID: ${result.sessionId?.substring(0, 8)}...\n🏷️  Project: ${result.projectName}` : '')
        }]
      };
    } catch (error) {
      return formatMcpError(error as Error, 'session_new');
    }
  }

  /**
   * Handle session update (title, description, goal, and tags - Phase 2 enhanced)
   */
  async handleUpdate(args: any): Promise<McpResponse> {
    try {
      console.log(`✏️  Session update request: session="${args.sessionId?.substring(0, 8)}...", title="${args.title || 'unchanged'}", description="${args.description ? args.description.substring(0, 50) + '...' : 'unchanged'}"`);

      if (!args.sessionId) {
        return {
          content: [{
            type: 'text',
            text: '❌ Session ID is required for updates'
          }]
        };
      }

      if (!args.title && !args.description && !args.sessionGoal && !args.tags) {
        return {
          content: [{
            type: 'text',
            text: '❌ At least one field (title, description, sessionGoal, or tags) must be provided for update'
          }]
        };
      }

      const result = await SessionManagementHandler.updateSessionDetails(
        args.sessionId,
        args.title,
        args.description,
        args.sessionGoal,
        args.tags
      );

      if (!result.success) {
        return {
          content: [{
            type: 'text',
            text: `❌ ${result.message}`
          }]
        };
      }

      const session = result.session!;
      let updateText = `✅ Session Updated Successfully\n\n`;
      updateText += `🆔 Session ID: ${session.id.substring(0, 8)}...\n`;

      if (session.title) {
        updateText += `📌 Title: "${session.title}"\n`;
      }

      if (session.description) {
        updateText += `📝 Description: ${session.description.length > 100 ? session.description.substring(0, 100) + '...' : session.description}\n`;
      }

      if (session.session_goal) {
        updateText += `📋 Goal: ${session.session_goal}\n`;
      }

      if (session.tags && session.tags.length > 0) {
        updateText += `🏷️  Tags: ${session.tags.join(', ')}\n`;
      }

      updateText += `🏢 Project: ${session.project_name || 'No project assigned'}\n`;
      updateText += `⏰ Updated: ${new Date(session.updated_at).toLocaleString()}`;

      return {
        content: [{
          type: 'text',
          text: updateText
        }]
      };
    } catch (error) {
      return formatMcpError(error as Error, 'session_update');
    }
  }

  /**
   * Handle session details request
   */
  async handleDetails(args: any): Promise<McpResponse> {
    try {
      console.log(`🔍 Session details request: session="${args.sessionId?.substring(0, 8)}..."`);

      if (!args.sessionId) {
        return {
          content: [{
            type: 'text',
            text: '❌ Session ID is required'
          }]
        };
      }

      const result = await SessionManagementHandler.getSessionDetailsWithMeta(args.sessionId);

      if (!result.success) {
        return {
          content: [{
            type: 'text',
            text: `❌ ${result.message}`
          }]
        };
      }

      const session = result.session!;
      const details: string[] = [];
      details.push('📋 Session Details\n');
      details.push(`🆔 Session ID: ${session.id.substring(0, 8)}...`);

      if (session.title) {
        details.push(`📌 Title: "${session.title}"`);
      } else {
        details.push(`📌 Title: (not set)`);
      }

      if (session.description) {
        details.push(`📝 Description: ${session.description}`);
      } else {
        details.push(`📝 Description: (not set)`);
      }

      details.push(`🏷️  Type: ${session.type}`);
      details.push(`🏢 Project: ${session.project_name}`);
      details.push(`⏰ Started: ${new Date(session.started_at).toLocaleString()}`);

      if (session.ended_at) {
        details.push(`🏁 Ended: ${new Date(session.ended_at).toLocaleString()}`);
      }

      details.push(`📝 Contexts: ${session.contexts_created}`);
      details.push(`📋 Tasks: ${session.tasks_created || 0} created`);
      details.push(`🎯 Decisions: ${session.decisions_created}`);

      if (session.session_goal) {
        details.push(`📋 Goal: ${session.session_goal}`);
      }

      if (session.tags && session.tags.length > 0) {
        details.push(`🏷️  Tags: ${session.tags.join(', ')}`);
      }

      return {
        content: [{
          type: 'text',
          text: details.join('\n')
        }]
      };
    } catch (error) {
      return formatMcpError(error as Error, 'session_details');
    }
  }
}

export const sessionsRoutes = new SessionsRoutes();
