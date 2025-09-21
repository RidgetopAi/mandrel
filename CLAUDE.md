# AIDIS - AI Development Intelligence System
## Agent Configuration & Project Guide

---

## IMMEDIATE ESSENTIALS

### System Status
**AIDIS: 47 MCP Tools - 100% Operational** *(Post TT009 Complete Consolidation)*
- System Health: 2 tools
- Context Management: 4 tools
- Project Management: 6 tools
- Session Management: 5 tools
- Naming Registry: 4 tools
- Technical Decisions: 4 tools
- Task Management: 4 tools
- Code Analysis: 5 tools
- Smart Search & AI: 2 tools
- **Code Complexity: 3 tools** *(Consolidated from 16 tools)*
- **Development Metrics: 3 tools** *(Consolidated from 17 tools)*
- **Pattern Detection: 2 tools** *(Consolidated from 17 tools)*
- Git Integration: 3 tools

### TT009 Complete Tool Consolidation ✅
**96 → 47 Tools: ~22,500 Token Savings Achieved**

**Phase 1 - Complexity Tools (TT009-1)**
- **16 → 3 Tools: ~6,000 Token Savings**
- `complexity_analyze` - File/commit analysis (replaces 4 tools)
- `complexity_insights` - Dashboard/hotspots/trends/debt/opportunities (replaces 5 tools)
- `complexity_manage` - Tracking/alerts/thresholds/performance (replaces 7 tools)

**Phase 2 - Metrics Tools (TT009-2)**
- **17 → 3 Tools: ~6,500 Token Savings**
- `metrics_collect` - Unified collection operations (replaces 6 tools)
- `metrics_analyze` - Analysis/dashboard/trends/correlations (replaces 6 tools)
- `metrics_control` - Control/alerts/performance/export (replaces 5 tools)

**Phase 3 - Pattern Detection (TT009-3)**
- **17 → 2 Tools: ~7,000 Token Savings**
- `pattern_analyze` - Detection/analysis/tracking operations (replaces 10 tools)
- `pattern_insights` - Insights/correlations/recommendations (replaces 7 tools)

**Phase 4 - Academic Removal (TT009-4)**
- **7 → 0 Tools: ~3,000 Token Savings**
- Removed all outcome_* academic tools (not used for practical building)

### Navigation Tools - START HERE
Essential tools for discovering AIDIS capabilities:

- **`aidis_help`** - Show all 47 tools organized by category
- **`aidis_explain <toolname>`** - Get detailed help for any specific tool  
- **`aidis_examples <toolname>`** - See usage examples and patterns

### HTTP Bridge Connection
**AIDIS tools are accessible via HTTP bridge at port 8080**
- **Endpoint Pattern**: `http://localhost:8080/mcp/tools/{toolName}`
- **Method**: POST with JSON body containing tool arguments
- **Test Connection**: Always start with `aidis_ping` to verify the bridge is working

**Quick Test**:
```bash
# Test AIDIS connection (always do this first!)
curl -X POST http://localhost:8080/mcp/tools/aidis_ping \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected response:
# {"success":true,"result":{"content":[{"type":"text","text":"🏓 AIDIS Pong! ..."}]}}
```

### Session Startup Workflow
1. `aidis_ping` - Test HTTP bridge connection (via curl or direct tool call)
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

### Session Management
- **Assign session to project**: `session_assign <projectName>`
- **Check session status**: `session_status`
- **Create new session**: `session_new [title] [projectName]`

### Context Management  
- **Store context**: `context_store(content, type, tags?)`
- **Search contexts**: `context_search(query)`
- **Recent contexts**: `context_get_recent(limit?)`

### Core Tool Categories
- **System**: aidis_ping, aidis_status
- **Context**: context_store, context_search, context_get_recent, context_stats
- **Projects**: project_list, project_create, project_switch, project_current, project_info, project_insights
- **Sessions**: session_assign, session_status, session_new
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

 ### Common AIDIS Parameter Patterns
  - **Arrays**: Pass as actual arrays, not strings: `["tag1", "tag2"]`
  - **Always check examples first**: Use `aidis_examples <tool>` before implementation
  - **Required vs optional**: Use `aidis_explain <tool>` to see what's actually required

 ### AIDIS Tool Troubleshooting
  - **Validation errors**: Usually mean wrong parameter type or format
  - **When in doubt**: Check examples first, explain second, implement third
  - **Array parameters**: Must be actual JSON arrays, not quoted strings
---

**Last Updated**: 2025-09-20
**Tools**: 47 total - *Post TT009 Complete Consolidation (96→47: 51% reduction)*
**Status**: Production ready with streamlined tool architecture and full functionality preserved
**Achievement**: ~22,500 token savings through systematic 4-phase consolidation
