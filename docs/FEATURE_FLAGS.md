# Feature Flag System

AIDIS now supports a lightweight feature flag system shared across the MCP server, AIDIS Command backend, and React frontend.

## Configuration

Feature flags are defined in `config/feature-flags.json`:

```json
{
  "version": 1,
  "updatedAt": "2025-09-15T00:00:00.000Z",
  "flags": {
    "phase1.featureFlags": false,
    "phase1.contractTests": false,
    "phase1.reactErrorBoundaries": false
  }
}
```

- `version` and `updatedAt` provide metadata for clients.
- `flags` is a boolean map; add new keys to gate functionality.
- Optional overrides can be included in the file via an `overrides` object.

### Environment Overrides

Set `AIDIS_FEATURE_FLAG_OVERRIDES` to a JSON object (e.g., `{ "phase1.featureFlags": true }`) to force values at runtime. Overrides apply across all services. Refresh interval defaults to five seconds and can be tuned with `AIDIS_FEATURE_FLAG_REFRESH_MS`.

## Shared Loader

The MCP server and AIDIS Command backend share the same implementation via their local utility modules:

- `mcp-server/src/utils/featureFlags.ts`
- `aidis-command/backend/src/utils/featureFlags.ts`

Each module exports a singleton `FeatureFlagStore` with helper functions:

- `ensureFeatureFlags()` initialises the store and schedules refreshes.
- `isFeatureEnabled(name, defaultValue?)` returns the current value.
- `store.getAllFlags()` and `store.getMetadata()` expose snapshots.

## Service Integration

- **MCP Server**: loads flags during boot and surfaces the current values via the `aidis_status` tool.
- **AIDIS Command Backend**: exposes `GET /api/feature-flags` for frontend consumers and places the store in `app.locals.featureFlags` for future server-side gating.
- **Frontend**: `FeatureFlagProvider` polls the backend endpoint and exposes `useFeatureFlag` / `useFeatureFlags` hooks for components. Example: the Settings page now reveals a feature flag card when `phase1.featureFlags` is true.

## Testing

- Vitest coverage for the shared loader (`mcp-server/tests/featureFlags.test.ts`).
- Jest integration test for the backend endpoint (`aidis-command/backend/src/__tests__/featureFlags.test.ts`).

## Usage Checklist

1. Update `config/feature-flags.json` with your flag changes.
2. Optionally set runtime overrides via environment variables.
3. Reference `useFeatureFlag('flag.name')` in React or `await isFeatureEnabled('flag.name')` on the server.
4. Keep this document updated as new flags or workflows are introduced.
