import { create } from 'zustand';

interface EmbeddingState {
  selectedDatasetId: string | null;
  activeTab: string;
  heatmapSize: { rows: number; cols: number };

  setSelectedDatasetId: (datasetId: string | null) => void;
  setActiveTab: (tab: string) => void;
  updateHeatmapSize: (size: { rows: number; cols: number }) => void;
}

export const useEmbeddingStore = create<EmbeddingState>((set) => ({
  selectedDatasetId: null,
  activeTab: 'heatmap',
  heatmapSize: { rows: 50, cols: 50 },

  setSelectedDatasetId: (selectedDatasetId) => set({ selectedDatasetId }),
  setActiveTab: (activeTab) => set({ activeTab }),
  updateHeatmapSize: (heatmapSize) => set({ heatmapSize }),
}));

export default useEmbeddingStore;
