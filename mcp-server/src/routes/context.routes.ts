import { contextHandler, buildHonestyHeader } from '../handlers/context.js';
import { projectHandler } from '../handlers/project.js';
import { SessionTrackingMiddleware } from '../api/middleware/sessionTracking.js';
import { formatMcpError } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';
import type { RouteContext } from './index.js';
import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { resolveEntityId, idErrorResponse, isFullUuid } from '../utils/idResolver.js';
import {
  applyRecallPayload,
  RECALL_DEFAULT_FORMAT,
  type RecallResponseFormat,
} from '../config/recallConfig.js';
import { autoMintFromTags } from '../services/links.js';

/**
 * Context Management Routes
 * Handles: context_store, context_search, context_get_recent, context_stats,
 *          context_delete, context_restore
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

      // AUTO-MINT TYPED EDGES (T2a Q3 — near-free, at write-time). The threading tags the
      // writer already provided (task:/decision:/context:) ALSO mint typed edges from this
      // context → the referent. Resolves id8→uuid project-scoped; a bad/unresolvable tag
      // is skipped silently (never throws) so a typo can't break the store. Uses the
      // NORMALIZED stored tags (result.tags) so a case-fixed tag still mints its edge.
      await autoMintFromTags({
        fromId: result.id,
        fromType: 'context',
        tags: result.tags,
        projectId,
        createdBy: 'auto:context_store',
      });

      // LINKING-GRAMMAR warnings (tool-native linking): if a `ref:<slug>` OR a
      // threading tag (`task:`/`decision:`/`context:`/`scope:`/`owner:`/`tranche:`)
      // was malformed it was normalized (or flagged) at the write boundary — surface
      // that to the caller so a typo'd link is visible, not silent. Stored tags already
      // reflect the normalized form. (Now carried in both the lean text AND the
      // structuredContent.context.warnings field.)
      return {
        content: [{
          type: 'text',
          // DUAL-CHANNEL: lean human glance; the machine reads structuredContent.
          // Keeps the stable `🆔 ID:` marker so id-parsing consumers/tests still work.
          text: `✅ Context stored successfully! (${result.contextType})\n🆔 ID: ${result.id}` +
                (result.warnings && result.warnings.length > 0
                  ? `\n⚠️  Tag notes:\n` + result.warnings.map(w => `   • ${w}`).join('\n')
                  : ''),
        }],
        structuredContent: {
          action: 'created',
          context: {
            id: result.id,
            contextType: result.contextType,
            content: result.content,
            tags: result.tags,
            relevanceScore: result.relevanceScore,
            createdAt: result.createdAt.toISOString(),
            warnings: result.warnings ?? [],
          },
        },
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
      // RECALL payload control (T1 item 1): default 'concise' (truncate each content +
      // affordance) unless the caller asks for 'detailed' (full body). Resolved once here
      // for the multi-row paths (tags-only + semantic). The by-id path defaults to
      // 'detailed' separately (it's the explicit zoom target).
      const recallFormat: RecallResponseFormat = args.response_format ?? RECALL_DEFAULT_FORMAT;

      // Direct lookup by ID - bypasses semantic search entirely
      if (args.id) {
        logger.info(`🔍 Context direct lookup by ID: ${args.id}`);

        // SHORT-ID SYMMETRY (T1 item 2): accept a full UUID OR an 8+-hex short id. A full
        // UUID looks up directly (back-compat); a short id is resolved project-scoped via
        // the SAME parameterized, wildcard-rejecting resolver every other tool uses, so a
        // tool-only agent can context_search by the id8 it copied from a list. Ambiguous /
        // unknown short ids surface as actionable errors and read nothing.
        let resolvedId: string;
        if (isFullUuid(args.id)) {
          resolvedId = args.id;
        } else {
          const projectIdForResolve = await this.resolveProjectId(args.projectId, context);
          try {
            resolvedId = await resolveEntityId('context', args.id, projectIdForResolve);
          } catch (e) {
            const handled = idErrorResponse(e, 'context_search', 'context', args.id, 'context_get_recent');
            if (handled) return handled;
            throw e;
          }
        }

        const result = await db.query(
          `SELECT id, project_id, session_id, context_type, content,
                  created_at, relevance_score, tags, metadata
           FROM contexts WHERE id = $1`,
          [resolvedId]
        );

        if (result.rows.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `❌ Context not found: ${args.id}\n\n💡 Use context_get_recent to see recent context IDs`
            }],
            structuredContent: { ok: true, results: [], total: 0 },
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

        // RECALL payload control (T1 item 1): a by-id lookup is the explicit "zoom to this
        // one" target, so it DEFAULTS to detailed (full body); it still honors an explicit
        // response_format ('concise' truncates with the affordance) for consistency.
        const byIdFormat: RecallResponseFormat = args.response_format ?? 'detailed';
        const byIdPayload = applyRecallPayload(ctx.content, byIdFormat, ctx.id);

        return {
          content: [{
            type: 'text',
            text: `📄 Context Details\n\n` +
                  `🆔 ID: ${ctx.id}\n` +
                  `📝 Type: ${ctx.context_type}\n` +
                  `📅 Created: ${new Date(ctx.created_at).toLocaleString()}${tags}${metadataText}\n` +
                  `⭐ Relevance: ${ctx.relevance_score}/10\n\n` +
                  `---\n\n${byIdPayload.content}`
          }],
          // SEARCH shape (a by-id lookup is a 1-result search) — RAW values. The machine
          // channel carries the SAME (truncated-or-full) value the text shows + a truncated flag.
          structuredContent: {
            results: [{
              id: ctx.id,
              contextType: ctx.context_type,
              content: byIdPayload.content,
              truncated: byIdPayload.truncated,
              tags: ctx.tags ?? [],
              relevanceScore: ctx.relevance_score,
              projectId: ctx.project_id,
              sessionId: ctx.session_id,
              metadata: meta,
              createdAt: new Date(ctx.created_at).toISOString(),
            }],
            total: 1,
          },
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
        // SOFT-DELETE (task 7b28bed4): exclude archived by default on the tags-only path too.
        if (!args.includeArchived) {
          sql += ` AND archived_at IS NULL`;
        }
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
            structuredContent: { ok: true, results: [], total: 0 },
          };
        }

        const tagSummary = `🔍 Found ${tagResult.rows.length} contexts with tags [${args.tags.join(', ')}]\n\n`;
        // RAW structured rows for the machine channel (parsed metadata, no markup). RECALL
        // payload control (T1 item 1): carry the (truncated-or-full) content consistently
        // + a `truncated` flag, matching the text channel.
        const tagStructured = tagResult.rows.map((row) => {
          const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata ?? {});
          const payload = applyRecallPayload(row.content, recallFormat, row.id);
          return {
            id: row.id,
            contextType: row.context_type,
            content: payload.content,
            truncated: payload.truncated,
            tags: row.tags ?? [],
            relevanceScore: row.relevance_score,
            projectId: row.project_id,
            sessionId: row.session_id,
            metadata: meta,
            createdAt: new Date(row.created_at).toISOString(),
          };
        });
        const tagList = tagResult.rows.map((row, index) => {
          const timeAgo = this.getTimeAgo(row.created_at);
          // Surface each thread member's structured back-links (metadata) so a thread
          // fetched by its `task:`/`ref:` tag resolves end-to-end via tools alone.
          const meta = tagStructured[index].metadata;
          const metaLine = meta && Object.keys(meta).length > 0
            ? `\n   Metadata: ${JSON.stringify(meta)}`
            : '';
          // Same (truncated-or-full) content as the machine channel.
          return `${index + 1}. **${row.context_type}** (${timeAgo})\n` +
                 `   Content: ${tagStructured[index].content}\n` +
                 `   Tags: [${(row.tags || []).join(', ')}]${metaLine}\n` +
                 `   ID: ${row.id}`;
        }).join('\n\n');

        return {
          content: [{
            type: 'text',
            text: tagSummary + tagList
          }],
          structuredContent: { results: tagStructured, total: tagStructured.length },
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
        projectId: projectId,
        includeArchived: args.includeArchived // task 7b28bed4: default exclude archived
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
          structuredContent: { ok: true, results: [], total: 0 },
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
      // RECALL payload control (T1 item 1): truncate each content per the resolved format,
      // computed ONCE so the text + machine channels carry the SAME value + truncated flag.
      const payloads = results.map((result) => applyRecallPayload(result.content, recallFormat, result.id));
      const resultsList = results.map((result, index) => {
        const timeAgo = this.getTimeAgo(result.createdAt);
        const relevance = relevanceOf(result);
        return `${index + 1}. **${result.contextType}** (relevance: ${relevance.toFixed(1)}%, ${timeAgo})\n` +
               `   Content: ${payloads[index].content}\n` +
               `   Tags: [${result.tags.join(', ')}]\n` +
               `   ID: ${result.id}`;
      }).join('\n\n');

      return {
        content: [{
          type: 'text',
          text: (honestyHeader ? honestyHeader + '\n\n' : '') + searchSummary + resultsList
        }],
        // RAW structured rows (no markup, no honesty-header prose) — the machine channel.
        // METADATA SURFACE (T1 item 3): include `metadata` so written back-links are
        // readable from a semantic search (it was indexed + stored but never returned here).
        structuredContent: {
          results: results.map((result, index) => ({
            id: result.id,
            contextType: result.contextType,
            content: payloads[index].content,
            truncated: payloads[index].truncated,
            tags: result.tags,
            metadata: result.metadata ?? {},
            relevance: relevanceOf(result),
            similarity: result.similarity,
            createdAt: result.createdAt.toISOString(),
          })),
          total: results.length,
        },
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

      // RECALL payload control (T1 item 1): the boot path. Default 'concise' (truncate) so
      // a fresh-session recall doesn't dump full bodies ×N into the model window.
      const recallFormat: RecallResponseFormat = args.response_format ?? RECALL_DEFAULT_FORMAT;

      const results = await contextHandler.getRecentContext(projectId, args.limit, args.includeArchived);

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
          structuredContent: { ok: true, results: [], total: 0 },
        };
      }

      // RECALL payload control (T1 item 1): compute payloads ONCE so text + machine
      // channels agree (truncated value + flag).
      const payloads = results.map((ctx) => applyRecallPayload(ctx.content, recallFormat, ctx.id));

      // Format results for display
      const contextList = results.map((ctx, index) => {
        const timeAgo = this.getTimeAgo(ctx.createdAt);

        return `${index + 1}. **${ctx.contextType}** (${timeAgo})\n` +
               `   Content: ${payloads[index].content}\n` +
               `   Tags: [${ctx.tags.join(', ')}]\n` +
               `   ID: ${ctx.id}`;
      }).join('\n\n');

      return {
        content: [{
          type: 'text',
          text: `📋 Recent Contexts (${results.length} found)\n\n${contextList}`
        }],
        structuredContent: {
          results: results.map((ctx, index) => ({
            id: ctx.id,
            contextType: ctx.contextType,
            content: payloads[index].content,
            truncated: payloads[index].truncated,
            tags: ctx.tags,
            metadata: ctx.metadata ?? {},
            createdAt: ctx.createdAt.toISOString(),
          })),
          total: results.length,
        },
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
        structuredContent: {
          totalContexts: stats.totalContexts,
          embeddedContexts: stats.embeddedContexts,
          recentContexts: stats.recentContexts,
          contextsByType: stats.contextsByType,
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'context_stats');
    }
  }

  /**
   * Resolve the project id, REQUIRING one (delete/restore are project-scoped — we must
   * never archive across projects). Throws an actionable error if no project is active.
   */
  private async requireProjectId(argsProjectId: string | undefined, context?: RouteContext): Promise<string> {
    const projectId = await this.resolveProjectId(argsProjectId, context);
    if (!projectId) {
      throw new Error('No current project set. Use project_switch to set an active project (or pass projectId).');
    }
    return projectId;
  }

  /**
   * Handle context SOFT-DELETE (archive) requests — context_delete (task 7b28bed4).
   *
   * Sets archived_at so the context disappears from default context_search /
   * context_get_recent while STILL EXISTING in the DB (reversible via context_restore).
   * Accepts a full UUID or 8+-hex short id, resolved project-scoped BEFORE the mutation;
   * ambiguous / unknown ids surface as actionable errors and mutate nothing. Idempotent.
   */
  async handleDelete(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.requireProjectId(args.projectId, context);
      let resolvedId: string;
      try {
        resolvedId = await resolveEntityId('context', args.contextId, projectId);
      } catch (e) {
        const handled = idErrorResponse(e, 'context_delete', 'context', args.contextId, 'context_get_recent');
        if (handled) return handled;
        throw e;
      }

      const result = await contextHandler.archiveContext(resolvedId, projectId);
      if (!result.found) {
        return {
          content: [{ type: 'text',
            text: `❌ Context not found: ${args.contextId}\n\n` +
                  `💡 Use context_get_recent to see this project's contexts and copy an 🆔 ID.` }],
          isError: true,
          structuredContent: { ok: false, found: false },
        };
      }
      const verb = result.alreadyArchived ? 'was already archived' : 'archived';
      return {
        content: [{ type: 'text',
          text: `🗑️  Context ${verb} (soft-delete) — ${result.id}\n` +
                `💡 Hidden from search/recent but NOT deleted. Restore with: context_restore(contextId="${result.id}")` }],
        structuredContent: {
          action: 'archived',
          context: { id: result.id, archivedAt: result.archivedAt },
          alreadyArchived: result.alreadyArchived === true,
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'context_delete');
    }
  }

  /**
   * Handle context RESTORE (un-archive) requests — context_restore (task 7b28bed4).
   * Clears archived_at so the context returns to default search/recent. Mirror of delete.
   */
  async handleRestore(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.requireProjectId(args.projectId, context);
      let resolvedId: string;
      try {
        resolvedId = await resolveEntityId('context', args.contextId, projectId);
      } catch (e) {
        const handled = idErrorResponse(e, 'context_restore', 'context', args.contextId, 'context_get_recent');
        if (handled) return handled;
        throw e;
      }

      const result = await contextHandler.restoreContext(resolvedId, projectId);
      if (!result.found) {
        return {
          content: [{ type: 'text',
            text: `❌ Context not found: ${args.contextId}\n\n` +
                  `💡 Use context_search(includeArchived:true) to see archived contexts and copy an 🆔 ID.` }],
          isError: true,
          structuredContent: { ok: false, found: false },
        };
      }
      const verb = result.alreadyArchived ? 'was already live (not archived)' : 'restored';
      return {
        content: [{ type: 'text',
          text: `♻️  Context ${verb} — ${result.id}` }],
        structuredContent: {
          action: 'restored',
          context: { id: result.id },
          alreadyArchived: result.alreadyArchived === true,
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'context_restore');
    }
  }

  /**
   * Handle context UPDATE (edit) requests — context_update (CURATE, T1 item 4).
   *
   * Edits a stored context: content, tags (re-tag/re-thread), metadata (MERGE — null
   * deletes a key, T1 item 6), relevanceScore. Accepts a full UUID or 8+-hex short id,
   * resolved project-scoped BEFORE the mutation; ambiguous / unknown ids surface as
   * actionable errors and mutate nothing. The whole edit is project-scoped (never edits
   * another project's context). Tag-normalization warnings are surfaced (warn-only).
   */
  async handleUpdate(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.requireProjectId(args.projectId, context);
      let resolvedId: string;
      try {
        resolvedId = await resolveEntityId('context', args.contextId, projectId);
      } catch (e) {
        const handled = idErrorResponse(e, 'context_update', 'context', args.contextId, 'context_get_recent');
        if (handled) return handled;
        throw e;
      }

      const result = await contextHandler.updateContext({
        contextId: resolvedId,
        projectId,
        content: args.content,
        tags: args.tags,
        metadata: args.metadata,
        relevanceScore: args.relevanceScore,
      });

      if (!result.found || !result.context) {
        return {
          content: [{ type: 'text',
            text: `❌ Context not found: ${args.contextId}\n\n` +
                  `💡 Use context_get_recent to see this project's contexts and copy an 🆔 ID.` }],
          isError: true,
          structuredContent: { ok: false, found: false },
        };
      }

      const ctx = result.context;
      // Report exactly which fields were edited (RAW). metadata shows the MERGED result.
      const applied: string[] = [];
      if (args.content !== undefined) applied.push('content');
      if (args.tags !== undefined) applied.push('tags');
      if (args.metadata !== undefined) applied.push('metadata');
      if (args.relevanceScore !== undefined) applied.push('relevanceScore');
      const warnText = result.warnings && result.warnings.length > 0
        ? `\n⚠️  Tag notes:\n` + result.warnings.map(w => `   • ${w}`).join('\n')
        : '';

      return {
        content: [{
          type: 'text',
          text: `✅ Context updated — ${ctx.id}\n` +
                `✏️  Edited: ${applied.join(', ')}\n` +
                `🏷️  Tags: [${ctx.tags.join(', ')}]` +
                (ctx.metadata && Object.keys(ctx.metadata).length > 0
                  ? `\n📊 Metadata: ${JSON.stringify(ctx.metadata)}` : '') +
                warnText,
        }],
        structuredContent: {
          action: 'updated',
          context: {
            id: ctx.id,
            contextType: ctx.contextType,
            content: ctx.content,
            tags: ctx.tags,
            relevanceScore: ctx.relevanceScore,
            metadata: ctx.metadata,
            createdAt: ctx.createdAt.toISOString(),
            warnings: result.warnings ?? [],
          },
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'context_update');
    }
  }
}

export const contextRoutes = new ContextRoutes();
