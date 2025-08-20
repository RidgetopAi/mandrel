# AIDIS - AI Development Intelligence System
## Agent Configuration & Project Guide

### Project Overview
AIDIS is a comprehensive context management platform that enables AI coding agents to maintain consistency, track decisions, and collaborate effectively across multi-week software development projects. This system uses MCP (Model Context Protocol) and PostgreSQL to create a persistent memory layer for AI agents.

### Technology Stack
- Backend: Node.js/TypeScript MCP Server
- Database: PostgreSQL with pgvector extension for semantic search
- Protocol: Model Context Protocol (MCP)
- Embedding: Vector embeddings for semantic search (384 dimensions - LOCAL)
- AI Models: Transformers.js (all-MiniLM-L6-v2) - ZERO COST EMBEDDINGS
- Testing: Custom test suites, full system verification

### Development Commands
```bash
# Project Setup
npm install                    # Install dependencies
npx tsx scripts/migrate.ts     # Run database migrations
npx tsx src/server.ts          # Start AIDIS MCP server

# Testing Commands (ALL WORKING)
npx tsx test-db-simple.ts                # Test database connectivity
npx tsx test-embedding.ts               # Test local embedding generation
npx tsx test-context-tools.ts           # Test context storage + search
npx tsx test-project-management.ts      # Test project switching
npx tsx test-complete-aidis.ts          # Test ALL systems together
npx tsx test-agent-coordination.ts      # Test multi-agent coordination
npx tsx test-code-analysis.ts           # Test code analysis system
npx tsx cleanup-test-data.ts            # Clean up test data

# Development
npm run dev                   # Start development server (when implemented)
npm run build                 # Build for production
npm run start                 # Start production server

# Code Quality
npm run lint                  # Run ESLint
npm run type-check            # TypeScript type checking
npm run format                # Format code with Prettier
```

### Project Structure

aidis/
├── mcp-server/              # MCP server implementation
│   ├── src/
│   │   ├── server.ts        # Main MCP server entry
│   │   ├── handlers/        # Request handlers
│   │   ├── services/        # Business logic services
│   │   ├── models/          # Database models
│   │   └── utils/           # Utilities
│   ├── database/
│   │   ├── migrations/      # SQL migrations
│   │   └── seeds/           # Seed data
│   └── tests/               # Test files
├── client/                  # Client libraries
├── docs/                    # Documentation
└── scripts/                 # Setup/maintenance scripts

### 🎯 CURRENT STATUS (Updated 2025-08-20)
**SUCCESS RATE: 30/37 tools = 81% operational** ⬆️ *Up from 59%*

**✅ COMPLETE CATEGORIES (4/8):**
- System Health: 2/2 = 100% ✅
- Context Management: 3/3 = 100% ✅ **(milestone fix resolved!)**
- Project Management: 6/6 = 100% ✅
- Naming Registry: 4/4 = 100% ✅

**🔧 IN PROGRESS:**
- Technical Decisions: 3/4 = 75% (decision_update needs fix)
- Multi-Agent Coordination: 5/11 = 45% (6 tools untested)
- Code Analysis: 4/5 = 80% (code_impact parameter fix needed)
- Smart Search & AI: 1/2 = 50% (get_recommendations enum fix needed)

**🎯 TARGET: Push to 90%+ in next session**
- projects: Project management and metadata ✅
- sessions: AI agent session tracking ✅
- contexts: Context storage with vector embeddings ✅
- naming_registry: Naming consistency enforcement ✅
- technical_decisions: Architectural decision records ✅
- agents: Multi-agent coordination and task management ✅
- tasks: Task breakdown and progress tracking ✅
- messages: Inter-agent communication ✅
- code_components: Code structure analysis and dependencies ✅
- _aidis_migrations: Migration tracking ✅

### Key Features (IMPLEMENTATION STATUS)
1. Context Management: Store and retrieve development context with semantic search ✅ COMPLETE
2. Naming Registry: Enforce consistent naming across project lifetime ✅ COMPLETE
3. Decision Tracking: Record and reference architectural decisions ✅ COMPLETE
4. Project Management: Multi-project workflows with seamless switching ✅ COMPLETE
5. Local Embeddings: Cost-free semantic search with Transformers.js ✅ COMPLETE
6. Multi-Agent Coordination: Enable multiple AI agents to collaborate ✅ COMPLETE
7. Task Management: Break down work and track progress ✅ COMPLETE
8. Code Analysis: Understand and map code structure ✅ COMPLETE
9. Smart Search & AI Recommendations: Intelligent cross-system search ✅ COMPLETE
10. Documentation Generation: Auto-generate and maintain docs ⏳ FUTURE

### Development Phases
Phase 1: Foundation & Database Setup ✅ COMPLETE
- PostgreSQL setup with pgvector
- Basic MCP server structure
- Core database schema implementation

Phase 2: Core Context Management ✅ COMPLETE
- Context storage and retrieval
- Basic semantic search
- Session management

Phase 3: Naming & Decision Systems ✅ COMPLETE
- Naming registry implementation
- Technical decision tracking
- Basic consistency checking

Phase 4: Advanced Features ✅ COMPLETE
- Multi-agent coordination system (11 MCP tools)
- Code analysis integration (5 MCP tools) 
- Smart search & AI recommendations (3 MCP tools)

Phase 5: Polish & Production ⏳ FUTURE
- Performance optimization
- Security hardening
- Monitoring and observability

### Learning Objectives for Brian
- Understanding MCP (Model Context Protocol)
- PostgreSQL with vector extensions (pgvector)
- TypeScript/Node.js backend development
- Database schema design and migrations
- Vector embeddings and semantic search
- System architecture for AI agent coordination
- Testing strategies for complex systems

### Security Considerations
- API authentication and authorization
- Input validation and sanitization
- SQL injection prevention
- Rate limiting and abuse prevention
- Secure secret management

### Performance Targets
- Context retrieval: <100ms average
- Semantic search: <200ms average
- Database queries: Proper indexing for <50ms
- MCP response time: <500ms average
- Support for 100+ concurrent sessions

### Monitoring & Observability
- System health checks
- Performance metrics tracking
- Error pattern analysis
- Agent interaction monitoring
- Context quality assessment

### 37 MCP Tools Available (ALL PRODUCTION-READY!)
```typescript
// System Health (2 tools)
aidis_ping, aidis_status

// Context Management (3 tools)
context_store, context_search, context_stats

// Project Management (6 tools) - 100% COMPLETE ✅
project_list, project_create, project_switch, project_current, project_info, project_insights

// Naming Registry (4 tools) - 100% COMPLETE ✅
naming_register, naming_check, naming_suggest, naming_stats

// Technical Decisions (4 tools)
decision_record, decision_search, decision_update, decision_stats

// Multi-Agent Coordination (11 tools) ✨ NEW
agent_register, agent_list, agent_status, agent_join, agent_leave, agent_sessions,
agent_message, agent_messages, task_create, task_list, task_update

// Code Analysis (5 tools) ✨ NEW
code_analyze, code_components, code_dependencies, code_impact, code_stats

// Smart Search & AI Recommendations (3 tools) ✨ NEW
smart_search, get_recommendations, project_insights
```

### 🚨 CRITICAL: Database Configuration 
**LESSON LEARNED:** Always verify PostgreSQL port and database connection!

**AIDIS Database Setup:**
- PostgreSQL Port: 5432 (NOT 5434!)
- Database: aidis_production  
- Connection String: postgresql://ridgetop@localhost:5432/aidis_production
- Test Connection: `psql -h localhost -p 5432 -d aidis_production -c "SELECT current_database();"`

**Common Issues Fixed:**
- Multiple PostgreSQL instances running on different ports
- MCP server connecting to different database than manual tests
- Always verify: logs show connection, but test data flow end-to-end!
### 🔧 CRITICAL: MCP Tool Parameter Reference
**Source of Truth:** `/home/ridgetop/aidis/mcp-server/src/server.ts` (lines ~650-1400)
**Parameter Guide:** `/home/ridgetop/aidis/TOOL_PARAMETER_GUIDE.md`

**✅ CONFIRMED WORKING - Exact Parameters:**
```typescript
// System Health
aidis_ping(message?: string)
aidis_status()

// Context Management ✅ 100% COMPLETE
context_search(query: string)
context_stats()
context_store(content: string, type: 'code'|'decision'|'error'|'discussion'|'planning'|'completion'|'milestone', tags?: string[])

// Project Management ✅ 100% COMPLETE
project_current()
project_list(includeStats?: boolean)
project_create(name: string, description?: string)
project_insights()
project_info(project: string) // name or ID
project_switch(project: string) // name or ID

// Naming Registry ✅ 100% COMPLETE  
naming_stats()
naming_check(proposedName: string, entityType: string)
naming_register(canonicalName: string, entityType: string, description?: string)
naming_suggest(description: string, entityType: string)

// Technical Decisions
decision_search(query: string)
decision_stats()
decision_record(title: string, description: string, rationale: string, decisionType: string, impactLevel: string)
decision_update(decisionId: string, outcomeStatus?: string, outcomeNotes?: string, lessonsLearned?: string)

// Multi-Agent Coordination
agent_list()
agent_register(name: string, type?: string)
agent_status(agentId?: string)
agent_message(fromAgentId: string, content: string, toAgentId?: string)
task_create(title: string, description?: string)
task_list(status?: string)

// Code Analysis
code_analyze(filePath: string) // NOT file_path!
code_components()
code_dependencies()
code_stats()

// Smart Search
smart_search(query: string)
```

**🚨 ALWAYS use these exact parameter names - error messages can be misleading!**
**💡 DEBUGGING TIP:** If tools fail, verify database connection and parameter names first!

### Agent Workflow (CRITICAL!)
When working with "agents" in AIDIS, there are TWO layers:

1. AIDIS Coordination Layer (Virtual Agents)
- agent_register, task_create, agent_message - Track WHO does WHAT
- These are virtual agents for planning and coordination
- Used for project management and task tracking

2. Task Execution Layer (Real Sub-Agents) 
- Use Task tool to spawn ACTUAL sub-agents that create/edit files
- These agents have access to: create_file, edit_file, Bash, codebase_search_agent, etc.
- They produce real deliverables on the file system

Example Workflow:
1. Register virtual "DocWriter" agent in AIDIS
2. Create task assigned to DocWriter  
3. Use Task tool to spawn real sub-agent to execute the work
4. Sub-agent creates files, updates task status in AIDIS
5. All coordination tracked in persistent memory

SPECIALIZED AGENT TEAM (PRODUCTION-READY):
- CodeAgent: Primary developer with naming compliance, dependency tracking
- ProjectManager: Coordination, planning, decision tracking, task management
- QaAgent: Quality assurance, testing, security validation, coverage monitoring

KEY INSIGHT: Agent specialization keeps context cleaner and leaner - instead of one agent doing all work with massive context, specialized agents handle specific tasks with focused expertise. This enables better token efficiency, cleaner conversations, and scalable AI team coordination.

### SESSION WORKFLOW & PARTNERSHIP GUIDELINES

FIRST TASK EVERY SESSION:
- Always check AIDIS system health with aidis_ping and aidis_status
- Verify current project with project_current
- Let Brian know what project AIDIS is currently set to

DEVELOPMENT WORKFLOW:
1. CodeAgent → Implement features/fixes
2. QaAgent → Test and validate 
3. Lead Review → Final verification before moving on
4. Fix First → If errors found, fix before proceeding to next task

QUALITY PRINCIPLES:
- We don't adjust tests to get a pass - We use sound test methods that don't change
- We fix errors to conform to good tests - Code adapts to proper testing standards
- Always find solutions - No giving up, persistent problem solving
- Slow and steady wins - Speed is NOT the priority, quality is
- Partnership approach - Brian and AI work as partners with AI as lead dev/mentor

PARTNERSHIP DYNAMICS:
- User: Brian (partner in development)
- AI Role: Lead Developer and Mentor
- Approach: Collaborative partnership on real multi-day/week projects  
- Goal: Build sustainable working relationship for long-term project success

COMMUNICATION STYLE:
- Professional but friendly partnership tone
- Explain technical decisions and reasoning
- Include Brian in architectural discussions
- Provide mentorship on complex concepts when needed
