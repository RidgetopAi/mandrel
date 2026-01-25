import { projectHandler } from '../handlers/project.js';
import { switchProjectWithValidation } from '../services/projectSwitchValidator.js';
import { formatMcpError } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';

/**
 * Project Management Routes
 * Handles: project_list, project_create, project_switch, project_current, project_info, project_insights
 */
class ProjectRoutes {
  /**
   * Get current session ID (placeholder for future session tracking enhancement)
   */
  private getCurrentSessionId(): string {
    // In future versions, this would come from proper session tracking
    // For now, use a default session ID that integrates with existing ProjectHandler
    return 'default-session';
  }

  /**
   * Handle project listing requests
   */
  async handleList(args: any): Promise<McpResponse> {
    try {
      console.log('📋 Project list request received');

      await projectHandler.initializeSession(); // Ensure session is initialized
      const projects = await projectHandler.listProjects(args.includeStats !== false);

      if (projects.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `📋 No projects found\n\n` +
                  `Create your first project with: project_create`
          }],
        };
      }

      const projectList = projects.map((project, index) => {
        const isActive = project.isActive ? ' 🟢 (CURRENT)' : '';
        const stats = project.contextCount !== undefined
          ? ` | Contexts: ${project.contextCount}`
          : '';

        return `${index + 1}. **${project.name}**${isActive}\n` +
               `   Description: ${project.description || 'No description'}\n` +
               `   Status: ${project.status}${stats}\n` +
               `   ID: ${project.id}`;
      }).join('\n\n');

      return {
        content: [{
          type: 'text',
          text: `📋 Projects (${projects.length} total)\n\n${projectList}\n\n` +
                `🔄 Switch projects with: project_switch <name-or-id>`
        }],
      };
    } catch (error) {
      return formatMcpError(error as Error, 'project_list');
    }
  }

  /**
   * Handle project create requests
   */
  async handleCreate(args: any): Promise<McpResponse> {
    try {
      console.log(`🆕 Project create request: "${args.name}"`);

      const project = await projectHandler.createProject({
        name: args.name,
        description: args.description,
        gitRepoUrl: args.gitRepoUrl,
        rootDirectory: args.rootDirectory,
        metadata: args.metadata
      });

      return {
        content: [{
          type: 'text',
          text: `✅ Project created successfully!\n\n` +
                `📝 Name: ${project.name}\n` +
                `📄 Description: ${project.description || 'None'}\n` +
                `📊 Status: ${project.status}\n` +
                `⏰ Created: ${project.createdAt.toISOString()}\n` +
                `🆔 ID: ${project.id}\n\n` +
                `💡 Switch to this project with: project_switch ${project.name}`
        }],
      };
    } catch (error) {
      return formatMcpError(error as Error, 'project_create');
    }
  }

  /**
   * Handle project switching requests with TS012 validation framework
   */
  async handleSwitch(args: any): Promise<McpResponse> {
    try {
      console.log(`🔄 [TS012] Project switch request: "${args.project}"`);

      // Get current session ID (in future this could come from session tracking)
      const sessionId = this.getCurrentSessionId();

      // Use enhanced validation switching (now from projectSwitchValidator to avoid circular dependency)
      const project = await switchProjectWithValidation(args.project, sessionId || 'default-session');

      // Log successful switch for metrics and monitoring
      const switchMetrics = {
        sessionId,
        targetProject: args.project,
        switchSuccessful: true,
        timestamp: new Date(),
        validationPassed: true
      };

      console.log(`✅ [TS012] Project switch metrics:`, switchMetrics);

      return {
        content: [{
          type: 'text',
          text: `✅ Switched to project: **${project.name}** 🟢\n\n` +
                `📄 Description: ${project.description || 'No description'}\n` +
                `📊 Status: ${project.status}\n` +
                `📈 Contexts: ${project.contextCount || 0}\n` +
                `⏰ Last Updated: ${project.updatedAt.toISOString().split('T')[0]}\n\n` +
                `🎯 All context operations will now use this project by default\n` +
                `🛡️  Switch completed with TS012 validation framework`
        }],
      };
    } catch (error) {
      console.error(`❌ [TS012] Project switch failed:`, error);

      // Log failed switch for metrics and monitoring
      const errorMetrics = {
        sessionId: this.getCurrentSessionId(),
        targetProject: args.project,
        switchSuccessful: false,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : String(error)
      };

      console.log(`❌ [TS012] Project switch error metrics:`, errorMetrics);

      // Try to provide helpful error message based on error type
      let userFriendlyMessage = `Failed to switch to project "${args.project}"`;
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('not found')) {
        userFriendlyMessage += `\n\n💡 **Troubleshooting:**\n` +
          `• Check if the project name is spelled correctly\n` +
          `• Use \`project_list\` to see available projects\n` +
          `• Create the project first with \`project_create\``;
      } else if (errorMessage.includes('Pre-switch validation failed')) {
        userFriendlyMessage += `\n\n💡 **Validation Issues:**\n` +
          `• Session state may be inconsistent\n` +
          `• Try again in a few moments\n` +
          `• Contact support if problem persists`;
      } else if (errorMessage.includes('Atomic switch failed')) {
        userFriendlyMessage += `\n\n💡 **Switch Process Issues:**\n` +
          `• The switch was safely rolled back\n` +
          `• Your previous project setting is preserved\n` +
          `• Try again or contact support`;
      }

      return {
        content: [{
          type: 'text',
          text: `❌ ${userFriendlyMessage}\n\n` +
                `**Error Details:** ${errorMessage}\n\n` +
                `🛡️  Protected by TS012 validation framework`
        }],
      };
    }
  }

  /**
   * Handle current project requests
   */
  async handleCurrent(_args: any): Promise<McpResponse> {
    try {
      console.log('🔍 Current project request received');

      const project = await projectHandler.getCurrentProject();

      if (!project) {
        await projectHandler.initializeSession();
        const initializedProject = await projectHandler.getCurrentProject();

        if (!initializedProject) {
          return {
            content: [{
              type: 'text',
              text: `❌ No current project set and no projects available\n\n` +
                    `Create your first project with: project_create <name>`
            }],
          };
        }

        return {
          content: [{
            type: 'text',
            text: `🟢 Current Project: **${initializedProject.name}** (auto-selected)\n\n` +
                  `📄 Description: ${initializedProject.description || 'No description'}\n` +
                  `📊 Status: ${initializedProject.status}\n` +
                  `📈 Contexts: ${initializedProject.contextCount || 0}\n` +
                  `⏰ Last Updated: ${initializedProject.updatedAt.toISOString().split('T')[0]}`
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: `🟢 Current Project: **${project.name}**\n\n` +
                `📄 Description: ${project.description || 'No description'}\n` +
                `📊 Status: ${project.status}\n` +
                `📈 Contexts: ${project.contextCount || 0}\n` +
                `⏰ Last Updated: ${project.updatedAt.toISOString().split('T')[0]}\n\n` +
                `🔄 Switch projects with: project_switch <name-or-id>`
        }],
      };
    } catch (error) {
      return formatMcpError(error as Error, 'project_current');
    }
  }

  /**
   * Handle project info requests
   */
  async handleInfo(args: any): Promise<McpResponse> {
    try {
      console.log(`🔍 Project info request: "${args.project}"`);

      const project = await projectHandler.getProject(args.project);

      if (!project) {
        return {
          content: [{
            type: 'text',
            text: `❌ Project "${args.project}" not found\n\n` +
                  `💡 List all projects with: project_list`
          }],
        };
      }

      const metadataInfo = Object.keys(project.metadata).length > 0
        ? `\n📋 Metadata:\n${Object.entries(project.metadata).map(([k, v]) => `   ${k}: ${v}`).join('\n')}`
        : '';

      return {
        content: [{
          type: 'text',
          text: `📋 Project Information: **${project.name}**${project.isActive ? ' 🟢 (CURRENT)' : ''}\n\n` +
                `📄 Description: ${project.description || 'No description'}\n` +
                `📊 Status: ${project.status}\n` +
                `📈 Contexts: ${project.contextCount || 0}\n` +
                `🔗 Git Repo: ${project.gitRepoUrl || 'None'}\n` +
                `📁 Root Directory: ${project.rootDirectory || 'None'}\n` +
                `⏰ Created: ${project.createdAt.toISOString().split('T')[0]}\n` +
                `⏰ Updated: ${project.updatedAt.toISOString().split('T')[0]}\n` +
                `🆔 ID: ${project.id}${metadataInfo}\n\n` +
                `${project.isActive ? '🎯 This is your current active project' : '🔄 Switch to this project with: project_switch ' + project.name}`
        }],
      };
    } catch (error) {
      return formatMcpError(error as Error, 'project_info');
    }
  }

  /**
   * Handle project insights requests
   * Note: project_insights is actually handled in search.routes.ts
   * This method is included for completeness but not used in the route dispatcher
   */
  async handleInsights(_args: any): Promise<McpResponse> {
    // This tool is handled by searchRoutes.handleProjectInsights()
    // Included here for type safety but not exposed in routes/index.ts
    return formatMcpError('project_insights is handled by search routes', 'project_insights');
  }
}

export const projectRoutes = new ProjectRoutes();
