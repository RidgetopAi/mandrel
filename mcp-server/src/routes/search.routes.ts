import { smartSearchHandler } from '../handlers/smartSearch.js';
import { projectHandler } from '../handlers/project.js';
import { formatMcpError } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';

/**
 * Smart Search & AI Routes
 * Handles: smart_search, get_recommendations, project_insights
 */
class SearchRoutes {
  /**
   * Handle smart search requests
   */
  async handleSmartSearch(args: any): Promise<McpResponse> {
    try {
      // Resolve project identifier (name or UUID) to UUID
      let projectId = args.projectId;
      if (projectId) {
        const project = await projectHandler.getProject(projectId);
        if (!project) {
          return {
            content: [{
              type: 'text',
              text: `❌ Project "${projectId}" not found\n\n💡 Use project_list to see available projects`
            }]
          };
        }
        projectId = project.id;
      } else {
        projectId = await projectHandler.getCurrentProjectId('default-session');
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
        };
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

        return `   ${index + 1}. **${result.title}** ${typeIcon}\n` +
               `      💬 ${result.summary.substring(0, 80)}${result.summary.length > 80 ? '...' : ''}\n` +
               `      📊 Relevance: ${relevanceBar} (${Math.round(result.relevanceScore * 100)}%)${sourceText}\n` +
               `      🆔 ID: ${result.id}`;
      }).join('\n\n');

      return {
        content: [{
          type: 'text',
          text: `🔍 Smart Search Results (${results.length})\n\n${resultsList}\n\n` +
                `🎯 Searched: [${args.includeTypes?.join(', ') || 'context, component, decision, naming'}]\n` +
                `💡 Refine with different includeTypes or broader query`
        }],
      };
    } catch (error) {
      return formatMcpError(error as Error, 'smart_search');
    }
  }

  /**
   * Handle recommendations requests
   */
  async handleRecommendations(args: any): Promise<McpResponse> {
    try {
      // Resolve project identifier (name or UUID) to UUID
      let projectId = args.projectId;
      if (projectId) {
        const project = await projectHandler.getProject(projectId);
        if (!project) {
          return {
            content: [{
              type: 'text',
              text: `❌ Project "${projectId}" not found\n\n💡 Use project_list to see available projects`
            }]
          };
        }
        projectId = project.id;
      } else {
        projectId = await projectHandler.getCurrentProjectId('default-session');
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

        return `   ${index + 1}. **${rec.title}** ${typeIcon} ${actionableIcon}\n` +
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
      };
    } catch (error) {
      return formatMcpError(error as Error, 'get_recommendations');
    }
  }

  /**
   * Handle project insights requests
   */
  async handleProjectInsights(args: any): Promise<McpResponse> {
    try {
      // Resolve project identifier (name or UUID) to UUID
      let projectId = args.projectId;
      if (projectId) {
        const project = await projectHandler.getProject(projectId);
        if (!project) {
          return {
            content: [{
              type: 'text',
              text: `❌ Project "${projectId}" not found\n\n💡 Use project_list to see available projects`
            }]
          };
        }
        projectId = project.id;
      } else {
        projectId = await projectHandler.getCurrentProjectId('default-session');
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
      };
    } catch (error) {
      return formatMcpError(error as Error, 'project_insights');
    }
  }
}

export const searchRoutes = new SearchRoutes();
