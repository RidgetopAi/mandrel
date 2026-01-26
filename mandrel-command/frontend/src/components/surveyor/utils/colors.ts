/**
 * Color constants for Surveyor UI
 * Dark theme color palette
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
    secondary: '#a78bfa', // Purple for AI/analysis features
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

// Node type colors
export const NODE_COLORS = {
  file: COLORS.accent.primary,
  folder: '#8b5cf6',
  function: '#4ade80',
  class: '#a78bfa',
};
