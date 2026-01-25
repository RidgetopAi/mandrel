/**
 * Context Tool Handlers - context_store, context_search, context_get_recent, context_stats
 */

import { contextHandler } from '../../handlers/context.js';
import { projectHandler } from '../../handlers/project.js';
import { db } from '../../config/database.js';

export const contextHandlers = {
  async handleContextStore(args: any) {
    const result = await contextHandler.storeContext({
      content: args.content,
      type: args.type,
      tags: args.tags,
      relevanceScore: args.relevanceScore,
      metadata: args.metadata,
      projectId: args.projectId,
      sessionId: args.sessionId || 'default-session'
    });

    return {
      content: [
        {
          type: 'text',
          text: `📝 Context stored successfully!\n\n` +
                `🆔 ID: ${result.id}\n` +
                `📝 Type: ${result.contextType}\n` +
                `📏 Content: ${result.content.substring(0, 100)}${result.content.length > 100 ? '...' : ''}\n` +
                `🏷️  Tags: ${result.tags.length > 0 ? result.tags.join(', ') : 'none'}\n` +
                `📊 Relevance: ${result.relevanceScore || 'auto-calculated'}\n` +
                `📅 Created: ${result.createdAt}`
        },
      ],
    };
  },

  async handleContextSearch(args: any) {
    if (args.id) {
      const result = await db.query(
        `SELECT id, project_id, session_id, context_type, content,
                created_at, relevance_score, tags, metadata
         FROM contexts WHERE id = $1`,
        [args.id]
      );

      if (result.rows.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Context not found: ${args.id}\n\n💡 Use context_get_recent to see recent context IDs`
            },
          ],
        };
      }

      const ctx = result.rows[0];
      const tags = ctx.tags?.length > 0 ? `\n🏷️  Tags: [${ctx.tags.join(', ')}]` : '';

      return {
        content: [
          {
            type: 'text',
            text: `📄 Context Details\n\n` +
                  `🆔 ID: ${ctx.id}\n` +
                  `📝 Type: ${ctx.context_type}\n` +
                  `📅 Created: ${new Date(ctx.created_at).toLocaleString()}${tags}\n` +
                  `⭐ Relevance: ${ctx.relevance_score}/10\n\n` +
                  `---\n\n${ctx.content}`
          },
        ],
      };
    }

    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');

    const results = await contextHandler.searchContext({
      query: args.query,
      limit: args.limit,
      type: args.type,
      tags: args.tags,
      minSimilarity: args.minSimilarity,
      offset: args.offset,
      projectId: projectId
    } as any);

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `🔍 No contexts found for query: "${args.query}"\n\n` +
                  `💡 Try broader search terms or check if contexts exist with: context_stats`
          },
        ],
      };
    }

    const contextList = results.map((ctx: any, index: number) => {
      const tags = ctx.tags?.length > 0 ? `\n      🏷️  Tags: [${ctx.tags.join(', ')}]` : '';
      const similarity = ctx.similarity ? ` (${Math.round(ctx.similarity * 100)}% match)` : '';
      
      return `   ${index + 1}. **${ctx.type}** ${similarity}\n` +
             `      💬 ${ctx.content.substring(0, 150)}${ctx.content.length > 150 ? '...' : ''}\n` +
             `      📅 ${new Date(ctx.createdAt).toLocaleDateString()}${tags}\n` +
             `      🆔 ${ctx.id}`;
    }).join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `🔍 Context Search Results (${results.length})\n\n${contextList}\n\n` +
                `💡 Use context_get_recent for chronological listing`
        },
      ],
    };
  },

  async handleContextGetRecent(args: any) {
    return contextHandler.getRecentContext(
      args.sessionId || 'default-session',
      args.limit
    );
  },

  async handleContextStats(args: any) {
    return contextHandler.getContextStats(args.sessionId || 'default-session');
  }
};
