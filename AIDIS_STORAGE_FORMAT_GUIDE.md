# AIDIS Storage Format Quick Reference

## context_store Parameters

### Required Parameters:
- **content**: String (1-10000 chars) - The content to store
- **type**: Enum - MUST be one of:
  - `'code'` - Code snippets, implementations  
  - `'decision'` - Technical decisions, architecture choices
  - `'error'` - Error reports, debugging info
  - `'planning'` - Project planning, task breakdown  
  - `'completion'` - Completed work, achievements

### Optional Parameters:
- **tags**: Array of strings (max 20 tags, 50 chars each) - `["tag1", "tag2"]`
- **relevanceScore**: Number (0-10) - How important this context is
- **metadata**: Object - Additional structured data

## Common Usage Patterns:

### ✅ Storing Achievements/Completions:
```javascript
{
  content: "✅ T008 Task Management System - COMPLETE!\n\nImplemented 11 REST endpoints...",
  type: "completion", 
  tags: ["T008-complete", "task-management", "production-ready"]
}
```

### ✅ Storing Technical Decisions:
```javascript
{
  content: "**TECHNICAL DECISION: Database Architecture**\n\nChose PostgreSQL with pgvector...",
  type: "decision",
  tags: ["architecture", "database", "postgresql", "vectors"]
}
```

### ✅ Storing Error Reports:
```javascript
{
  content: "**BUG FIXED**: task_update JSON parsing error...",
  type: "error",
  tags: ["bug-fix", "task_update", "json-parsing", "validation"]
}
```

### ✅ Storing Code Insights:
```javascript
{
  content: "**IMPLEMENTATION PATTERN**: Multi-agent coordination...",
  type: "code",
  tags: ["agents", "coordination", "pattern", "architecture"]
}
```

### ✅ Storing Planning:
```javascript
{
  content: "**PROJECT ROADMAP**: T009 Technical Decision Browser...",
  type: "planning", 
  tags: ["roadmap", "T009", "decision-browser", "planning"]
}
```

## Tag Best Practices:
- Use kebab-case: `"task-management"` not `"Task Management"`
- Include project/task IDs: `"T008-complete"`, `"backup-strategy"`
- Add status indicators: `"production-ready"`, `"bug-fix"`, `"in-progress"`
- Use consistent terminology: `"postgresql"` not `"postgres"`

## Content Formatting:
- Start with clear headers: `**TITLE**:` or `# TITLE`
- Use markdown for readability
- Include status indicators: ✅ ❌ 🔄 ⏰
- Add context for future searches
- Keep under 10,000 characters

## Quick Format Check:
- ✅ `type` is one of the 5 valid enums
- ✅ `content` is meaningful and searchable  
- ✅ `tags` are relevant and consistent
- ✅ Content includes enough context for future reference
