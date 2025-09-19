# HTTP ↔ MCP Contract Tests

TR0009 introduces a lightweight contract test suite that exercises the HTTP bridge endpoints exposed by the MCP server. The goal is to guarantee that the `/mcp/tools` endpoints keep returning the same envelope format the adapters expect.

## Test Coverage

Current tests live in `mcp-server/src/tests/httpContract.test.ts` and verify:

- **Successful tool execution** – `aidis_ping` returns the standard text envelope via HTTP and matches the direct MCP invocation.
- **Structured error propagation** – Unknown tools and malformed payloads produce JSON envelopes with `success: false` and descriptive `error` messages.
- **Status invariants** – `aidis_status` includes feature-flag metadata even when the server runs in test mode with mocked infrastructure.
- **Static content delivery** – `aidis_help` produces the human-readable catalogue of tools.
- **Tool registry envelope** – every tool defined in `mcp-server/src/server.ts` is invoked via HTTP; the contract suite validates that each call resolves to either a success envelope or a standardized error payload. The test extracts the list of `case 'tool'` handlers directly from the source to avoid a hard-coded registry.

Expand this file as we add more tools or stricter schemas.

## Lightweight Server Mode

To keep the suite fast and deterministic, the MCP server now recognises the following environment variables:

- `AIDIS_SKIP_DATABASE=true` – bypass PostgreSQL initialisation and mark the server healthy.
- `AIDIS_SKIP_BACKGROUND=true` – skip git tracking, pattern detection, metrics, and complexity services on startup/shutdown.
- `AIDIS_SKIP_STDIO=true` – avoid attaching the stdio transport when tests drive the HTTP endpoints directly.
- `AIDIS_DISABLE_PROCESS_EXIT_HANDLERS=true` – prevent the process lock from registering exit handlers that call `process.exit`, which would otherwise terminate the Vitest worker.

The contract suite sets these variables automatically; you can also export them manually when running ad-hoc checks.

## Running the Suite

```bash
cd mcp-server
npm run test:contracts
```

The test spins up its own MCP instance bound to a random loopback port, runs the assertions, and shuts the instance down. No dedicated test database is required.

### Backend Consumer Checks

The AIDIS Command backend includes a lightweight consumer contract test that stubs the MCP HTTP server and exercises `McpService.callTool`. Run it with:

```bash
cd aidis-command/backend
npm run test:contracts
```

This command sets `AIDIS_SKIP_DB_TESTS=true` so the backend’s Jest bootstrap skips real database checks, then executes only the MCP contract spec.

## Adding New Contracts

1. Add schemas to `httpContract.test.ts` (or a shared helper) describing the response shapes you want to lock down.
2. Use the `postTool` helper to call additional tools through the HTTP endpoint.
3. Assert both the success envelope and distinguishing content (e.g., specific fields in the textual response).
4. Update this document with any new flags or workflows so other engineers know how to interpret failures.
