import { tasksHandler } from '../handlers/tasks.js';
import { projectHandler } from '../handlers/project.js';
import { formatMcpError } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';

/**
 * Task Management Routes
 * Handles: task_create, task_list, task_update, task_details, task_bulk_update, task_progress_summary
 */
class TasksRoutes {
  /**
   * Handle task creation requests
   */
  async handleCreate(args: any): Promise<McpResponse> {
    try {
      // Ensure session is initialized before getting project ID
      await projectHandler.initializeSession('default-session');
      const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');

      const task = await tasksHandler.createTask(
        projectId,
        args.title,
        args.description,
        args.type,
        args.priority,
        args.assignedTo,
        args.createdBy,
        args.tags,
        args.dependencies,
        args.metadata
      );

      // Activity tracking is already handled in tasksHandler.createTask()
      // Removed duplicate SessionTrackingMiddleware.trackTaskCreated() call

      const assignedText = task.assignedTo ? `\n🤖 Assigned To: ${task.assignedTo}` : '';
      const tagsText = task.tags.length > 0 ? `\n🏷️  Tags: [${task.tags.join(', ')}]` : '';
      const depsText = task.dependencies.length > 0 ? `\n⚡ Dependencies: [${task.dependencies.join(', ')}]` : '';

      return {
        content: [{
          type: 'text',
          text: `✅ Task created successfully!\n\n` +
                `📋 Title: ${task.title}\n` +
                `🎯 Type: ${task.type}\n` +
                `📊 Priority: ${task.priority}\n` +
                `📈 Status: ${task.status}${assignedText}${tagsText}${depsText}\n` +
                `⏰ Created: ${task.createdAt.toISOString().split('T')[0]}\n` +
                `🆔 ID: ${task.id}\n\n` +
                `🤝 Task is now available for agent coordination!`
        }],
      };
    } catch (error) {
      return formatMcpError(error as Error, 'task_create');
    }
  }

  /**
   * Handle task list requests
   */
  async handleList(args: any): Promise<McpResponse> {
    try {
      const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
      const tasks = await tasksHandler.listTasks(
        projectId,
        args.assignedTo,
        args.status,
        args.type,
        args.tags,
        args.priority,
        args.phase,
        args.statuses
      );

      if (tasks.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `📋 No tasks found for this project\n\n` +
                  `💡 Create tasks with: task_create`
          }],
        };
      }

      const taskList = tasks.map((task, index) => {
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

        const assignedText = task.assignedTo ? ` (assigned to ${task.assignedTo})` : ' (unassigned)';
        const tagsText = task.tags.length > 0 ? `\n      🏷️  Tags: [${task.tags.join(', ')}]` : '';

        return `   ${index + 1}. **${task.title}** ${statusIcon} ${priorityIcon}\n` +
               `      📝 Type: ${task.type}${assignedText}\n` +
               `      📊 Status: ${task.status} | Priority: ${task.priority}${tagsText}\n` +
               `      ⏰ Created: ${task.createdAt.toISOString().split('T')[0]}\n` +
               `      🆔 ID: ${task.id}`;
      }).join('\n\n');

      return {
        content: [{
          type: 'text',
          text: `📋 Project Tasks (${tasks.length})\n\n${taskList}\n\n` +
                `💡 Get full details: task_details(taskId="...")\n` +
                `🔄 Update tasks with: task_update\n` +
                `🤖 Assign to agents with: task_update`
        }],
      };
    } catch (error) {
      return formatMcpError(error as Error, 'task_list');
    }
  }

  /**
   * Handle task update requests
   */
  async handleUpdate(args: any): Promise<McpResponse> {
    try {
      await tasksHandler.updateTaskStatus(args.taskId, args.status, args.assignedTo, args.metadata);

      const taskStatusIconMap = {
        todo: '⏰',
        in_progress: '🔄',
        blocked: '🚫',
        completed: '✅',
        cancelled: '❌'
      } as const;
      const statusIcon = taskStatusIconMap[args.status as keyof typeof taskStatusIconMap] || '❓';

      const assignedText = args.assignedTo ? `\n🤖 Assigned To: ${args.assignedTo}` : '';

      return {
        content: [{
          type: 'text',
          text: `✅ Task updated successfully!\n\n` +
                `📋 Task: ${args.taskId}\n` +
                `📊 New Status: ${args.status} ${statusIcon}${assignedText}\n` +
                `⏰ Updated: ${new Date().toISOString().split('T')[0]}\n\n` +
                `🤝 Changes visible to all coordinating agents!`
        }],
      };
    } catch (error) {
      return formatMcpError(error as Error, 'task_update');
    }
  }

  /**
   * Handle bulk task update requests
   */
  async handleBulkUpdate(args: any): Promise<McpResponse> {
    try {
      const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');

      const result = await tasksHandler.bulkUpdateTasks(args.task_ids, {
        status: args.status,
        assignedTo: args.assignedTo,
        priority: args.priority,
        metadata: args.metadata,
        notes: args.notes,
        projectId: projectId
      });

      const taskBulkIconMap = {
        todo: '⏰',
        in_progress: '🔄',
        blocked: '🚫',
        completed: '✅',
        cancelled: '❌'
      } as const;
      const statusIcon = args.status ? (taskBulkIconMap[args.status as keyof typeof taskBulkIconMap] || '❓') : '';

      const updates = [];
      if (args.status) updates.push(`Status: ${args.status} ${statusIcon}`);
      if (args.assignedTo) updates.push(`Assigned To: ${args.assignedTo}`);
      if (args.priority) updates.push(`Priority: ${args.priority}`);
      if (args.notes) updates.push(`Notes: ${args.notes}`);
      if (args.metadata) updates.push(`Metadata: Updated`);

      const updatesText = updates.length > 0 ? `\n📊 Applied Updates:\n   ${updates.join('\n   ')}\n` : '';

      return {
        content: [{
          type: 'text',
          text: `✅ Bulk update completed successfully!\n\n` +
                `📊 **Results Summary:**\n` +
                `   • Total Requested: ${result.totalRequested}\n` +
                `   • Successfully Updated: ${result.successfullyUpdated}\n` +
                `   • Failed: ${result.failed}\n\n` +
                `🆔 **Updated Task IDs:**\n   ${result.updatedTaskIds.slice(0, 10).join('\n   ')}` +
                (result.updatedTaskIds.length > 10 ? `\n   ... and ${result.updatedTaskIds.length - 10} more` : '') +
                updatesText +
                `\n⏰ Updated: ${new Date().toISOString().split('T')[0]}\n\n` +
                `🤝 Changes visible to all coordinating agents!\n\n` +
                `💡 Use task_list to see updated tasks`
        }],
      };
    } catch (error) {
      const err = error as Error;
      return {
        content: [{
          type: 'text',
          text: `❌ Bulk update failed!\n\n` +
                `🚨 **Error:** ${err.message}\n\n` +
                `📊 **Request Details:**\n` +
                `   • Task Count: ${args.task_ids?.length || 0}\n` +
                `   • Task IDs: ${args.task_ids?.slice(0, 5).join(', ')}${args.task_ids?.length > 5 ? '...' : ''}\n\n` +
                `💡 Verify task IDs exist and belong to the project using task_list`
        }],
      };
    }
  }

  /**
   * Handle task progress summary requests
   */
  async handleProgressSummary(args: any): Promise<McpResponse> {
    try {
      const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
      const groupBy = args.groupBy || 'phase';

      const summary = await tasksHandler.getTaskProgressSummary(projectId, groupBy);

      // Format the response for human readability
      const overallStatus = `${summary.overallProgress.completed}/${summary.overallProgress.total} (${summary.overallProgress.percentage}%)`;

      let responseText = `📊 **Task Progress Summary**\n\n`;
      responseText += `**Overall Progress**: ${overallStatus} tasks completed\n`;
      responseText += `**Total Tasks**: ${summary.totalTasks}\n\n`;

      if (summary.groupedProgress.length > 0) {
        responseText += `**Progress by ${groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}**:\n\n`;

        summary.groupedProgress.forEach(group => {
          const progressIcon = group.completionPercentage === 100 ? '✅' :
                               group.completionPercentage >= 75 ? '🟢' :
                               group.completionPercentage >= 50 ? '🟡' :
                               group.completionPercentage >= 25 ? '🟠' : '🔴';

          const groupName = group.group === 'ungrouped' ? 'No Group' : group.group;
          responseText += `${progressIcon} **${groupName}**: ${group.completedTasks}/${group.totalTasks} (${group.completionPercentage}%)\n`;

          if (group.inProgressTasks > 0) {
            responseText += `   🔄 In Progress: ${group.inProgressTasks}\n`;
          }
          if (group.pendingTasks > 0) {
            responseText += `   ⏰ Pending: ${group.pendingTasks}\n`;
          }
          if (group.blockedTasks > 0) {
            responseText += `   🚫 Blocked: ${group.blockedTasks}\n`;
          }
          responseText += '\n';
        });
      } else {
        responseText += `No tasks found with valid ${groupBy} grouping.\n`;
      }

      responseText += `\n💡 **Usage**: \`task_progress_summary(groupBy="phase|status|priority|type|assignedTo")\``;

      return {
        content: [{
          type: "text",
          text: responseText
        }]
      };
    } catch (error) {
      const err = error as Error;
      return {
        content: [{
          type: "text",
          text: `❌ Progress summary failed!\n\n` +
                `🚨 **Error:** ${err.message}\n\n` +
                `💡 Try: task_progress_summary(groupBy="phase")`
        }]
      };
    }
  }

  /**
   * Handle task details requests
   */
  async handleDetails(args: any): Promise<McpResponse> {
    try {
      const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');

      // Get single task with full details
      const tasks = await tasksHandler.listTasks(projectId);
      const task = tasks.find(t => t.id === args.taskId);

      if (!task) {
        return {
          content: [{
            type: 'text',
            text: `❌ Task not found\n\n` +
                  `🆔 Task ID: ${args.taskId}\n` +
                  `📋 Project: ${projectId}\n\n` +
                  `💡 Use task_list to see available tasks`
          }]
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
        content: [{
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
        }]
      };
    } catch (error) {
      return formatMcpError(error as Error, 'task_details');
    }
  }
}

export const tasksRoutes = new TasksRoutes();
