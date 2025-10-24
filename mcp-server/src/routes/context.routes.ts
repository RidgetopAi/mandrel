import { contextHandler } from '../handlers/context.js';
import { SessionTrackingMiddleware } from '../api/middleware/sessionTracking.js';
import { formatMcpError } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';

/**
 * Context Management Routes
 * Handles: context_store, context_search, context_get_recent, context_stats
 */
export class ContextRoutes {
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
  async handleStore(args: any): Promise<McpResponse> {
    try {
      console.log('📝 Context store request received');

      const result = await contextHandler.storeContext({
        content: args.content,
        type: args.type,
        tags: args.tags,
        relevanceScore: args.relevanceScore,
        metadata: args.metadata,
        projectId: args.projectId,
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
   */
  async handleSearch(args: any): Promise<McpResponse> {
    try {
      console.log(`🔍 Context search request: "${args.query}"`);

      const results = await contextHandler.searchContext({
        query: args.query,
        type: args.type,
        tags: args.tags,
        limit: args.limit,
        minSimilarity: args.minSimilarity,
        projectId: args.projectId
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
        return `${index + 1}. **${result.contextType}** (similarity: ${(similarity * 100).toFixed(1)}%, ${timeAgo})\n` +
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
  async handleGetRecent(args: any): Promise<McpResponse> {
    try {
      console.log(`📋 Context get recent request (limit: ${args.limit || 5})`);

      const results = await contextHandler.getRecentContext(args.projectId, args.limit);

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
  async handleStats(args: any): Promise<McpResponse> {
    try {
      console.log('📊 Context stats request received');

      const stats = await contextHandler.getContextStats(args.projectId);

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
