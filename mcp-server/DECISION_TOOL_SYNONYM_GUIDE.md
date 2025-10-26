# Decision Tool Synonym Guide

Quick reference for AI-friendly parameter names in AIDIS decision tools.

---

## `decision_record` - Synonyms Supported

### rationale (canonical)
**Synonyms**: `reasoning`, `reason`, `why`

```typescript
// All of these work:
decision_record({ rationale: "Because..." })      // ✅ Canonical
decision_record({ reasoning: "Because..." })      // ✅ Synonym
decision_record({ reason: "Because..." })         // ✅ Synonym
decision_record({ why: "Because..." })            // ✅ Synonym
```

### impactLevel (canonical)
**Synonyms**: `impact`, `severity`, `priority`
**Values**: `low`, `medium`, `high`, `critical`

```typescript
// All of these work:
decision_record({ impactLevel: "high" })          // ✅ Canonical
decision_record({ impact: "high" })               // ✅ Synonym
decision_record({ severity: "high" })             // ✅ Synonym
decision_record({ priority: "high" })             // ✅ Synonym
```

### alternativesConsidered (canonical)
**Synonyms**: `options`, `alternatives`, `choices`
**Format**: Array of strings OR objects with `{name, reasonRejected}`

```typescript
// All of these work:
decision_record({
  alternativesConsidered: [
    { name: "React", reasonRejected: "Too complex" },
    { name: "Vue", reasonRejected: "Less ecosystem" }
  ]
})  // ✅ Canonical format

decision_record({
  options: ["React", "Vue", "Angular"]
})  // ✅ Synonym - auto-converts to canonical format

decision_record({
  alternatives: [
    { name: "React", reasonRejected: "Too complex" }
  ]
})  // ✅ Synonym - passes through

decision_record({
  choices: ["React", "Vue"]
})  // ✅ Synonym - auto-converts
```

---

## `decision_search` - Synonyms Supported

### decisionType (canonical)
**Synonym**: `type`
**Values**: `architecture`, `library`, `framework`, `pattern`, `api_design`, `database`, `deployment`, `security`, `performance`, `ui_ux`, `testing`, `tooling`, `process`, `naming_convention`, `code_style`

```typescript
// Both work:
decision_search({ decisionType: "architecture" })  // ✅ Canonical
decision_search({ type: "architecture" })          // ✅ Synonym
```

### impactLevel (canonical)
**Synonyms**: `impact`, `severity`
**Values**: `low`, `medium`, `high`, `critical`

```typescript
// All of these work:
decision_search({ impactLevel: "critical" })       // ✅ Canonical
decision_search({ impact: "critical" })            // ✅ Synonym
decision_search({ severity: "critical" })          // ✅ Synonym
```

---

## `decision_search` - Flexible Filtering

### Query is now OPTIONAL!

You can search with:
- Query alone (semantic search)
- Query + filters (refined search)
- Filters only (structured search)

```typescript
// ✅ Query alone (original behavior)
decision_search({ query: "performance issues" })

// ✅ Query + filters (refined search)
decision_search({
  query: "database decisions",
  decisionType: "database",
  impactLevel: "high"
})

// ✅ Filters only (NEW - no query required!)
decision_search({
  decisionType: "architecture",
  status: "active",
  impactLevel: "critical"
})

// ✅ Single filter
decision_search({ impactLevel: "high" })

// ✅ All filters
decision_search({
  decisionType: "library",
  status: "active",
  impactLevel: "high",
  component: "auth-service",
  tags: ["security", "authentication"],
  projectId: "project-uuid",
  includeOutcome: true
})
```

---

## Complete Parameter Lists

### `decision_record` - All Parameters

**Required**:
- `decisionType` (or `type` via decision_search synonym)
- `title`
- `description`
- `rationale` (or `reasoning`, `reason`, `why`)
- `impactLevel` (or `impact`, `severity`, `priority`)

**Optional**:
- `alternativesConsidered` (or `options`, `alternatives`, `choices`)
- `problemStatement`
- `affectedComponents`
- `tags`
- `projectId`
- `metadata`

### `decision_search` - All Parameters

**All Optional** (at least one recommended):
- `query` (semantic search text)
- `limit` (default: 10)
- `decisionType` (or `type`)
- `status` (active, deprecated, superseded, under_review)
- `impactLevel` (or `impact`, `severity`)
- `component`
- `tags`
- `projectId`
- `includeOutcome`

---

## Examples

### Recording a Decision (AI-friendly)
```typescript
decision_record({
  decisionType: 'library',
  title: 'Choose state management library',
  description: 'Need centralized state for React app',
  reasoning: 'Redux has great DevTools and middleware',  // ✅ Synonym
  impact: 'high',                                        // ✅ Synonym
  options: ['Redux', 'Zustand', 'Jotai'],               // ✅ Synonym
  tags: ['react', 'state-management']
})
```

### Searching Decisions (filter-based)
```typescript
// Find all critical architecture decisions
decision_search({
  type: 'architecture',      // ✅ Synonym
  impact: 'critical'         // ✅ Synonym
})

// Find active library decisions with high impact
decision_search({
  decisionType: 'library',   // ✅ Canonical
  status: 'active',
  impactLevel: 'high'        // ✅ Canonical
})
```

---

## Implementation Details

**Location**: `/home/ridgetop/aidis/mcp-server/src/middleware/validation.ts`

**Function**: `normalizeDecisionSynonyms(toolName, args)`

**Behavior**:
1. Runs BEFORE Zod validation
2. Converts synonyms to canonical parameter names
3. Cleans up synonym properties from args
4. Preserves canonical parameters if both present

**Priority**: Canonical parameters take precedence over synonyms
```typescript
// If both present, canonical wins
decision_record({
  rationale: "Canonical value",
  reasoning: "Synonym value"
})
// Result: rationale = "Canonical value" (reasoning ignored)
```

---

## Testing

Run validation tests:
```bash
npx tsx test-decision-synonyms.ts
```

Expected output: **6/6 tests passing** ✅

---

**Last Updated**: 2025-10-14
**Status**: Production-ready
