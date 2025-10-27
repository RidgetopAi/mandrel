# AIDIS MCP Configuration for Claude Code

## MCP Server Configuration

Add this to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "aidis": {
      "command": "npx",
      "args": ["tsx", "src/server.ts"],
      "cwd": "/home/ridgetop/aidis/mcp-server",
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

## About AIDIS

**AIDIS (AI Development Intelligence System)** is a comprehensive context management platform that enables AI coding agents to maintain consistency, track decisions, and collaborate effectively across multi-week software development projects.

### Core Purpose
- **Persistent Memory**: Store and retrieve development context across sessions
- **Decision Tracking**: Record and reference architectural decisions
- **Multi-Agent Coordination**: Enable multiple AI agents to collaborate
- **Project Management**: Multi-project workflows with context switching
- **Naming Consistency**: Enforce consistent naming across project lifetime

### Technology Stack
- **Backend**: Node.js/TypeScript MCP Server
- **Database**: PostgreSQL with pgvector extension for semantic search
- **Protocol**: Model Context Protocol (MCP)
- **Embeddings**: Local Transformers.js (all-MiniLM-L6-v2) - zero cost
- **Search**: Vector embeddings for semantic similarity

### Available MCP Tools (37 total)

#### System Health (2 tools)
- `aidis_ping` - Test connectivity
- `aidis_status` - Get system status

#### Context Management (3 tools)
- `context_store(content, type, tags?)` - Store development context
- `context_search(query)` - Semantic search of stored contexts  
- `context_stats()` - Get context statistics

#### Project Management (6 tools)
- `project_list()` - List all projects
- `project_create(name, description?)` - Create new project
- `project_switch(project)` - Switch active project
- `project_current()` - Get current project info
- `project_info(project)` - Get detailed project info
- `project_insights()` - Get project analytics

#### Naming Registry (4 tools)
- `naming_register(name, type, description?)` - Register name to prevent conflicts
- `naming_check(name, type)` - Check if name is available
- `naming_suggest(baseName, type)` - Get naming suggestions
- `naming_stats()` - Get naming statistics

#### Technical Decisions (4 tools)
- `decision_record(title, problem, decision, rationale?)` - Record decision
- `decision_search(query)` - Search decisions
- `decision_update(decisionId, outcome?, lessons?)` - Update decision
- `decision_stats()` - Get decision statistics

#### Multi-Agent Coordination (11 tools)
- `agent_register(name, type?)` - Register virtual agent
- `agent_list()` - List all agents
- `agent_status(agentId?)` - Get agent status
- `agent_join(agentId)` - Join agent to session
- `agent_leave(agentId)` - Remove agent from session
- `agent_sessions(agentId?)` - Get session info
- `agent_message(fromAgentId, content, toAgentId?)` - Send message
- `agent_messages(agentId?, limit?)` - Get messages
- `task_create(title, description?)` - Create task
- `task_list(status?)` - List tasks
- `task_update(taskId, status?, progress?)` - Update task

#### Code Analysis (5 tools)
- `code_analyze(filePath)` - Analyze code structure
- `code_components()` - List code components
- `code_dependencies()` - Get dependency info
- `code_impact(componentId, changeType?)` - Analyze change impact
- `code_stats()` - Get code analysis statistics

#### Smart Search & AI (2 tools)
- `smart_search(query)` - Cross-system intelligent search
- `get_recommendations(context?, type?)` - Get AI recommendations

### Database Schema
- **PostgreSQL** on localhost:5432
- **Production DB**: `aidis_production`
- **Development DB**: `aidis_development`
- **Key tables**: contexts, projects, technical_decisions, agents, tasks, naming_registry, code_components

### Current Project Context
- **Active Project**: AIDIS COMMAND (database admin/viewer tool)
- **Working on**: aidis-command-dev UI - React dashboard for AIDIS data management
- **Issue**: Decisions page loads but shows 0 decisions (data flow problem)

### Development Workflow
1. Use `project_current()` to see active project
2. Use `context_search(query)` to find relevant past work
3. Use `context_store(content, type, tags)` to save progress
4. Use `decision_record()` for architectural choices
5. Use `task_create()` and `task_update()` for tracking work

### Example Usage
```typescript
// Switch to project
await use_mcp_tool("aidis", "project_switch", { project: "AIDIS COMMAND" });

// Search for relevant context
await use_mcp_tool("aidis", "context_search", { query: "decisions page debugging" });

// Store new findings
await use_mcp_tool("aidis", "context_store", { 
  content: "Found issue with data flow in decisions page",
  type: "milestone",
  tags: ["debugging", "decisions", "frontend"]
});
```

The MCP server runs via SystemD service on port 8080 and provides persistent memory across all development sessions.
