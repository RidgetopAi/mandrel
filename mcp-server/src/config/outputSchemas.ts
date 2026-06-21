/**
 * Mandrel Tool OUTPUT Schemas (dual-channel output — task 2c412458)
 *
 * THE PROBLEM (markdown-in-values bug class, at the root):
 *   Every tool used to return ONLY a human-readable `content` text blob. Machines
 *   (the Command UI, other agents, downstream automation) had to REGEX-PARSE that
 *   prose to recover ids/names/statuses — fragile, and the source of the
 *   markdown-in-values class (a project name with `**bold**` in the DB leaked its
 *   markup into parsed "data" because the only data channel WAS the marked-up text).
 *
 * THE FIX (MCP spec dual-channel):
 *   A tool result carries BOTH:
 *     • `content`          — a SHORT human-readable summary (a glance), and
 *     • `structuredContent`— a clean JSON object with the RAW field values, which
 *   conforms to an `outputSchema` DECLARED on the tool definition.
 *   Machines read `structuredContent` (raw, never marked-up); humans read `content`.
 *
 * THIS MODULE is the SINGLE SOURCE OF TRUTH for the output side, mirroring exactly
 * how `toolDefinitions.buildInputSchema` is the single source for the input side:
 *   - output shapes are declared ONCE as zod schemas (a handful of SHARED shapes
 *     reused across tools of the same response kind — list/get/mutate/status), and
 *   - `buildOutputSchema(toolName)` converts the tool's zod output schema to the
 *     JSON Schema the MCP `outputSchema` field requires (same zodToJsonSchema path
 *     as the input side), so the two layers can never drift.
 *
 * Adding a tool? Give it an entry in `outputSchemas` below. A contract test
 * (dualChannelOutput.contract.test.ts) FAILS if any tool definition lacks an
 * outputSchema — "all tools, no tool left behind" is enforced, not hoped.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/** JSON Schema shape the MCP SDK accepts for a tool's `outputSchema`. */
export interface JsonObjectSchema {
  type: 'object';
  properties: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED building blocks — reused across many tools so we define a handful of
// shapes, not 29 bespoke ones.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every structuredContent object carries `ok` (the machine-readable success flag)
 * so a consumer never has to infer success from prose. `.passthrough()` is used on
 * the record shapes below so a tool can include extra raw fields without the schema
 * rejecting them (tolerant egress; the REQUIRED keys are the contract).
 */
const ok = z.boolean();

/**
 * TRUST object (Mandrel Core Redesign T2b — THE MOAT). Surfaced DEFAULT-ON on every
 * recalled record so the AI knows whether to rely on it. Shape per spec §4/§8.1:
 *   band      — trusted | ok | unproven | stale | superseded | contradicted
 *   score     — blended 0–1 (null only at cold-start, no outcome evidence yet)
 *   outcome   — { score: 0–1 | null, samples } (the moat sub-signal)
 *   freshness — 0–1 exponential decay by age
 *   superseded/abstain — booleans (abstain = "do not rely on this")
 * `.nullable().optional()` on score so the cold-start `unproven` (null score) validates.
 */
const trustObject = z
  .object({
    band: z.string(),
    score: z.number().nullable(),
    outcome: z
      .object({ score: z.number().nullable(), samples: z.number() })
      .passthrough(),
    freshness: z.number(),
    superseded: z.boolean(),
    abstain: z.boolean(),
  })
  .passthrough();

/** A single context record (raw values — NEVER marked-up). */
const contextRecord = z
  .object({
    id: z.string(),
    contextType: z.string(),
    content: z.string(),
    tags: z.array(z.string()),
    relevanceScore: z.number().optional(),
    similarity: z.number().optional(),
    relevance: z.number().optional(),
    projectId: z.string().nullable().optional(),
    sessionId: z.string().nullable().optional(),
    metadata: z.record(z.any()).optional(),
    createdAt: z.string().optional(),
    // TRUST (T2b) — default-on on recall rows (context_search / context_get_recent).
    trust: trustObject.optional(),
  })
  .passthrough();

/** A single decision record (raw values). */
const decisionRecord = z
  .object({
    id: z.string(),
    title: z.string(),
    decisionType: z.string().optional(),
    impactLevel: z.string().optional(),
    status: z.string().optional(),
    rationale: z.string().optional(),
    outcomeStatus: z.string().nullable().optional(),
    lessonsLearned: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
    // TRUST (T2b) — default-on on decision_search result rows.
    trust: trustObject.optional(),
  })
  .passthrough();

/** A single task record (raw values). */
const taskRecord = z
  .object({
    id: z.string(),
    title: z.string(),
    type: z.string().optional(),
    status: z.string().optional(),
    priority: z.string().optional(),
    assignedTo: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
    progress: z.number().nullable().optional(),
    createdAt: z.string().optional(),
  })
  .passthrough();

/** A single project record (raw values). */
const projectRecord = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    status: z.string().optional(),
    contextCount: z.number().optional(),
    isActive: z.boolean().optional(),
    gitRepoUrl: z.string().nullable().optional(),
    rootDirectory: z.string().nullable().optional(),
    metadata: z.record(z.any()).optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

/**
 * A single typed-edge result item (T2a) — the connected node hydrated for traversal.
 * Raw values; the consumer (T2b trust / T3 recall_thread) reads this, never SQL.
 */
const edgeRecord = z
  .object({
    edgeType: z.string(),
    direction: z.string(),
    connectedId: z.string(),
    connectedType: z.string(),
    connectedTitle: z.string().nullable().optional(),
    edgeId: z.string(),
    metadata: z.record(z.any()).optional(),
  })
  .passthrough();

/** A single smart-search / recommendation result item. */
const searchResultItem = z
  .object({
    id: z.string().optional(),
    type: z.string().optional(),
    title: z.string().optional(),
    summary: z.string().optional(),
    relevanceScore: z.number().optional(),
    source: z.string().optional(),
    // TRUST (T2b) — default-on on smart_search result rows (context/decision items).
    trust: trustObject.optional(),
  })
  .passthrough();

// ─────────────────────────────────────────────────────────────────────────────
// SHARED SHAPES — list / get / mutate / status / stats
// ─────────────────────────────────────────────────────────────────────────────

/** LIST/SEARCH shape: a typed `results` array + pagination counters. */
const listShape = <T extends z.ZodTypeAny>(item: T) =>
  z
    .object({
      ok,
      results: z.array(item),
      total: z.number(),
      page: z.number().optional(),
      limit: z.number().optional(),
    })
    .passthrough();

/** GET/DETAIL shape: `found` + one optional record. */
const getShape = <T extends z.ZodTypeAny>(recordKey: string, item: T) =>
  z
    .object({ ok, found: z.boolean(), [recordKey]: item.optional() })
    .passthrough();

/** MUTATE shape: the affected record + the action performed. */
const mutateShape = <T extends z.ZodTypeAny>(recordKey: string, item: T) =>
  z
    .object({ ok, action: z.string(), [recordKey]: item.optional() })
    .passthrough();

/** STATUS/STATS shape: free-form raw status payload (always has `ok`). */
const statusShape = z.object({ ok }).passthrough();

// ─────────────────────────────────────────────────────────────────────────────
// THE REGISTRY — every public tool → its zod output schema.
// Tools of the same response kind REUSE the shared shapes above.
// ─────────────────────────────────────────────────────────────────────────────

export const outputZodSchemas = {
  // System & Navigation — status payloads.
  mandrel_ping: statusShape,
  mandrel_status: statusShape,
  mandrel_help: statusShape,
  mandrel_explain: statusShape,
  mandrel_examples: statusShape,

  // Context.
  context_store: mutateShape('context', contextRecord),
  context_search: listShape(contextRecord),
  context_get_recent: listShape(contextRecord),
  // CURATE (T1 item 4): context_update — mutate shape (the edited record).
  context_update: mutateShape('context', contextRecord),
  context_stats: statusShape,
  // Soft-delete / archive (task 7b28bed4) — mutate shape (the archived/restored record).
  context_delete: mutateShape('context', contextRecord),
  context_restore: mutateShape('context', contextRecord),

  // Project.
  project_list: listShape(projectRecord),
  project_create: mutateShape('project', projectRecord),
  project_update: mutateShape('project', projectRecord),
  project_delete: mutateShape('project', projectRecord),
  project_switch: mutateShape('project', projectRecord),
  project_current: getShape('project', projectRecord),
  project_info: getShape('project', projectRecord),

  // Decisions.
  decision_record: mutateShape('decision', decisionRecord),
  decision_search: listShape(decisionRecord),
  decision_get: getShape('decision', decisionRecord),
  decision_update: mutateShape('decision', decisionRecord),
  decision_stats: statusShape,
  // Soft-delete / archive (task 7b28bed4).
  decision_delete: mutateShape('decision', decisionRecord),
  decision_restore: mutateShape('decision', decisionRecord),

  // Tasks.
  task_create: mutateShape('task', taskRecord),
  task_list: listShape(taskRecord),
  task_update: mutateShape('task', taskRecord),
  task_details: getShape('task', taskRecord),
  task_bulk_update: statusShape,
  task_progress_summary: statusShape,
  // Soft-delete / archive (task 7b28bed4).
  task_delete: mutateShape('task', taskRecord),
  task_restore: mutateShape('task', taskRecord),

  // Smart Search & AI.
  smart_search: listShape(searchResultItem),
  get_recommendations: listShape(searchResultItem),
  project_insights: statusShape,

  // Typed-edge graph (T2a). link/unlink are mutate-shaped (the affected edge + action);
  // get_links is list-shaped (the connected edges, both directions).
  link: mutateShape('edge', edgeRecord),
  unlink: mutateShape('edge', edgeRecord),
  get_links: listShape(edgeRecord),
} as const;

export type OutputSchemaToolName = keyof typeof outputZodSchemas;

/**
 * Build the JSON Schema (MCP `outputSchema`) for a tool from its zod output schema.
 * Mirrors toolDefinitions.buildInputSchema EXACTLY (same zodToJsonSchema options),
 * so input and output schemas are produced by one consistent mechanism.
 */
export function buildOutputSchema(toolName: OutputSchemaToolName): JsonObjectSchema {
  const zodSchema = outputZodSchemas[toolName];
  const json = zodToJsonSchema(zodSchema as any, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  }) as any;

  return {
    type: 'object',
    properties: { ...(json.properties ?? {}) },
    required: Array.isArray(json.required) ? json.required : [],
    // Tolerant egress: a tool may emit extra raw fields beyond the required contract.
    additionalProperties: true,
  };
}
