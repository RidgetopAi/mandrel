/**
 * Smart Search Tool Handlers
 * smart_search, get_recommendations, project_insights
 */

import { smartSearchHandler } from '../../handlers/smartSearch.js';
import { projectHandler } from '../../handlers/project.js';

const typeIcons: Record<string, string> = {
  context: '📝',
  decision: '🎯',
  task: '📋',
  code: '📦',
  component: '📦'
};

export const smartSearchHandlers = {
  async handleSmartSearch(args: any) {
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    const results = await smartSearchHandler.smartSearch(projectId, args.query, undefined, args.limit);

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `🔍 No results found for: "${args.query}"\n\n` +
                  `💡 Try different search terms or add more contexts`
          },
        ],
      };
    }

    const resultList = results.map((result: any, index: number) => {
      const typeIcon = typeIcons[result.type] || '📄';
      const scoreBar = '▓'.repeat(Math.round(result.relevanceScore * 5));
      
      return `   ${index + 1}. ${typeIcon} **${result.title || result.type}** (${Math.round(result.relevanceScore * 100)}%)\n` +
             `      💬 ${(result.summary || '').substring(0, 150)}...\n` +
             `      📊 Relevance: ${scoreBar}\n` +
             `      🆔 ${result.id}`;
    }).join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `🔍 Smart Search Results (${results.length})\n\n${resultList}\n\n` +
                `💡 Get recommendations with: get_recommendations`
        },
      ],
    };
  },

  async handleRecommendations(args: any) {
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    const recommendations = await smartSearchHandler.getRecommendations(
      args.context,
      projectId,
      args.type
    );

    if (recommendations.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `💡 No recommendations available\n\n` +
                  `📊 The AI couldn't generate recommendations for this context.\n` +
                  `🎯 Try different context or recommendation type`
          },
        ],
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
      content: [
        {
          type: 'text',
          text: `💡 AI Recommendations (${recommendations.length})\n\n${recList}\n\n` +
                `✅ = Actionable | ℹ️ = Informational\n` +
                `🎯 Type: ${args.type} recommendations`
        },
      ],
    };
  },

  async handleProjectInsights(args: any) {
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
      content: [
        {
          type: 'text',
          text: `🔍 Project Health Insights\n\n` +
                `📊 Code Health: ${healthLevel} (${insights.insights.codeHealth.score}/100)\n` +
                `🤝 Team Efficiency: ${efficiencyLevel} (${Math.round((insights.insights.teamEfficiency.completionRate || 0) * 100)}%)\n` +
                `📦 Components: ${insights.codeStats.totalComponents}\n` +
                `📝 Contexts: ${Object.values(insights.contextStats).reduce((a: any, b: any) => a + (b.count || 0), 0)}\n` +
                `🎯 Decisions: ${insights.decisionStats.total}\n` +
                `📋 Tasks: ${insights.taskStats.total}${gapsText}${issuesText}\n\n` +
                `💡 Get specific recommendations with: get_recommendations`
        },
      ],
    };
  }
};
