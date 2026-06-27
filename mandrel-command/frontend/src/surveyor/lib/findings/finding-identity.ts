/**
 * Stable identity for a finding, independent of the per-scan `Warning.id`.
 *
 * `Warning.id` is a `uuidv4()` minted fresh on every scan, so it CANNOT key a
 * dismissal that must survive a re-scan. The durable identity of a finding is
 * "the same problem about the same code from the same tool": its `source`,
 * `category`, and the set of nodes it affects. File node ids are deterministic
 * (`file:<relativePath>`), so this key is stable across scans of the same tree.
 */
import type { FindingLike } from './types';

export function findingIdentity(
  finding: Pick<FindingLike, 'source' | 'category' | 'affectedNodes'>
): string {
  const nodes = [...finding.affectedNodes].sort().join(',');
  return `${finding.source}|${finding.category}|${nodes}`;
}
