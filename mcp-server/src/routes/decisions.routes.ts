import { decisionsHandler } from '../handlers/decisions.js';
import { SessionTrackingMiddleware } from '../api/middleware/sessionTracking.js';
import { formatMcpError } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';

/**
 * Technical Decisions Routes
 * Handles: decision_record, decision_search, decision_update, decision_stats
 */
export class DecisionsRoutes {
  /**
   * Handle decision record requests
   */
  async handleRecord(args: any): Promise<McpResponse> {
    try {
      console.log(`📝 Decision record request: ${args.decisionType}`);

      const decision = await decisionsHandler.recordDecision({
        decisionType: args.decisionType,
        title: args.title,
        description: args.description,
        rationale: args.rationale,
        impactLevel: args.impactLevel,
        alternativesConsidered: args.alternativesConsidered,
        problemStatement: args.problemStatement,
        affectedComponents: args.affectedComponents,
        tags: args.tags,
        projectId: args.projectId
      });

      // Auto-track decision_recorded activity in session
      await SessionTrackingMiddleware.trackDecisionRecorded(
        decision.id,
        decision.decisionType,
        decision.impactLevel
      );

      const alternativesText = decision.alternativesConsidered.length > 0
        ? `\n📋 Alternatives Considered:\n` +
          decision.alternativesConsidered.map(alt =>
            `   • ${alt.name}: ${alt.reasonRejected}`
          ).join('\n')
        : '';

      return {
        content: [{
          type: 'text',
          text: `✅ Technical decision recorded!\n\n` +
                `🎯 Type: ${decision.decisionType}\n` +
                `📝 Title: ${decision.title}\n` +
                `⚡ Impact: ${decision.impactLevel}\n` +
                `📅 Date: ${decision.decisionDate.toISOString().split('T')[0]}\n` +
                `🏷️  Components: [${decision.affectedComponents.join(', ')}]\n` +
                `🏷️  Tags: [${decision.tags.join(', ')}]\n` +
                `🆔 ID: ${decision.id}${alternativesText}\n\n` +
                `💡 Decision is now searchable and tracked for outcomes!`
        }],
      };
    } catch (error) {
      return formatMcpError(error as Error, 'decision_record');
    }
  }

  /**
   * Handle decision search requests
   */
  async handleSearch(args: any): Promise<McpResponse> {
    try {
      console.log(`🔍 Decision search request`);

      const decisions = await decisionsHandler.searchDecisions({
        query: args.query,
        decisionType: args.decisionType,
        impactLevel: args.impactLevel,
        component: args.component,
        tags: args.tags,
        limit: args.limit,
        projectId: args.projectId
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
   * Handle decision update requests
   */
  async handleUpdate(args: any): Promise<McpResponse> {
    try {
      console.log(`📝 Decision update request: ${args.decisionId.substring(0, 8)}...`);

      const decision = await decisionsHandler.updateDecision({
        decisionId: args.decisionId,
        outcomeStatus: args.outcomeStatus,
        outcomeNotes: args.outcomeNotes,
        lessonsLearned: args.lessonsLearned
      });

      return {
        content: [{
          type: 'text',
          text: `✅ Decision updated successfully!\n\n` +
                `📝 Title: ${decision.title}\n` +
                `📊 Status: ${decision.status}\n` +
                `🎯 Outcome: ${decision.outcomeStatus}\n` +
                `📄 Notes: ${decision.outcomeNotes || 'None'}\n` +
                `🧠 Lessons Learned: ${decision.lessonsLearned || 'None'}\n\n` +
                `💡 Decision outcomes help improve future choices!`
        }],
      };
    } catch (error) {
      return formatMcpError(error as Error, 'decision_update');
    }
  }

  /**
   * Handle decision stats requests
   */
  async handleStats(args: any): Promise<McpResponse> {
    try {
      console.log('📊 Decision stats request received');

      const stats = await decisionsHandler.getDecisionStats(args.projectId);

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
                `🕐 Recent Activity: ${stats.recentActivity}\n\n` +
                `📋 By Type:\n${typeBreakdown || '   (no decisions yet)'}\n\n` +
                `📊 By Status:\n${statusBreakdown || '   (no decisions yet)'}\n\n` +
                `⚡ By Impact:\n${impactBreakdown || '   (no decisions yet)'}\n\n` +
                `🎯 Track decision outcomes to improve future choices!`
        }],
      };
    } catch (error) {
      return formatMcpError(error as Error, 'decision_stats');
    }
  }
}

export const decisionsRoutes = new DecisionsRoutes();
