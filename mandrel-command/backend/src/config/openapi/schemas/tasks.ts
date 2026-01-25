/**
 * Task OpenAPI Schemas
 */

export const taskSchemas = {
  TaskEntity: {
    allOf: [
      { $ref: '#/components/schemas/BaseEntity' },
      {
        type: 'object',
        properties: {
          project_id: {
            type: 'string',
            format: 'uuid',
            description: 'Associated project ID'
          },
          title: {
            type: 'string',
            minLength: 2,
            maxLength: 500,
            description: 'Task title'
          },
          description: {
            type: 'string',
            maxLength: 2000,
            description: 'Task description'
          },
          type: {
            type: 'string',
            enum: ['general', 'feature', 'bug', 'refactor', 'test', 'docs', 'devops'],
            description: 'Task type'
          },
          status: {
            type: 'string',
            enum: ['pending', 'in_progress', 'completed', 'blocked', 'cancelled'],
            description: 'Task status'
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'urgent'],
            description: 'Task priority'
          },
          assigned_to: {
            type: 'string',
            maxLength: 100,
            description: 'Assignee'
          },
          tags: {
            type: 'array',
            items: {
              type: 'string',
              minLength: 1,
              maxLength: 50
            },
            maxItems: 10,
            description: 'Task tags'
          },
          due_date: {
            type: 'string',
            format: 'date-time',
            description: 'Task due date'
          },
          estimated_hours: {
            type: 'number',
            minimum: 0,
            description: 'Estimated hours to complete'
          },
          actual_hours: {
            type: 'number',
            minimum: 0,
            description: 'Actual hours spent'
          }
        },
        required: ['project_id', 'title', 'type', 'status', 'priority']
      }
    ]
  },

  CreateTaskRequest: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        minLength: 2,
        maxLength: 500,
        description: 'Task title'
      },
      description: {
        type: 'string',
        maxLength: 2000,
        description: 'Task description'
      },
      type: {
        type: 'string',
        enum: ['general', 'feature', 'bug', 'refactor', 'test', 'docs', 'devops'],
        default: 'general',
        description: 'Task type'
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'urgent'],
        description: 'Task priority'
      },
      assigned_to: {
        type: 'string',
        maxLength: 100,
        description: 'Assignee'
      },
      project_id: {
        type: 'string',
        format: 'uuid',
        description: 'Associated project ID'
      },
      tags: {
        type: 'array',
        items: {
          type: 'string',
          minLength: 1,
          maxLength: 50
        },
        maxItems: 10,
        description: 'Task tags'
      }
    },
    required: ['title', 'priority', 'project_id']
  },

  UpdateTaskRequest: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        minLength: 2,
        maxLength: 500,
        description: 'Task title'
      },
      description: {
        type: 'string',
        maxLength: 2000,
        description: 'Task description'
      },
      type: {
        type: 'string',
        enum: ['general', 'feature', 'bug', 'refactor', 'test', 'docs', 'devops'],
        description: 'Task type'
      },
      status: {
        type: 'string',
        enum: ['pending', 'in_progress', 'completed', 'blocked', 'cancelled'],
        description: 'Task status'
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'urgent'],
        description: 'Task priority'
      },
      assigned_to: {
        type: 'string',
        maxLength: 100,
        description: 'Assignee'
      },
      tags: {
        type: 'array',
        items: {
          type: 'string',
          minLength: 1,
          maxLength: 50
        },
        maxItems: 10,
        description: 'Task tags'
      }
    }
  }
};
