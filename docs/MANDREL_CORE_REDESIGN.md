# Mandrel Core Redesign — *"The story you can trust"*

**Status:** DRAFT for tear-apart (define-to-lock) · **Date:** 2026-06-20 · **Author:** Ridge
**Anchors:** `ref:mandrel-core` (planning `3a86e9e8`), grounded synthesis `cbb0da34`, positioning memo `docs/MANDREL_POSITIONING_MEMO.md`, decisions `2d80b04f` (MCP audit), `aeadf132` (strategic direction), `e2ef5f74` (the learning loop).
**Grounding:** 3 subagents (internal friction / live code audit / frontier teardown) + direct git verification, 2026-06-20.

> This is a product design spec, not a build order. Nothing here is built until it's locked with Brian, tranche-scoped, eval-gated, and Inspector-approved. Customer rollout stays behind the CN1 gate. Bold in vision; disciplined in build.

---

## 0. The one line

**Mandrel is the shared, self-correcting *narrative layer* the human and the AI both run on — memory that tells its own story and gets truer over time.** Not a wiki (static). Not a vector store (recall-only). The interface between intent (human) and execution (AI), where neither side starts cold and the knowledge earns trust through outcomes.

Product = memory. Moat = it *learns*. Daily magic = it *tells the story well*.

---

## 1. Why now — the bet, in one breath

Two facts, discovered by grounding:

1. **The frontier's open seam is exactly our pattern.** Graph *traversal* is commoditizing (Zep/Graphiti, ByteRover). Story-*at-altitude* is barely touched. **Outcome-validated *trust* is wide open — the STALE benchmark shows the entire field scores under 10% at detecting when a memory has gone invalid.** Everyone decays memory by *time/usage*; **nobody scores it by real outcomes.**
2. **We hold the one ingredient nobody can bolt on.** A pure memory layer has no way to know if a memory was *right*. We do: the Foreman→Inspector→deploy→learning-loop pipeline **manufactures ground-truth outcomes**. The loop we shipped tonight already scores our own judgments. Point that signal at the memory and trust becomes computable.

So the moat (`outcome-validated trust + narrative`) and the ergonomics goal (`make the tools fluid for the AI`) are **the same build**. That's the whole thesis of this doc.

And we can be bold now precisely because the safety net exists: gates (CN1–4), checks (CI/Inspector), and the loop catch and correct, so a wrong turn in the model is recoverable.

---

## 2. The six jobs (the lens) + honest scorecard

Every tool, every gap, judged against the six things a memory must do for an AI:

| # | Job | What it means | Status (live, post-v0.5.8/9) |
|---|-----|---------------|------------------------------|
| 1 | **ORIENT** | drop me in: state + next step | ✅ works (`ref:resume`, `context_get_recent`, `task_progress_summary`) |
| 2 | **RECALL** | has this been decided/tried/failed? | ✅ strong (hybrid vector+lexical+recency; decisions now embedded) — **but the recall path dumps full content ×N** |
| 3 | **TRAVERSE** | walk the thread: decision→context→task→outcome→lesson→rule | ❌ **zero** — no tool walks it; linking is string tags walked by hand and **unrepairable** |
| 4 | **TRUST** | is this still true? validated? stale? | 🟡 partial — decisions-only, opt-in (`includeOutcome`); `smart_search` outcome-blind; **no freshness signal anywhere** |
| 5 | **WRITE** | record new state, no friction/dupes | ✅ good (schema-drift class closed: zod single-source, strict, structuredContent) |
| 6 | **CURATE** | edit, re-tag, supersede, retire | 🟡 half — archive/restore ✅; **edit/re-tag/`context_update` ❌**; metadata *replaces* wholesale (silent data-loss footgun) |

**Already shipped (build on, don't redo):** honest schemas (zod single-source + strict + structuredContent dual-channel, all 30 tools), soft-delete/archive + restore, short-id (`id8`) acceptance, decision learning-loop read path (`outcomeStatus` filter + `includeOutcome`). *36 tools exposed.*

**Verdict:** store-and-recall is won. **The frontier is `TRAVERSE + TRUST + CURATE` — which is precisely "return the best context, tell the best story, with linking."**

---

## 3. The driving insight — make the AI's natural pattern a first-call operation

Asked to introspect, here is the pattern I (Ridge) default to *every time* I get context:

```
ORIENT  →  TRAVERSE THE THREAD  →  at the right ALTITUDE  →  judging TRUST
(state +    (pull the connected      (headline first,         (current? did it
 next step)  story from a ref/id)     drill where needed)      pan out? superseded?)
```

Today only ORIENT is a clean operation. The rest is **hand-assembly**: I read a record, eyeball its `task:<id8>` tag, fire a *separate* search, repeat — and I get **no signal whether what I'm reading is still true.**

The single operation that *is* my whole pattern, and doesn't exist:

> **`recall_thread` — "read me in on the story of X, at altitude Y, and tell me what to trust."**

**Evidence it's the right target:** tonight I got **stale-burned twice** (a stale audit `2d80b04f`, then a stale "not-deployed" belief) and only caught both by re-deriving against live code. That is not a me-problem — **it is the product's missing TRUST feature happening to its first user.** Fix it for me, fix it for every agent.

---

## 4. The redesign — five capabilities

Each turns part of the pattern into a first-call operation. Ordered foundation→headline.

### Capability 1 — First-class typed edges (the graph)
Replace string-tag threading (unrepairable, typo-fragile, ANY-overlap) with a real, bidirectional, repairable edge store.

**Data model (additive — new table, nothing existing breaks):**
```sql
links (
  id, from_id, from_type, to_id, to_type,
  edge_type,            -- enum (below)
  created_at, created_by, metadata jsonb,
  UNIQUE(from_id, to_id, edge_type)
)
-- indexes on (from_id, edge_type) and (to_id, edge_type) for both-direction walk
```
**Edge types (v1):** `decided_by` · `caused` · `built_by` · `supersedes` (reverse `superseded_by`) · `learned_from` · `proposed_by` · `informs` (record→task) · `produced_outcome` (task→outcome).

**Why:** tags-as-strings can't enforce referential integrity, can't reverse-lookup, can't be repaired. Edges can. Tags **stay** — but demoted to what they're good at: *labels / lens* (`scope:`, `owner:`, `ref:`). **Edges carry structure; tags carry labels.** (Open Q 9.1.)

### Capability 2 — `recall_thread` (the traversal-narrative tool) — THE HEADLINE
One call returns the connected subgraph **rendered as a story at the chosen altitude**, every node carrying its trust inline. Consolidated per Anthropic guidance ("don't proliferate; one high-value call, not a traverse-then-fetch dance").

**Contract:**
```
recall_thread({
  anchor:    ref | id,                         // "ref:gap1", a decision/context/task id (id8 ok)
  altitude:  "headline" | "summary" | "full",  // zoom: 1-liner → digest → full chain
  edgeTypes?: [...],                            // restrict the walk (default: all)
  depth?:    number,                            // default sensible (e.g. 3)
  minTrust?: band                              // optionally hide low-trust nodes
})
→ {
  narrative: "<prose story at altitude, causal/temporal order>",  // model-readable text
  nodes: [{ id, type, title, trust:{band, score, outcome, freshness, superseded} }],  // structuredContent
  edges: [{ from, to, type }],
  abstain: [ ...ids the AI should NOT rely on... ]
}
```
**Engine:** the narrative is synthesized by the **same LLM-judge primitive we built tonight** in the Evaluator (read records → render synthesized text) — pointed at storytelling instead of scoring. We already own this.

**This single tool delivers "best context + best story" AND closes the loop→operator gap (#5):** boot-time "read me in" = `recall_thread(ref:resume, summary)`, and the loop's corrected knowledge rides the same edges back to me.

### Capability 3 — Trust as a computed, default-on property (THE MOAT)
Every recalled record carries a trust signal, ranked by **demonstrated reliability**, not age.

**How trust is computed (concrete — the part to pressure-test):**
- **Outcome signal** *(the moat)* — via `informs`/`produced_outcome` edges, a record inherits the outcomes of the tasks/judgments it informed. The loop already scores judgments (`outcome_status`); propagate that along edges: a record whose downstream work *succeeded* earns trust; one whose downstream *failed/reverted* loses it.
- **Freshness** — recency + "has the subject changed since" (a newer record on the same subject lowers confidence).
- **Supersession** — a `superseded_by` edge → demote + flag (not hide).
- **Contradiction** — a live record asserting the opposite → flag for curation.

**Surfaced as a band** (`trusted` / `unproven` / `stale` / `superseded` / `contradicted`) + an **`abstain`** signal when low. **Default-on in every recall** (not opt-in), ranked by trust. This is the direct fix for the stale-burn and the STALE-benchmark failure the whole field shares.

### Capability 4 — Curation made real
Close the CURATE half-gap so the story stays *true*.
- `context_update` (does not exist today) — edit content, **re-tag**, re-thread.
- Extend `task_update` / `decision_update` to edit tags / title / description.
- **`metadata` MERGE, not replace** (kills the silent-data-loss footgun).
- **Self-curating background pass** — the Corrector pattern aimed at the *archive*: detect stale / contradicted / superseded records, **propose** merges/retirements as a Blocked task + Telegram → **Brian gates** (same authority model as the GAP1 Corrector). The memory cleans itself, behind your gate.

### Capability 5 — Altitude / payload control
- `response_format: concise | detailed` on read tools (Anthropic pattern; ~2/3 token cut) — maps directly to `recall_thread` altitude.
- **Fix the bug:** `context_search` / `context_get_recent` truncate full content with a "zoom to read full" affordance (today they dump full bodies ×N on the heaviest path).

**Cheap wins folded in (T1):** `context_search.id` accept `id8` (kill the asymmetry); surface `metadata` back-links in search results (today written+indexed but never returned); `smart_search` carry `outcome`/trust.

---

## 5. Sequencing — tranches (additive, eval-gated, each shippable)

> **Build status (2026-06-21) — REDESIGN COMPLETE on our prod (v0.5.13); customers held at v0.5.9 for Brian's CN1 rollout gate:**
> - T1 ✅ fluidity (v0.5.10) · T2a ✅ graph (v0.5.11, 197 edges) · T2b ✅ **trust/the moat** (v0.5.12) · T3 ✅ **recall_thread** (v0.5.13) · T4 ✅ self-curation (runtime, propose-only) — each Foreman-built, Inspector-gated, deployed to our prod, dogfooded live.
> - **Design refinement (locked):** `recall_thread` (Cap 2) is DETERMINISTIC — no server-side LLM (Mandrel is a product in customer containers; the consuming agent narrates). Server-side synthesis = possible premium tranche later.
> - Trust v1 config + all tear-apart resolutions locked in §8.1.
> - Caught + fixed by dogfooding: notify HTML-escape bug (`78ab0c4`); this doc was untracked under `docs/*` gitignore (now tracked, Lesson 012). Filed follow-ups: notify silent-mode footgun, proposer idempotency, metadataMerge param-bind, user-facing docs.

| Tranche | Contents | Risk | Gate |
|---------|----------|------|------|
| **T1 — Fluidity wins** | content-dump fix + altitude/`response_format`; `id8` symmetry; surface metadata; `context_update` + re-tag; metadata-merge | low (additive) | tool-use eval ≥ baseline; no LongMemEval regression |
| **T2 — Graph + trust foundation** | `links` table + edge writes; trust computation from loop outcomes; trust surfaced default-on in existing recall | medium | new edges covered by contract tests; trust correctness eval |
| **T3 — `recall_thread` (headline)** | the traversal-narrative tool (LLM-judge engine); boot "read me in" | medium | **NEW story/traverse eval** (below) |
| **T4 — Self-curation** | Corrector-on-archive: stale/contradiction/supersession detection → propose → Brian gate | medium | propose-only verified (like GAP1 Corrector); gate enforced |

Each tranche is independently shippable and reversible. Customer rollout per tranche stays behind the CN1 deploy gate.

---

## 6. Testing as armor (non-negotiable — built for hostile hole-poking)

We are exposing ourselves; the tests are what eliminate the "poke holes" concern.
- **The eval triad, every retrieval-affecting change:** (1) **LongMemEval** (recall@k/QA — must not regress, Mandrel is Arm B); (2) **tool-use eval** (first-call-valid / turns / wrong-success); (3) **NEW story/traverse eval** — *"can an agent get the story of X / resume a thread / judge trust in ONE correct call?"*
- **Boundary + contract tests** on every new tool (the pattern that's already locking schema drift), plus **adversarial tests** written to *break* it (malformed input, stale edges, contradiction cycles, trust-gaming).
- **Bring `runtime/learning-loop/` under lint + CI** (it's `tsc`+tested but not yet lint-gated) — close the gap I flagged.
- "Honest green" only — never a faked pass (the Evaluator already enforces no-fake-green on itself).

---

## 7. Discipline / non-negotiables
- **Additive** — new tables/tools; nothing existing breaks; reversible.
- **Zero-SQL public contract preserved** — the loop + agents read/write through tools only (no-cheating); **no malformed SQL, ever.**
- **Eval-gated** — improve-don't-regress; lenient inputs, strict+honest outputs, fully-declared schemas. Not "loosen Mandrel."
- **Single-purpose, but consolidate where it helps the AI** — `recall_thread` is one call by design; we do not add megatools with action-enums.
- **CN1 gate** on every customer rollout; build/dev is free.

---

## 8. Open questions for Brian (the tear-apart targets)
1. **Edges vs tags:** edges carry structure, tags become labels/lens — agree? Or fully migrate tags→edges? (I lean coexist.)
2. **Trust formula:** is "inherit downstream outcomes via edges" the right core signal? How much weight to freshness vs outcome? What's the `abstain` threshold?
3. **Edge creation friction:** edges must be near-free to create (auto-thread on write where possible) or they won't get made — how automatic vs explicit?
4. **Self-curation aggressiveness:** how eager should the background pass be at proposing retirements? (Cost of a wrong retirement vs a stale record surviving.)
5. **#1 banked — workflow-as-Mandrel-dependency:** does "deploy.md / workflow instructions live *in* the graph as trusted, traversable rules" fold into this model (rules are just trusted nodes with `learned_from` edges)? I think yes — this graph is the home for it.
6. **What we call it / how we say it** — the product story for "self-correcting narrative memory."

---

## 8.1 Resolutions — tear-apart with Brian (2026-06-20)
- **Q1 LOCKED — edges vs tags:** coexist. **Edges carry structure; tags are the human-viewable lens/label path** (`scope:`/`owner:`/`ref:`). Not a full migration.
- **Q5 LOCKED — workflow-as-graph (#1 banked idea):** workflow/deploy instructions become **trusted, traversable nodes in the graph** (rules as nodes with `learned_from` edges). The graph is the home for "Mandrel as the dependency for everything." A learned, applied rule (e.g. R1 `bb4699fc`) lives here as a trusted node, which is also how it reaches the operator on boot (closes the loop→operator gap #5).
- **Q3 RESOLVED — edge-creation friction:** edges must be **near-free, minted automatically at write-time** from signals the writer already gives (the `task:<id8>` habit upgrades to also mint a typed edge; `decision_record` citing evidence ids mints `learned_from`). Explicit `link()` only for what can't be inferred. Rationale: the graph is only as good as its edges; manual edges go sparse (audit: tag hygiene consistent on only 6/19 records). Auto-at-write is the default path.
- **Q4 RESOLVED — self-curation aggressiveness:** **start conservative, ratchet by evidence** (same as the GAP1 Corrector). The background pass *flags* ambiguous cases and only *proposes hard retirement* on high-confidence mechanical cases (clean supersession chains, exact contradictions). High confidence threshold to start; loosen as it earns trust. Reversible (soft-delete) + Brian-gated. **Aggressiveness is config (see §4.3 / no-hardcoded-vars principle).**
- **Q2 STARTING POINT SET (Ridge) + STANDING PRINCIPLE — no hardcoded variables:** tunables live in organized, named config, not literals in code (Brian, standing rule for this and all future builds). The trust model is fully config-driven:

### Trust model v1 (the §4 Capability 3 detail, config-driven)
A record's trust = blend of signals → 0–1 score → band.
- **Outcome** *(moat signal)* — loop-scored success rate of the work this record `informs`. Lifts on success, sinks on failure/revert.
- **Freshness** — decays with age; drops if a newer record on the same subject exists.
- **Supersession / Contradiction** — **overrides (caps), not blends** — demote + flag regardless of the rest.
- **Bands:** `trusted` · `unproven` · `stale` · `superseded` · `contradicted`, plus an **`abstain`** flag.

**Config (starting values — ALL tunable, no magic numbers in code):**
```
weight_outcome      = 0.6     # outcome dominates — it's the moat
weight_freshness    = 0.4
freshness_halflife  = 30d
trusted_at          >= 0.66
stale_below         <  0.40
abstain_when        = score < 0.40  OR superseded  OR contradicted
min_outcome_samples = 1       # downstream evidence needed before outcome counts
```
**Cold-start (the honesty nuance):** on day one almost nothing has outcome edges yet → default band is **`unproven`, NOT distrusted** ("no outcome signal yet, lean on freshness, and say so"). Trust *grows into* the graph as the loop runs. Never distrust everything for lack of accrued evidence.

---

## 9. What this makes Mandrel
The answer to *"what are we":* **the only memory that doesn't just remember — it tells you the story, and tells you which parts to trust, because it watched what actually happened.** Storage is the floor; the loop-scored, narrated graph is the moat. The thing the company runs on, and the thing a paying user can't get anywhere else.
