## Agent Configuration & Project Guide

---

## IMMEDIATE ESSENTIALS

### System Status
**AIDIS: 41 MCP Tools - 100% Operational** *(Optimized for token efficiency)*
- System Health: 2 tools
- Navigation: 3 tools (help, explain, examples)
- Context Management: 4 tools
- Project Management: 6 tools
- Session Management: 5 tools
- Naming Registry: 4 tools
- Technical Decisions: 4 tools
- Task Management: 6 tools
- Smart Search & AI: 2 tools
- **Development Metrics: 3 tools** *(Consolidated from 17 tools)*
- **Pattern Detection: 2 tools** *(Consolidated from 17 tools)*

### Token Optimization (2025-10-01) ✅ COMPLETE

**Phase 1: Tool Consolidation (TT009)**
- Consolidated 50 individual tools → 8 unified tools (84% reduction)
- Metrics: 17 → 3 tools | Patterns: 17 → 2 tools | Complexity: 16 → 3 tools (DISABLED)

**Phase 2: Strategic Tool Disabling**
- Disabled 11 unused tools (5 code analysis, 3 git correlation, 3 complexity)
- Active tools: 52 → 41 tools (21% reduction)

**Phase 3: Schema Simplification**
- Simplified all 41 tool schemas using description-based guidance
- Removed verbose enums, nested schemas, default values
- Added `additionalProperties: true` for flexibility

**Total Token Optimization:**
- Before: ~27,500 tokens (530 tokens/tool × 52 tools)
- After: ~12,300 tokens (300 tokens/tool × 41 tools)
- **Savings: 15,200 tokens (55% reduction)**
- Server-side validation maintains data integrity
- Zero breaking changes, all functionality preserved

### Navigation Tools - START HERE
Essential tools for discovering AIDIS capabilities:

- **`aidis_help`** - Show all 41 tools organized by category
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
**MCP Tools (5 - for AI agents):**
- **Assign session to project**: `session_assign <projectName>`
- **Check session status**: `session_status`
- **Create new session**: `session_new [title] [projectName]`
- **Update session metadata**: `session_update(title?, description?)`
- **Get session details**: `session_details(sessionId?)`

**REST API (8 endpoints - for AIDIS Command UI):**
- `POST /api/v2/sessions/:id/activities` - Record session activity
- `GET /api/v2/sessions/:id/activities` - Get activity timeline
- `POST /api/v2/sessions/:id/files` - Record file modifications
- `GET /api/v2/sessions/:id/files` - Get modified files
- `POST /api/v2/sessions/:id/productivity` - Calculate productivity score
- `GET /api/v2/sessions` - List sessions (with filters/pagination)
- `GET /api/v2/sessions/stats` - Aggregate statistics
- `GET /api/v2/sessions/compare` - Compare two sessions

**Automation:** Session activities auto-tracked when using context_store, task_create, decision_record, naming_register

### Context Management  
- **Store context**: `context_store(content, type, tags?)`
    - **Valid types**: code, decision, error, discussion, planning, completion, milestone, reflections, handoff
    - Use `completion` for finished features/fixes
    - Use `milestone` for major achievements
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

---

## **THE FOREVER WORKFLOW - NEVER DEVIATE**

### **Core Principles (ABSOLUTE)**
1. **Systematic Investigation First** - Deploy investigation subagent, find root causes
2. **No Guessing or Assumptions** - Evidence-based analysis with code locations
3. **Review Findings Together** - Partner validates investigation before implementation
4. **Surgical Implementation** - Deploy implementation subagent with specific requirements
5. **Production Quality** - TypeScript, build validation, comprehensive testing

### **Partnership Protocol (MANDATORY)**
- **Tone**: Professional, systematic, no rushing whatsoever
- **Rigid Focus**: One issue at a time, complete resolution before moving on
- **No Cutting Corners**: Full investigation → evidence → review → targeted fix
- **AIDIS Task Tracking**: Create tasks, update status, track systematically
- **Context Storage**: Store learning contexts and handoffs for continuity

### **Investigation Standards (NEVER COMPROMISE)**
- **Trace complete code paths** - from user action to root cause
- **Find exact file locations and line numbers** - specific evidence required
- **Identify precise timing/logic issues** - understand WHY it's failing
- **Provide actionable solutions** - clear path to implementation
- **No shortcuts** - thorough analysis every single time

### **Implementation Quality (PRODUCTION READY)**
- **TypeScript compilation passes** - no type errors tolerated
- **Build validation successful** - production-ready code only
- **Backward compatibility maintained** - never break existing functionality
- **Performance optimized** - React best practices, efficient patterns
- **Clean, maintainable code** - proper patterns, clear documentation

---

## TECHNICAL REFERENCE

### Database Configuration
- **Database**: aidis_production
- **Port**: 5432 
- **Connection**: postgresql://ridgetop@localhost:5432/aidis_production- **Test**: `psql -h localhost -p 5432 -d aidis_production -c "SELECT current_database();"`

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

**Last Updated**: 2025-10-05
**Tools**: 41 active MCP tools (5 session operational + 36 other tools)
**REST API**: 8 session analytics endpoints at /api/v2/sessions/* (for AIDIS Command UI)
**Token Usage**: ~12,300 tokens (optimized with automation hooks)
**Status**: Production ready with REST API for external integrations and auto-tracking

