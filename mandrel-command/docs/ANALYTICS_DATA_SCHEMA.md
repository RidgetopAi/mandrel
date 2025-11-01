# Analytics Data Schema Documentation

**Created**: 2025-10-07  
**Purpose**: Document exact data structures returned by analytics MCP tools and APIs

---

## `project_insights` MCP Tool

### Call Signature
```typescript
McpService.callTool('project_insights', { projectId: string })
```

### Actual Response Structure

**Top Level**:
```typescript
{
  success: boolean;
  data: {
    projectHealth: ProjectHealth;
    teamEfficiency: TeamEfficiency;
    raw: string;  // Formatted text summary
  }
}
```

**ProjectHealth**:
```typescript
interface ProjectHealth {
  score: number;        // 0-100
  level: string;        // 'healthy' | 'moderate' | 'needs_attention'
  components: number;   // Count of code components
  contexts: number;     // Count of contexts
  decisions: number;    // Count of decisions
  tasks: number;        // Count of tasks (0 if agent_tasks table missing)
}
```

**TeamEfficiency**:
```typescript
interface TeamEfficiency {
  score: number;        // 0-100 (0 if no task data)
  level: string;        // 'unknown' | 'low' | 'medium' | 'high'
}
```

**Raw Text Format**:
The `raw` field contains formatted text with:
- Code Health emoji indicator (🟢 🟡 🔴) and score
- Team Efficiency emoji indicator (⚪ 🔴 🟡 🟢) and percentage
- Component, Context, Decision, Task counts
- Knowledge Gaps list (bullet points)
- Code Issues list (bullet points)
- Recommendation prompt

### Example Response (Real Data)

**Project**: ai-chat-assistant (e2b7b046-4ce2-4599-9d52-33eddc50814e)

```json
{
  "success": true,
  "data": {
    "projectHealth": {
      "score": 100,
      "level": "healthy",
      "components": 0,
      "contexts": 69,
      "decisions": 2,
      "tasks": 0
    },
    "teamEfficiency": {
      "score": 0,
      "level": "unknown"
    },
    "raw": "🔍 Project Health Insights\n\n📊 Code Health: 🟢 HEALTHY (100/100)\n🤝 Team Efficiency: ⚪ NO DATA (0%)\n📦 Components: 0\n📝 Contexts: 69\n🎯 Decisions: 2\n📋 Tasks: 0\n📋 Knowledge Gaps:\n   • Limited error context - consider documenting more troubleshooting scenarios\n   • Few decisions documented - record more architectural choices\n⚠️  Code Issues:\n   • No code analyzed yet\n\n💡 Get specific recommendations with: get_recommendations"
  }
}
```

### Data Sources (Database Tables)

| Metric | Table | Query |
|--------|-------|-------|
| `projectHealth.score` | Calculated | `100 - (avgComplexity × 10) - (maxComplexity > 8 ? 20 : 0)` |
| `projectHealth.components` | `code_components` | `COUNT(*) WHERE project_id = ?` |
| `projectHealth.contexts` | `contexts` | `COUNT(*) WHERE project_id = ?` |
| `projectHealth.decisions` | `technical_decisions` | `COUNT(*) WHERE project_id = ?` |
| `projectHealth.tasks` | `agent_tasks` | `COUNT(*) WHERE project_id = ?` (0 if table missing) |
| `teamEfficiency.score` | Calculated | `(completedTasks / totalTasks) × 100` |

### Parsing Strategy for UI

**❌ OLD (Incorrect)**:
```typescript
// ProjectInsights.tsx was doing this - WRONG!
const codeHealthMatch = insightsStr.match(/Code Health:.*?(\d+\.?\d*)/);
```

**✅ NEW (Correct)**:
```typescript
interface ProjectInsightsResponse {
  success: boolean;
  data: {
    projectHealth: {
      score: number;
      level: string;
      components: number;
      contexts: number;
      decisions: number;
      tasks: number;
    };
    teamEfficiency: {
      score: number;
      level: string;
    };
    raw: string;
  };
}

// Direct object access
const { projectHealth, teamEfficiency, raw } = response.data;
const codeHealthScore = projectHealth.score;
const codeHealthLevel = projectHealth.level;
```

### Knowledge Gaps Extraction

**From `raw` text field**:
```typescript
const knowledgeGapsMatch = raw.match(/📋 Knowledge Gaps:\n(.*?)(?=\n⚠️|$)/s);
if (knowledgeGapsMatch) {
  const gaps = knowledgeGapsMatch[1]
    .split('\n')
    .filter(line => line.trim().startsWith('•'))
    .map(line => line.replace('   •', '').trim());
}
```

### Code Issues Extraction

**From `raw` text field**:
```typescript
const codeIssuesMatch = raw.match(/⚠️  Code Issues:\n(.*?)(?=\n|$)/s);
if (codeIssuesMatch) {
  const issues = codeIssuesMatch[1]
    .split('\n')
    .filter(line => line.trim().startsWith('•'))
    .map(line => line.replace('   •', '').trim());
}
```

---

## Backend API Response Format

### Endpoint
```
GET /api/projects/:id/insights
```

### Response Structure

Backend wraps MCP data in standard API format:

```typescript
{
  success: boolean;
  data: {
    insights: {
      projectHealth: { ... };
      teamEfficiency: { ... };
      raw: string;
    };
    generatedAt: string;  // ISO timestamp
    projectId: string;
  };
  correlationId?: string;
}
```

**Source**: `aidis-command/backend/src/controllers/project.ts:237`

---

## Verification Status

| Component | Verified | Mock Data | Notes |
|-----------|----------|-----------|-------|
| MCP Tool | ✅ | ❌ | Real database queries |
| Backend API | ✅ | ❌ | Direct MCP passthrough |
| Frontend Hook | ✅ | ❌ | Real API calls |
| UI Component | ⚠️ | ❌ | Exists but has parsing bug |

**Last Verified**: 2025-10-07  
**Test Project**: ai-chat-assistant  
**Data Quality**: Real production data (69 contexts, 2 decisions, 0 components, 0 tasks)
