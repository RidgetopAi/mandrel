import { filterFindings, countBelowThreshold } from './filter-findings';
import { findingIdentity } from './finding-identity';
import type { FindingLike } from './types';
import { makeScan } from '../../views/__fixtures__/scan.fixture';

function finding(over: Partial<FindingLike> = {}): FindingLike {
  return {
    id: over.id ?? 'uuid-random',
    category: over.category ?? 'unused_export',
    level: over.level ?? 'warning',
    title: over.title ?? 'A finding',
    description: over.description ?? 'desc',
    affectedNodes: over.affectedNodes ?? ['file:a'],
    suggestion: over.suggestion ?? null,
    source: over.source ?? 'knip',
    confidence: over.confidence ?? 0.9,
    dismissible: over.dismissible ?? true,
  };
}

const NONE = new Set<string>();

describe('findingIdentity', () => {
  it('is stable regardless of the per-scan id and node ordering', () => {
    const a = finding({ id: 'uuid-1', affectedNodes: ['file:b', 'file:a'] });
    const b = finding({ id: 'uuid-2', affectedNodes: ['file:a', 'file:b'] });
    expect(findingIdentity(a)).toBe(findingIdentity(b));
  });

  it('differs when source/category/nodes differ', () => {
    const base = finding();
    expect(findingIdentity(base)).not.toBe(
      findingIdentity(finding({ source: 'surveyor' }))
    );
    expect(findingIdentity(base)).not.toBe(
      findingIdentity(finding({ category: 'large_file' }))
    );
    expect(findingIdentity(base)).not.toBe(
      findingIdentity(finding({ affectedNodes: ['file:z'] }))
    );
  });
});

describe('filterFindings — confidence threshold', () => {
  const findings = [
    finding({ category: 'a', confidence: 0.95 }),
    finding({ category: 'b', confidence: 0.5 }),
    finding({ category: 'c', confidence: 0.2 }),
  ];

  it('shows all at threshold 0', () => {
    const v = filterFindings(findings, { dismissedIds: NONE, minConfidence: 0 });
    expect(v).toHaveLength(3);
  });

  it('hides findings strictly below the threshold', () => {
    const v = filterFindings(findings, { dismissedIds: NONE, minConfidence: 0.5 });
    expect(v.map((x) => x.finding.category).sort()).toEqual(['a', 'b']);
  });

  it('countBelowThreshold matches what is hidden', () => {
    expect(countBelowThreshold(findings, 0.5)).toBe(1);
    expect(countBelowThreshold(findings, 0.96)).toBe(3);
    expect(countBelowThreshold(findings, 0)).toBe(0);
  });
});

describe('filterFindings — dismiss', () => {
  it('hides a dismissed finding by identity', () => {
    const f = finding({ category: 'unused_export', affectedNodes: ['file:a'] });
    const dismissed = new Set([findingIdentity(f)]);
    const v = filterFindings([f], { dismissedIds: dismissed, minConfidence: 0 });
    expect(v).toHaveLength(0);
  });

  it('keeps + flags a dismissed finding when showDismissed is true', () => {
    const f = finding();
    const dismissed = new Set([findingIdentity(f)]);
    const v = filterFindings([f], {
      dismissedIds: dismissed,
      minConfidence: 0,
      showDismissed: true,
    });
    expect(v).toHaveLength(1);
    expect(v[0]!.isDismissed).toBe(true);
  });

  it('a dismissal by identity hides the equivalent finding from a fresh scan (new uuid)', () => {
    const original = finding({ id: 'scan1-uuid', confidence: 0.9 });
    const dismissed = new Set([findingIdentity(original)]);
    // Same problem, re-scanned: different uuid, identical identity inputs.
    const reScanned = finding({ id: 'scan2-uuid', confidence: 0.9 });
    const v = filterFindings([reScanned], { dismissedIds: dismissed, minConfidence: 0 });
    expect(v).toHaveLength(0);
  });
});

describe('filterFindings — ordering', () => {
  it('sorts by severity desc, then confidence desc, then identity', () => {
    const findings = [
      finding({ category: 'i', level: 'info', confidence: 0.99 }),
      finding({ category: 'e', level: 'error', confidence: 0.5 }),
      finding({ category: 'w-hi', level: 'warning', confidence: 0.9 }),
      finding({ category: 'w-lo', level: 'warning', confidence: 0.6 }),
    ];
    const v = filterFindings(findings, { dismissedIds: NONE, minConfidence: 0 });
    expect(v.map((x) => x.finding.category)).toEqual(['e', 'w-hi', 'w-lo', 'i']);
  });
});

describe('filterFindings — real core warnings (fixture)', () => {
  it('accepts a core Warning[] structurally and respects dismissible/source/confidence', () => {
    const scan = makeScan();
    const v = filterFindings(scan.warnings, { dismissedIds: NONE, minConfidence: 0 });
    // cycle (warning, 0.95) ranks above large-file (info, 0.9)
    expect(v.map((x) => x.finding.category)).toEqual([
      'circular_dependency',
      'large_file',
    ]);
    expect(v[0]!.finding.source).toBe('dependency-cruiser');
    expect(v[1]!.finding.source).toBe('surveyor');
  });
});
