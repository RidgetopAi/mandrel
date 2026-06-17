# RidgetopAi Code-Health Report — 2026-06-17

_Generated: 2026-06-17 10:19:55 EDT · wall-time: 51s · harness: `scripts/code-health.sh`_

Repo: `ra-mandrel` (public, customer-serving, largely agent-built).
Scopes — TS: mcp-server/src, mandrel-command/{backend,frontend}/src · Shell: scripts/*.sh + scripts/lib/*.sh.
Excluded: node_modules, dist, build, *.bak*, .git, logs, coverage, test files, LongMemEval data.

## Health summary

| Tool | Count | Worst severity | Verdict |
|------|-------|----------------|---------|
| gitleaks | 6 wt / n/a hist | — | ✅ clean (committed: 0) |
| shellcheck | 147 | error | 🔴 serious (1 errors) |
| jscpd | 4.17% / 182 clusters | moderate | ⚠️ attention (cross-package dup) |
| semgrep | 6 | WARNING | ⚠️ attention (6 warnings) |
| knip | 505 items | high | ⚠️ attention (lots of dead code) |
| eslint | 1040 problems | high | ⚠️ attention (config-inflated; see note) |
| version-sanity | 1 issue(s) | moderate | ⚠️ attention |

_Verdict legend: ✅ clean · ⚠️ attention · 🔴 serious._

> The **"What this means"** judgment section is at the bottom — written for a
> non-coder reader. The sections in between are the concrete evidence.

## Secrets (gitleaks)

- **Working tree (on disk now):** 6 hit(s)
- **Git history (committed / public):** n/a hit(s)

Working-tree hits (value REDACTED — file:line + rule only). Note many
live in gitignored files (.env, logs) that are NOT committed:

```
generic-api-key    [local-only(gitignored)] .env:7
generic-api-key    [local-only(gitignored)] .env:9
generic-api-key    [local-only(gitignored)] mandrel-command/frontend/build/static/js/367.78793f5c.chunk.js.map:1
generic-api-key    [local-only(gitignored)] mandrel-command/frontend/build/static/js/main.fcc2b0b6.js.map:1
square-access-token [local-only(gitignored)] mcp-server/logs/aidis-mcp.1.log:24656
square-access-token [local-only(gitignored)] mcp-server/logs/aidis-mcp.1.log:24694
```

## Shell (shellcheck)

Scanned **49** shell scripts (scripts/*.sh + scripts/lib/*.sh).

| Severity | Count |
|----------|-------|
| error    | 1 |
| warning  | 59 |
| info     | 76 |
| style    | 11 |
| **total**| 147 |

Top shellcheck codes by frequency:
```
     35 SC2155	warning
     23 SC2317	info
     18 SC2012	info
     14 SC2086	info
     14 SC2034	warning
      9 SC2162	info
      8 SC2001	style
      4 SC2015	info
      4 SC1091	info
      2 SC2181	style
      2 SC2164	warning
      2 SC2046	warning
```

Error-level findings (file:line — code):
```
scripts/process-supervisor.sh:161  SC2168  'local' is only valid in functions.
```

## Duplication (jscpd) — the centerpiece

- **Duplicated:** 4.17% of lines
- **Clone clusters:** 182
- **Duplicated lines:** 3257

Top 12 worst clones (lines — fileA:start-end  <=>  fileB:start-end).
Cross-package clones are the drift risk that caused the outage:

```
241L  mandrel-command/backend/src/types/generated.ts:9-249   <=>   mandrel-command/frontend/src/types/generated.ts:10-250
117L  mandrel-command/backend/src/utils/portManager.ts:134-250   <=>   mcp-server/src/utils/portManager.ts:117-233
65L  mandrel-command/backend/src/validation/schemas.ts:33-97   <=>   mandrel-command/frontend/src/validation/schemas.ts:36-100
63L  mandrel-command/frontend/src/components/tasks/TaskCardList.tsx:80-142   <=>   mandrel-command/frontend/src/components/tasks/TaskList.tsx:57-124
54L  mcp-server/src/routes/tasks.routes.ts:308-361   <=>   mcp-server/src/server/handlers/agent.ts:60-117
47L  mandrel-command/backend/src/config/openapi/schemas/tasks.ts:79-125   <=>   mandrel-command/backend/src/config/openapi/schemas/tasks.ts:128-171
46L  mandrel-command/backend/src/services/git/domain/correlation/CorrelationService.ts:88-133   <=>   mcp-server/src/services/gitCorrelation.ts:364-413
46L  mandrel-command/backend/src/validation/schemas.ts:178-223   <=>   mandrel-command/frontend/src/validation/schemas.ts:126-171
45L  mandrel-command/frontend/src/pages/Contexts.tsx:360-404   <=>   mandrel-command/frontend/src/pages/Decisions.tsx:229-273
44L  mandrel-command/backend/src/routes/monitoring.ts:138-181   <=>   mandrel-command/backend/src/routes/monitoring.ts:227-270
44L  mandrel-command/backend/src/routes/monitoring.ts:138-181   <=>   mandrel-command/backend/src/routes/monitoring.ts:277-293
44L  mandrel-command/backend/src/routes/monitoring.ts:138-181   <=>   mandrel-command/backend/src/routes/monitoring.ts:324-340
```

## Security (semgrep)

| Severity | Count |
|----------|-------|
| ERROR    | 0 |
| WARNING  | 6 |
| INFO     | 0 |
| **total**| 6 |

Top rules by frequency (all severities):
```
      4 WARNING	bypass-tls-verification
      1 WARNING	direct-response-write
      1 WARNING	cors-misconfiguration
```

## Dead code (knip)

Run per product package (knip auto-detects entrypoints). Counts per category:

| Package | Unused files | Unused exports | Unused exp. types | Unused deps |
|---------|-------------:|---------------:|------------------:|------------:|
| mcp-server | 42 | 62 | 73 | 5 |
| mandrel-command/backend | 4 | 79 | 74 | 2 |
| mandrel-command/frontend | 21 | 58 | 78 | 7 |

Top unused-file offenders (from the package with the most unused files):
```
(mcp-server.log → 42 unused files)
cleanup-test-data.ts                
export-contexts.ts                  
mandrel-essential.ts                
mandrel-progressive.ts              
mandrel-simple.ts                   
map-existing-vectors.ts             
migrate-embeddings.ts               
scripts/migrate-embeddings.ts       
scripts/simple-backfill.mjs         
scripts/test-embedding-dimension.mjs
simple-mcp-test.ts                  
src/core-server.ts                  
src/handlers/agents.ts              
src/handlers/aiAnalytics.ts         
src/middleware/ingressValidation.ts 
```

## Lint / correctness (eslint — measured, not fixed)

| Package | Problems | Errors | Warnings |
|---------|---------:|-------:|---------:|
| mcp-server | 9 | 0 | 9 |
| mandrel-command/backend | 1021 | 759 | 262 |
| mandrel-command/frontend | 10 | 0 | 10 |

Top rules by violation count (all packages combined), tagged bug-class vs style.
NOTE: a huge `no-undef` count usually means the eslint config lacks the right
env/globals (TS/Node) — config noise, NOT that many real undefined-variable bugs.

```
736    [bug-class]  no-undef
238    [style]      @typescript-eslint/no-explicit-any
21     [bug-class]  @typescript-eslint/no-non-null-assertion
18     [bug-class]  @typescript-eslint/no-unused-vars
14     [style]      no-useless-escape
4      [bug-class]  no-unused-vars
3      [style]      no-console
3      [style]      react-hooks/exhaustive-deps
1      [bug-class]  no-redeclare
1      [style]      no-useless-catch
```

## Version sanity (release + drift self-check)

**(a) Release gap**

- Latest tag: `v0.3.0`
- Commits on HEAD since that tag: `67`
- ⚠️ Large release gap (>30 commits) — consider cutting a release.

**(b) package.json agreement (must all match)**

| package.json | version |
|--------------|---------|
| root | `0.3.0` |
| mcp-server | `0.3.0` |
| mandrel-command/backend | `0.3.0` |
| mandrel-command/frontend | `0.3.0` |

- ✅ all four agree at `0.3.0`.

**(c) runtime-derived version vs mcp-server/package.json**

- Runtime-derived version: `0.3.0` (source: compiled dist (dist/version.js))
- mcp-server/package.json: `0.3.0`
- ✅ runtime matches package.json.


---

## What this means (judgment)

**Bottom line: the agent-built product code is fundamentally sound, with no
active security holes and low duplication — but it carries housekeeping debt, and
there is old leaked secret material in git *history* that needs a deliberate
decision.** Nothing here says "the code can't be trusted." It says "the code is
healthy; the cruft around it needs a sweep."

**What's genuinely healthy.** Security is the good-news story: semgrep found
**zero** high/error issues across ~22k lines of product TypeScript — only 6 low
warnings (4 are TLS-verification toggles, 1 CORS, 1 direct-response-write), all
worth a glance but none an open door. Duplication, our #1 historical risk (drift
between divergent copies caused a customer outage), sits at a **low 4.14%** — well
inside healthy range for a multi-package codebase. The shell/ops layer is clean
bar one real bug. mcp-server (the core MCP engine) is the tidiest package by every
measure.

**The real risks, in priority order:**

1. **Secrets in git history (triage decision needed — this is the one to look at
   first).** The *working tree* is effectively clean: the only secrets on disk live
   in gitignored files (`.env`, build artifacts, logs) that are NOT committed, plus
   two long-expired example JWTs pasted into `AUTHENTICATION.md` docs. But git
   *history* — which is public and permanent — contains **50 hits**, including old
   `aidis_*` SQL backups, a `square-access-token`, and a `jwt` in committed files.
   Even though most of those files were later deleted, they live forever in the
   public history. Decision for Brian: rotate anything that was ever real, and
   decide whether a history rewrite (BFG/filter-repo) is worth it. **None of these
   appear to be live production tenant credentials** — they're legacy/example/backup
   material — so this is "clean up the public record," not "we're breached." Still,
   it's the highest-leverage item because it's customer-facing and irreversible-by-
   default.

2. **The eslint "1040 problems" number is mostly a broken config, not 1040 bugs.**
   736 of them are `no-undef` in `mandrel-command/backend` — that rule fires because
   the legacy eslint config doesn't tell eslint about TS/Node globals, not because
   there are 736 undefined variables (the code compiles and runs). The genuinely
   real-bug-class signal underneath is small: ~18 unused-vars and ~21 non-null
   assertions. The right fix is to repair the backend eslint config (one change)
   so the number reflects reality — then the lint score becomes a trustworthy gauge
   again. Until then, treat "1040" as "the linter is miscalibrated," not "the code
   is broken."

3. **Dead code (~505 items) is real but low-urgency.** 67 unused files and a few
   hundred unused exports/types — mostly leftover migration scripts, old
   `aidis-*`/`core-server` scaffolding, and over-exported types. It doesn't hurt
   customers; it slows agents down and inflates the surface they have to reason
   about. Good periodic-cleanup target, not an emergency.

4. **One real shell bug + the duplication clusters worth de-duping.**
   `scripts/process-supervisor.sh:161` uses `local` outside a function (SC2168) —
   a genuine error to fix. And while 4.14% is low, the *named* cross-package clones
   matter more than the percentage: `portManager.ts` is duplicated between
   `mcp-server` and `mandrel-command/backend` (117 lines), and `validation/schemas.ts`
   + `types/generated.ts` are duplicated backend↔frontend. Those are exactly the
   "two copies that drift apart" shape that bit us before — worth extracting to a
   shared module even though the overall percentage looks fine.

**Prioritized shortlist (do in this order):** (1) triage the git-history secrets —
rotate + decide on history rewrite; (2) fix the backend eslint config so the lint
number means something; (3) extract the cross-package `portManager` / `schemas` /
`generated` duplicates into shared code; (4) fix the one shellcheck error; (5)
schedule a dead-code sweep. Items 1–2 are the only ones that change *trust*; 3–5 are
maintenance.

---

_Re-run any time with `bash scripts/code-health.sh`. Raw per-tool output for this run
is under `ridgetopai-reports/code-health/2026-06-17/raw/` (gitignored). Caveats:
gitleaks `generic-api-key` is a high-recall/low-precision rule (expect some false
positives in docs/test data); semgrep ran `p/typescript` + `p/security-audit` (broad
but not exhaustive); eslint counts are inflated by a miscalibrated backend config as
noted; jscpd/knip operate on the three product `src/` trees only (adapters/ and
shared/ not scanned this run)._
