/**
 * Surveyor color constants (configs-not-hardcoded).
 *
 * Ported from the surveyor UI's `constants/colors.constants`. The Canvas + node
 * components render against a dark graph surface, so these are self-contained
 * (not the antd theme tokens) — they drive the visualization palette only.
 */

export const COLORS = {
  surface: {
    0: '#0f0f0f',
    1: '#1a1a1a',
    2: '#242424',
    3: '#2e2e2e',
  },
  text: {
    primary: '#e5e5e5',
    secondary: '#a3a3a3',
    muted: '#737373',
  },
  accent: {
    primary: '#60a5fa',
  },
  status: {
    healthy: '#4ade80',
    warning: '#facc15',
    error: '#f87171',
  },
  connection: {
    normal: '#525252',
    highlighted: '#60a5fa',
    circular: '#facc15',
  },
} as const;
