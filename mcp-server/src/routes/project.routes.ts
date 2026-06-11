import { projectHandler } from '../handlers/project.js';
import { switchProjectWithValidation } from '../services/projectSwitchValidator.js';
import { formatMcpError } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';
import type { RouteContext } from './index.js';
import { logger } from '../utils/logger.js';

/**
 * Project Management Routes
 * Handles: project_list, project_create, project_switch, project_current, project_info, project_insights
 */
class ProjectRoutes {
  /**
   * Get session ID from context for connection-scoped isolation
   * Uses connectionId if available, otherwise falls back to default
   */
  private getSessionId(context?: RouteContext): string {
    // Use connectionId for session isolation, or fall back to default
    return context?.connectionId || 'default-session';
  }

  /**
   * Handle project listing requests
   */
  async handleList(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      logger.info('📋 Project list request received');
      const sessionId = this.getSessionId(context);

      await projectHandler.initializeSession(sessionId); // Ensure session is initialized
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
      logger.info(`🆕 Project create request: "${args.name}"`);

      const project = await projectHandler.createProject({
        name: args.name,
        description: args.description,
        status: args.status,
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
  async handleSwitch(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const sessionId = this.getSessionId(context);
      logger.info(`🔄 [TS012] Project switch request: "${args.project}" (session: ${sessionId})`);

      // Use enhanced validation switching (now from projectSwitchValidator to avoid circular dependency)
      const project = await switchProjectWithValidation(args.project, sessionId);

      // Log successful switch for metrics and monitoring
      const switchMetrics = {
        sessionId,
        targetProject: args.project,
        switchSuccessful: true,
        timestamp: new Date(),
        validationPassed: true
      };

      logger.info(`✅ [TS012] Project switch metrics`, { metadata: { switchMetrics } });

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
      logger.error(`❌ [TS012] Project switch failed`, error as Error);

      // Log failed switch for metrics and monitoring
      const errorMetrics = {
        sessionId: this.getSessionId(context),
        targetProject: args.project,
        switchSuccessful: false,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : String(error)
      };

      logger.info(`❌ [TS012] Project switch error metrics`, { metadata: { errorMetrics } });

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
  async handleCurrent(_args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const sessionId = this.getSessionId(context);
      logger.info(`🔍 Current project request received (session: ${sessionId})`);

      const project = await projectHandler.getCurrentProject(sessionId);

      if (!project) {
        await projectHandler.initializeSession(sessionId);
        const initializedProject = await projectHandler.getCurrentProject(sessionId);

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
      logger.info(`🔍 Project info request: "${args.project}"`);

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
   * Handle project update requests (name, description, status, etc.)
   * Identifies the project by id or name (like project_switch).
   */
  async handleUpdate(args: any): Promise<McpResponse> {
    try {
      logger.info(`📝 Project update request: "${args.project}"`);

      // Resolve project by id or name first.
      const existing = await projectHandler.getProject(args.project);
      if (!existing) {
        return {
          content: [{
            type: 'text',
            text: `❌ Project "${args.project}" not found\n\n` +
                  `💡 List all projects with: project_list`
          }],
        };
      }

      // Guard against renaming onto an existing project's name.
      if (args.name !== undefined && args.name !== existing.name) {
        const collision = await projectHandler.getProject(args.name);
        if (collision && collision.id !== existing.id) {
          return {
            content: [{
              type: 'text',
              text: `❌ Cannot rename to "${args.name}": a project with that name already exists\n\n` +
                    `💡 Choose a different name or list projects with: project_list`
            }],
          };
        }
      }

      // Build the set of fields actually provided.
      const updates: Record<string, any> = {};
      if (args.name !== undefined) updates.name = args.name;
      if (args.description !== undefined) updates.description = args.description;
      if (args.status !== undefined) updates.status = args.status;
      if (args.gitRepoUrl !== undefined) updates.gitRepoUrl = args.gitRepoUrl;
      if (args.rootDirectory !== undefined) updates.rootDirectory = args.rootDirectory;
      if (args.metadata !== undefined) updates.metadata = args.metadata;

      if (Object.keys(updates).length === 0) {
        return {
          content: [{
            type: 'text',
            text: `❌ No update fields provided\n\n` +
                  `💡 Provide at least one of: name, description, status, gitRepoUrl, rootDirectory, metadata`
          }],
        };
      }

      const project = await projectHandler.updateProject(existing.id, updates);

      return {
        content: [{
          type: 'text',
          text: `✅ Project updated successfully!\n\n` +
                `📝 Name: ${project.name}\n` +
                `📄 Description: ${project.description || 'None'}\n` +
                `📊 Status: ${project.status}\n` +
                `🔗 Git Repo: ${project.gitRepoUrl || 'None'}\n` +
                `📁 Root Directory: ${project.rootDirectory || 'None'}\n` +
                `⏰ Updated: ${project.updatedAt.toISOString()}\n` +
                `🆔 ID: ${project.id}`
        }],
      };
    } catch (error) {
      return formatMcpError(error as Error, 'project_update');
    }
  }

  /**
   * Handle project delete requests.
   *
   * DESTRUCTIVE: every project FK is ON DELETE CASCADE, so deletion wipes all
   * owned contexts/decisions/tasks/sessions. The handler delegates the safety
   * policy (refuse non-empty without confirm; refuse active/last project) to
   * projectHandler.deleteProject and formats the outcome.
   */
  async handleDelete(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      logger.info(`🗑️  Project delete request: "${args.project}" (confirm=${args.confirm === true})`);

      // Resolve first so we can compare against the active project for THIS session.
      const existing = await projectHandler.getProject(args.project);
      if (!existing) {
        return {
          content: [{
            type: 'text',
            text: `❌ Project "${args.project}" not found\n\n` +
                  `💡 List all projects with: project_list`
          }],
        };
      }

      // Connection-scoped active-project guard (the handler also checks the
      // default-session current project; this catches per-connection switches).
      const sessionId = this.getSessionId(context);
      const sessionCurrentId = await projectHandler.getCurrentProjectId(sessionId);
      if (sessionCurrentId === existing.id) {
        const counts = await projectHandler.getProjectChildCounts(existing.id);
        return {
          content: [{
            type: 'text',
            text: `❌ Refusing to delete "${existing.name}": it is the active project for this session.\n\n` +
                  `Owned data: ${counts.contexts} contexts, ${counts.decisions} decisions, ` +
                  `${counts.tasks} tasks, ${counts.sessions} sessions.\n` +
                  `💡 Switch to another project first: project_switch <other-project>`
          }],
        };
      }

      const result = await projectHandler.deleteProject(args.project, args.confirm === true);

      if (!result.deleted) {
        const c = result.counts;
        return {
          content: [{
            type: 'text',
            text: `${result.message}\n\n` +
                  `📊 Owned data — Contexts: ${c.contexts} | Decisions: ${c.decisions} | ` +
                  `Tasks: ${c.tasks} | Sessions: ${c.sessions} (Total: ${c.total})`
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: `${result.message}\n\n` +
                `🆔 Deleted project ID: ${result.projectId}`
        }],
      };
    } catch (error) {
      return formatMcpError(error as Error, 'project_delete');
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
