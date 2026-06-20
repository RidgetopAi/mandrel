/**
 * Retrieval Schema-Drift Contract Test (the permanent class guard)
 *
 * THE BUG (3-layer schema drift):
 *   The model-facing MCP `inputSchema` in config/toolDefinitions.ts did NOT match
 *   the zod validators in middleware/validation.ts (the REAL gatekeeper). zod uses
 *   .parse() — not .strict() — so any param the model sent that the validator did
 *   not declare was SILENTLY DROPPED. Retrieval tools shipped near-empty declared
 *   schemas (e.g. context_search advertised only id+query) while the validator
 *   accepted type, tags, limit, minSimilarity, offset, projectId, sessionId. The
 *   model literally could not see params that worked, and saw none it could trust.
 *
 * THE FIX (class fix, not instance):
 *   toolDefinitions.ts now DERIVES each retrieval tool's inputSchema from that
 *   tool's zod schema via zod-to-json-schema. The two layers are generated from one
 *   source and cannot diverge again. Human descriptions are an OVERLAY ONLY — they
 *   can never add/rename a param zod doesn't define.
 *
 * WHAT THIS PROVES (no DB needed — pure schema comparison):
 *   For every retrieval tool, the DECLARED inputSchema.properties keyset is EXACTLY
 *   the zod schema's top-level keyset. If anyone later edits a zod schema (adds a
 *   filter) or hand-edits a declared schema, this test goes RED — the drift class
 *   is permanently guarded at the gate.
 */

import { describe, test, expect } from 'vitest';
import { AIDIS_TOOL_DEFINITIONS } from '../config/toolDefinitions.js';
import { validationSchemas } from '../middleware/validation.js';

// The retrieval tools this tranche guards, with the exact param set the task
// specified must be visible to the model (== what the zod validator accepts).
const EXPECTED_PARAMS: Record<string, string[]> = {
  // context_store (tool-native linking, task 49ad7b4d): previously hard-coded to only
  // content/type/tags, hiding `metadata` (the keystone for structured back-links) +
  // relevanceScore/projectId/sessionId. Now DERIVED from zod, so the declared schema
  // advertises exactly the validated/accepted field set — and `metadata` is visible.
  context_store: ['content', 'type', 'tags', 'relevanceScore', 'metadata', 'projectId', 'sessionId'],
  context_search: ['id', 'query', 'type', 'tags', 'limit', 'minSimilarity', 'offset', 'projectId', 'sessionId'],
  // decision_search (learning-loop READ, task 13069495): `outcomeStatus` added — a
  // SEPARATE filter from `status` that filters the outcome_status column (how a
  // decision turned out), the moat-critical read for the GAP1 Evaluator.
  decision_search: ['query', 'limit', 'decisionType', 'status', 'outcomeStatus', 'impactLevel', 'component', 'tags', 'projectId', 'includeOutcome'],
  // decision_get (learning-loop READ, task 13069495): single-decision direct lookup
  // by full UUID, mirroring context_search's `id` idiom.
  decision_get: ['decisionId', 'projectId'],
  // Learning-loop wiring (task aff35ac1): decision_record/decision_update now DERIVE
  // their model-facing inputSchema from the zod validator, so the params the model
  // sees == the params the validator accepts == the params the handler reads.
  // decision_record (A1): outcome fields (outcomeStatus/outcomeNotes/lessonsLearned)
  // are now settable up front and persisted on create (mirroring implementationStatus),
  // so they join the advertised+accepted set.
  decision_record: ['decisionType', 'title', 'description', 'rationale', 'impactLevel',
    'alternativesConsidered', 'problemStatement', 'successCriteria', 'implementationStatus',
    'outcomeStatus', 'outcomeNotes', 'lessonsLearned',
    'affectedComponents', 'tags', 'projectId', 'metadata'],
  decision_update: ['decisionId', 'status', 'outcomeStatus', 'outcomeNotes', 'lessonsLearned',
    'implementationStatus', 'successCriteria', 'problemStatement', 'supersededBy', 'supersededReason'],
  // task_list (A7): `offset` added for pagination (rows beyond limit=100 were unreachable).
  // projectId (5fd58eef strict-mode safety): the handler (tasks.routes.handleList) reads
  // args.projectId via resolveProjectId to scope the list — a real accepted-and-used
  // param that was missing from the schema, so under strict mode a legitimate
  // project-scoped task_list call would have been wrongly rejected. Declared, not dropped.
  task_list: ['status', 'priority', 'assignedTo', 'type', 'tags', 'limit', 'offset', 'projectId'],
  // task_create (36aa0549): the model-facing schema previously advertised ONLY
  // `title`, hiding `type` (+ enum) and every other accepted field — so an agent
  // asked for a "bug" silently got a `general` task. Now DERIVED from zod, so the
  // declared schema advertises exactly the validated/accepted field set.
  task_create: ['title', 'description', 'type', 'priority', 'status', 'assignedTo', 'dependencies', 'tags', 'projectId', 'metadata'],
  // task_update (Guard 2 + A4/A5): now DERIVED from zod. Advertises priority/progress
  // (now real, written columns) + assignedTo; `notes` is intentionally ABSENT (no
  // such column — A4). Old hand-written schema hid all but taskId+status.
  task_update: ['taskId', 'status', 'priority', 'assignedTo', 'progress'],
  // task_bulk_update (Guard 2): now DERIVED from zod — every honored field is advertised.
  task_bulk_update: ['task_ids', 'status', 'assignedTo', 'priority', 'metadata', 'notes', 'projectId'],
  // project_* (A8): now DERIVED from zod so `metadata` (persisted by the handler) is
  // no longer hidden by a hand-written schema — boundary-drift class guard extended.
  project_create: ['name', 'description', 'status', 'gitRepoUrl', 'rootDirectory', 'metadata'],
  project_update: ['project', 'name', 'description', 'status', 'gitRepoUrl', 'rootDirectory', 'metadata'],
  project_delete: ['project', 'confirm'],
  project_switch: ['project'],
  project_info: ['project'],
  smart_search: ['query', 'projectId', 'includeTypes', 'scope', 'limit'],
  context_get_recent: ['limit', 'projectId'],
  get_recommendations: ['context', 'projectId', 'type'],
  task_details: ['taskId', 'projectId'],
};

/** Extract the top-level zod object key set (unwraps a ZodEffects/.refine wrapper). */
function zodKeys(schema: any): string[] {
  let s = schema;
  // ZodEffects (from .refine/.transform) holds the inner schema on _def.schema.
  while (s?._def?.schema) {
    s = s._def.schema;
  }
  const shape = s?.shape ?? s?._def?.shape?.();
  return shape ? Object.keys(shape) : [];
}

describe('retrieval schema-drift class guard (declared == zod)', () => {
  for (const [toolName, expected] of Object.entries(EXPECTED_PARAMS)) {
    test(`${toolName}: declared inputSchema == zod schema (and == spec)`, () => {
      const def = AIDIS_TOOL_DEFINITIONS.find(t => t.name === toolName);
      expect(def, `tool ${toolName} must be defined`).toBeDefined();

      const declaredKeys = Object.keys(def!.inputSchema.properties).sort();
      const zk = zodKeys((validationSchemas as any)[toolName]).sort();
      const exp = [...expected].sort();

      // 1. The zod schema must define exactly the spec param set.
      expect(zk, `zod keys for ${toolName}`).toEqual(exp);
      // 2. The declared (model-facing) schema must match the zod schema EXACTLY.
      //    This is the anti-drift assertion: generation keeps them identical.
      expect(declaredKeys, `declared keys for ${toolName}`).toEqual(zk);
    });
  }

  test('task_create now DECLARES the `type` param WITH its enum (the headline drift fix)', () => {
    const def = AIDIS_TOOL_DEFINITIONS.find(t => t.name === 'task_create')!;
    const props = def.inputSchema.properties as Record<string, any>;
    // The param the agent could not previously see.
    expect(Object.keys(props)).toContain('type');
    // The enum must be surfaced so the model knows 'bug' (etc.) is a legal value —
    // not just a free-form string it has to guess at.
    expect(props.type.enum).toEqual([
      'feature', 'bug', 'bugfix', 'refactor', 'test', 'review',
      'docs', 'documentation', 'devops', 'general',
    ]);
    // Only `title` is required; everything else (incl. type) is optional at the JSON layer.
    expect(def.inputSchema.required ?? []).toEqual(['title']);
  });

  test('context_store now DECLARES the `metadata` param (tool-native linking keystone)', () => {
    const def = AIDIS_TOOL_DEFINITIONS.find(t => t.name === 'context_store')!;
    const props = def.inputSchema.properties as Record<string, any>;
    // The param a context needed to carry STRUCTURED back-links (not just tags).
    expect(Object.keys(props)).toContain('metadata');
    // metadata is a jsonb object at the tool layer (zod z.record(z.any())).
    expect(props.metadata.type).toBe('object');
    // Only content+type are required; metadata (and the rest) stay optional.
    expect((def.inputSchema.required ?? []).sort()).toEqual(['content', 'type']);
  });

  test('context_search now DECLARES the `tags` param (the headline drift fix)', () => {
    const def = AIDIS_TOOL_DEFINITIONS.find(t => t.name === 'context_search')!;
    expect(Object.keys(def.inputSchema.properties)).toContain('tags');
    expect(def.inputSchema.properties.tags.type).toBe('array');
    // And no longer requires anything (id/query/tags are all optional at the JSON layer;
    // the "at least one of" rule lives in the zod .refine, exercised by the behavior test).
    expect(def.inputSchema.required ?? []).toEqual([]);
  });
});
