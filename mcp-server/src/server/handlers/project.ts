/**
 * Project Tool Handlers - project_list, project_create, project_switch, project_current, project_info
 */

import { projectHandler } from '../../handlers/project.js';

export const projectHandlers = {
  async handleProjectList(args: any) {
    return projectHandler.listProjects(args.includeStats);
  },

  async handleProjectCreate(args: any) {
    return projectHandler.createProject(args.name);
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
  }
};
