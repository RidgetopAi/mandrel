# Mandrel Migration - Implementation Complete

**Date**: 2025-10-31  
**Status**: ✅ Complete - All routes and endpoints updated

## Summary of Changes

Successfully migrated API routes and endpoints from AIDIS to Mandrel branding with full backward compatibility. **No `/aidis` route paths were found** - the application already used generic `/api/*` paths.

## Files Modified

### 1. Environment Configuration (3 files)

#### `config/environments/.env.example`
- ✅ Added MANDREL_* variables as primary (MANDREL_MCP_PORT, MANDREL_MCP_BRIDGE_PORT, etc.)
- ✅ Marked AIDIS_* variables as deprecated with clear migration path
- ✅ Added documentation for port configuration

#### `mandrel-command/backend/.env.example`
- ✅ Added MANDREL_HTTP_PORT and MANDREL_MCP_PORT as preferred variables
- ✅ Documented deprecation of AIDIS_* and PORT variables
- ✅ Added fallback chain documentation (MANDREL_* → AIDIS_* → Legacy)

#### `mandrel-command/backend/src/routes/index.ts`
- ✅ Updated MCP_BASE to use MANDREL_MCP_PORT with AIDIS_MCP_PORT fallback
- ✅ Added deprecation warning when AIDIS_MCP_PORT is used

### 2. MCP Tool Names (5 tools renamed)

#### `mcp-server/src/routes/index.ts`
- ✅ Added backward compatible aliases for all system tools
- ✅ Automatic deprecation warnings when old tool names are used
- **New names**: `mandrel_ping`, `mandrel_status`, `mandrel_help`, `mandrel_explain`, `mandrel_examples`
- **Old names**: Still work but log deprecation warnings

#### `mcp-server/src/routes/system.routes.ts`
- ✅ Updated response messages to say "Mandrel" instead of "AIDIS"
- ✅ Updated error context from `aidis_ping` to `mandrel_ping`

#### `mcp-server/src/handlers/navigation.ts`
- ✅ Updated tool catalog with new mandrel_* names
- ✅ Updated documentation strings
- ✅ Changed "27 Mandrel tools" (was "96 AIDIS tools")

### 3. Frontend API Client

#### `mandrel-command/frontend/src/api/mandrelApiClient.ts`
- ✅ Updated ping() to call `mandrel_ping` instead of `aidis_ping`
- ✅ Updated getStatus() to call `mandrel_status` instead of `aidis_status`
- ✅ Added deprecation warnings for legacy exports (`aidisApi`, `createAidisApiClient`)
- ✅ Used Proxy pattern for runtime warnings when deprecated exports are accessed

## Backward Compatibility Measures

### Environment Variables
```bash
# Priority chain (all files use this pattern)
MANDREL_MCP_PORT || AIDIS_MCP_PORT || default_value

# Runtime deprecation warning
⚠️  AIDIS_MCP_PORT is deprecated. Please use MANDREL_MCP_PORT instead.
```

### MCP Tool Names
```typescript
// Both names accepted in route dispatcher
case 'mandrel_ping':
case 'aidis_ping':  // DEPRECATED - use mandrel_ping
  return await systemRoutes.handlePing(args);

// Runtime deprecation warning
⚠️  Tool 'aidis_ping' is deprecated. Use 'mandrel_ping' instead.
```

### API Client Exports
```typescript
// Legacy exports still work but log warnings
export const aidisApi = new Proxy(mandrelApi, {
  get(target, prop) {
    warnDeprecation('aidisApi', 'mandrelApi');
    return (target as any)[prop];
  }
});

// Runtime deprecation warning (once per session)
⚠️  aidisApi is deprecated. Use mandrelApi instead.
```

## Migration Path for Users

### For Environment Variables
1. **Current state**: AIDIS_* variables still work
2. **Action required**: Update .env files to use MANDREL_* variables
3. **Timeline**: AIDIS_* support will be removed in 12 months

### For MCP Tool Names
1. **Current state**: Both `aidis_*` and `mandrel_*` work
2. **Action required**: Update tool calls to use `mandrel_*` prefix
3. **Timeline**: `aidis_*` aliases will be removed in 12 months

### For API Client Code
1. **Current state**: Both `aidisApi` and `mandrelApi` work
2. **Action required**: Update imports to use `mandrelApi`
3. **Timeline**: `aidisApi` export will be removed in 12 months

## What Was NOT Changed

### Already Using Generic Paths
- ✅ All API routes use `/api/*` (no `/aidis` paths found)
- ✅ No localStorage/sessionStorage keys with 'aidis' found
- ✅ Backend already had MANDREL_* environment variable support

### Tools Keeping Original Names
- ✅ Context tools: `context_*` (4 tools)
- ✅ Project tools: `project_*` (6 tools)  
- ✅ Decision tools: `decision_*` (4 tools)
- ✅ Task tools: `task_*` (6 tools)
- ✅ Search tools: `smart_search`, `get_recommendations`, `project_insights` (3 tools)

**Only system/navigation tools changed**: 5 tools renamed from `aidis_*` to `mandrel_*`

## Testing Performed

### ✅ TypeScript Compilation
- Backend build: **PASSED** ✓
- Frontend diagnostics: **PASSED** ✓
- No type errors introduced

### ✅ Backward Compatibility
- Old tool names still work via aliases
- Old environment variables still work via fallback chain
- Old API client exports still work via Proxy pattern

### ✅ Deprecation Warnings
- Environment variables log warnings when using AIDIS_*
- Tool names log warnings when using aidis_*
- API client exports log warnings when using aidisApi

## Route Summary

### API Routes (NO CHANGES - Already Generic)
All routes already use `/api/*` base path:

```typescript
// Backend routes (mandrel-command/backend/src/routes/index.ts)
router.use('/api', apiRoutes);

// Mounted routes under /api:
/api/health
/api/auth/*
/api/users/*
/api/contexts/*
/api/projects/*
/api/sessions/*
/api/tasks/*
/api/decisions/*
/api/naming/*
/api/dashboard/*
/api/monitoring/*
/api/validation/*
/api/type-safety/*
/api/embedding/*
/api/openapi/*
```

### MCP Tool Routes (UPDATED)
System tools renamed with backward compatibility:

| Old Name | New Name | Status |
|----------|----------|--------|
| `aidis_ping` | `mandrel_ping` | ✅ Both work, old deprecated |
| `aidis_status` | `mandrel_status` | ✅ Both work, old deprecated |
| `aidis_help` | `mandrel_help` | ✅ Both work, old deprecated |
| `aidis_explain` | `mandrel_explain` | ✅ Both work, old deprecated |
| `aidis_examples` | `mandrel_examples` | ✅ Both work, old deprecated |

All other tools (22 tools) keep original names.

## Deprecation Timeline

| Milestone | Date | Action |
|-----------|------|--------|
| **Phase 1** (Now) | 2025-10-31 | ✅ Add MANDREL_* support, keep AIDIS_* working |
| **Phase 2** (3 months) | 2026-01-31 | Add console warnings to documentation |
| **Phase 3** (6 months) | 2026-04-30 | Update all internal code to use MANDREL_* |
| **Phase 4** (12 months) | 2026-10-31 | Remove AIDIS_* support (major version bump) |

## Environment Variables Reference

### Current (Recommended)
```bash
# Service Ports
MANDREL_MCP_PORT=8080
MANDREL_MCP_BRIDGE_PORT=8081
MANDREL_COMMAND_DEV_PORT=3000
MANDREL_COMMAND_PROD_PORT=5000
MANDREL_HTTP_PORT=5000

# Database
MANDREL_DATABASE_URL=postgresql://...
MANDREL_DATABASE_USER=ridgetop
MANDREL_DATABASE_HOST=localhost
MANDREL_DATABASE_NAME=mandrel

# Authentication
MANDREL_JWT_SECRET=your-secret-key
MANDREL_JWT_EXPIRES_IN=24h
MANDREL_BCRYPT_ROUNDS=12
```

### Deprecated (Still Works)
```bash
# Old prefix - will be removed in 12 months
AIDIS_MCP_PORT=8080
AIDIS_HTTP_PORT=5000
AIDIS_DATABASE_URL=postgresql://...
AIDIS_JWT_SECRET=your-secret-key

# Legacy - will be removed in 12 months
PORT=5000
DATABASE_USER=ridgetop
JWT_SECRET=your-secret-key
```

## Documentation Updates Needed

- [ ] Update AGENTS.md to reference mandrel_* tool names
- [ ] Update README.md with Mandrel branding
- [ ] Update API documentation for new tool names
- [ ] Create migration guide for external users
- [ ] Update example code snippets

## Risk Assessment

| Component | Risk | Impact | Status |
|-----------|------|--------|--------|
| Environment variables | **Low** | Backend only | ✅ Complete with fallbacks |
| MCP tool names | **Low** | MCP clients | ✅ Complete with aliases |
| API client exports | **Low** | Frontend only | ✅ Complete with Proxy warnings |
| API route paths | **None** | N/A | ✅ No /aidis paths existed |

## Next Steps

1. **Monitor deprecation warnings** in logs to identify remaining AIDIS_* usage
2. **Update documentation** (AGENTS.md, README, etc.)
3. **Communicate migration path** to any external API consumers
4. **Plan removal** of deprecated aliases in 12 months

## Notes

- No breaking changes introduced - 100% backward compatible
- All TypeScript compilation passes without errors
- Deprecation warnings help users migrate gradually
- Clean separation between new (MANDREL_*) and deprecated (AIDIS_*) patterns
