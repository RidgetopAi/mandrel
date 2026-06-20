import { tasksHandler } from '../handlers/tasks.js';
import { projectHandler } from '../handlers/project.js';
import { formatMcpError, rawValue } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';
import type { RouteContext } from './index.js';
import {
  resolveEntityId,
  AmbiguousIdError,
  IdNotFoundError,
  ambiguousIdMessage,
  idErrorResponse,
} from '../utils/idResolver.js';

/**
 * Task Management Routes
 * Handles: task_create, task_list, task_update, task_details, task_bulk_update, task_progress_summary
 */
class TasksRoutes {
  /**
   * Resolve project ID using connection-scoped session state
   */
  private async resolveProjectId(argsProjectId: string | undefined, context?: RouteContext): Promise<string> {
    if (argsProjectId) return argsProjectId;
    const sessionId = context?.connectionId || 'default-session';
    await projectHandler.initializeSession(sessionId);
    const projectId = await projectHandler.getCurrentProjectId(sessionId);
    if (!projectId) throw new Error('No current project set. Use project_switch to set an active project.');
    return projectId;
  }
  /**
   * Handle task creation requests
   */
  async handleCreate(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.resolveProjectId(args.projectId, context);

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
        args.metadata,
        context?.connectionId,
        args.status
      );

      // Activity tracking is already handled in tasksHandler.createTask()
      // Removed duplicate SessionTrackingMiddleware.trackTaskCreated() call

      return {
        content: [{
          type: 'text',
          // DUAL-CHANNEL: lean headline; full raw record in structuredContent.
          // Keeps stable markers ("Task created successfully", "Type:", "🆔 ID:").
          // VALUE-CLEANING (task 4b484c8f): task TITLE is a short DB identifier → rawValue()
          // so stored markup never prints literal `**`. task.description (below in
          // task_details) is long-form CONTENT and is intentionally left as markdown.
          text: `✅ Task created successfully! "${rawValue(task.title)}"\n` +
                `🎯 Type: ${task.type} | Priority: ${task.priority} | Status: ${task.status}\n` +
                `🆔 ID: ${task.id}`,
        }],
        structuredContent: {
          action: 'created',
          task: {
            id: task.id,
            title: task.title,
            type: task.type,
            status: task.status,
            priority: task.priority,
            assignedTo: task.assignedTo ?? null,
            tags: task.tags,
            dependencies: task.dependencies,
            createdAt: task.createdAt.toISOString(),
          },
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'task_create');
    }
  }

  /**
   * Handle task list requests
   */
  async handleList(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.resolveProjectId(args.projectId, context);
      const tasks = await tasksHandler.listTasks(
        projectId,
        args.assignedTo,
        args.status,
        args.type,
        args.tags,
        args.priority,
        args.phase,
        args.statuses,
        args.limit,
        args.offset, // A7: forward pagination offset to the handler
        args.includeArchived // task 7b28bed4: default false → exclude archived tasks
      );

      if (tasks.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `📋 No tasks found for this project\n\n` +
                  `💡 Create tasks with: task_create`
          }],
          structuredContent: { ok: true, results: [], total: 0 },
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

        return `   ${index + 1}. **${rawValue(task.title)}** ${statusIcon} ${priorityIcon}\n` +
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
        structuredContent: {
          results: tasks.map((task) => ({
            id: task.id,
            title: task.title,
            type: task.type,
            status: task.status,
            priority: task.priority,
            assignedTo: task.assignedTo ?? null,
            tags: task.tags,
            createdAt: task.createdAt.toISOString(),
          })),
          total: tasks.length,
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'task_list');
    }
  }

  /**
   * Handle task update requests
   */
  async handleUpdate(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      // SHORT-ID RESOLUTION (task 131ef054): resolve a full UUID or 8+-hex short id →
      // full UUID, SCOPED to this project (project-scoped table → a prefix can't collide
      // across projects), BEFORE we mutate. Ambiguous / unknown short ids are surfaced as
      // actionable errors and DO NOT mutate (resolution throws before the UPDATE runs).
      const projectId = await this.resolveProjectId(args.projectId, context);
      let resolvedId: string;
      try {
        resolvedId = await resolveEntityId('task', args.taskId, projectId);
      } catch (e) {
        if (e instanceof AmbiguousIdError) {
          return {
            content: [{ type: 'text', text: ambiguousIdMessage(e, 'task_update') }],
            isError: true,
            structuredContent: { ok: false, ambiguous: true,
              candidates: e.candidates.map(c => c.id) },
          };
        }
        if (e instanceof IdNotFoundError) {
          return {
            content: [{
              type: 'text',
              text: `❌ Task not found: ${args.taskId}\n\n` +
                    `💡 The id may be wrong. Use task_list to see this project's tasks and copy a 🆔 ID.`
            }],
            isError: true,
            structuredContent: { ok: false, found: false },
          };
        }
        throw e;
      }

      // A4: forward priority + progress (real columns) so they're actually written —
      // previously only status/assignedTo/metadata reached the handler, so a
      // priority/progress-only update returned success while writing nothing.
      await tasksHandler.updateTaskStatus(
        resolvedId,
        args.status,
        args.assignedTo,
        args.metadata,
        undefined, // connectionId (not threaded on this route today)
        args.priority,
        args.progress
      );

      const taskStatusIconMap = {
        todo: '⏰',
        in_progress: '🔄',
        blocked: '🚫',
        completed: '✅',
        cancelled: '❌'
      } as const;
      const statusIcon = args.status
        ? (taskStatusIconMap[args.status as keyof typeof taskStatusIconMap] || '❓')
        : '';

      // Build a summary of exactly the fields that were updated (status is now optional).
      const applied: string[] = [];
      if (args.status !== undefined) applied.push(`📊 New Status: ${args.status} ${statusIcon}`);
      if (args.priority !== undefined) applied.push(`⚡ Priority: ${args.priority}`);
      if (args.progress !== undefined) applied.push(`📈 Progress: ${args.progress}%`);
      if (args.assignedTo !== undefined) applied.push(`🤖 Assigned To: ${args.assignedTo}`);
      const appliedText = applied.length > 0 ? `\n${applied.join('\n')}` : '';

      // Structured record of exactly what was applied (RAW values, no markup). Report the
      // RESOLVED full id (not the short input) so the displayed id is unambiguous to copy.
      const appliedFields: Record<string, any> = { id: resolvedId };
      if (args.status !== undefined) appliedFields.status = args.status;
      if (args.priority !== undefined) appliedFields.priority = args.priority;
      if (args.progress !== undefined) appliedFields.progress = args.progress;
      if (args.assignedTo !== undefined) appliedFields.assignedTo = args.assignedTo;

      return {
        content: [{
          type: 'text',
          text: `✅ Task updated successfully! ${resolvedId}${appliedText}`,
        }],
        structuredContent: {
          action: 'updated',
          task: appliedFields,
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'task_update');
    }
  }

  /**
   * Handle bulk task update requests
   */
  async handleBulkUpdate(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.resolveProjectId(args.projectId, context);

      // SHORT-ID RESOLUTION (task 131ef054): resolve every id (full UUID or 8+-hex short
      // id) → full UUID, SCOPED to this project, BEFORE the atomic bulk update. Any
      // ambiguous / unknown id aborts the whole op (consistent with bulk's all-or-nothing
      // transaction) with an actionable error — nothing is mutated.
      const resolvedIds: string[] = [];
      try {
        for (const rawId of args.task_ids) {
          resolvedIds.push(await resolveEntityId('task', rawId, projectId));
        }
      } catch (e) {
        if (e instanceof AmbiguousIdError) {
          return {
            content: [{ type: 'text', text: ambiguousIdMessage(e, 'task_bulk_update') }],
            isError: true,
            structuredContent: { ok: false, ambiguous: true,
              candidates: e.candidates.map(c => c.id) },
          };
        }
        if (e instanceof IdNotFoundError) {
          return {
            content: [{
              type: 'text',
              text: `❌ Bulk update aborted: task not found "${e.shortId}"\n\n` +
                    `💡 The id may be wrong. Use task_list to see this project's tasks; nothing was changed.`
            }],
            isError: true,
            structuredContent: { ok: false, found: false },
          };
        }
        throw e;
      }

      const result = await tasksHandler.bulkUpdateTasks(resolvedIds, {
        status: args.status,
        assignedTo: args.assignedTo,
        priority: args.priority,
        metadata: args.metadata,
        notes: args.notes,
        projectId: projectId
      }, context?.connectionId);

      // RAW applied-fields object (no markup/icons) for the machine channel.
      const appliedUpdates: Record<string, any> = {};
      if (args.status) appliedUpdates.status = args.status;
      if (args.assignedTo) appliedUpdates.assignedTo = args.assignedTo;
      if (args.priority) appliedUpdates.priority = args.priority;
      if (args.notes) appliedUpdates.notes = args.notes;
      if (args.metadata) appliedUpdates.metadata = args.metadata;

      return {
        content: [{
          type: 'text',
          text: `✅ Bulk update: ${result.successfullyUpdated}/${result.totalRequested} updated` +
                (result.failed > 0 ? `, ${result.failed} failed` : ''),
        }],
        structuredContent: {
          totalRequested: result.totalRequested,
          successfullyUpdated: result.successfullyUpdated,
          failed: result.failed,
          appliedUpdates,
          updatedTaskIds: result.updatedTaskIds,
        },
      };
    } catch (error) {
      const err = error as Error;
      return {
        content: [{
          type: 'text',
          text: `❌ Bulk update failed: ${err.message}`,
        }],
        isError: true,
        structuredContent: {
          ok: false,
          error: err.message,
          requestedCount: args.task_ids?.length || 0,
        },
      };
    }
  }

  /**
   * Handle task progress summary requests
   */
  async handleProgressSummary(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.resolveProjectId(args.projectId, context);
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

          // groupName can be a free-text DB value when groupBy=phase → clean it (short
          // inline identifier, task 4b484c8f whole-class). Enum group keys pass through.
          const groupName = group.group === 'ungrouped' ? 'No Group' : rawValue(group.group);
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
        }],
        structuredContent: {
          totalTasks: summary.totalTasks,
          overallProgress: summary.overallProgress,
          groupBy,
          groupedProgress: summary.groupedProgress,
        },
      };
    } catch (error) {
      const err = error as Error;
      return {
        content: [{
          type: "text",
          text: `❌ Progress summary failed: ${err.message}`,
        }],
        isError: true,
        structuredContent: { ok: false, error: err.message },
      };
    }
  }

  /**
   * Handle task details requests
   */
  async handleDetails(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.resolveProjectId(args.projectId, context);

      // SHORT-ID RESOLUTION (task 131ef054): accept a full UUID or an 8+-hex short id and
      // resolve it → full UUID, SCOPED to this project so a prefix can't collide across
      // projects. Ambiguous prefix / unknown id surface as actionable errors below.
      let resolvedId: string;
      try {
        resolvedId = await resolveEntityId('task', args.taskId, projectId);
      } catch (e) {
        if (e instanceof AmbiguousIdError) {
          return {
            content: [{ type: 'text', text: ambiguousIdMessage(e, 'task_details') }],
            structuredContent: { ok: true, found: false, ambiguous: true,
              candidates: e.candidates.map(c => c.id) },
          };
        }
        if (e instanceof IdNotFoundError) {
          return {
            content: [{
              type: 'text',
              text: `❌ Task not found\n\n` +
                    `🆔 Task ID: ${args.taskId}\n` +
                    `📋 Project: ${projectId}\n\n` +
                    `💡 The id may be wrong. Use task_list to see this project's tasks and copy a 🆔 ID.`
            }],
            structuredContent: { ok: true, found: false },
          };
        }
        throw e;
      }

      // Get single task with full details
      const tasks = await tasksHandler.listTasks(projectId);
      const task = tasks.find(t => t.id === resolvedId);

      if (!task) {
        return {
          content: [{
            type: 'text',
            text: `❌ Task not found\n\n` +
                  `🆔 Task ID: ${args.taskId}\n` +
                  `📋 Project: ${projectId}\n\n` +
                  `💡 Use task_list to see available tasks`
          }],
          structuredContent: { ok: true, found: false },
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
                `📌 **Title:** ${rawValue(task.title)}\n` +
                `🔖 **Type:** ${task.type}\n` +
                `📊 **Status:** ${task.status}\n` +
                `⚡ **Priority:** ${task.priority}${assignedText}${createdByText}${tagsText}${dependenciesText}${descriptionText}\n\n` +
                `⏰ **Created:** ${task.createdAt.toISOString()}\n` +
                `🔄 **Updated:** ${task.updatedAt.toISOString()}${startedText}${completedText}${metadataText}\n\n` +
                `💡 Update with: task_update(taskId="${task.id}", status="...", assignedTo="...")`
        }],
        structuredContent: {
          found: true,
          task: {
            id: task.id,
            title: task.title,
            type: task.type,
            status: task.status,
            priority: task.priority,
            assignedTo: task.assignedTo ?? null,
            createdBy: task.createdBy ?? null,
            tags: task.tags,
            dependencies: task.dependencies,
            description: task.description ?? null,
            progress: (task as any).progress ?? null,
            metadata: task.metadata,
            createdAt: task.createdAt.toISOString(),
            updatedAt: task.updatedAt.toISOString(),
            startedAt: task.startedAt ? task.startedAt.toISOString() : null,
            completedAt: task.completedAt ? task.completedAt.toISOString() : null,
          },
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'task_details');
    }
  }

  /**
   * Handle task SOFT-DELETE (archive) requests — task_delete (task 7b28bed4).
   *
   * Sets archived_at on the row so it disappears from the DEFAULT task_list while STILL
   * EXISTING in the DB (reversible via task_restore). Accepts a full UUID or 8+-hex short
   * id, resolved project-scoped BEFORE the mutation; ambiguous / unknown ids surface as
   * actionable errors and mutate nothing. Idempotent (already-archived is a no-op).
   */
  async handleDelete(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.resolveProjectId(args.projectId, context);
      let resolvedId: string;
      try {
        resolvedId = await resolveEntityId('task', args.taskId, projectId);
      } catch (e) {
        const handled = idErrorResponse(e, 'task_delete', 'task', args.taskId, 'task_list');
        if (handled) return handled;
        throw e;
      }

      const result = await tasksHandler.archiveTask(resolvedId, projectId);
      if (!result.found) {
        return {
          content: [{ type: 'text',
            text: `❌ Task not found: ${args.taskId}\n\n` +
                  `💡 Use task_list to see this project's tasks and copy a 🆔 ID.` }],
          isError: true,
          structuredContent: { ok: false, found: false },
        };
      }
      const verb = result.alreadyArchived ? 'was already archived' : 'archived';
      return {
        content: [{ type: 'text',
          text: `🗑️  Task ${verb} (soft-delete) — ${result.id}\n` +
                `💡 It is hidden from task_list but NOT deleted. Restore with: task_restore(taskId="${result.id}")` }],
        structuredContent: {
          action: 'archived',
          task: { id: result.id, archivedAt: result.archivedAt },
          alreadyArchived: result.alreadyArchived === true,
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'task_delete');
    }
  }

  /**
   * Handle task RESTORE (un-archive) requests — task_restore (task 7b28bed4).
   * Clears archived_at so the task returns to default listings. Mirror of handleDelete.
   */
  async handleRestore(args: any, context?: RouteContext): Promise<McpResponse> {
    try {
      const projectId = await this.resolveProjectId(args.projectId, context);
      let resolvedId: string;
      try {
        // includeArchived semantics live in the resolver implicitly: it matches by id
        // regardless of archived state, so an archived task is resolvable for restore.
        resolvedId = await resolveEntityId('task', args.taskId, projectId);
      } catch (e) {
        const handled = idErrorResponse(e, 'task_restore', 'task', args.taskId, 'task_list');
        if (handled) return handled;
        throw e;
      }

      const result = await tasksHandler.restoreTask(resolvedId, projectId);
      if (!result.found) {
        return {
          content: [{ type: 'text',
            text: `❌ Task not found: ${args.taskId}\n\n` +
                  `💡 Use task_list(includeArchived:true) to see archived tasks and copy a 🆔 ID.` }],
          isError: true,
          structuredContent: { ok: false, found: false },
        };
      }
      const verb = result.alreadyArchived ? 'was already live (not archived)' : 'restored';
      return {
        content: [{ type: 'text',
          text: `♻️  Task ${verb} — ${result.id}` }],
        structuredContent: {
          action: 'restored',
          task: { id: result.id },
          alreadyArchived: result.alreadyArchived === true,
        },
      };
    } catch (error) {
      return formatMcpError(error as Error, 'task_restore');
    }
  }
}

export const tasksRoutes = new TasksRoutes();
