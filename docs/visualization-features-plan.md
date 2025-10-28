# AIDIS Visualization Features Plan

## Research Summary (2025-10-28)

### Current AIDIS Data Tracking
AIDIS currently tracks extensive data across **100 sessions**:
- **496 files** modified
- **74,430 lines** of code added
- **1,142 context storage** events
- **78 tasks** created
- **15 decisions** recorded

All data stored in PostgreSQL with REST API access at `/api/v2/sessions/*`

### Key Database Tables
1. **sessions** - 40+ columns including productivity_score, tasks_created, lines_added, total_tokens, ai_model, tags
2. **session_activities** - High-granularity activity timeline (context_stored, task_created, file_edited, etc.)
3. **session_files** - File modifications with multi-source support (tool, git, manual)
4. **analytics_events** - Canonical event logging with 16 columns
5. **productivity_config** - Configurable productivity formula weights

---

## Visualization Categories

### 1. Code Structure & Dependencies
**Purpose:** Help solo builders understand codebase structure, avoid spaghetti code, track dependencies

**Tools Available:**
- **Madge v8.0.0** ✅ Already installed in `/home/ridgetop/aidis/package.json`
- dependency-cruiser (alternative, more robust)
- typescript-graph (CLI-focused)
- arkit (architecture diagrams)

**Features to Build:**
- **Dependency Graph Viewer** - Interactive module dependency visualization
- **Circular Dependency Detector** - Alert system for problematic imports
- **Architecture Heatmap** - Visual representation of codebase hotspots

### 2. Session & Activity Visualization
**Purpose:** Visual way to see what was built, files changed/added (beyond git tracking)

**Features to Build:**
- **Session Timeline** - Interactive timeline showing coding sessions
- **File Change Heatmap** - Visual map of files modified
- **Project Activity Dashboard** - Sessions by project with metrics

### 3. Git History Visualization
**Purpose:** Visual git tracking integrated with AI session data

**Tools Available:**
- Gource (animated tree visualization)
- simple-git ✅ Already available in AIDIS codebase
- GitKraken (commercial)

**Features to Build:**
- **File Change Timeline** - Git log integrated with AIDIS sessions
- **Commit-Session Bridge** - Link git commits to AI sessions

---

## Implementation: Phase 1 (Quick Wins - 1-2 days)

### User Requirements
✅ NO new MCP tools (avoid context consumption)
✅ Add through AIDIS Command UI (manual run buttons)
✅ Leverage existing REST API endpoints
✅ Visual output for structure and file changes

### Backend (Node.js/TypeScript)

**New Files:**
```
mcp-server/src/
├── services/
│   └── dependencyAnalyzer.ts      # Madge wrapper
├── handlers/
│   └── visualizations.ts          # Visualization endpoints
```

**New REST API Endpoints:**
```
POST /api/v2/analyze/dependencies
  Input: { targetPath?: string, outputFormat?: 'svg' | 'png' | 'json' }
  Output: { graphPath: string, circularDeps: [], stats: {} }

GET /api/v2/visualizations/session-summary
  Input: Query params (sessionId?, startDate?, endDate?)
  Output: { sessions: [], fileChanges: [], productivity: {} }
```

### Frontend (React - AIDIS Command)

**New Components:**
```
aidis-command/src/
├── components/
│   └── VisualizationPanel.tsx     # Panel with manual run buttons
├── services/
│   └── visualizationApi.ts        # API client
```

**UI Features:**
- "Analyze Dependencies" button → generates graph → displays SVG
- "Session Dashboard" button → fetches data → displays summary
- "Export Report" button → downloads JSON/PDF

### Storage
```
/home/ridgetop/aidis/run/visualizations/
├── dependencies/
│   ├── graph-2025-10-28.svg
│   └── circular-deps.json
└── sessions/
    └── dashboard-2025-10-28.json
```

---

## Phase 1 Implementation Plan

### Backend Tasks

**1. Create `dependencyAnalyzer.ts` service**
   - Location: `/home/ridgetop/aidis/mcp-server/src/services/dependencyAnalyzer.ts`
   - Responsibilities:
     - Wrap Madge API
     - Generate dependency graphs (SVG/PNG)
     - Detect circular dependencies
     - Return statistics (total modules, circular count, orphans)
   - Methods:
     ```typescript
     async analyzeDependencies(targetPath: string, options: AnalyzeOptions)
     async detectCircularDeps(targetPath: string)
     async generateGraph(targetPath: string, outputFormat: 'svg' | 'png')
     ```

**2. Create `visualizations.ts` handler**
   - Location: `/home/ridgetop/aidis/mcp-server/src/handlers/visualizations.ts`
   - Add endpoints:
     - `POST /api/v2/analyze/dependencies`
     - `GET /api/v2/visualizations/session-summary`
   - Integrate with SessionTracker service for session data
   - Handle file storage and serving

**3. Add visualization storage**
   - Create directory: `/home/ridgetop/aidis/run/visualizations/`
   - Subdirectories: `dependencies/`, `sessions/`
   - Configure Express to serve static files from this directory

### Frontend Tasks

**4. Create `VisualizationPanel.tsx` component**
   - Location: `/home/ridgetop/aidis/aidis-command/src/components/VisualizationPanel.tsx`
   - Components:
     - "Analyze Dependencies" button
     - "Session Dashboard" button
     - Modal/drawer to display results
     - Loading states and error handling
   - Add to main AIDIS Command layout (probably in sidebar or header)

**5. Create `visualizationApi.ts` service**
   - Location: `/home/ridgetop/aidis/aidis-command/src/services/visualizationApi.ts`
   - Methods:
     ```typescript
     async analyzeDependencies(options: AnalyzeOptions): Promise<DependencyResult>
     async getSessionSummary(filters: SessionFilters): Promise<SessionSummary>
     async downloadVisualization(path: string): Promise<Blob>
     ```
   - Error handling and retry logic

### Testing Tasks

**6. Test dependency analysis**
   - Run Madge on AIDIS mcp-server codebase
   - Verify graph generation (SVG/PNG)
   - Check circular dependency detection
   - Test with different target paths

**7. Test session dashboard**
   - Query existing 100 sessions from database
   - Verify data accuracy (file counts, LOC, productivity)
   - Test filtering by date range
   - Test sorting and pagination

---

## Success Criteria for Phase 1

✅ Manual button in AIDIS Command triggers dependency analysis
✅ Visual output (SVG/PNG) viewable in browser or downloaded
✅ Circular dependency alerts displayed with file locations
✅ Session dashboard shows file change summary with metrics
✅ Zero new MCP tools added (context neutral)
✅ All features accessible via AIDIS Command UI

---

## Future Phases (Post Phase 1)

### Phase 2: Rich Visualization (1 week)
- Interactive D3.js dependency graph viewer
- Clickable nodes to explore file relationships
- Session timeline with drill-down capability
- Real-time WebSocket updates

### Phase 3: Intelligence Layer (2+ weeks)
- Complexity metrics dashboard
- Coupling/cohesion analysis
- State management pattern detection
- AI-powered refactoring suggestions

---

**Document Created:** 2025-10-28
**Status:** Planning complete, ready for implementation
**Blocker:** AIDIS MCP connection issue (troubleshooting)
**Next Action:** Fix MCP connection, then implement Phase 1
