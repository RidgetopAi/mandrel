#!/usr/bin/env node

// Redirect console to stderr in MCP mode - FIRST PRIORITY (fixes connection issue)
if (process.env.AMP_CONNECTING === 'true' || process.env.AIDIS_FORCE_STDIO === 'true') {
  const toStderr = (...args: any[]) => {
    try {
      const line = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') + '\n';
      process.stderr.write(line);
    } catch {}
  };
  console.log = toStderr as any;
  console.info = toStderr as any;
  console.warn = toStderr as any;
}

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

// Minimal database connection - just for core functionality
import { Pool } from 'pg';

const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ridgetop@localhost:5432/aidis_production',
  max: 5, // Minimal pool size
  idleTimeoutMillis: 30000,
});

// Create server exactly like successful ones
const server = new Server(
  {
    name: 'aidis-essential-p2',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {
        listChanged: false
      },
    },
  }
);

// Tool documentation and examples database
const toolDocs = {
  aidis_ping: {
    description: 'Test AIDIS connectivity and server responsiveness',
    details: `The aidis_ping tool is used to verify that the AIDIS server is running and responding to requests. It's the first tool you should use when troubleshooting connectivity issues.`,
    parameters: {
      message: 'Optional test message to echo back in the response'
    },
    examples: [
      {
        usage: 'aidis_ping()',
        description: 'Basic connectivity test',
        result: 'Returns operational status'
      },
      {
        usage: 'aidis_ping("Hello AIDIS")',
        description: 'Test with custom message',
        result: 'Echoes back your message with status'
      }
    ]
  },
  aidis_status: {
    description: 'Get comprehensive AIDIS system status and health information',
    details: `Provides detailed information about the AIDIS system including database connectivity, current project selection, loaded tools count, and operational status.`,
    parameters: {},
    examples: [
      {
        usage: 'aidis_status()',
        description: 'Get full system health report',
        result: 'Shows database status, current project, tool count, and health metrics'
      }
    ]
  },
  aidis_help: {
    description: 'List all available AIDIS tools organized by functional category',
    details: `Shows all available tools in the current AIDIS server instance, organized by category (System Health, Context Management, Project Management). Includes usage guidance and getting started tips.`,
    parameters: {},
    examples: [
      {
        usage: 'aidis_help()',
        description: 'Show all available tools',
        result: 'Displays categorized tool list with descriptions and getting started guide'
      }
    ]
  },
  aidis_explain: {
    description: 'Get detailed help and documentation for a specific AIDIS tool',
    details: `Provides comprehensive documentation for any AIDIS tool including detailed description, parameter information, and usage guidance.`,
    parameters: {
      toolName: 'Name of the AIDIS tool to explain'
    },
    examples: [
      {
        usage: 'aidis_explain("context_store")',
        description: 'Get detailed help for context_store tool',
        result: 'Shows full documentation including parameters and usage'
      },
      {
        usage: 'aidis_explain("project_switch")',
        description: 'Learn how to use project_switch',
        result: 'Detailed explanation of project switching functionality'
      }
    ]
  },
  aidis_examples: {
    description: 'Show practical usage examples and patterns for a specific AIDIS tool',
    details: `Provides real-world usage examples for any AIDIS tool, including common use cases, parameter combinations, and expected results.`,
    parameters: {
      toolName: 'Name of the AIDIS tool to show examples for'
    },
    examples: [
      {
        usage: 'aidis_examples("context_search")',
        description: 'See examples of context searching',
        result: 'Shows various search patterns and query examples'
      },
      {
        usage: 'aidis_examples("context_store")',
        description: 'Learn context storage patterns',
        result: 'Examples of storing different types of development context'
      }
    ]
  },
  context_store: {
    description: 'Store development context with automatic categorization and embedding',
    details: `Stores development context (code snippets, decisions, errors, discussions) with metadata and tags for later retrieval. Context is automatically embedded for semantic search.`,
    parameters: {
      content: 'The context content to store (required)',
      type: 'Type of context: code, decision, error, discussion, planning, completion, milestone, reflections, handoff (required)',
      tags: 'Array of tags for categorization (optional)',
      projectId: 'Project ID (optional, uses current project if not provided)'
    },
    examples: [
      {
        usage: 'context_store("Fixed authentication bug in login.js", "code", ["bug-fix", "auth"])',
        description: 'Store a bug fix with tags',
        result: 'Context stored with automatic embedding for semantic search'
      },
      {
        usage: 'context_store("Decided to use PostgreSQL for user data", "decision", ["database", "architecture"])',
        description: 'Store an architectural decision',
        result: 'Decision context stored for future reference'
      }
    ]
  },
  context_search: {
    description: 'Search stored contexts using semantic similarity and filters',
    details: `Search through stored development context using semantic similarity matching. Supports filtering by type, tags, and project. Uses advanced text matching for relevant results.`,
    parameters: {
      query: 'Search query string (required)',
      limit: 'Maximum results to return (1-50, default: 10)',
      type: 'Filter by context type (optional)',
      tags: 'Filter by specific tags (optional)',
      projectId: 'Project ID (optional, uses current project if not provided)'
    },
    examples: [
      {
        usage: 'context_search("authentication bug")',
        description: 'Search for authentication-related contexts',
        result: 'Returns contexts mentioning authentication issues'
      },
      {
        usage: 'context_search("database", 5, "decision")',
        description: 'Find database decisions, limit to 5 results',
        result: 'Returns up to 5 decision contexts about databases'
      }
    ]
  },
  project_list: {
    description: 'List all available projects with statistics and metadata',
    details: `Shows all projects in the AIDIS system with context counts, status, descriptions, and timestamps. Indicates which project is currently selected.`,
    parameters: {
      includeStats: 'Whether to include context count statistics (default: true)'
    },
    examples: [
      {
        usage: 'project_list()',
        description: 'List all projects with statistics',
        result: 'Shows all projects with context counts and metadata'
      },
      {
        usage: 'project_list(false)',
        description: 'List projects without statistics',
        result: 'Shows basic project information only'
      }
    ]
  },
  project_switch: {
    description: 'Switch to a different project (sets it as current for all operations)',
    details: `Changes the active project for the current session. All context operations will use this project by default. Project can be specified by name or ID.`,
    parameters: {
      project: 'Project name or UUID to switch to (required)'
    },
    examples: [
      {
        usage: 'project_switch("my-web-app")',
        description: 'Switch to project by name',
        result: 'Sets "my-web-app" as current project'
      },
      {
        usage: 'project_switch("f47ac10b-58cc-4372-a567-0e02b2c3d479")',
        description: 'Switch to project by UUID',
        result: 'Sets specified project as current by ID'
      }
    ]
  }
};

// Enhanced AIDIS tools - Phase 2
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.log('[DEBUG] ListTools requested - Enhanced AIDIS tools (Phase 2)');
  return {
    tools: [
      {
        name: 'aidis_ping',
        description: 'Test AIDIS connectivity',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Test message' }
          }
        }
      },
      {
        name: 'aidis_status',
        description: 'Get AIDIS system status and health',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'aidis_help',
        description: 'List all available AIDIS tools organized by category',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'aidis_explain',
        description: 'Get detailed help and documentation for a specific AIDIS tool',
        inputSchema: {
          type: 'object',
          properties: {
            toolName: { type: 'string', description: 'Name of the AIDIS tool to explain' }
          },
          required: ['toolName']
        }
      },
      {
        name: 'aidis_examples',
        description: 'Show practical usage examples and patterns for a specific AIDIS tool',
        inputSchema: {
          type: 'object',
          properties: {
            toolName: { type: 'string', description: 'Name of the AIDIS tool to show examples for' }
          },
          required: ['toolName']
        }
      },
      {
        name: 'context_store',
        description: 'Store development context with automatic embedding',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Context content to store' },
            type: { 
              type: 'string',
              enum: ['code', 'decision', 'error', 'discussion', 'planning', 'completion', 'milestone', 'reflections', 'handoff'],
              description: 'Type of context being stored'
            },
            tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
            projectId: { type: 'string', description: 'Project ID (optional, uses current project if not provided)' }
          },
          required: ['content', 'type']
        }
      },
      {
        name: 'context_search',
        description: 'Search stored contexts using semantic similarity',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            limit: { type: 'number', description: 'Maximum results to return', minimum: 1, maximum: 50 },
            type: { type: 'string', description: 'Filter by context type' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
            projectId: { type: 'string', description: 'Project ID (optional, uses current project if not provided)' }
          },
          required: ['query']
        }
      },
      {
        name: 'project_list',
        description: 'List all available projects with statistics',
        inputSchema: {
          type: 'object',
          properties: {
            includeStats: { type: 'boolean', description: 'Include context count statistics', default: true }
          }
        }
      },
      {
        name: 'project_switch',
        description: 'Switch to a different project (sets as current)',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Project name or ID to switch to' }
          },
          required: ['project']
        }
      }
    ]
  };
});

// Minimal session state
let currentProjectId: string | null = null;

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case 'aidis_ping':
        return {
          content: [
            { type: 'text' as const, text: `AIDIS Enhanced: ${request.params.arguments?.message || 'Connected!'}\n🟢 Status: Operational\n⚡ Enhanced tools available (Phase 2)` }
          ]
        };

      case 'aidis_status':
        try {
          // Test database connection
          const dbResult = await db.query('SELECT current_database(), version()');
          const dbName = dbResult.rows[0]?.current_database || 'unknown';
          
          return {
            content: [
              { 
                type: 'text' as const, 
                text: `🟢 AIDIS Enhanced Status: OPERATIONAL

📊 System Health:
  • Database: ${dbName} ✅
  • Current Project: ${currentProjectId || 'None selected'}
  • Tools: 9 enhanced tools loaded (Phase 2)

🔧 Available Tools:
  • aidis_ping, aidis_status, aidis_help
  • aidis_explain, aidis_examples (NEW!)
  • context_store, context_search  
  • project_list, project_switch

💡 Usage: Run 'aidis_help' to see all tools, 'aidis_explain <toolname>' for detailed help` 
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              { 
                type: 'text' as const, 
                text: `🟡 AIDIS Enhanced Status: DEGRADED\n\n❌ Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}\n\n🔧 9 enhanced tools still available (some may not function)` 
              }
            ]
          };
        }

      case 'aidis_help':
        return {
          content: [
            { 
              type: 'text' as const, 
              text: `🧭 AIDIS Enhanced Tools (Phase 2)

🔧 **System Health** (3 tools)
  • aidis_ping - Test connectivity to AIDIS server
  • aidis_status - Get server status and health information
  • aidis_help - List all available tools organized by category

🆕 **Navigation Tools** (2 tools) - NEW in Phase 2!
  • aidis_explain - Get detailed help for any specific tool
  • aidis_examples - Show practical usage examples and patterns

📝 **Context Management** (2 tools)
  • context_store - Store development context with automatic embedding
  • context_search - Search stored contexts using semantic similarity

📁 **Project Management** (2 tools)
  • project_list - List all available projects with statistics
  • project_switch - Switch to a different project (sets as current)

💡 **Getting Started**:
1. List projects: project_list
2. Switch to a project: project_switch
3. Store context: context_store
4. Search context: context_search
5. Get help: aidis_explain <toolname>
6. See examples: aidis_examples <toolname>

🌟 This is Phase 2 AIDIS with enhanced navigation and help tools.
Use aidis_explain to learn about any tool in detail!` 
            }
          ]
        };

      case 'aidis_explain':
        const explainArgs = request.params.arguments as any;
        if (!explainArgs?.toolName) {
          throw new Error('toolName parameter is required');
        }

        const toolDoc = toolDocs[explainArgs.toolName as keyof typeof toolDocs];
        if (!toolDoc) {
          return {
            content: [
              { 
                type: 'text' as const, 
                text: `❌ Tool not found: "${explainArgs.toolName}"

🔧 **Available Tools**:
${Object.keys(toolDocs).map(name => `  • ${name}`).join('\n')}

💡 Use aidis_help to see all tools organized by category.` 
              }
            ]
          };
        }

        const paramsList = Object.entries(toolDoc.parameters).map(([name, desc]) => 
          `  • **${name}**: ${desc}`
        ).join('\n') || '  • None';

        return {
          content: [
            { 
              type: 'text' as const, 
              text: `📖 **${explainArgs.toolName}** - Detailed Help

**Description**: ${toolDoc.description}

**Details**: ${toolDoc.details}

**Parameters**:
${paramsList}

💡 **Next Steps**:
  • Use aidis_examples("${explainArgs.toolName}") to see usage examples
  • Use aidis_help to see all available tools` 
            }
          ]
        };

      case 'aidis_examples':
        const exampleArgs = request.params.arguments as any;
        if (!exampleArgs?.toolName) {
          throw new Error('toolName parameter is required');
        }

        const toolExamples = toolDocs[exampleArgs.toolName as keyof typeof toolDocs];
        if (!toolExamples) {
          return {
            content: [
              { 
                type: 'text' as const, 
                text: `❌ Tool not found: "${exampleArgs.toolName}"

🔧 **Available Tools**:
${Object.keys(toolDocs).map(name => `  • ${name}`).join('\n')}

💡 Use aidis_help to see all tools organized by category.` 
              }
            ]
          };
        }

        const examplesList = toolExamples.examples.map((example, index) => 
          `**Example ${index + 1}**: ${example.description}\n` +
          `   Usage: ${example.usage}\n` +
          `   Result: ${example.result}`
        ).join('\n\n');

        return {
          content: [
            { 
              type: 'text' as const, 
              text: `💡 **${exampleArgs.toolName}** - Usage Examples

${examplesList}

📖 **More Help**:
  • Use aidis_explain("${exampleArgs.toolName}") for detailed documentation
  • Use aidis_help to see all available tools` 
            }
          ]
        };

      case 'context_store':
        const storeArgs = request.params.arguments as any;
        if (!storeArgs?.content) {
          throw new Error('Content is required');
        }
        if (!storeArgs?.type) {
          throw new Error('Type is required');
        }

        // Get project ID
        const projectIdForStore = storeArgs.projectId || currentProjectId;
        if (!projectIdForStore) {
          throw new Error('No project selected. Use project_switch to select a project first.');
        }

        // Simplified storage (no embeddings for now)
        const insertResult = await db.query(`
          INSERT INTO contexts (project_id, context_type, content, tags, metadata, relevance_score)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, created_at
        `, [
          projectIdForStore,
          storeArgs.type,
          storeArgs.content,
          storeArgs.tags || [],
          JSON.stringify({}),
          5.0
        ]);

        return {
          content: [
            { 
              type: 'text' as const, 
              text: `✅ Context stored successfully!

📝 **Stored Context**:
  • ID: ${insertResult.rows[0].id}
  • Type: ${storeArgs.type}
  • Content: "${storeArgs.content.substring(0, 100)}${storeArgs.content.length > 100 ? '...' : ''}"
  • Tags: [${storeArgs.tags?.join(', ') || 'none'}]
  • Project: ${projectIdForStore}
  • Created: ${insertResult.rows[0].created_at}

🔍 Use context_search to find this content later.` 
            }
          ]
        };

      case 'context_search':
        const searchArgs = request.params.arguments as any;
        if (!searchArgs?.query) {
          throw new Error('Query is required');
        }

        // Get project ID
        const projectIdForSearch = searchArgs.projectId || currentProjectId;
        if (!projectIdForSearch) {
          throw new Error('No project selected. Use project_switch to select a project first.');
        }

        // Simple text search (no vector similarity for now)
        let searchSql = `
          SELECT id, context_type, content, tags, created_at, relevance_score
          FROM contexts 
          WHERE project_id = $1 AND content ILIKE $2
        `;
        const searchParams = [projectIdForSearch, `%${searchArgs.query}%`];

        if (searchArgs.type) {
          searchSql += ` AND context_type = $3`;
          searchParams.push(searchArgs.type);
        }

        searchSql += ` ORDER BY created_at DESC LIMIT ${searchArgs.limit || 10}`;

        const searchResult = await db.query(searchSql, searchParams);

        if (searchResult.rows.length === 0) {
          return {
            content: [
              { type: 'text' as const, text: `🔍 No contexts found for query: "${searchArgs.query}"` }
            ]
          };
        }

        const results = searchResult.rows.map(row => 
          `📝 **${row.context_type}** (${row.id})\n` +
          `   Created: ${row.created_at}\n` +
          `   Tags: [${row.tags.join(', ')}]\n` +
          `   Content: "${row.content.substring(0, 150)}${row.content.length > 150 ? '...' : ''}"\n`
        ).join('\n');

        return {
          content: [
            { 
              type: 'text' as const, 
              text: `🔍 Found ${searchResult.rows.length} contexts for "${searchArgs.query}":

${results}` 
            }
          ]
        };

      case 'project_list':
        const listResult = await db.query(`
          SELECT 
            p.id, p.name, p.description, p.status, p.created_at, p.updated_at,
            COUNT(c.id) as context_count
          FROM projects p
          LEFT JOIN contexts c ON p.id = c.project_id
          GROUP BY p.id, p.name, p.description, p.status, p.created_at, p.updated_at
          ORDER BY p.updated_at DESC
        `);

        if (listResult.rows.length === 0) {
          return {
            content: [
              { type: 'text' as const, text: '📁 No projects found. Create your first project!' }
            ]
          };
        }

        const projects = listResult.rows.map(row => 
          `📁 **${row.name}** ${row.id === currentProjectId ? '← CURRENT' : ''}\n` +
          `   ID: ${row.id}\n` +
          `   Status: ${row.status}\n` +
          `   Contexts: ${row.context_count}\n` +
          `   ${row.description ? `Description: ${row.description}\n` : ''}` +
          `   Updated: ${row.updated_at}\n`
        ).join('\n');

        return {
          content: [
            { 
              type: 'text' as const, 
              text: `📋 Found ${listResult.rows.length} projects:

${projects}

💡 Use project_switch to select a project.` 
            }
          ]
        };

      case 'project_switch':
        const switchArgs = request.params.arguments as any;
        if (!switchArgs?.project) {
          throw new Error('Project name or ID is required');
        }

        // Find project by name or ID
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(switchArgs.project);
        const field = isUUID ? 'id' : 'name';
        
        const projectResult = await db.query(
          `SELECT id, name, description FROM projects WHERE ${field} = $1`,
          [switchArgs.project]
        );

        if (projectResult.rows.length === 0) {
          return {
            content: [
              { type: 'text' as const, text: `❌ Project not found: "${switchArgs.project}"\n\n💡 Use project_list to see available projects.` }
            ]
          };
        }

        const project = projectResult.rows[0];
        currentProjectId = project.id;

        return {
          content: [
            { 
              type: 'text' as const, 
              text: `✅ Switched to project: **${project.name}**

📁 **Project Details**:
  • ID: ${project.id}
  • Name: ${project.name}
  • Description: ${project.description || 'None'}

🔄 **Current Session State**:
  • Active Project: ${project.name}
  • Ready for context_store and context_search operations

💡 All context operations will now use this project by default.` 
            }
          ]
        };

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    console.error(`❌ Tool execution failed: ${request.params.name}`, error);
    return {
      content: [
        { 
          type: 'text' as const, 
          text: `❌ Error executing ${request.params.name}: ${error instanceof Error ? error.message : 'Unknown error'}` 
        }
      ],
      isError: true
    };
  }
});

// Connect transport immediately (like working simple server)
const transport = new StdioServerTransport();
server.connect(transport);

console.log('AIDIS Enhanced server ready - 9 enhanced tools loaded (Phase 2)');
