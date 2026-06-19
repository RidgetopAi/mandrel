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

import { zodToJsonSchema } from 'zod-to-json-schema';
import { validationSchemas } from '../middleware/validation.js';

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
 * CLASS FIX (schema-drift keystone): generate the model-facing JSON inputSchema
 * DIRECTLY from the zod schema that actually gates the request in
 * middleware/validation.ts. The model can no longer be shown params the validator
 * silently drops (zod uses .parse(), not .strict(), so undeclared/divergent params
 * vanish without error). One source of truth → the two layers cannot diverge again.
 *
 * `humanDescriptions` lets us keep the friendly per-param help text (zod schemas
 * don't carry it). It is OVERLAY ONLY — it can never add/rename a param that zod
 * doesn't define, so it cannot reintroduce drift. A schema-match test asserts the
 * derived `properties` keyset == the zod keyset for every retrieval tool.
 */
function buildInputSchema(
  toolName: keyof typeof validationSchemas,
  humanDescriptions: Record<string, string> = {}
): ToolDefinition['inputSchema'] {
  const zodSchema = validationSchemas[toolName];
  // $refStrategy:'none' flattens .refine()/nested shapes to a plain object schema
  // with top-level `properties` (verified for the refined context_search schema).
  const json = zodToJsonSchema(zodSchema as any, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  }) as any;

  const properties: Record<string, any> = { ...(json.properties ?? {}) };

  // Overlay human-friendly descriptions onto params zod already defines.
  for (const [key, desc] of Object.entries(humanDescriptions)) {
    if (properties[key]) {
      properties[key] = { ...properties[key], description: desc };
    }
  }

  return {
    type: 'object',
    properties,
    required: Array.isArray(json.required) ? json.required : [],
    // Keep additionalProperties:true to match historical MCP behavior (tolerant
    // ingress); the zod validator remains the real gatekeeper for VALUES.
    additionalProperties: true,
  };
}

/**
 * Complete array of all AIDIS/Mandrel tool definitions
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
              properties: {},
              required: [],
              additionalProperties: true
            },
          },
          {
            name: 'mandrel_status',
            description: 'Get Mandrel server status and health information',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
              additionalProperties: true
            },
          },
          {
            name: 'mandrel_help',
            description: 'Display categorized list of all Mandrel tools',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
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
                  items: { type: 'string' },
                  description: 'Optional tags for categorization and filtering (e.g., ["bug-fix", "authentication"])'
                }
              },
              required: ['content', 'type'],
              additionalProperties: true
            },
          },
          {
            name: 'context_search',
            description: 'Search stored contexts using semantic similarity and filters, or fetch a specific context by ID. Provide at least one of: id, query, or a non-empty tags array (a tags-only call filters by tags).',
            inputSchema: buildInputSchema('context_search', {
              id: 'Context UUID for direct lookup (bypasses semantic search)',
              query: 'Search query using semantic similarity (optional if id or tags provided)',
              type: 'Filter by context type (code, decision, error, discussion, planning, completion, milestone, reflections, handoff, lessons)',
              tags: 'Filter by tags (e.g., ["ref:cp-gaps"]); a non-empty tags array enables a tags-only search with no query',
              limit: 'Maximum number of results to return (default 10)',
              minSimilarity: 'Minimum similarity threshold (0-100) to include a result',
              offset: 'Number of leading results to skip (pagination)',
              projectId: 'Project ID or name to scope the search (defaults to current project)',
              sessionId: 'Session ID to scope the search'
            }),
          },
          {
            name: 'context_get_recent',
            description: 'Get recent contexts in chronological order (newest first)',
            inputSchema: buildInputSchema('context_get_recent', {
              limit: 'Maximum number of recent contexts to return (default 5, max 20)',
              projectId: 'Project ID or name to scope the results (defaults to current project)'
            }),
          },
          {
            name: 'context_stats',
            description: 'Get context statistics for a project',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
              additionalProperties: true
            },
          },
          {
            name: 'project_list',
            description: 'List all available projects with statistics',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
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
                  description: 'Optional human-readable description of the project'
                },
                status: {
                  type: 'string',
                  enum: ['active', 'archived', 'completed', 'paused'],
                  description: 'Optional initial status (default: active)'
                },
                gitRepoUrl: {
                  type: 'string',
                  description: 'Optional git repository URL'
                },
                rootDirectory: {
                  type: 'string',
                  description: 'Optional root directory path'
                }
              },
              required: ['name'],
              additionalProperties: true
            },
          },
          {
            name: 'project_update',
            description: 'Update an existing project (name, description, and/or status) identified by id or name',
            inputSchema: {
              type: 'object',
              properties: {
                project: {
                  type: 'string',
                  description: 'Project ID or name to update'
                },
                name: {
                  type: 'string',
                  description: 'New project name (must be unique)'
                },
                description: {
                  type: 'string',
                  description: 'New description (pass empty string to clear)'
                },
                status: {
                  type: 'string',
                  enum: ['active', 'archived', 'completed', 'paused'],
                  description: 'New status'
                },
                gitRepoUrl: {
                  type: 'string',
                  description: 'New git repository URL'
                },
                rootDirectory: {
                  type: 'string',
                  description: 'New root directory path'
                }
              },
              required: ['project'],
              additionalProperties: true
            },
          },
          {
            name: 'project_delete',
            description: 'Delete a project (by id or name). DESTRUCTIVE: cascade-deletes all owned contexts, decisions, tasks, and sessions. Refuses non-empty projects unless confirm:true.',
            inputSchema: {
              type: 'object',
              properties: {
                project: {
                  type: 'string',
                  description: 'Project ID or name to delete'
                },
                confirm: {
                  type: 'boolean',
                  description: 'Must be true to delete a non-empty project (acknowledges cascade-deletion of all owned data). Default: false'
                }
              },
              required: ['project'],
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
              required: [],
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
                }
              },
              required: ['decisionType', 'title', 'description', 'rationale', 'impactLevel'],
              additionalProperties: true
            },
          },
          {
            name: 'decision_search',
            description: 'Search technical decisions with various filters',
            inputSchema: buildInputSchema('decision_search', {
              query: 'Search query (optional; omit for pure filter-based search)',
              decisionType: 'Filter by decision type (architecture, library, framework, pattern, api_design, database, deployment, security, performance, ui_ux, testing, tooling, process, naming_convention, code_style)',
              status: 'Filter by status (active, deprecated, superseded, under_review)',
              impactLevel: 'Filter by impact level (low, medium, high, critical)',
              component: 'Filter by affected component name',
              tags: 'Filter by tags',
              limit: 'Maximum number of results to return (default 10)',
              projectId: 'Project ID or name to scope the search (defaults to current project)',
              includeOutcome: 'Include recorded outcome/lessons in results'
            }),
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
              properties: {},
              required: [],
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
                }
              },
              required: ['title'],
              additionalProperties: true
            },
          },
          {
            name: 'task_list',
            description: 'List tasks with optional filtering',
            inputSchema: buildInputSchema('task_list', {
              status: 'Filter by status (todo, in_progress, completed, blocked)',
              priority: 'Filter by priority (low, medium, high, urgent)',
              assignedAgent: 'Filter by assigned agent (UUID)',
              limit: 'Maximum number of tasks to return (default 10)'
            }),
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
                }
              },
              required: ['taskId', 'status'],
              additionalProperties: true
            },
          },
          {
            name: 'task_details',
            description: 'Get detailed information for a specific task',
            inputSchema: buildInputSchema('task_details', {
              taskId: 'Task ID (UUID)',
              projectId: 'Project ID or name to scope the lookup (defaults to current project)'
            }),
          },
          {
            name: 'task_bulk_update',
            description: 'Update multiple tasks atomically with the same changes',
            inputSchema: {
              type: 'object',
              properties: {
                task_ids: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Task IDs to update'
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
              properties: {},
              required: [],
              additionalProperties: true
            }
          },
          {
            name: 'smart_search',
            description: 'Intelligent search across all project data sources',
            inputSchema: buildInputSchema('smart_search', {
              query: 'Search query',
              scope: 'Limit search to one source (contexts, decisions, naming, agents, tasks, code, all)',
              includeTypes: 'Restrict to specific result types',
              limit: 'Maximum number of results to return (default 10)',
              projectId: 'Project ID or name to scope the search (defaults to current project)'
            }),
          },
          {
            name: 'get_recommendations',
            description: 'Get AI-powered recommendations for development',
            inputSchema: buildInputSchema('get_recommendations', {
              context: 'What you are working on',
              type: 'Recommendation type (naming, implementation, architecture, testing)',
              projectId: 'Project ID or name to scope recommendations (defaults to current project)'
            }),
          },
          {
            name: 'project_insights',
            description: 'Get comprehensive project health and insights',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
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

