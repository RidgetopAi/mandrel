/**
 * Agent & Task Tool Handlers
 * agent_register, agent_list, agent_status, agent_join, agent_leave, agent_sessions
 * task_create, task_list, task_update, task_details, agent_message, agent_messages
 */

import { agentsHandler } from '../../handlers/agents.js';
import { projectHandler } from '../../handlers/project.js';

export const agentHandlers = {
  async handleAgentRegister(args: any) {
    return agentsHandler.registerAgent(
      args.agentId,
      args.capabilities,
      args.sessionId || 'default-session'
    );
  },

  async handleAgentList(args: any) {
    return agentsHandler.listAgents(args.sessionId || 'default-session');
  },

  async handleAgentStatus(args: any) {
    const agents = await agentsHandler.listAgents(args.projectId);
    const agent = agents.find(a => a.id === args.agentId || a.name === args.agentId);
    return agent || { error: 'Agent not found' };
  },

  async handleTaskCreate(args: any) {
    return agentsHandler.createTask(
      args.title,
      args.description,
      args.assignedAgent,
      args.sessionId || 'default-session',
      args.priority,
      args.dependencies
    );
  },

  async handleTaskList(args: any) {
    return agentsHandler.listTasks(
      args.sessionId || 'default-session',
      args.status,
      args.assignedAgent
    );
  },

  async handleTaskUpdate(args: any) {
    return agentsHandler.updateTaskStatus(
      args.taskId,
      args.status,
      args.assignedTo,
      args.metadata || {}
    );
  },

  async handleTaskDetails(args: any) {
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    
    const tasks = await agentsHandler.listTasks(projectId);
    const task = tasks.find(t => t.id === args.taskId);
    
    if (!task) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Task not found\n\n` +
                  `🆔 Task ID: ${args.taskId}\n` +
                  `📋 Project: ${projectId}\n\n` +
                  `💡 Use task_list to see available tasks`
          }
        ]
      };
    }

    const statusIcon = {
      todo: '⏰',
      in_progress: '🔄',
      blocked: '🚫',
      completed: '✅',
      cancelled: '❌'
    }[task.status] || '❓';

    const priorityIcon = {
      low: '🔵',
      medium: '🟡',
      high: '🔴',
      urgent: '🚨'
    }[task.priority] || '⚪';

    const assignedText = task.assignedTo ? `\n👤 Assigned: ${task.assignedTo}` : '\n👤 Assigned: (unassigned)';
    const createdByText = task.createdBy ? `\n🛠️  Created By: ${task.createdBy}` : '';
    const tagsText = task.tags.length > 0 ? `\n🏷️  Tags: [${task.tags.join(', ')}]` : '';
    const dependenciesText = task.dependencies.length > 0 ? `\n🔗 Dependencies: [${task.dependencies.join(', ')}]` : '';
    const descriptionText = task.description ? `\n\n📝 **Description:**\n${task.description}` : '\n\n📝 **Description:** (no description provided)';
    const startedText = task.startedAt ? `\n🚀 Started: ${task.startedAt.toISOString()}` : '';
    const completedText = task.completedAt ? `\n✅ Completed: ${task.completedAt.toISOString()}` : '';
    const metadataText = Object.keys(task.metadata).length > 0 ? `\n📊 Metadata: ${JSON.stringify(task.metadata, null, 2)}` : '';

    return {
      content: [
        {
          type: 'text',
          text: `📋 **Task Details** ${statusIcon} ${priorityIcon}\n\n` +
                `🆔 **ID:** ${task.id}\n` +
                `📌 **Title:** ${task.title}\n` +
                `🔖 **Type:** ${task.type}\n` +
                `📊 **Status:** ${task.status}\n` +
                `⚡ **Priority:** ${task.priority}${assignedText}${createdByText}${tagsText}${dependenciesText}${descriptionText}\n\n` +
                `⏰ **Created:** ${task.createdAt.toISOString()}\n` +
                `🔄 **Updated:** ${task.updatedAt.toISOString()}${startedText}${completedText}${metadataText}\n\n` +
                `💡 Update with: task_update(taskId="${task.id}", status="...", assignedTo="...")`
        }
      ]
    };
  },

  async handleAgentMessage(args: any) {
    return agentsHandler.sendMessage(
      args.fromAgent,
      args.toAgent,
      args.message,
      args.sessionId || 'default-session',
      args.messageType
    );
  },

  async handleAgentMessages(args: any) {
    return agentsHandler.getMessages(
      args.agentId,
      args.sessionId || 'default-session',
      args.limit
    );
  },

  async handleAgentJoin(args: any) {
    return agentsHandler.joinProject(
      args.agentId,
      args.sessionId,
      args.projectId || await projectHandler.getCurrentProjectId('default-session')
    );
  },

  async handleAgentLeave(args: any) {
    return agentsHandler.leaveProject(
      args.agentId,
      args.sessionId || 'default-session',
      args.projectId || await projectHandler.getCurrentProjectId('default-session')
    );
  },

  async handleAgentSessions(args: any) {
    return agentsHandler.getActiveAgentSessions(
      args.projectId || await projectHandler.getCurrentProjectId('default-session')
    );
  }
};
