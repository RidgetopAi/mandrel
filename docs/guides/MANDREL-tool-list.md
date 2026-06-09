### SYSTEM HEALTH

1. `mandrel_ping` → Handler: server.ts:1257 (handlePing)
2. `mandrel_status` → Handler: server.ts:1276 (handleStatus)
3. `mandrel_help` → Handler: server.ts:1306 (handleHelp)
4. `mandrel_explain` → Handler: server.ts:1311 (handleExplain)
5. `mandrel_examples` → Handler: server.ts:1316 (handleExamples)


### CONTEXT MANAGEMENT
1. `context_store` → Handler: server.ts:1324 (handleContextStore)
2. `context_search` → Handler: server.ts:1357 (handleContextSearch)
3. `context_get_recent` → Handler: server.ts:1425 (handleContextGetRecent)
4. `context_stats` → Handler: server.ts:1468 (handleContextStats)

---

### PROJECT MANAGEMENT 

1. `project_list` → Handler: server.ts:1495 (handleProjectList)
2. `project_create` → Handler: server.ts:1541 (handleProjectCreate)
3. `project_switch` → Handler: server.ts:1571 (handleProjectSwitch)
4. `project_current` → Handler: server.ts:1667 (handleProjectCurrent)
5. `project_info` → Handler: server.ts:1720 (handleProjectInfo)
6. `project_insights` → Handler: server.ts:3136 (handleProjectInsights)

---

### SESSION MANAGEMENT

1. `session_assign` → Handler: server.ts:3587 (handleSessionAssign)
2. `session_status` → Handler: server.ts:3605 (handleSessionStatus)
3. `session_new` → Handler: server.ts:3648 (handleSessionNew)
4. `session_update` → Handler: server.ts:3666 (handleSessionUpdate)
5. `session_details` → Handler: server.ts:3736 (handleSessionDetails)

---

### NAMING REGISTRY 

1. `naming_register` → Handler: server.ts:1763 (handleNamingRegister)
2. `naming_check` → Handler: server.ts:1796 (handleNamingCheck)
3. `naming_suggest` → Handler: server.ts:1864 (handleNamingSuggest)
4. `naming_stats` → Handler: server.ts:1907 (handleNamingStats)

---

### TECHNICAL DECISIONS 
1. `decision_record` → Handler: server.ts:1935 (handleDecisionRecord)
2. `decision_search` → Handler: server.ts:1979 (handleDecisionSearch)
3. `decision_update` → Handler: server.ts:2034 (handleDecisionUpdate)
4. `decision_stats` → Handler: server.ts:2063 (handleDecisionStats)

---

### TASK MANAGEMENT
1. `task_create` → Handler: server.ts:2242 (handleTaskCreate)
2. `task_list` → Handler: server.ts:2284 (handleTaskList)
3. `task_update` → Handler: server.ts:2351 (handleTaskUpdate)
4. `task_details` → Handler: server.ts:2516 (handleTaskDetails)
5. `task_bulk_update` → Handler: server.ts:2381 (handleTaskBulkUpdate)
6. `task_progress_summary` → Handler: server.ts:2451 (handleTaskProgressSummary)

---

### CODE ANALYSIS
1. `code_analyze` → Handler: server.ts:2815 (handleCodeAnalyze)
2. `code_components` → Handler: server.ts:2854 (handleCodeComponents)
3. `code_dependencies` → Handler: server.ts:2902 (handleCodeDependencies)
4. `code_impact` → Handler: server.ts:2943 (handleCodeImpact)
5. `code_stats` → Handler: server.ts:2996 (handleCodeStats)

---

### SMART SEARCH & AI 
1. `smart_search` → Handler: server.ts:3028 (handleSmartSearch)
2. `get_recommendations` → Handler: server.ts:3083 (handleRecommendations)

---

### GIT INTEGRATION 
1. `git_session_commits` → Handler: server.ts:3814 (handleGitSessionCommits)
2. `git_commit_sessions` → Handler: server.ts:3884 (handleGitCommitSessions)
3. `git_correlate_session` → Handler: server.ts:3960 (handleGitCorrelateSession)

---

### COMPLEXITY TOOLS 
**TT009-1 Consolidated Tools** (Expected and Wired):
1. `complexity_analyze` → Handler: handlers/complexity/complexityAnalyze.ts:379
2. `complexity_insights` → Handler: handlers/complexity/complexityInsights.ts:443
3. `complexity_manage` → Handler: handlers/complexity/complexityManage.ts:697

---

### METRICS TOOLS 
**TT009-2 Consolidated Tools** (NEW - Expected):
1. `metrics_collect` → Handler: handlers/metrics/metricsCollect.ts:29
2. `metrics_analyze` → Handler: handlers/metrics/metricsAnalyze.ts:26
3. `metrics_control` → Handler: handlers/metrics/metricsControl.ts:30

---

### PATTERN TOOLS (2 consolidated + 18 individual = 20 total ⚠️)
**TT009-3 Consolidated Tools** (NEW - Expected):
1. `pattern_analyze` → Handler: handlers/patterns/patternAnalyze.ts:41
2. `pattern_insights` → Handler: handlers/patterns/patternInsights.ts:26










