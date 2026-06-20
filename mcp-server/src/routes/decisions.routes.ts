import { decisionsHandler } from '../handlers/decisions.js';
import { projectHandler } from '../handlers/project.js';
import { SessionTrackingMiddleware } from '../api/middleware/sessionTracking.js';
import { formatMcpError } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';
import type { RouteContext } from './index.js';
import { logger } from '../utils/logger.js';
import {
  resolveEntityId,
  isFullUuid,
  AmbiguousIdError,
  IdNotFoundError,
  ambiguousIdMessage,
  idErrorResponse,
} from '../utils/idResolver.js';

/**
 * Technical Decisions Routes
 * Handles: decision_record, decision_search, decision_update, decision_stats
 */
class DecisionsRoutes {
  /**
   * Resolve project ID using connection-scoped session state
   */
  private async resolveProjectId(argsProjectId: string | undefined, context?: RouteContext): Promise<string | undefined> {
    if (argsProjectId) return argsProjectId;
    const sessionId = context?.connectionId || 'default-session';
    await projectHandler.initializeSession(sessionId);
    const projectId = await projectHandler.getCurrentProjectId(sessionId);
    return projectId || undefined;
  }
  /**
   * Handle decision record requests
   */
  async handleRecord(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.resolveProjectId(args.projectId, context);
      logger.info(`📝 Decision record request: ${args.decisionType} (project: ${projectId?.substring(0, 8)}...)`);

      const decision = await decisionsHandler.recordDecision({
        decisionType: args.decisionType,
        title: args.title,
        description: args.description,
        rationale: args.rationale,
        impactLevel: args.impactLevel,
        alternativesConsidered: args.alternativesConsidered,
        problemStatement: args.problemStatement,
        successCriteria: args.successCriteria,
        implementationStatus: args.implementationStatus,
        // A1: forward the outcome fields so a decision recorded WITH a known outcome
        // (or lessons) keeps them instead of having them silently dropped at the route.
        outcomeStatus: args.outcomeStatus,
        outcomeNotes: args.outcomeNotes,
        lessonsLearned: args.lessonsLearned,
        affectedComponents: args.affectedComponents,
        tags: args.tags,
        projectId: projectId,
        connectionId: context?.connectionId
      });

      // Auto-track decision_recorded activity in session (connection-scoped)
      await SessionTrackingMiddleware.trackDecisionRecorded(
        decision.id,
        decision.decisionType,
        decision.impactLevel,
        context?.connectionId
      );

      return {
        content: [{
          type: 'text',
          text: `✅ Technical decision recorded! "${decision.title}"\n` +
                `🎯 Type: ${decision.decisionType} | Impact: ${decision.impactLevel}\n` +
                `🆔 ID: ${decision.id}`,
        }],
        structuredContent: {
          action: 'created',
          decision: {
            id: decision.id,
            title: decision.title,
            decisionType: decision.decisionType,
            impactLevel: decision.impactLevel,
            status: decision.status,
            rationale: decision.rationale,
            outcomeStatus: decision.outcomeStatus ?? null,
            lessonsLearned: decision.lessonsLearned ?? null,
            affectedComponents: decision.affectedComponents,
            tags: decision.tags,
            decisionDate: decision.decisionDate.toISOString(),
          },
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'decision_record');
    }
  }

  /**
   * Render the learning-loop OUTCOME fields as human-readable text lines.
   *
   * This is the part-2 fix made reusable: the outcome fields (outcome_status, outcome
   * notes, lessons learned, implementation status) must appear in the PROSE a tool-only
   * agent reads — they previously lived only in the structured `data` sibling, leaving
   * a text-reading agent blind to them (blocking the GAP1 Evaluator). Used by both
   * decision_search results and decision_get.
   *
   * `outcome_status` is ALWAYS shown (it's the moat field; even 'unknown' is signal).
   * Notes / lessons render only when present. `indent` prefixes each line so this can
   * nest inside a numbered search result or sit flush in a single-decision view.
   */
  static renderOutcomeText(
    decision: {
      outcomeStatus?: string | null;
      outcomeNotes?: string | null;
      lessonsLearned?: string | null;
      implementationStatus?: string | null;
    },
    indent = ''
  ): string {
    const lines: string[] = [];
    lines.push(`${indent}🎯 Outcome: ${decision.outcomeStatus || 'unknown'}`);
    if (decision.implementationStatus) {
      lines.push(`${indent}🛠️  Implementation: ${decision.implementationStatus}`);
    }
    if (decision.outcomeNotes) {
      lines.push(`${indent}📄 Outcome Notes: ${decision.outcomeNotes}`);
    }
    if (decision.lessonsLearned) {
      lines.push(`${indent}🧠 Lessons Learned: ${decision.lessonsLearned}`);
    }
    return lines.join('\n') + '\n';
  }

  /**
   * Handle decision search requests
   */
  async handleSearch(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.resolveProjectId(args.projectId, context);
      logger.info(`🔍 Decision search request (project: ${projectId?.substring(0, 8)}...)`);

      const decisions = await decisionsHandler.searchDecisions({
        query: args.query,
        decisionType: args.decisionType,
        // A6: forward `status` (the handler filters on it — decisions.ts) and
        // `includeOutcome` (advertised in the zod schema); both were previously
        // dropped at the route, so a status-filtered search silently ignored the filter.
        status: args.status,
        // outcomeStatus filters the learning-loop RESULT column (outcome_status) — a
        // SEPARATE column from `status`. Forwarding it here closes the route-drop class
        // (declared in zod, accepted, AND forwarded to the handler that filters on it).
        outcomeStatus: args.outcomeStatus,
        impactLevel: args.impactLevel,
        component: args.component,
        tags: args.tags,
        limit: args.limit,
        includeOutcome: args.includeOutcome,
        // SOFT-DELETE (task 7b28bed4): forward includeArchived (default exclude archived).
        includeArchived: args.includeArchived,
        projectId: projectId
      });

      if (decisions.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `🔍 No decisions found matching your criteria\n\n` +
                  `Try:\n` +
                  `• Broader search terms\n` +
                  `• Different decision types or impact levels\n` +
                  `• Removing some filters`
          }],
          data: {
            results: [],
            total: 0,
            page: 1,
            limit: args.limit || 20
          }
        };
      }

      const searchSummary = `🔍 Found ${decisions.length} technical decisions:\n\n`;

      const resultDetails = decisions.map((decision, index) => {
        const alternatives = decision.alternativesConsidered.length > 0
          ? ` (${decision.alternativesConsidered.length} alternatives considered)`
          : '';

        return `${index + 1}. **${decision.decisionType.toUpperCase()}** - ${decision.impactLevel} impact\n` +
               `   📝 ${decision.title}\n` +
               `   💡 ${decision.rationale.substring(0, 100)}${decision.rationale.length > 100 ? '...' : ''}\n` +
               `   📅 ${decision.decisionDate.toISOString().split('T')[0]} | Status: ${decision.status}${alternatives}\n` +
               // LEARNING-LOOP READ (part 2): render the outcome fields INTO the human-
               // readable text, not just the structured `data` sibling. A tool-only agent
               // reads the prose, so without this it is blind to outcome_status / lessons —
               // exactly what blocks the GAP1 Evaluator. Indented so it reads as a sub-block.
               DecisionsRoutes.renderOutcomeText(decision, '   ') +
               `   🏷️  [${decision.tags.join(', ')}]`;
      }).join('\n\n');

      // Map decisions to structured format with proper field names for frontend
      const structuredDecisions = decisions.map(decision => ({
        id: decision.id,
        project_id: decision.projectId,
        session_id: decision.sessionId,
        title: decision.title,
        problem: decision.problemStatement || decision.description,
        decision: decision.description,
        rationale: decision.rationale,
        decision_type: decision.decisionType,
        impact_level: decision.impactLevel,
        status: decision.status,
        implementationStatus: decision.implementationStatus,
        successCriteria: decision.successCriteria,
        outcomeStatus: decision.outcomeStatus,
        outcomeNotes: decision.outcomeNotes,
        lessonsLearned: decision.lessonsLearned,
        supersededBy: decision.supersededBy,
        supersededReason: decision.supersededReason,
        // Convert Alternative objects to strings for frontend compatibility
        alternatives: decision.alternativesConsidered.map(alt =>
          typeof alt === 'string' ? alt : alt.name
        ),
        affected_components: decision.affectedComponents,
        tags: decision.tags,
        // Semantic relevance (0–100) the row ranked on, when a free-text query was
        // supplied — consistent with context_search's `similarity`. Absent for
        // filter-only searches.
        similarity: decision.similarity,
        created_at: decision.decisionDate.toISOString(),
        updated_at: decision.decisionDate.toISOString()
      }));

      return {
        content: [{
          type: 'text',
          text: searchSummary + resultDetails
        }],
        data: {
          results: structuredDecisions,
          total: decisions.length,
          page: 1,
          limit: args.limit || 20
        }
      };
    } catch (error) {
      return formatMcpError(error as Error, 'decision_search');
    }
  }

  /**
   * Handle decision GET (single-decision direct lookup by id).
   *
   * The moat-critical READ path: fetch ONE decision with FULL detail — every field,
   * including the learning-loop outcome fields — by its id, bypassing semantic search.
   * Mirrors context_search's `id` direct-lookup idiom. Full UUID is the floor (the zod
   * schema enforces .uuid()). Returns an ACTIONABLE not-found error (what went wrong +
   * that the id may be wrong or a short id) when no row matches, so a tool-only caller
   * isn't left guessing.
   */
  async handleGet(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      // Resolve the connection's project for context (informational + reference for the
      // route-drift guard: args.projectId is forwarded, not silently dropped).
      const projectId = await this.resolveProjectId(args.projectId, context);
      logger.info(
        `🔎 Decision get request: ${String(args.decisionId).substring(0, 8)}... ` +
        `(project ctx: ${projectId?.substring(0, 8) ?? 'none'})`
      );

      // SHORT-ID RESOLUTION (task 131ef054): accept a full UUID or an 8+-hex short id.
      // A full UUID resolves cross-project (back-compat: a valid id always resolves
      // regardless of the caller's current project). A SHORT id is resolved with a
      // parameterized prefix match SCOPED to the current project (when one is set) so a
      // prefix can't collide across projects; ambiguous / unknown short ids surface as
      // actionable errors below.
      let resolvedId: string;
      try {
        resolvedId = isFullUuid(args.decisionId)
          ? args.decisionId
          : await resolveEntityId('decision', args.decisionId, projectId);
      } catch (e) {
        if (e instanceof AmbiguousIdError) {
          return {
            content: [{ type: 'text', text: ambiguousIdMessage(e, 'decision_get') }],
            data: { found: false, ambiguous: true,
              candidates: e.candidates.map(c => c.id), decisionId: args.decisionId }
          };
        }
        if (e instanceof IdNotFoundError) {
          return {
            content: [{
              type: 'text',
              text: `❌ Decision not found: ${args.decisionId}\n\n` +
                    `💡 The id may be wrong (a mistyped short id, or a stale full UUID).\n` +
                    `   Use decision_search to find the decision and copy its 🆔 ID.`
            }],
            data: { found: false, decisionId: args.decisionId }
          };
        }
        throw e;
      }

      // Look up by id alone (no project scope) so a valid id always resolves regardless
      // of the caller's current project — keeps the tool usable cross-project.
      const decision = await decisionsHandler.getDecisionById(resolvedId);

      if (!decision) {
        return {
          content: [{
            type: 'text',
            text: `❌ Decision not found: ${args.decisionId}\n\n` +
                  `💡 The id may be wrong (a mistyped short id, or a stale full UUID).\n` +
                  `   Use decision_search to find the decision and copy its 🆔 ID.`
          }],
          data: { found: false, decisionId: args.decisionId }
        };
      }

      const alternativesText = decision.alternativesConsidered.length > 0
        ? `\n📋 Alternatives Considered:\n` +
          decision.alternativesConsidered.map(alt =>
            `   • ${alt.name}: ${alt.reasonRejected}`
          ).join('\n')
        : '';

      const text =
        `📄 Decision Details\n\n` +
        `🆔 ID: ${decision.id}\n` +
        `🎯 Type: ${decision.decisionType}\n` +
        `📝 Title: ${decision.title}\n` +
        `⚡ Impact: ${decision.impactLevel}\n` +
        `📅 Date: ${decision.decisionDate.toISOString().split('T')[0]} | Status: ${decision.status}\n` +
        `📖 Description: ${decision.description}\n` +
        `💡 Rationale: ${decision.rationale}\n` +
        (decision.problemStatement ? `❓ Problem: ${decision.problemStatement}\n` : '') +
        (decision.successCriteria ? `✅ Success Criteria: ${decision.successCriteria}\n` : '') +
        // Learning-loop outcome block (part 2) — rendered in the prose, not data-only.
        DecisionsRoutes.renderOutcomeText(decision) +
        `🏷️  Components: [${decision.affectedComponents.join(', ')}]\n` +
        `🏷️  Tags: [${decision.tags.join(', ')}]` +
        alternativesText;

      return {
        content: [{ type: 'text', text }],
        data: {
          found: true,
          decision: {
            id: decision.id,
            project_id: decision.projectId,
            session_id: decision.sessionId,
            title: decision.title,
            description: decision.description,
            rationale: decision.rationale,
            decision_type: decision.decisionType,
            impact_level: decision.impactLevel,
            status: decision.status,
            problemStatement: decision.problemStatement,
            successCriteria: decision.successCriteria,
            implementationStatus: decision.implementationStatus,
            outcomeStatus: decision.outcomeStatus,
            outcomeNotes: decision.outcomeNotes,
            lessonsLearned: decision.lessonsLearned,
            supersededBy: decision.supersededBy,
            supersededReason: decision.supersededReason,
            alternatives: decision.alternativesConsidered,
            affected_components: decision.affectedComponents,
            tags: decision.tags,
            created_at: decision.decisionDate.toISOString()
          }
        }
      };
    } catch (error) {
      return formatMcpError(error as Error, 'decision_get');
    }
  }

  /**
   * Handle decision update requests
   */
  async handleUpdate(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      logger.info(`📝 Decision update request: ${args.decisionId.substring(0, 8)}...`);

      // SHORT-ID RESOLUTION (task 131ef054): resolve a full UUID or 8+-hex short id →
      // full UUID BEFORE we mutate. A short id is resolved with a parameterized prefix
      // match scoped to the current project (when set). Ambiguous / unknown ids surface
      // as actionable errors and DO NOT mutate (resolution throws before the UPDATE).
      const projectId = await this.resolveProjectId(args.projectId, context);
      let resolvedId: string;
      try {
        resolvedId = isFullUuid(args.decisionId)
          ? args.decisionId
          : await resolveEntityId('decision', args.decisionId, projectId);
      } catch (e) {
        if (e instanceof AmbiguousIdError) {
          return {
            content: [{ type: 'text', text: ambiguousIdMessage(e, 'decision_update') }],
            isError: true,
            structuredContent: { ok: false, ambiguous: true,
              candidates: e.candidates.map(c => c.id) },
          };
        }
        if (e instanceof IdNotFoundError) {
          return {
            content: [{
              type: 'text',
              text: `❌ Decision not found: ${args.decisionId}\n\n` +
                    `💡 The id may be wrong. Use decision_search to find the decision and copy its 🆔 ID.`
            }],
            isError: true,
            structuredContent: { ok: false, found: false },
          };
        }
        throw e;
      }

      const decision = await decisionsHandler.updateDecision({
        decisionId: resolvedId,
        status: args.status,
        outcomeStatus: args.outcomeStatus,
        outcomeNotes: args.outcomeNotes,
        lessonsLearned: args.lessonsLearned,
        implementationStatus: args.implementationStatus,
        successCriteria: args.successCriteria,
        problemStatement: args.problemStatement,
        supersededBy: args.supersededBy,
        supersededReason: args.supersededReason
      });

      return {
        content: [{
          type: 'text',
          text: `✅ Decision updated successfully! "${decision.title}"\n` +
                `📊 Status: ${decision.status} | 🛠️  Implementation: ${decision.implementationStatus}\n` +
                `🎯 Outcome: ${decision.outcomeStatus}`,
        }],
        structuredContent: {
          action: 'updated',
          decision: {
            id: decision.id,
            title: decision.title,
            status: decision.status,
            implementationStatus: decision.implementationStatus,
            outcomeStatus: decision.outcomeStatus ?? null,
            outcomeNotes: decision.outcomeNotes ?? null,
            lessonsLearned: decision.lessonsLearned ?? null,
          },
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'decision_update');
    }
  }

  /**
   * Handle decision stats requests
   */
  async handleStats(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.resolveProjectId(args.projectId, context);
      logger.info(`📊 Decision stats request received (project: ${projectId?.substring(0, 8)}...)`);

      const stats = await decisionsHandler.getDecisionStats(projectId);

      const typeBreakdown = Object.entries(stats.decisionsByType)
        .map(([type, count]) => `   ${type}: ${count}`)
        .join('\n');

      const statusBreakdown = Object.entries(stats.decisionsByStatus)
        .map(([status, count]) => `   ${status}: ${count}`)
        .join('\n');

      const impactBreakdown = Object.entries(stats.decisionsByImpact)
        .map(([impact, count]) => `   ${impact}: ${count}`)
        .join('\n');

      return {
        content: [{
          type: 'text',
          text: `📊 Technical Decision Statistics\n\n` +
                `📈 Total Decisions: ${stats.totalDecisions}\n` +
                `✅ Success Rate: ${stats.outcomeSuccess}%\n` +
                `🕐 Recent Activity: ${stats.recentActivity}\n` +
                `📁 Projects with Decisions: ${stats.totalProjects}\n\n` +
                `📋 By Type:\n${typeBreakdown || '   (no decisions yet)'}\n\n` +
                `📊 By Status:\n${statusBreakdown || '   (no decisions yet)'}\n\n` +
                `⚡ By Impact:\n${impactBreakdown || '   (no decisions yet)'}\n\n` +
                `🎯 Track decision outcomes to improve future choices!`
        }],
        // Structured data for frontend consumption (snake_case format)
        data: {
          total_decisions: stats.totalDecisions,
          recent_decisions: stats.recentActivity,
          total_projects: stats.totalProjects,
          by_status: stats.decisionsByStatus,
          by_type: stats.decisionsByType,
          by_impact: stats.decisionsByImpact,
          by_project: stats.decisionsByProject,
          outcome_success_rate: stats.outcomeSuccess
        }
      };
    } catch (error) {
      return formatMcpError(error as Error, 'decision_stats');
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
   * Handle decision SOFT-DELETE (archive) requests — decision_delete (task 7b28bed4).
   *
   * Sets archived_at so the decision disappears from the DEFAULT decision_search while
   * STILL EXISTING in the DB (reversible via decision_restore). Accepts a full UUID or
   * 8+-hex short id, resolved project-scoped BEFORE the mutation; ambiguous / unknown
   * ids surface as actionable errors and mutate nothing. Idempotent.
   */
  async handleDelete(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.requireProjectId(args.projectId, context);
      let resolvedId: string;
      try {
        resolvedId = isFullUuid(args.decisionId)
          ? args.decisionId
          : await resolveEntityId('decision', args.decisionId, projectId);
      } catch (e) {
        const handled = idErrorResponse(e, 'decision_delete', 'decision', args.decisionId, 'decision_search');
        if (handled) return handled;
        throw e;
      }

      const result = await decisionsHandler.archiveDecision(resolvedId, projectId);
      if (!result.found) {
        return {
          content: [{ type: 'text',
            text: `❌ Decision not found: ${args.decisionId}\n\n` +
                  `💡 Use decision_search to find the decision and copy its 🆔 ID.` }],
          isError: true,
          structuredContent: { ok: false, found: false },
        };
      }
      const verb = result.alreadyArchived ? 'was already archived' : 'archived';
      return {
        content: [{ type: 'text',
          text: `🗑️  Decision ${verb} (soft-delete) — ${result.id}\n` +
                `💡 Hidden from decision_search but NOT deleted. Restore with: decision_restore(decisionId="${result.id}")` }],
        structuredContent: {
          action: 'archived',
          decision: { id: result.id, archivedAt: result.archivedAt },
          alreadyArchived: result.alreadyArchived === true,
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'decision_delete');
    }
  }

  /**
   * Handle decision RESTORE (un-archive) requests — decision_restore (task 7b28bed4).
   * Clears archived_at so the decision returns to default search. Mirror of handleDelete.
   */
  async handleRestore(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.requireProjectId(args.projectId, context);
      let resolvedId: string;
      try {
        resolvedId = isFullUuid(args.decisionId)
          ? args.decisionId
          : await resolveEntityId('decision', args.decisionId, projectId);
      } catch (e) {
        const handled = idErrorResponse(e, 'decision_restore', 'decision', args.decisionId, 'decision_search');
        if (handled) return handled;
        throw e;
      }

      const result = await decisionsHandler.restoreDecision(resolvedId, projectId);
      if (!result.found) {
        return {
          content: [{ type: 'text',
            text: `❌ Decision not found: ${args.decisionId}\n\n` +
                  `💡 Use decision_search(includeArchived:true) to see archived decisions and copy a 🆔 ID.` }],
          isError: true,
          structuredContent: { ok: false, found: false },
        };
      }
      const verb = result.alreadyArchived ? 'was already live (not archived)' : 'restored';
      return {
        content: [{ type: 'text',
          text: `♻️  Decision ${verb} — ${result.id}` }],
        structuredContent: {
          action: 'restored',
          decision: { id: result.id },
          alreadyArchived: result.alreadyArchived === true,
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'decision_restore');
    }
  }
}

export const decisionsRoutes = new DecisionsRoutes();
