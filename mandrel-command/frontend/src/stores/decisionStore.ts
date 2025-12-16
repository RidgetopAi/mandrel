import { create } from 'zustand';
import { TechnicalDecision, DecisionSearchParams, DecisionStats, DecisionSearchResult } from '../components/decisions/types';

interface DecisionState {
  // Data
  decisions: TechnicalDecision[];
  selectedDecisions: string[];
  currentDecision: TechnicalDecision | null;
  relatedDecisions: TechnicalDecision[];
  stats: DecisionStats | null;

  // Search & Filter State
  searchParams: DecisionSearchParams;
  searchResults: DecisionSearchResult | null;

  // UI State
  isLoading: boolean;
  isSearching: boolean;
  error: string | null;
  showDetail: boolean;
  showFilters: boolean;

  // Actions
  setDecisions: (decisions: TechnicalDecision[]) => void;
  setSelectedDecisions: (ids: string[]) => void;
  addSelectedDecision: (id: string) => void;
  removeSelectedDecision: (id: string) => void;
  selectAllDecisions: () => void;
  clearSelection: () => void;
  setCurrentDecision: (decision: TechnicalDecision | null) => void;
  setRelatedDecisions: (decisions: TechnicalDecision[]) => void;
  setStats: (stats: DecisionStats) => void;
  setSearchParams: (params: Partial<DecisionSearchParams>) => void;
  setSearchResults: (results: DecisionSearchResult | null) => void;
  setLoading: (loading: boolean) => void;
  setSearching: (searching: boolean) => void;
  setError: (error: string | null) => void;
  setShowDetail: (show: boolean) => void;
  setShowFilters: (show: boolean) => void;
  clearError: () => void;
  reset: () => void;
}

const initialSearchParams: DecisionSearchParams = {
  limit: 20,
  offset: 0
};

export const useDecisionStore = create<DecisionState>((set, get) => ({
  // Initial state
  decisions: [],
  selectedDecisions: [],
  currentDecision: null,
  relatedDecisions: [],
  stats: null,
  searchParams: initialSearchParams,
  searchResults: null,
  isLoading: false,
  isSearching: false,
  error: null,
  showDetail: false,
  showFilters: false,

  // Actions
  setDecisions: (decisions) => set({ decisions }),
  
  setSelectedDecisions: (ids) => set({ selectedDecisions: ids }),
  
  addSelectedDecision: (id) => set(state => ({
    selectedDecisions: Array.from(new Set([...state.selectedDecisions, id]))
  })),
  
  removeSelectedDecision: (id) => set(state => ({
    selectedDecisions: state.selectedDecisions.filter(selectedId => selectedId !== id)
  })),
  
  selectAllDecisions: () => set(state => ({
    selectedDecisions: state.searchResults?.decisions.map(dec => dec.id) || state.decisions.map(dec => dec.id)
  })),
  
  clearSelection: () => set({ selectedDecisions: [] }),
  
  setCurrentDecision: (decision) => set({ currentDecision: decision }),
  
  setRelatedDecisions: (decisions) => set({ relatedDecisions: decisions }),
  
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
    decisions: [],
    selectedDecisions: [],
    currentDecision: null,
    relatedDecisions: [],
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
export const useDecisionSelection = () => {
  const { selectedDecisions, searchResults, decisions } = useDecisionStore();
  const allDecisions = searchResults?.decisions || decisions;
  
  return {
    selectedDecisions,
    selectedCount: selectedDecisions.length,
    totalCount: allDecisions.length,
    isAllSelected: selectedDecisions.length === allDecisions.length && allDecisions.length > 0,
    isPartiallySelected: selectedDecisions.length > 0 && selectedDecisions.length < allDecisions.length,
    hasSelection: selectedDecisions.length > 0
  };
};

export const useDecisionSearch = () => {
  const store = useDecisionStore();
  
  const isFiltered = () => {
    const params = store.searchParams;
    return !!(
      params.query ||
      params.project_id ||
      params.status ||
      params.created_by ||
      params.date_from ||
      params.date_to
    );
  };
  
  const clearFilters = () => {
    store.setSearchParams(initialSearchParams);
  };
  
  const updateSearchParam = <K extends keyof DecisionSearchParams>(
    key: K,
    value: DecisionSearchParams[K]
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
