# 🎯 AIDIS Practical Usage Guide
## What We Actually Built & How to Use It

### 🎯 **THE PROBLEM AIDIS SOLVES**
You're building a large project over **multiple weeks/months** with AI assistance, and you keep losing:
- Context from previous sessions ("What did we decide about the database schema?")
- Naming consistency ("Did we call it `userService` or `UserService`?") 
- Architectural decisions ("Why did we choose Redis over Postgres for caching?")
- Progress tracking ("What features are done vs in-progress?")

**AIDIS = Persistent Memory + Coordination for Multi-Session AI Development**

---

## 🚀 **CORE WORKFLOW: Every Session**

### **1. SESSION STARTUP (Always Do This First)**
```bash
# Health check + project status
aidis_ping()
aidis_status() 
project_current()
```
**Result:** Know system is healthy and which project you're in

### **2. CONTEXT RETRIEVAL (Before Starting Work)**
```bash
# Find relevant past work
context_search(query: "authentication system")
smart_search(query: "user login implementation")
decision_search(query: "database choice")
```
**Result:** Instantly recall past decisions and context

### **3. DURING DEVELOPMENT (Continuous)**
```bash
# Store important context as you work
context_store(content: "Implemented JWT auth with 15min expiry", type: "code")
context_store(content: "Database migration completed successfully", type: "completion")

# Register names to maintain consistency  
naming_check(proposedName: "AuthService", entityType: "class")
naming_register(canonicalName: "AuthService", entityType: "class")

# Record architectural decisions
decision_record(
  title: "JWT Token Expiry Time",
  description: "Set JWT tokens to expire after 15 minutes",
  rationale: "Balance security vs user experience",
  decisionType: "security",
  impactLevel: "medium"
)
```

### **4. END OF SESSION (Capture Progress)**
```bash
# Store milestone/completion context
context_store(content: "Session completed: User auth fully implemented and tested", type: "milestone")
```

---

## 🛠 **THE 4 CORE AIDIS SYSTEMS**

### **1. CONTEXT MANAGEMENT** ✅ Ready
**Purpose:** Never lose important information between sessions
- `context_store` - Save code snippets, decisions, errors, completions
- `context_search` - Find past work with semantic search
- `context_stats` - See how much context you've stored

### **2. NAMING REGISTRY** ✅ Ready  
**Purpose:** Keep naming consistent across the entire project
- `naming_check` - "Is this name already used?"
- `naming_register` - "Reserve this name"
- `naming_suggest` - "What should I call this component?"

### **3. DECISION TRACKING** ✅ Ready
**Purpose:** Remember why you made architectural choices
- `decision_record` - Document important technical decisions
- `decision_search` - Find past decisions by topic
- `decision_update` - Update outcomes ("This decision worked well/poorly")

### **4. PROJECT MANAGEMENT** ✅ Ready
**Purpose:** Work across multiple projects cleanly
- `project_switch` - Change to different project  
- `project_current` - See which project you're in
- `project_insights` - Get project health overview

---

## 🤖 **AGENT COORDINATION: Simplified Approach**

**REALITY CHECK:** The 11 agent coordination tools exist, but for practical use:

### **Option A: Simple (Recommended Starting Point)**
Just use AIDIS for memory/consistency + regular Task tool for sub-agents
- AIDIS = Memory layer (context, naming, decisions)
- Task tool = Actual work execution
- No need for complex agent orchestration initially

### **Option B: Full Coordination (When Project Gets Large)**
Use the 11 agent tools for complex multi-agent workflows:
- `agent_register` - Register specialized agents (CodeAgent, TestAgent, etc.)
- `task_create`/`task_update` - Break work into trackable tasks
- `agent_message` - Coordinate between agents

**Start with Option A, upgrade to Option B when needed**

---

## 📊 **TOOL PRIORITY MATRIX**

### **🔥 ESSENTIAL (Use Every Session)**
- `aidis_ping`, `aidis_status` - Health check
- `project_current` - Know your project
- `context_search`, `context_store` - Memory management
- `naming_check`, `naming_register` - Consistency

### **🎯 HIGH VALUE (Use Frequently)** 
- `decision_record`, `decision_search` - Architecture memory
- `smart_search` - Find anything across all data
- `project_insights` - Project health

### **⚡ ADVANCED (Use When Needed)**
- Agent coordination tools (11 tools) - Complex workflows
- Code analysis tools (5 tools) - Deep code understanding
- `get_recommendations` - AI suggestions

---

## 🔧 **PARAMETER QUICK REFERENCE**

### **Most Common Required Parameters:**
```typescript
// Context
context_store(content: string, type: 'code'|'decision'|'error'|'discussion'|'planning'|'completion'|'milestone')
context_search(query: string)

// Naming  
naming_check(proposedName: string, entityType: string)
naming_register(canonicalName: string, entityType: string)

// Decisions
decision_record(title: string, description: string, rationale: string, decisionType: string, impactLevel: string)

// Projects
project_switch(project: string) // name or ID
project_info(project: string)   // name or ID
```

### **Entity Types for Naming:**
`'variable', 'function', 'class', 'interface', 'type', 'component', 'file', 'directory', 'module', 'service', 'endpoint', 'database_table', 'database_column', 'config_key', 'environment_var', 'css_class', 'html_id'`

### **Context Types:**
`'code', 'decision', 'error', 'discussion', 'planning', 'completion', 'milestone'`

---

## 🎯 **SUCCESS METRICS**

**You know AIDIS is working when:**
- You start a session and immediately recall where you left off
- You avoid naming conflicts automatically  
- You reference past decisions when making new ones
- You can find any piece of work from weeks ago in seconds
- Multiple AI sessions feel like one continuous development experience

**Next: Let's test all 37 tools systematically to ensure everything works perfectly!**
