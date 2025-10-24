import { namingHandler } from '../handlers/naming.js';
import { SessionTrackingMiddleware } from '../api/middleware/sessionTracking.js';
import { formatMcpError } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';

/**
 * Naming Registry Routes
 * Handles: naming_register, naming_check, naming_suggest, naming_stats
 */
export class NamingRoutes {
  /**
   * Handle naming register requests
   */
  async handleRegister(args: any): Promise<McpResponse> {
    try {
      console.log('📝 Naming register request received');

      const entry = await namingHandler.registerName({
        entityType: args.entityType,
        canonicalName: args.canonicalName,
        description: args.description,
        aliases: args.aliases,
        contextTags: args.contextTags,
        projectId: args.projectId
      });

      // Auto-track naming_registered activity in session
      await SessionTrackingMiddleware.trackNamingRegistered(
        entry.entityType,
        entry.canonicalName
      );

      return {
        content: [{
          type: 'text',
          text: `✅ Name registered successfully!\n\n` +
                `🏷️  Entity: ${entry.entityType}\n` +
                `📝 Name: ${entry.canonicalName}\n` +
                `📄 Description: ${entry.description || 'None'}\n` +
                `🏷️  Tags: [${entry.contextTags.join(', ')}]\n` +
                `🔤 Aliases: [${entry.aliases.join(', ')}]\n` +
                `📊 Usage Count: ${entry.usageCount}\n` +
                `🆔 ID: ${entry.id}\n\n` +
                `🎯 Name is now protected from conflicts!`
        }],
      };
    } catch (error) {
      return formatMcpError(error as Error, 'naming_register');
    }
  }

  /**
   * Handle naming check requests
   */
  async handleCheck(args: any): Promise<McpResponse> {
    try {
      console.log(`🔍 Naming check request: ${args.entityType} "${args.proposedName}"`);

      const conflicts = await namingHandler.checkNameConflicts({
        entityType: args.entityType,
        proposedName: args.proposedName,
        contextTags: args.contextTags,
        projectId: args.projectId
      });

      if (conflicts.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `✅ Name "${args.proposedName}" is available!\n\n` +
                  `🎯 No conflicts found for ${args.entityType}\n` +
                  `💡 You can safely use this name or register it to claim it.`
          }],
        };
      }

      const errors = conflicts.filter(c => c.severity === 'error');
      const warnings = conflicts.filter(c => c.severity === 'warning');

      let response = `🔍 Name check results for "${args.proposedName}":\n\n`;

      if (errors.length > 0) {
        response += `❌ CONFLICTS FOUND (${errors.length}):\n`;
        errors.forEach((error, i) => {
          response += `   ${i + 1}. ${error.conflictReason}\n`;
          if (error.suggestion) {
            response += `      💡 Suggestion: ${error.suggestion}\n`;
          }
        });
        response += '\n';
      }

      if (warnings.length > 0) {
        response += `⚠️  WARNINGS (${warnings.length}):\n`;
        warnings.forEach((warning, i) => {
          response += `   ${i + 1}. ${warning.conflictReason}\n`;
          if (warning.suggestion) {
            response += `      💡 Suggestion: ${warning.suggestion}\n`;
          }
        });
      }

      if (errors.length === 0) {
        response += `\n✅ Name can be used (warnings noted above)`;
      } else {
        response += `\n❌ Choose a different name to avoid conflicts`;
      }

      return {
        content: [{
          type: 'text',
          text: response
        }],
      };
    } catch (error) {
      return formatMcpError(error as Error, 'naming_check');
    }
  }

  /**
   * Handle naming suggest requests
   */
  async handleSuggest(args: any): Promise<McpResponse> {
    try {
      console.log(`💡 Naming suggest request: ${args.entityType}`);

      const suggestions = await namingHandler.suggestNames({
        entityType: args.entityType,
        description: args.description,
        contextTags: args.contextTags,
        projectId: args.projectId
      });

      if (suggestions.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `💭 No name suggestions available\n\n` +
                  `Try providing more context or check existing naming patterns in your project.`
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: `💡 Name suggestions for ${args.entityType}:\n` +
                `📝 Based on: "${args.description}"\n\n` +
                suggestions.map((suggestion, i) =>
                  `${i + 1}. **${suggestion.suggestedName}** (${Math.round(suggestion.confidence * 100)}% confidence)\n` +
                  `   📋 ${suggestion.explanation}\n` +
                  (suggestion.similarExamples.length > 0 ?
                    `   📚 Similar: ${suggestion.similarExamples.join(', ')}\n` : '')
                ).join('\n') + '\n' +
                `🎯 All suggestions are conflict-free and follow project patterns!`
        }],
      };
    } catch (error) {
      return formatMcpError(error as Error, 'naming_suggest');
    }
  }

  /**
   * Handle naming stats requests
   */
  async handleStats(args: any): Promise<McpResponse> {
    try {
      console.log('📊 Naming stats request received');

      const stats = await namingHandler.getNamingStats(args.projectId);

      const typeBreakdown = Object.entries(stats.namesByType)
        .map(([type, count]) => `   ${type}: ${count}`)
        .join('\n');

      return {
        content: [{
          type: 'text',
          text: `📊 Naming Registry Statistics\n\n` +
                `📈 Total Names: ${stats.totalNames}\n` +
                `🔧 Convention Compliance: ${stats.conventionCompliance}%\n` +
                `⚠️  Deprecated: ${stats.deprecatedCount}\n` +
                `🕐 Recent Activity: ${stats.recentActivity}\n\n` +
                `📋 By Type:\n${typeBreakdown || '   (no names yet)'}\n\n` +
                `🎯 Higher compliance scores indicate better naming consistency!`
        }],
      };
    } catch (error) {
      return formatMcpError(error as Error, 'naming_stats');
    }
  }
}

export const namingRoutes = new NamingRoutes();
