/**
 * ORACLE HARDENING: INPUT VALIDATION MIDDLEWARE
 * Zod-based validation for all AIDIS MCP tool requests
 * Prevents malformed input and ensures data integrity
 */

import { z } from 'zod';
import { formatZodErrorMessage } from '../utils/actionableError.js';
import { isUuidOrShortId } from '../utils/idResolver.js';

/**
 * SHORT-ID ACCEPTANCE (task 131ef054): an id field that accepts EITHER a full UUID OR
 * an 8+-hex-char short id (the prefix our tool outputs are referenced by). Previously
 * these fields were strict `.uuid()`, which rejected the short form every reference uses
 * — a tool-only agent could not resolve a short id → full UUID through the public tools.
 *
 * This refinement still VALIDATES THE SHAPE (must be hex/uuid-shaped — non-hex garbage is
 * rejected here with an actionable message), it just no longer demands a FULL uuid. The
 * handler/db layer then resolves a short id → full UUID server-side (see idResolver.ts).
 * It plays correctly with strict mode: the field is declared + value-validated; only the
 * "must be a complete UUID" constraint is relaxed to "uuid OR short hex id".
 */
const uuidOrShortId = () =>
  z.string().refine((v) => isUuidOrShortId(v), {
    message:
      'must be a full UUID or a short id (8+ hex characters — the prefix shown in 🆔 ID output). ' +
      'Non-hex values are not valid ids. If unsure, use a *_search/*_list tool to find the ' +
      'record and copy its full UUID.',
  });

/**
 * Coerce a string-from-the-bridge boolean into a real boolean.
 *
 * THE BUG CLASS (string-from-bridge): MCP clients / the HTTP bridge serialize
 * everything as JSON strings, so a boolean param arrives as "true"/"false" (not a
 * real boolean). A bare z.boolean() then rejects it with "Expected boolean, received
 * string". And z.coerce.boolean() is WRONG here — it uses JS truthiness, so the
 * NON-EMPTY string "false" coerces to `true` (a silent correctness bug).
 *
 * THE FIX: an explicit preprocess that maps the documented string forms to real
 * booleans BEFORE validation, then validates as a boolean:
 *   "true"  | "1" | "yes" | "on"            (case-insensitive) -> true
 *   "false" | "0" | "no"  | "off" | ""      (case-insensitive) -> false
 * Real booleans pass through untouched. Any OTHER value is left as-is so the inner
 * z.boolean() still REJECTS garbage (e.g. "maybe") rather than silently defaulting.
 *
 * Reuse this for EVERY boolean tool param that can arrive over the bridge so the
 * "Expected boolean, received string" class can't reappear tool-by-tool.
 */
const coercedBoolean = () =>
  z.preprocess((v) => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
      if (s === 'false' || s === '0' || s === 'no' || s === 'off' || s === '') return false;
    }
    return v; // leave non-coercible values for z.boolean() to reject
  }, z.boolean());

/**
 * Coerce a string-from-the-bridge integer into a real number BEFORE validation —
 * the numeric sibling of coercedBoolean(). Same root cause: the HTTP bridge / MCP
 * clients serialize args as JSON, so a numeric param (limit/offset) can arrive as
 * the STRING "20" rather than the number 20, and a bare z.number() would reject it.
 *
 * Conservative: only a string that is a clean base-10 integer is converted; anything
 * else (real number passes straight through; "abc", "1.5", "") is left untouched so
 * the inner z.number().int() still REJECTS garbage rather than silently defaulting.
 * Pass the inner schema (with .min/.max/.default) so each call sites its own bounds.
 */
const coercedInt = (inner: z.ZodTypeAny) =>
  z.preprocess((v) => {
    if (typeof v === 'string') {
      const s = v.trim();
      if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    }
    return v; // number passes through; non-integer string left for z.number() to reject
  }, inner);

// Base validation schemas
const baseMetadata = z.record(z.any()).optional();
const baseName = z.string().min(1).max(255);
const baseDescription = z.string().max(2000).optional();
const baseTags = z.array(z.string().max(50)).max(20).optional();
const baseQuery = z.string().min(1).max(1000);
const baseLimit = z.number().int().min(1).max(100).default(10);
const baseRelevanceScore = z.number().min(0).max(10).optional();

// System Health Schemas
const mandrelSystemSchemas = {
  ping: z.object({
    message: z.string().max(500).optional()
  }),
  
  status: z.object({}),
  
  help: z.object({}),
  
  explain: z.object({
    toolName: z.string().min(1).max(100)
  }),
  
  examples: z.object({
    toolName: z.string().min(1).max(100)
  })
};

// Legacy alias for backward compatibility
const aidisSystemSchemas = mandrelSystemSchemas;

// Context Management Schemas
const contextSchemas = {
  store: z.object({
    // Store the user's FULL content — never silently lose data (Brian's no-data-loss
    // bar). The old .max(10000) cap rejected real conversational turns (~23k chars)
    // with a 500 and was the LongMemEval eval pain. There is no hard *storage* limit:
    // `contexts.content` is Postgres TEXT, and the embedding path is independently
    // bounded — the handler embeds only request.content.substring(0, 1000) (see
    // handlers/context.ts), so the local model's token limit (EMBEDDING_MAX_TEXT_LENGTH,
    // default 8000) is never reached regardless of stored length. The stored row keeps
    // everything and stays retrievable. The generous 5MB ceiling below is ONLY an
    // anti-abuse guard (well above any real turn and below express.json's 10mb body
    // limit) so a pathological payload can't OOM the process — it is not a content cap.
    content: z.string().min(1).max(5_000_000),
    type: z.enum(['code', 'decision', 'error', 'discussion', 'planning', 'completion', 'milestone', 'reflections', 'handoff', 'lessons']),
    tags: baseTags,
    relevanceScore: baseRelevanceScore,
    metadata: baseMetadata,
    projectId: z.string().optional(),
    sessionId: z.string().optional()
  }),
  
  search: z.object({
    id: z.string().uuid().optional(), // Direct lookup by context ID - bypasses semantic search
    query: z.string().min(1).max(1000).optional(), // Optional when id is provided
    type: z.enum(['code', 'decision', 'error', 'discussion', 'planning', 'completion', 'milestone', 'reflections', 'handoff', 'lessons']).optional(),
    tags: baseTags,
    limit: baseLimit,
    minSimilarity: z.number().min(0).max(100).optional(),
    offset: z.number().int().min(0).optional(),
    projectId: z.string().optional(),
    sessionId: z.string().optional(),
    // SOFT-DELETE (task 7b28bed4): by DEFAULT exclude archived contexts (archived_at IS
    // NULL). Pass includeArchived:true to also return archived rows. coercedBoolean() so
    // the bridge's "true"/"false" string is accepted (never the truthiness footgun).
    includeArchived: coercedBoolean().optional()
  }).refine(data => data.id || data.query || (data.tags !== undefined && data.tags.length > 0), {
    // Accept a TAGS-ONLY call (id OR query OR a non-empty tags array). A tags-only
    // request is answered by the existing `tags && $1` GIN filter (no dummy query
    // needed). Behavior when a query is present is unchanged.
    message: "Provide at least one of: 'id', 'query', or a non-empty 'tags' array"
  }),
  
  get_recent: z.object({
    limit: z.number().int().min(1).max(20).default(5),
    projectId: z.string().optional(),
    // SOFT-DELETE (task 7b28bed4): exclude archived by default; includeArchived:true reveals them.
    includeArchived: coercedBoolean().optional()
  }),

  // STRICT-MODE SAFETY (task 5fd58eef): the handler (context.routes.handleStats) reads
  // args.projectId via resolveProjectId to scope the stats, so projectId is a REAL,
  // accepted-and-used param. It was missing from the zod schema, so under strict mode a
  // legitimate project-scoped call would have been wrongly rejected. Declare it (don't
  // drop it) — declared == accepted == handler-reads.
  stats: z.object({
    projectId: z.string().optional()
  }),

  // SOFT-DELETE / ARCHIVE (task 7b28bed4): reversible cleanup through the public tool
  // surface (no raw SQL). `delete` sets archived_at=now(); `restore` clears it. Both
  // accept a full UUID OR an 8+-hex short id (resolved project-scoped in the handler).
  delete: z.object({
    contextId: uuidOrShortId(),
    projectId: z.string().optional()
  }),
  restore: z.object({
    contextId: uuidOrShortId(),
    projectId: z.string().optional()
  })
};

// Allowed project status values — must match the DB CHECK constraint on projects.status
const projectStatusEnum = z.enum(['active', 'archived', 'completed', 'paused']);

// Project Management Schemas
const projectSchemas = {
  create: z.object({
    name: baseName,
    description: baseDescription,
    status: projectStatusEnum.optional(),
    gitRepoUrl: z.string().optional(),
    rootDirectory: z.string().optional(),
    metadata: baseMetadata
  }),

  update: z.object({
    project: z.string().min(1).max(255), // project id or name to update
    name: baseName.optional(),
    description: z.string().max(2000).nullable().optional(),
    status: projectStatusEnum.optional(),
    gitRepoUrl: z.string().optional(),
    rootDirectory: z.string().optional(),
    metadata: baseMetadata
  }).refine(
    data => data.name !== undefined || data.description !== undefined ||
            data.status !== undefined || data.gitRepoUrl !== undefined ||
            data.rootDirectory !== undefined || data.metadata !== undefined,
    { message: 'At least one field to update must be provided (name, description, status, gitRepoUrl, rootDirectory, metadata)' }
  ),

  delete: z.object({
    project: z.string().min(1).max(255), // project id or name to delete
    confirm: z.boolean().optional().default(false)
  }),

  switch: z.object({
    project: z.union([
      z.string().uuid(), // Project ID
      z.string().min(1).max(255) // Project name
    ])
  }),
  
  info: z.object({
    project: z.string().min(1).max(255)
  }),
  
  list: z.object({
    includeStats: z.union([z.boolean(), z.string().transform(val => val === 'true')]).optional().default(false),
    // PAGINATION (task 4b484c8f): project_list used to return EVERY project unbounded
    // (output bloat as the project count grows). Add a bounded page window mirroring
    // task_list's limit/offset, but with a project-appropriate DEFAULT of 20 (projects
    // are far fewer than tasks; 20 fits a typical workspace without truncating). Both
    // arrive as STRINGS over the bridge → coercedInt() (numeric sibling of
    // coercedBoolean) so "20"/"40" validate. Truncation is reported honestly in-route
    // (total vs returned + a "showing N of M" note) — never a silent cut.
    limit: coercedInt(z.number().int().min(1).max(100).default(20)),
    offset: coercedInt(z.number().int().min(0).optional())
  }),
  
  current: z.object({}),

  insights: z.object({
    projectId: z.string().optional()
  })
};

// Naming Registry Schemas
const namingSchemas = {
  register: z.object({
    canonicalName: baseName,
    entityType: z.enum(['variable', 'function', 'class', 'interface', 'type', 'component', 
                        'file', 'directory', 'module', 'service', 'endpoint', 'database_table', 
                        'database_column', 'config_key', 'environment_var', 'css_class', 'html_id']),
    description: z.string().max(1000).optional(),
    aliases: z.array(z.string().max(255)).max(10).optional(),
    contextTags: z.array(z.string().max(50)).max(20).optional(),
    projectId: z.string().optional()
  }),
  
  check: z.object({
    proposedName: baseName,
    entityType: z.enum(['variable', 'function', 'class', 'interface', 'type', 'component', 
                        'file', 'directory', 'module', 'service', 'endpoint', 'database_table', 
                        'database_column', 'config_key', 'environment_var', 'css_class', 'html_id']),
    contextTags: z.array(z.string().max(50)).max(20).optional(),
    projectId: z.string().optional()
  }),
  
  suggest: z.object({
    description: z.string().min(1).max(1000),
    entityType: z.enum(['variable', 'function', 'class', 'interface', 'type', 'component', 
                        'file', 'directory', 'module', 'service', 'endpoint', 'database_table', 
                        'database_column', 'config_key', 'environment_var', 'css_class', 'html_id']),
    contextTags: z.array(z.string().max(50)).max(20).optional(),
    projectId: z.string().optional()
  }),
  
  stats: z.object({})
};

// Technical Decision learning-loop enums — must match the DB CHECK constraints on
// technical_decisions (see migrations/000_baseline_schema.sql). Defined once and
// reused by record + update so the two tools can never drift apart.
const outcomeStatusEnum = z.enum(['unknown', 'successful', 'failed', 'mixed', 'too_early']);
const implementationStatusEnum = z.enum(['planned', 'in_progress', 'implemented', 'validated', 'deprecated']);

// Technical Decision Schemas
const decisionSchemas = {
  record: z.object({
    decisionType: z.enum(['architecture', 'library', 'framework', 'pattern', 'api_design', 'database', 'deployment', 'security', 'performance', 'ui_ux', 'testing', 'tooling', 'process', 'naming_convention', 'code_style']),
    title: z.string().min(1).max(255),
    description: z.string().min(1).max(5000),
    rationale: z.string().max(2000),
    impactLevel: z.enum(['low', 'medium', 'high', 'critical']),
    alternativesConsidered: z.array(z.object({
      name: z.string(),
      pros: z.array(z.string()).optional(),
      cons: z.array(z.string()).optional(),
      reasonRejected: z.string()
    })).optional(),
    problemStatement: z.string().max(2000).optional(),
    // Learning-loop fields settable UP FRONT (capture). success_criteria is the
    // moat field: record what "success" looks like now, evaluate it later via
    // decision_update.outcomeStatus. implementationStatus tracks the build lifecycle.
    successCriteria: z.string().max(2000).optional(),
    implementationStatus: implementationStatusEnum.optional(),
    // A1: outcome fields are also settable AT RECORD TIME (mirroring implementationStatus,
    // which already round-trips on create). Previously zod's .parse() silently stripped
    // these on create → a decision recorded with a known outcome lost it. outcomeStatus
    // defaults to 'unknown' in the DB when unset; 'too_early' etc. are allowed.
    outcomeStatus: outcomeStatusEnum.optional(),
    outcomeNotes: z.string().max(2000).optional(),
    lessonsLearned: z.string().max(2000).optional(),
    affectedComponents: z.array(z.string()).optional(),
    tags: baseTags.optional(),
    projectId: z.string().optional(),
    metadata: baseMetadata.optional()
  }),
  
  search: z.object({
    query: z.string().min(1).max(1000).optional(), // Make query optional for flexible filtering
    limit: baseLimit,
    // Add all parameters the handler actually supports (all optional)
    decisionType: z.enum(['architecture', 'library', 'framework', 'pattern',
      'api_design', 'database', 'deployment', 'security', 'performance',
      'ui_ux', 'testing', 'tooling', 'process', 'naming_convention', 'code_style']).optional(),
    status: z.enum(['active', 'deprecated', 'superseded', 'under_review']).optional(),
    // outcomeStatus is a SEPARATE column from `status` (the lifecycle): it filters the
    // learning-loop result column (technical_decisions.outcome_status). This is the
    // moat-critical READ filter for the GAP1 Evaluator — "show me the decisions that
    // FAILED / SUCCEEDED" — which `status` (active/deprecated/…) cannot express. Enum
    // matches the DB CHECK constraint exactly (outcomeStatusEnum, reused).
    outcomeStatus: outcomeStatusEnum.optional(),
    impactLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    component: z.string().optional(),
    tags: baseTags.optional(),
    projectId: z.string().optional(),
    // includeOutcome arrives as a STRING over the bridge ("true"/"false"); coerce it
    // so a tool-only client isn't rejected with "Expected boolean, received string".
    includeOutcome: coercedBoolean().optional(),
    // SOFT-DELETE (task 7b28bed4): exclude archived decisions by default; includeArchived
    // reveals them. coercedBoolean() for the same string-from-bridge reason as above.
    includeArchived: coercedBoolean().optional()
    // Note: dateFrom/dateTo excluded - complex date parsing not needed for AI ease-of-use
  }),

  // decision_get: fetch a SINGLE decision by id with FULL detail (all fields incl.
  // the learning-loop outcome fields). Mirrors context_search's `id` direct-lookup
  // idiom (bypasses semantic search). Accepts a full UUID OR an 8+-hex short id
  // (task 131ef054) — the short id is resolved → full UUID in the handler.
  get: z.object({
    decisionId: uuidOrShortId(),
    projectId: z.string().optional()
  }),
  
  // DEFECT A FIX (decision_update was a no-op through the bridge): the zod schema
  // declared `outcome`/`lessons` but the route handler reads outcomeStatus/
  // outcomeNotes/lessonsLearned. zod uses .parse() (not .strict()), so the real
  // params were SILENTLY STRIPPED → the handler got all-undefined → updateDecision
  // threw "No update fields provided". This schema now declares EXACTLY the params
  // the handler reads (declared==handler boundary, Lesson 011 class fix), with the
  // learning-loop enums validated against the DB CHECK constraints.
  update: z.object({
    // Accepts a full UUID OR an 8+-hex short id (task 131ef054); resolved in the handler.
    decisionId: uuidOrShortId(),
    status: z.enum(['active', 'deprecated', 'superseded', 'under_review']).optional(),
    // Learning-loop fields settable AFTER THE FACT (evaluate → correct).
    outcomeStatus: outcomeStatusEnum.optional(),
    outcomeNotes: z.string().max(2000).optional(),
    lessonsLearned: z.string().max(2000).optional(),
    implementationStatus: implementationStatusEnum.optional(),
    successCriteria: z.string().max(2000).optional(),
    problemStatement: z.string().max(2000).optional(),
    supersededBy: z.string().uuid().optional(),
    supersededReason: z.string().max(2000).optional(),
    // projectId scopes the SHORT-ID resolution of decisionId to one project (task
    // 131ef054). Optional + not an updatable field, so it's excluded from the .refine
    // "at least one field to update" check below. Declared so strict mode accepts it.
    projectId: z.string().optional()
  }).refine(
    data => data.status !== undefined || data.outcomeStatus !== undefined ||
            data.outcomeNotes !== undefined || data.lessonsLearned !== undefined ||
            data.implementationStatus !== undefined || data.successCriteria !== undefined ||
            data.problemStatement !== undefined || data.supersededBy !== undefined ||
            data.supersededReason !== undefined,
    { message: 'At least one field to update must be provided (status, outcomeStatus, outcomeNotes, lessonsLearned, implementationStatus, successCriteria, problemStatement, supersededBy, supersededReason)' }
  ),

  // STRICT-MODE SAFETY: decisions.routes.handleStats reads args.projectId via
  // resolveProjectId to scope the stats — a real accepted-and-used param. Declare it so
  // strict mode doesn't reject a legitimate project-scoped call.
  stats: z.object({
    projectId: z.string().optional()
  }),

  // SOFT-DELETE / ARCHIVE (task 7b28bed4): reversible cleanup. delete → archived_at=now();
  // restore → archived_at=NULL. Accepts full UUID or 8+-hex short id (resolved in handler).
  delete: z.object({
    decisionId: uuidOrShortId(),
    projectId: z.string().optional()
  }),
  restore: z.object({
    decisionId: uuidOrShortId(),
    projectId: z.string().optional()
  })
};

// Multi-Agent Coordination Schemas
const agentSchemas = {
  register: z.object({
    name: z.string().min(1).max(100),
    type: z.string().min(1).max(100).optional(),
    capabilities: z.array(z.string().max(100)).max(20).optional(),
    metadata: baseMetadata.optional()
  }),
  
  list: z.object({}),
  
  status: z.object({
    agentId: z.string().min(1).max(100)
  }),
  
  join: z.object({
    agentId: z.string().min(1).max(100),
    sessionId: z.string().uuid().optional()
  }),
  
  leave: z.object({
    agentId: z.string().min(1).max(100),
    sessionId: z.string().uuid().optional()
  }),
  
  sessions: z.object({
    agentId: z.string().min(1).max(100).optional()
  }),
  
  message: z.object({
    fromAgentId: z.string().min(1).max(100),
    content: z.string().min(1).max(5000),
    toAgentId: z.string().min(1).max(100).optional(),
    messageType: z.string().optional(),
    title: z.string().optional(),
    contextRefs: z.array(z.string()).optional(),
    taskRefs: z.array(z.string()).optional(),
    projectId: z.string().optional(),
    metadata: baseMetadata.optional()
  }),
  
  messages: z.object({
    agentId: z.string().min(1).max(100).optional(),
    limit: baseLimit,
    since: z.string().datetime().optional()
  })
};

// Task enums — defined ONCE and reused across task_create/list/update/bulk_update
// so the advertised + accepted value sets can never drift apart (Lesson 011: one
// centralized definition, not N copies). taskStatusEnum INCLUDES 'cancelled' to
// match the `tasks.status` column (varchar(50), no CHECK constraint — see the
// COMMENT in 000_baseline_schema.sql which documents 'cancelled' as a real value).
// Previously task_create/list/update advertised only todo/in_progress/completed/
// blocked while task_bulk_update already allowed 'cancelled' → a status the DB
// accepts was rejected by the validator on the single-task path (A3).
const taskStatusEnum = z.enum(['todo', 'in_progress', 'blocked', 'completed', 'cancelled']);
const taskPriorityEnum = z.enum(['low', 'medium', 'high', 'urgent']);
const taskTypeEnum = z.enum(['feature', 'bug', 'bugfix', 'refactor', 'test', 'review', 'docs', 'documentation', 'devops', 'general']);

// Task Management Schemas
const taskSchemas = {
  create: z.object({
    title: z.string().min(1).max(255),
    description: z.string().max(2000).optional(),
    type: taskTypeEnum.optional().default('general'),
    priority: taskPriorityEnum.optional().default('medium'),
    status: taskStatusEnum.optional(),
    assignedTo: z.string().optional(),
    // DRIFT-FIX (task 9c522977, nit 4): createdBy is a REAL column (tasks.created_by, a
    // free-form string — who/what created the task) and handleCreate already forwards
    // args.createdBy into tasksHandler.createTask, but it was NEVER declared here. Under
    // strict mode (task 5fd58eef) an undeclared key is REJECTED, so the genuine capability
    // was unreachable through MCP. Declare it (string, like assignedTo) so it's reachable.
    createdBy: z.string().optional(),
    dependencies: z.array(z.string()).max(10).optional(),
    tags: baseTags,
    projectId: z.string().optional(),
    metadata: baseMetadata
  }),

  list: z.object({
    status: taskStatusEnum.optional(),
    // DRIFT-FIX (task 9c522977, nit 4): `statuses` is a REAL multi-status filter the
    // handler honors (listTasks builds `status IN (...)` from it) and takes PRECEDENCE
    // over the single `status` when present. It was read (args.statuses) but never
    // declared, so strict mode rejected it → a genuinely-useful filter was unreachable.
    // Declare it as an array of the same task-status enum so the values stay aligned.
    statuses: z.array(taskStatusEnum).min(1).max(5).optional(),
    priority: taskPriorityEnum.optional(),
    // DRIFT-FIX (task 9c522977, nit 4): `phase` is a REAL filter the handler honors
    // (listTasks matches `phase-<phase>` against the tags array). Read (args.phase) but
    // never declared → rejected under strict mode. Declare it (a short string; the
    // handler prefixes it with `phase-` before matching the tags) so it's reachable.
    phase: z.string().min(1).max(50).optional(),
    // assignedTo (NOT assignedAgent): the handler reads args.assignedTo and the
    // column is `assigned_to` (a simple string, not an FK/uuid — same as
    // task_create/task_update/bulk_update). The prior `assignedAgent` name + .uuid()
    // both diverged from the handler read, so this filter was silently dropped
    // (zod .parse() strips the undeclared assignedTo → undefined at the handler).
    assignedTo: z.string().optional(),
    type: taskTypeEnum.optional(),
    tags: baseTags,
    limit: baseLimit,
    // A7: pagination. Previously task_list had no offset, so with default limit 10
    // (max 100) any row beyond the first 100 was unreachable through the tool. Mirror
    // context_search's offset (z.number().int().min(0).optional()) so callers can page.
    offset: z.number().int().min(0).optional(),
    // STRICT-MODE SAFETY (task 5fd58eef): tasks.routes.handleList reads args.projectId
    // via resolveProjectId to scope the list — a REAL accepted-and-used param that was
    // missing from the schema. Under strict mode a legitimate project-scoped task_list
    // call (the retrievalErgonomics contract exercises exactly this) would be wrongly
    // rejected. Declare it (don't drop it) — declared == accepted == handler-reads.
    projectId: z.string().optional(),
    // SOFT-DELETE (task 7b28bed4): exclude archived tasks by default; includeArchived
    // reveals them. coercedBoolean() for the string-from-bridge boolean.
    includeArchived: coercedBoolean().optional()
  }),

  update: z.object({
    // Accepts a full UUID OR an 8+-hex short id (task 131ef054); resolved (project-scoped)
    // in the handler.
    taskId: uuidOrShortId(),
    status: taskStatusEnum.optional(),
    priority: taskPriorityEnum.optional(),
    // A5: assignees are free-form strings everywhere else (task_create / bulk_update)
    // and the `assigned_to` column is varchar(200), NOT a uuid FK. The prior
    // .uuid() here rejected every real (non-UUID) assignee. Align to a plain string.
    assignedTo: z.string().optional(),
    // A4: priority + progress are REAL columns on `tasks` and are now wired through
    // route→handler (they were previously accepted by zod but silently dropped — the
    // route forwarded only status/assignedTo/metadata). `notes` was REMOVED: there is
    // no `notes` column on `tasks`, so advertising it as an updatable field would be a
    // promise the handler cannot keep (don't advertise unsupported params).
    progress: z.number().int().min(0).max(100).optional(),
    // DRIFT-FIX (task 9c522977, nit 4): metadata is a REAL column (tasks.metadata jsonb)
    // and handleUpdate already forwards args.metadata into updateTaskStatus (which writes
    // it), but it was NEVER declared here → rejected under strict mode, so updating a
    // task's metadata through MCP was impossible. Declare it (baseMetadata, like
    // task_create / task_bulk_update) so the existing persist path is reachable.
    metadata: baseMetadata,
    // projectId scopes the SHORT-ID resolution of taskId to one project (task 131ef054).
    // Optional + not an updatable field, so it's excluded from the .refine "at least one
    // field to update" check below. Declared so strict mode accepts it.
    projectId: z.string().optional()
  }).refine(
    data => data.status !== undefined || data.priority !== undefined ||
            data.assignedTo !== undefined || data.progress !== undefined ||
            data.metadata !== undefined,
    { message: 'At least one field to update must be provided (status, priority, assignedTo, progress, metadata)' }
  ),

  bulk_update: z.object({
    // Each id accepts a full UUID OR an 8+-hex short id (task 131ef054); resolved
    // (project-scoped) in the handler before the atomic bulk update.
    task_ids: z.array(uuidOrShortId()).min(1).max(50),
    status: taskStatusEnum.optional(),
    assignedTo: z.string().optional(),
    priority: taskPriorityEnum.optional(),
    metadata: baseMetadata,
    // bulk_update's `notes` IS supported — the handler merges it into the metadata
    // jsonb column (see tasks.ts bulkUpdateTasks). Kept as-is (real, honored).
    notes: z.string().max(2000).optional(),
    projectId: z.string().optional()
  }),

  details: z.object({
    // Accepts a full UUID OR an 8+-hex short id (task 131ef054); resolved (project-scoped)
    // in the handler.
    taskId: uuidOrShortId(),
    projectId: z.string().optional()
  }),

  progress_summary: z.object({
    groupBy: z.enum(['phase', 'status', 'priority', 'type', 'assignedTo']).optional().default('phase'),
    projectId: z.string().optional()
  }),

  // SOFT-DELETE / ARCHIVE (task 7b28bed4): reversible cleanup. delete → archived_at=now();
  // restore → archived_at=NULL. Distinct from the `cancelled` STATUS (a lifecycle state):
  // archive removes a task from default listings entirely, reversibly. Accepts full UUID
  // or 8+-hex short id (resolved project-scoped in the handler).
  delete: z.object({
    taskId: uuidOrShortId(),
    projectId: z.string().optional()
  }),
  restore: z.object({
    taskId: uuidOrShortId(),
    projectId: z.string().optional()
  })
};

// Complexity Analysis Schemas
const complexitySchemas = {
  analyze: z.object({
    target: z.string().min(1),
    type: z.enum(['file', 'files', 'commit', 'function']),
    options: z.object({}).optional()
  }),
  insights: z.object({
    view: z.enum(['dashboard', 'hotspots', 'trends', 'debt', 'refactoring']),
    filters: z.record(z.any()).optional()
  }),
  manage: z.object({
    action: z.enum(['start_tracking', 'stop_tracking', 'get_alerts', 'acknowledge_alert', 'resolve_alert', 'set_thresholds', 'get_performance']),
    options: z.record(z.any()).optional()
  })
};

// Code Analysis Schemas
const codeSchemas = {
  analyze: z.object({
    filePath: z.string().min(1).max(1000),
    language: z.enum(['typescript', 'javascript', 'python', 'java', 'csharp']).optional()
  }),
  
  components: z.object({
    filePath: z.string().min(1).max(1000).optional()
  }),
  
  dependencies: z.object({
    filePath: z.string().min(1).max(1000).optional()
  }),
  
  impact: z.object({
    componentId: z.string().min(1).max(1000),
    changeType: z.enum(['modify', 'delete', 'rename']).optional()
  }),
  
  stats: z.object({})
};

// Smart Search & AI Recommendations Schemas
const smartSearchSchemas = {
  search: z.object({
    query: baseQuery,
    projectId: z.string().optional(),
    // includeTypes is the REAL source filter the handler honors (it checks
    // includeTypes.includes('context'|'decision'|'component')).
    includeTypes: z.array(z.string()).optional(),
    // DRIFT-FIX (task 9c522977): `scope` was DEPRECATED (removed). It was advertised but
    // NEVER forwarded/read by handleSmartSearch / smartSearchHandler.smartSearch — a
    // redundant, singular-form duplicate of includeTypes that additionally named sources
    // that no longer exist (naming registry dropped in migration 034; agent system removed
    // in migration 016). Removing it makes advertised == accepted == actually-works rather
    // than advertising a no-op that names phantom sources. Use includeTypes instead.
    limit: baseLimit
  }),

  recommendations: z.object({
    context: z.string().max(2000),
    projectId: z.string().optional(),
    type: z.enum(['naming', 'implementation', 'architecture', 'testing']).optional()
  })
};

// Session Management Schemas - DELETED (2025-10-24)
// Session MCP tools removed - sessions now auto-manage via SessionTracker service
// REST API endpoints at /api/v2/sessions/* handle UI analytics needs

// Main validation schema registry
// EXPORTED so toolDefinitions.ts can DERIVE the model-facing inputSchema from the
// same zod schema that actually gates the request — making the two physically
// impossible to diverge (the 3-layer schema-drift class fix). See toolDefinitions.ts.
export const validationSchemas = {
  // System Health (with backward compatibility aliases)
  mandrel_ping: aidisSystemSchemas.ping,
  mandrel_status: aidisSystemSchemas.status,
  mandrel_help: aidisSystemSchemas.help,
  mandrel_explain: aidisSystemSchemas.explain,
  mandrel_examples: aidisSystemSchemas.explain, // Same schema as explain - takes toolName parameter
  // Backward compatibility aliases
  aidis_ping: aidisSystemSchemas.ping,
  aidis_status: aidisSystemSchemas.status,
  aidis_help: aidisSystemSchemas.help,
  aidis_explain: aidisSystemSchemas.explain,
  aidis_examples: aidisSystemSchemas.explain,
  
  // Context Management
  context_store: contextSchemas.store,
  context_search: contextSchemas.search,
  context_get_recent: contextSchemas.get_recent,
  context_stats: contextSchemas.stats,
  // Soft-delete / archive (task 7b28bed4)
  context_delete: contextSchemas.delete,
  context_restore: contextSchemas.restore,
  
  // Project Management
  project_create: projectSchemas.create,
  project_update: projectSchemas.update,
  project_delete: projectSchemas.delete,
  project_switch: projectSchemas.switch,
  project_info: projectSchemas.info,
  project_list: projectSchemas.list,
  project_current: projectSchemas.current,
  project_insights: projectSchemas.insights,
  
  // Naming Registry
  naming_register: namingSchemas.register,
  naming_check: namingSchemas.check,
  naming_suggest: namingSchemas.suggest,
  naming_stats: namingSchemas.stats,
  
  // Technical Decisions
  decision_record: decisionSchemas.record,
  decision_search: decisionSchemas.search,
  decision_get: decisionSchemas.get,
  decision_update: decisionSchemas.update,
  decision_stats: decisionSchemas.stats,
  // Soft-delete / archive (task 7b28bed4)
  decision_delete: decisionSchemas.delete,
  decision_restore: decisionSchemas.restore,
  
  // Multi-Agent Coordination
  agent_register: agentSchemas.register,
  agent_list: agentSchemas.list,
  agent_status: agentSchemas.status,
  agent_join: agentSchemas.join,
  agent_leave: agentSchemas.leave,
  agent_sessions: agentSchemas.sessions,
  agent_message: agentSchemas.message,
  agent_messages: agentSchemas.messages,
  
  // Task Management
  task_create: taskSchemas.create,
  task_list: taskSchemas.list,
  task_update: taskSchemas.update,
  task_bulk_update: taskSchemas.bulk_update,
  task_details: taskSchemas.details,
  task_progress_summary: taskSchemas.progress_summary,
  // Soft-delete / archive (task 7b28bed4)
  task_delete: taskSchemas.delete,
  task_restore: taskSchemas.restore,
  
  // Complexity Analysis
  complexity_analyze: complexitySchemas.analyze,
  complexity_insights: complexitySchemas.insights,
  complexity_manage: complexitySchemas.manage,

  // Code Analysis
  code_analyze: codeSchemas.analyze,
  code_components: codeSchemas.components,
  code_dependencies: codeSchemas.dependencies,
  code_impact: codeSchemas.impact,
  code_stats: codeSchemas.stats,
  
  // Smart Search & AI Recommendations
  smart_search: smartSearchSchemas.search,
  get_recommendations: smartSearchSchemas.recommendations

  // Git Integration Tools - DELETED (C4, 2026-06-09)
  // 3 dormant git MCP tools (git_session_commits, git_commit_sessions,
  // git_correlate_session) removed; live gitTracker service retained.

  // Session Management - DELETED (2025-10-24)
  // 5 session tools removed - sessions auto-manage via SessionTracker service
};

/**
 * STRICT MODE (task 5fd58eef): the set of param names a tool's zod schema declares.
 * Unwraps the .refine()/.preprocess() wrappers (ZodEffects) to reach the underlying
 * ZodObject so refined schemas (context_search, *_update) report their real keyset.
 * One central derivation from the SAME zod schema that gates VALUES, so the advertised
 * inputSchema (additionalProperties:false), the declared keys here, and the value
 * validator can never drift apart. Returns null for a non-object schema (none today).
 */
function declaredKeys(schema: unknown): Set<string> | null {
  let s: any = schema;
  // Unwrap ZodEffects (refine/preprocess/transform) down to the inner object.
  while (s && s._def && s._def.typeName === 'ZodEffects') {
    s = s._def.schema;
  }
  if (s && s._def && s._def.typeName === 'ZodObject' && s.shape) {
    return new Set(Object.keys(s.shape));
  }
  return null;
}

/**
 * Validate MCP tool arguments using Zod schemas
 * @param toolName Name of the MCP tool
 * @param args Arguments to validate
 * @returns Validated arguments or throws validation error
 */
export function validateToolArguments(toolName: string, args: any) {
  // Temporarily bypass validation for complexity tools
  if (toolName.startsWith('complexity_')) {
    return args;
  }

  const schema = validationSchemas[toolName as keyof typeof validationSchemas];

  if (!schema) {
    throw new Error(`No validation schema found for tool: ${toolName}`);
  }

  // Normalize synonyms for decision tools (AI-friendly parameter names). This runs
  // BEFORE the strict-key check so legitimate AI synonyms (reasoning→rationale, etc.)
  // are mapped to canonical names and never tripped as "unknown params".
  if (toolName === 'decision_record' || toolName === 'decision_search' || toolName === 'decision_update') {
    args = normalizeDecisionSynonyms(toolName, args);
  }

  // STRICT-MODE ENFORCEMENT (task 5fd58eef): reject UNDECLARED params so the validator
  // matches the strict (additionalProperties:false) inputSchema the model is shown.
  // zod's .parse() silently STRIPS unknown keys (it doesn't reject them), which let the
  // advertised contract and the accepted contract drift; this closes that gap centrally.
  // Modeled as a ZodError so it flows through the SAME actionable-error formatter.
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    const allowed = declaredKeys(schema);
    if (allowed) {
      const unknownKeys = Object.keys(args).filter((k) => !allowed.has(k));
      if (unknownKeys.length > 0) {
        const zErr = new z.ZodError([
          {
            code: z.ZodIssueCode.unrecognized_keys,
            keys: unknownKeys,
            path: [],
            message: `Unrecognized key(s) in object: ${unknownKeys.map((k) => `'${k}'`).join(', ')}`,
          },
        ]);
        throw new Error(formatZodErrorMessage(toolName, zErr));
      }
    }
  }

  try {
    return schema.parse(args);
  } catch (error) {
    if (error instanceof z.ZodError) {
      // ACTIONABLE ERRORS (task 5fd58eef / 3a14aa4a): drive a self-correcting message
      // from the structured zod issues — field + allowed values/expected type + a
      // corrected-call EXAMPLE — at this CENTRAL seam (not 30 bespoke strings). The
      // "Validation failed for <tool>" prefix + field names are preserved so existing
      // contract assertions stay green.
      throw new Error(formatZodErrorMessage(toolName, error));
    }
    throw error;
  }
}

/**
 * Validation middleware for MCP requests
 * @param toolName Name of the MCP tool
 * @param args Arguments to validate
 */
export function validationMiddleware(toolName: string, args: any) {
  try {
    const validatedArgs = validateToolArguments(toolName, args);
    return {
      success: true,
      data: validatedArgs,
      error: null
    };
  } catch (error) {
    const err = error as Error;
    return {
      success: false,
      data: null,
      error: err.message
    };
  }
}

/**
 * Normalize AI-friendly synonym parameters to canonical names
 * Enables natural language parameter variations without breaking validation
 */
function normalizeDecisionSynonyms(toolName: string, args: any): any {
  const normalized = { ...args };

  if (toolName === 'decision_record') {
    // rationale synonyms
    if (args.reasoning && !args.rationale) normalized.rationale = args.reasoning;
    if (args.reason && !args.rationale) normalized.rationale = args.reason;
    if (args.why && !args.rationale) normalized.rationale = args.why;

    // impactLevel synonyms
    if (args.impact && !args.impactLevel) normalized.impactLevel = args.impact;
    if (args.severity && !args.impactLevel) normalized.impactLevel = args.severity;
    if (args.priority && !args.impactLevel) normalized.impactLevel = args.priority;

    // alternativesConsidered synonyms
    if (args.options && !args.alternativesConsidered) {
      normalized.alternativesConsidered = Array.isArray(args.options)
        ? args.options.map((opt: any) => typeof opt === 'string'
            ? { name: opt, reasonRejected: 'Not selected' }
            : opt)
        : args.options;
    }
    if (args.alternatives && !args.alternativesConsidered) {
      normalized.alternativesConsidered = args.alternatives;
    }
    if (args.choices && !args.alternativesConsidered) {
      normalized.alternativesConsidered = args.choices;
    }

    // Clean up synonyms from normalized object
    delete normalized.reasoning;
    delete normalized.reason;
    delete normalized.why;
    delete normalized.impact;
    delete normalized.severity;
    delete normalized.priority;
    delete normalized.options;
    delete normalized.alternatives;
    delete normalized.choices;
  }

  if (toolName === 'decision_update') {
    // Back-compat / AI-friendly synonyms for the learning-loop fields. The tool
    // previously advertised `outcome`/`lessons`; accept them (and a few natural
    // variants) and map to the canonical param names the handler reads.
    if (args.outcome && !args.outcomeNotes) normalized.outcomeNotes = args.outcome;
    if (args.notes && !args.outcomeNotes) normalized.outcomeNotes = args.notes;
    if (args.lessons && !args.lessonsLearned) normalized.lessonsLearned = args.lessons;
    if (args.outcome_status && !args.outcomeStatus) normalized.outcomeStatus = args.outcome_status;

    delete normalized.outcome;
    delete normalized.notes;
    delete normalized.lessons;
    delete normalized.outcome_status;
  }

  if (toolName === 'decision_search') {
    // decisionType synonyms
    if (args.type && !args.decisionType) normalized.decisionType = args.type;

    // impactLevel synonyms
    if (args.impact && !args.impactLevel) normalized.impactLevel = args.impact;
    if (args.severity && !args.impactLevel) normalized.impactLevel = args.severity;

    // Clean up synonyms
    delete normalized.type;
    delete normalized.impact;
    delete normalized.severity;
  }

  return normalized;
}

export default validationMiddleware;
