import { projectHandler } from '../handlers/project.js';
import { switchProjectWithValidation } from '../services/projectSwitchValidator.js';
import { formatMcpError, rawValue } from '../utils/mcpFormatter.js';
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
   * Build a clean, RAW structuredContent project record (markdown-in-values fix):
   * project name/description are passed through rawValue() so a DB value containing
   * `**bold**` never leaks markup into the machine-readable channel. This is the
   * locked-in root-cause fix for the project_current markdown bug class.
   */
  private toRawProject(project: any): Record<string, any> {
    return {
      id: project.id,
      name: rawValue(project.name),
      description: project.description != null ? rawValue(project.description) : null,
      status: project.status,
      contextCount: project.contextCount ?? 0,
      isActive: project.isActive ?? undefined,
      gitRepoUrl: project.gitRepoUrl ?? null,
      rootDirectory: project.rootDirectory ?? null,
      metadata: project.metadata ?? {},
      createdAt: project.createdAt ? project.createdAt.toISOString() : undefined,
      updatedAt: project.updatedAt ? project.updatedAt.toISOString() : undefined,
    };
  }

  /**
   * Handle project listing requests
   */
  async handleList(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      logger.info('📋 Project list request received');
      const sessionId = this.getSessionId(context);

      await projectHandler.initializeSession(sessionId); // Ensure session is initialized
      const allProjects = await projectHandler.listProjects(args.includeStats !== false);

      // PAGINATION (task 4b484c8f): the validator supplies a bounded limit (default 20)
      // and optional offset. listProjects() returns the full set (ordered updated_at
      // DESC) and is shared by two internal callers that must keep seeing everything,
      // so we page IN-ROUTE rather than changing the handler signature — the project
      // set is small enough that an in-memory slice is cheap, and it lets us report an
      // HONEST `total` (full count) vs `returned` (this page) without a second query.
      const total = allProjects.length;
      const offset = args.offset ?? 0;
      const limit = args.limit; // always present (zod default 20)
      const projects = allProjects.slice(offset, offset + limit);
      const truncated = total > offset + projects.length || offset > 0;

      if (total === 0) {
        return {
          content: [{
            type: 'text',
            text: `📋 No projects found\n\n` +
                  `Create your first project with: project_create`
          }],
          structuredContent: { ok: true, results: [], total: 0, returned: 0, offset, limit },
        };
      }

      const projectList = projects.map((project, index) => {
        const isActive = project.isActive ? ' 🟢 (CURRENT)' : '';
        const stats = project.contextCount !== undefined
          ? ` | Contexts: ${project.contextCount}`
          : '';

        // VALUE-CLEANING (task 4b484c8f, Lesson 011): name + description are short,
        // DB-sourced IDENTIFIER values rendered inline — run them through rawValue()
        // BEFORE the literal `**` wrapper so a name literally stored as `**x**` shows
        // as clean text, not `****x****`. (Same source-channel fix as project_current.)
        return `${offset + index + 1}. **${rawValue(project.name)}**${isActive}\n` +
               `   Description: ${project.description ? rawValue(project.description) : 'No description'}\n` +
               `   Status: ${project.status}${stats}\n` +
               `   ID: ${project.id}`;
      }).join('\n\n');

      // Honest truncation note — never silently drop rows (task 4b484c8f).
      const truncationNote = truncated
        ? `\n\n📄 Showing ${projects.length} of ${total}` +
          (offset > 0 ? ` (offset ${offset})` : '') +
          ` — page with limit/offset (e.g. project_list limit:${limit} offset:${offset + limit}).`
        : '';

      return {
        content: [{
          type: 'text',
          text: `📋 Projects (${projects.length} of ${total})\n\n${projectList}${truncationNote}\n\n` +
                `🔄 Switch projects with: project_switch <name-or-id>`
        }],
        structuredContent: {
          ok: true,
          results: projects.map((p) => this.toRawProject(p)),
          total,
          returned: projects.length,
          offset,
          limit,
          truncated,
        },
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
          // VALUE-CLEANING (task 4b484c8f): project name is a DB-sourced identifier
          // rendered inline → rawValue() so stored markup never prints literal `**`.
          text: `✅ Project created: "${rawValue(project.name)}" (${project.status}) — ID ${project.id}`,
        }],
        structuredContent: { action: 'created', project: this.toRawProject(project) },
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
          text: `✅ Switched to project: ${rawValue(project.name)} (${project.status})`,
        }],
        structuredContent: { action: 'switched', project: this.toRawProject(project) },
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
        isError: true,
        structuredContent: { ok: false, action: 'switch_failed', error: errorMessage, target: args.project },
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
            structuredContent: { ok: true, found: false },
          };
        }

        return {
          content: [{
            type: 'text',
            text: `🟢 Current Project: ${rawValue(initializedProject.name)} (auto-selected, ${initializedProject.status})`,
          }],
          structuredContent: {
            found: true,
            autoSelected: true,
            project: this.toRawProject(initializedProject),
          },
        };
      }

      return {
        content: [{
          type: 'text',
          text: `🟢 Current Project: ${rawValue(project.name)} (${project.status})`,
        }],
        structuredContent: { found: true, project: this.toRawProject(project) },
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
          structuredContent: { ok: true, found: false },
        };
      }

      const metadataInfo = Object.keys(project.metadata).length > 0
        ? `\n📋 Metadata:\n${Object.entries(project.metadata).map(([k, v]) => `   ${k}: ${v}`).join('\n')}`
        : '';

      return {
        content: [{
          type: 'text',
          // VALUE-CLEANING (task 4b484c8f, whole-class): name + description are short
          // DB-sourced identifier values rendered inline → rawValue() at the source so
          // markup stored in data never renders as literal `**` in the human text.
          text: `📋 Project Information: **${rawValue(project.name)}**${project.isActive ? ' 🟢 (CURRENT)' : ''}\n\n` +
                `📄 Description: ${project.description ? rawValue(project.description) : 'No description'}\n` +
                `📊 Status: ${project.status}\n` +
                `📈 Contexts: ${project.contextCount || 0}\n` +
                `🔗 Git Repo: ${project.gitRepoUrl || 'None'}\n` +
                `📁 Root Directory: ${project.rootDirectory || 'None'}\n` +
                `⏰ Created: ${project.createdAt.toISOString().split('T')[0]}\n` +
                `⏰ Updated: ${project.updatedAt.toISOString().split('T')[0]}\n` +
                `🆔 ID: ${project.id}${metadataInfo}\n\n` +
                `${project.isActive ? '🎯 This is your current active project' : '🔄 Switch to this project with: project_switch ' + rawValue(project.name)}`
        }],
        structuredContent: { found: true, project: this.toRawProject(project) },
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
          text: `✅ Project updated: ${rawValue(project.name)} (${project.status}) — ID ${project.id}`,
        }],
        structuredContent: {
          action: 'updated',
          project: this.toRawProject(project),
          updatedFields: Object.keys(updates),
        },
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
            text: `❌ Refusing to delete "${rawValue(existing.name)}": it is the active project for this session.\n\n` +
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
          structuredContent: { action: 'delete_refused', deleted: false, counts: c },
        };
      }

      return {
        content: [{
          type: 'text',
          text: `🗑️  Deleted project — ID ${result.projectId}`,
        }],
        structuredContent: {
          action: 'deleted',
          deleted: true,
          project: { id: result.projectId },
        },
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
