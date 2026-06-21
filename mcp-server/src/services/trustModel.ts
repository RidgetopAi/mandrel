/**
 * TRUST MODEL v1 — the PURE math core (Mandrel Core Redesign T2b, task 20e71fca). THE MOAT.
 *
 * This module is DB-FREE on purpose. It holds the trust SIGNAL TYPES + the pure functions
 * that turn gathered signals into a Trust object:
 *   - computeTrust()      — signals + injected TrustConfig → Trust (band/score/abstain).
 *   - aggregateOutcome()  — mean of counted downstream outcomes (too_early/unknown ignored).
 *   - freshnessFromAge()  — exponential decay by age (0.5^(age/halflife)).
 *   - mapDecisionOutcome()/mapTaskOutcome() — ground-truth status → [0,1] | null.
 *
 * Keeping the math here (no `pg` / no db pool import) means the unit tests hammer it with
 * the config INJECTED and ZERO database — deterministic, offline, fast. The DB/graph
 * signal-GATHERING lives in services/trust.ts, which imports these. (Lesson 011: one
 * definition of the rule, testable in isolation.)
 */

import {
  TRUST_CONFIG,
  type TrustConfig,
  type TrustBand,
} from '../config/trustConfig.js';

/** One downstream ground-truth outcome, already mapped to [0,1] (or null = ignored). */
export interface OutcomeSample {
  /** The mapped outcome value in [0,1], or null when this signal must be IGNORED
   *  (too_early / unknown decision outcome — no evidence, not a zero). */
  value: number | null;
  /** Where it came from (for observability / tests). */
  source: 'decision' | 'task';
}

/** The raw signals computeTrust() blends — gathered by trustForRecord(), or hand-built
 *  by a unit test. Keeping this a plain data bag is what makes the math unit-testable. */
export interface TrustSignals {
  /** Mapped downstream outcomes (decision/task). too_early/unknown are NOT in here. */
  outcomes: OutcomeSample[];
  /** The record's own age in days (>= 0). Negative is clamped to 0 (future-dated row). */
  ageDays: number;
  /** True if a `supersedes` edge points AT this record, or decision.superseded_by is set. */
  superseded: boolean;
  /** True if the record is flagged contradicted. T4 sets this; T2b only honors it. */
  contradicted: boolean;
}

/** The computed trust object surfaced per record (spec §4 / §8.1 output shape). */
export interface Trust {
  /** Headline verdict band. */
  band: TrustBand;
  /** Blended 0–1 score, or null at cold-start (no outcome evidence → unproven). */
  score: number | null;
  /** The outcome sub-signal. */
  outcome: {
    /** Mean of COUNTED outcomes in [0,1], or null when < min_outcome_samples. */
    score: number | null;
    /** How many outcomes were COUNTED (too_early/unknown excluded). */
    samples: number;
  };
  /** The freshness sub-signal in [0,1] (0.5^(age/halflife)). */
  freshness: number;
  /** Whether a newer record supersedes this one (override → abstain). */
  superseded: boolean;
  /** The AI should NOT rely on this record (low score OR superseded OR contradicted). */
  abstain: boolean;
}

/**
 * FRESHNESS — exponential decay by age. freshness = 0.5^(age_days / halflife_days).
 * At age 0 → 1.0; at one half-life → 0.5; at two → 0.25. Age is clamped to >= 0 so a
 * future-dated row never reads as MORE than fresh. Pure; halflife injected via config.
 */
export function freshnessFromAge(ageDays: number, config: TrustConfig): number {
  const age = Math.max(0, ageDays);
  const hl = config.freshnessHalflifeDays; // config guarantees > 0
  return Math.pow(0.5, age / hl);
}

/**
 * OUTCOME aggregation — mean of the COUNTED downstream outcomes.
 *
 * Counts only samples with a non-null mapped value (too_early/unknown were already
 * dropped to null by the gatherer / the mapper). If the count is BELOW
 * min_outcome_samples → returns { score: null, samples } so the record reads as
 * cold-start `unproven` (NO evidence yet), NOT distrusted. Pure; config injected.
 */
export function aggregateOutcome(
  outcomes: OutcomeSample[],
  config: TrustConfig
): { score: number | null; samples: number } {
  const counted = outcomes.filter((o) => o.value !== null) as { value: number }[];
  const samples = counted.length;
  if (samples < config.minOutcomeSamples) {
    return { score: null, samples };
  }
  const mean = counted.reduce((acc, o) => acc + o.value, 0) / samples;
  return { score: mean, samples };
}

/** Map a decision.outcome_status to a [0,1] value, or null when it must be IGNORED. */
export function mapDecisionOutcome(status: string | null | undefined): number | null {
  switch (status) {
    case 'successful':
      return 1;
    case 'mixed':
      return 0.5;
    case 'failed':
      return 0;
    // too_early / unknown / null → NO evidence → ignored (not a zero).
    default:
      return null;
  }
}

/** Map a task.status to a [0,1] value, or null when it doesn't carry an outcome yet.
 *  Secondary signal: only completed/cancelled are ground-truth; the rest are in-flight. */
export function mapTaskOutcome(status: string | null | undefined): number | null {
  switch (status) {
    case 'completed':
      return 1;
    case 'cancelled':
      return 0;
    default:
      return null;
  }
}

/**
 * THE PURE TRUST MATH (spec §8.1). Gathered signals + injected config → Trust object.
 *
 * Order of operations (overrides BEFORE blend, per spec "overrides (caps), not blends"):
 *   1. SUPERSESSION / CONTRADICTION cap: if superseded → band=superseded, abstain=true,
 *      regardless of score. If contradicted → band=contradicted, abstain=true. (Supersession
 *      wins if somehow both; it's the concrete T2b case.) Score is still reported (the
 *      blended value is informative) but the band/abstain are forced.
 *   2. OUTCOME: aggregate downstream outcomes → outcome_score (or null = cold-start).
 *   3. FRESHNESS: 0.5^(age/halflife).
 *   4. COMBINE:
 *        - outcome_score NULL → COLD-START: score = freshness alone (lean on freshness),
 *          band = `unproven` unless freshness is so low it's `stale`. NOT distrusted.
 *        - else score = (w_o*outcome + w_f*freshness) / (w_o + w_f)   [renormalized].
 *   5. BAND: superseded/contradicted handled in (1). Else, in order:
 *        - freshness < stale_below OR score < stale_below → stale (too old to trust)
 *        - outcome_score NULL                          → unproven (COLD-START — never
 *          `trusted`, regardless of how fresh: "trusted" REQUIRES outcome evidence. A
 *          fresh-but-unproven record can have a HIGH score but the band stays unproven so
 *          the AI knows it lacks validation. NOT distrusted — abstain stays false if fresh.)
 *        - score >= trusted_at                         → trusted (has outcome evidence)
 *        - else                                        → ok
 *   6. ABSTAIN = score < abstain_below OR superseded OR contradicted.
 */
export function computeTrust(signals: TrustSignals, config: TrustConfig = TRUST_CONFIG): Trust {
  const outcome = aggregateOutcome(signals.outcomes, config);
  const freshness = freshnessFromAge(signals.ageDays, config);

  // COMBINE → blended score.
  let score: number;
  if (outcome.score === null) {
    // COLD-START: no outcome evidence → lean entirely on freshness.
    score = freshness;
  } else {
    const wo = config.weightOutcome;
    const wf = config.weightFreshness;
    const denom = wo + wf;
    // Guard a degenerate all-zero weight config: fall back to a plain mean so we never
    // divide by zero (config is the contract, but be defensive).
    score = denom > 0 ? (wo * outcome.score + wf * freshness) / denom : (outcome.score + freshness) / 2;
  }

  // OVERRIDES (caps) take precedence for band + abstain.
  const overridden: TrustBand | null = signals.superseded
    ? 'superseded'
    : signals.contradicted
    ? 'contradicted'
    : null;

  let band: TrustBand;
  if (overridden) {
    band = overridden;
  } else if (freshness < config.staleBelow || score < config.staleBelow) {
    // Too old (or too weak) to lean on → stale, regardless of outcome evidence.
    band = 'stale';
  } else if (outcome.score === null) {
    // COLD-START: no outcome evidence yet → `unproven`, NEVER `trusted` (trusted requires
    // demonstrated outcomes). Honest: a fresh record can have a high freshness-driven score
    // but it has not been validated by what it informed. NOT distrusted (abstain false if fresh).
    band = 'unproven';
  } else if (score >= config.trustedAt) {
    band = 'trusted';
  } else {
    band = 'ok';
  }

  const abstain = score < config.abstainBelow || signals.superseded || signals.contradicted;

  return {
    band,
    // Score is always meaningful to report; only the COLD-START outcome sub-signal is null.
    score,
    outcome,
    freshness,
    superseded: signals.superseded,
    abstain,
  };
}
