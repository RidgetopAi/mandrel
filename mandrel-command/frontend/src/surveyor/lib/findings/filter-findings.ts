/**
 * Pure findings selection: given the raw findings plus the user's dismissed-set
 * and confidence threshold, produce the ordered list the panel renders.
 *
 * Kept free of React/DOM/localStorage so it is exhaustively unit-testable.
 */
import { LEVEL_RANK, type FindingLevel } from '../../config/findings.config';
import { findingIdentity } from './finding-identity';
import type { FindingLike } from './types';

export interface FilterOptions {
  /** Stable identities (see `findingIdentity`) the user has dismissed. */
  dismissedIds: ReadonlySet<string>;
  /** Hide findings whose confidence is strictly below this (0..1). */
  minConfidence: number;
  /** When true, dismissed findings are shown (flagged) instead of hidden. */
  showDismissed?: boolean;
}

export interface VisibleFinding<T extends FindingLike = FindingLike> {
  finding: T;
  identity: string;
  isDismissed: boolean;
}

function levelRank(level: string): number {
  return LEVEL_RANK[level as FindingLevel] ?? 0;
}

/**
 * Filter + sort findings.
 *
 * - Drops findings below `minConfidence`.
 * - Drops dismissed findings unless `showDismissed` (then they're kept + flagged).
 * - Sorts by severity (error > warning > info), then confidence desc, then a
 *   stable identity tiebreak so the order is deterministic.
 */
export function filterFindings<T extends FindingLike>(
  findings: readonly T[],
  options: FilterOptions
): VisibleFinding<T>[] {
  const { dismissedIds, minConfidence, showDismissed = false } = options;

  const visible: VisibleFinding<T>[] = [];
  for (const finding of findings) {
    if (finding.confidence < minConfidence) continue;
    const identity = findingIdentity(finding);
    const isDismissed = dismissedIds.has(identity);
    if (isDismissed && !showDismissed) continue;
    visible.push({ finding, identity, isDismissed });
  }

  visible.sort((a, b) => {
    const rank = levelRank(b.finding.level) - levelRank(a.finding.level);
    if (rank !== 0) return rank;
    const conf = b.finding.confidence - a.finding.confidence;
    if (conf !== 0) return conf;
    return a.identity.localeCompare(b.identity);
  });

  return visible;
}

/** Count of findings currently hidden by the confidence threshold. */
export function countBelowThreshold(
  findings: readonly FindingLike[],
  minConfidence: number
): number {
  return findings.reduce(
    (n, f) => (f.confidence < minConfidence ? n + 1 : n),
    0
  );
}
