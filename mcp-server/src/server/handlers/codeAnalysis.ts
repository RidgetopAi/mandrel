/**
 * Code Analysis Tool Handlers
 * code_analyze, code_components, code_dependencies, code_impact, code_stats
 */

import { codeAnalysisHandler } from '../../handlers/codeAnalysis.js';
import { projectHandler } from '../../handlers/project.js';

export const codeAnalysisHandlers = {
  async handleCodeAnalyze(args: any) {
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    return codeAnalysisHandler.analyzeFile(
      projectId,
      args.filePath,
      args.fileContent,
      args.language
    );
  },

  async handleCodeComponents(args: any) {
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    const components = await codeAnalysisHandler.getProjectComponents(
      projectId,
      args.componentType,
      args.filePath
    );

    if (components.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `📦 No code components found\n\n` +
                  `💡 Analyze files with: code_analyze`
          },
        ],
      };
    }

    const componentList = components.map((comp, index) => {
      const exportIcon = comp.isExported ? '🌍' : '🔒';
      const deprecatedIcon = comp.isDeprecated ? '⚠️' : '';
      const tagsText = comp.tags.length > 0 ? `\n      🏷️  Tags: [${comp.tags.join(', ')}]` : '';
      
      return `   ${index + 1}. **${comp.name}** ${exportIcon}${deprecatedIcon}\n` +
             `      📝 Type: ${comp.componentType}\n` +
             `      📄 File: ${comp.filePath} (lines ${comp.startLine}-${comp.endLine})\n` +
             `      📊 Complexity: ${comp.complexityScore} | LOC: ${comp.linesOfCode}${tagsText}\n` +
             `      🆔 ID: ${comp.id}`;
    }).join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `📦 Code Components (${components.length})\n\n${componentList}\n\n` +
                `🌍 = Exported | 🔒 = Private | ⚠️ = Deprecated\n` +
                `💡 Get dependencies with: code_dependencies\n` +
                `📊 Check impact with: code_impact`
        },
      ],
    };
  },

  async handleCodeDependencies(args: any) {
    const dependencies = await codeAnalysisHandler.getComponentDependencies(args.componentId);

    if (dependencies.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `🔗 No dependencies found for this component\n\n` +
                  `💡 This component appears to be self-contained!`
          },
        ],
      };
    }

    const depList = dependencies.map((dep, index) => {
      const externalIcon = dep.isExternal ? '🌐' : '🏠';
      const confidenceBar = '▓'.repeat(Math.round(dep.confidenceScore * 5));
      const aliasText = dep.importAlias ? ` as ${dep.importAlias}` : '';
      const depName = dep.toComponentId || dep.importPath || 'unknown';
      
      return `   ${index + 1}. **${depName}**${aliasText} ${externalIcon}\n` +
             `      📝 Type: ${dep.dependencyType}\n` +
             `      📦 From: ${dep.importPath || 'internal'}\n` +
             `      📊 Confidence: ${confidenceBar} (${Math.round(dep.confidenceScore * 100)}%)`;
    }).join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `🔗 Dependencies (${dependencies.length})\n\n${depList}\n\n` +
                `🌐 = External | 🏠 = Internal\n` +
                `💡 Check impact with: code_impact`
        },
      ],
    };
  },

  async handleCodeImpact(args: any) {
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    const impact = await codeAnalysisHandler.analyzeImpact(projectId, args.componentId);

    const dependents = impact.dependents || [];

    if (dependents.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `📊 Impact Analysis: Low\n\n` +
                  `✅ This component has no known dependents\n` +
                  `💡 Changes are safe to make!`
          },
        ],
      };
    }

    const riskLevel = impact.impactScore > 10 ? 'high' : impact.impactScore > 5 ? 'medium' : 'low';

    const dependentsText = dependents.length > 0
      ? `\n🔗 Dependent Components:\n` + dependents.map((d: any) => `   • ${d.name || d}`).join('\n')
      : '';

    return {
      content: [
        {
          type: 'text',
          text: `📊 Impact Analysis\n\n` +
                `⚠️  Risk Level: ${riskLevel}\n` +
                `📊 Impact Score: ${impact.impactScore}\n` +
                `🔗 Dependents: ${dependents.length}${dependentsText}\n\n` +
                `💡 Review dependents before making changes`
        },
      ],
    };
  },

  async handleCodeStats(args: any) {
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    const stats = await codeAnalysisHandler.getProjectAnalysisStats(projectId);

    return {
      content: [
        {
          type: 'text',
          text: `📊 Code Statistics\n\n` +
                `📦 Components by Type: ${JSON.stringify(stats.componentsByType || {})}\n` +
                `🔗 Dependencies by Type: ${JSON.stringify(stats.dependenciesByType || {})}\n` +
                `📄 Files Analyzed: ${stats.filesAnalyzed || 0}\n` +
                `📊 Average Complexity: ${stats.averageComplexity?.toFixed(2) || 'N/A'}\n\n` +
                `💡 Get component list with: code_components`
        },
      ],
    };
  }
};
