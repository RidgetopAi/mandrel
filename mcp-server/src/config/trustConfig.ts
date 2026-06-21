/**
 * TRUST MODEL v1 — the config (Mandrel Core Redesign T2b, task 20e71fca).
 *
 * THE MOAT (spec §4 Capability 3 + §8.1 "Trust model v1"): every recalled record carries
 * whether to TRUST it — blended from outcome-validated reliability (not age). This module
 * is the SINGLE home for every trust weight / threshold / half-life.
 *
 * STANDING PRINCIPLE (Brian, binds this + all future builds): NO HARDCODED VARIABLES.
 * Every knob the trust math touches lives HERE — a named value with a Brian-approved
 * default + a one-line doc comment + an env override — never a literal buried in the
 * trust service. This mirrors recallConfig.ts (T1) and edgeTypes.ts (T2a): the config is
 * the contract, the code reads it. The whole point of the model is that it is TUNABLE
 * (the eval gate can sweep any knob via env with zero code edit).
 *
 * Env reads happen at module load with a safe fallback (bad/missing → the default),
 * exactly like recallConfig.envInt and handlers/context.ts:envFloat.
 */

/** Read a finite-number env var, falling back to `fallback` on missing/garbage. */
function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
}

/** Read a positive-finite env var (e.g. a half-life in days), else `fallback`. */
function envPositive(name: string, fallback: number): number {
  const v = envFloat(name, fallback);
  return v > 0 ? v : fallback;
}

/** Read a positive-integer env var (e.g. a sample count), else `fallback`. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const v = Number(raw);
  return Number.isInteger(v) && v > 0 ? v : fallback;
}

/**
 * THE TRUST KNOBS (Brian-approved defaults, spec §8.1 "Trust model v1").
 *
 * A record's trust = a blend of an OUTCOME signal (the moat: did the work this record
 * informed actually pan out?) and a FRESHNESS signal (decays with age), capped by
 * SUPERSESSION / CONTRADICTION overrides, mapped to a 0–1 score → a band.
 *
 * Each field is env-overridable so the eval gate can sweep the model without a code edit.
 */
export interface TrustConfig {
  /**
   * weight_outcome — the OUTCOME signal's weight in the blend. Outcome DOMINATES: it is
   * the moat (loop-scored real reliability), so it carries the majority. Env:
   * MANDREL_TRUST_WEIGHT_OUTCOME. Default 0.6 (§8.1).
   */
  weightOutcome: number;
  /**
   * weight_freshness — the FRESHNESS signal's weight in the blend. Recency is the
   * secondary signal (and the SOLE signal at cold-start, before any outcome evidence
   * accrues). Env: MANDREL_TRUST_WEIGHT_FRESHNESS. Default 0.4 (§8.1).
   */
  weightFreshness: number;
  /**
   * freshness_halflife_days — the exponential-decay half-life (in days) for freshness:
   * freshness = 0.5^(age_days / halflife). At one half-life a record is at 0.5; at two,
   * 0.25. Env: MANDREL_TRUST_FRESHNESS_HALFLIFE_DAYS. Default 30 (§8.1).
   */
  freshnessHalflifeDays: number;
  /**
   * trusted_at — the score (inclusive) at/above which a record's band is `trusted`. Env:
   * MANDREL_TRUST_TRUSTED_AT. Default 0.66 (§8.1).
   */
  trustedAt: number;
  /**
   * stale_below — when the FRESHNESS (or, by extension, a freshness-starved score) is
   * BELOW this, the record is `stale` (old enough that it may no longer hold). Env:
   * MANDREL_TRUST_STALE_BELOW. Default 0.40 (§8.1).
   */
  staleBelow: number;
  /**
   * abstain_below — when the score is BELOW this, the AI should ABSTAIN from relying on
   * the record (too weak to trust). Also forced by supersession/contradiction. Env:
   * MANDREL_TRUST_ABSTAIN_BELOW. Default 0.40 (§8.1).
   */
  abstainBelow: number;
  /**
   * min_outcome_samples — the minimum number of COUNTED downstream outcomes required
   * before the outcome signal counts at all. Below this → outcome_score is NULL (no
   * evidence yet → cold-start `unproven`, NOT distrusted). Env:
   * MANDREL_TRUST_MIN_OUTCOME_SAMPLES. Default 1 (§8.1).
   */
  minOutcomeSamples: number;
}

/**
 * THE LIVE CONFIG — read once at module load. Defaults are the Brian-approved §8.1
 * "Trust model v1" values; every one is env-overridable for the eval sweep.
 */
export const TRUST_CONFIG: TrustConfig = {
  weightOutcome: envFloat('MANDREL_TRUST_WEIGHT_OUTCOME', 0.6),
  weightFreshness: envFloat('MANDREL_TRUST_WEIGHT_FRESHNESS', 0.4),
  freshnessHalflifeDays: envPositive('MANDREL_TRUST_FRESHNESS_HALFLIFE_DAYS', 30),
  trustedAt: envFloat('MANDREL_TRUST_TRUSTED_AT', 0.66),
  staleBelow: envFloat('MANDREL_TRUST_STALE_BELOW', 0.4),
  abstainBelow: envFloat('MANDREL_TRUST_ABSTAIN_BELOW', 0.4),
  minOutcomeSamples: envInt('MANDREL_TRUST_MIN_OUTCOME_SAMPLES', 1),
};

/**
 * The trust BANDS (spec §8.1). Ordered most→least trustworthy for display. A record's
 * band is its headline trust verdict; `abstain` is the separate "do not rely on this"
 * flag that rides ALONGSIDE the band (e.g. a `superseded` record always abstains).
 *
 * - trusted    — score ≥ trusted_at (proven reliable by downstream outcomes / fresh).
 * - ok         — between stale_below and trusted_at WITH outcome evidence (decent, not
 *                yet "trusted"-grade). [internal-but-real band; "unproven"/"stale" are
 *                the cold-start/age cases below.]
 * - unproven   — NO outcome evidence yet (cold-start) OR a weak blended score: NOT
 *                distrusted — "no outcome signal yet, lean on freshness, and say so".
 * - stale      — freshness/score below stale_below (old enough it may have gone invalid).
 * - superseded — a newer record replaced this one (override/cap → always abstain).
 * - contradicted — a live record asserts the opposite (override/cap → always abstain).
 *                  Detection is deferred to T4; the band + abstain mechanism exist now so
 *                  a future flag can set it.
 */
export const TRUST_BANDS = [
  'trusted',
  'ok',
  'unproven',
  'stale',
  'superseded',
  'contradicted',
] as const;
export type TrustBand = (typeof TRUST_BANDS)[number];

/** A compact human hint per band (emoji + word) for the text channel. */
export const TRUST_BAND_HINT: Record<TrustBand, string> = {
  trusted: '✅ trusted',
  ok: '🟢 ok',
  unproven: '🌱 unproven',
  stale: '🕸️ stale',
  superseded: '⛔ superseded',
  contradicted: '⚠️ contradicted',
};
