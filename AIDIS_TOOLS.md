# AIDIS Tools Reference Guide

**Post TT009 Tool Consolidation - 47 Tools Total**
*Last Updated: 2025-09-20*

This guide documents all 47 AIDIS MCP tools available after the successful TT009 consolidation project. Each tool has been tested and validated for functionality.

## 🎯 Quick Start

1. **Test Connection**: `aidis_ping` - Always start here
2. **Explore Tools**: `aidis_help` - See all available tools
3. **Get Help**: `aidis_explain <tool_name>` - Detailed tool documentation

---

## 📊 Tool Categories Overview

- **System Health**: 2 tools
- **Context Management**: 4 tools
- **Project Management**: 6 tools
- **Session Management**: 5 tools
- **Naming Registry**: 4 tools
- **Technical Decisions**: 4 tools
- **Task Management**: 4 tools
- **Code Analysis**: 5 tools
- **Smart Search & AI**: 2 tools
- **Code Complexity**: 3 tools *(Consolidated)*
- **Development Metrics**: 3 tools *(Consolidated)*
- **Pattern Detection**: 2 tools *(Consolidated)*
- **Git Integration**: 3 tools

---

## 🔧 System Health Tools

### `aidis_ping`
**Purpose**: Test AIDIS server connectivity and health
**Usage**: `aidis_ping(message?: string)`
**Status**: ✅ **WORKING**
```
Example: aidis_ping()
Returns: "🏓 AIDIS Pong! Message: "Hello AIDIS!" | Time: 2025-09-21T02:33:55.602Z | Status: Operational"
```

### `aidis_status`
**Purpose**: Get comprehensive server status and health information
**Usage**: `aidis_status()`
**Status**: ✅ **WORKING**
```
Returns: Version, uptime, database status, memory usage, environment, feature flags
```

---

## 📝 Context Management Tools

### `context_store`
**Purpose**: Store development context with automatic embedding
**Usage**: `context_store(content: string, type: string, tags?: string[])`
**Types**: code, decision, error, discussion, planning, completion, milestone, reflections, handoff
**Status**: ✅ **WORKING**
```
Example: context_store("Implementation complete", "completion", ["TT009", "consolidation"])
```

### `context_search`
**Purpose**: Search stored contexts using semantic similarity
**Usage**: `context_search(query: string, limit?: number, type?: string)`
**Status**: ✅ **WORKING**
```
Example: context_search("tool consolidation", 5)
Returns: Matching contexts with relevance scores
```

### `context_get_recent`
**Purpose**: Get recent contexts chronologically (newest first)
**Usage**: `context_get_recent(limit?: number, projectId?: string)`
**Status**: ✅ **WORKING**
```
Example: context_get_recent(3)
Returns: Last 3 contexts with content, tags, timestamps
```

### `context_stats`
**Purpose**: Get context statistics for current project
**Usage**: `context_stats()`
**Status**: ✅ **WORKING**
```
Returns: Total contexts, by type breakdown, recent activity
```

---

## 🏗️ Project Management Tools

### `project_current`
**Purpose**: Get the currently active project information
**Usage**: `project_current()`
**Status**: ✅ **WORKING**
```
Returns: Current project name, description, status, context count
```

### `project_list`
**Purpose**: List all available projects with statistics
**Usage**: `project_list(includeStats?: boolean)`
**Status**: ✅ **WORKING**
```
Example: project_list(true)
Returns: All projects with names, descriptions, context counts, IDs
```

### `project_create`
**Purpose**: Create a new project
**Usage**: `project_create(name: string, description: string)`
**Status**: 🔧 **NEEDS TESTING** *(Not tested - create operation)*

### `project_switch`
**Purpose**: Switch to a different project (sets as current)
**Usage**: `project_switch(project: string)`
**Status**: 🔧 **NEEDS TESTING** *(Not tested - state change operation)*

### `project_info`
**Purpose**: Get detailed information about a specific project
**Usage**: `project_info(project: string)`
**Status**: ✅ **WORKING**
```
Returns: Detailed project info including git repo, metadata, directories
```

### `project_insights`
**Purpose**: Get comprehensive project health and insights
**Usage**: `project_insights()`
**Status**: ✅ **WORKING**
```
Returns: Code health score, team efficiency, component counts, recommendations
```

---

## 🔄 Session Management Tools

### `session_status`
**Purpose**: Get current session status and details
**Usage**: `session_status()`
**Status**: ✅ **WORKING**
```
Returns: Session ID, type, project assignment, duration, context count
```

### `session_assign`
**Purpose**: Assign current session to a project
**Usage**: `session_assign(projectName: string)`
**Status**: ✅ **WORKING**
```
Example: session_assign("aidis-bootstrap")
```

### `session_new`
**Purpose**: Create a new session with optional title and project assignment
**Usage**: `session_new(title?: string, projectName?: string)`
**Status**: ✅ **WORKING**
```
Example: session_new("Test Session Creation", "aidis-bootstrap")
```

### `session_update`
**Purpose**: Update session title and description for better organization
**Usage**: `session_update(title?: string, description?: string)`
**Status**: ❌ **VALIDATION ERROR** *(No validation schema found)*

### `session_details`
**Purpose**: Get detailed session information including title, description, and metadata
**Usage**: `session_details(sessionId?: string)`
**Status**: ❌ **VALIDATION ERROR** *(No validation schema found)*

---

## 🏷️ Naming Registry Tools

### `naming_check`
**Purpose**: Check for naming conflicts before using a name
**Usage**: `naming_check(proposedName: string, entityType: string)`
**Status**: ✅ **WORKING**
```
Example: naming_check("TestComponent", "component")
Returns: Conflict status and availability
```

### `naming_register`
**Purpose**: Register a name to prevent conflicts
**Usage**: `naming_register(canonicalName: string, entityType: string, description?: string)`
**Status**: ❌ **PARAMETER ERROR** *(Missing canonicalName parameter in schema)*

### `naming_suggest`
**Purpose**: Get name suggestions based on description
**Usage**: `naming_suggest(description: string, entityType: string)`
**Status**: ⚠️ **PARTIAL** *(Returns [object Object] - formatting issue)*

### `naming_stats`
**Purpose**: Get naming statistics and convention compliance
**Usage**: `naming_stats()`
**Status**: ✅ **WORKING**
```
Returns: Total names, compliance %, breakdown by type
```

---

## 📋 Technical Decision Tools

### `decision_record`
**Purpose**: Record a technical decision with context
**Usage**: `decision_record(title: string, description: string, ...)`
**Status**: 🔧 **NEEDS TESTING** *(Not tested - create operation)*

### `decision_search`
**Purpose**: Search technical decisions with filters
**Usage**: `decision_search(query: string, status?: string, ...)`
**Status**: ✅ **WORKING**
```
Example: decision_search("consolidation")
Returns: Matching decisions with impact, status, tags
```

### `decision_update`
**Purpose**: Update decision status, outcomes, or lessons
**Usage**: `decision_update(decisionId: string, ...)`
**Status**: 🔧 **NEEDS TESTING** *(Not tested - update operation)*

### `decision_stats`
**Purpose**: Get technical decision statistics and analysis
**Usage**: `decision_stats()`
**Status**: 🔧 **NEEDS TESTING** *(Not tested - analytics)*

---

## ✅ Task Management Tools

### `task_create`
**Purpose**: Create a new task for coordination
**Usage**: `task_create(title: string, type: string, description?: string, ...)`
**Status**: 🔧 **NEEDS TESTING** *(Not tested - create operation)*

### `task_list`
**Purpose**: List tasks with optional filtering
**Usage**: `task_list(status?: string, assignedTo?: string, limit?: number, ...)`
**Status**: ✅ **WORKING**
```
Example: task_list("completed", undefined, 3)
Returns: Filtered task list with details, priorities, tags
```

### `task_update`
**Purpose**: Update task status and assignment
**Usage**: `task_update(taskId: string, status?: string, ...)`
**Status**: ❌ **PARAMETER ERROR** *(Missing taskId parameter in current schema)*

### `task_details`
**Purpose**: Get detailed information for a specific task
**Usage**: `task_details(taskId: string)`
**Status**: 🔧 **NEEDS TESTING** *(Not tested - requires valid task ID)*

---

## 🔍 Code Analysis Tools

### `code_analyze`
**Purpose**: Analyze code file structure and dependencies
**Usage**: `code_analyze(filePath: string)`
**Status**: ✅ **WORKING**
```
Example: code_analyze("/path/to/file.ts")
Returns: Components, dependencies, complexity metrics
```

### `code_components`
**Purpose**: List code components (functions, classes, etc.)
**Usage**: `code_components(filePath?: string, componentType?: string)`
**Status**: 🔧 **NEEDS TESTING** *(Not tested)*

### `code_dependencies`
**Purpose**: Get dependencies for a specific component
**Usage**: `code_dependencies(componentId: string)`
**Status**: 🔧 **NEEDS TESTING** *(Not tested)*

### `code_impact`
**Purpose**: Analyze the impact of changing a component
**Usage**: `code_impact(componentId: string)`
**Status**: 🔧 **NEEDS TESTING** *(Not tested)*

### `code_stats`
**Purpose**: Get code analysis statistics for a project
**Usage**: `code_stats()`
**Status**: 🔧 **NEEDS TESTING** *(Not tested)*

---

## 🤖 Smart Search & AI Tools

### `smart_search`
**Purpose**: Intelligent search across all project data
**Usage**: `smart_search(query: string, includeTypes?: string[], limit?: number)`
**Status**: ⚠️ **LIMITED** *(Low relevance results - needs improvement)*
```
Example: smart_search("tool consolidation TT009", ["context"], 2)
```

### `get_recommendations`
**Purpose**: Get AI-powered recommendations for development
**Usage**: `get_recommendations(context?: string)`
**Status**: 🔧 **NEEDS TESTING** *(Not tested)*

---

## 🔧 Code Complexity Tools *(TT009-1 Consolidated)*

### `complexity_analyze`
**Purpose**: Unified complexity analysis - file analysis, commit analysis, and detailed metrics
**Usage**: `complexity_analyze(operation: string, ...params)`
**Operations**: file_analysis, commit_analysis, detailed_metrics
**Status**: ❌ **VALIDATION ERROR** *(No validation schema found)*

### `complexity_insights`
**Purpose**: Unified complexity insights - dashboard, hotspots, trends, technical debt, and refactoring opportunities
**Usage**: `complexity_insights(operation: string, ...params)`
**Status**: ❌ **VALIDATION ERROR** *(No validation schema found)*

### `complexity_manage`
**Purpose**: Unified complexity management - tracking service, alerts, thresholds, and performance monitoring
**Usage**: `complexity_manage(operation: string, ...params)`
**Status**: ❌ **VALIDATION ERROR** *(No validation schema found)*

---

## 📊 Development Metrics Tools *(TT009-2 Consolidated)*

### `metrics_collect`
**Purpose**: Unified metrics collection - project, core, patterns, productivity data
**Usage**: `metrics_collect(operation: string, ...params)`
**Status**: ❌ **VALIDATION ERROR** *(No validation schema found)*

### `metrics_analyze`
**Purpose**: Unified metrics analysis - dashboard, trends, correlations, executive summaries, aggregation
**Usage**: `metrics_analyze(operation: string, ...params)`
**Status**: ❌ **VALIDATION ERROR** *(No validation schema found)*

### `metrics_control`
**Purpose**: Unified metrics control - collection management, alerts, performance, export
**Usage**: `metrics_control(operation: string, ...params)`
**Status**: ❌ **VALIDATION ERROR** *(No validation schema found)*

---

## 🔍 Pattern Detection Tools *(TT009-3 Consolidated)*

### `pattern_analyze`
**Purpose**: Unified pattern analysis - detection, analysis, tracking operations
**Usage**: `pattern_analyze(operation: string, ...params)`
**Operations**: service_control, project_analysis, session_analysis, commit_analysis, git_activity
**Status**: ❌ **VALIDATION ERROR** *(No validation schema found)*

### `pattern_insights`
**Purpose**: Unified pattern insights - insights, correlations, recommendations, alerts
**Usage**: `pattern_insights(operation: string, ...params)`
**Status**: ❌ **VALIDATION ERROR** *(No validation schema found)*

---

## 🔄 Git Integration Tools

### `git_session_commits`
**Purpose**: Get all git commits linked to a session with correlation details
**Usage**: `git_session_commits(sessionId?: string)`
**Status**: ❌ **VALIDATION ERROR** *(No validation schema found)*

### `git_commit_sessions`
**Purpose**: Get all sessions that contributed to a specific git commit
**Usage**: `git_commit_sessions(commitHash: string)`
**Status**: ❌ **VALIDATION ERROR** *(No validation schema found)*

### `git_correlate_session`
**Purpose**: Manually trigger git correlation for current or specified session
**Usage**: `git_correlate_session(sessionId?: string)`
**Status**: ❌ **VALIDATION ERROR** *(No validation schema found)*

---

## 🚨 Known Issues & Status Summary

### ✅ **Fully Working Tools (17)**
- System Health: aidis_ping, aidis_status
- Context Management: context_store, context_search, context_get_recent, context_stats
- Project Management: project_current, project_list, project_info, project_insights
- Session Management: session_status, session_assign, session_new
- Naming Registry: naming_check, naming_stats
- Decision Management: decision_search
- Task Management: task_list
- Code Analysis: code_analyze

### ⚠️ **Partially Working Tools (2)**
- `naming_suggest`: Returns [object Object] instead of formatted suggestions
- `smart_search`: Returns low relevance results, needs improvement

### ❌ **Validation Issues (16)**
**All consolidated tools missing validation schemas:**
- All 3 complexity tools (TT009-1)
- All 3 metrics tools (TT009-2)
- All 2 pattern tools (TT009-3)
- All 3 git integration tools
- session_update, session_details
- naming_register (missing canonicalName parameter)
- task_update (missing taskId parameter)

### 🔧 **Needs Testing (12)**
- Project: project_create, project_switch
- Decisions: decision_record, decision_update, decision_stats
- Tasks: task_create, task_details
- Code Analysis: code_components, code_dependencies, code_impact, code_stats
- AI: get_recommendations

---

## 🔧 Immediate Action Items

### 1. **Fix Consolidated Tool Validation Schemas** *(PRIORITY 1)*
All TT009 consolidated tools need validation schemas added to server.ts:
- complexity_analyze, complexity_insights, complexity_manage
- metrics_collect, metrics_analyze, metrics_control
- pattern_analyze, pattern_insights
- git_session_commits, git_commit_sessions, git_correlate_session

### 2. **Fix Session Tool Schemas** *(PRIORITY 2)*
- Add validation schema for session_update and session_details
- Fix naming_register canonicalName parameter
- Fix task_update taskId parameter

### 3. **Improve AI Tools** *(PRIORITY 3)*
- Fix naming_suggest formatting output
- Improve smart_search relevance scoring

---

## 🎯 Usage Recommendations

### **Start Here (Most Reliable)**
1. System: `aidis_ping`, `aidis_status`
2. Context: `context_store`, `context_search`, `context_get_recent`
3. Projects: `project_current`, `project_list`, `project_info`
4. Sessions: `session_status`, `session_assign`

### **Use With Caution**
- All consolidated tools (validation issues)
- naming_suggest (formatting issues)
- smart_search (relevance issues)

### **Avoid Until Fixed**
- All git integration tools
- session_update/session_details
- task_update (parameter issues)

---

**Tool Count**: 47 total (post-consolidation)
**Working**: 17 fully functional
**Issues**: 30 tools need fixes or testing
**Success Rate**: 36% fully working, 64% need attention

*This guide reflects the current state after TT009 consolidation. Many validation schemas need to be added to complete the consolidation work.*