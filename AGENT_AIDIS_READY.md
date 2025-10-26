# 🎯 AIDIS-Ready Agent Guide
## Essential Information for Immediate AIDIS Productivity

### 🚨 **FIRST ACTIONS EVERY SESSION**
```typescript
// ALWAYS DO THIS FIRST - Check system health and project context
aidis_ping()           // Verify connection
aidis_status()         // Check server health  
project_current()      // Know which project you're in
```

**Result:** Immediately know if AIDIS is working and what project context you have.

---

## 🚀 **CURRENT SYSTEM STATUS: 100% OPERATIONAL**

**✅ ALL 37 MCP TOOLS WORKING (Updated 2025-08-22)**
- System Health: 2/2 = 100% ✅
- Context Management: 3/3 = 100% ✅  
- Project Management: 6/6 = 100% ✅
- Naming Registry: 4/4 = 100% ✅
- Technical Decisions: 4/4 = 100% ✅ *(decision_update fixed)*
- Multi-Agent Coordination: 11/11 = 100% ✅
- Code Analysis: 5/5 = 100% ✅ *(code_impact param fixed)*
- Smart Search & AI: 2/2 = 100% ✅ *(get_recommendations enum fixed)*

**AIDIS IS PRODUCTION-READY FOR FLOORBUDDY DEVELOPMENT**

---

## 🛠 **THE 4 ESSENTIAL AIDIS SYSTEMS**

### **1. CONTEXT MANAGEMENT (Use Every Session)**
```typescript
context_store(content: string, type: 'code'|'decision'|'error'|'discussion'|'planning'|'completion'|'milestone', tags?: string[])
context_search(query: string)
context_stats()
```
**Purpose:** Persistent memory across sessions - never lose important information

### **2. NAMING REGISTRY (Use Frequently)**  
```typescript
naming_check(proposedName: string, entityType: string)
naming_register(canonicalName: string, entityType: string, description?: string)
naming_suggest(description: string, entityType: string)
naming_stats()
```
**Purpose:** Maintain naming consistency across entire project lifecycle

### **3. DECISION TRACKING (Use for Architecture)**
```typescript
decision_record(title: string, description: string, rationale: string, decisionType: string, impactLevel: string)
decision_search(query: string)
decision_update(decisionId: string, outcomeStatus?: string, outcomeNotes?: string, lessonsLearned?: string)
decision_stats()
```
**Purpose:** Remember and track architectural decisions and their outcomes

### **4. PROJECT MANAGEMENT (Use for Multi-Project Work)**
```typescript
project_current()
project_list(includeStats?: boolean)
project_switch(project: string)
project_info(project: string)
project_insights()
```
**Purpose:** Clean separation between different development projects

---

## 📊 **TOOL PRIORITY FOR PRODUCTIVITY**

### **🔥 ESSENTIAL (Every Session)**
- `aidis_ping`, `aidis_status` - Health check
- `project_current` - Know your project
- `context_search`, `context_store` - Memory management
- `naming_check`, `naming_register` - Consistency

### **🎯 HIGH VALUE (Frequent Use)** 
- `decision_record`, `decision_search` - Architecture memory
- `smart_search` - Cross-system search
- `project_insights` - Project health

### **⚡ ADVANCED (When Needed)**
- Agent coordination tools (11 tools) - Complex workflows
- Code analysis tools (5 tools) - Deep understanding
- `get_recommendations` - AI suggestions

---

## 🔧 **COMMON WORKFLOWS**

### **Session Startup Pattern:**
1. `aidis_ping()` - Verify connection
2. `project_current()` - Check active project  
3. `context_search(query: "recent work")` - Recall context
4. Begin development with full context

### **During Development Pattern:**
1. `naming_check()` before creating new entities
2. `context_store()` for important progress/decisions
3. `decision_record()` for architectural choices
4. `context_store(type: "milestone")` at session end

### **Multi-Agent Coordination Pattern:**
- **Option A (Simple):** AIDIS for memory + Task tool for execution
- **Option B (Complex):** Full agent coordination when project scales
- **Start with A, upgrade to B as needed**

---

## 🚨 **CRITICAL TROUBLESHOOTING**

### **If AIDIS Connection Fails:**
```bash
# Check server status
systemctl --user status aidis

# Clean restart if needed  
cd /home/ridgetop/aidis/mcp-server
./restart-clean.sh

# Wait for connection, then restart Amp session
```

### **Database Connection Issues:**
- **Port:** Always 5432 (NOT 5434)
- **Database:** aidis_production
- **Test:** `psql -h localhost -p 5432 -d aidis_production -c "SELECT current_database();"`

---

## 🎯 **SUCCESS INDICATORS**

**AIDIS is working when:**
- You immediately know project context on session start
- You find past work/decisions instantly with searches
- Naming stays consistent automatically  
- Multiple sessions feel like continuous development
- Complex projects maintain coherent architecture

---

## 📚 **REFERENCE LINKS**
- **Detailed Usage Guide:** `AIDIS_PRACTICAL_GUIDE.md`
- **Complete Tool Reference:** `TOOL_PARAMETER_GUIDE.md`
- **Parameter Source of Truth:** `/mcp-server/src/server.ts` (lines 650-1400)

---

## 🤝 **PARTNERSHIP WORKFLOW**

**Brian + AI Development Process:**
1. **CodeAgent** → Implement features (use Task tool)
2. **QaAgent** → Test and validate (use Task tool)  
3. **Final Review** → Verify before next task
4. **AIDIS Integration** → Store context, decisions, progress

**Quality Principles:**
- Fix errors to conform to tests (not adjust tests to pass)
- Always find solutions through persistence
- Quality over speed
- Partnership approach with AI as lead developer/mentor

**Communication Style:**
- Professional but friendly partnership
- Explain technical reasoning
- Include Brian in architectural discussions
- Provide mentorship when needed

---

**🎯 BOTTOM LINE:** AIDIS provides persistent memory and coordination for multi-week AI development projects. It's now 100% operational and ready to support FloorBuddy development - proving that complex business applications CAN be built with AI assistance when proper tooling exists.
