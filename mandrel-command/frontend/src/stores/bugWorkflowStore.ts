/**
 * Bug Workflow Store
 *
 * Zustand store for managing bug workflow UI state.
 *
 * NOTE: SSE is managed by the workflowSSE singleton service, not here.
 * The service updates this store directly when events arrive.
 */

import { create } from 'zustand';
import type {
  BugWorkflow,
  BugWorkflowState,
  InvestigationEvent,
  BugAnalysis,
  ImplementationResult,
} from '../types/workflow';

// Import for cleanup - lazy to avoid circular deps
let workflowSSECleanup: (() => void) | null = null;

/**
 * Register the SSE cleanup function (called by workflowSSE service)
 */
export function registerSSECleanup(cleanup: () => void) {
  workflowSSECleanup = cleanup;
}

interface BugWorkflowUIState {
  // Workflow data
  activeWorkflow: BugWorkflow | null;
  investigationEvents: InvestigationEvent[];

  // UI state
  isSubmitting: boolean;
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;

  // Panel state
  expandedPanels: string[];

  // Actions - Workflow data
  setActiveWorkflow: (workflow: BugWorkflow | null) => void;
  updateWorkflowState: (state: BugWorkflowState) => void;
  setAnalysis: (analysis: BugAnalysis) => void;
  setImplementation: (result: ImplementationResult) => void;

  // Actions - Investigation events
  addInvestigationEvent: (event: InvestigationEvent) => void;
  clearInvestigationEvents: () => void;

  // Actions - UI state
  setSubmitting: (submitting: boolean) => void;
  setLoading: (loading: boolean) => void;
  setStreaming: (streaming: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;

  // Actions - Panel state
  togglePanel: (key: string) => void;
  expandPanel: (key: string) => void;
  collapsePanel: (key: string) => void;
  setExpandedPanels: (keys: string[]) => void;

  // Reset
  reset: () => void;
}

const initialState = {
  activeWorkflow: null,
  investigationEvents: [],
  isSubmitting: false,
  isLoading: false,
  isStreaming: false,
  error: null,
  expandedPanels: ['bug-report'],
};

export const useBugWorkflowStore = create<BugWorkflowUIState>((set, get) => ({
  ...initialState,

  // Workflow data actions
  setActiveWorkflow: (workflow) => set({ activeWorkflow: workflow }),

  updateWorkflowState: (state) =>
    set((s) => ({
      activeWorkflow: s.activeWorkflow
        ? { ...s.activeWorkflow, state, updatedAt: new Date() }
        : null,
    })),

  setAnalysis: (analysis) =>
    set((s) => ({
      activeWorkflow: s.activeWorkflow
        ? { ...s.activeWorkflow, analysis, updatedAt: new Date() }
        : null,
    })),

  setImplementation: (result) =>
    set((s) => ({
      activeWorkflow: s.activeWorkflow
        ? { ...s.activeWorkflow, implementation: result, updatedAt: new Date() }
        : null,
    })),

  // Investigation events actions
  addInvestigationEvent: (event) =>
    set((s) => ({
      investigationEvents: [...s.investigationEvents, event],
    })),

  clearInvestigationEvents: () => set({ investigationEvents: [] }),

  // UI state actions
  setSubmitting: (isSubmitting) => set({ isSubmitting }),
  setLoading: (isLoading) => set({ isLoading }),
  setStreaming: (isStreaming) => set({ isStreaming }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),

  // Panel state actions
  togglePanel: (key) =>
    set((s) => ({
      expandedPanels: s.expandedPanels.includes(key)
        ? s.expandedPanels.filter((k) => k !== key)
        : [...s.expandedPanels, key],
    })),

  expandPanel: (key) =>
    set((s) => ({
      expandedPanels: s.expandedPanels.includes(key)
        ? s.expandedPanels
        : [...s.expandedPanels, key],
    })),

  collapsePanel: (key) =>
    set((s) => ({
      expandedPanels: s.expandedPanels.filter((k) => k !== key),
    })),

  setExpandedPanels: (keys) => set({ expandedPanels: keys }),

  // Reset - also cleanup SSE connections
  reset: () => {
    // Cleanup SSE connections if registered
    if (workflowSSECleanup) {
      workflowSSECleanup();
    }
    set(initialState);
  },
}));

// Selector hooks for common computed values
export const useActiveWorkflowState = () =>
  useBugWorkflowStore((s) => s.activeWorkflow?.state);

export const useIsWorkflowActive = () =>
  useBugWorkflowStore((s) => s.activeWorkflow !== null);

export const useWorkflowAnalysis = () =>
  useBugWorkflowStore((s) => s.activeWorkflow?.analysis);

export const useWorkflowImplementation = () =>
  useBugWorkflowStore((s) => s.activeWorkflow?.implementation);
