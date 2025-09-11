# AIDIS - AI Development Intelligence System
## Agent Configuration & Project Guide

---

## IMMEDIATE ESSENTIALS

### System Status
**AIDIS: 96 MCP Tools - 100% Operational**
- System Health: 2 tools
- Context Management: 4 tools (includes context_get_recent)
- Project Management: 6 tools  
- Naming Registry: 4 tools
- Technical Decisions: 4 tools
- Multi-Agent Coordination: 11 tools
- Code Analysis: 5 tools
- Smart Search & AI: 2 tools
- **Navigation Tools: 3 tools (NEW!)**

### Navigation Tools - START HERE
Essential tools for discovering AIDIS capabilities:

- **`aidis_help`** - Show all 96 tools organized by category
- **`aidis_explain <toolname>`** - Get detailed help for any specific tool  
- **`aidis_examples <toolname>`** - See usage examples and patterns

### Session Startup Workflow
1. `aidis_ping` - Test connection
2. `aidis_help` - See all available tools
3. `project_current` - Check current project
4. `aidis_explain <tool>` - Get help for tools you want to use

### Current Architecture
- **Backend**: Node.js/TypeScript MCP Server
- **Database**: PostgreSQL with pgvector extension
- **Protocol**: Model Context Protocol (MCP) + HTTP Bridge
- **Embeddings**: Local Transformers.js (zero cost)
- **Access**: Dual protocol support (MCP STDIO + HTTP)

---

## ESSENTIAL REFERENCE

### Project Management
- **Switch projects**: `project_switch <name>`
- **Current project**: `project_current` 
- **List projects**: `project_list`

### Context Management  
- **Store context**: `context_store(content, type, tags?)`
- **Search contexts**: `context_search(query)`
- **Recent contexts**: `context_get_recent(limit?)`

### Core Tool Categories
- **System**: aidis_ping, aidis_status
- **Context**: context_store, context_search, context_get_recent, context_stats
- **Projects**: project_list, project_create, project_switch, project_current, project_info, project_insights
- **Naming**: naming_register, naming_check, naming_suggest, naming_stats
- **Decisions**: decision_record, decision_search, decision_update, decision_stats

### Partnership Guidelines
**AI Role**: Lead Developer and Mentor
**Approach**: Collaborative partnership on multi-week projects
**Communication**: Professional, explanatory, mentoring when needed

**Quality Principles**:
- Incremental development over speed
- Test after each change
- Fix errors to conform to standards
- Systematic approach using reference guides
- Always find solutions

**Development Workflow**:
1. Implement features/fixes incrementally
2. Test and validate thoroughly
3. Review before proceeding
4. Fix issues before moving to next task

### Agent Coordination
**Two-Layer System**:
1. **AIDIS Virtual Agents**: Use agent_register, task_create for coordination
2. **Real Sub-Agents**: Use Task tool to spawn agents that create/edit files

**Specialized Agents**:
- **CodeAgent**: Primary development with naming compliance
- **ProjectManager**: Coordination, planning, decision tracking  
- **QaAgent**: Quality assurance, testing, validation

---

## TECHNICAL REFERENCE

### Database Configuration
- **Database**: aidis_production
- **Port**: 5432 
- **Connection**: postgresql://ridgetop@localhost:5432/aidis_production
- **Test**: `psql -h localhost -p 5432 -d aidis_production -c "SELECT current_database();"`

### Development Commands
```bash
# Essential Commands
npm install                    # Install dependencies
npx tsx src/server.ts          # Start AIDIS MCP server
npm run lint                   # ESLint check
npm run type-check            # TypeScript check

# Testing  
npx tsx test-complete-aidis.ts # Test all systems
```

### Process Management Scripts
```bash
./start-aidis.sh              # Start server
./stop-aidis.sh               # Stop server  
./restart-aidis.sh            # Restart server
./status-aidis.sh             # Check status
```

### Key Tool Parameters
```typescript
// Navigation (NEW!)
aidis_help()
aidis_explain(toolName: string)
aidis_examples(toolName: string)

// System Health
aidis_ping(message?: string)
aidis_status()

// Context Management
context_store(content: string, type: string, tags?: string[])
context_search(query: string, limit?: number, type?: string)
context_get_recent(limit?: number, projectId?: string)

// Project Management
project_current()
project_switch(project: string)
project_list(includeStats?: boolean)

// Essential Parameters Only - Use aidis_explain for complete reference
```

### Reference Guides
- **Comprehensive MCP Guide**: `AIDIS_MCP_SERVER_REFERENCE_GUIDE.md`
- **Tool Parameters**: Use `aidis_explain <toolname>` for current info
- **Examples**: Use `aidis_examples <toolname>` for usage patterns

---

**Last Updated**: 2025-08-24  
**Tools**: 41 total (38 core + 3 navigation)  
**Status**: Production ready with dual AI collaboration support
