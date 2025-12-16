/**
 * OpenAPI Configuration for AIDIS Backend API
 * Addresses QA Finding #1: Generate OpenAPI specification and client
 */

import swaggerJSDoc from 'swagger-jsdoc';

// OpenAPI configuration
const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AIDIS Command Backend API',
      version: '1.0.0',
      description: 'RESTful API for AIDIS Command Backend with MCP Bridge Integration',
      contact: {
        name: 'AIDIS Development Team',
        email: 'dev@aidis.local'
      }
    },
    servers: [
      {
        url: 'http://localhost:5000/api',
        description: 'Development server'
      },
      {
        url: 'http://localhost:5000/api',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        // Base response schemas
        ApiSuccessResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            data: {
              type: 'object',
              description: 'Response data payload'
            },
            correlationId: {
              type: 'string',
              format: 'uuid',
              description: 'Request correlation ID for tracking'
            },
            metadata: {
              type: 'object',
              properties: {
                timestamp: {
                  type: 'string',
                  format: 'date-time'
                },
                version: {
                  type: 'string',
                  example: '1.0.0'
                }
              }
            }
          },
          required: ['success', 'data']
        },
        ApiErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['validation', 'authentication', 'authorization', 'not_found', 'internal', 'business'],
                  description: 'Error type for client handling'
                },
                message: {
                  type: 'string',
                  description: 'Human-readable error message'
                },
                details: {
                  type: 'object',
                  description: 'Additional error details (e.g., validation errors)'
                },
                code: {
                  type: 'string',
                  description: 'Machine-readable error code'
                }
              },
              required: ['type', 'message']
            },
            correlationId: {
              type: 'string',
              format: 'uuid'
            }
          },
          required: ['success', 'error']
        },

        // Entity schemas from validation
        BaseEntity: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique identifier'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Creation timestamp'
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp'
            }
          },
          required: ['id', 'created_at', 'updated_at']
        },

        ProjectEntity: {
          allOf: [
            { $ref: '#/components/schemas/BaseEntity' },
            {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  minLength: 2,
                  maxLength: 100,
                  description: 'Project name'
                },
                description: {
                  type: 'string',
                  maxLength: 500,
                  description: 'Project description'
                },
                status: {
                  type: 'string',
                  enum: ['active', 'inactive', 'archived'],
                  description: 'Project status'
                },
                git_repo_url: {
                  type: 'string',
                  format: 'uri',
                  description: 'Git repository URL'
                },
                root_directory: {
                  type: 'string',
                  maxLength: 255,
                  description: 'Project root directory path'
                },
                metadata: {
                  type: 'object',
                  additionalProperties: true,
                  description: 'Additional project metadata'
                },
                context_count: {
                  type: 'integer',
                  description: 'Number of contexts associated with the project'
                },
                session_count: {
                  type: 'integer',
                  description: 'Number of sessions associated with the project'
                },
                last_activity: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Timestamp of the last recorded activity'
                }
              },
              required: ['name', 'status']
            }
          ]
        },

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

        // Input schemas for create/update operations
        CreateProjectRequest: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              minLength: 2,
              maxLength: 100,
              description: 'Project name'
            },
            description: {
              type: 'string',
              maxLength: 500,
              description: 'Project description'
            },
            git_repo_url: {
              type: 'string',
              format: 'uri',
              description: 'Git repository URL'
            },
            root_directory: {
              type: 'string',
              maxLength: 255,
              description: 'Project root directory path'
            },
            metadata: {
              type: 'object',
              additionalProperties: true,
              description: 'Additional project metadata'
            }
          },
          required: ['name']
        },

        UpdateProjectRequest: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              minLength: 2,
              maxLength: 100,
              description: 'Project name'
            },
            description: {
              type: 'string',
              maxLength: 500,
              description: 'Project description'
            },
            status: {
              type: 'string',
              enum: ['active', 'inactive', 'archived'],
              description: 'Project status'
            },
            git_repo_url: {
              type: 'string',
              format: 'uri',
              description: 'Git repository URL'
            },
            root_directory: {
              type: 'string',
              maxLength: 255,
              description: 'Project root directory path'
            },
            metadata: {
              type: 'object',
              additionalProperties: true,
              description: 'Additional project metadata'
            }
          }
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
        },

        // MCP Bridge schemas
        McpToolCall: {
          type: 'object',
          properties: {
            toolName: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
              description: 'Name of the MCP tool to call'
            },
            arguments: {
              type: 'object',
              additionalProperties: true,
              description: 'Arguments to pass to the MCP tool'
            }
          },
          required: ['toolName']
        },

        McpToolResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Whether the tool call succeeded'
            },
            result: {
              type: 'object',
              description: 'Tool execution result'
            },
            error: {
              type: 'string',
              description: 'Error message if call failed'
            }
          },
          required: ['success']
        },

        // Pagination schemas
        PaginationQuery: {
          type: 'object',
          properties: {
            page: {
              type: 'integer',
              minimum: 1,
              default: 1,
              description: 'Page number'
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 20,
              description: 'Items per page'
            },
            sortBy: {
              type: 'string',
              description: 'Field to sort by'
            },
            sortOrder: {
              type: 'string',
              enum: ['asc', 'desc'],
              default: 'asc',
              description: 'Sort order'
            }
          }
        },

        PaginatedResponse: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object'
              },
              description: 'Array of items'
            },
            pagination: {
              type: 'object',
              properties: {
                page: {
                  type: 'integer',
                  description: 'Current page number'
                },
                limit: {
                  type: 'integer',
                  description: 'Items per page'
                },
                total: {
                  type: 'integer',
                  description: 'Total number of items'
                },
                totalPages: {
                  type: 'integer',
                  description: 'Total number of pages'
                },
                hasNext: {
                  type: 'boolean',
                  description: 'Whether there is a next page'
                },
                hasPrev: {
                  type: 'boolean',
                  description: 'Whether there is a previous page'
                }
              },
              required: ['page', 'limit', 'total', 'totalPages', 'hasNext', 'hasPrev']
            }
          },
          required: ['items', 'pagination']
        },

        // Context schemas
        ContextEntity: {
          allOf: [
            { $ref: '#/components/schemas/BaseEntity' },
            {
              type: 'object',
              properties: {
                content: {
                  type: 'string',
                  description: 'Context body content'
                },
                type: {
                  type: 'string',
                  enum: ['code', 'decision', 'research', 'issue', 'note', 'error', 'test'],
                  description: 'Context classification'
                },
                tags: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description: 'Associated tags'
                },
                metadata: {
                  type: 'object',
                  additionalProperties: true,
                  description: 'Arbitrary metadata payload'
                },
                session_id: {
                  type: 'string',
                  format: 'uuid',
                  description: 'Linked session identifier'
                },
                project_id: {
                  type: 'string',
                  format: 'uuid',
                  description: 'Associated project identifier'
                },
                relevance_score: {
                  type: 'number',
                  description: 'Semantic similarity score when applicable'
                }
              },
              required: ['content', 'type']
            }
          ]
        },
        UpdateContext: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              minLength: 1,
              maxLength: 10000,
              description: 'Updated context content'
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Updated tag list'
            },
            metadata: {
              type: 'object',
              additionalProperties: true,
              description: 'Updated metadata payload'
            },
            relevance_score: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Updated relevance score'
            }
          }
        },
        ContextSearchResponse: {
          type: 'object',
          properties: {
            contexts: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/ContextEntity'
              }
            },
            total: {
              type: 'integer'
            },
            limit: {
              type: 'integer'
            },
            offset: {
              type: 'integer'
            }
          },
          required: ['contexts', 'total']
        },
        ContextStats: {
          type: 'object',
          properties: {
            total_contexts: { type: 'integer' },
            contexts_last_24h: { type: 'integer' },
            contexts_by_type: {
              type: 'object',
              additionalProperties: { type: 'integer' }
            }
          }
        },
        ContextBulkDelete: {
          type: 'object',
          properties: {
            ids: {
              type: 'array',
              items: {
                type: 'string',
                format: 'uuid'
              },
              minItems: 1
            }
          },
          required: ['ids']
        },

        // Decision schemas
        DecisionEntity: {
          allOf: [
            { $ref: '#/components/schemas/BaseEntity' },
            {
              type: 'object',
              properties: {
                title: { type: 'string' },
                problem: { type: 'string' },
                decision: { type: 'string' },
                rationale: { type: 'string' },
                alternatives: {
                  type: 'array',
                  items: { type: 'string' }
                },
                status: {
                  type: 'string',
                  enum: ['active', 'under_review', 'superseded', 'deprecated']
                },
                outcomeStatus: {
                  type: 'string',
                  enum: ['unknown', 'successful', 'failed', 'mixed', 'too_early'],
                  description: 'Lifecycle outcome assessment'
                },
                outcomeNotes: { type: 'string' },
                lessonsLearned: { type: 'string' },
                supersededBy: { type: 'string' },
                supersededReason: { type: 'string' },
                outcome: { type: 'string' },
                lessons: { type: 'string' },
                tags: {
                  type: 'array',
                  items: { type: 'string' }
                },
                project_id: {
                  type: 'string',
                  format: 'uuid'
                },
                project_name: { type: 'string' },
                created_by: { type: 'string' },
                updated_by: { type: 'string' }
              },
              required: ['title', 'problem', 'decision', 'status']
            }
          ]
        },
        DecisionSearchResponse: {
          type: 'object',
          properties: {
            decisions: {
              type: 'array',
              items: { $ref: '#/components/schemas/DecisionEntity' }
            },
            total: { type: 'integer' },
            limit: { type: 'integer' },
            page: { type: 'integer' }
          },
          required: ['decisions', 'total']
        },
        DecisionStats: {
          type: 'object',
          properties: {
            total_decisions: { type: 'integer' },
            by_status: {
              type: 'object',
              additionalProperties: { type: 'integer' }
            },
            by_project: {
              type: 'object',
              additionalProperties: { type: 'integer' }
            },
            recent_decisions: { type: 'integer' },
            total_projects: { type: 'integer' }
          }
        },
        CreateDecisionRequest: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 5, maxLength: 200 },
            problem: { type: 'string', minLength: 10, maxLength: 5000 },
            decision: { type: 'string', minLength: 10, maxLength: 5000 },
            rationale: { type: 'string', maxLength: 5000 },
            alternatives: {
              type: 'array',
              items: { type: 'string' }
            },
            status: {
              type: 'string',
              enum: ['active', 'under_review', 'superseded', 'deprecated'],
              default: 'active'
            },
            tags: {
              type: 'array',
              items: { type: 'string' }
            }
          },
          required: ['title', 'problem', 'decision']
        },
        UpdateDecisionRequest: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            problem: { type: 'string' },
            decision: { type: 'string' },
            rationale: { type: 'string' },
            alternatives: {
              type: 'array',
              items: { type: 'string' }
            },
            status: {
              type: 'string',
              enum: ['active', 'under_review', 'superseded', 'deprecated']
            },
            outcomeStatus: {
              type: 'string',
              enum: ['unknown', 'successful', 'failed', 'mixed', 'too_early']
            },
            outcomeNotes: { type: 'string' },
            lessonsLearned: { type: 'string' },
            supersededReason: { type: 'string' },
            tags: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        },

        // Naming schemas
        NamingEntry: {
          allOf: [
            { $ref: '#/components/schemas/BaseEntity' },
            {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: {
                  type: 'string',
                  enum: ['variable', 'function', 'component', 'class', 'interface', 'module', 'file']
                },
                context: { type: 'string' },
                project_id: {
                  type: 'string',
                  format: 'uuid'
                },
                project_name: { type: 'string' },
                status: {
                  type: 'string',
                  enum: ['active', 'deprecated', 'conflicted', 'pending']
                },
                compliance_score: { type: 'number' },
                usage_count: { type: 'number' },
                created_by: { type: 'string' },
                updated_by: { type: 'string' }
              },
              required: ['name', 'type', 'status', 'compliance_score', 'usage_count']
            }
          ]
        },
        NamingSearchResponse: {
          type: 'object',
          properties: {
            entries: {
              type: 'array',
              items: { $ref: '#/components/schemas/NamingEntry' }
            },
            total: { type: 'integer' },
            limit: { type: 'integer' },
            page: { type: 'integer' }
          },
          required: ['entries', 'total']
        },
        RegisterNamingRequest: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 100 },
            type: {
              type: 'string',
              enum: ['variable', 'function', 'component', 'class', 'interface', 'module', 'file']
            },
            context: { type: 'string', maxLength: 1000 },
            project_id: {
              type: 'string',
              format: 'uuid'
            }
          },
          required: ['name', 'type']
        },
        UpdateNamingRequest: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['active', 'deprecated', 'conflicted', 'pending']
            },
            context: { type: 'string' }
          }
        },
        NamingStats: {
          type: 'object',
          properties: {
            total_names: { type: 'integer' },
            compliance: { type: 'number' },
            deprecated: { type: 'integer' },
            recent_activity: { type: 'integer' },
            by_type: {
              type: 'object',
              additionalProperties: { type: 'integer' }
            },
            by_status: {
              type: 'object',
              additionalProperties: { type: 'integer' }
            },
            by_project: {
              type: 'object',
              additionalProperties: { type: 'integer' }
            },
            total_projects: { type: 'integer' }
          }
        },
        NamingSuggestion: {
          type: 'object',
          properties: {
            suggested_name: { type: 'string' },
            confidence: { type: 'number' },
            reason: { type: 'string' },
            alternatives: {
              type: 'array',
              items: { type: 'string' }
            }
          },
          required: ['suggested_name', 'confidence']
        },
        NamingAvailabilityResponse: {
          type: 'object',
          properties: {
            available: { type: 'boolean' },
            message: { type: 'string' },
            conflicts: {
              type: 'array',
              items: { $ref: '#/components/schemas/NamingEntry' }
            }
          },
          required: ['available']
        },

        // Session schemas
        SessionEntity: {
          allOf: [
            { $ref: '#/components/schemas/BaseEntity' },
            {
              type: 'object',
              properties: {
                // Identification
                display_id: { type: 'string', description: 'Human-readable session ID' },

                // Project association
                project_id: { type: 'string', format: 'uuid' },
                project_name: { type: 'string' },

                // Basic info
                title: { type: 'string' },
                description: { type: 'string' },
                session_goal: { type: 'string' },
                tags: { type: 'array', items: { type: 'string' } },

                // Timestamps - CRITICAL FIELDS FOR ACTIVE/ENDED STATUS
                started_at: { type: 'string', format: 'date-time' },
                ended_at: { type: 'string', format: 'date-time', nullable: true, description: 'Session end time - null means active' },
                duration_minutes: { type: 'string', description: 'Decimal string of duration in minutes' },
                last_activity_at: { type: 'string', format: 'date-time' },
                last_context_at: { type: 'string', format: 'date-time' },

                // Status
                status: { type: 'string', description: 'Session status indicator' },
                session_type: { type: 'string' },
                agent_type: { type: 'string', description: 'Type of AI agent' },
                ai_model: { type: 'string', description: 'AI model used' },

                // File metrics
                lines_added: { type: 'integer' },
                lines_deleted: { type: 'integer' },
                lines_net: { type: 'integer' },
                files_modified_count: { type: 'integer' },

                // Task metrics
                tasks_created: { type: 'integer' },
                tasks_updated: { type: 'integer' },
                tasks_completed: { type: 'integer' },
                task_completion_rate: { type: 'string', description: 'Decimal string percentage' },

                // Context metrics
                contexts_created: { type: 'integer' },
                context_count: { type: 'integer' },

                // Token usage
                input_tokens: { type: 'string', description: 'Input tokens consumed' },
                output_tokens: { type: 'string', description: 'Output tokens generated' },
                total_tokens: { type: 'string', description: 'Total tokens (input + output)' },

                // Productivity
                productivity_score: { type: 'string', description: 'Decimal productivity score 0-100' },

                // Activity
                activity_count: { type: 'integer' },

                // Metadata
                metadata: { type: 'object', additionalProperties: true }
              }
            }
          ]
        },
        UpdateSession: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              maxLength: 255,
              description: 'Session title'
            },
            description: {
              type: 'string',
              maxLength: 2000,
              description: 'Session description'
            }
          }
        },
        SessionStats: {
          type: 'object',
          properties: {
            total_sessions: { type: 'integer' },
            active_sessions: { type: 'integer' },
            sessions_last_24h: { type: 'integer' }
          }
        },

        ProjectListResponse: {
          type: 'object',
          properties: {
            projects: {
              type: 'array',
              items: { $ref: '#/components/schemas/ProjectEntity' }
            },
            total: { type: 'integer' }
          },
          required: ['projects', 'total']
        },
        ProjectDetailResponse: {
          type: 'object',
          properties: {
            project: { $ref: '#/components/schemas/ProjectEntity' }
          },
          required: ['project']
        },
        ProjectSessionsResponse: {
          type: 'object',
          properties: {
            sessions: {
              type: 'array',
              items: { $ref: '#/components/schemas/SessionEntity' }
            },
            total: { type: 'integer' }
          },
          required: ['sessions', 'total']
        },
        ProjectStats: {
          type: 'object',
          properties: {
            total_projects: { type: 'integer' },
            active_projects: { type: 'integer' },
            total_contexts: { type: 'integer' },
            total_sessions: { type: 'integer' },
            contexts_by_type: {
              type: 'object',
              additionalProperties: { type: 'integer' }
            },
            recent_activity: {
              type: 'object',
              properties: {
                contexts_last_week: { type: 'integer' },
                sessions_last_week: { type: 'integer' }
              }
            }
          }
        },
        SessionListResponse: {
          type: 'object',
          properties: {
            sessions: {
              type: 'array',
              items: { $ref: '#/components/schemas/SessionEntity' }
            },
            total: { type: 'integer' }
          },
          required: ['sessions', 'total']
        },
        SessionDetail: {
          allOf: [
            { $ref: '#/components/schemas/SessionEntity' },
            {
              type: 'object',
              properties: {
                contexts: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      type: { type: 'string' },
                      content: { type: 'string' },
                      created_at: { type: 'string', format: 'date-time' },
                      tags: {
                        type: 'array',
                        items: { type: 'string' }
                      }
                    }
                  }
                },
                duration: { type: 'number' },
                metadata: {
                  type: 'object',
                  additionalProperties: true
                }
              }
            }
          ]
        },
        SessionDetailResponse: {
          type: 'object',
          properties: {
            session: { $ref: '#/components/schemas/SessionDetail' }
          },
          required: ['session']
        },
        SessionCurrentResponse: {
          type: 'object',
          properties: {
            session: {
              oneOf: [
                { $ref: '#/components/schemas/SessionDetail' },
                { type: 'null' }
              ]
            }
          },
          required: ['session']
        },
        SessionAssignmentResponse: {
          type: 'object',
          properties: {
            sessionId: { type: 'string' },
            projectName: { type: 'string' },
            message: { type: 'string' }
          },
          required: ['sessionId', 'projectName', 'message']
        },

        // Monitoring / Embedding schemas (generic payloads)
        MonitoringHealth: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['healthy', 'degraded', 'unhealthy']
            },
            timestamp: { type: 'number' },
            checks: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: {
                  status: {
                    type: 'string',
                    enum: ['healthy', 'degraded', 'unhealthy']
                  },
                  message: { type: 'string' },
                  responseTime: { type: 'number' }
                },
                required: ['status', 'message']
              }
            },
            summary: {
              type: 'object',
              properties: {
                totalChecks: { type: 'integer' },
                healthyChecks: { type: 'integer' }
              }
            }
          },
          required: ['status', 'timestamp', 'checks']
        },
        MonitoringMetrics: {
          type: 'object',
          properties: {
            timestamp: { type: 'number' },
            system: {
              type: 'object',
              properties: {
                uptime: { type: 'number' },
                memory: {
                  type: 'object',
                  properties: {
                    used: { type: 'number' },
                    free: { type: 'number' },
                    total: { type: 'number' },
                    percentage: { type: 'number' }
                  }
                },
                cpu: {
                  type: 'object',
                  properties: {
                    usage: { type: 'number' }
                  }
                },
                process: {
                  type: 'object',
                  properties: {
                    pid: { type: 'integer' },
                    uptime: { type: 'number' },
                    memoryUsage: {
                      type: 'object',
                      properties: {
                        rss: { type: 'number' },
                        heapUsed: { type: 'number' },
                        heapTotal: { type: 'number' },
                        external: { type: 'number' }
                      }
                    }
                  }
                }
              }
            },
            database: {
              type: 'object',
              properties: {
                status: {
                  type: 'string',
                  enum: ['healthy', 'degraded', 'unhealthy']
                },
                responseTime: { type: 'number' },
                activeConnections: { type: 'number' }
              }
            },
            api: {
              type: 'object',
              properties: {
                requestCount: { type: 'integer' },
                errorRate: { type: 'number' },
                averageResponseTime: { type: 'number' }
              }
            }
          },
          required: ['timestamp', 'system', 'database', 'api']
        },
        MonitoringTrends: {
          type: 'object',
          properties: {
            timestamp: { type: 'number' },
            windowMinutes: { type: 'number' },
            trends: {
              type: 'object',
              properties: {
                responseTime: {
                  type: 'array',
                  items: { type: 'number' }
                },
                errorRate: { type: 'number' },
                requestVolume: { type: 'number' }
              }
            }
          },
          required: ['timestamp', 'windowMinutes', 'trends']
        },
        MonitoringServiceStatus: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            port: { type: 'integer' },
            status: {
              type: 'string',
              enum: ['healthy', 'degraded', 'down']
            },
            responseTime: { type: 'number' },
            lastCheck: { type: 'string', format: 'date-time' },
            url: { type: 'string' },
            slaTarget: { type: 'number' },
            uptime: { type: 'number' },
            error: { type: 'string' }
          },
          required: ['name', 'port', 'status', 'responseTime', 'lastCheck', 'url', 'slaTarget']
        },
        MonitoringStats: {
          type: 'object',
          properties: {
            totalServices: { type: 'integer' },
            healthyServices: { type: 'integer' },
            degradedServices: { type: 'integer' },
            downServices: { type: 'integer' },
            averageResponseTime: { type: 'number' },
            slaCompliance: { type: 'number' },
            lastUpdate: { type: 'string', format: 'date-time' }
          }
        },
        MonitoringAlertRule: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            service: { type: 'string' },
            metric: { type: 'string' },
            threshold: { type: 'number' },
            operator: { type: 'string', enum: ['gt', 'lt', 'eq'] },
            severity: { type: 'string', enum: ['critical', 'warning', 'info'] },
            enabled: { type: 'boolean' },
            cooldown: { type: 'number' },
            lastTriggered: { type: 'string', format: 'date-time' }
          },
          required: ['id', 'service', 'metric', 'threshold', 'operator', 'severity', 'enabled', 'cooldown']
        },
        MonitoringAlert: {
          type: 'object',
          properties: {
            rule: { $ref: '#/components/schemas/MonitoringAlertRule' },
            timestamp: { type: 'string', format: 'date-time' },
            value: { type: 'number' }
          },
          required: ['rule', 'timestamp', 'value']
        },
        EmbeddingDataset: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            count: { type: 'integer' },
            dimensions: { type: 'integer' },
            created_at: { type: 'string', format: 'date-time' }
          },
          required: ['id', 'name', 'count']
        },
        EmbeddingProjectionPoint: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
            label: { type: 'string' },
            content: { type: 'string' },
            id: { type: 'string' }
          },
          required: ['x', 'y', 'label', 'content', 'id']
        },
        EmbeddingSimilarityMatrix: {
          type: 'object',
          properties: {
            matrix: {
              type: 'array',
              items: {
                type: 'array',
                items: { type: 'number' }
              }
            },
            labels: {
              type: 'array',
              items: { type: 'string' }
            },
            metadata: {
              type: 'object',
              properties: {
                rows: { type: 'integer' },
                cols: { type: 'integer' },
                datasetId: { type: 'string' }
              },
              required: ['rows', 'cols', 'datasetId']
            }
          },
          required: ['matrix', 'labels', 'metadata']
        },
        EmbeddingProjection: {
          type: 'object',
          properties: {
            points: {
              type: 'array',
              items: { $ref: '#/components/schemas/EmbeddingProjectionPoint' }
            },
            algorithm: { type: 'string' },
            varianceExplained: {
              type: 'array',
              items: { type: 'number' }
            }
          },
          required: ['points', 'algorithm']
        },
        EmbeddingClusterPoint: {
          allOf: [
            { $ref: '#/components/schemas/EmbeddingProjectionPoint' },
            {
              type: 'object',
              properties: {
                cluster: { type: 'integer' }
              },
              required: ['cluster']
            }
          ]
        },
        EmbeddingClusterResult: {
          type: 'object',
          properties: {
            points: {
              type: 'array',
              items: { $ref: '#/components/schemas/EmbeddingClusterPoint' }
            },
            centroids: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                  cluster: { type: 'integer' }
                },
                required: ['x', 'y', 'cluster']
              }
            },
            k: { type: 'integer' },
            inertia: { type: 'number' }
          },
          required: ['points', 'centroids', 'k', 'inertia']
        },
        EmbeddingQualityMetrics: {
          type: 'object',
          properties: {
            totalEmbeddings: { type: 'integer' },
            averageNorm: { type: 'number' },
            dimensionality: { type: 'integer' },
            densityMetrics: {
              type: 'object',
              properties: {
                avgDistance: { type: 'number' },
                minDistance: { type: 'number' },
                maxDistance: { type: 'number' },
                stdDistance: { type: 'number' }
              },
              required: ['avgDistance', 'minDistance', 'maxDistance', 'stdDistance']
            },
            distributionStats: {
              type: 'object',
              properties: {
                mean: {
                  type: 'array',
                  items: { type: 'number' }
                },
                std: {
                  type: 'array',
                  items: { type: 'number' }
                },
                min: {
                  type: 'array',
                  items: { type: 'number' }
                },
                max: {
                  type: 'array',
                  items: { type: 'number' }
                }
              },
              required: ['mean', 'std', 'min', 'max']
            }
          },
          required: ['totalEmbeddings', 'averageNorm', 'dimensionality', 'densityMetrics', 'distributionStats']
        },
        EmbeddingRelevanceDistributionBucket: {
          type: 'object',
          properties: {
            range: { type: 'string' },
            count: { type: 'integer' },
            percentage: { type: 'number' }
          },
          required: ['range', 'count', 'percentage']
        },
        EmbeddingRelevanceTrendPoint: {
          type: 'object',
          properties: {
            date: { type: 'string', format: 'date' },
            averageScore: { type: 'number' },
            sampleSize: { type: 'integer' }
          },
          required: ['date', 'averageScore', 'sampleSize']
        },
        EmbeddingRelevanceTopTag: {
          type: 'object',
          properties: {
            tag: { type: 'string' },
            averageScore: { type: 'number' },
            count: { type: 'integer' }
          },
          required: ['tag', 'averageScore', 'count']
        },
        EmbeddingRelevanceMetrics: {
          type: 'object',
          properties: {
            totalContexts: { type: 'integer' },
            scoredContexts: { type: 'integer' },
            unscoredContexts: { type: 'integer' },
            coverageRate: { type: 'number' },
            averageScore: { type: 'number' },
            medianScore: { type: 'number' },
            minScore: { type: 'number' },
            maxScore: { type: 'number' },
            highConfidenceRate: { type: 'number' },
            lowConfidenceRate: { type: 'number' },
            distribution: {
              type: 'array',
              items: { $ref: '#/components/schemas/EmbeddingRelevanceDistributionBucket' }
            },
            trend: {
              type: 'array',
              items: { $ref: '#/components/schemas/EmbeddingRelevanceTrendPoint' }
            },
            topTags: {
              type: 'array',
              items: { $ref: '#/components/schemas/EmbeddingRelevanceTopTag' }
            }
          },
          required: [
            'totalContexts',
            'scoredContexts',
            'unscoredContexts',
            'coverageRate',
            'averageScore',
            'medianScore',
            'minScore',
            'maxScore',
            'highConfidenceRate',
            'lowConfidenceRate',
            'distribution',
            'trend',
            'topTags'
          ]
        },
        EmbeddingProjectNode: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid' },
            projectName: { type: 'string' },
            contextCount: { type: 'integer' },
            tagCount: { type: 'integer' },
            sharedTagCount: { type: 'integer' },
            sharedTagStrength: { type: 'number' }
          },
          required: ['projectId', 'projectName', 'contextCount', 'tagCount']
        },
        EmbeddingProjectEdge: {
          type: 'object',
          properties: {
            sourceProjectId: { type: 'string', format: 'uuid' },
            targetProjectId: { type: 'string', format: 'uuid' },
            sharedTagCount: { type: 'integer' },
            sharedTagStrength: { type: 'number' },
            topTags: {
              type: 'array',
              items: { type: 'string' }
            }
          },
          required: ['sourceProjectId', 'targetProjectId', 'sharedTagCount', 'sharedTagStrength', 'topTags']
        },
        EmbeddingProjectSummary: {
          type: 'object',
          properties: {
            totalRelatedProjects: { type: 'integer' },
            totalSharedTagStrength: { type: 'number' },
            totalSharedTagCount: { type: 'integer' }
          },
          required: ['totalRelatedProjects', 'totalSharedTagStrength', 'totalSharedTagCount']
        },
        EmbeddingProjectRelationships: {
          type: 'object',
          properties: {
            focusProject: { $ref: '#/components/schemas/EmbeddingProjectNode' },
            relatedProjects: {
              type: 'array',
              items: { $ref: '#/components/schemas/EmbeddingProjectNode' }
            },
            edges: {
              type: 'array',
              items: { $ref: '#/components/schemas/EmbeddingProjectEdge' }
            },
            summary: { $ref: '#/components/schemas/EmbeddingProjectSummary' }
          },
          required: ['focusProject', 'relatedProjects', 'edges', 'summary']
        },
        EmbeddingKnowledgeGapMissingTag: {
          type: 'object',
          properties: {
            tag: { type: 'string' },
            totalCount: { type: 'integer' },
            projectCount: { type: 'integer' },
            lastUsed: { type: 'string', format: 'date-time' },
            topProjects: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  projectId: { type: 'string', format: 'uuid', nullable: true },
                  projectName: { type: 'string' },
                  count: { type: 'integer' }
                },
                required: ['projectName', 'count']
              }
            }
          },
          required: ['tag', 'totalCount', 'projectCount', 'topProjects']
        },
        EmbeddingKnowledgeGapStaleTag: {
          type: 'object',
          properties: {
            tag: { type: 'string' },
            lastUsed: { type: 'string', format: 'date-time' },
            daysSinceLastUsed: { type: 'number' },
            totalCount: { type: 'integer' }
          },
          required: ['tag', 'daysSinceLastUsed', 'totalCount']
        },
        EmbeddingKnowledgeGapTypeInsight: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            totalCount: { type: 'number' },
            globalProjectCount: { type: 'number' },
            averagePerProject: { type: 'number' },
            projectCount: { type: 'number' },
            gap: { type: 'number' }
          },
          required: ['type', 'totalCount', 'globalProjectCount', 'averagePerProject', 'projectCount', 'gap']
        },
        EmbeddingKnowledgeGapSummary: {
          type: 'object',
          properties: {
            projectContextCount: { type: 'integer' },
            projectTagCount: { type: 'integer' },
            missingTagCount: { type: 'integer' },
            staleTagCount: { type: 'integer' },
            lastContextAt: { type: 'string', format: 'date-time', nullable: true }
          },
          required: ['projectContextCount', 'projectTagCount', 'missingTagCount', 'staleTagCount']
        },
        EmbeddingKnowledgeGaps: {
          type: 'object',
          properties: {
            missingTags: {
              type: 'array',
              items: { $ref: '#/components/schemas/EmbeddingKnowledgeGapMissingTag' }
            },
            staleTags: {
              type: 'array',
              items: { $ref: '#/components/schemas/EmbeddingKnowledgeGapStaleTag' }
            },
            underrepresentedTypes: {
              type: 'array',
              items: { $ref: '#/components/schemas/EmbeddingKnowledgeGapTypeInsight' }
            },
            summary: { $ref: '#/components/schemas/EmbeddingKnowledgeGapSummary' }
          },
          required: ['missingTags', 'staleTags', 'underrepresentedTypes', 'summary']
        },
        EmbeddingUsagePatterns: {
          type: 'object',
          properties: {
            dailyActivity: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string', format: 'date' },
                  contexts: { type: 'integer' }
                },
                required: ['date', 'contexts']
              }
            },
            contextsByType: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  count: { type: 'integer' },
                  percentage: { type: 'number' }
                },
                required: ['type', 'count', 'percentage']
              }
            },
            topTags: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  tag: { type: 'string' },
                  count: { type: 'integer' }
                },
                required: ['tag', 'count']
              }
            },
            hourlyDistribution: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  hour: { type: 'integer' },
                  contexts: { type: 'integer' }
                },
                required: ['hour', 'contexts']
              }
            },
            summary: {
              type: 'object',
              properties: {
                contextsLast7Days: { type: 'integer' },
                contextsLast30Days: { type: 'integer' },
                uniqueTags: { type: 'integer' },
                totalContexts: { type: 'integer' },
                lastContextAt: { type: 'string', format: 'date-time', nullable: true }
              },
              required: ['contextsLast7Days', 'contextsLast30Days', 'uniqueTags', 'totalContexts']
            }
          },
          required: ['dailyActivity', 'contextsByType', 'topTags', 'hourlyDistribution', 'summary']
        }
      }
    },
    security: [
      {
        BearerAuth: []
      }
    ],
    tags: [
      {
        name: 'Projects',
        description: 'Project management operations'
      },
      {
        name: 'Tasks',
        description: 'Task management operations'
      },
      {
        name: 'MCP Bridge',
        description: 'Model Context Protocol bridge operations'
      },
      {
        name: 'Health',
        description: 'System health and monitoring'
      },
      {
        name: 'Validation',
        description: 'Schema validation and testing'
      },
      {
        name: 'Contexts',
        description: 'Knowledge context management'
      },
      {
        name: 'Decisions',
        description: 'Technical decision tracking'
      },
      {
        name: 'Naming',
        description: 'Naming registry and governance'
      },
      {
        name: 'Sessions',
        description: 'Session analytics and history'
      },
      {
        name: 'Monitoring',
        description: 'Operational monitoring endpoints'
      },
      {
        name: 'Embeddings',
        description: 'Embedding analytics endpoints'
      }
    ]
  },
  apis: [
    './src/routes/*.ts' // Path to the API routes
  ]
};

export const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;
