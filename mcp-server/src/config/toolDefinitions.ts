/**
 * AIDIS Tool Definitions
 *
 * Shared module containing all 41 AIDIS MCP tool definitions.
 * (8 session analytics tools migrated to REST API on 2025-10-05)
 * This module serves as the single source of truth for tool schemas
 * used by both the main MCP server and the HTTP bridge.
 *
 * Last Updated: 2025-10-05
 */

/**
 * Tool Definition Interface
 * Matches the MCP SDK Tool type structure
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

/**
 * Complete array of all 27 AIDIS tool definitions
 * Changes:
 * - 8 session analytics tools migrated to REST API (2025-10-05)
 * - 2 pattern detection tools removed (2025-10-24) - deprecated stub implementations
 * - 5 session MCP tools removed (2025-10-24) - auto-tracking replaces manual management
 * - 4 naming registry tools removed (2025-10-24) - replaced by dependency tracking
 */
export const AIDIS_TOOL_DEFINITIONS: ToolDefinition[] = [
          {
            name: 'mandrel_ping',
            description: 'Test connectivity to Mandrel server',
            inputSchema: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  description: 'Optional test message'
                }
              },
              additionalProperties: true
            },
          },
          {
            name: 'mandrel_status',
            description: 'Get Mandrel server status and health information',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: true
            },
          },
          {
            name: 'mandrel_help',
            description: 'Display categorized list of all Mandrel tools',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: true
            },
          },
          {
            name: 'mandrel_explain',
            description: 'Get detailed help for a specific Mandrel tool',
            inputSchema: {
              type: 'object',
              properties: {
                toolName: { type: 'string', description: 'Name of the tool to explain (e.g., "context_search", "project_list")' }
              },
              required: ['toolName']
            },
          },
          {
            name: 'mandrel_examples',
            description: 'Get usage examples and patterns for a specific Mandrel tool',
            inputSchema: {
              type: 'object',
              properties: {
                toolName: { type: 'string', description: 'Name of the tool to get examples for (e.g., "context_search", "project_create")' }
              },
              required: ['toolName']
            },
          },
          {
            name: 'context_store',
            description: 'Store development context with automatic embedding generation for semantic search',
            inputSchema: {
              type: 'object',
              properties: {
                content: {
                  type: 'string',
                  description: 'The context content to store'
                },
                type: {
                  type: 'string',
                  description: 'Context type: code, decision, error, discussion, planning, completion, milestone, reflections, handoff'
                },
                tags: {
                  type: 'array',
                  description: 'Optional tags for categorization'
                },
                relevanceScore: {
                  type: 'number',
                  description: 'Relevance score 0-10'
                },
                metadata: {
                  type: 'object',
                  description: 'Optional metadata key-value pairs'
                },
                projectId: {
                  type: 'string',
                  description: 'Optional project ID'
                },
                sessionId: {
                  type: 'string',
                  description: 'Optional session ID'
                }
              },
              required: ['content', 'type'],
              additionalProperties: true
            },
          },
          {
            name: 'context_search',
            description: 'Search stored contexts using semantic similarity and filters',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query using semantic similarity'
                },
                type: {
                  type: 'string',
                  description: 'Filter by context type: code, decision, error, discussion, planning, completion, milestone, reflections, handoff'
                },
                tags: {
                  type: 'array',
                  description: 'Filter by tags'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum results, 1-50'
                },
                minSimilarity: {
                  type: 'number',
                  description: 'Minimum similarity percentage 0-100'
                },
                projectId: {
                  type: 'string',
                  description: 'Optional project ID filter'
                }
              },
              required: ['query'],
              additionalProperties: true
            },
          },
          {
            name: 'context_get_recent',
            description: 'Get recent contexts in chronological order (newest first)',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Maximum results, 1-20'
                },
                projectId: {
                  type: 'string',
                  description: 'Optional project ID'
                }
              },
              additionalProperties: true
            },
          },
          {
            name: 'context_stats',
            description: 'Get context statistics for a project',
            inputSchema: {
              type: 'object',
              properties: {
                projectId: {
                  type: 'string',
                  description: 'Optional project ID'
                }
              },
              additionalProperties: true
            },
          },
          {
            name: 'project_list',
            description: 'List all available projects with statistics',
            inputSchema: {
              type: 'object',
              properties: {
                includeStats: {
                  type: 'boolean',
                  description: 'Include context statistics'
                }
              },
              additionalProperties: true
            },
          },
          {
            name: 'project_create',
            description: 'Create a new project',
            inputSchema: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Unique project name'
                },
                description: {
                  type: 'string',
                  description: 'Project description'
                },
                gitRepoUrl: {
                  type: 'string',
                  description: 'Git repository URL'
                },
                rootDirectory: {
                  type: 'string',
                  description: 'Root directory path'
                },
                metadata: {
                  type: 'object',
                  description: 'Metadata key-value pairs'
                }
              },
              required: ['name'],
              additionalProperties: true
            },
          },
          {
            name: 'project_switch',
            description: 'Switch to a different project (sets it as current active project)',
            inputSchema: {
              type: 'object',
              properties: {
                project: {
                  type: 'string',
                  description: 'Project ID or name'
                }
              },
              required: ['project'],
              additionalProperties: true
            },
          },
          {
            name: 'project_current',
            description: 'Get the currently active project information',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: true
            },
          },
          {
            name: 'project_info',
            description: 'Get detailed information about a specific project',
            inputSchema: {
              type: 'object',
              properties: {
                project: {
                  type: 'string',
                  description: 'Project ID or name'
                }
              },
              required: ['project'],
              additionalProperties: true
            },
          },
          {
            name: 'decision_record',
            description: 'Record a technical decision with full context and alternatives',
            inputSchema: {
              type: 'object',
              properties: {
                decisionType: {
                  type: 'string',
                  description: 'Decision type: architecture, library, framework, pattern, api_design, database, deployment, security, performance, ui_ux, testing, tooling, process, naming_convention, code_style'
                },
                title: {
                  type: 'string',
                  description: 'Decision title'
                },
                description: {
                  type: 'string',
                  description: 'Detailed description'
                },
                rationale: {
                  type: 'string',
                  description: 'Why this decision was made'
                },
                impactLevel: {
                  type: 'string',
                  description: 'Impact: low, medium, high, critical'
                },
                alternativesConsidered: {
                  type: 'array',
                  description: 'Alternatives considered (array of objects with name, pros, cons, reasonRejected)'
                },
                problemStatement: {
                  type: 'string',
                  description: 'Problem being solved'
                },
                affectedComponents: {
                  type: 'array',
                  description: 'Affected components'
                },
                tags: {
                  type: 'array',
                  description: 'Categorization tags'
                },
                projectId: {
                  type: 'string',
                  description: 'Project ID'
                }
              },
              required: ['decisionType', 'title', 'description', 'rationale', 'impactLevel'],
              additionalProperties: true
            },
          },
          {
            name: 'decision_search',
            description: 'Search technical decisions with various filters',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query'
                },
                decisionType: {
                  type: 'string',
                  description: 'Filter by type: architecture, library, framework, pattern, api_design, database, deployment, security, performance, ui_ux, testing, tooling, process, naming_convention, code_style'
                },
                impactLevel: {
                  type: 'string',
                  description: 'Filter by impact: low, medium, high, critical'
                },
                component: {
                  type: 'string',
                  description: 'Find decisions affecting this component'
                },
                tags: {
                  type: 'array',
                  description: 'Filter by tags'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum results, 1-50'
                },
                projectId: {
                  type: 'string',
                  description: 'Project ID'
                }
              },
              additionalProperties: true
            },
          },
          {
            name: 'decision_update',
            description: 'Update decision status, outcomes, or lessons learned',
            inputSchema: {
              type: 'object',
              properties: {
                decisionId: {
                  type: 'string',
                  description: 'Decision ID to update'
                },
                outcomeStatus: {
                  type: 'string',
                  description: 'Outcome: unknown, successful, failed, mixed, too_early'
                },
                outcomeNotes: {
                  type: 'string',
                  description: 'Outcome notes'
                },
                lessonsLearned: {
                  type: 'string',
                  description: 'Lessons learned'
                }
              },
              required: ['decisionId'],
              additionalProperties: true
            },
          },
          {
            name: 'decision_stats',
            description: 'Get technical decision statistics and analysis',
            inputSchema: {
              type: 'object',
              properties: {
                projectId: {
                  type: 'string',
                  description: 'Project ID'
                }
              },
              additionalProperties: true
            },
          },



          {
            name: 'task_create',
            description: 'Create a new task for agent coordination',
            inputSchema: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description: 'Task title'
                },
                description: {
                  type: 'string',
                  description: 'Task description'
                },
                type: {
                  type: 'string',
                  description: 'Type: feature, bugfix, refactor, test, review, documentation'
                },
                priority: {
                  type: 'string',
                  description: 'Priority: low, medium, high, urgent'
                },
                assignedTo: {
                  type: 'string',
                  description: 'Agent ID to assign to'
                },
                tags: {
                  type: 'array',
                  description: 'Task tags'
                },
                dependencies: {
                  type: 'array',
                  description: 'Task IDs this depends on'
                },
                projectId: {
                  type: 'string',
                  description: 'Project ID'
                },
                metadata: {
                  type: 'object',
                  description: 'Additional metadata'
                }
              },
              required: ['title'],
              additionalProperties: true
            },
          },
          {
            name: 'task_list',
            description: 'List tasks with optional filtering',
            inputSchema: {
              type: 'object',
              properties: {
                projectId: {
                  type: 'string',
                  description: 'Project ID'
                },
                assignedTo: {
                  type: 'string',
                  description: 'Filter by agent ID'
                },
                status: {
                  type: 'string',
                  description: 'Filter by status: todo, in_progress, blocked, completed, cancelled'
                },
                statuses: {
                  type: 'array',
                  description: 'Filter by multiple statuses (takes precedence)'
                },
                type: {
                  type: 'string',
                  description: 'Filter by type'
                },
                tags: {
                  type: 'array',
                  description: 'Filter by tags (matches ANY)'
                },
                priority: {
                  type: 'string',
                  description: 'Filter by priority: low, medium, high, urgent'
                },
                phase: {
                  type: 'string',
                  description: 'Filter by phase'
                }
              },
              additionalProperties: true
            },
          },
          {
            name: 'task_update',
            description: 'Update task status and assignment',
            inputSchema: {
              type: 'object',
              properties: {
                taskId: {
                  type: 'string',
                  description: 'Task ID'
                },
                status: {
                  type: 'string',
                  description: 'New status: todo, in_progress, blocked, completed, cancelled'
                },
                assignedTo: {
                  type: 'string',
                  description: 'Agent ID to assign to'
                },
                metadata: {
                  type: 'object',
                  description: 'Additional metadata'
                }
              },
              required: ['taskId', 'status'],
              additionalProperties: true
            },
          },
          {
            name: 'task_details',
            description: 'Get detailed information for a specific task',
            inputSchema: {
              type: 'object',
              properties: {
                taskId: {
                  type: 'string',
                  description: 'Task ID'
                },
                projectId: {
                  type: 'string',
                  description: 'Project ID'
                }
              },
              required: ['taskId'],
              additionalProperties: true
            },
          },
          {
            name: 'task_bulk_update',
            description: 'Update multiple tasks atomically with the same changes',
            inputSchema: {
              type: 'object',
              properties: {
                task_ids: {
                  type: 'array',
                  description: 'Task IDs to update'
                },
                status: {
                  type: 'string',
                  description: 'New status: todo, in_progress, blocked, completed, cancelled'
                },
                assignedTo: {
                  type: 'string',
                  description: 'Agent ID to assign to'
                },
                priority: {
                  type: 'string',
                  description: 'New priority: low, medium, high, urgent'
                },
                metadata: {
                  type: 'object',
                  description: 'Additional metadata'
                },
                notes: {
                  type: 'string',
                  description: 'Notes to add'
                },
                projectId: {
                  type: 'string',
                  description: 'Project ID for validation'
                }
              },
              required: ['task_ids'],
              additionalProperties: true
            },
          },
          {
            name: 'task_progress_summary',
            description: 'Get task progress summary with grouping and completion percentages',
            inputSchema: {
              type: 'object',
              properties: {
                groupBy: {
                  type: 'string',
                  description: 'Group by: phase, status, priority, type, assignedTo'
                },
                projectId: {
                  type: 'string',
                  description: 'Project ID to analyze'
                }
              },
              additionalProperties: true
            }
          },
          {
            name: 'smart_search',
            description: 'Intelligent search across all project data sources',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query'
                },
                includeTypes: {
                  type: 'array',
                  description: 'Data sources: context, component, decision, naming, task, agent'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum results'
                },
                projectId: {
                  type: 'string',
                  description: 'Project ID'
                }
              },
              required: ['query'],
              additionalProperties: true
            },
          },
          {
            name: 'get_recommendations',
            description: 'Get AI-powered recommendations for development',
            inputSchema: {
              type: 'object',
              properties: {
                context: {
                  type: 'string',
                  description: 'What you are working on'
                },
                type: {
                  type: 'string',
                  description: 'Type: naming, implementation, architecture, testing'
                },
                projectId: {
                  type: 'string',
                  description: 'Project ID'
                }
              },
              required: ['context'],
              additionalProperties: true
            },
          },
          {
            name: 'project_insights',
            description: 'Get comprehensive project health and insights',
            inputSchema: {
              type: 'object',
              properties: {
                projectId: {
                  type: 'string',
                  description: 'Project ID'
                }
              },
              additionalProperties: true
            },
          },

        // Session Management Tools - DELETED (2025-10-24)
        // The following 5 MCP tools were removed because sessions auto-manage themselves:
        // - session_assign → Auto-tracking via ensureActiveSession()
        // - session_status → Auto-tracking via SessionTracker service
        // - session_new → Auto-tracking via ensureActiveSession()
        // - session_update → Not needed for auto-tracking
        // - session_details → Not needed for auto-tracking
        // SessionTracker service remains fully functional for auto-tracking.
        // AIDIS Command UI uses REST API endpoints at /api/v2/sessions/* for session analytics.

        // Session Analytics Tools - MIGRATED TO REST API (2025-10-05)
        // The following 8 tools have been migrated to REST API endpoints at /api/v2/sessions/*
        // - session_record_activity → POST /api/v2/sessions/:sessionId/activities
        // - session_get_activities → GET /api/v2/sessions/:sessionId/activities
        // - session_record_file_edit → POST /api/v2/sessions/:sessionId/files
        // - session_get_files → GET /api/v2/sessions/:sessionId/files
        // - session_calculate_productivity → POST /api/v2/sessions/:sessionId/productivity
        // - sessions_list → GET /api/v2/sessions
        // - sessions_stats → GET /api/v2/sessions/stats
        // - sessions_compare → GET /api/v2/sessions/compare
        // See: src/api/controllers/sessionAnalyticsController.ts

        // Pattern Detection Tools - REMOVED (2025-10-24)
        // TC013/TC017: Pattern detection system deprecated and removed
        // Reason: Most functionality stubbed out, only 1 of 4 pattern types worked
        // Database tables dropped via migration 033

        // TC014: Metrics tools - Never implemented, ghost code removed (2025-10-24)
];

