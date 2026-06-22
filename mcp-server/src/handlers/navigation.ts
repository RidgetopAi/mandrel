/**
 * Mandrel Navigation Handler - Phase 1 Navigation Enhancement
 *
 * Solves the Mandrel discoverability problem by providing:
 * 1. mandrel_help - Categorized tool listing
 * 2. mandrel_explain - Detailed tool documentation
 * 3. mandrel_examples - Usage examples and patterns
 *
 * This transforms Mandrel from a flat list of mysterious tools into a discoverable, learnable system.
 */

import {
  AIDIS_TOOL_DEFINITIONS,
  CATEGORY_ORDER,
  TOOL_CATEGORIES,
  categoryForTool,
} from '../config/toolDefinitions.js';

class NavigationHandler {
  /**
   * Build the rendered catalog (category → [{name, description}]) DERIVED from the
   * single source of truth: AIDIS_TOOL_DEFINITIONS for the tool set + descriptions,
   * TOOL_CATEGORIES/CATEGORY_ORDER (config/toolDefinitions.ts) for the grouping + order.
   *
   * CATALOG-DRIFT CLASS FIX (task 43aa8c03): there is no longer a second hand-maintained
   * `toolCatalog` here to drift from the definitions. Every tool that exists is rendered
   * (the import-time coverage guard in toolDefinitions.ts + the helpCatalog contract test
   * guarantee every tool is categorized exactly once), and the counts are computed from
   * this derived structure — never hardcoded.
   */
  private buildCatalog(): Array<{ category: string; tools: Array<{ name: string; description: string }> }> {
    const descByName = new Map(AIDIS_TOOL_DEFINITIONS.map((d) => [d.name, d.description]));
    return CATEGORY_ORDER.map((category) => ({
      category,
      tools: TOOL_CATEGORIES[category].map((name) => ({
        name,
        description: descByName.get(name) ?? '',
      })),
    }));
  }

  /**
   * Usage examples and common patterns for tools
   */
  private readonly toolExamples = {
    // System Health
    'mandrel_ping': [
      {
        title: 'Test basic connectivity',
        example: `mandrel_ping()`
      },
      {
        title: 'Test with custom message',
        example: `mandrel_ping({
  message: "Health check from agent"
})`
      }
    ],
    'mandrel_status': [
      {
        title: 'Get server health report',
        example: `mandrel_status()`
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
        title: 'Fetch specific context by ID',
        example: `context_search({
  id: "86df4635-8090-41ff-a4d4-ed77925dbf17"
})`
      },
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
    'context_delete': [
      {
        title: 'Soft-delete (archive) a context by short id',
        example: `context_delete({
  contextId: "a1b2c3d4"
})`
      }
    ],
    'context_restore': [
      {
        title: 'Restore a previously archived context',
        example: `context_restore({
  contextId: "a1b2c3d4"
})`
      },
      {
        title: 'See archived contexts first, then restore',
        example: `context_search({ query: "old note", includeArchived: true })
context_restore({ contextId: "a1b2c3d4" })`
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
  status: "active",
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
    'project_update': [
      {
        title: 'Update description and status',
        example: `project_update({
  project: "my-web-app",
  description: "Now in maintenance mode",
  status: "paused"
})`
      },
      {
        title: 'Rename a project (by id or name)',
        example: `project_update({
  project: "old-name",
  name: "new-name"
})`
      },
      {
        title: 'Archive a finished project',
        example: `project_update({
  project: "legacy-prototype",
  status: "archived"
})`
      }
    ],
    'project_delete': [
      {
        title: 'Delete an empty project',
        example: `project_delete({
  project: "throwaway-test"
})`
      },
      {
        title: 'Delete a non-empty project (must confirm cascade)',
        example: `project_delete({
  project: "old-project",
  confirm: true
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
      },
      {
        title: 'Read back the failed decisions (learning loop)',
        example: `decision_search({
  outcomeStatus: "failed",
  includeOutcome: true
})`
      }
    ],
    'decision_get': [
      {
        title: 'Fetch one decision by id with full outcome detail',
        example: `decision_get({
  decisionId: "123e4567-e89b-12d3-a456-426614174000"
})`
      }
    ],
    'decision_delete': [
      {
        title: 'Soft-delete (archive) a decision by short id',
        example: `decision_delete({
  decisionId: "9f8e7d6c"
})`
      }
    ],
    'decision_restore': [
      {
        title: 'Restore a previously archived decision',
        example: `decision_restore({
  decisionId: "9f8e7d6c"
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
    'task_delete': [
      {
        title: 'Soft-delete (archive) a task by short id',
        example: `task_delete({
  taskId: "59823126"
})`
      }
    ],
    'task_restore': [
      {
        title: 'Restore a previously archived task',
        example: `task_restore({
  taskId: "59823126"
})`
      },
      {
        title: 'See archived tasks, then restore one',
        example: `task_list({ includeArchived: true })
task_restore({ taskId: "59823126" })`
      }
    ]

    // Session Management - DELETED (2025-10-24)
    // 5 session tools removed - sessions auto-manage via SessionTracker service
  };

  /**
   * Parse and format schema properties for display
   */
  private formatSchemaParameters(inputSchema: any, requiredFields: string[] = []): string {
    if (!inputSchema?.properties || Object.keys(inputSchema.properties).length === 0) {
      return '**Parameters:** None\n\n';
    }

    let output = '**Parameters:**\n';

    for (const [propName, propSchema] of Object.entries<any>(inputSchema.properties)) {
      const isRequired = requiredFields.includes(propName);
      const requiredLabel = isRequired ? ' *(required)*' : ' *(optional)*';

      // Format type nicely
      let typeDisplay = propSchema.type || 'any';

      // Handle arrays
      if (typeDisplay === 'array') {
        typeDisplay = 'array';
        if (propSchema.items?.type) {
          typeDisplay = `${propSchema.items.type}[]`;
        }
      }

      // Handle enums - show valid values
      if (propSchema.enum) {
        typeDisplay = propSchema.enum.map((v: any) => `"${v}"`).join(' | ');
      }

      // Handle description
      const description = propSchema.description || 'No description available';

      output += `• \`${propName}\` (${typeDisplay})${requiredLabel} - ${description}\n`;
    }

    output += '\n';
    return output;
  }

  /**
   * Generate categorized help listing of all AIDIS tools
   */
  async getHelp(): Promise<any> {
    // Catalog DERIVED from the single source (AIDIS_TOOL_DEFINITIONS + TOOL_CATEGORIES).
    const catalog = this.buildCatalog();
    // Counts are computed from the derived catalog — never hardcoded.
    const totalTools = catalog.reduce((sum, group) => sum + group.tools.length, 0);
    const totalCategories = catalog.length;

    let helpText = '🚀 **Mandrel**\n\n';
    helpText += `**${totalTools} Tools Available Across ${totalCategories} Categories:**\n\n`;

    for (const { category, tools } of catalog) {
      helpText += `## ${category} (${tools.length} tools)\n`;

      for (const tool of tools) {
        helpText += `• **${tool.name}** - ${tool.description}\n`;
      }
      helpText += '\n';
    }

    helpText += '💡 **Quick Start:**\n';
    helpText += '• `mandrel_explain <toolname>` - Get detailed help for any tool\n';
    helpText += '• `mandrel_examples <toolname>` - See usage examples\n';
    helpText += '• `mandrel_ping` - Test connectivity\n';
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

    // Resolve the tool from the SINGLE SOURCE (AIDIS_TOOL_DEFINITIONS) and its category
    // from the same single source (TOOL_CATEGORIES via categoryForTool) — no separate
    // catalog to disagree with what the MCP tools/list actually advertises.
    const toolDef = AIDIS_TOOL_DEFINITIONS.find(t => t.name === toolName);

    if (!toolDef) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Tool "${toolName}" not found.\n\nUse \`mandrel_help\` to see all available tools.`
          }
        ]
      };
    }

    const category = categoryForTool(toolName) ?? 'Uncategorized';
    const description = toolDef.description;

    let explanation = `🔧 **${toolName}**\n\n`;
    explanation += `**Category:** ${category}\n`;
    explanation += `**Purpose:** ${description}\n\n`;

    if (toolDef.inputSchema) {
      // Parse and display parameters from schema
      const requiredFields = toolDef.inputSchema.required || [];
      explanation += this.formatSchemaParameters(toolDef.inputSchema, requiredFields);
    }

    explanation += `💡 **Quick Tip:** Use \`mandrel_examples ${toolName}\` to see usage examples.`;

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

    // Existence is checked against the SINGLE SOURCE (AIDIS_TOOL_DEFINITIONS), so we
    // never tell a caller a real, registered tool "doesn't exist". The curated example
    // snippets below stay curated content, but a tool with no curated example degrades
    // gracefully (point to mandrel_explain) — it is never reported as missing.
    const toolExists = AIDIS_TOOL_DEFINITIONS.some(t => t.name === toolName);

    if (!toolExists) {
      // Build list of available tools from the single source for a helpful error.
      const allTools = AIDIS_TOOL_DEFINITIONS.map(t => t.name);

      return {
        content: [
          {
            type: 'text',
            text: `❌ Tool "${toolName}" not found.\n\n**Available tools:**\n${allTools.map(t => `• ${t}`).join('\n')}\n\nUse \`mandrel_help\` to see all tools organized by category.`
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
            text: `📝 No examples available yet for "${toolName}".\n\nUse \`mandrel_explain ${toolName}\` for parameter documentation.`
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
    exampleText += `• \`mandrel_explain ${toolName}\` - Get detailed parameter documentation\n`;
    exampleText += `• \`mandrel_help\` - See all available tools by category`;

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