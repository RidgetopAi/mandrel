import { create } from 'zustand';
import type {
  Context,
  ContextSearchParams,
  ContextSearchResult,
  ContextStats,
} from '../types/context';

export type { Context, ContextSearchParams, ContextSearchResult, ContextStats } from '../types/context';

interface ContextState {
  // Data
  contexts: Context[];
  selectedContexts: string[];
  currentContext: Context | null;
  relatedContexts: Context[];
  stats: ContextStats | null;
  
  // Search & Filter State
  searchParams: ContextSearchParams;
  searchResults: ContextSearchResult | null;
  
  // UI State
  isLoading: boolean;
  isSearching: boolean;
  error: string | null;
  showDetail: boolean;
  showFilters: boolean;
  
  // Actions
  setContexts: (contexts: Context[]) => void;
  setSelectedContexts: (ids: string[]) => void;
  addSelectedContext: (id: string) => void;
  removeSelectedContext: (id: string) => void;
  selectAllContexts: () => void;
  clearSelection: () => void;
  setCurrentContext: (context: Context | null) => void;
  setRelatedContexts: (contexts: Context[]) => void;
  setStats: (stats: ContextStats) => void;
  setSearchParams: (params: Partial<ContextSearchParams>) => void;
  setSearchResults: (results: ContextSearchResult | null) => void;
  setLoading: (loading: boolean) => void;
  setSearching: (searching: boolean) => void;
  setError: (error: string | null) => void;
  setShowDetail: (show: boolean) => void;
  setShowFilters: (show: boolean) => void;
  clearError: () => void;
  reset: () => void;
}

const initialSearchParams: ContextSearchParams = {
  limit: 20,
  offset: 0,
  sort_by: 'created_at',
  sort_order: 'desc'
};

export const useContextStore = create<ContextState>((set, get) => ({
  // Initial state
  contexts: [],
  selectedContexts: [],
  currentContext: null,
  relatedContexts: [],
  stats: null,
  searchParams: initialSearchParams,
  searchResults: null,
  isLoading: false,
  isSearching: false,
  error: null,
  showDetail: false,
  showFilters: false,

  // Actions
  setContexts: (contexts) => set({ contexts }),
  
  setSelectedContexts: (ids) => set({ selectedContexts: ids }),
  
  addSelectedContext: (id) => set(state => ({
    selectedContexts: Array.from(new Set([...state.selectedContexts, id]))
  })),
  
  removeSelectedContext: (id) => set(state => ({
    selectedContexts: state.selectedContexts.filter(selectedId => selectedId !== id)
  })),
  
  selectAllContexts: () => set(state => ({
    selectedContexts: state.searchResults?.contexts.map(ctx => ctx.id) || state.contexts.map(ctx => ctx.id)
  })),
  
  clearSelection: () => set({ selectedContexts: [] }),
  
  setCurrentContext: (context) => set({ currentContext: context }),
  
  setRelatedContexts: (contexts) => set({ relatedContexts: contexts }),
  
  setStats: (stats) => set({ stats }),
  
  setSearchParams: (params) => set(state => ({
    searchParams: { ...state.searchParams, ...params }
  })),
  
  setSearchResults: (results) => set({ searchResults: results }),
  
  setLoading: (loading) => set({ isLoading: loading }),
  
  setSearching: (searching) => set({ isSearching: searching }),
  
  setError: (error) => set({ error }),
  
  setShowDetail: (show) => set({ showDetail: show }),
  
  setShowFilters: (show) => set({ showFilters: show }),
  
  clearError: () => set({ error: null }),
  
  reset: () => set({
    contexts: [],
    selectedContexts: [],
    currentContext: null,
    relatedContexts: [],
    stats: null,
    searchParams: initialSearchParams,
    searchResults: null,
    isLoading: false,
    isSearching: false,
    error: null,
    showDetail: false,
    showFilters: false
  })
}));

// Computed values and helper hooks
export const useContextSelection = () => {
  const { selectedContexts, searchResults, contexts } = useContextStore();
  const allContexts = searchResults?.contexts || contexts;
  
  return {
    selectedContexts,
    selectedCount: selectedContexts.length,
    totalCount: allContexts.length,
    isAllSelected: selectedContexts.length === allContexts.length && allContexts.length > 0,
    isPartiallySelected: selectedContexts.length > 0 && selectedContexts.length < allContexts.length,
    hasSelection: selectedContexts.length > 0
  };
};

export const useContextSearch = () => {
  const store = useContextStore();
  
  const isFiltered = () => {
    const params = store.searchParams;
    return !!(
      params.query ||
      params.type ||
      (params.tags && params.tags.length > 0) ||
      params.date_from ||
      params.date_to
    );
  };
  
  const clearFilters = () => {
    store.setSearchParams(initialSearchParams);
  };
  
  const updateSearchParam = <K extends keyof ContextSearchParams>(
    key: K,
    value: ContextSearchParams[K]
  ) => {
    store.setSearchParams({ [key]: value });
  };
  
  return {
    ...store,
    isFiltered: isFiltered(),
    clearFilters,
    updateSearchParam
  };
};
