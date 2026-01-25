# Documentation Rebranding Complete: AIDIS → Mandrel

**Date**: 2025-10-31  
**Status**: ✅ COMPLETE

---

## Summary

All documentation files have been successfully rebranded from AIDIS to Mandrel. This includes file renames, content updates, and consistent terminology across the entire codebase documentation.

---

## Files Renamed (7 files)

1. ✅ `AIDIS_MCP_SERVER_REFERENCE_GUIDE.md` → `MANDREL_MCP_SERVER_REFERENCE_GUIDE.md`
2. ✅ `AIDIS_PRACTICAL_GUIDE.md` → `MANDREL_PRACTICAL_GUIDE.md`
3. ✅ `AIDIS_STORAGE_FORMAT_GUIDE.md` → `MANDREL_STORAGE_FORMAT_GUIDE.md`
4. ✅ `AIDIS_TOOLS.md` → `MANDREL_TOOLS.md`
5. ✅ `AGENT_AIDIS_READY.md` → `AGENT_MANDREL_READY.md`
6. ✅ `aidis-architecture.md` → `mandrel-architecture.md`
7. ✅ `AIDIS-tool-list.md` → `MANDREL-tool-list.md`

---

## Content Updates Applied

### Tool Name Changes
| Old Name | New Name |
|----------|----------|
| `aidis_ping` | `mandrel_ping` |
| `aidis_status` | `mandrel_status` |
| `aidis_help` | `mandrel_help` |
| `aidis_explain` | `mandrel_explain` |
| `aidis_examples` | `mandrel_examples` |

### Environment Variable Changes
| Old Variable | New Variable |
|--------------|--------------|
| `AIDIS_BIND_ADDR` | `MANDREL_BIND_ADDR` |
| `AIDIS_LOG_LEVEL` | `MANDREL_LOG_LEVEL` |
| `AIDIS_*` | `MANDREL_*` |

### Directory Reference Changes
- `aidis-command` → `mandrel-command`
- `aidis-mcp-server` → `mandrel-mcp-server`

### Product Name Changes
- "AIDIS Command" → "Mandrel Command"
- "AIDIS" → "Mandrel" (all occurrences)

---

## Files Updated by Directory

### Root Directory (10+ files)
- ✅ `README.md` - Complete rebrand with new title, references, commands
- ✅ `AGENTS.md` - All tool names, workflow references updated
- ✅ `CLAUDE.md` - Tool names updated
- ✅ `CLAUDE_CODE_HTTP_BRIDGE.md` - Tool names and env vars
- ✅ `CLAUDE_CODE_MCP_CONFIG.md` - Tool names
- ✅ All `MANDREL_*.md` files (previously `AIDIS_*.md`)

### Subdirectories Updated
- ✅ `adapters/README.md`
- ✅ `config/README.md`
- ✅ `docs/**/*.md` (all markdown files)
- ✅ `mcp-server/**/*.md` (all markdown files)
- ✅ `mandrel-command/**/*.md` (all markdown files)
- ✅ `aidis-command-dev/**/*.md` (all markdown files)
- ✅ `projects/**/*.md` (all markdown files)

---

## Intentionally Preserved

These items were **NOT changed** per investigation requirements:

1. **Database name**: `mandrel` (kept for backward compatibility)
2. **Git repository URL**: `https://github.com/RidgetopAi/aidis`
3. **Root directory**: `/home/ridgetop/aidis`
4. **Package.json names**: May still reference aidis internally

---

## Statistics

- **Files renamed**: 7
- **Directories with updated docs**: 8+
- **Estimated markdown files updated**: 50+
- **Tool names updated**: 5 (ping, status, help, explain, examples)
- **Environment variables updated**: All `AIDIS_*` → `MANDREL_*`

---

## Verification Steps

To verify the rebrand:

```bash
# Check for remaining AIDIS tool references (should find none in docs)
grep -r "aidis_ping\|aidis_help\|aidis_explain" --include="*.md" . 2>/dev/null | grep -v node_modules | grep -v ".git"

# Verify renamed files exist
ls -la MANDREL_*.md AGENT_MANDREL_READY.md mandrel-architecture.md

# Check README has Mandrel branding
head -1 README.md
```

---

## Next Steps

Consider updating:
1. Code tool definitions in `mcp-server/src/` (if not already done)
2. Package.json files for consistency
3. Start/stop scripts (start-aidis.sh → start-mandrel.sh)
4. Systemd service files
5. Environment variable examples in code

---

## Migration Notes

This documentation rebrand is part of the larger AIDIS → Mandrel migration. See:
- `AIDIS_TO_MANDREL_MIGRATION_SUMMARY.md` - Original migration plan
- `MANDREL_MIGRATION_COMPLETE.md` - Code migration status
- `ENV_VAR_MIGRATION_SUMMARY.md` - Environment variable changes

---

**Completed by**: Amp AI Agent  
**Date**: October 31, 2025  
**Status**: Production Ready ✅
