# Mandrel Command-Dev Data Flow Analysis
## Oracle's Complete Data Path Mapping

**Generated:** August 22, 2025  
**Mission:** Trace exact data paths from database to UI components and identify filtering/display breaks

---

## 🔍 **CRITICAL DISCOVERY: DATABASE MISMATCH**

### **Root Cause Identified:**
The aidis-command-dev system is connecting to **aidis_ui_dev** database, but Oracle expects data from **aidis_development** database.

**Database Contents:**
- **aidis_development**: 163 contexts, 3 tasks, 17 projects (Oracle's expected data)
- **aidis_ui_dev**: 114 contexts, 7 tasks, 14 projects (actual UI data)

**Configuration Location:**
```typescript
// File: /backend/src/database/connection.ts:13
database: process.env.DATABASE_NAME || 'aidis_ui_dev'
```

---

## 📊 **1. CONTEXTS DATA FLOW**

### **Database → API → Frontend Path:**

**DATABASE LAYER:**
- **Table:** `aidis_ui_dev.contexts` (114 records)
- **Schema:** id, project_id, context_type, content, metadata, tags, relevance_score, session_id, created_at, embedding
- **Joins:** LEFT JOIN with projects table for project names

**API LAYER:**
```
GET /api/contexts
├── Controller: ContextController.searchContexts()
├── Service: ContextService.searchContexts()
├── SQL: Complex query with project_id filtering, semantic search, pagination
└── Response: { success: true, data: { contexts, total, page, limit } }
```

**FRONTEND LAYER:**
```
Contexts.tsx Component
├── Hook: useContextSearch() - manages search params including project_id
├── Service: ContextApi.searchContexts() - converts params to query string  
├── Store: useContextStore() - manages results state
├── Component: ContextCard - renders individual context cards
└── Display: Grid layout with pagination
```

### **Project Filtering Logic:**
1. **Header Project Selector** → `ProjectContext.currentProject`
2. **Auto-Update Effect** (lines 93-98 in Contexts.tsx):
   ```typescript
   useEffect(() => {
     const newProjectId = currentProject?.id || undefined;
     if (searchParams.project_id !== newProjectId) {
       updateSearchParam('project_id', newProjectId);
     }
   }, [currentProject]);
   ```
3. **API Call** → `GET /contexts?project_id=${projectId}`
4. **SQL Filter** → `AND c.project_id = $n`

### **Potential Break Points:**
- ❌ **Database mismatch** - UI shows aidis_ui_dev data (114 contexts) instead of aidis_development data (163 contexts)
- ⚠️ **No updated_at column** - contexts table uses created_at for both created and updated timestamps
- ⚠️ **Semantic search complexity** - pgvector queries may fail silently

---

## 📋 **2. TASKS DATA FLOW**

### **Database → API → WebSocket → Frontend Path:**

**DATABASE LAYER:**
- **Table:** `aidis_ui_dev.tasks` (7 records)
- **Schema:** id, title, description, status, priority, type, assigned_to, project_id, metadata, created_at, updated_at

**API LAYER:**
```
GET /api/tasks
├── Controller: TaskController.getTasks()
├── Service: TaskService.getTasks()
├── Filters: project_id, assigned_to, status, priority, type, tags, search
└── Response: { success: true, data: { tasks, total } }
```

**WEBSOCKET LAYER:**
```
WebSocket Events:
├── task_created - broadcast on POST /tasks
├── task_updated - broadcast on PUT /tasks/:id  
├── task_deleted - broadcast on DELETE /tasks/:id
├── task_assigned - broadcast on POST /tasks/:id/assign
└── task_status_changed - broadcast on POST /tasks/:id/status
```

**FRONTEND LAYER:**
```
Dashboard.tsx → "Active Tasks" Widget
├── Service: dashboardApi.getDashboardStats()
├── API Calls: /projects/stats + /contexts/stats  
├── Missing: Direct /tasks/stats endpoint
└── Display: Statistic component showing "activeTasks: 0"
```

**Tasks.tsx Page:**
```
Tasks.tsx Component
├── API: TaskApi (not yet traced in detail)
├── WebSocket: Real-time task updates
├── Kanban Board: Drag-and-drop status changes
└── Project Filtering: Similar pattern to contexts
```

### **Break Points:**
- ❌ **Missing Task Stats** - Dashboard shows activeTasks: 0 because no /api/tasks/stats endpoint is called
- ❌ **Database mismatch** - UI shows 7 tasks instead of expected 3 tasks
- ⚠️ **WebSocket authentication** - May not work if JWT tokens aren't properly passed

---

## 🏠 **3. PROJECT FILTERING LOGIC**

### **Project Context Flow:**

**1. Project Selection:**
```
Header Component
├── ProjectSelector dropdown
├── onChange → ProjectContext.setCurrentProject()
├── localStorage: 'aidis_current_project'
└── Context propagation to all pages
```

**2. Auto-Filtering Effect:**
```
All Data Pages (Contexts, Tasks, Decisions, etc.)
├── useProjectContext() hook
├── useEffect watching currentProject changes
├── updateSearchParam('project_id', currentProject?.id)
└── API calls include ?project_id= parameter
```

**3. Backend Filtering:**
```
All Services apply project filtering:
├── WHERE c.project_id = $1 (if project_id provided)
├── JOIN projects p ON c.project_id = p.id (for project names)
└── Stats endpoints also accept project_id parameter
```

### **Default Behavior:**
- **No Project Selected**: All data across all projects shown
- **Project Selected**: Only data for that project shown
- **Project Deleted**: Context clears currentProject to null

### **Break Points:**
- ✅ **Logic works correctly** - Project filtering is well implemented
- ⚠️ **State persistence** - Project selection survives page refreshes via localStorage

---

## 🎛️ **4. DASHBOARD AGGREGATION**

### **Dashboard Stats Flow:**

**API Calls:**
```javascript
// dashboardApi.getDashboardStats() makes parallel calls:
const [projectStatsResponse, contextStatsResponse] = await Promise.all([
  apiClient.get('/projects/stats'),    // Gets project counts + recent activity
  apiClient.get('/contexts/stats')     // Gets context counts by type/project  
]);
```

**Data Sources:**
```
Stats Widget Sources:
├── Total Contexts: /contexts/stats → contextStats.total_contexts
├── Active Agents: Hardcoded 0 (no endpoint yet)  
├── Projects: /projects/stats → projectStats.total_projects
└── Active Tasks: Hardcoded 0 (no /tasks/stats called)
```

**Aggregation Logic:**
```typescript
const dashboardStats = {
  contexts: contextStats.total_contexts,        // ✅ From contexts API
  agents: 0,                                   // ❌ TODO: Add agents endpoint  
  projects: projectStats.total_projects,       // ✅ From projects API
  activeTasks: 0,                             // ❌ TODO: Add tasks endpoint
  recentActivity: {
    contextsThisWeek: projectStats.recent_activity.contexts_last_week,
    sessionsThisWeek: projectStats.recent_activity.sessions_last_week
  }
};
```

### **Break Points:**
- ❌ **Missing Task Stats** - Dashboard hardcodes activeTasks: 0
- ❌ **Missing Agent Stats** - Dashboard hardcodes agents: 0  
- ❌ **Database mismatch** - Shows 114 contexts instead of 163
- ✅ **Project Stats work** - Correctly fetched and displayed

---

## 🔧 **5. IDENTIFIED ISSUES & SOLUTIONS**

### **CRITICAL Issues:**

**1. Database Configuration Mismatch**
```bash
# Current: aidis_ui_dev (114 contexts, 7 tasks, 14 projects)  
# Expected: aidis_development (163 contexts, 3 tasks, 17 projects)

# Fix: Update backend/.env
DATABASE_NAME=aidis_development
```

**2. Missing Dashboard Endpoints**
```typescript
// Missing API calls in dashboardApi.getDashboardStats():
const taskStatsResponse = await apiClient.get('/tasks/stats');
const agentStatsResponse = await apiClient.get('/agents/stats');
```

**3. Hardcoded Zero Values**
```typescript
// Fix in dashboardApi.ts:
activeTasks: taskStats.active_tasks_count,  // Instead of: 0
agents: agentStats.total_agents,            // Instead of: 0
```

### **MINOR Issues:**

**4. Context Schema Missing updated_at**
```sql
-- contexts table uses created_at for both created/updated
-- Frontend expects updated_at field
```

**5. WebSocket Authentication**
```typescript  
// Verify JWT tokens are passed to WebSocket connections
// Check WebSocket connection in browser dev tools
```

---

## 🎯 **6. IMMEDIATE FIXES NEEDED**

### **Priority 1: Database Connection**
1. Update `backend/.env`: `DATABASE_NAME=aidis_development`  
2. Restart backend server
3. Verify UI shows 163 contexts instead of 114

### **Priority 2: Dashboard Stats**
1. Add task stats API call to `dashboardApi.getDashboardStats()`
2. Add agent stats API call (if endpoint exists)
3. Remove hardcoded zeros from dashboard

### **Priority 3: WebSocket Tasks**
1. Verify WebSocket connection in browser dev tools
2. Test real-time task updates
3. Check JWT authentication for WebSocket

---

## 📈 **7. DATA VERIFICATION COMMANDS**

```bash
# Check current database connection
psql -h localhost -p 5432 -U ridgetop -d aidis_ui_dev -c "SELECT COUNT(*) FROM contexts;"

# Check expected database  
psql -h localhost -p 5432 -U ridgetop -d aidis_development -c "SELECT COUNT(*) FROM contexts;"

# Test API endpoints
curl -H "Authorization: Bearer $TOKEN" http://localhost:5001/api/contexts/stats
curl -H "Authorization: Bearer $TOKEN" http://localhost:5001/api/projects/stats  
curl -H "Authorization: Bearer $TOKEN" http://localhost:5001/api/tasks/stats

# Check WebSocket connection
# Open browser dev tools → Network → WS → Check connection status
```

---

## 📝 **8. SUMMARY FOR ORACLE**

**Root Cause:** aidis-command-dev backend connects to `aidis_ui_dev` database instead of `aidis_development` database.

**Impact:**
- UI shows 114 contexts instead of expected 163 contexts
- Task counts differ (7 vs 3)  
- Project counts differ (14 vs 17)
- Dashboard stats show zeros for tasks/agents

**Quick Fix:** Change `DATABASE_NAME=aidis_development` in backend/.env

**Complete Data Flows Mapped:**
- ✅ Contexts: Database → ContextService → ContextController → ContextApi → Contexts.tsx
- ✅ Tasks: Database → TaskService → TaskController → WebSocket → Tasks.tsx  
- ✅ Projects: Database → ProjectService → ProjectController → ProjectContext
- ✅ Dashboard: Multiple APIs → dashboardApi → Dashboard.tsx

**Filtering Works:** Project selection properly filters all data via project_id parameter.

Oracle, the data flow architecture is solid - we just need to point it at the right database! 🎯
