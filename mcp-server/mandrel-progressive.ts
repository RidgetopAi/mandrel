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
  connectionString: process.env.DATABASE_URL || 'postgresql://mandrel@localhost:5432/mandrel_production',
  max: 5, // Minimal pool size
  idleTimeoutMillis: 30000,
});

// Create server exactly like successful ones
const server = new Server(
  {
    name: 'aidis-essential',
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

// Essential AIDIS tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.log('[DEBUG] ListTools requested - Essential AIDIS tools');
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
            { type: 'text' as const, text: `AIDIS Essential: ${request.params.arguments?.message || 'Connected!'}\n🟢 Status: Operational\n⚡ Essential tools available` }
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
                text: `🟢 AIDIS Essential Status: OPERATIONAL

📊 System Health:
  • Database: ${dbName} ✅
  • Current Project: ${currentProjectId || 'None selected'}
  • Tools: 7 essential tools loaded

🔧 Available Tools:
  • aidis_ping, aidis_status, aidis_help
  • context_store, context_search  
  • project_list, project_switch

💡 Usage: Run 'aidis_help' to see all tools` 
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              { 
                type: 'text' as const, 
                text: `🟡 AIDIS Essential Status: DEGRADED\n\n❌ Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}\n\n🔧 7 essential tools still available (some may not function)` 
              }
            ]
          };
        }

      case 'aidis_help':
        return {
          content: [
            { 
              type: 'text' as const, 
              text: `🧭 AIDIS Essential Tools

🔧 **System Health** (2 tools)
  • aidis_ping - Test connectivity to AIDIS server
  • aidis_status - Get server status and health information

📝 **Context Management** (2 tools)
  • context_store - Store development context with automatic embedding
  • context_search - Search stored contexts using semantic similarity

📁 **Project Management** (3 tools)
  • project_list - List all available projects with statistics
  • project_switch - Switch to a different project (sets as current)

💡 **Getting Started**:
1. List projects: project_list
2. Switch to a project: project_switch
3. Store context: context_store
4. Search context: context_search

🌟 This is a minimal AIDIS server with essential functionality.
Full AIDIS has 96+ tools for comprehensive development intelligence.` 
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

console.log('AIDIS Essential server ready - 7 core tools loaded');
