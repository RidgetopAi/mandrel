import { smartSearchHandler } from '../handlers/smartSearch.js';
import { buildHonestyHeader } from '../handlers/context.js';
import { projectHandler } from '../handlers/project.js';
import { formatMcpError, rawValue } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';
import type { RouteContext } from './index.js';
import { trustForRecords, type RecordRef, type Trust } from '../services/trust.js';
import { TRUST_BAND_HINT, type TrustBand } from '../config/trustConfig.js';

/**
 * Smart Search & AI Routes
 * Handles: smart_search, get_recommendations, project_insights
 */
class SearchRoutes {
  /**
   * Resolve project ID using connection-scoped session state
   */
  private async resolveProjectId(argsProjectId: string | undefined, context?: RouteContext): Promise<string | null> {
    if (argsProjectId) {
      const project = await projectHandler.getProject(argsProjectId);
      if (!project) return null;
      return project.id;
    }
    const sessionId = context?.connectionId || 'default-session';
    await projectHandler.initializeSession(sessionId);
    return await projectHandler.getCurrentProjectId(sessionId);
  }

  /**
   * TRUST (T2b — THE MOAT): compact one-line human hint for a smart-search row.
   * structuredContent carries the full trust object; this is the at-a-glance band.
   */
  static trustHint(trust: Trust): string {
    const hint = TRUST_BAND_HINT[trust.band as TrustBand] ?? trust.band;
    const scorePart = trust.score === null ? '' : ` (${trust.score.toFixed(2)})`;
    const coldStart = trust.outcome.score === null ? ', cold-start' : '';
    const abstainPart =
      trust.abstain || trust.band === 'superseded' || trust.band === 'contradicted'
        ? ' — abstain'
        : '';
    return `🔐 Trust: ${hint}${scorePart}${coldStart}${abstainPart}`;
  }

  /**
   * Handle smart search requests
   */
  async handleSmartSearch(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.resolveProjectId(args.projectId, context);
      if (!projectId) {
        return {
          content: [{
            type: 'text',
            text: args.projectId
              ? `❌ Project "${args.projectId}" not found\n\n💡 Use project_list to see available projects`
              : `❌ No current project set\n\n💡 Use project_switch to set an active project`
          }]
        };
      }

      const results = await smartSearchHandler.smartSearch(
        projectId,
        args.query,
        args.includeTypes,
        args.limit
      );

      if (results.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `🔍 No results found for: "${args.query}"\n\n` +
                  `💡 Try broader search terms or different data sources`
          }],
          structuredContent: { ok: true, results: [], total: 0 },
        };
      }

      // HONESTY FLOOR (task b02446d7): smart_search rows sort DESC by relevanceScore,
      // and the per-row display IS that score as a percentage — so it is already
      // display-consistent (task e520d129 needs no number change here). Prepend an
      // honest header when the best row is below the floor. relevanceScore is a
      // fraction in [0,1]; the floor helper takes a 0–100 number.
      const honestyHeader = buildHonestyHeader(results[0].relevanceScore * 100);

      // TRUST (T2b — default-on): compute trust for the context/decision result items
      // (the trustable record kinds; components/agents have no outcome graph). Indexed by
      // result position so it zips back onto the rows. trustForRecord self-fetches each
      // record's freshness date + (for decisions) its own outcome/supersession. Display-
      // only, computed AFTER the existing relevance sort — order is unchanged.
      const trustByIndex = new Map<number, Trust>();
      const trustableIndexes: number[] = [];
      const trustableRefs: RecordRef[] = [];
      results.forEach((r, i) => {
        if (r.type === 'context' || r.type === 'decision') {
          trustableIndexes.push(i);
          trustableRefs.push({ id: r.id, type: r.type });
        }
      });
      if (trustableRefs.length > 0) {
        const trusts = await trustForRecords(trustableRefs);
        trustableIndexes.forEach((origIdx, k) => trustByIndex.set(origIdx, trusts[k]));
      }

      const resultsList = results.map((result, index) => {
        const typeIcon = {
          context: '📝',
          component: '📦',
          decision: '🎯',
          naming: '🏷️',
          task: '📋',
          agent: '🤖'
        }[result.type] || '📄';

        const relevanceBar = '▓'.repeat(Math.round(result.relevanceScore * 5));
        const sourceText = result.source ? ` (${result.source})` : '';
        const trust = trustByIndex.get(index);
        const trustLine = trust ? `\n      ${SearchRoutes.trustHint(trust)}` : '';

        return `   ${index + 1}. **${rawValue(result.title)}** ${typeIcon}\n` +
               `      💬 ${result.summary.substring(0, 80)}${result.summary.length > 80 ? '...' : ''}\n` +
               `      📊 Relevance: ${relevanceBar} (${Math.round(result.relevanceScore * 100)}%)${sourceText}${trustLine}\n` +
               `      🆔 ID: ${result.id}`;
      }).join('\n\n');

      return {
        content: [{
          type: 'text',
          text: (honestyHeader ? honestyHeader + '\n\n' : '') +
                `🔍 Smart Search Results (${results.length})\n\n${resultsList}\n\n` +
                `🎯 Searched: [${args.includeTypes?.join(', ') || 'context, component, decision'}]\n` +
                `💡 Refine with different includeTypes or broader query`
        }],
        structuredContent: {
          results: results.map((result, index) => ({
            id: result.id,
            type: result.type,
            title: result.title,
            summary: result.summary,
            relevanceScore: result.relevanceScore,
            source: result.source,
            // TRUST (T2b — default-on): present for context/decision items; absent for
            // record kinds with no outcome graph (component/agent).
            trust: trustByIndex.get(index),
          })),
          total: results.length,
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'smart_search');
    }
  }

  /**
   * Handle recommendations requests
   */
  async handleRecommendations(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.resolveProjectId(args.projectId, context);
      if (!projectId) {
        return {
          content: [{
            type: 'text',
            text: args.projectId
              ? `❌ Project "${args.projectId}" not found\n\n💡 Use project_list to see available projects`
              : `❌ No current project set\n\n💡 Use project_switch to set an active project`
          }]
        };
      }

      const recommendations = await smartSearchHandler.getRecommendations(
        projectId,
        args.context,
        args.type
      );

      if (recommendations.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `💡 No specific recommendations for: "${args.context}"\n\n` +
                  `🎯 Try different context or recommendation type`
          }],
          structuredContent: { ok: true, results: [], total: 0 },
        };
      }

      const recList = recommendations.map((rec, index) => {
        const typeIcon = {
          naming: '🏷️',
          pattern: '🔧',
          decision: '🎯',
          refactor: '♻️',
          task: '📋'
        }[rec.type] || '💡';

        const confidenceBar = '▓'.repeat(Math.round(rec.confidence * 5));
        const actionableIcon = rec.actionable ? '✅' : 'ℹ️';
        const refsText = rec.references.length > 0 ? `\n      🔗 References: ${rec.references.length} items` : '';

        return `   ${index + 1}. **${rawValue(rec.title)}** ${typeIcon} ${actionableIcon}\n` +
               `      💬 ${rec.description}\n` +
               `      📊 Confidence: ${confidenceBar} (${Math.round(rec.confidence * 100)}%)${refsText}`;
      }).join('\n\n');

      return {
        content: [{
          type: 'text',
          text: `💡 AI Recommendations (${recommendations.length})\n\n${recList}\n\n` +
                `✅ = Actionable | ℹ️ = Informational\n` +
                `🎯 Type: ${args.type} recommendations`
        }],
        structuredContent: {
          results: recommendations.map((rec) => ({
            type: rec.type,
            title: rec.title,
            summary: rec.description,
            confidence: rec.confidence,
            actionable: rec.actionable,
            references: rec.references,
          })),
          total: recommendations.length,
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'get_recommendations');
    }
  }

  /**
   * Handle project insights requests
   */
  async handleProjectInsights(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.resolveProjectId(args.projectId, context);
      if (!projectId) {
        return {
          content: [{
            type: 'text',
            text: args.projectId
              ? `❌ Project "${args.projectId}" not found\n\n💡 Use project_list to see available projects`
              : `❌ No current project set\n\n💡 Use project_switch to set an active project`
          }]
        };
      }

      const insights = await smartSearchHandler.getProjectInsights(projectId);

      const healthLevelMap = {
        healthy: '🟢 HEALTHY',
        moderate: '🟡 MODERATE',
        needs_attention: '🔴 NEEDS ATTENTION',
        no_data: '⚪ NO DATA'
      } as const;
      const healthLevel = healthLevelMap[insights.insights.codeHealth.level as keyof typeof healthLevelMap] || '❓ UNKNOWN';

      const efficiencyLevelMap = {
        efficient: '🟢 EFFICIENT',
        moderate: '🟡 MODERATE',
        needs_improvement: '🔴 NEEDS IMPROVEMENT',
        no_data: '⚪ NO DATA'
      } as const;
      const efficiencyLevel = efficiencyLevelMap[insights.insights.teamEfficiency.level as keyof typeof efficiencyLevelMap] || '❓ UNKNOWN';

      const gapsText = insights.insights.knowledgeGaps.length > 0
        ? `\n📋 Knowledge Gaps:\n` + insights.insights.knowledgeGaps.map((gap: string) => `   • ${gap}`).join('\n')
        : '';

      const issuesText = insights.insights.codeHealth.issues.length > 0
        ? `\n⚠️  Code Issues:\n` + insights.insights.codeHealth.issues.map((issue: string) => `   • ${issue}`).join('\n')
        : '';

      return {
        content: [{
          type: 'text',
          text: `🔍 Project Health Insights\n\n` +
                `📊 Code Health: ${healthLevel} (${insights.insights.codeHealth.score}/100)\n` +
                `🤝 Team Efficiency: ${efficiencyLevel} (${Math.round((insights.insights.teamEfficiency.completionRate || 0) * 100)}%)\n` +
                `📦 Components: ${insights.codeStats.totalComponents}\n` +
                `📝 Contexts: ${Object.values(insights.contextStats).reduce((a: any, b: any) => a + (b.count || 0), 0)}\n` +
                `🎯 Decisions: ${insights.decisionStats.total}\n` +
                `📋 Tasks: ${insights.taskStats.total}${gapsText}${issuesText}\n\n` +
                `💡 Get specific recommendations with: get_recommendations`
        }],
        structuredContent: {
          codeHealth: {
            level: insights.insights.codeHealth.level,
            score: insights.insights.codeHealth.score,
            issues: insights.insights.codeHealth.issues,
          },
          teamEfficiency: {
            level: insights.insights.teamEfficiency.level,
            completionRate: insights.insights.teamEfficiency.completionRate ?? 0,
          },
          knowledgeGaps: insights.insights.knowledgeGaps,
          totalComponents: insights.codeStats.totalComponents,
          decisionsTotal: insights.decisionStats.total,
          tasksTotal: insights.taskStats.total,
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'project_insights');
    }
  }
}

export const searchRoutes = new SearchRoutes();
