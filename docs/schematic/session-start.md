# Schematic · Page 1 — Start a Session

> **What this is.** Mandrel's "schematic": a map of a signal path, the contract (expected
> input→output) at each node, and the measurement points (tests) that prove it. You trace a
> signal start→finish, measure each node against its contract, and isolate the first node where
> measured ≠ expected. (ET troubleshooting, applied to software. See Lesson 007 for the
> single-signal version; this is that, made a standing artifact.)
>
> **How to extend.** One page per signal path. Trace → document nodes + contracts → fix where
> measured ≠ expected → lock each node with a contract test (the fuse) → next page.

**Signal:** user starts a development session from the Command UI.
**Status:** ✅ GREEN — witnessed end-to-end in the browser (2026-06-11).
**First traced:** 2026-06-11 (symptom: "I can't start a session").

---

## Signal path & node contracts

```
NODE 0  StartSessionModal.handleSubmit  →  sessionsClient.startSession({title, goal, tags, ...})
          contract: form submit fires the client call                                  ✓

NODE 1  frontend/src/api/sessionsClient.ts
          contract: build an authenticated request to the SAME-ORIGIN session API
          → REST_API_BASE = (REACT_APP_MCP_URL || '') + '/api/v2'   [same-origin]
          → fetch('/api/v2/sessions/start', { Authorization: Bearer <jwt> })            ✓ (was FAULT 1)

NODE 2  browser → nginx (app.mandrel.ridgetopai.net)
          contract: '/api' routes to the authenticated command-backend                  ✓

NODE 3  command-backend  backend/src/routes/index.ts
          contract: authenticateToken gate, then proxy POST /api/v2/sessions/start
                    to ${MANDREL_MCP_URL}=http://mcp-server:8080                         ✓ (was FAULT 1b: localhost≠sibling)
          measured: with JWT → 201 ; without JWT → 401

NODE 4  mcp-server  POST /api/v2/sessions/start  →  SessionAnalyticsHandler.startSession
          contract: INSERT a session, then read it back via getSessionData              ✓ (was FAULT 2 + 3)
          measured: HTTP 201, data non-null

NODE 5  Postgres  sessions table
          contract: schema has every column the INSERT writes AND the SELECT reads      ✓ (was FAULT 2 + 3)
          measured: app schema == prod schema (drift diff empty)
```

---

## Faults found (the symptom showed only #1)

| # | Node | Fault | Root cause | Fix |
|---|------|-------|-----------|-----|
| 1 | 1/2 | `net::ERR_FAILED` / "Failed to fetch" | client hard-wired to `http://localhost:8080` (the user's own machine, from a hosted browser) | same-origin base + `Authorization: Bearer` → routed through the authenticated backend (`83b888a`) |
| 1b | 3 | backend proxy `503 fetch failed` | inside the backend container `localhost:8080` is the backend itself; the MCP server is a sibling = `mcp-server:8080` | `MANDREL_MCP_URL` env (`83b888a`) |
| 2 | 4/5 | `HTTP 500: column "session_goal" does not exist` | INSERT writes `session_goal,tags,ai_model`; no migration ever added them | migration `041` (`02bde34`) |
| 3 | 4/5 | `201` but `data: null` | read-back SELECT references 11 columns the golden-image DB lacked (`lines_*`, `productivity_score`, `files_modified_count`, `activity_count`, `decisions_created`, `ip_address`, `token_id`, `user_agent`, `user_id`) | migration `042` reconciles app schema to prod (`6fef045`) |

**Lesson:** the visible symptom (Fault 1) masked two deeper, independent faults. Faults 2 & 3 are an
*unfinished feature* (code ahead of schema), not a regression — they had never worked in any
environment. Tracing the whole signal, and measuring the server node directly (bypassing the
broken browser hop), found all of them in one pass.

---

## Measurement points (the fuses)

| Test | Catches | Path |
|------|---------|------|
| `mcp-server/src/tests/sessionStartSchema.contract.test.ts` | Fault 2 (INSERT columns) | real DB |
| `mcp-server/src/tests/sessionStartRoundTrip.contract.test.ts` | Fault 3 (read-back columns) | real DB |
| (todo) sessionsClient base-URL resolution test | Fault 1 (same-origin, not localhost) | unit |
| (todo) backend proxy auth test (`401` w/o token, `201` w/) | Fault 1b + auth gate | integration |

Contract tests are wired to the **real path** (real DB / real handler), not mocks — a mock here would
be "a schematic that doesn't match the board," which is worse than none (it lied while the signal was
dead — exactly how 3 session test files coexisted with a totally broken feature).

---

## Open / related

- **Systemic:** the golden image's committed migrations don't reproduce the current schema (sessions
  was 11 columns behind prod). Affects every new instance. → task `8bc1e8a9` (P1) — decide rebaseline
  vs reconcile.
- **Out of band on this page:** `frontend/src/api/mandrelApiClient.ts` still calls the MCP bridge at
  `localhost:8080` directly (degrades via fallback) → task `4eed9415`.
- A separate `/api/projects/sessions/all` endpoint returns `401` post-login — minor, unrelated to
  start; worth a glance.
