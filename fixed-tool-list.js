// Correct 42 tools from bridge - use this to replace the server.ts tools array
const CORRECT_TOOLS = [
  // System Health (2 tools)
  {
    name: 'aidis_ping',
    description: 'Test connectivity to AIDIS server',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Optional test message', default: 'Hello AIDIS!' }
      }
    },
  },
  {
    name: 'aidis_status',
    description: 'Get AIDIS server status and health information',
    inputSchema: { type: 'object', properties: {} },
  },
  
  // Help & Discovery (3 tools)
  {
    name: 'aidis_help',
    description: 'Display categorized list of all AIDIS tools',
    inputSchema: { type: 'object', properties: {} },
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
  
  // Context Management (4 tools)
  {
    name: 'context_store',
    description: 'Store development context with automatic embedding generation for semantic search',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The context content to store (code, decisions, discussions, etc.)' },
        type: {
          type: 'string',
          enum: ['code', 'decision', 'error', 'discussion', 'planning', 'completion', 'milestone'],
          description: 'Type of context being stored'
        },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags for categorization' },
        relevanceScore: { type: 'number', minimum: 0, maximum: 10, description: 'Relevance score (0-10, default: 5)' },
        metadata: { type: 'object', description: 'Optional metadata as key-value pairs' },
        projectId: { type: 'string', description: 'Optional project ID (uses default if not specified)' },
        sessionId: { type: 'string', description: 'Optional session ID for grouping related contexts' }
      },
      required: ['content', 'type']
    },
  },
  {
    name: 'context_search',
    description: 'Search stored contexts using semantic similarity and filters',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (uses semantic similarity matching)' },
        limit: { type: 'number', minimum: 1, maximum: 50, description: 'Maximum number of results (default: 10)' },
        minSimilarity: { type: 'number', minimum: 0, maximum: 100, description: 'Minimum similarity percentage (0-100)' },
        type: {
          type: 'string',
          enum: ['code', 'decision', 'error', 'discussion', 'planning', 'completion'],
          description: 'Optional filter by context type'
        },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional filter by tags' },
        projectId: { type: 'string', description: 'Optional project ID filter' }
      },
      required: ['query']
    },
  },
  {
    name: 'context_get_recent',
    description: 'Get recent contexts in chronological order (newest first)',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 20, description: 'Maximum number of results (default: 5)' },
        projectId: { type: 'string', description: 'Optional project ID (uses current if not specified)' }
      },
      required: []
    },
  },
  {
    name: 'context_stats',
    description: 'Get context statistics for a project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Optional project ID (uses default if not specified)' }
      }
    },
  },
  
  // Project Management (6 tools)
  {
    name: 'project_list',
    description: 'List all available projects with statistics',
    inputSchema: {
      type: 'object',
      properties: {
        includeStats: { type: 'boolean', description: 'Include context statistics for each project (default: true)' }
      }
    },
  },
  {
    name: 'project_create',
    description: 'Create a new project',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Unique project name' },
        description: { type: 'string', description: 'Optional project description' },
        rootDirectory: { type: 'string', description: 'Optional root directory path' },
        gitRepoUrl: { type: 'string', description: 'Optional Git repository URL' },
        metadata: { type: 'object', description: 'Optional metadata as key-value pairs' }
      },
      required: ['name']
    },
  },
  {
    name: 'project_switch',
    description: 'Switch to a different project (sets it as current active project)',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project ID or name to switch to' }
      },
      required: ['project']
    },
  },
  {
    name: 'project_current',
    description: 'Get the currently active project information',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'project_info',
    description: 'Get detailed information about a specific project',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project ID or name to get information for' }
      },
      required: ['project']
    },
  },
  {
    name: 'project_insights',
    description: 'Get comprehensive project health and insights',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Optional project ID (uses current if not specified)' }
      }
    },
  },
  
  // Session Management (3 tools)
  {
    name: 'session_assign',
    description: 'Assign current session to a project',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Name of the project to assign the session to' }
      },
      required: ['projectName']
    },
  },
  {
    name: 'session_status',
    description: 'Get current session status and details',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'session_new',
    description: 'Create a new session with optional title and project assignment',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Optional custom title for the session' },
        projectName: { type: 'string', description: 'Optional project to assign the new session to' }
      },
      required: []
    },
  },
  
  // Naming Registry (4 tools)
  {
    name: 'naming_register',
    description: 'Register a name in the naming registry to prevent conflicts',
    inputSchema: {
      type: 'object',
      properties: {
        entityType: {
          type: 'string',
          enum: ['variable', 'function', 'class', 'interface', 'type', 'component', 'file', 'directory', 'module', 'service', 'endpoint', 'database_table', 'database_column', 'config_key', 'environment_var', 'css_class', 'html_id'],
          description: 'Type of entity being named'
        },
        canonicalName: { type: 'string', description: 'The official name to register' },
        description: { type: 'string', description: 'Description of what this entity represents' },
        aliases: { type: 'array', items: { type: 'string' }, description: 'Alternative names or variations' },
        contextTags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
        projectId: { type: 'string', description: 'Optional project ID (uses current if not specified)' }
      },
      required: ['entityType', 'canonicalName']
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
          enum: ['variable', 'function', 'class', 'interface', 'type', 'component', 'file', 'directory', 'module', 'service', 'endpoint', 'database_table', 'database_column', 'config_key', 'environment_var', 'css_class', 'html_id'],
          description: 'Type of entity being named'
        },
        proposedName: { type: 'string', description: 'The name you want to check' },
        contextTags: { type: 'array', items: { type: 'string' }, description: 'Context tags for smarter conflict detection' },
        projectId: { type: 'string', description: 'Optional project ID (uses current if not specified)' }
      },
      required: ['entityType', 'proposedName']
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
          enum: ['variable', 'function', 'class', 'interface', 'type', 'component', 'file', 'directory', 'module', 'service', 'endpoint', 'database_table', 'database_column', 'config_key', 'environment_var', 'css_class', 'html_id'],
          description: 'Type of entity being named'
        },
        description: { type: 'string', description: 'Description of what needs to be named' },
        contextTags: { type: 'array', items: { type: 'string' }, description: 'Context tags to influence suggestions' },
        projectId: { type: 'string', description: 'Optional project ID (uses current if not specified)' }
      },
      required: ['entityType', 'description']
    },
  },
  {
    name: 'naming_stats',
    description: 'Get naming statistics and convention compliance for a project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Optional project ID (uses current if not specified)' }
      }
    },
  },
  
  // Technical Decisions (4 tools)
  {
    name: 'decision_record',
    description: 'Record a technical decision with full context and alternatives',
    inputSchema: {
      type: 'object',
      properties: {
        decisionType: {
          type: 'string',
          enum: ['architecture', 'library', 'framework', 'pattern', 'api_design', 'database', 'deployment', 'security', 'performance', 'ui_ux', 'testing', 'tooling', 'process', 'naming_convention', 'code_style'],
          description: 'Type of decision being made'
        },
        title: { type: 'string', description: 'Brief title of the decision' },
        description: { type: 'string', description: 'Detailed description of the decision' },
        problemStatement: { type: 'string', description: 'What problem was being solved' },
        rationale: { type: 'string', description: 'Why this decision was made' },
        impactLevel: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          description: 'Impact level of this decision'
        },
        alternativesConsidered: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              pros: { type: 'array', items: { type: 'string' } },
              cons: { type: 'array', items: { type: 'string' } },
              reasonRejected: { type: 'string' }
            },
            required: ['name', 'reasonRejected']
          },
          description: 'Alternatives that were considered and rejected'
        },
        affectedComponents: { type: 'array', items: { type: 'string' }, description: 'Components affected by this decision' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
        projectId: { type: 'string', description: 'Optional project ID (uses current if not specified)' }
      },
      required: ['decisionType', 'title', 'description', 'rationale', 'impactLevel']
    },
  },
  {
    name: 'decision_search',
    description: 'Search technical decisions with various filters',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text query to search in decision content' },
        decisionType: {
          type: 'string',
          enum: ['architecture', 'library', 'framework', 'pattern', 'api_design', 'database', 'deployment', 'security', 'performance', 'ui_ux', 'testing', 'tooling', 'process', 'naming_convention', 'code_style'],
          description: 'Filter by decision type'
        },
        impactLevel: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          description: 'Filter by impact level'
        },
        component: { type: 'string', description: 'Find decisions affecting this component' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
        limit: { type: 'number', minimum: 1, maximum: 50, description: 'Maximum number of results (default: 20)' },
        projectId: { type: 'string', description: 'Optional project ID (uses current if not specified)' }
      }
    },
  },
  {
    name: 'decision_update',
    description: 'Update decision status, outcomes, or lessons learned',
    inputSchema: {
      type: 'object',
      properties: {
        decisionId: { type: 'string', description: 'ID of the decision to update' },
        outcomeStatus: {
          type: 'string',
          enum: ['unknown', 'successful', 'failed', 'mixed', 'too_early'],
          description: 'How did this decision turn out?'
        },
        outcomeNotes: { type: 'string', description: 'Notes about the outcome' },
        lessonsLearned: { type: 'string', description: 'What was learned from this decision' }
      },
      required: ['decisionId']
    },
  },
  {
    name: 'decision_stats',
    description: 'Get technical decision statistics and analysis',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Optional project ID (uses current if not specified)' }
      }
    },
  },
  
  // Multi-Agent Coordination (12 tools)
  {
    name: 'agent_register',
    description: 'Register a new agent in the system',
    inputSchema: {
      type: 'object',
      properties: {
        agentName: { type: 'string', description: 'Unique agent name' },
        agentType: { type: 'string', description: 'Type/role of the agent' },
        capabilities: { type: 'array', items: { type: 'string' }, description: 'Agent capabilities' },
        metadata: { type: 'object', description: 'Optional metadata' }
      },
      required: ['agentName', 'agentType']
    },
  },
  {
    name: 'agent_list',
    description: 'List all registered agents',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by agent status' },
        agentType: { type: 'string', description: 'Filter by agent type' }
      }
    },
  },
  {
    name: 'agent_status',
    description: 'Get status for a specific agent',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID to get status for' }
      },
      required: ['agentId']
    },
  },
  {
    name: 'agent_join',
    description: 'Join an agent session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID to join' },
        agentId: { type: 'string', description: 'Agent ID joining the session' }
      },
      required: ['sessionId', 'agentId']
    },
  },
  {
    name: 'agent_leave',
    description: 'Leave an agent session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID to leave' },
        agentId: { type: 'string', description: 'Agent ID leaving the session' }
      },
      required: ['sessionId', 'agentId']
    },
  },
  {
    name: 'agent_sessions',
    description: 'List active agent sessions',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Filter by specific agent ID' }
      }
    },
  },
  {
    name: 'agent_message',
    description: 'Send a message to an agent',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Target agent ID' },
        message: { type: 'string', description: 'Message to send' },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Message priority'
        }
      },
      required: ['agentId', 'message']
    },
  },
  {
    name: 'agent_messages',
    description: 'Get messages for an agent',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID to get messages for' },
        limit: { type: 'number', description: 'Maximum number of messages' }
      },
      required: ['agentId']
    },
  },
  {
    name: 'task_create',
    description: 'Create a new task for agent coordination',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Detailed task description' },
        type: { type: 'string', description: 'Task type (feature, bugfix, refactor, test, review, documentation)', default: 'general' },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Task priority',
          default: 'medium'
        },
        assignedTo: { type: 'string', description: 'Agent ID to assign task to' },
        dependencies: { type: 'array', items: { type: 'string' }, description: 'Task IDs this task depends on' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Task tags' },
        metadata: { type: 'object', description: 'Additional task metadata' },
        projectId: { type: 'string', description: 'Optional project ID (uses current if not specified)' }
      },
      required: ['title']
    },
  },
  {
    name: 'task_list',
    description: 'List tasks with optional filtering',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['todo', 'in_progress', 'blocked', 'completed', 'cancelled'],
          description: 'Filter by task status'
        },
        assignedTo: { type: 'string', description: 'Filter by assigned agent ID' },
        type: { type: 'string', description: 'Filter by task type' },
        projectId: { type: 'string', description: 'Optional project ID (uses current if not specified)' }
      }
    },
  },
  {
    name: 'task_update',
    description: 'Update task status and assignment',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID to update' },
        status: {
          type: 'string',
          enum: ['todo', 'in_progress', 'blocked', 'completed', 'cancelled'],
          description: 'New task status'
        },
        assignedTo: { type: 'string', description: 'Agent ID to assign/reassign task to' },
        metadata: { type: 'object', description: 'Additional task metadata' }
      },
      required: ['taskId', 'status']
    },
  },
  {
    name: 'task_details',
    description: 'Get detailed information for a specific task',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID to get details for' },
        projectId: { type: 'string', description: 'Optional project ID (uses current if not specified)' }
      },
      required: ['taskId']
    },
  },
  
  // Code Analysis (5 tools)
  {
    name: 'code_analyze',
    description: 'Analyze code file structure and dependencies',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to file to analyze' },
        content: { type: 'string', description: 'File content (optional, will read from disk if not provided)' },
        forceReanalyze: { type: 'boolean', description: 'Force reanalysis even if cached', default: false },
        projectId: { type: 'string', description: 'Optional project ID (uses current if not specified)' }
      },
      required: ['filePath']
    },
  },
  {
    name: 'code_components',
    description: 'List code components (functions, classes, etc.) in project',
    inputSchema: {
      type: 'object',
      properties: {
        componentType: { type: 'string', description: 'Filter by component type (function, class, interface, etc.)' },
        filePath: { type: 'string', description: 'Filter by specific file path' },
        projectId: { type: 'string', description: 'Optional project ID (uses current if not specified)' }
      }
    },
  },
  {
    name: 'code_dependencies',
    description: 'Get dependencies for a specific component',
    inputSchema: {
      type: 'object',
      properties: {
        componentId: { type: 'string', description: 'Component ID to get dependencies for' }
      },
      required: ['componentId']
    },
  },
  {
    name: 'code_impact',
    description: 'Analyze the impact of changing a component',
    inputSchema: {
      type: 'object',
      properties: {
        componentId: { type: 'string', description: 'Component ID to analyze impact for' }
      },
      required: ['componentId']
    },
  },
  {
    name: 'code_stats',
    description: 'Get code analysis statistics for a project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Optional project ID (uses current if not specified)' }
      }
    },
  },
  
  // Smart Search & AI (2 tools)
  {
    name: 'smart_search',
    description: 'Intelligent search across all project data sources',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        includeTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['context', 'component', 'decision', 'naming', 'task', 'agent']
          },
          description: 'Data sources to search',
          default: ['context', 'component', 'decision', 'naming']
        },
        limit: { type: 'number', description: 'Maximum results to return', default: 10 },
        projectId: { type: 'string', description: 'Optional project ID (uses current if not specified)' }
      },
      required: ['query']
    },
  },
  {
    name: 'get_recommendations',
    description: 'Get AI-powered recommendations for development',
    inputSchema: {
      type: 'object',
      properties: {
        context: { type: 'string', description: 'Context for recommendations (what you\'re working on)' },
        type: {
          type: 'string',
          enum: ['naming', 'implementation', 'architecture', 'testing'],
          description: 'Type of recommendations needed',
          default: 'implementation'
        },
        projectId: { type: 'string', description: 'Optional project ID (uses current if not specified)' }
      },
      required: ['context']
    },
  }
];
