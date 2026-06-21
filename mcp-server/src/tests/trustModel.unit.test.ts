/**
 * TRUST MODEL v1 — pure-math unit tests (Mandrel Core Redesign T2b, task 20e71fca).
 *
 * Tests are armor (spec §6). This hammers the PURE trust math (computeTrust + the
 * aggregation/decay/mapping helpers) with the config INJECTED — no DB, no clock-of-record.
 * It locks every rule the moat depends on:
 *   - outcome aggregation, incl. too_early/unknown IGNORED (not counted as zero),
 *   - freshness exponential decay AT and AGAIN at the half-life,
 *   - supersession OVERRIDE (caps band/abstain even with perfect outcomes),
 *   - cold-start → `unproven`, NOT distrusted (the honesty nuance),
 *   - the abstain threshold,
 *   - the band boundaries (trusted_at / stale_below),
 *   - ADVERSARIAL: only-too_early downstream → unproven (not failed); contradicted → abstain.
 *
 * The §8.1 default config is reproduced here so the math is asserted against the
 * Brian-approved knobs explicitly; a couple of cases inject a custom config to prove
 * tunability (no-hardcoded-vars).
 */

import { describe, test, expect } from 'vitest';
// Import the PURE math core directly (trustModel.ts is DB-FREE by design — no db pool
// import) so this suite is deterministic + offline, zero database.
import {
  computeTrust,
  aggregateOutcome,
  freshnessFromAge,
  mapDecisionOutcome,
  mapTaskOutcome,
  type OutcomeSample,
  type TrustSignals,
} from '../services/trustModel.js';
import type { TrustConfig } from '../config/trustConfig.js';

/** The §8.1 Brian-approved defaults, fixed here so the math is asserted against them. */
const CFG: TrustConfig = {
  weightOutcome: 0.6,
  weightFreshness: 0.4,
  freshnessHalflifeDays: 30,
  trustedAt: 0.66,
  staleBelow: 0.4,
  abstainBelow: 0.4,
  minOutcomeSamples: 1,
};

const sig = (over: Partial<TrustSignals> = {}): TrustSignals => ({
  outcomes: [],
  ageDays: 0,
  superseded: false,
  contradicted: false,
  ...over,
});

const out = (value: number | null): OutcomeSample => ({ value, source: 'decision' });

describe('trust math — outcome mapping', () => {
  test('decision outcome mapping: successful=1, mixed=0.5, failed=0; too_early/unknown/null → null (IGNORED)', () => {
    expect(mapDecisionOutcome('successful')).toBe(1);
    expect(mapDecisionOutcome('mixed')).toBe(0.5);
    expect(mapDecisionOutcome('failed')).toBe(0);
    expect(mapDecisionOutcome('too_early')).toBeNull();
    expect(mapDecisionOutcome('unknown')).toBeNull();
    expect(mapDecisionOutcome(null)).toBeNull();
    expect(mapDecisionOutcome(undefined)).toBeNull();
  });

  test('task outcome mapping: completed=1, cancelled=0; in-flight statuses → null', () => {
    expect(mapTaskOutcome('completed')).toBe(1);
    expect(mapTaskOutcome('cancelled')).toBe(0);
    expect(mapTaskOutcome('in_progress')).toBeNull();
    expect(mapTaskOutcome('todo')).toBeNull();
    expect(mapTaskOutcome('blocked')).toBeNull();
  });
});

describe('trust math — outcome aggregation', () => {
  test('mean of counted outcomes; too_early (null) samples are NOT counted', () => {
    // two successes + one too_early(null) → mean over the TWO counted = 1.0, samples=2.
    const agg = aggregateOutcome([out(1), out(1), out(null)], CFG);
    expect(agg.samples).toBe(2);
    expect(agg.score).toBe(1);
  });

  test('mixed outcomes average correctly', () => {
    // successful(1) + failed(0) → mean 0.5 over 2 samples.
    const agg = aggregateOutcome([out(1), out(0)], CFG);
    expect(agg.score).toBe(0.5);
    expect(agg.samples).toBe(2);
  });

  test('below min_outcome_samples → score null (cold-start), samples reported', () => {
    // only a too_early downstream → 0 counted < min 1 → null score.
    const agg = aggregateOutcome([out(null)], CFG);
    expect(agg.score).toBeNull();
    expect(agg.samples).toBe(0);
    // empty → also null.
    expect(aggregateOutcome([], CFG).score).toBeNull();
  });

  test('min_outcome_samples is tunable (config injected) — needs 2 before counting', () => {
    const cfg2 = { ...CFG, minOutcomeSamples: 2 };
    expect(aggregateOutcome([out(1)], cfg2).score).toBeNull(); // 1 sample < 2
    expect(aggregateOutcome([out(1), out(1)], cfg2).score).toBe(1); // 2 samples ≥ 2
  });
});

describe('trust math — freshness decay', () => {
  test('freshness = 1.0 at age 0', () => {
    expect(freshnessFromAge(0, CFG)).toBeCloseTo(1.0, 10);
  });
  test('freshness = 0.5 AT the half-life (30d)', () => {
    expect(freshnessFromAge(30, CFG)).toBeCloseTo(0.5, 10);
  });
  test('freshness = 0.25 at TWO half-lives (60d)', () => {
    expect(freshnessFromAge(60, CFG)).toBeCloseTo(0.25, 10);
  });
  test('a future-dated (negative age) row is clamped to fresh (1.0), never > 1', () => {
    expect(freshnessFromAge(-10, CFG)).toBeCloseTo(1.0, 10);
  });
  test('half-life is tunable (config injected): 7d half-life → 0.5 at 7d', () => {
    expect(freshnessFromAge(7, { ...CFG, freshnessHalflifeDays: 7 })).toBeCloseTo(0.5, 10);
  });
});

describe('trust math — combine + band + abstain', () => {
  test('proven + fresh → trusted, NOT abstain', () => {
    // outcome 1.0, fresh (age 0 → freshness 1) → score = 0.6*1 + 0.4*1 = 1.0 ≥ trusted_at.
    const t = computeTrust(sig({ outcomes: [out(1)], ageDays: 0 }), CFG);
    expect(t.score).toBeCloseTo(1.0, 10);
    expect(t.band).toBe('trusted');
    expect(t.abstain).toBe(false);
    expect(t.outcome.score).toBe(1);
    expect(t.outcome.samples).toBe(1);
  });

  test('COLD-START (no outcome evidence) → unproven, NOT distrusted; leans on freshness', () => {
    // No outcomes, fresh → score = freshness (1.0). Band unproven (not trusted/stale),
    // outcome.score null, NOT abstain (fresh enough).
    const t = computeTrust(sig({ outcomes: [], ageDays: 0 }), CFG);
    expect(t.outcome.score).toBeNull();
    expect(t.outcome.samples).toBe(0);
    expect(t.score).toBeCloseTo(1.0, 10); // leans entirely on freshness
    expect(t.band).toBe('unproven');
    expect(t.abstain).toBe(false); // cold-start ≠ distrust
  });

  test('cold-start AND old → stale (freshness below stale_below), abstain', () => {
    // No outcomes, very old (90d ≫ half-life) → freshness ≈ 0.125 < stale_below → stale + abstain.
    const t = computeTrust(sig({ outcomes: [], ageDays: 90 }), CFG);
    expect(t.outcome.score).toBeNull();
    expect(t.band).toBe('stale');
    expect(t.abstain).toBe(true); // score 0.125 < abstain_below 0.4
  });

  test('SUPERSESSION OVERRIDES even a perfect outcome → band superseded + abstain', () => {
    const t = computeTrust(sig({ outcomes: [out(1)], ageDays: 0, superseded: true }), CFG);
    expect(t.band).toBe('superseded');
    expect(t.abstain).toBe(true);
    expect(t.superseded).toBe(true);
    // the blended score is still reported (informative), but the band/abstain are forced.
    expect(t.score).toBeCloseTo(1.0, 10);
  });

  test('CONTRADICTION OVERRIDES → band contradicted + abstain (mechanism present for T4)', () => {
    const t = computeTrust(sig({ outcomes: [out(1)], ageDays: 0, contradicted: true }), CFG);
    expect(t.band).toBe('contradicted');
    expect(t.abstain).toBe(true);
  });

  test('failed downstream + fresh → low score → abstain, band stale', () => {
    // outcome 0, fresh 1 → score = 0.6*0 + 0.4*1 = 0.4. 0.4 is NOT < stale_below(0.4) and
    // NOT < abstain_below(0.4) (strict <), so it sits right ON the boundary: not abstain,
    // not stale → 'ok'. Assert the boundary is handled as documented (strict <).
    const t = computeTrust(sig({ outcomes: [out(0)], ageDays: 0 }), CFG);
    expect(t.score).toBeCloseTo(0.4, 10);
    expect(t.abstain).toBe(false); // 0.4 is NOT < 0.4
    expect(t.band).toBe('ok');
  });

  test('failed downstream + slightly stale → below abstain → abstain', () => {
    // outcome 0, age 10d → freshness 0.5^(10/30)=~0.794 → score 0.4*0.794=~0.317 < 0.4.
    const t = computeTrust(sig({ outcomes: [out(0)], ageDays: 10 }), CFG);
    expect(t.score).toBeLessThan(0.4);
    expect(t.abstain).toBe(true);
    expect(t.band).toBe('stale');
  });

  test('band boundary: just ABOVE trusted_at → trusted; just BELOW → ok (with non-stale freshness)', () => {
    // Hold freshness fresh (age 0 → freshness 1, well above stale_below) and vary outcome
    // so the blended score straddles trusted_at (0.66). score = 0.6*o + 0.4*1 = 0.4 + 0.6o.
    //   o = 0.45 → score 0.67 (just above 0.66) → trusted.
    //   o = 0.42 → score 0.652 (just below)     → ok.
    const above = computeTrust(sig({ outcomes: [out(0.45)], ageDays: 0 }), CFG);
    expect(above.score).toBeGreaterThanOrEqual(CFG.trustedAt);
    expect(above.freshness).toBeGreaterThan(CFG.staleBelow);
    expect(above.band).toBe('trusted');

    const below = computeTrust(sig({ outcomes: [out(0.42)], ageDays: 0 }), CFG);
    expect(below.score).toBeLessThan(CFG.trustedAt);
    expect(below.score).toBeGreaterThanOrEqual(CFG.staleBelow); // not stale
    expect(below.band).toBe('ok');
  });

  test('an old record with GOOD past outcomes reads as stale (freshness gates it)', () => {
    // outcome 1 but very old (120d) → freshness 0.5^4 = 0.0625 < stale_below → stale.
    // Even a proven record goes stale with age (the whole point: trust decays by age too).
    const t = computeTrust(sig({ outcomes: [out(1)], ageDays: 120 }), CFG);
    expect(t.freshness).toBeLessThan(CFG.staleBelow);
    expect(t.band).toBe('stale');
  });

  test('weights are tunable (config injected): freshness-dominant config flips the blend', () => {
    // With weight_freshness 0.9 / weight_outcome 0.1, a failed-but-fresh record scores high.
    const cfg = { ...CFG, weightOutcome: 0.1, weightFreshness: 0.9 };
    const t = computeTrust(sig({ outcomes: [out(0)], ageDays: 0 }), cfg);
    // score = (0.1*0 + 0.9*1)/(1.0) = 0.9 → trusted under THIS config.
    expect(t.score).toBeCloseTo(0.9, 10);
    expect(t.band).toBe('trusted');
  });
});

describe('trust math — ADVERSARIAL', () => {
  test('only too_early downstream → unproven, NOT failed (no evidence ≠ a zero)', () => {
    // Three too_early downstream outcomes — all ignored → 0 counted → cold-start unproven.
    const t = computeTrust(sig({ outcomes: [out(null), out(null), out(null)], ageDays: 0 }), CFG);
    expect(t.outcome.samples).toBe(0);
    expect(t.outcome.score).toBeNull();
    expect(t.band).toBe('unproven'); // crucially NOT 'stale' (fresh) and NOT a failed/low band
    expect(t.abstain).toBe(false);
  });

  test('superseded record with GOOD outcomes still abstains (override wins)', () => {
    const t = computeTrust(
      sig({ outcomes: [out(1), out(1), out(0.5)], ageDays: 0, superseded: true }),
      CFG
    );
    expect(t.band).toBe('superseded');
    expect(t.abstain).toBe(true);
  });

  test('record with no edges (no outcomes) → unproven, never an error or distrust', () => {
    const t = computeTrust(sig({ outcomes: [], ageDays: 5 }), CFG);
    expect(t.outcome.score).toBeNull();
    expect(['unproven', 'stale']).toContain(t.band); // fresh-ish → unproven
    expect(t.band).toBe('unproven');
  });
});
