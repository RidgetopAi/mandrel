/**
 * Single source of truth for the Mandrel MCP server's RUNTIME version.
 *
 * WHY THIS FILE EXISTS
 *   The product version a connecting agent sees (MCP `initialize` serverInfo),
 *   the health endpoints, the HTTP `/healthz` service banner, and the
 *   `mandrel_status` tool MUST all report the SAME number — and that number
 *   must be the ONE fact in `mcp-server/package.json`'s `version` field. We had
 *   the classic duplication disease: that fact was hand-copied into many places
 *   that drifted ('0.1.0-hardened', '1.0.0-core', etc.) and silently diverged
 *   from the package/tag. This module collapses all of that into ONE accessor.
 *
 *   Import `MANDREL_VERSION` (or call `getMandrelVersion()`) anywhere a runtime
 *   version string is needed. Never hard-code a version string again — the
 *   code-health "version sanity" check and a unit test both fail CI on re-drift.
 *
 * HOW IT RESOLVES package.json (ESM + compiled dist, robustly)
 *   This file compiles to `dist/version.js`. `package.json` lives at the
 *   mcp-server package root, i.e. one directory ABOVE `dist/` (`dist/../package.json`).
 *   The SAME `../package.json` relationship holds for the SOURCE layout
 *   (`src/version.ts` -> `src/../package.json`), so a single relative path works
 *   for both tsx-run source and compiled dist.
 *
 *   We deliberately avoid a static `import pkg from '../package.json'` (JSON
 *   import-assertion syntax is brittle across the TS/Node/ESM matrix and can pull
 *   package.json INTO the dist bundle layout). Instead we resolve and read the
 *   file at runtime via `createRequire(import.meta.url)` anchored to THIS module's
 *   own URL, then read+parse it with `fs`. That is layout-correct for both
 *   `src/version.ts` (tsx) and `dist/version.js` (node), and is what the test +
 *   the dist proof exercise.
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

interface PackageJsonShape {
  version?: unknown;
}

/**
 * Resolve and read the package's own version field at runtime.
 * Anchored to this module's URL so it is correct from BOTH src/ and dist/.
 * Fails LOUD (throws) if the version cannot be determined — a missing/blank
 * version is a real defect we want surfaced, never a silent fallback string.
 */
function resolvePackageVersion(): string {
  const require = createRequire(import.meta.url);
  // ../package.json relative to this module (src/version.ts OR dist/version.js).
  const pkgPath = require.resolve('../package.json');
  const raw = readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(raw) as PackageJsonShape;
  const version = pkg.version;
  if (typeof version !== 'string' || version.trim() === '') {
    throw new Error(
      `[version] mcp-server/package.json has no usable "version" field (resolved: ${pkgPath})`,
    );
  }
  return version;
}

/** The runtime product version, derived once at module load from package.json. */
export const MANDREL_VERSION: string = resolvePackageVersion();

/** Accessor form, for callers that prefer a function. Returns the same value. */
export function getMandrelVersion(): string {
  return MANDREL_VERSION;
}
