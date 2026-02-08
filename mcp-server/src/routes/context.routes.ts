import { contextHandler } from '../handlers/context.js';
import { projectHandler } from '../handlers/project.js';
import { SessionTrackingMiddleware } from '../api/middleware/sessionTracking.js';
import { formatMcpError } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';
import type { RouteContext } from './index.js';
import { db } from '../config/database.js';

/**
 * Context Management Routes
 * Handles: context_store, context_search, context_get_recent, context_stats
 */
class ContextRoutes {
  /**
   * Get session ID from context for connection-scoped isolation
   * Uses connectionId if available, otherwise falls back to default
   */
  private getSessionId(context?: RouteContext): string {
    return context?.connectionId || 'default-session';
  }

  /**
   * Resolve the project ID using connection-scoped session state
   * If args.projectId is explicit, use that. Otherwise resolve from switched project.
   */
  private async resolveProjectId(argsProjectId: string | undefined, context?: RouteContext): Promise<string | undefined> {
    if (argsProjectId) return argsProjectId;

    const sessionId = this.getSessionId(context);
    await projectHandler.initializeSession(sessionId);
    const projectId = await projectHandler.getCurrentProjectId(sessionId);
    return projectId || undefined;
  }
  /**
   * Helper to format relative time
   */
  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'just now';
  }

  /**
   * Handle context storage requests
   */
  async handleStore(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const sessionId = this.getSessionId(context);
      const projectId = await this.resolveProjectId(args.projectId, context);
      console.log(`📝 Context store request received (session: ${sessionId}, project: ${projectId?.substring(0, 8)}...)`);

      const result = await contextHandler.storeContext({
        content: args.content,
        type: args.type,
        tags: args.tags,
        relevanceScore: args.relevanceScore,
        metadata: args.metadata,
        projectId: projectId,
        sessionId: args.sessionId
      });

      // Auto-track context_stored activity in session
      await SessionTrackingMiddleware.trackContextStored(
        result.id,
        result.contextType,
        result.tags
      );

      return {
        content: [{
          type: 'text',
          text: `✅ Context stored successfully!\n\n` +
                `📝 ID: ${result.id}\n` +
                `🏷️  Type: ${result.contextType}\n` +
                `📊 Relevance: ${result.relevanceScore}/10\n` +
                `🏷️  Tags: [${result.tags.join(', ')}]\n` +
                `⏰ Stored: ${result.createdAt.toISOString()}\n` +
                `🔍 Content: "${result.content.length > 100 ? result.content.substring(0, 100) + '...' : result.content}"\n\n` +
                `🎯 Context is now searchable via semantic similarity!`
        }],
      };
    } catch (error) {
      return formatMcpError(error as Error, 'context_store');
    }
  }

  /**
   * Handle context search requests
   * Supports both semantic search (query) and direct ID lookup (id)
   */
  async handleSearch(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      // Direct lookup by ID - bypasses semantic search entirely
      if (args.id) {
        console.log(`🔍 Context direct lookup by ID: ${args.id}`);

        const result = await db.query(
          `SELECT id, project_id, session_id, context_type, content,
                  created_at, relevance_score, tags, metadata
           FROM contexts WHERE id = $1`,
          [args.id]
        );

        if (result.rows.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `❌ Context not found: ${args.id}\n\n💡 Use context_get_recent to see recent context IDs`
            }],
          };
        }

        const ctx = result.rows[0];
        const tags = ctx.tags?.length > 0 ? `\n🏷️  Tags: [${ctx.tags.join(', ')}]` : '';

        return {
          content: [{
            type: 'text',
            text: `📄 Context Details\n\n` +
                  `🆔 ID: ${ctx.id}\n` +
                  `📝 Type: ${ctx.context_type}\n` +
                  `📅 Created: ${new Date(ctx.created_at).toLocaleString()}${tags}\n` +
                  `⭐ Relevance: ${ctx.relevance_score}/10\n\n` +
                  `---\n\n${ctx.content}`
          }],
        };
      }

      console.log(`🔍 Context search request: "${args.query}"`);

      const projectId = await this.resolveProjectId(args.projectId, context);
      const results = await contextHandler.searchContext({
        query: args.query,
        type: args.type,
        tags: args.tags,
        limit: args.limit,
        minSimilarity: args.minSimilarity,
        projectId: projectId
      });

      if (results.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `🔍 No contexts found matching: "${args.query}"\n\n` +
                  `Try:\n` +
                  `• Broader search terms\n` +
                  `• Different context types\n` +
                  `• Lower similarity threshold\n` +
                  `• Different tags`
          }],
        };
      }

      const searchSummary = `🔍 Found ${results.length} matching contexts for: "${args.query}"\n\n`;
      const resultsList = results.map((result, index) => {
        const timeAgo = this.getTimeAgo(result.createdAt);
        const similarity = result.similarity !== undefined ? result.similarity : 0;
        return `${index + 1}. **${result.contextType}** (similarity: ${similarity.toFixed(1)}%, ${timeAgo})\n` +
               `   Content: ${result.content}\n` +
               `   Tags: [${result.tags.join(', ')}]\n` +
               `   ID: ${result.id}`;
      }).join('\n\n');

      return {
        content: [{
          type: 'text',
          text: searchSummary + resultsList
        }],
      };
    } catch (error) {
      return formatMcpError(error as Error, 'context_search');
    }
  }

  /**
   * Handle context get recent requests
   */
  async handleGetRecent(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.resolveProjectId(args.projectId, context);
      console.log(`📋 Context get recent request (limit: ${args.limit || 5}, project: ${projectId?.substring(0, 8)}...)`);

      const results = await contextHandler.getRecentContext(projectId, args.limit);

      if (results.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `📋 No recent contexts found\n\n` +
                  `This usually means:\n` +
                  `• No contexts have been stored yet\n` +
                  `• Wrong project selected\n` +
                  `• Database connectivity issues`
          }],
        };
      }

      // Format results for display
      const contextList = results.map((ctx, index) => {
        const timeAgo = this.getTimeAgo(ctx.createdAt);

        return `${index + 1}. **${ctx.contextType}** (${timeAgo})\n` +
               `   Content: ${ctx.content}\n` +
               `   Tags: [${ctx.tags.join(', ')}]\n` +
               `   ID: ${ctx.id}`;
      }).join('\n\n');

      return {
        content: [{
          type: 'text',
          text: `📋 Recent Contexts (${results.length} found)\n\n${contextList}`
        }],
      };
    } catch (error) {
      return formatMcpError(error as Error, 'context_get_recent');
    }
  }

  /**
   * Handle context statistics requests
   */
  async handleStats(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.resolveProjectId(args.projectId, context);
      console.log(`📊 Context stats request received (project: ${projectId?.substring(0, 8)}...)`);

      const stats = await contextHandler.getContextStats(projectId);

      const typeBreakdown = Object.entries(stats.contextsByType)
        .map(([type, count]) => `   ${type}: ${count}`)
        .join('\n');

      return {
        content: [{
          type: 'text',
          text: `📊 Context Statistics\n\n` +
                `📈 Total Contexts: ${stats.totalContexts}\n` +
                `🔮 With Embeddings: ${stats.embeddedContexts}\n` +
                `🕐 Recent (24h): ${stats.recentContexts}\n\n` +
                `📋 By Type:\n${typeBreakdown || '   (no contexts yet)'}\n\n` +
                `🎯 All contexts are searchable via semantic similarity!`
        }],
      };
    } catch (error) {
      return formatMcpError(error as Error, 'context_stats');
    }
  }
}

export const contextRoutes = new ContextRoutes();
