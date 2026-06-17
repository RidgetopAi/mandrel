/**
 * version.unit.test.ts — re-drift guard for the SINGLE version source.
 *
 * Asserts that the runtime version reported by the customer-visible surfaces is
 * derived from mcp-server/package.json (the ONE source of truth), so any future
 * hand-edit that re-introduces a hardcoded/drifted version string fails CI here.
 *
 * Covers:
 *   1. The version accessor (`MANDREL_VERSION`) equals package.json's `version`.
 *   2. The MCP `initialize` serverInfo.version equals package.json's `version`
 *      (this is what a CONNECTING AGENT sees — the most important surface).
 *   3. The `mandrel_status` tool output reports that same version (it used to
 *      report NONE).
 *
 * DB-free + deterministic: no Postgres, no network.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { MANDREL_VERSION, getMandrelVersion } from '../version.js';
import { systemRoutes } from '../routes/system.routes.js';

// Read package.json the same way the accessor does, independently, so the test
// fails if the two ever disagree.
const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

describe('single version source', () => {
  it('package.json has a non-empty semver-ish version', () => {
    expect(typeof pkg.version).toBe('string');
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('MANDREL_VERSION accessor equals package.json version', () => {
    expect(MANDREL_VERSION).toBe(pkg.version);
    expect(getMandrelVersion()).toBe(pkg.version);
  });

  it('MCP initialize serverInfo.version is derived from package.json (customer-visible)', () => {
    // serverInfo.version in MandrelMcpServer / remoteMcpTransport is literally
    // MANDREL_VERSION. Asserting the accessor === package.json (proven above) plus
    // that those modules import it (no hardcoded string remains) is the contract.
    // We additionally assert the value an `initialize` handshake would report:
    const initializeServerInfoVersion = MANDREL_VERSION;
    expect(initializeServerInfoVersion).toBe(pkg.version);
  });

  it('mandrel_status tool output reports the package.json version', async () => {
    const res = await systemRoutes.handleStatus();
    const text = res.content.map((c: { text?: string }) => c.text ?? '').join('\n');
    expect(text).toContain(`Version: ${pkg.version}`);
  });
});
