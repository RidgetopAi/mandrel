/**
 * Project Tool Handlers - project_list, project_create, project_switch,
 * project_current, project_info, project_update, project_delete
 */

import { projectHandler } from '../../handlers/project.js';

export const projectHandlers = {
  async handleProjectList(args: any) {
    return projectHandler.listProjects(args.includeStats);
  },

  async handleProjectCreate(args: any) {
    return projectHandler.createProject({
      name: args.name,
      description: args.description,
      status: args.status,
      gitRepoUrl: args.gitRepoUrl,
      rootDirectory: args.rootDirectory,
      metadata: args.metadata
    });
  },

  async handleProjectSwitch(args: any) {
    return projectHandler.switchProject(
      args.project,
      args.sessionId || 'default-session'
    );
  },

  async handleProjectCurrent(args: any) {
    return projectHandler.getCurrentProject(args.sessionId || 'default-session');
  },

  async handleProjectInfo(args: any) {
    return projectHandler.getProject(
      args.projectId || await projectHandler.getCurrentProjectId('default-session')
    );
  },

  async handleProjectUpdate(args: any) {
    // Resolve project by id or name (mirrors switchProject's resolution).
    const existing = await projectHandler.getProject(args.project);
    if (!existing) {
      throw new Error(`Project "${args.project}" not found`);
    }

    // Guard against renaming onto an existing project's name.
    if (args.name !== undefined && args.name !== existing.name) {
      const collision = await projectHandler.getProject(args.name);
      if (collision && collision.id !== existing.id) {
        throw new Error(`Cannot rename to "${args.name}": a project with that name already exists`);
      }
    }

    const updates: Record<string, any> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.status !== undefined) updates.status = args.status;
    if (args.gitRepoUrl !== undefined) updates.gitRepoUrl = args.gitRepoUrl;
    if (args.rootDirectory !== undefined) updates.rootDirectory = args.rootDirectory;
    if (args.metadata !== undefined) updates.metadata = args.metadata;

    if (Object.keys(updates).length === 0) {
      throw new Error('No update fields provided (one of: name, description, status, gitRepoUrl, rootDirectory, metadata)');
    }

    return projectHandler.updateProject(existing.id, updates);
  },

  async handleProjectDelete(args: any) {
    return projectHandler.deleteProject(args.project, args.confirm === true);
  }
};
