/**
 * AIDIS Tool Definitions
 *
 * Shared module containing all 41 AIDIS MCP tool definitions.
 * This module serves as the single source of truth for tool schemas
 * used by both the main MCP server and the HTTP bridge.
 *
 * Last Updated: 2025-10-01
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
 * Complete array of all 41 AIDIS tool definitions
 */
export const AIDIS_TOOL_DEFINITIONS: ToolDefinition[] = [
          {
            name: 'aidis_ping',
            description: 'Test connectivity to AIDIS server',
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
            name: 'aidis_status',
            description: 'Get AIDIS server status and health information',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: true
            },
          },
          {
            name: 'aidis_help',
            description: 'Display categorized list of all AIDIS tools',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: true
            },
          },
          {
            name: 'aidis_explain',
            description: 'Get detailed help for a specific AIDIS tool',
            inputSchema: {
              type: 'object',
              properties: {
                toolName: { type: 'string', description: 'Name of the tool to explain (e.g., "context_search", "project_list")' }
              },
              required: ['toolName']
            },
          },
          {
            name: 'aidis_examples',
            description: 'Get usage examples and patterns for a specific AIDIS tool',
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
            name: 'naming_register',
            description: 'Register a name in the naming registry to prevent conflicts',
            inputSchema: {
              type: 'object',
              properties: {
                entityType: {
                  type: 'string',
                  description: 'Entity type: variable, function, class, interface, type, component, file, directory, module, service, endpoint, database_table, database_column, config_key, environment_var, css_class, html_id'
                },
                canonicalName: {
                  type: 'string',
                  description: 'Official name to register'
                },
                description: {
                  type: 'string',
                  description: 'Entity description'
                },
                aliases: {
                  type: 'array',
                  description: 'Alternative names'
                },
                contextTags: {
                  type: 'array',
                  description: 'Categorization tags'
                },
                projectId: {
                  type: 'string',
                  description: 'Project ID'
                }
              },
              required: ['entityType', 'canonicalName'],
              additionalProperties: true
            },
          },
          {
            name: 'naming_check',
            description: 'Check for naming conflicts before using a name',
            inputSchema: {
              type: 'object',
              properties: {
                entityType: {
                  type: 'string',
                  description: 'Entity type: variable, function, class, interface, type, component, file, directory, module, service, endpoint, database_table, database_column, config_key, environment_var, css_class, html_id'
                },
                proposedName: {
                  type: 'string',
                  description: 'Name to check'
                },
                contextTags: {
                  type: 'array',
                  description: 'Context tags for conflict detection'
                },
                projectId: {
                  type: 'string',
                  description: 'Project ID'
                }
              },
              required: ['entityType', 'proposedName'],
              additionalProperties: true
            },
          },
          {
            name: 'naming_suggest',
            description: 'Get name suggestions based on description and project patterns',
            inputSchema: {
              type: 'object',
              properties: {
                entityType: {
                  type: 'string',
                  description: 'Entity type: variable, function, class, interface, type, component, file, directory, module, service, endpoint, database_table, database_column, config_key, environment_var, css_class, html_id'
                },
                description: {
                  type: 'string',
                  description: 'What needs naming'
                },
                contextTags: {
                  type: 'array',
                  description: 'Tags to influence suggestions'
                },
                projectId: {
                  type: 'string',
                  description: 'Project ID'
                }
              },
              required: ['entityType', 'description'],
              additionalProperties: true
            },
          },
          {
            name: 'naming_stats',
            description: 'Get naming statistics and convention compliance for a project',
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
        
        // Session Management Tools
        {
          name: 'session_assign',
          description: 'Assign current session to a project',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Project name to assign to'
              }
            },
            required: ['projectName'],
            additionalProperties: true
          }
        },
        {
          name: 'session_status',
          description: 'Get current session status and details',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: true
          }
        },
        {
          name: 'session_new',
          description: 'Create a new session with optional title, project assignment, goal, tags, and AI model tracking (Phase 2 enhanced)',
          inputSchema: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Session title'
              },
              projectName: {
                type: 'string',
                description: 'Project to assign session to'
              },
              description: {
                type: 'string',
                description: 'Detailed session description'
              },
              sessionGoal: {
                type: 'string',
                description: 'Session objective (e.g., "Implement user auth", "Fix payment bug")'
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Tags for categorization (e.g., ["bug-fix", "frontend"])'
              },
              aiModel: {
                type: 'string',
                description: 'AI model identifier (e.g., "claude-sonnet-4-5")'
              }
            },
            additionalProperties: true
          }
        },
        {
          name: 'session_update',
          description: 'Update session title, description, goal, and tags for better organization (Phase 2 enhanced)',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: {
                type: 'string',
                description: 'Session ID to update'
              },
              title: {
                type: 'string',
                description: 'New session title'
              },
              description: {
                type: 'string',
                description: 'New session description'
              },
              sessionGoal: {
                type: 'string',
                description: 'New session goal/objective'
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'New tags array (replaces existing)'
              }
            },
            required: ['sessionId'],
            additionalProperties: true
          }
        },
        {
          name: 'session_details',
          description: 'Get detailed session information including title, description, and metadata',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: {
                type: 'string',
                description: 'Session ID'
              }
            },
            required: ['sessionId'],
            additionalProperties: true
          }
        },

        // Git Correlation Tools

        // TC013/TC017: Deprecated pattern tools removed - TT009-3 Complete
        // 17 individual pattern tools consolidated into:
        //   - pattern_analyze (detection/analysis/tracking operations)
        //   - pattern_insights (insights/correlations/recommendations/alerts)

        // TT009-2: Phase 2 Metrics Consolidation Tools
        {
          name: 'metrics_collect',
          description: 'Unified metrics collection tool - replaces metrics_collect_project, metrics_get_core_metrics, metrics_get_pattern_intelligence, and metrics_get_productivity_health',
          inputSchema: {
            type: 'object',
            properties: {
              scope: {
                type: 'string',
                description: 'Collection scope: project, core, patterns, productivity'
              },
              target: {
                type: 'string',
                description: 'Target identifier (project ID)'
              },
              options: {
                type: 'object',
                description: 'Scope-specific options: trigger, metricTypes, intelligenceTypes, productivityTypes, timeframe (1d/7d/30d/90d), developerEmail'
              }
            },
            required: ['scope', 'target'],
            additionalProperties: true
          }
        },
        {
          name: 'metrics_analyze',
          description: 'Unified metrics analysis tool - replaces metrics_get_dashboard, metrics_get_trends, metrics_aggregate_projects, metrics_aggregate_timeline, metrics_calculate_correlations, and metrics_get_executive_summary',
          inputSchema: {
            type: 'object',
            properties: {
              analysis: {
                type: 'string',
                description: 'Analysis type: dashboard, trends, correlations, executive, aggregate_projects, aggregate_timeline'
              },
              options: {
                type: 'object',
                description: 'Options: projectId, projectIds, timeframe (1d/7d/30d/90d/all or date range), metricTypes, includeAlerts, includeTrends, includeForecast, correlationType (pearson/spearman/kendall), metric1, metric2, aggregationType (sum/average/median/percentile/count/min/max), period (daily/weekly/monthly/quarterly), granularity (hour/day/week/month)'
              }
            },
            required: ['analysis'],
            additionalProperties: true
          }
        },
        {
          name: 'metrics_control',
          description: 'TT009-2-3: Unified metrics control tool - collection management, alerts, performance, export',
          inputSchema: {
            type: 'object',
            properties: {
              operation: {
                type: 'string',
                description: 'Operation: start, stop, alerts, acknowledge, resolve, performance, export'
              },
              options: {
                type: 'object',
                description: 'Options: projectId, sessionId, intervalMs, autoCollectGit, gracefulShutdown, collectFinalMetrics, severity, status, limit, includeResolved, alertId, acknowledgedBy, resolvedBy, notes, resolution, resolutionNotes, timeframe, includeSystemMetrics, includeQueueMetrics, format (json/csv), dateRange, metricTypes, includeMetadata, compressionLevel (none/low/medium/high)'
              }
            },
            required: ['operation'],
            additionalProperties: true
          }
        },
        {
          name: 'pattern_analyze',
          description: 'TT009-3-1: Unified pattern analysis tool - detection, analysis, tracking operations',
          inputSchema: {
            type: 'object',
            properties: {
              target: {
                type: 'string',
                description: 'Target type: project, session, commit, git, service'
              },
              action: {
                type: 'string',
                description: 'Action: start, stop, status, analyze, detect, track, discovered, performance'
              },
              options: {
                type: 'object',
                description: 'Options: enableRealTime, enableBatchProcessing, detectionTimeoutMs, updateIntervalMs, projectId, includeGitPatterns, includeSessionPatterns, includeHistoricalData, analysisDepth (basic/comprehensive/deep), patternTypes, sessionId, includeContextPatterns, includeTimePatterns, includeActivityPatterns, confidenceThreshold, commitSha, commitShas, includeImpactAnalysis, includeFilePatterns, includeChangePatterns, maxCommits, enableRealTimeTracking, trackingIntervalMs, minConfidence, includeMetadata, limitResults'
              }
            },
            required: ['target', 'action'],
            additionalProperties: true
          }
        },
        {
          name: 'pattern_insights',
          description: 'TT009-3-2: Unified pattern insights tool - insights, correlations, recommendations, alerts',
          inputSchema: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                description: 'Insight type: alerts, session, insights, trends, correlations, anomalies, recommendations'
              },
              options: {
                type: 'object',
                description: 'Options: projectId, sessionId, severity, status, limit, includeResolved, includeContextPatterns, includeActivityPatterns, includeTimePatterns, minConfidence, patternTypes, riskLevels, maxAge, includeRecommendations, limitResults, timeframe, includeForecast, forecastPeriods, granularity (hourly/daily/weekly), smoothing (none/moving_average/exponential), patternType1, patternType2, correlationType (pearson/spearman/kendall), includeLagAnalysis, maxLag, detectionMethod (statistical/isolation_forest/one_class_svm), sensitivityLevel (low/medium/high), includeContext, contextType (development/quality/performance/security), includeActionItems, includePrioritization, includeRiskAssessment, maxRecommendations'
              }
            },
            required: ['type'],
            additionalProperties: true
          }
        },

        // TC014: Deprecated metrics tools removed - TT009-2 Complete
        // 17 individual metrics tools consolidated into 3 unified tools:
        //   - metrics_collect, metrics_analyze, metrics_control

        // Code Complexity Tools - TC015: Multi-dimensional complexity tracking system
];

