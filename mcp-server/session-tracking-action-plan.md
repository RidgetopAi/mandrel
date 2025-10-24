# Session Tracking Action Plan for AIDIS

## Overview
This plan implements intelligent session tracking for AIDIS that captures your work with AI, tracks productivity metrics, and provides actionable insights about your development sessions.

---

## Core Principles

**A Session = You + AI working together on a project**

Key Features:
- Auto-assigns project intelligently (last worked on project)
- Tracks productivity metrics (LOC, tasks, decisions, context)
- Records session goals and outcomes
- Monitors AI model usage
- Tags and categorizes sessions
- Auto-ends after 2 hours of inactivity
- Provides detailed session reports

---

## Phase 1: Database Schema & Foundation
**Goal**: Create the core session tracking infrastructure  
**Timeline**: Week 1

### 1.1 Main Sessions Table

```sql
CREATE TABLE sessions (
  -- Identity
  id SERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE,
  
  -- Project assignment
  project_id INTEGER REFERENCES projects(id),
  
  -- Timing
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  last_activity_at TIMESTAMP DEFAULT NOW(),
  duration_minutes INTEGER, -- calculated on session end
  
  -- Status
  status VARCHAR(20) DEFAULT 'active', -- active, paused, ended, timeout
  
  -- Session context
  session_goals TEXT, -- What are you trying to accomplish?
  session_notes TEXT, -- Free-form notes during/after session
  tags TEXT[], -- {refactor, bug-fix, feature, learning, exploration}
  
  -- MCP tracking
  mcp_connection_id TEXT,
  
  -- AI model tracking
  ai_model VARCHAR(100), -- 'claude-sonnet-4.5', 'claude-opus-4', etc
  ai_provider VARCHAR(50) DEFAULT 'anthropic',
  
  -- Metrics (auto-incremented during session)
  tasks_created INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  tasks_in_progress INTEGER DEFAULT 0,
  tasks_todo INTEGER DEFAULT 0,
  context_items_added INTEGER DEFAULT 0,
  decisions_made INTEGER DEFAULT 0,
  
  -- Code metrics (calculated at session end)
  loc_added INTEGER DEFAULT 0,
  loc_removed INTEGER DEFAULT 0,
  net_loc INTEGER GENERATED ALWAYS AS (loc_added - loc_removed) STORED,
  files_modified TEXT[], -- Array of file paths touched
  
  -- Quality metrics
  productivity_score DECIMAL(5,2),
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_sessions_project ON sessions(project_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_started_at ON sessions(started_at DESC);
CREATE INDEX idx_sessions_tags ON sessions USING GIN(tags);
```

### 1.2 Session Activity Timeline Table

```sql
-- For tracking detailed activity during session
CREATE TABLE session_activities (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  
  -- Activity details
  activity_type VARCHAR(50) NOT NULL, -- task_created, context_added, decision_made, file_modified, etc
  activity_description TEXT,
  
  -- Related entities
  task_id INTEGER REFERENCES tasks(id),
  context_id INTEGER REFERENCES context(id),
  decision_id INTEGER REFERENCES decisions(id),
  
  -- Activity metadata
  file_path TEXT, -- if file-related
  ai_interaction BOOLEAN DEFAULT false, -- was AI involved in this activity?
  
  -- Timing
  occurred_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_session_activities_session ON session_activities(session_id);
CREATE INDEX idx_session_activities_type ON session_activities(activity_type);
CREATE INDEX idx_session_activities_occurred ON session_activities(occurred_at DESC);
```

### 1.3 Session File Tracking Table

```sql
-- Track which files were worked on during session
CREATE TABLE session_files (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  
  -- File details
  file_path TEXT NOT NULL,
  
  -- Metrics per file
  times_modified INTEGER DEFAULT 1,
  loc_added INTEGER DEFAULT 0,
  loc_removed INTEGER DEFAULT 0,
  
  -- File mentions (for @file context tracking)
  mentioned_in_context INTEGER DEFAULT 0, -- how many times @mentioned
  
  -- Timing
  first_modified_at TIMESTAMP DEFAULT NOW(),
  last_modified_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(session_id, file_path)
);

CREATE INDEX idx_session_files_session ON session_files(session_id);
```

---

## Phase 2: Session Lifecycle Management
**Goal**: Implement session start, project assignment, activity tracking, and end  
**Timeline**: Week 2

### 2.1 Session Start Logic

**When MCP Server Connects**:

```javascript
// session-manager.js

async function startSession() {
  // 1. Determine which project to use
  const projectId = await determineProject();
  
  // 2. Detect AI model being used
  const aiModel = detectAIModel(); // from MCP context or config
  
  // 3. Create session record
  const session = await db.sessions.create({
    project_id: projectId,
    ai_model: aiModel,
    status: 'active',
    started_at: new Date(),
    last_activity_at: new Date()
  });
  
  // 4. Store globally for easy access
  global.currentSessionId = session.id;
  
  // 5. Prompt for session goals (optional)
  await promptForSessionGoals(session.id);
  
  // 6. Start inactivity monitor
  startInactivityMonitor(session.id);
  
  console.log(`✅ Session ${session.id} started - Project: ${project.name}`);
  
  return session;
}
```

### 2.2 Intelligent Project Assignment (Option 2)

```javascript
async function determineProject() {
  // 1. Check for most recent session within last 24 hours
  const recentSession = await db.sessions.findOne({
    where: {
      started_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    },
    order: [['started_at', 'DESC']]
  });
  
  if (recentSession) {
    console.log(`📂 Resuming project: ${recentSession.project.name}`);
    return recentSession.project_id;
  }
  
  // 2. Fall back to default project
  const defaultProject = await db.projects.findOne({
    where: { is_default: true }
  });
  
  if (defaultProject) {
    console.log(`📂 Using default project: ${defaultProject.name}`);
    return defaultProject.id;
  }
  
  // 3. Last resort: most recently created project
  const latestProject = await db.projects.findOne({
    order: [['created_at', 'DESC']]
  });
  
  return latestProject.id;
}
```

### 2.3 Activity Tracking (Auto-increment counters)

```javascript
// Every AIDIS action should call this
async function recordActivity(sessionId, activityType, details = {}) {
  // Update last_activity_at
  await db.sessions.update(sessionId, {
    last_activity_at: new Date()
  });
  
  // Reset inactivity timer
  resetInactivityTimer(sessionId);
  
  // Record activity in timeline
  await db.session_activities.create({
    session_id: sessionId,
    activity_type: activityType,
    activity_description: details.description,
    task_id: details.taskId,
    context_id: details.contextId,
    decision_id: details.decisionId,
    file_path: details.filePath,
    ai_interaction: details.aiInvolved || false,
    occurred_at: new Date()
  });
  
  // Increment appropriate counter
  await incrementSessionCounter(sessionId, activityType);
}

async function incrementSessionCounter(sessionId, activityType) {
  const counterMap = {
    'task_created': 'tasks_created',
    'task_completed': 'tasks_completed',
    'task_todo': 'tasks_todo',
    'task_in_progress': 'tasks_in_progress',
    'context_added': 'context_items_added',
    'decision_made': 'decisions_made'
  };
  
  const counter = counterMap[activityType];
  if (counter) {
    await db.sessions.increment(counter, {
      by: 1,
      where: { id: sessionId }
    });
  }
}
```

**Example Integration** (when creating a task):
```javascript
async function createTask(taskData) {
  const task = await db.tasks.create({
    ...taskData,
    session_id: global.currentSessionId
  });
  
  await recordActivity(global.currentSessionId, 'task_created', {
    description: `Created task: ${task.title}`,
    taskId: task.id,
    aiInvolved: true
  });
  
  return task;
}
```

### 2.4 File Tracking with @mentions

```javascript
// When context is added with @file mentions
async function addContextWithFiles(contextData, mentionedFiles = []) {
  const context = await db.context.create({
    ...contextData,
    session_id: global.currentSessionId
  });
  
  // Track each mentioned file
  for (const filePath of mentionedFiles) {
    await trackFileInSession(global.currentSessionId, filePath, {
      mentioned: true
    });
  }
  
  await recordActivity(global.currentSessionId, 'context_added', {
    description: `Added context with ${mentionedFiles.length} file mentions`,
    contextId: context.id,
    aiInvolved: true
  });
  
  return context;
}

async function trackFileInSession(sessionId, filePath, options = {}) {
  const existing = await db.session_files.findOne({
    where: { session_id: sessionId, file_path: filePath }
  });
  
  if (existing) {
    // Update existing tracking
    await db.session_files.update(existing.id, {
      times_modified: existing.times_modified + (options.modified ? 1 : 0),
      mentioned_in_context: existing.mentioned_in_context + (options.mentioned ? 1 : 0),
      last_modified_at: new Date()
    });
  } else {
    // Create new tracking
    await db.session_files.create({
      session_id: sessionId,
      file_path: filePath,
      times_modified: options.modified ? 1 : 0,
      mentioned_in_context: options.mentioned ? 1 : 0
    });
  }
}
```

### 2.5 Session End Logic

```javascript
async function endSession(sessionId, reason = 'manual') {
  const session = await db.sessions.findById(sessionId);
  
  // 1. Calculate duration
  const duration = Math.floor(
    (new Date() - new Date(session.started_at)) / 60000
  ); // minutes
  
  // 2. Calculate LOC using git
  const { added, removed } = await calculateGitLOC(session.started_at);
  
  // 3. Get current task counts
  const taskCounts = await getCurrentTaskCounts(session.project_id);
  
  // 4. Calculate productivity score
  const productivityScore = calculateProductivityScore({
    ...session,
    loc_added: added,
    loc_removed: removed,
    duration_minutes: duration,
    ...taskCounts
  });
  
  // 5. Update session
  await db.sessions.update(sessionId, {
    ended_at: new Date(),
    duration_minutes: duration,
    status: reason === 'timeout' ? 'timeout' : 'ended',
    loc_added: added,
    loc_removed: removed,
    productivity_score: productivityScore,
    tasks_completed: taskCounts.completed,
    tasks_in_progress: taskCounts.inProgress,
    tasks_todo: taskCounts.todo
  });
  
  // 6. Generate session summary
  const summary = await generateSessionSummary(sessionId);
  
  console.log('\n📊 Session Summary:');
  console.log(summary);
  
  // 7. Clear global session
  global.currentSessionId = null;
  
  return summary;
}

async function calculateGitLOC(since) {
  const sinceDate = new Date(since).toISOString();
  
  try {
    // Get diff stats since session start
    const diffOutput = execSync(
      `git diff --numstat --since="${sinceDate}" HEAD`,
      { encoding: 'utf-8' }
    );
    
    let added = 0;
    let removed = 0;
    
    diffOutput.split('\n').forEach(line => {
      const [add, remove] = line.split('\t');
      if (add && add !== '-') added += parseInt(add);
      if (remove && remove !== '-') removed += parseInt(remove);
    });
    
    return { added, removed };
  } catch (error) {
    console.warn('Could not calculate git LOC:', error.message);
    return { added: 0, removed: 0 };
  }
}
```

### 2.6 Inactivity Monitor (2-hour timeout)

```javascript
let inactivityTimer = null;
const INACTIVITY_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

function startInactivityMonitor(sessionId) {
  resetInactivityTimer(sessionId);
}

function resetInactivityTimer(sessionId) {
  // Clear existing timer
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
  }
  
  // Set new timer
  inactivityTimer = setTimeout(async () => {
    console.log('⏱️  Session timed out due to inactivity (2 hours)');
    await endSession(sessionId, 'timeout');
  }, INACTIVITY_TIMEOUT);
}

function stopInactivityMonitor() {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
}
```

---

## Phase 3: Productivity Scoring Algorithm
**Goal**: Calculate meaningful productivity metrics  
**Timeline**: Week 3

### 3.1 Productivity Score Formula

```javascript
function calculateProductivityScore(session) {
  let score = 0;
  
  // Task completion (40 points max)
  const totalTasks = session.tasks_created || 1; // avoid division by zero
  const completionRate = (session.tasks_completed || 0) / totalTasks;
  score += completionRate * 40;
  
  // Decision making (15 points max)
  // Making decisions = progress
  score += Math.min(session.decisions_made * 3, 15);
  
  // Context building (15 points max)
  // Adding context = learning and documenting
  score += Math.min(session.context_items_added * 2, 15);
  
  // Code output (20 points max)
  // Positive net LOC (but not too much = code bloat)
  const netLOC = session.loc_added - session.loc_removed;
  if (netLOC > 0 && netLOC < 500) {
    score += 20; // sweet spot
  } else if (netLOC >= 500 && netLOC < 1000) {
    score += 15; // still good
  } else if (netLOC >= 1000) {
    score += 5; // might be too much at once
  } else if (netLOC < 0 && netLOC > -200) {
    score += 15; // refactoring/cleanup is good
  }
  
  // Session duration bonus (10 points max)
  // Productive sessions are focused (1-3 hours ideal)
  const hours = session.duration_minutes / 60;
  if (hours >= 1 && hours <= 3) {
    score += 10;
  } else if (hours > 3) {
    score += 5; // too long might mean stuck
  }
  
  // Normalize to 0-100
  return Math.min(100, Math.max(0, score));
}
```

### 3.2 Session Quality Indicators

```javascript
function getSessionQualityIndicators(session) {
  const indicators = {
    completion_rate: {
      value: (session.tasks_completed / session.tasks_created) * 100,
      status: null,
      label: 'Task Completion Rate'
    },
    focus_score: {
      value: calculateFocusScore(session),
      status: null,
      label: 'Focus Score'
    },
    code_churn: {
      value: Math.abs(session.loc_added - session.loc_removed),
      status: null,
      label: 'Code Churn'
    },
    decision_velocity: {
      value: session.decisions_made / (session.duration_minutes / 60),
      status: null,
      label: 'Decisions per Hour'
    }
  };
  
  // Assign status (good/warning/poor)
  indicators.completion_rate.status = 
    indicators.completion_rate.value >= 70 ? 'good' :
    indicators.completion_rate.value >= 40 ? 'warning' : 'poor';
  
  indicators.focus_score.status = 
    indicators.focus_score.value >= 70 ? 'good' :
    indicators.focus_score.value >= 50 ? 'warning' : 'poor';
  
  return indicators;
}

function calculateFocusScore(session) {
  // Focus = working on fewer files deeply vs many files shallowly
  const filesCount = session.files_modified?.length || 0;
  const avgModsPerFile = filesCount > 0 ? 
    (session.tasks_created / filesCount) : 0;
  
  if (filesCount <= 5 && avgModsPerFile >= 2) return 90; // highly focused
  if (filesCount <= 10 && avgModsPerFile >= 1) return 70; // good focus
  if (filesCount <= 20) return 50; // moderate focus
  return 30; // scattered focus
}
```

---

## Phase 4: CLI Commands
**Goal**: Full command interface for session management  
**Timeline**: Week 4

### 4.1 Session Commands

```bash
# View current active session
aidis session
aidis session current

# Start new session (if auto-start disabled)
aidis session start [--project=<name>] [--goal="<goal text>"]

# End current session
aidis session end [--notes="<notes>"]

# Switch project in current session
aidis session project <project-name>

# Add session goal (during or at start)
aidis session goal "<goal text>"

# Add session tags
aidis session tag <tag1> [tag2] [tag3]

# Add session notes
aidis session note "<note text>"

# View session history
aidis sessions list [--limit=10] [--project=<name>] [--tag=<tag>]

# View specific session details
aidis session <session-id>

# View session timeline
aidis session <session-id> timeline

# View session statistics
aidis sessions stats [--period=week|month|all]

# Compare sessions
aidis sessions compare <session-id-1> <session-id-2>
```

### 4.2 Session Status Display

```javascript
// aidis session
async function displayCurrentSession(sessionId) {
  const session = await getSessionWithDetails(sessionId);
  const elapsed = getElapsedTime(session.started_at);
  
  console.log(`
╔════════════════════════════════════════════════════════════
║ 📍 Session #${session.id} - ${session.status.toUpperCase()}
╠════════════════════════════════════════════════════════════
║ Project: ${session.project.name}
║ Started: ${formatDateTime(session.started_at)} (${elapsed} ago)
║ AI Model: ${session.ai_model}
╠════════════════════════════════════════════════════════════
║ 🎯 Goal: ${session.session_goals || 'Not set - use: aidis session goal "<text>"'}
║
║ 📊 Session Metrics:
║   Tasks: ${session.tasks_completed}/${session.tasks_created} completed 
║          (${session.tasks_in_progress} in progress, ${session.tasks_todo} todo)
║   Context: ${session.context_items_added} items added
║   Decisions: ${session.decisions_made} made
║   Code: +${session.loc_added || 0} / -${session.loc_removed || 0} lines
║
║ 📝 Tags: ${session.tags?.join(', ') || 'None'}
╚════════════════════════════════════════════════════════════
  `);
}
```

### 4.3 Session Summary Report (at session end)

```javascript
async function generateSessionSummary(sessionId) {
  const session = await getSessionWithDetails(sessionId);
  const activities = await getSessionActivities(sessionId);
  const files = await getSessionFiles(sessionId);
  
  const report = `
╔════════════════════════════════════════════════════════════
║ 📊 SESSION SUMMARY - #${session.id}
╠════════════════════════════════════════════════════════════
║ Project: ${session.project.name}
║ Duration: ${session.duration_minutes} minutes (${(session.duration_minutes/60).toFixed(1)} hours)
║ AI Model: ${session.ai_model}
║ Status: ${session.status}
╠════════════════════════════════════════════════════════════
║ 🎯 Session Goal:
║ ${session.session_goals || 'No goal set'}
║
║ 📈 Productivity Score: ${session.productivity_score}/100
║ ${getScoreEmoji(session.productivity_score)}
╠════════════════════════════════════════════════════════════
║ 📋 Work Completed:
║
║ ✅ Tasks: ${session.tasks_completed} completed
║ 📝 Total Tasks: ${session.tasks_created} created
║    └─ In Progress: ${session.tasks_in_progress}
║    └─ Todo: ${session.tasks_todo}
║
║ 🧠 Context: ${session.context_items_added} items added
║ 🎯 Decisions: ${session.decisions_made} made
║
║ 💻 Code Changes:
║    Added: +${session.loc_added} lines
║    Removed: -${session.loc_removed} lines
║    Net: ${session.net_loc > 0 ? '+' : ''}${session.net_loc} lines
╠════════════════════════════════════════════════════════════
║ 📁 Files Worked On: ${files.length}
║
${formatTopFiles(files, 5)}
╠════════════════════════════════════════════════════════════
║ ⏱️  Activity Timeline (Recent):
║
${formatRecentActivities(activities, 5)}
╠════════════════════════════════════════════════════════════
║ 🏷️  Tags: ${session.tags?.join(', ') || 'None'}
║
║ 📝 Notes:
║ ${session.session_notes || 'No notes added'}
╚════════════════════════════════════════════════════════════

💡 Tip: View full timeline with: aidis session ${session.id} timeline
  `;
  
  return report;
}

function getScoreEmoji(score) {
  if (score >= 80) return '🌟 Excellent session!';
  if (score >= 60) return '👍 Good session';
  if (score >= 40) return '👌 Decent session';
  return '📉 Room for improvement';
}

function formatTopFiles(files, limit) {
  return files
    .sort((a, b) => b.times_modified - a.times_modified)
    .slice(0, limit)
    .map(f => `║    • ${f.file_path} (${f.times_modified}× modified, ${f.mentioned_in_context}× @mentioned)`)
    .join('\n');
}

function formatRecentActivities(activities, limit) {
  return activities
    .slice(-limit)
    .reverse()
    .map(a => `║    ${formatTime(a.occurred_at)} - ${a.activity_description}`)
    .join('\n');
}
```

---

## Phase 5: Session Analytics & Insights
**Goal**: Aggregate data across sessions for insights  
**Timeline**: Week 5

### 5.1 Session Statistics Command

```bash
aidis sessions stats --period=month
```

```javascript
async function generateSessionStats(period = 'month') {
  const sessions = await getSessionsInPeriod(period);
  
  const stats = {
    total_sessions: sessions.length,
    total_duration: sessions.reduce((sum, s) => sum + s.duration_minutes, 0),
    avg_duration: 0,
    avg_productivity: 0,
    total_tasks_created: sessions.reduce((sum, s) => sum + s.tasks_created, 0),
    total_tasks_completed: sessions.reduce((sum, s) => sum + s.tasks_completed, 0),
    completion_rate: 0,
    total_decisions: sessions.reduce((sum, s) => sum + s.decisions_made, 0),
    total_context: sessions.reduce((sum, s) => sum + s.context_items_added, 0),
    total_loc_added: sessions.reduce((sum, s) => sum + s.loc_added, 0),
    total_loc_removed: sessions.reduce((sum, s) => sum + s.loc_removed, 0),
    net_loc: 0,
    most_productive_day: null,
    most_used_model: null,
    top_tags: []
  };
  
  // Calculate averages
  stats.avg_duration = stats.total_duration / stats.total_sessions;
  stats.avg_productivity = sessions.reduce((sum, s) => sum + s.productivity_score, 0) / sessions.length;
  stats.completion_rate = (stats.total_tasks_completed / stats.total_tasks_created) * 100;
  stats.net_loc = stats.total_loc_added - stats.total_loc_removed;
  
  // Find patterns
  stats.most_productive_day = findMostProductiveDay(sessions);
  stats.most_used_model = findMostUsedModel(sessions);
  stats.top_tags = getTopTags(sessions);
  
  return formatStats(stats, period);
}

function formatStats(stats, period) {
  return `
╔════════════════════════════════════════════════════════════
║ 📊 SESSION STATISTICS - ${period.toUpperCase()}
╠════════════════════════════════════════════════════════════
║ Total Sessions: ${stats.total_sessions}
║ Total Time: ${(stats.total_duration / 60).toFixed(1)} hours
║ Average Session: ${stats.avg_duration.toFixed(0)} minutes
║ Avg Productivity: ${stats.avg_productivity.toFixed(1)}/100
╠════════════════════════════════════════════════════════════
║ 📋 Tasks:
║    Created: ${stats.total_tasks_created}
║    Completed: ${stats.total_tasks_completed}
║    Completion Rate: ${stats.completion_rate.toFixed(1)}%
║
║ 🧠 Knowledge:
║    Decisions: ${stats.total_decisions}
║    Context Items: ${stats.total_context}
║
║ 💻 Code:
║    Lines Added: +${stats.total_loc_added}
║    Lines Removed: -${stats.total_loc_removed}
║    Net Change: ${stats.net_loc > 0 ? '+' : ''}${stats.net_loc}
╠════════════════════════════════════════════════════════════
║ 📈 Insights:
║    Most Productive: ${stats.most_productive_day}
║    Preferred Model: ${stats.most_used_model}
║    Top Tags: ${stats.top_tags.join(', ')}
╚════════════════════════════════════════════════════════════
  `;
}
```

### 5.2 Session Comparison

```bash
aidis sessions compare 47 52
```

Shows side-by-side comparison of two sessions to understand what made one more productive than another.

### 5.3 Historical Tracking Queries

```sql
-- Track productivity over time
SELECT 
  DATE(started_at) as date,
  COUNT(*) as sessions,
  AVG(productivity_score) as avg_score,
  AVG(duration_minutes) as avg_duration,
  SUM(tasks_completed) as total_completed
FROM sessions
WHERE started_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(started_at)
ORDER BY date DESC;

-- Most productive tags
SELECT 
  tag,
  COUNT(*) as sessions,
  AVG(productivity_score) as avg_score
FROM sessions, unnest(tags) as tag
GROUP BY tag
ORDER BY avg_score DESC;

-- AI model effectiveness
SELECT 
  ai_model,
  COUNT(*) as sessions,
  AVG(productivity_score) as avg_score,
  AVG(tasks_completed::float / NULLIF(tasks_created, 0)) as completion_rate
FROM sessions
GROUP BY ai_model
ORDER BY avg_score DESC;
```

---

## Phase 6: Session Goals & AI Prompting
**Goal**: Make sessions intentional and goal-oriented  
**Timeline**: Week 6

### 6.1 Session Goal Prompting

```javascript
async function promptForSessionGoals(sessionId) {
  // Optional interactive prompt at session start
  console.log('\n🎯 What do you want to accomplish this session?');
  console.log('   (Press Enter to skip, or type your goal)\n');
  
  const goal = await getUserInput('Goal: ');
  
  if (goal && goal.trim()) {
    await db.sessions.update(sessionId, {
      session_goals: goal.trim()
    });
    
    console.log('✅ Session goal set!\n');
  }
}
```

### 6.2 Goal Achievement Tracking

```javascript
async function evaluateGoalAchievement(sessionId) {
  const session = await getSessionWithDetails(sessionId);
  
  if (!session.session_goals) {
    return null;
  }
  
  // Ask AI to evaluate if goal was achieved based on session data
  const evaluation = await askAI(`
    Session Goal: "${session.session_goals}"
    
    Session Results:
    - Tasks completed: ${session.tasks_completed}/${session.tasks_created}
    - Decisions made: ${session.decisions_made}
    - Context added: ${session.context_items_added}
    - Code changes: +${session.loc_added}/-${session.loc_removed}
    - Duration: ${session.duration_minutes} minutes
    
    Based on this data, was the session goal achieved? 
    Provide: YES/PARTIAL/NO and brief explanation.
  `);
  
  return evaluation;
}
```

### 6.3 AI Context Integration

When AI needs session context:

```javascript
async function getSessionContextForAI(sessionId) {
  const session = await getSessionWithDetails(sessionId);
  const recentActivities = await getRecentActivities(sessionId, 10);
  const files = await getSessionFiles(sessionId);
  
  return {
    current_session: {
      id: session.id,
      project: session.project.name,
      goal: session.session_goals,
      started: session.started_at,
      elapsed_minutes: getElapsedMinutes(session.started_at),
      
      progress: {
        tasks: {
          total: session.tasks_created,
          completed: session.tasks_completed,
          in_progress: session.tasks_in_progress,
          todo: session.tasks_todo
        },
        context_items: session.context_items_added,
        decisions: session.decisions_made
      },
      
      recent_activities: recentActivities.map(a => ({
        type: a.activity_type,
        description: a.activity_description,
        when: a.occurred_at
      })),
      
      active_files: files.map(f => f.file_path),
      
      tags: session.tags
    }
  };
}
```

This allows AI to give contextual advice:
- "You've been working on auth-middleware.js heavily (5× modified). Need help with it?"
- "Your session goal was to refactor the database layer. You've completed 3/5 tasks. Want to tackle the remaining ones?"
- "You've made 8 decisions so far - want me to summarize them?"

---

## Implementation Checklist

### Phase 1: Database (Week 1)
- [ ] Create `sessions` table
- [ ] Create `session_activities` table
- [ ] Create `session_files` table
- [ ] Add indexes
- [ ] Test schema migrations

### Phase 2: Session Lifecycle (Week 2)
- [ ] Implement session start logic
- [ ] Implement intelligent project assignment
- [ ] Implement activity tracking
- [ ] Implement file tracking with @mentions
- [ ] Implement session end logic
- [ ] Implement inactivity monitor (2-hour timeout)
- [ ] Test full session lifecycle

### Phase 3: Productivity Scoring (Week 3)
- [ ] Implement productivity score calculation
- [ ] Implement quality indicators
- [ ] Implement git LOC calculation
- [ ] Test scoring with real sessions

### Phase 4: CLI Commands (Week 4)
- [ ] `aidis session` - show current session
- [ ] `aidis session start` - manual start
- [ ] `aidis session end` - manual end
- [ ] `aidis session project` - switch project
- [ ] `aidis session goal` - set/update goal
- [ ] `aidis session tag` - add tags
- [ ] `aidis session note` - add notes
- [ ] `aidis sessions list` - view history
- [ ] `aidis session <id>` - view specific session
- [ ] `aidis session <id> timeline` - view timeline
- [ ] Test all commands

### Phase 5: Analytics (Week 5)
- [ ] `aidis sessions stats` - aggregate statistics
- [ ] `aidis sessions compare` - compare sessions
- [ ] Implement historical tracking queries
- [ ] Create visualization helpers
- [ ] Test analytics with sample data

### Phase 6: Goals & AI (Week 6)
- [ ] Implement goal prompting
- [ ] Implement goal achievement evaluation
- [ ] Create AI context integration
- [ ] Document AI prompting patterns
- [ ] Test AI integration

---

## Success Criteria

You'll know session tracking is working when:

1. ✅ Sessions auto-start with correct project on MCP connect
2. ✅ All your work is tracked automatically (tasks, context, decisions)
3. ✅ You can see a detailed timeline of what you did during a session
4. ✅ Sessions auto-end after 2 hours of inactivity
5. ✅ You get a meaningful productivity score that makes sense
6. ✅ You can answer: "What did I accomplish in my last 5 sessions?"
7. ✅ AI can use session data to provide better assistance
8. ✅ You can identify patterns (e.g., "I'm most productive on Tuesday mornings")

---

## Data Integration with Code Health Metrics (Future)

Once both systems are running, combine them:

```sql
-- Session with code health impact
SELECT 
  s.id,
  s.productivity_score,
  s.net_loc,
  AVG(cm_before.cyclomatic_complexity) as complexity_before,
  AVG(cm_after.cyclomatic_complexity) as complexity_after,
  (AVG(cm_after.cyclomatic_complexity) - AVG(cm_before.cyclomatic_complexity)) as complexity_delta
FROM sessions s
JOIN code_metrics cm_before ON 
  cm_before.project_id = s.project_id 
  AND cm_before.measured_at < s.started_at
JOIN code_metrics cm_after ON 
  cm_after.project_id = s.project_id 
  AND cm_after.measured_at > s.ended_at
WHERE s.id = $1
GROUP BY s.id;
```

This shows: "Did this session make the codebase better or worse?"

---

## Notes & Considerations

### Privacy & Data
- Session data stays local in your PostgreSQL
- AI model info helps track which AI you worked with
- Consider adding option to export sessions for backup

### Performance
- Session activities table will grow quickly
- Consider archiving old activities (>90 days)
- Indexes are critical for timeline queries

### Future Enhancements
- Pomodoro timer integration
- Session templates (e.g., "bug fix session" pre-fills tags)
- Team sessions (if you ever work with others)
- Voice notes attached to sessions
- Screenshot/recording integration

---

## Example Session Flow

```
1. Start Claude Desktop with AIDIS MCP
   ↓
2. AIDIS: "Starting session #48 for project: AIDIS (last worked on 3 hours ago)"
   ↓
3. AIDIS: "What do you want to accomplish?"
   You: "Implement session tracking system"
   ↓
4. Work for 2 hours creating tasks, adding context, making decisions
   → Everything auto-tracked in database
   → File @mentions tracked
   → Activity timeline building
   ↓
5. You: "aidis session"
   → Shows current progress toward goal
   → Shows elapsed time, tasks completed, etc.
   ↓
6. You: "aidis session end"
   → Calculates git LOC changes
   → Generates productivity score
   → Shows beautiful summary report
   ↓
7. Later: "aidis sessions stats --period=week"
   → See trends across all sessions
```

---

**Remember**: Sessions should feel invisible when working, but provide powerful insights when you need them. The system captures what you do so you can focus on doing it.
