# Mandrel - AI Agent Configuration

This file configures AI agents (Claude Code, Cursor, etc.) to use Mandrel for persistent memory and project intelligence.

---

## Quick Start

### First Steps (Every Session)

1. **Test connection**: `mandrel_ping`
2. **See all tools**: `mandrel_help`
3. **Check current project**: `project_current`
4. **Get tool help**: `mandrel_explain <toolname>`

### Navigation Tools

- **`mandrel_help`** - List all 27 tools organized by category
- **`mandrel_explain <toolname>`** - Detailed help for any tool
- **`mandrel_examples <toolname>`** - Usage examples and patterns

---

## Core Tools

### Context Management

Store and retrieve development context with semantic search:

```
context_store(content, type, tags?)
context_search(query)
context_get_recent(limit?)
```

**Context Types**: code, decision, error, discussion, planning, completion, milestone, reflections, handoff

### Project Management

```
project_list()           # List all projects
project_current()        # Show current project
project_switch(name)     # Switch to project
project_create(name)     # Create new project
```

### Task Management

```
task_create(title, description?, priority?, status?)
task_list(status?, priority?)
task_update(taskId, status?, priority?)
task_progress_summary()
```

### Decision Tracking

```
decision_record(title, description, decision_type, alternatives?)
decision_search(query)
decision_update(decisionId, outcome?, lessons_learned?)
```

### Smart Search

```
smart_search(query)           # Search across all data
get_recommendations()         # AI-powered suggestions
```

---

## Tool Categories

| Category | Tools |
|----------|-------|
| System | mandrel_ping, mandrel_status |
| Navigation | mandrel_help, mandrel_explain, mandrel_examples |
| Context | context_store, context_search, context_get_recent, context_stats |
| Projects | project_list, project_create, project_switch, project_current, project_info, project_insights |
| Decisions | decision_record, decision_search, decision_update, decision_stats |
| Tasks | task_create, task_list, task_update, task_details, task_bulk_update, task_progress_summary |
| Smart Search | smart_search, get_recommendations |

---

## Best Practices

### Store Context Regularly

Save important information as you work:

```
context_store("Implemented user authentication using JWT tokens with 24h expiry", "code", ["auth", "jwt"])
```

### Track Decisions

Record architectural and implementation decisions:

```
decision_record("Use PostgreSQL for database", "Needed vector search support via pgvector", "architecture", ["SQLite", "MongoDB"])
```

### Use Tasks for Coordination

Break work into trackable tasks:

```
task_create("Implement login endpoint", "POST /api/auth/login with JWT response", "high", "in_progress")
```

### Search Before Starting

Check existing context before beginning work:

```
context_search("authentication")
decision_search("database")
```

---

## Parameter Tips

- **Arrays**: Pass as JSON arrays: `["tag1", "tag2"]`
- **Optional params**: Omit if not needed
- **Get help**: Use `mandrel_explain <tool>` for full parameter details

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Connection failed | Check Mandrel server is running (`./start-mandrel.sh`) |
| Validation error | Check parameter types with `mandrel_explain` |
| Tool not found | Run `mandrel_help` to see available tools |
| Empty search results | Try broader query or check `project_current` |

---

**Mandrel**: Persistent AI memory for complex software projects
