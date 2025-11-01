/**
 * Mandrel Navigation Handler - Phase 1 Navigation Enhancement
 * 
 * Solves the Mandrel discoverability problem by providing:
 * 1. mandrel_help - Categorized tool listing
 * 2. mandrel_explain - Detailed tool documentation
 * 3. mandrel_examples - Usage examples and patterns
 * 
 * This transforms Mandrel from "27 mysterious tools" into a discoverable, learnable system.
 */

export class NavigationHandler {
  /**
   * All 27 Mandrel tools organized by category with descriptions 
   */
  private readonly toolCatalog = {
    'System Health': [
      { name: 'mandrel_ping', description: 'Test connectivity to Mandrel server' },
      { name: 'mandrel_status', description: 'Get server status and health information' }
    ],
    'Navigation': [
      { name: 'mandrel_help', description: 'Display categorized list of all Mandrel tools' },
      { name: 'mandrel_explain', description: 'Get detailed help for a specific Mandrel tool' },
      { name: 'mandrel_examples', description: 'Get usage examples and patterns for a specific Mandrel tool' }
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
    'Smart Search & AI': [
      { name: 'smart_search', description: 'Intelligent search across all project data' },
      { name: 'get_recommendations', description: 'Get AI-powered recommendations for development' }
    ]
  };

  /**
   * Detailed parameter documentation for each tool
   */
  private readonly toolParameters = {
    // System Health
    'mandrel_ping': {
      description: 'Test connectivity and responsiveness of the Mandrel server',
      parameters: [
        { name: 'message', type: 'string', required: false, description: 'Optional test message (default: "Hello Mandrel!")' }
      ],
      returns: 'Pong response with timestamp and status'
    },
    'mandrel_status': {
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

    // Session Management - DELETED (2025-10-24)
    // 5 session tools removed - sessions auto-manage via SessionTracker service

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
    ]

    // Session Management - DELETED (2025-10-24)
    // 5 session tools removed - sessions auto-manage via SessionTracker service
  };

  /**
   * Generate categorized help listing of all AIDIS tools
   */
  async getHelp(): Promise<any> {
    // Dynamically count total tools across all categories
    const totalTools = Object.values(this.toolCatalog).reduce((sum, tools) => sum + tools.length, 0);
    const totalCategories = Object.keys(this.toolCatalog).length;

    let helpText = '🚀 **AIDIS - AI Development Intelligence System**\n\n';
    helpText += `**${totalTools} Tools Available Across ${totalCategories} Categories:**\n\n`;

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
    for (const [_category, tools] of Object.entries(this.toolCatalog)) {
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