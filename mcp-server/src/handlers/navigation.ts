/**
 * AIDIS Navigation Handler - Phase 1 Navigation Enhancement
 * 
 * Solves the AIDIS discoverability problem by providing:
 * 1. aidis_help - Categorized tool listing
 * 2. aidis_explain - Detailed tool documentation
 * 3. aidis_examples - Usage examples and patterns
 * 
 * This transforms AIDIS from "38 mysterious tools" into a discoverable, learnable system.
 */

export class NavigationHandler {
  /**
   * All 96 AIDIS tools organized by category with descriptions 
   */
  private readonly toolCatalog = {
    'System Health': [
      { name: 'aidis_ping', description: 'Test connectivity to AIDIS server' },
      { name: 'aidis_status', description: 'Get server status and health information' }
    ],
    'Context Management': [
      { name: 'context_store', description: 'Store development context with automatic embedding' },
      { name: 'context_search', description: 'Search stored contexts using semantic similarity' },
      { name: 'context_get_recent', description: 'Get recent contexts chronologically (newest first)' },
      { name: 'context_stats', description: 'Get context statistics for a project' }
    ],
    'Project Management': [
      { name: 'project_list', description: 'List all available projects with statistics' },
      { name: 'project_create', description: 'Create a new project' },
      { name: 'project_switch', description: 'Switch to a different project (sets as current)' },
      { name: 'project_current', description: 'Get the currently active project information' },
      { name: 'project_info', description: 'Get detailed information about a specific project' },
      { name: 'project_insights', description: 'Get comprehensive project health and insights' }
    ],
    'Session Management': [
      { name: 'session_assign', description: 'Assign current session to a project' },
      { name: 'session_status', description: 'Get current session status and details' },
      { name: 'session_new', description: 'Create a new session with optional title and project assignment' },
      { name: 'session_update', description: 'Update session title and description for better organization' },
      { name: 'session_details', description: 'Get detailed session information including title, description, and metadata' }
    ],
    'Naming Registry': [
      { name: 'naming_register', description: 'Register a name to prevent conflicts' },
      { name: 'naming_check', description: 'Check for naming conflicts before using a name' },
      { name: 'naming_suggest', description: 'Get name suggestions based on description' },
      { name: 'naming_stats', description: 'Get naming statistics and convention compliance' }
    ],
    'Technical Decisions': [
      { name: 'decision_record', description: 'Record a technical decision with context' },
      { name: 'decision_search', description: 'Search technical decisions with filters' },
      { name: 'decision_update', description: 'Update decision status, outcomes, or lessons' },
      { name: 'decision_stats', description: 'Get technical decision statistics and analysis' }
    ],
    'Task Management': [
      { name: 'task_create', description: 'Create a new task for coordination' },
      { name: 'task_list', description: 'List tasks with optional filtering' },
      { name: 'task_update', description: 'Update task status and assignment' },
      { name: 'task_details', description: 'Get detailed information for a specific task' },
      { name: 'task_bulk_update', description: 'Update multiple tasks atomically with the same changes' },
      { name: 'task_progress_summary', description: 'Get task progress summary with grouping and completion percentages' }
    ],
    'Code Analysis': [
      { name: 'code_analyze', description: 'Analyze code file structure and dependencies' },
      { name: 'code_components', description: 'List code components (functions, classes, etc.)' },
      { name: 'code_dependencies', description: 'Get dependencies for a specific component' },
      { name: 'code_impact', description: 'Analyze the impact of changing a component' },
      { name: 'code_stats', description: 'Get code analysis statistics for a project' }
    ],
    'Smart Search & AI': [
      { name: 'smart_search', description: 'Intelligent search across all project data' },
      { name: 'get_recommendations', description: 'Get AI-powered recommendations for development' }
    ],
    'Code Complexity': [
      { name: 'complexity_analyze', description: 'Unified complexity analysis - file analysis, commit analysis, and detailed metrics' },
      { name: 'complexity_insights', description: 'Unified complexity insights - dashboard, hotspots, trends, technical debt, and refactoring opportunities' },
      { name: 'complexity_manage', description: 'Unified complexity management - tracking service, alerts, thresholds, and performance monitoring' }
    ],
    'Development Metrics': [
      { name: 'metrics_collect_project', description: 'Trigger comprehensive metrics collection for a project' },
      { name: 'metrics_get_dashboard', description: 'Get comprehensive project metrics dashboard data' },
      { name: 'metrics_get_core_metrics', description: 'Get detailed core development metrics (velocity, quality, debt)' },
      { name: 'metrics_get_pattern_intelligence', description: 'Get pattern-based intelligence metrics' },
      { name: 'metrics_get_productivity_health', description: 'Get developer productivity and health metrics' },
      { name: 'metrics_get_alerts', description: 'Get active metrics alerts and notifications' },
      { name: 'metrics_acknowledge_alert', description: 'Acknowledge a metrics alert' },
      { name: 'metrics_resolve_alert', description: 'Mark a metrics alert as resolved' },
      { name: 'metrics_get_trends', description: 'Get metrics trends and forecasting data' },
      { name: 'metrics_get_performance', description: 'Get metrics collection system performance statistics' },
      { name: 'metrics_start_collection', description: 'Start the metrics collection service' },
      { name: 'metrics_stop_collection', description: 'Stop the metrics collection service' }
    ],
    'Metrics Aggregation': [
      { name: 'metrics_aggregate_projects', description: 'Aggregate metrics across multiple projects with various aggregation types' },
      { name: 'metrics_aggregate_timeline', description: 'Aggregate metrics over time with specified granularity and smoothing' },
      { name: 'metrics_calculate_correlations', description: 'Calculate correlations and relationships between metrics' },
      { name: 'metrics_get_executive_summary', description: 'Generate comprehensive executive summary with key insights' },
      { name: 'metrics_export_data', description: 'Export aggregated metrics data in various formats (CSV, JSON, Excel)' }
    ],
    'Pattern Detection': [
      { name: 'pattern_detection_start', description: 'Start the real-time pattern detection service' },
      { name: 'pattern_detection_stop', description: 'Stop the pattern detection service and get final metrics' },
      { name: 'pattern_detection_status', description: 'Get pattern detection service status and performance metrics' },
      { name: 'pattern_detect_commits', description: 'Detect patterns in specific commits or recent commits' },
      { name: 'pattern_track_git_activity', description: 'Track git activity with automatic pattern detection' },
      { name: 'pattern_get_alerts', description: 'Get real-time pattern alerts for high-risk discoveries' },
      { name: 'pattern_get_session_insights', description: 'Get pattern insights for current session' }
    ],
    'Pattern Analysis': [
      { name: 'pattern_analyze_project', description: 'Get comprehensive pattern analysis for project' },
      { name: 'pattern_analyze_session', description: 'Analyze patterns for specific session context' },
      { name: 'pattern_analyze_commit', description: 'Analyze patterns for specific git commits with impact analysis' },
      { name: 'pattern_get_discovered', description: 'Get discovered patterns with advanced filtering' },
      { name: 'pattern_get_insights', description: 'Get actionable pattern insights with advanced filtering' },
      { name: 'pattern_get_trends', description: 'Analyze pattern trends over time with forecasting' },
      { name: 'pattern_get_correlations', description: 'Find correlations between different pattern types' },
      { name: 'pattern_get_anomalies', description: 'Detect pattern anomalies and outliers with statistical analysis' },
      { name: 'pattern_get_recommendations', description: 'Generate AI-driven pattern-based recommendations' },
      { name: 'pattern_get_performance', description: 'Get pattern detection system performance metrics' }
    ],
    'Outcome Tracking': [
      { name: 'outcome_record', description: 'Record a decision outcome measurement with evidence and scoring' },
      { name: 'outcome_track_metric', description: 'Track metrics over time for a decision to monitor progress' },
      { name: 'outcome_analyze_impact', description: 'Analyze and record impact relationships between decisions' },
      { name: 'outcome_conduct_retrospective', description: 'Conduct a structured retrospective on a decision' },
      { name: 'outcome_get_insights', description: 'Get learning insights and patterns from decision outcomes' },
      { name: 'outcome_get_analytics', description: 'Get comprehensive decision analytics, trends, and reporting' },
      { name: 'outcome_predict_success', description: 'Predict decision success probability using historical patterns' }
    ],
    'Git Integration': [
      { name: 'git_session_commits', description: 'Get all git commits linked to a session with correlation details' },
      { name: 'git_commit_sessions', description: 'Get all sessions that contributed to a specific git commit' },
      { name: 'git_correlate_session', description: 'Manually trigger git correlation for current or specified session' }
    ]
  };

  /**
   * Detailed parameter documentation for each tool
   */
  private readonly toolParameters = {
    // System Health
    'aidis_ping': {
      description: 'Test connectivity and responsiveness of the AIDIS server',
      parameters: [
        { name: 'message', type: 'string', required: false, description: 'Optional test message (default: "Hello AIDIS!")' }
      ],
      returns: 'Pong response with timestamp and status'
    },
    'aidis_status': {
      description: 'Get comprehensive server status including database connection, memory usage, and uptime',
      parameters: [],
      returns: 'Server health report with version, uptime, database status, memory usage'
    },

    // Context Management
    'context_store': {
      description: 'Store development context with automatic vector embedding generation for semantic search',
      parameters: [
        { name: 'content', type: 'string', required: true, description: 'The context content (code, decisions, discussions, etc.)' },
        { name: 'type', type: 'enum', required: true, description: 'Type: code, decision, error, discussion, planning, completion, milestone, reflections, handoff' },
        { name: 'tags', type: 'string[]', required: false, description: 'Optional tags for categorization' },
        { name: 'relevanceScore', type: 'number', required: false, description: 'Relevance score 0-10 (default: 5)' },
        { name: 'sessionId', type: 'string', required: false, description: 'Session ID for grouping related contexts' },
        { name: 'projectId', type: 'string', required: false, description: 'Project ID (uses current if not specified)' }
      ],
      returns: 'Stored context with generated ID, timestamp, and searchable embedding'
    },
    'context_search': {
      description: 'Search stored contexts using semantic similarity matching',
      parameters: [
        { name: 'query', type: 'string', required: true, description: 'Search query (uses semantic similarity)' },
        { name: 'type', type: 'enum', required: false, description: 'Filter by context type' },
        { name: 'tags', type: 'string[]', required: false, description: 'Filter by tags' },
        { name: 'limit', type: 'number', required: false, description: 'Max results (default: 10, max: 50)' },
        { name: 'minSimilarity', type: 'number', required: false, description: 'Minimum similarity percentage 0-100' },
        { name: 'projectId', type: 'string', required: false, description: 'Project ID filter' }
      ],
      returns: 'Array of matching contexts with similarity scores and search reasons'
    },
    'context_get_recent': {
      description: 'Get recent contexts in chronological order (newest first)',
      parameters: [
        { name: 'limit', type: 'number', required: false, description: 'Maximum results (default: 5, max: 20)' },
        { name: 'projectId', type: 'string', required: false, description: 'Project ID (uses current if not specified)' }
      ],
      returns: 'Array of recent contexts ordered by creation time'
    },
    'context_stats': {
      description: 'Get context statistics for a project',
      parameters: [
        { name: 'projectId', type: 'string', required: false, description: 'Project ID (uses current if not specified)' }
      ],
      returns: 'Statistics including total contexts, types distribution, recent activity'
    },

    // Project Management  
    'project_list': {
      description: 'List all available projects with optional statistics',
      parameters: [
        { name: 'includeStats', type: 'boolean', required: false, description: 'Include context statistics (default: true)' }
      ],
      returns: 'Array of projects with metadata and optional statistics'
    },
    'project_create': {
      description: 'Create a new project for organizing development context',
      parameters: [
        { name: 'name', type: 'string', required: true, description: 'Unique project name' },
        { name: 'description', type: 'string', required: false, description: 'Project description' },
        { name: 'gitRepoUrl', type: 'string', required: false, description: 'Git repository URL' },
        { name: 'rootDirectory', type: 'string', required: false, description: 'Root directory path' },
        { name: 'metadata', type: 'object', required: false, description: 'Additional metadata as key-value pairs' }
      ],
      returns: 'Created project with ID and metadata'
    },
    'project_switch': {
      description: 'Switch to a different project (sets it as current active project)',
      parameters: [
        { name: 'project', type: 'string', required: true, description: 'Project ID or name to switch to' }
      ],
      returns: 'Confirmation of project switch with new current project details'
    },
    'project_current': {
      description: 'Get the currently active project information',
      parameters: [],
      returns: 'Current project details or null if no project is set'
    },
    'project_info': {
      description: 'Get detailed information about a specific project',
      parameters: [
        { name: 'project', type: 'string', required: true, description: 'Project ID or name' }
      ],
      returns: 'Detailed project information including metadata and statistics'
    },
    'project_insights': {
      description: 'Get comprehensive project health and insights',
      parameters: [
        { name: 'projectId', type: 'string', required: false, description: 'Project ID (uses current if not specified)' }
      ],
      returns: 'Project health metrics, activity patterns, and recommendations'
    },

    // Session Management
    'session_assign': {
      description: 'Assign current session to a project for context organization',
      parameters: [
        { name: 'projectName', type: 'string', required: true, description: 'Name of the project to assign the session to' }
      ],
      returns: 'Confirmation of session assignment with project details'
    },
    'session_status': {
      description: 'Get current session status and details including duration and context count',
      parameters: [],
      returns: 'Session ID, type, project assignment, start time, duration, and context statistics'
    },
    'session_new': {
      description: 'Create a new session with optional title and project assignment',
      parameters: [
        { name: 'title', type: 'string', required: false, description: 'Optional custom title for the session' },
        { name: 'projectName', type: 'string', required: false, description: 'Optional project to assign the new session to' }
      ],
      returns: 'New session ID and project assignment confirmation'
    },
    'session_update': {
      description: 'Update session title and description for better organization and context',
      parameters: [
        { name: 'sessionId', type: 'string', required: true, description: 'ID of the session to update' },
        { name: 'title', type: 'string', required: false, description: 'New title for the session (optional)' },
        { name: 'description', type: 'string', required: false, description: 'New description for the session (optional)' }
      ],
      returns: 'Updated session details with new title/description and metadata'
    },
    'session_details': {
      description: 'Get detailed session information including title, description, and comprehensive metadata',
      parameters: [
        { name: 'sessionId', type: 'string', required: true, description: 'ID of the session to get details for' }
      ],
      returns: 'Complete session information including title, description, timestamps, project, and activity metrics'
    },

    // Add more tool parameters as needed...
    // (Truncating for brevity in this implementation)
  };

  /**
   * Usage examples and common patterns for tools
   */
  private readonly toolExamples = {
    // System Health
    'aidis_ping': [
      {
        title: 'Test basic connectivity',
        example: `aidis_ping()`
      },
      {
        title: 'Test with custom message',
        example: `aidis_ping({
  message: "Health check from agent"
})`
      }
    ],
    'aidis_status': [
      {
        title: 'Get server health report',
        example: `aidis_status()`
      }
    ],

    // Context Management
    'context_store': [
      {
        title: 'Store a code solution',
        example: `context_store({
  content: "Fixed authentication bug by adding null check in validateToken()",
  type: "code",
  tags: ["bug-fix", "authentication", "security"],
  relevanceScore: 8
})`
      },
      {
        title: 'Record a technical decision',
        example: `context_store({
  content: "Decided to use Redis for caching instead of in-memory due to scalability",
  type: "decision", 
  tags: ["architecture", "caching", "scalability"],
  relevanceScore: 9
})`
      },
      {
        title: 'Store planning notes',
        example: `context_store({
  content: "Phase 2 will focus on user authentication and authorization",
  type: "planning",
  tags: ["roadmap", "authentication", "phase-2"]
})`
      }
    ],
    'context_search': [
      {
        title: 'Find authentication-related contexts',
        example: `context_search({
  query: "authentication login security",
  type: "code",
  limit: 5
})`
      },
      {
        title: 'Search for recent error solutions',
        example: `context_search({
  query: "error handling exception",
  type: "error",
  minSimilarity: 70
})`
      },
      {
        title: 'Find all planning discussions',
        example: `context_search({
  query: "architecture database design",
  type: "planning",
  tags: ["database"]
})`
      }
    ],
    'context_get_recent': [
      {
        title: 'Get last 5 contexts',
        example: `context_get_recent({
  limit: 5
})`
      },
      {
        title: 'Get recent contexts for specific project',
        example: `context_get_recent({
  limit: 10,
  projectId: "web-app-project"
})`
      }
    ],
    'context_stats': [
      {
        title: 'Get current project stats',
        example: `context_stats()`
      },
      {
        title: 'Get stats for specific project',
        example: `context_stats({
  projectId: "mobile-app"
})`
      }
    ],

    // Project Management
    'project_list': [
      {
        title: 'List all projects with stats',
        example: `project_list()`
      },
      {
        title: 'List projects without statistics',
        example: `project_list({
  includeStats: false
})`
      }
    ],
    'project_create': [
      {
        title: 'Create a new web application project',
        example: `project_create({
  name: "my-web-app",
  description: "React/Node.js web application",
  gitRepoUrl: "https://github.com/user/my-web-app",
  rootDirectory: "/home/user/projects/my-web-app"
})`
      },
      {
        title: 'Create minimal project',
        example: `project_create({
  name: "quick-prototype"
})`
      }
    ],
    'project_switch': [
      {
        title: 'Switch by project name',
        example: `project_switch({
  project: "my-web-app"
})`
      },
      {
        title: 'Switch by project ID',
        example: `project_switch({
  project: "proj_123456"
})`
      }
    ],
    'project_current': [
      {
        title: 'Get current active project',
        example: `project_current()`
      }
    ],
    'project_info': [
      {
        title: 'Get project details by name',
        example: `project_info({
  project: "my-web-app"
})`
      }
    ],

    // Naming Registry
    'naming_check': [
      {
        title: 'Check if a function name is available',
        example: `naming_check({
  entityType: "function",
  proposedName: "processUserData",
  contextTags: ["user", "processing"]
})`
      },
      {
        title: 'Check component name availability',
        example: `naming_check({
  entityType: "component",
  proposedName: "UserProfile"
})`
      }
    ],
    'naming_register': [
      {
        title: 'Register a function name',
        example: `naming_register({
  entityType: "function",
  canonicalName: "validateEmailFormat",
  description: "Validates email address format using regex"
})`
      }
    ],
    'naming_suggest': [
      {
        title: 'Get function name suggestions',
        example: `naming_suggest({
  entityType: "function",
  description: "handles user authentication with JWT tokens"
})`
      }
    ],

    // Technical Decisions
    'decision_record': [
      {
        title: 'Record architecture decision',
        example: `decision_record({
  decisionType: "architecture",
  title: "Use microservices architecture",
  description: "Split monolith into focused microservices",
  rationale: "Better scalability and team independence",
  impactLevel: "high"
})`
      }
    ],
    'decision_search': [
      {
        title: 'Find database decisions',
        example: `decision_search({
  query: "database schema design",
  decisionType: "database"
})`
      }
    ],

    // Task Management
    'task_create': [
      {
        title: 'Create implementation task',
        example: `task_create({
  title: "Implement user authentication",
  description: "Add JWT-based auth with login/logout",
  priority: "high",
  assignedTo: "CodeAgent"
})`
      },
      {
        title: 'Create bug fix task',
        example: `task_create({
  title: "Fix login redirect issue",
  description: "Users not redirected after successful login",
  type: "bugfix",
  priority: "urgent",
  assignedTo: "QaAgent",
  tags: ["bug", "authentication", "frontend"]
})`
      }
    ],
    'task_update': [
      {
        title: 'Mark task as completed',
        example: `task_update({
  taskId: "59823126-9442-45dd-87e7-3dfae691e41f",
  status: "completed"
})`
      },
      {
        title: 'Reassign task to different agent',
        example: `task_update({
  taskId: "59823126-9442-45dd-87e7-3dfae691e41f",
  status: "in_progress",
  assignedTo: "CodeReviewGuru"
})`
      }
    ],
    'task_details': [
      {
        title: 'Get full task details',
        example: `task_details({
  taskId: "59823126-9442-45dd-87e7-3dfae691e41f"
})`
      },
      {
        title: 'Get task details for specific project',
        example: `task_details({
  taskId: "59823126-9442-45dd-87e7-3dfae691e41f",
  projectId: "my-project-id"
})`
      }
    ],
    
    // Session Management
    'session_assign': [
      {
        title: 'Assign session to current project',
        example: `session_assign({
  projectName: "my-web-app"
})`
      }
    ],
    'session_status': [
      {
        title: 'Get current session information',
        example: `session_status()`
      }
    ],
    'session_new': [
      {
        title: 'Create new session with title',
        example: `session_new({
  title: "Feature Development Sprint",
  projectName: "aidis-bootstrap"
})`
      },
      {
        title: 'Create simple new session',
        example: `session_new()`
      }
    ],
    'session_update': [
      {
        title: 'Update session title only',
        example: `session_update({
  sessionId: "67b60ed0-1234-5678-9abc-def012345678",
  title: "Authentication Module Development"
})`
      },
      {
        title: 'Update both title and description',
        example: `session_update({
  sessionId: "67b60ed0-1234-5678-9abc-def012345678",
  title: "User Authentication Implementation",
  description: "Implementing JWT-based authentication with login, logout, and session management. Includes password hashing and token validation."
})`
      },
      {
        title: 'Update description only',
        example: `session_update({
  sessionId: "67b60ed0-1234-5678-9abc-def012345678",
  description: "Working on database optimization and query performance improvements for the user management system."
})`
      }
    ],
    'session_details': [
      {
        title: 'Get session details with metadata',
        example: `session_details({
  sessionId: "67b60ed0-1234-5678-9abc-def012345678"
})`
      }
    ]
  };

  /**
   * Generate categorized help listing of all AIDIS tools
   */
  async getHelp(): Promise<any> {
    let helpText = '🚀 **AIDIS - AI Development Intelligence System**\n\n';
    helpText += '**49 Tools Available Across 12 Categories:**\n\n';

    for (const [category, tools] of Object.entries(this.toolCatalog)) {
      helpText += `## ${category} (${tools.length} tools)\n`;
      
      for (const tool of tools) {
        helpText += `• **${tool.name}** - ${tool.description}\n`;
      }
      helpText += '\n';
    }

    helpText += '💡 **Quick Start:**\n';
    helpText += '• `aidis_explain <toolname>` - Get detailed help for any tool\n';
    helpText += '• `aidis_examples <toolname>` - See usage examples\n';
    helpText += '• `aidis_ping` - Test connectivity\n';
    helpText += '• `project_current` - Check current project\n\n';
    
    helpText += '🎯 **Popular Workflows:**\n';
    helpText += '• Context: store → search → get_recent\n';
    helpText += '• Projects: create → switch → info\n';
    helpText += '• Naming: check → register → suggest\n';
    helpText += '• Decisions: record → search → update\n';

    return {
      content: [
        {
          type: 'text',
          text: helpText
        }
      ]
    };
  }

  /**
   * Get detailed explanation for a specific tool
   */
  async explainTool(args: { toolName: string }): Promise<any> {
    const toolName = args.toolName.toLowerCase();
    
    // Find the tool in our catalog
    let toolFound = false;
    let category = '';
    let description = '';
    
    for (const [cat, tools] of Object.entries(this.toolCatalog)) {
      const tool = tools.find(t => t.name === toolName);
      if (tool) {
        toolFound = true;
        category = cat;
        description = tool.description;
        break;
      }
    }
    
    if (!toolFound) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Tool "${toolName}" not found.\n\nUse \`aidis_help\` to see all available tools.`
          }
        ]
      };
    }

    let explanation = `🔧 **${toolName}**\n\n`;
    explanation += `**Category:** ${category}\n`;
    explanation += `**Purpose:** ${description}\n\n`;

    // Add detailed parameter info if available
    const paramInfo = this.toolParameters[toolName as keyof typeof this.toolParameters];
    if (paramInfo) {
      explanation += `**Description:** ${paramInfo.description}\n\n`;
      
      if (paramInfo.parameters.length > 0) {
        explanation += '**Parameters:**\n';
        for (const param of paramInfo.parameters) {
          const required = param.required ? ' *(required)*' : ' *(optional)*';
          explanation += `• \`${param.name}\` (${param.type})${required} - ${param.description}\n`;
        }
        explanation += '\n';
      } else {
        explanation += '**Parameters:** None\n\n';
      }
      
      explanation += `**Returns:** ${paramInfo.returns}\n\n`;
    }

    explanation += `💡 **Quick Tip:** Use \`aidis_examples ${toolName}\` to see usage examples.`;

    return {
      content: [
        {
          type: 'text',
          text: explanation
        }
      ]
    };
  }

  /**
   * Get usage examples for a specific tool
   */
  async getExamples(args: { toolName: string }): Promise<any> {
    const toolName = args.toolName.toLowerCase();
    
    // First check if the tool exists in our catalog
    let toolExists = false;
    for (const [category, tools] of Object.entries(this.toolCatalog)) {
      if (tools.find(t => t.name === toolName)) {
        toolExists = true;
        break;
      }
    }

    if (!toolExists) {
      // Build list of available tools for helpful error message
      const allTools: string[] = [];
      for (const tools of Object.values(this.toolCatalog)) {
        allTools.push(...tools.map(t => t.name));
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `❌ Tool "${toolName}" not found.\n\n**Available tools:**\n${allTools.map(t => `• ${t}`).join('\n')}\n\nUse \`aidis_help\` to see all tools organized by category.`
          }
        ]
      };
    }
    
    const examples = this.toolExamples[toolName as keyof typeof this.toolExamples];
    
    if (!examples || examples.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `📝 No examples available yet for "${toolName}".\n\nUse \`aidis_explain ${toolName}\` for parameter documentation.`
          }
        ]
      };
    }

    let exampleText = `📚 **Examples for ${toolName}**\n\n`;
    
    examples.forEach((example: any, index: number) => {
      exampleText += `### ${index + 1}. ${example.title}\n`;
      exampleText += '```javascript\n';
      exampleText += example.example;
      exampleText += '\n```\n\n';
    });

    exampleText += `💡 **Related Commands:**\n`;
    exampleText += `• \`aidis_explain ${toolName}\` - Get detailed parameter documentation\n`;
    exampleText += `• \`aidis_help\` - See all available tools by category`;

    return {
      content: [
        {
          type: 'text',
          text: exampleText
        }
      ]
    };
  }
}

// Export singleton instance
export const navigationHandler = new NavigationHandler();
