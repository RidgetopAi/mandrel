import { contextHandler, buildHonestyHeader } from '../handlers/context.js';
import { projectHandler } from '../handlers/project.js';
import { SessionTrackingMiddleware } from '../api/middleware/sessionTracking.js';
import { formatMcpError } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';
import type { RouteContext } from './index.js';
import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';

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
      logger.info(`📝 Context store request received (session: ${sessionId}, project: ${projectId?.substring(0, 8)}...)`);

      const result = await contextHandler.storeContext({
        content: args.content,
        type: args.type,
        tags: args.tags,
        relevanceScore: args.relevanceScore,
        metadata: args.metadata,
        projectId: projectId,
        sessionId: args.sessionId,
        connectionId: context?.connectionId
      });

      // Auto-track context_stored activity in session (connection-scoped)
      await SessionTrackingMiddleware.trackContextStored(
        result.id,
        result.contextType,
        result.tags,
        context?.connectionId
      );

      // LINKING-GRAMMAR warnings (tool-native linking): if a `ref:<slug>` OR a
      // threading tag (`task:`/`decision:`/`context:`/`scope:`/`owner:`/`tranche:`)
      // was malformed it was normalized (or flagged) at the write boundary — surface
      // that to the caller so a typo'd link is visible, not silent. Stored tags already
      // reflect the normalized form.
      const refWarnings = result.warnings && result.warnings.length > 0
        ? `\n⚠️  Tag notes:\n` + result.warnings.map(w => `   • ${w}`).join('\n') + '\n'
        : '';

      return {
        content: [{
          type: 'text',
          text: `✅ Context stored successfully!\n\n` +
                `📝 ID: ${result.id}\n` +
                `🏷️  Type: ${result.contextType}\n` +
                `📊 Relevance: ${result.relevanceScore}/10\n` +
                `🏷️  Tags: [${result.tags.join(', ')}]\n` +
                refWarnings +
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
        logger.info(`🔍 Context direct lookup by ID: ${args.id}`);

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
        // METADATA ROUND-TRIP (tool-native linking): surface the structured back-links
        // a context carries (stored via context_store's metadata param) so the thread
        // resolves end-to-end through the tools alone — no SQL needed to read a link.
        const meta = typeof ctx.metadata === 'string' ? JSON.parse(ctx.metadata) : (ctx.metadata ?? {});
        const metadataText = meta && Object.keys(meta).length > 0
          ? `\n📊 Metadata: ${JSON.stringify(meta)}`
          : '';

        return {
          content: [{
            type: 'text',
            text: `📄 Context Details\n\n` +
                  `🆔 ID: ${ctx.id}\n` +
                  `📝 Type: ${ctx.context_type}\n` +
                  `📅 Created: ${new Date(ctx.created_at).toLocaleString()}${tags}${metadataText}\n` +
                  `⭐ Relevance: ${ctx.relevance_score}/10\n\n` +
                  `---\n\n${ctx.content}`
          }],
        };
      }

      // TAGS-ONLY lookup: no id and no query, but a non-empty tags array. The
      // semantic searchContext() path REQUIRES a query (it embeds request.query),
      // so a tags-only request is answered here by the existing `tags && $1` GIN
      // filter directly — NO dummy query needed. This does NOT touch the semantic
      // ranking/scoring (the out-of-scope MEASURED tranche): it is a straight tag
      // filter ordered newest-first.
      //
      // NAMED-REF RESOLUTION (first-class): this is the canonical way to resolve a
      // `ref:<slug>` — `context_search({ tags: ["ref:<slug>"] })`. The
      // `ORDER BY created_at DESC` below is load-bearing for a MOVING ref: when
      // several contexts share the same slug (e.g. `ref:resume`, re-stamped on each
      // handoff), the NEWEST wins, so "read in on ref:resume" always lands on the
      // latest. A PINNED ref (one context) resolves to that single thread. This
      // ordering is contract-tested (namedRefs.contract.test.ts) — do not change it
      // to a score-ordered sort without updating that fuse.
      if (!args.query && Array.isArray(args.tags) && args.tags.length > 0) {
        const projectId = await this.resolveProjectId(args.projectId, context);
        logger.info(`🔍 Context tags-only search: [${args.tags.join(', ')}]`);

        const params: any[] = [args.tags];
        let sql = `SELECT id, project_id, session_id, context_type, content,
                          created_at, relevance_score, tags, metadata
                   FROM contexts
                   WHERE tags && $1`;
        let pIdx = 2;
        if (projectId) {
          sql += ` AND project_id = $${pIdx}`;
          params.push(projectId);
          pIdx++;
        }
        if (args.type) {
          sql += ` AND context_type = $${pIdx}`;
          params.push(args.type);
          pIdx++;
        }
        sql += ` ORDER BY created_at DESC LIMIT $${pIdx}`;
        params.push(args.limit && Number.isInteger(args.limit) && args.limit > 0 ? args.limit : 10);
        pIdx++;
        if (args.offset && Number.isInteger(args.offset) && args.offset > 0) {
          sql += ` OFFSET $${pIdx}`;
          params.push(args.offset);
          pIdx++;
        }

        const tagResult = await db.query(sql, params);

        if (tagResult.rows.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `🔍 No contexts found with tags: [${args.tags.join(', ')}]`
            }],
          };
        }

        const tagSummary = `🔍 Found ${tagResult.rows.length} contexts with tags [${args.tags.join(', ')}]\n\n`;
        const tagList = tagResult.rows.map((row, index) => {
          const timeAgo = this.getTimeAgo(row.created_at);
          // Surface each thread member's structured back-links (metadata) so a thread
          // fetched by its `task:`/`ref:` tag resolves end-to-end via tools alone.
          const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata ?? {});
          const metaLine = meta && Object.keys(meta).length > 0
            ? `\n   Metadata: ${JSON.stringify(meta)}`
            : '';
          return `${index + 1}. **${row.context_type}** (${timeAgo})\n` +
                 `   Content: ${row.content}\n` +
                 `   Tags: [${(row.tags || []).join(', ')}]${metaLine}\n` +
                 `   ID: ${row.id}`;
        }).join('\n\n');

        return {
          content: [{
            type: 'text',
            text: tagSummary + tagList
          }],
        };
      }

      logger.info(`🔍 Context search request: "${args.query}"`);

      const projectId = await this.resolveProjectId(args.projectId, context);
      const results = await contextHandler.searchContext({
        query: args.query,
        type: args.type,
        tags: args.tags,
        limit: args.limit,
        offset: args.offset,
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

      // DISPLAY CONSISTENCY (task e520d129): show `relevance` — the sort-key score
      // the row actually ranked on — NOT raw vector `similarity`, so the displayed
      // number agrees with the order (#1 is always the highest). `relevance` falls
      // back to `similarity` (baseline mode emits them equal).
      const relevanceOf = (r: typeof results[number]): number =>
        r.relevance !== undefined ? r.relevance
        : r.similarity !== undefined ? r.similarity
        : 0;

      // HONESTY FLOOR (task b02446d7): if the BEST row is below the floor, prepend an
      // honest header instead of presenting low-relevance rows as confident. Uses the
      // SAME relevance number as the sort key, so the header agrees with row #1.
      const honestyHeader = buildHonestyHeader(relevanceOf(results[0]));

      const searchSummary = `🔍 Found ${results.length} matching contexts for: "${args.query}"\n\n`;
      const resultsList = results.map((result, index) => {
        const timeAgo = this.getTimeAgo(result.createdAt);
        const relevance = relevanceOf(result);
        return `${index + 1}. **${result.contextType}** (relevance: ${relevance.toFixed(1)}%, ${timeAgo})\n` +
               `   Content: ${result.content}\n` +
               `   Tags: [${result.tags.join(', ')}]\n` +
               `   ID: ${result.id}`;
      }).join('\n\n');

      return {
        content: [{
          type: 'text',
          text: (honestyHeader ? honestyHeader + '\n\n' : '') + searchSummary + resultsList
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
      logger.info(`📋 Context get recent request (limit: ${args.limit || 5}, project: ${projectId?.substring(0, 8)}...)`);

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
      logger.info(`📊 Context stats request received (project: ${projectId?.substring(0, 8)}...)`);

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
