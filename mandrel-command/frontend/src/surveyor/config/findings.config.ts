/**
 * Findings (warnings) presentation config — configs-not-hardcoded.
 *
 * Single source for: the default confidence-threshold filter, the severity
 * ranking used to sort findings, and the per-SOURCE badge palette/labels. The
 * FindingsPanel and the pure findings logic read from here instead of inlining
 * thresholds, hex colors, or source strings.
 */

import { COLORS } from './colors';

/** Wire values of `WarningSource` (mirrors the core enum; types-only import). */
export type FindingSource = 'surveyor' | 'knip' | 'dependency-cruiser';

/** Wire values of `WarningLevel` (mirrors the core enum). */
export type FindingLevel = 'info' | 'warning' | 'error';

export interface SourceBadgeStyle {
  label: string;
  /** Hex accent color for the badge. */
  color: string;
}

/**
 * Per-source badge styling. Keyed by the serialized `WarningSource` value so a
 * finding can be rendered straight from the wire payload.
 */
export const SOURCE_BADGES: Record<FindingSource, SourceBadgeStyle> = {
  knip: {
    label: 'knip',
    color: '#a78bfa',
  },
  'dependency-cruiser': {
    label: 'dep-cruiser',
    color: '#60a5fa',
  },
  surveyor: {
    label: 'surveyor',
    color: COLORS.status.healthy,
  },
} as const;

/** Fallback badge for an unrecognized source (forward-compatible). */
export const UNKNOWN_SOURCE_BADGE: SourceBadgeStyle = {
  label: 'other',
  color: COLORS.text.muted,
};

/**
 * Severity ranking — higher rank sorts first. Drives the default finding order
 * (severity desc, then confidence desc).
 */
export const LEVEL_RANK: Record<FindingLevel, number> = {
  error: 3,
  warning: 2,
  info: 1,
} as const;

export interface ConfidenceThresholdConfig {
  /** Findings with confidence below this are hidden by default. */
  default: number;
  min: number;
  max: number;
  /** Slider granularity for the threshold control. */
  step: number;
}

/**
 * Confidence-threshold filter defaults. `default: 0` shows everything until the
 * user dials up the noise floor; the slider spans the full 0..1 confidence range.
 */
export const CONFIDENCE_THRESHOLD: ConfidenceThresholdConfig = {
  default: 0,
  min: 0,
  max: 1,
  step: 0.05,
} as const;

/** localStorage key under which dismissed-finding identities are persisted. */
export const DISMISSED_STORAGE_KEY = 'surveyor.findings.dismissed.v1';
