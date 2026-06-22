/**
 * helpCatalog.contract.test.ts — catalog-drift guard for mandrel_help (task 43aa8c03).
 *
 * THE BUG CLASS this locks shut:
 *   mandrel_help used to render from a SECOND, hand-maintained catalog inside
 *   handlers/navigation.ts (`this.toolCatalog`), separate from AIDIS_TOOL_DEFINITIONS
 *   (the registry the MCP tools/list actually advertises). The two drifted: help
 *   reported 36 tools and OMITTED 8 real, working tools (context_update + the
 *   linking/thread tools). Two hand-kept lists of "what tools exist" inevitably
 *   diverge. The fix derives help's groups, tool list, AND counts from a SINGLE source
 *   (AIDIS_TOOL_DEFINITIONS + TOOL_CATEGORIES). These guards keep it permanent.
 *
 * THE GUARDS (all deterministic, DB-free):
 *   G1 — EVERY tool in AIDIS_TOOL_DEFINITIONS is categorized exactly once
 *        (categoryForTool resolves it; no tool maps to two categories; no phantom
 *        category entries reference a non-existent tool).
 *   G2 — EVERY tool in AIDIS_TOOL_DEFINITIONS appears in mandrel_help's RENDERED text.
 *   G3 — the count mandrel_help prints == AIDIS_TOOL_DEFINITIONS.length (not hardcoded),
 *        and the category count it prints == the number of categories actually rendered.
 *   G4 — the 8 previously-OMITTED tools are present (regression vector for the exact bug).
 *   G5 — mandrel_explain resolves EVERY tool (incl. the new ones) and prints a category
 *        line sourced from the same single source.
 *   G6 — mandrel_examples never claims a registered tool "not found"; a tool without a
 *        curated example degrades to a graceful pointer to mandrel_explain (no error).
 */

import { describe, test, expect } from 'vitest';

import {
  AIDIS_TOOL_DEFINITIONS,
  CATEGORY_ORDER,
  TOOL_CATEGORIES,
  categoryForTool,
} from '../config/toolDefinitions.js';
import { navigationHandler } from '../handlers/navigation.js';

/** Flatten a tool response's text channel. */
function textOf(resp: any): string {
  return resp?.content?.map((c: any) => c.text).join('\n') ?? '';
}

// The exact 8 tools the drifted hardcoded catalog OMITTED — the regression vector.
const PREVIOUSLY_OMITTED = [
  'context_update',
  'link',
  'unlink',
  'get_links',
  'recall_thread',
  'thread_set',
  'thread_current',
  'thread_clear',
];

describe('mandrel_help catalog is derived from a single source (no drift)', () => {
  // ── G1: every tool categorized exactly once ──────────────────────────────────
  test('G1: every defined tool maps to EXACTLY ONE category', () => {
    // Each tool resolves to a category.
    const uncategorized = AIDIS_TOOL_DEFINITIONS
      .filter((d) => categoryForTool(d.name) === undefined)
      .map((d) => d.name);
    expect(
      uncategorized,
      `these tools have no category (would vanish from mandrel_help): ${uncategorized.join(', ')}`
    ).toEqual([]);

    // No tool appears in two categories, and no category lists a phantom tool.
    const defNames = new Set(AIDIS_TOOL_DEFINITIONS.map((d) => d.name));
    const seen = new Map<string, string>();
    for (const category of CATEGORY_ORDER) {
      for (const name of TOOL_CATEGORIES[category]) {
        expect(defNames.has(name), `category '${category}' lists phantom tool '${name}'`).toBe(true);
        expect(seen.has(name), `tool '${name}' categorized twice`).toBe(false);
        seen.set(name, category);
      }
    }
    // The category map covers exactly the defined tool set (sizes agree).
    expect(seen.size).toBe(AIDIS_TOOL_DEFINITIONS.length);
  });

  // ── G2: every tool is RENDERED in mandrel_help ───────────────────────────────
  test('G2: mandrel_help renders EVERY tool in AIDIS_TOOL_DEFINITIONS', async () => {
    const text = textOf(await navigationHandler.getHelp());
    const missing = AIDIS_TOOL_DEFINITIONS
      .map((d) => d.name)
      .filter((name) => !text.includes(`**${name}**`));
    expect(
      missing,
      `mandrel_help did not render these tools (catalog drift): ${missing.join(', ')}`
    ).toEqual([]);
  });

  // ── G3: counts are derived, not hardcoded ────────────────────────────────────
  test('G3: the printed tool count == AIDIS_TOOL_DEFINITIONS.length and category count matches', async () => {
    const text = textOf(await navigationHandler.getHelp());
    const expectedTools = AIDIS_TOOL_DEFINITIONS.length;
    const expectedCategories = CATEGORY_ORDER.length;

    // Header: "**N Tools Available Across M Categories:**"
    const header = text.match(/\*\*(\d+) Tools Available Across (\d+) Categories:\*\*/);
    expect(header, 'mandrel_help header with counts must be present').toBeTruthy();
    expect(Number(header![1]), 'printed tool count').toBe(expectedTools);
    expect(Number(header![2]), 'printed category count').toBe(expectedCategories);

    // Cross-check: the per-category "(K tools)" headers sum to the total.
    const perCategory = [...text.matchAll(/^## .+ \((\d+) tools\)$/gm)].map((m) => Number(m[1]));
    expect(perCategory.length, 'one header per category').toBe(expectedCategories);
    expect(perCategory.reduce((a, b) => a + b, 0), 'per-category counts sum to total').toBe(expectedTools);
  });

  // ── G4: the previously-omitted tools are present (exact regression vector) ────
  test('G4: the 8 previously-omitted core tools now appear in mandrel_help', async () => {
    const text = textOf(await navigationHandler.getHelp());
    for (const name of PREVIOUSLY_OMITTED) {
      expect(
        AIDIS_TOOL_DEFINITIONS.some((d) => d.name === name),
        `${name} must exist in the registry (test vector sanity)`
      ).toBe(true);
      expect(text.includes(`**${name}**`), `mandrel_help must render ${name}`).toBe(true);
    }
  });

  // ── G5: mandrel_explain resolves every tool, with a single-source category ───
  test('G5: mandrel_explain resolves EVERY tool and prints its single-source category', async () => {
    for (const def of AIDIS_TOOL_DEFINITIONS) {
      const resp = await navigationHandler.explainTool({ toolName: def.name });
      const text = textOf(resp);
      expect(text, `${def.name} should resolve`).not.toContain('not found');
      const category = categoryForTool(def.name);
      expect(text, `${def.name} explain must show its category`).toContain(`**Category:** ${category}`);
    }
  });

  // ── G6: mandrel_examples never disowns a registered tool ─────────────────────
  test('G6: mandrel_examples never reports a registered tool as "not found"', async () => {
    for (const def of AIDIS_TOOL_DEFINITIONS) {
      const text = textOf(await navigationHandler.getExamples({ toolName: def.name }));
      expect(text, `${def.name} must not be reported missing`).not.toContain('not found');
      // Either curated examples ("Examples for X") OR a graceful pointer ("No examples ...").
      const ok = text.includes(`Examples for ${def.name}`) || text.includes('No examples available yet');
      expect(ok, `${def.name} examples should render or degrade gracefully`).toBe(true);
    }
  });

  test('G6b: an unknown tool still errors, listing available tools from the single source', async () => {
    const text = textOf(await navigationHandler.getExamples({ toolName: 'definitely_not_a_tool' }));
    expect(text).toContain('not found');
    // The "available tools" list is sourced from the registry — a sample real tool is present.
    expect(text).toContain('context_store');
  });
});
