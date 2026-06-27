/**
 * Surveyor UI state store (Zustand) — the active canvas view.
 *
 * Values are the canonical `ViewId`s and are passed straight to `buildGraph`,
 * so this store IS the source of truth for which view strategy renders. The
 * Canvas + ViewToggle read it; nothing else in the command-UI touches it.
 */

import { create } from 'zustand';
import type { ViewId } from '../config/view.config';

export enum ViewMode {
  FileStructure = 'file-structure',
  Dependency = 'dependency',
  DataFlow = 'data-flow',
}

export interface UIState {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

/** The active view as a `ViewId` (what `buildGraph` expects). */
export const viewModeToId = (mode: ViewMode): ViewId => mode as ViewId;

export const useUIStore = create<UIState>((set) => ({
  viewMode: ViewMode.FileStructure,
  setViewMode: (mode) => set({ viewMode: mode }),
}));
