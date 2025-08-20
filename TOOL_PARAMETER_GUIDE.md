# 🔧 AIDIS Tool Parameter Quick Reference

## 🎯 SOURCE OF TRUTH
**File:** `/mcp-server/src/server.ts` (lines ~650-1400)  
**Rule:** Always check the `inputSchema.required` array for each tool

---

## ✅ CONFIRMED WORKING TOOLS (Exact Parameters)

### System Health
- `aidis_ping` → `message` (optional)
- `aidis_status` → (no parameters)

### Context Management  
- `context_search` → `query` (required)
- `context_stats` → (no parameters)
- `context_store` → `content`, `type` (required), `tags` (optional)

### Project Management ✅ 100%
- `project_current` → (no parameters) 
- `project_list` → `includeStats` (optional)
- `project_create` → `name` (required), `description` (optional)
- `project_insights` → (no parameters)
- `project_info` → `project` (required) ← STRING: name or ID
- `project_switch` → `project` (required) ← STRING: name or ID

### Naming Registry ✅ 100%
- `naming_stats` → (no parameters)
- `naming_check` → `proposedName`, `entityType` (both required)
- `naming_register` → `canonicalName`, `entityType` (both required) 
- `naming_suggest` → `description`, `entityType` (both required)

### Technical Decisions
- `decision_search` → `query` (required)
- `decision_stats` → (no parameters) 
- `decision_record` → `title`, `description`, `rationale`, `decisionType`, `impactLevel` (all required)
- `decision_update` → `decisionId` (required), others optional

---

## ❌ COMMON PARAMETER MISTAKES

| ❌ Wrong | ✅ Correct | Tool |
|----------|------------|------|
| `name` | `proposedName` | naming_check |
| `file_path` | `filePath` | code_analyze |  
| `projectName` | `project` | project_switch |
| `to_agent` | `toAgentId` | agent_message |

---

## 🔍 How to Check Any Tool Parameters

```bash
# Find the tool definition:
grep -A 20 "name: 'TOOL_NAME'" /home/ridgetop/aidis/mcp-server/src/server.ts

# Look for the required array:
# "required: ['param1', 'param2']"
```

## 🚨 Parameter Validation Rule
**Always use the EXACT parameter names from `server.ts` inputSchema, not what error messages suggest!**

The server.ts file is the single source of truth - error messages can be misleading.
