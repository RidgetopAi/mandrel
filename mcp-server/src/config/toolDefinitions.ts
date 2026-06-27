/**
 * AIDIS Tool Definitions
 *
 * Shared module containing all 41 AIDIS MCP tool definitions.
 * (8 session analytics tools migrated to REST API on 2025-10-05)
 * This module serves as the single source of truth for tool schemas
 * used by both the main MCP server and the HTTP bridge.
 *
 * Last Updated: 2025-10-05
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import { validationSchemas } from '../middleware/validation.js';
import {
  buildOutputSchema,
  outputZodSchemas,
  type OutputSchemaToolName,
  type JsonObjectSchema,
} from './outputSchemas.js';

/**
 * Tool Definition Interface
 * Matches the MCP SDK Tool type structure
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
    additionalProperties?: boolean;
  };
  /**
   * MCP dual-channel OUTPUT contract (task 2c412458). The JSON Schema that a tool's
   * `structuredContent` conforms to. Attached table-driven (mirroring inputSchema)
   * from config/outputSchemas.ts — see attachOutputSchemas() below. Every tool gets
   * one; a contract test fails if any is missing.
   */
  outputSchema?: JsonObjectSchema;
}

/**
 * CLASS FIX (schema-drift keystone): generate the model-facing JSON inputSchema
 * DIRECTLY from the zod schema that actually gates the request in
 * middleware/validation.ts. The model can no longer be shown params the validator
 * silently drops (zod uses .parse(), not .strict(), so undeclared/divergent params
 * vanish without error). One source of truth → the two layers cannot diverge again.
 *
 * `humanDescriptions` lets us keep the friendly per-param help text (zod schemas
 * don't carry it). It is OVERLAY ONLY — it can never add/rename a param that zod
 * doesn't define, so it cannot reintroduce drift. A schema-match test asserts the
 * derived `properties` keyset == the zod keyset for every retrieval tool.
 */
function buildInputSchema(
  toolName: keyof typeof validationSchemas,
  humanDescriptions: Record<string, string> = {}
): ToolDefinition['inputSchema'] {
  const zodSchema = validationSchemas[toolName];
  // $refStrategy:'none' flattens .refine()/nested shapes to a plain object schema
  // with top-level `properties` (verified for the refined context_search schema).
  const json = zodToJsonSchema(zodSchema as any, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  }) as any;

  const properties: Record<string, any> = { ...(json.properties ?? {}) };

  // Overlay human-friendly descriptions onto params zod already defines.
  for (const [key, desc] of Object.entries(humanDescriptions)) {
    if (properties[key]) {
      properties[key] = { ...properties[key], description: desc };
    }
  }

  return {
    type: 'object',
    properties,
    required: Array.isArray(json.required) ? json.required : [],
    // STRICT MODE (task 5fd58eef): emit additionalProperties:false so the model gets an
    // EXACT contract — exactly the params the zod validator declares, no more. This is
    // safe because it's derived at the SOURCE from the same zod schema that gates the
    // request, and the validator now ALSO rejects undeclared keys (validation.ts
    // strict-key check), so advertised == accepted. zodToJsonSchema already emits
    // additionalProperties:false for a plain zod object; we make the contract explicit
    // here rather than relying on it (and to cover the refined/$ref-flattened shapes).
    // SYNONYM SAFETY: decision tools accept AI-friendly synonyms (reasoning→rationale,
    // etc.); those are normalized to the canonical param BEFORE strict validation runs
    // (normalizeDecisionSynonyms in validation.ts), so strict mode never rejects a real
    // synonym call — the model is simply shown the canonical names.
    additionalProperties: false,
  };
}

/**
 * Complete array of all AIDIS/Mandrel tool definitions
 * Changes:
 * - 8 session analytics tools migrated to REST API (2025-10-05)
 * - 2 pattern detection tools removed (2025-10-24) - deprecated stub implementations
 * - 5 session MCP tools removed (2025-10-24) - auto-tracking replaces manual management
 * - 4 naming registry tools removed (2025-10-24) - replaced by dependency tracking
 */
export const AIDIS_TOOL_DEFINITIONS: ToolDefinition[] = [
          {
            name: 'mandrel_ping',
            description: 'Test connectivity to Mandrel server',
            // STRICT-MODE (task 5fd58eef): derive from zod so the schema is strict AND
            // surfaces the real `message` param the validator accepts (was hidden by a
            // hand-written empty `{}` — a drift the table-driven source now closes).
            inputSchema: buildInputSchema('mandrel_ping', {
              message: 'Optional message echoed back by the server (connectivity check)'
            }),
          },
          {
            name: 'mandrel_status',
            description: 'Get Mandrel server status and health information',
            inputSchema: buildInputSchema('mandrel_status'),
          },
          {
            name: 'mandrel_help',
            description: 'Display categorized list of all Mandrel tools',
            inputSchema: buildInputSchema('mandrel_help'),
          },
          {
            name: 'mandrel_explain',
            description: 'Get detailed help for a specific Mandrel tool',
            inputSchema: buildInputSchema('mandrel_explain', {
              toolName: 'Name of the tool to explain (e.g., "context_search", "project_list")'
            }),
          },
          {
            name: 'mandrel_examples',
            description: 'Get usage examples and patterns for a specific Mandrel tool',
            inputSchema: buildInputSchema('mandrel_examples', {
              toolName: 'Name of the tool to get examples for (e.g., "context_search", "project_create")'
            }),
          },
          // Session Lifecycle (session-rework SR-2, task af51c035) — explicit
          // user-controlled start/stop of the connection's work session. Re-introduces the
          // lifecycle the old "Phase 6" removed; thin orchestration over the SR-1
          // per-connection model (one active session per connection).
          {
            name: 'session_start',
            description: 'Start a NEW work session for this connection. Finalizes the connection\'s current active session first (full productivity/analytics flush), then opens a fresh one. Optional title, goal, and project are stamped onto the session (the goal populates the Session View "Session Goal" field). Enforces one active session per connection.',
            inputSchema: buildInputSchema('session_start', {
              title: 'Optional short title for the new session',
              goal: 'Optional session goal (≤1000 chars) — populates the Session View "Session Goal" field',
              project: 'Optional project name (or id) to attach the session to; defaults to the connection\'s current project'
            }),
          },
          {
            name: 'session_end',
            description: 'End (finalize) this connection\'s current active session — runs the full close path (file sync, productivity, token/activity flush, analytics). Safe no-op if no session is active. The next content-producing action auto-starts a fresh session.',
            inputSchema: buildInputSchema('session_end'),
          },
          {
            name: 'session_status',
            description: 'Show this connection\'s current active session (read-only): id, title, goal, project, counts, and duration. Returns a clean "no active session" state if none exists yet.',
            inputSchema: buildInputSchema('session_status'),
          },
          {
            // SCHEMA-DRIFT CLASS FIX (tool-native linking, task 49ad7b4d): context_store
            // previously HARD-CODED its inputSchema to only content/type/tags, hiding
            // `metadata` (+ relevanceScore/projectId/sessionId) even though the zod
            // validator (contextSchemas.store) accepts them and the handler persists
            // them to contexts.metadata. So a context could carry structured back-links
            // ONLY via tags, never via the metadata jsonb column — the missing keystone
            // of tool-native record linking. Now DERIVED from the zod schema (same
            // class fix as context_search/task_create), so the model sees exactly the
            // fields the validator accepts and the layers can't drift again.
            name: 'context_store',
            description: 'Store development context with automatic embedding generation for semantic search',
            inputSchema: buildInputSchema('context_store', {
              content: 'The context content to store',
              type: 'Context type: code, decision, error, discussion, planning, completion, milestone, reflections, handoff, lessons',
              tags: 'Optional tags for categorization, filtering, and RECORD LINKING. Threading tags wire this context into the linked story: `task:<id8>` (belongs to a task thread), `decision:<id8>` (ladders to a decision), `context:<uuid>`, plus lens axes `scope:company|product` / `owner:engineering|product|marketing|rnd|accounting` / `tranche:safe|measured`. A `ref:<slug>` tag (`ref:[a-z0-9-]+`) is a memorable named pointer resolvable via context_search({tags:["ref:<slug>"]}). Malformed ref/threading tags are normalized on write and reported, never rejected.',
              relevanceScore: 'Optional importance score 0–10 (default 5) feeding the hierarchical-memory ranking',
              metadata: 'Optional structured metadata (jsonb object) stored on the context. The tool-native way to carry STRUCTURED back-links, e.g. {"parent_task":"<uuid>","parent_decision":"<uuid>","origin_context":"<uuid>"} — round-trips and is retrievable via context_search.',
              links: 'Optional array of typed edges to mint FROM this context to other records (first-class linking). Each item is EITHER explicit {"edgeType":"<one of the edge-type vocab>","to":"<id8|uuid>","toType":"task|decision|context"} OR shorthand {"task":"<ref>"} | {"decision":"<ref>"} | {"context":"<ref>"} (→ informs / decided_by / learned_from). Refs accept an id8 or full UUID, resolved in the current project. A bad/unresolvable link is reported as a warning (link notes) but NEVER blocks the store — the context + the good links still save.',
              noAutoThread: 'Optional. When true, SKIP the automatic active-thread edges for THIS store (the session has an active thread via thread_set, but this capture should not thread onto it). Auto-threading is also skipped automatically whenever you pass an explicit `links` arg.',
              projectId: 'Project ID or name to store under (defaults to current project)',
              sessionId: 'Session ID to attribute this context to (defaults to the active session)'
            }),
          },
          {
            name: 'context_search',
            description: 'Search stored contexts using semantic similarity and filters, or fetch a specific context by ID. Provide at least one of: id, query, or a non-empty tags array (a tags-only call filters by tags).',
            inputSchema: buildInputSchema('context_search', {
              id: 'Context UUID or 8+-hex short id for direct lookup (bypasses semantic search; returns full content)',
              query: 'Search query using semantic similarity (optional if id or tags provided)',
              type: 'Filter by context type (code, decision, error, discussion, planning, completion, milestone, reflections, handoff, lessons)',
              tags: 'Filter by tags (e.g., ["ref:cp-gaps"]); a non-empty tags array enables a tags-only search with no query',
              limit: 'Maximum number of results to return (default 10)',
              minSimilarity: 'Minimum similarity threshold (0-100) to include a result',
              offset: 'Number of leading results to skip (pagination)',
              response_format: 'Payload size: "concise" (DEFAULT — truncates each content with a "fetch full" affordance, keeps recall lean) or "detailed" (full content). Fetch one full record via context_search id:<id>.',
              projectId: 'Project ID or name to scope the search (defaults to current project)',
              sessionId: 'Session ID to scope the search'
            }),
          },
          {
            name: 'context_get_recent',
            description: 'Get recent contexts in chronological order (newest first)',
            inputSchema: buildInputSchema('context_get_recent', {
              limit: 'Maximum number of recent contexts to return (default 5, max 20)',
              response_format: 'Payload size: "concise" (DEFAULT — truncates each content with a "fetch full" affordance) or "detailed" (full content). The boot/recall path defaults to concise to stay lean.',
              projectId: 'Project ID or name to scope the results (defaults to current project)'
            }),
          },
          {
            // CURATE (T1 item 4 — redesign §4 Capability 4): context_update. Contexts were
            // immutable after write; this makes the linking grammar REPAIRABLE — edit
            // content, re-tag/re-thread, fix a metadata back-link, or adjust the score.
            // DERIVED from the zod validator like every other tool. metadata is MERGED
            // (null deletes a key), never a wholesale replace (T1 item 6).
            name: 'context_update',
            description: 'Edit a stored context (content, tags/re-thread, metadata, relevanceScore). Provide at least one field. metadata is MERGED over the existing object (set a key to null to delete it) — it is NOT replaced wholesale. Accepts a full UUID or short id; project-scoped.',
            inputSchema: buildInputSchema('context_update', {
              contextId: 'Context UUID or 8+-hex short id to edit (project-scoped)',
              content: 'New full content (replaces the stored content; re-embeds for search)',
              tags: 'New tag set (REPLACES tags) — re-tag/re-thread, e.g. ["task:9e25dac7","scope:product"]. Malformed threading/ref tags are normalized + reported, never rejected.',
              metadata: 'Structured metadata to MERGE over the existing object (shallow). Set a key to null to DELETE just that key; omitted keys are preserved (no silent data loss).',
              relevanceScore: 'New importance score 0–10',
              projectId: 'Project ID or name to scope the lookup (defaults to current project)'
            }),
          },
          {
            name: 'context_stats',
            description: 'Get context statistics for a project',
            inputSchema: buildInputSchema('context_stats', {
              projectId: 'Project ID or name to scope the stats (defaults to current project)'
            }),
          },
          {
            // SOFT-DELETE / ARCHIVE (task 7b28bed4): reversible cleanup through the public
            // tools (no raw SQL). Archives the row (sets archived_at) so it disappears from
            // default context_search/context_get_recent while STILL existing — undo with
            // context_restore. Accepts a full UUID or 8+-hex short id (task 131ef054).
            name: 'context_delete',
            description: 'Soft-delete (archive) a context — hides it from default search/recent but does NOT permanently delete it (reversible via context_restore). Accepts a full UUID or short id; project-scoped.',
            inputSchema: buildInputSchema('context_delete', {
              contextId: 'Context UUID or 8+-hex short id to archive (project-scoped)',
              projectId: 'Project ID or name to scope the lookup (defaults to current project)'
            }),
          },
          {
            name: 'context_restore',
            description: 'Restore (un-archive) a previously soft-deleted context so it appears in default search/recent again. Accepts a full UUID or short id; project-scoped.',
            inputSchema: buildInputSchema('context_restore', {
              contextId: 'Context UUID or 8+-hex short id to restore (project-scoped)',
              projectId: 'Project ID or name to scope the lookup (defaults to current project)'
            }),
          },
          {
            name: 'project_list',
            description: 'List all available projects with statistics',
            // STRICT-MODE: derive from zod — surfaces the real `includeStats` param the
            // validator accepts (was hidden by a hand-written empty `{}`).
            inputSchema: buildInputSchema('project_list', {
              includeStats: 'Include per-project statistics in the result (accepts true/false)',
              limit: 'Max projects to return per page (default 20, max 100). Truncation is reported as "showing N of M".',
              offset: 'Number of projects to skip for pagination (default 0). Page with limit+offset.'
            }),
          },
          {
            // A8: DERIVE from the zod validator (projectSchemas.create) so the
            // model-facing schema can't hide an accepted param. The hand-written
            // schema omitted `metadata` even though the validator accepts it and the
            // handler persists it to projects.metadata — the same boundary-drift class
            // already fixed for context_store/task_create. Now `metadata` is visible.
            name: 'project_create',
            description: 'Create a new project',
            inputSchema: buildInputSchema('project_create', {
              name: 'Unique project name',
              description: 'Optional human-readable description of the project',
              status: 'Optional initial status — one of: active, archived, completed, paused (default: active)',
              gitRepoUrl: 'Optional git repository URL',
              rootDirectory: 'Optional root directory path',
              metadata: 'Optional structured metadata (jsonb object) persisted on the project'
            }),
          },
          {
            // A8: DERIVE from zod (projectSchemas.update) — surfaces `metadata`, which
            // the handler already persists but the hand-written schema hid.
            name: 'project_update',
            description: 'Update an existing project (name, description, status, and/or metadata) identified by id or name',
            inputSchema: buildInputSchema('project_update', {
              project: 'Project ID or name to update',
              name: 'New project name (must be unique)',
              description: 'New description (pass empty string to clear)',
              status: 'New status — one of: active, archived, completed, paused',
              gitRepoUrl: 'New git repository URL',
              rootDirectory: 'New root directory path',
              metadata: 'New structured metadata (jsonb object) to persist on the project'
            }),
          },
          {
            // A8: DERIVE from zod (projectSchemas.delete).
            name: 'project_delete',
            description: 'Delete a project (by id or name). DESTRUCTIVE: cascade-deletes all owned contexts, decisions, tasks, and sessions. Refuses non-empty projects unless confirm:true.',
            inputSchema: buildInputSchema('project_delete', {
              project: 'Project ID or name to delete',
              confirm: 'Must be true to delete a non-empty project (acknowledges cascade-deletion of all owned data). Default: false'
            }),
          },
          {
            // A8: DERIVE from zod (projectSchemas.switch).
            name: 'project_switch',
            description: 'Switch to a different project (sets it as current active project)',
            inputSchema: buildInputSchema('project_switch', {
              project: 'Project ID or name'
            }),
          },
          {
            name: 'project_current',
            description: 'Get the currently active project information',
            inputSchema: buildInputSchema('project_current'),
          },
          {
            // A8: DERIVE from zod (projectSchemas.info).
            name: 'project_info',
            description: 'Get detailed information about a specific project',
            inputSchema: buildInputSchema('project_info', {
              project: 'Project ID or name'
            }),
          },
          {
            name: 'decision_record',
            // DEFECT B fix: the model-facing inputSchema is now DERIVED from the zod
            // validator (buildInputSchema) so every accepted param is advertised, and
            // the enum-valued params spell out their allowed values inline so an LLM
            // gets decisionType/impactLevel right on the FIRST call (no guess-and-fail).
            description: 'Record a technical decision with full context and alternatives. Captures the learning loop: set success_criteria up front, then evaluate later via decision_update.',
            inputSchema: buildInputSchema('decision_record', {
              decisionType: 'REQUIRED. One of EXACTLY these values: architecture, library, framework, pattern, api_design, database, deployment, security, performance, ui_ux, testing, tooling, process, naming_convention, code_style',
              title: 'REQUIRED. Short decision title',
              description: 'REQUIRED. What was decided (the decision itself)',
              rationale: 'REQUIRED. Why this decision was made (the reasoning/trade-offs)',
              impactLevel: 'REQUIRED. One of EXACTLY these values: low, medium, high, critical',
              alternativesConsidered: 'Optional. Array of { name, pros?, cons?, reasonRejected } alternatives that were rejected',
              problemStatement: 'Optional. The problem this decision solves',
              successCriteria: 'Optional but recommended. What "success" looks like — the measurable bar this decision will later be evaluated against (the learning loop starts here)',
              implementationStatus: 'Optional. One of: planned, in_progress, implemented, validated, deprecated (defaults to "planned")',
              affectedComponents: 'Optional. Array of component names this decision affects',
              tags: 'Optional. Array of tags for searchability',
              links: 'Optional array of typed edges to mint FROM this decision to other records (first-class linking). Each item is EITHER explicit {"edgeType":"<one of the edge-type vocab>","to":"<id8|uuid>","toType":"task|decision|context"} OR shorthand {"task":"<ref>"} | {"decision":"<ref>"} | {"context":"<ref>"} (→ informs / decided_by / learned_from). Refs accept an id8 or full UUID, resolved in the current project. A bad/unresolvable link is reported as a warning (link notes) but NEVER blocks the record — the decision + the good links still save.',
              projectId: 'Optional. Project ID or name (defaults to current project)',
              metadata: 'Optional. Arbitrary metadata object'
            }),
          },
          {
            name: 'decision_search',
            description: 'Search technical decisions with various filters',
            inputSchema: buildInputSchema('decision_search', {
              query: 'Search query (optional; omit for pure filter-based search)',
              decisionType: 'Filter by decision type (architecture, library, framework, pattern, api_design, database, deployment, security, performance, ui_ux, testing, tooling, process, naming_convention, code_style)',
              status: 'Filter by LIFECYCLE status (active, deprecated, superseded, under_review). NOTE: this is NOT the outcome — use outcomeStatus to filter how a decision turned out.',
              outcomeStatus: 'Filter by OUTCOME (how it turned out) — one of EXACTLY: unknown, successful, failed, mixed, too_early. This is the learning-loop result column (separate from status); use it to read back e.g. all the decisions that FAILED.',
              impactLevel: 'Filter by impact level (low, medium, high, critical)',
              component: 'Filter by affected component name',
              tags: 'Filter by tags',
              limit: 'Maximum number of results to return (default 10)',
              projectId: 'Project ID or name to scope the search (defaults to current project)',
              includeOutcome: 'Include recorded outcome/lessons in results (accepts true/false)'
            }),
          },
          {
            name: 'decision_get',
            description: 'Fetch a SINGLE technical decision by id with FULL detail — every field, including the learning-loop outcome (outcome_status, outcome notes, lessons learned). The precise by-id read for the learning loop; bypasses search. Use the full UUID (copy the 🆔 ID from decision_search/decision_record).',
            inputSchema: buildInputSchema('decision_get', {
              decisionId: 'REQUIRED. Full UUID of the decision to fetch.',
              projectId: 'Optional. Project ID or name (informational scope; the decision resolves by id alone).'
            }),
          },
          {
            name: 'decision_update',
            // DEFECT A fix: the declared inputSchema now DERIVES from the zod validator
            // and advertises the learning-loop params the handler actually reads
            // (outcomeStatus/outcomeNotes/lessonsLearned/...). Previously it advertised
            // only decisionId while the zod schema declared outcome/lessons that the
            // route never read — so the tool was a no-op through the bridge.
            description: 'Update a decision after the fact — close the learning loop: set outcome_status + lessons_learned once you know how it turned out. Also edits status, implementation_status, supersession, and now title/description/tags/metadata. metadata is MERGED (set a key to null to delete it), not replaced.',
            inputSchema: buildInputSchema('decision_update', {
              decisionId: 'REQUIRED. UUID or 8+-hex short id of the decision to update',
              status: 'Optional. One of: active, deprecated, superseded, under_review',
              outcomeStatus: 'Optional. How the decision turned out — one of EXACTLY: unknown, successful, failed, mixed, too_early',
              outcomeNotes: 'Optional. Free-text notes on the outcome',
              lessonsLearned: 'Optional. What was learned — the payoff of the learning loop',
              implementationStatus: 'Optional. One of: planned, in_progress, implemented, validated, deprecated',
              successCriteria: 'Optional. Set/revise the success criteria the outcome is judged against',
              problemStatement: 'Optional. Set/revise the problem this decision solves',
              supersededBy: 'Optional. UUID of the decision that supersedes this one (also flips status to superseded)',
              supersededReason: 'Optional. Why this decision was superseded',
              title: 'Optional. New decision title (re-embeds for search)',
              description: 'Optional. New decision description (re-embeds for search)',
              tags: 'Optional. New tag set (REPLACES tags) for searchability / re-threading',
              metadata: 'Optional. Structured metadata to MERGE over the existing object (shallow). Set a key to null to DELETE it; omitted keys are preserved.'
            }),
          },
          {
            name: 'decision_stats',
            description: 'Get technical decision statistics and analysis',
            inputSchema: buildInputSchema('decision_stats', {
              projectId: 'Project ID or name to scope the stats (defaults to current project)'
            }),
          },
          {
            // SOFT-DELETE / ARCHIVE (task 7b28bed4): reversible cleanup. Archives the row
            // (sets archived_at) so it disappears from default decision_search while STILL
            // existing — undo with decision_restore. Accepts full UUID or short id.
            name: 'decision_delete',
            description: 'Soft-delete (archive) a technical decision — hides it from default decision_search but does NOT permanently delete it (reversible via decision_restore). Accepts a full UUID or short id; project-scoped.',
            inputSchema: buildInputSchema('decision_delete', {
              decisionId: 'Decision UUID or 8+-hex short id to archive (project-scoped)',
              projectId: 'Project ID or name to scope the lookup (defaults to current project)'
            }),
          },
          {
            name: 'decision_restore',
            description: 'Restore (un-archive) a previously soft-deleted decision so it appears in default decision_search again. Accepts a full UUID or short id; project-scoped.',
            inputSchema: buildInputSchema('decision_restore', {
              decisionId: 'Decision UUID or 8+-hex short id to restore (project-scoped)',
              projectId: 'Project ID or name to scope the lookup (defaults to current project)'
            }),
          },



          {
            name: 'task_create',
            // DERIVE the model-facing schema from the zod validator (same schema-from-zod
            // class fix as the retrieval tools). The old hand-written schema advertised
            // ONLY `title`, so an agent asked to "create a bug" never saw the `type` param,
            // never passed it, and the handler's .default('general') silently won — a
            // wrong-success the tool-use eval caught. Now every accepted-and-validated
            // field (incl. `type` with its enum) is surfaced and can never drift again.
            description: 'Create a new task for agent coordination. Set `type` to the right kind (e.g. "bug", "feature") at creation time — task_update cannot change type afterward.',
            inputSchema: buildInputSchema('task_create', {
              title: 'Task title (required)',
              description: 'Longer task description / details',
              type: 'Task type — one of: feature, bug, bugfix, refactor, test, review, docs, documentation, devops, general (default: general). Pick the correct one at creation; type is immutable afterward.',
              priority: 'Priority — one of: low, medium, high, urgent (default: medium)',
              status: 'Initial status — one of: todo, in_progress, completed, blocked (default: todo)',
              assignedTo: 'Assignee identifier (free-form string, e.g. an agent name)',
              createdBy: 'Who/what created the task (free-form string, e.g. an agent or person name)',
              dependencies: 'Task IDs this task depends on (max 10)',
              tags: 'Tags for categorization and filtering (e.g., ["backend", "urgent"])',
              projectId: 'Project ID or name to create the task under (defaults to current project)',
              metadata: 'Arbitrary structured metadata to attach to the task'
            }),
          },
          {
            name: 'task_list',
            description: 'List tasks with optional filtering',
            inputSchema: buildInputSchema('task_list', {
              status: 'Filter by a single status (todo, in_progress, blocked, completed, cancelled)',
              statuses: 'Filter by MULTIPLE statuses (e.g. ["todo","in_progress"]) — takes precedence over `status` when set',
              priority: 'Filter by priority (low, medium, high, urgent)',
              phase: 'Filter to a single phase — matches a `phase-<phase>` tag (e.g. phase:"3" matches the phase-3 tag)',
              assignedTo: 'Filter by assignee (matches the assigned_to value set via task_create/task_update)',
              type: 'Filter by task type (feature, bug, bugfix, refactor, test, review, docs, devops, general)',
              tags: 'Filter by tags — returns tasks matching ANY of the provided tags',
              limit: 'Maximum number of tasks to return (default 10)',
              offset: 'Number of leading results to skip (pagination)',
              projectId: 'Project ID or name to scope the list (defaults to current project)'
            }),
          },
          {
            // Guard 2 + A3/A4/A5: DERIVE from the zod validator so the model sees the
            // FULL accepted field set. The old hand-written schema advertised ONLY
            // taskId+status (and listed status as required), hiding priority/progress
            // (now real, written fields) and assignedTo. Deriving from zod means
            // declared == accepted == handler-reads and can't drift again. Note 'notes'
            // is intentionally absent: there is no `notes` column on tasks (A4).
            name: 'task_update',
            description: 'Update a task — change any of status, priority, progress, assignee, title, description, tags, or metadata (provide at least one). Status accepts: todo, in_progress, blocked, completed, cancelled. metadata is MERGED (set a key to null to delete it), not replaced.',
            inputSchema: buildInputSchema('task_update', {
              taskId: 'Task ID (UUID or 8+-hex short id) — required',
              status: 'New status — one of: todo, in_progress, blocked, completed, cancelled',
              priority: 'New priority — one of: low, medium, high, urgent',
              assignedTo: 'New assignee (free-form string, e.g. an agent name)',
              progress: 'Completion percentage 0–100',
              title: 'New task title',
              description: 'New task description',
              tags: 'New tag set (REPLACES tags) for categorization / re-threading',
              metadata: 'Structured metadata to MERGE over the existing object (shallow). Set a key to null to DELETE it; omitted keys are preserved (no silent data loss).'
            }),
          },
          {
            name: 'task_details',
            description: 'Get detailed information for a specific task',
            inputSchema: buildInputSchema('task_details', {
              taskId: 'Task ID (UUID)',
              projectId: 'Project ID or name to scope the lookup (defaults to current project)'
            }),
          },
          {
            // Guard 2: DERIVE from the zod validator (taskSchemas.bulk_update). The old
            // hand-written schema advertised ONLY task_ids, hiding status/assignedTo/
            // priority/metadata/notes — all of which the handler honors. Now the model
            // sees exactly the accepted field set and the layers can't drift again.
            name: 'task_bulk_update',
            description: 'Update multiple tasks atomically with the same changes',
            inputSchema: buildInputSchema('task_bulk_update', {
              task_ids: 'Task IDs (UUIDs) to update (1–50)',
              status: 'New status for all — one of: todo, in_progress, blocked, completed, cancelled',
              assignedTo: 'New assignee for all (free-form string)',
              priority: 'New priority for all — one of: low, medium, high, urgent',
              metadata: 'Structured metadata (jsonb object) to set on all',
              notes: 'Notes to merge into each task\'s metadata',
              projectId: 'Project ID to validate ownership against (optional)'
            }),
          },
          {
            name: 'task_progress_summary',
            description: 'Get task progress summary with grouping and completion percentages',
            // STRICT-MODE: derive from zod — surfaces the real `groupBy`/`projectId`
            // params (was hidden by a hand-written empty `{}`).
            inputSchema: buildInputSchema('task_progress_summary', {
              groupBy: 'Grouping for the summary — one of: phase, status, priority, type, assignedTo (default: phase)',
              projectId: 'Project ID or name to scope the summary (defaults to current project)'
            })
          },
          {
            // SOFT-DELETE / ARCHIVE (task 7b28bed4): reversible cleanup. Archives the row
            // (sets archived_at) so it disappears from default task_list while STILL
            // existing — undo with task_restore. Distinct from the `cancelled` STATUS (a
            // lifecycle state that stays listed). Accepts full UUID or short id.
            name: 'task_delete',
            description: 'Soft-delete (archive) a task — hides it from default task_list but does NOT permanently delete it (reversible via task_restore). Distinct from the cancelled status. Accepts a full UUID or short id; project-scoped.',
            inputSchema: buildInputSchema('task_delete', {
              taskId: 'Task UUID or 8+-hex short id to archive (project-scoped)',
              projectId: 'Project ID or name to scope the lookup (defaults to current project)'
            }),
          },
          {
            name: 'task_restore',
            description: 'Restore (un-archive) a previously soft-deleted task so it appears in default task_list again. Accepts a full UUID or short id; project-scoped.',
            inputSchema: buildInputSchema('task_restore', {
              taskId: 'Task UUID or 8+-hex short id to restore (project-scoped)',
              projectId: 'Project ID or name to scope the lookup (defaults to current project)'
            }),
          },
          {
            name: 'smart_search',
            description: 'Intelligent search across all project data sources',
            inputSchema: buildInputSchema('smart_search', {
              query: 'Search query',
              // DRIFT-FIX (task 9c522977): `scope` was DEPRECATED — it was a redundant,
              // singular-form duplicate of includeTypes that the handler never read and
              // named DROPPED sources (naming/agents). includeTypes is the real mechanism.
              includeTypes: 'Limit the search to specific sources, e.g. ["context","decision","component"] (the searched sources today). Omit to search context+component+decision.',
              limit: 'Maximum number of results to return (default 10)',
              projectId: 'Project ID or name to scope the search (defaults to current project)'
            }),
          },
          {
            name: 'get_recommendations',
            description: 'Get AI-powered recommendations for development',
            inputSchema: buildInputSchema('get_recommendations', {
              context: 'What you are working on',
              type: 'Recommendation type (naming, implementation, architecture, testing)',
              projectId: 'Project ID or name to scope recommendations (defaults to current project)'
            }),
          },
          {
            name: 'project_insights',
            description: 'Get comprehensive project health and insights',
            // STRICT-MODE: derive from zod — surfaces the real `projectId` param (was
            // hidden by a hand-written empty `{}`).
            inputSchema: buildInputSchema('project_insights', {
              projectId: 'Project ID or name to scope insights (defaults to current project)'
            }),
          },

          // ── Typed-Edge Graph (Mandrel Core Redesign T2a) ──────────────────────────
          {
            name: 'link',
            description: 'Create a typed edge between two records (context/decision/task) — for edges that can\'t be inferred at write-time, and to REPAIR the graph. Edges carry STRUCTURE (tags carry labels). Edge type ∈ the v1 domain (decided_by, caused, built_by, supersedes, learned_from, proposed_by, informs, produced_outcome). Ids accept a full UUID or 8+-hex short id. Idempotent.',
            inputSchema: buildInputSchema('link', {
              from: 'Source record id (full UUID or 8+-hex short id) — the edge points FROM here',
              fromType: 'Kind of the source record: context | decision | task',
              to: 'Target record id (full UUID or 8+-hex short id) — the edge points TO here',
              toType: 'Kind of the target record: context | decision | task',
              edgeType: 'The typed edge (see the v1 domain). Stored from→to.',
              metadata: 'Optional structured annotations on the edge (jsonb)',
              projectId: 'Project to scope short-id resolution (defaults to current project)'
            }),
          },
          {
            name: 'unlink',
            description: 'Remove a typed edge between two records (curate/repair). Idempotent — removing a non-existent edge is reported, not an error. Ids accept a full UUID or 8+-hex short id.',
            inputSchema: buildInputSchema('unlink', {
              from: 'Source record id (full UUID or 8+-hex short id)',
              to: 'Target record id (full UUID or 8+-hex short id)',
              edgeType: 'The typed edge to remove',
              projectId: 'Project to scope short-id resolution (defaults to current project)'
            }),
          },
          {
            name: 'get_links',
            description: 'Read a record\'s typed edges in BOTH directions, each carrying the connected record\'s id/type/title — the traversal primitive for trust + recall_thread. Zero raw SQL for the consumer. Accepts a full UUID or 8+-hex short id.',
            inputSchema: buildInputSchema('get_links', {
              id: 'The record id to read edges for (full UUID or 8+-hex short id)',
              direction: 'Restrict to out (record is source), in (record is target), or both (default)',
              edgeTypes: 'Optional list of edge types to restrict the walk (default: all)',
              projectId: 'Project to scope short-id resolution (defaults to current project)'
            }),
          },

          // ── recall_thread (Mandrel Core Redesign T3) — THE headline pull tool ──────
          {
            name: 'recall_thread',
            description:
              'Read me in on the STORY of X, at altitude Y, and tell me what to TRUST — in ONE call. ' +
              'Resolves the anchor (a ref:<slug>, or a context/decision/task id — id8 ok), traverses the ' +
              'typed-edge graph BOTH directions (cycle-safe, capped), trust-annotates every node (the moat: ' +
              'band/score/abstain), orders the nodes causally+temporally so it reads top-to-bottom as the story, ' +
              'and surfaces an abstain list. Returns BOTH a clean structured thread AND a narratable text channel. ' +
              'Deterministic — no LLM. Altitude: headline (1-liner/node) | summary (default, +snippet) | full (+full content).',
            inputSchema: buildInputSchema('recall_thread', {
              anchor: 'What to read in on: a ref:<slug> (e.g. ref:resume), or a context/decision/task id (full UUID or 8+-hex short id)',
              altitude: 'Zoom per node: headline (title+type+trust) | summary (default, +snippet) | full (+full content)',
              edgeTypes: 'Optional list of edge types to restrict the walk (default: all v1 edge types)',
              depth: 'Optional BFS depth (hops from the anchor); clamped to the configured max. Default from config.',
              minTrust: 'Optional trust floor — a band name (trusted|ok|unproven|stale|superseded|contradicted) OR a 0–1 score; nodes below it are hidden (the anchor never is)',
              projectId: 'Project to scope anchor/short-id resolution (defaults to current project)'
            }),
          },

          // ── Session active-thread anchor (Mandrel Core Redesign T5b) ──────────────
          {
            name: 'thread_set',
            description:
              'Set this session\'s ACTIVE THREAD — an active task and/or decision. While set, every context_store auto-threads its capture onto it (record → task `informs`, record → decision `decided_by`) with ZERO tags, so a capture made during an active thread structurally cannot be born a graph leaf. Provide at least one of task/decision (full UUID or 8+-hex short id; resolved project-scoped). Merges over any existing anchor (set task then decision to accumulate both). Idempotent edges (dedup).',
            inputSchema: buildInputSchema('thread_set', {
              task: 'Active task id (full UUID or 8+-hex short id) — captures get an `informs` edge to it',
              decision: 'Active decision id (full UUID or 8+-hex short id) — captures get a `decided_by` edge to it',
              projectId: 'Project to scope short-id resolution (defaults to current project)'
            }),
          },
          {
            name: 'thread_current',
            description:
              'Show this session\'s active thread (the active task/decision captures are auto-threading onto, with resolved titles), or a clear "no active thread" message if none is set.',
            inputSchema: buildInputSchema('thread_current'),
          },
          {
            name: 'thread_clear',
            description:
              'Clear this session\'s active thread so new captures no longer auto-thread. Idempotent — clearing when nothing is set is reported, not an error.',
            inputSchema: buildInputSchema('thread_clear'),
          },

          // ── Surveyor Integration (P4b — Mandrel calls the shared Surveyor service) ──────
          {
            name: 'surveyor_scan',
            description:
              'Scan a codebase with the shared Surveyor service and PERSIST the result (structure graph + warnings + per-function summaries) into the current project, then return a counts summary. Mandrel is the system of record; surveyor_get_graph reads it back. The path is scanned by the Surveyor service (must be readable by it).',
            inputSchema: buildInputSchema('surveyor_scan', {
              path: 'Absolute codebase path for the Surveyor service to scan',
              projectId: 'Project to store the scan under (defaults to the current project)',
            }),
          },
          {
            name: 'surveyor_get_graph',
            description:
              'Read a stored Surveyor graph (nodes + connections) for a project back from Postgres — the LATEST scan by default, or a specific scanId. Optional nodeTypes filter (e.g. file/function/class) and limit; when filtered, connections are scoped to the returned nodes. Returns the scan header, nodes, and connections.',
            inputSchema: buildInputSchema('surveyor_get_graph', {
              projectId: 'Project to read from (defaults to the current project)',
              scanId: 'A specific stored scan (full UUID or 8+-hex prefix); defaults to the latest',
              nodeTypes: 'Optional list of node types to include (e.g. ["function","class"])',
              limit: 'Optional cap on the number of nodes returned',
            }),
          },

        // Session Management Tools - DELETED (2025-10-24)
        // The following 5 MCP tools were removed because sessions auto-manage themselves:
        // - session_assign → Auto-tracking via ensureActiveSession()
        // - session_status → Auto-tracking via SessionTracker service
        // - session_new → Auto-tracking via ensureActiveSession()
        // - session_update → Not needed for auto-tracking
        // - session_details → Not needed for auto-tracking
        // SessionTracker service remains fully functional for auto-tracking.
        // AIDIS Command UI uses REST API endpoints at /api/v2/sessions/* for session analytics.

        // Session Analytics Tools - MIGRATED TO REST API (2025-10-05)
        // The following 8 tools have been migrated to REST API endpoints at /api/v2/sessions/*
        // - session_record_activity → POST /api/v2/sessions/:sessionId/activities
        // - session_get_activities → GET /api/v2/sessions/:sessionId/activities
        // - session_record_file_edit → POST /api/v2/sessions/:sessionId/files
        // - session_get_files → GET /api/v2/sessions/:sessionId/files
        // - session_calculate_productivity → POST /api/v2/sessions/:sessionId/productivity
        // - sessions_list → GET /api/v2/sessions
        // - sessions_stats → GET /api/v2/sessions/stats
        // - sessions_compare → GET /api/v2/sessions/compare
        // See: src/api/controllers/sessionAnalyticsController.ts

        // Pattern Detection Tools - REMOVED (2025-10-24)
        // TC013/TC017: Pattern detection system deprecated and removed
        // Reason: Most functionality stubbed out, only 1 of 4 pattern types worked
        // Database tables dropped via migration 033

        // TC014: Metrics tools - Never implemented, ghost code removed (2025-10-24)
];

/**
 * DUAL-CHANNEL OUTPUT (task 2c412458): attach the table-driven `outputSchema` to
 * EVERY tool definition from the single source of truth (config/outputSchemas.ts),
 * exactly mirroring how buildInputSchema feeds inputSchema. Done in ONE place so a
 * new tool can't ship without an output contract: if a definition's name has no
 * entry in outputZodSchemas this throws at import time (fail fast, not silently
 * shipping a tool with no machine-readable schema). The dualChannelOutput contract
 * test is the permanent guard around this invariant.
 */
function attachOutputSchemas(defs: ToolDefinition[]): void {
  for (const def of defs) {
    if (!(def.name in outputZodSchemas)) {
      throw new Error(
        `[toolDefinitions] tool '${def.name}' has no outputSchema entry in ` +
          `config/outputSchemas.ts — every tool MUST declare a dual-channel output ` +
          `contract (task 2c412458). Add it to outputZodSchemas.`
      );
    }
    def.outputSchema = buildOutputSchema(def.name as OutputSchemaToolName);
  }
}

attachOutputSchemas(AIDIS_TOOL_DEFINITIONS);

/**
 * SINGLE SOURCE OF CATEGORY TRUTH (catalog-drift class fix, task 43aa8c03).
 *
 * THE BUG CLASS this closes: mandrel_help used to render from a SEPARATE hardcoded
 * catalog inside handlers/navigation.ts (`this.toolCatalog`). That second copy drifted
 * from AIDIS_TOOL_DEFINITIONS — it omitted 8 real, advertised-and-working tools
 * (context_update + the linking/thread tools) and reported the wrong count. Two
 * hand-maintained lists of "what tools exist" inevitably diverge.
 *
 * THE FIX: categories live HERE, beside the tool definitions that are themselves the
 * single source for the tool SET. `mandrel_help` derives its groups, its tool list, AND
 * its counts from these two exports at runtime — there is no second catalog to drift.
 *
 *  - CATEGORY_ORDER     — the ordered list of category display names (display order only).
 *  - TOOL_CATEGORIES    — categoryName → ordered list of tool names within that category
 *                         (intra-category order). The ONLY place a tool is mapped to a
 *                         category; the tool's name + description still come from
 *                         AIDIS_TOOL_DEFINITIONS (never re-typed here).
 *
 * INVARIANT, enforced fail-fast at import time by assertCategoryCoverage() below
 * (same spirit as attachOutputSchemas): every tool in AIDIS_TOOL_DEFINITIONS is mapped
 * to EXACTLY ONE category, and TOOL_CATEGORIES references no tool that doesn't exist.
 * So a newly-added tool that isn't categorized crashes the server on boot (and reddens
 * the helpCatalog contract test) — it can never silently fall out of mandrel_help.
 */
export const CATEGORY_ORDER = [
  'System Health',
  'Navigation',
  'Session Management',
  'Context Management',
  'Project Management',
  'Technical Decisions',
  'Task Management',
  'Smart Search & AI',
  'Linking & Graph',
  'Surveyor',
] as const;

export type ToolCategory = (typeof CATEGORY_ORDER)[number];

export const TOOL_CATEGORIES: Record<ToolCategory, string[]> = {
  'System Health': ['mandrel_ping', 'mandrel_status'],
  'Navigation': ['mandrel_help', 'mandrel_explain', 'mandrel_examples'],
  // Session Lifecycle (session-rework SR-2, task af51c035) — explicit user-controlled
  // start/end/status of the per-connection work session.
  'Session Management': ['session_start', 'session_end', 'session_status'],
  'Context Management': [
    'context_store',
    'context_search',
    'context_get_recent',
    'context_update',
    'context_stats',
    'context_delete',
    'context_restore',
  ],
  'Project Management': [
    'project_list',
    'project_create',
    'project_update',
    'project_delete',
    'project_switch',
    'project_current',
    'project_info',
    'project_insights',
  ],
  'Technical Decisions': [
    'decision_record',
    'decision_search',
    'decision_get',
    'decision_update',
    'decision_stats',
    'decision_delete',
    'decision_restore',
  ],
  'Task Management': [
    'task_create',
    'task_list',
    'task_update',
    'task_details',
    'task_bulk_update',
    'task_progress_summary',
    'task_delete',
    'task_restore',
  ],
  'Smart Search & AI': ['smart_search', 'get_recommendations'],
  'Linking & Graph': [
    'link',
    'unlink',
    'get_links',
    'recall_thread',
    'thread_set',
    'thread_current',
    'thread_clear',
  ],
  'Surveyor': ['surveyor_scan', 'surveyor_get_graph'],
};

/**
 * Resolve the single-source category for a tool name (the same source mandrel_help and
 * mandrel_explain read). Returns undefined for an unknown tool.
 */
export function categoryForTool(toolName: string): ToolCategory | undefined {
  for (const category of CATEGORY_ORDER) {
    if (TOOL_CATEGORIES[category].includes(toolName)) {
      return category;
    }
  }
  return undefined;
}

/**
 * Fail-fast coverage guard (mirrors attachOutputSchemas). Asserts the category map and
 * the tool definitions describe EXACTLY the same set, each tool categorized once. Throws
 * at import time so a drift can never reach a running server or a green build.
 */
function assertCategoryCoverage(defs: ToolDefinition[]): void {
  // 1. CATEGORY_ORDER and TOOL_CATEGORIES keys agree (no category without a slot / order).
  const orderSet = new Set<string>(CATEGORY_ORDER);
  for (const key of Object.keys(TOOL_CATEGORIES)) {
    if (!orderSet.has(key)) {
      throw new Error(
        `[toolDefinitions] category '${key}' is in TOOL_CATEGORIES but missing from ` +
          `CATEGORY_ORDER — add it to the display order (single source).`
      );
    }
  }

  // 2. Each tool appears in exactly one category, and no category lists a phantom tool.
  const defNames = new Set(defs.map((d) => d.name));
  const seen = new Map<string, string>(); // toolName -> category it was found in
  for (const category of CATEGORY_ORDER) {
    for (const toolName of TOOL_CATEGORIES[category]) {
      if (!defNames.has(toolName)) {
        throw new Error(
          `[toolDefinitions] category '${category}' lists tool '${toolName}' which is ` +
            `not in AIDIS_TOOL_DEFINITIONS — remove it or fix the name (single source).`
        );
      }
      const prior = seen.get(toolName);
      if (prior) {
        throw new Error(
          `[toolDefinitions] tool '${toolName}' is categorized twice ('${prior}' and ` +
            `'${category}') — each tool must map to EXACTLY ONE category.`
        );
      }
      seen.set(toolName, category);
    }
  }

  // 3. Every defined tool is categorized (no tool silently falling out of mandrel_help).
  const uncategorized = defs.filter((d) => !seen.has(d.name)).map((d) => d.name);
  if (uncategorized.length > 0) {
    throw new Error(
      `[toolDefinitions] these tools have NO category in TOOL_CATEGORIES and would ` +
        `vanish from mandrel_help: ${uncategorized.join(', ')}. Add each to exactly ` +
        `one category in TOOL_CATEGORIES (the single source of catalog truth).`
    );
  }
}

assertCategoryCoverage(AIDIS_TOOL_DEFINITIONS);

