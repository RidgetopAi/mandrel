import apiClient from './api';
import { Context, ContextSearchParams, ContextStats, ContextSearchResult } from '../stores/contextStore';

export class ContextApi {
  /**
   * Search contexts with filters and pagination
   */
  static async searchContexts(params: ContextSearchParams): Promise<ContextSearchResult> {
    // Convert params to query string
    const queryParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          queryParams.set(key, value.join(','));
        } else {
          queryParams.set(key, String(value));
        }
      }
    });

    const response = await apiClient.get<{ success: boolean; data: ContextSearchResult }>(
      `/contexts?${queryParams.toString()}`
    );

    if (!response.success) {
      throw new Error('Failed to search contexts');
    }

    return response.data;
  }

  /**
   * Advanced semantic search
   */
  static async semanticSearch(params: ContextSearchParams): Promise<ContextSearchResult> {
    const response = await apiClient.post<{ success: boolean; data: ContextSearchResult }>(
      '/contexts/search',
      params
    );

    if (!response.success) {
      throw new Error('Failed to perform semantic search');
    }

    return response.data;
  }

  /**
   * Get single context by ID
   */
  static async getContext(id: string): Promise<Context> {
    const response = await apiClient.get<{ success: boolean; data: Context }>(
      `/contexts/${id}`
    );

    if (!response.success) {
      throw new Error('Failed to get context');
    }

    return response.data;
  }

  /**
   * Update context
   */
  static async updateContext(
    id: string, 
    updates: {
      content?: string;
      tags?: string[];
      metadata?: Record<string, any>;
      relevance_score?: number;
    }
  ): Promise<Context> {
    const response = await apiClient.put<{ success: boolean; data: Context }>(
      `/contexts/${id}`,
      updates
    );

    if (!response.success) {
      throw new Error('Failed to update context');
    }

    return response.data;
  }

  /**
   * Delete single context
   */
  static async deleteContext(id: string): Promise<void> {
    const response = await apiClient.delete<{ success: boolean }>(
      `/contexts/${id}`
    );

    if (!response.success) {
      throw new Error('Failed to delete context');
    }
  }

  /**
   * Bulk delete contexts
   */
  static async bulkDeleteContexts(ids: string[]): Promise<{ deleted: number }> {
    const response = await apiClient.delete<{ success: boolean; data: { deleted: number } }>(
      '/contexts/bulk/delete',
      { data: { ids } }
    );

    if (!response.success) {
      throw new Error('Failed to bulk delete contexts');
    }

    return response.data;
  }

  /**
   * Get context statistics
   */
  static async getContextStats(project_id?: string): Promise<ContextStats> {
    const params = project_id ? `?project_id=${project_id}` : '';
    const response = await apiClient.get<{ success: boolean; data: ContextStats }>(
      `/contexts/stats${params}`
    );

    if (!response.success) {
      throw new Error('Failed to get context statistics');
    }

    return response.data;
  }

  /**
   * Export contexts
   */
  static async exportContexts(
    params: ContextSearchParams, 
    format: 'json' | 'csv' = 'json'
  ): Promise<Blob> {
    const queryParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          queryParams.set(key, value.join(','));
        } else {
          queryParams.set(key, String(value));
        }
      }
    });

    queryParams.set('format', format);

    // Use fetch directly for blob response
    const token = localStorage.getItem('aidis_token');
    const response = await fetch(
      `${apiClient.instance.defaults.baseURL}/contexts/export?${queryParams.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to export contexts');
    }

    return response.blob();
  }

  /**
   * Get related contexts
   */
  static async getRelatedContexts(id: string, limit = 5): Promise<Context[]> {
    const response = await apiClient.get<{ success: boolean; data: Context[] }>(
      `/contexts/${id}/related?limit=${limit}`
    );

    if (!response.success) {
      throw new Error('Failed to get related contexts');
    }

    return response.data;
  }

  /**
   * Download exported file
   */
  static downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  /**
   * Format date for API
   */
  static formatDate(date: Date): string {
    return date.toISOString();
  }

  /**
   * Parse date from API
   */
  static parseDate(dateString: string): Date {
    return new Date(dateString);
  }

  /**
   * Get context type display name
   */
  static getTypeDisplayName(type: string): string {
    const typeMap: Record<string, string> = {
      code: 'Code',
      decision: 'Decision',
      error: 'Error',
      discussion: 'Discussion',
      planning: 'Planning',
      completion: 'Completion'
    };
    return typeMap[type] || type;
  }

  /**
   * Get context type color
   */
  static getTypeColor(type: string): string {
    const colorMap: Record<string, string> = {
      code: '#1890ff',
      decision: '#722ed1',
      error: '#ff4d4f',
      discussion: '#13c2c2',
      planning: '#52c41a',
      completion: '#fa8c16'
    };
    return colorMap[type] || '#8c8c8c';
  }

  /**
   * Truncate content for preview
   */
  static truncateContent(content: string, maxLength = 150): string {
    if (content.length <= maxLength) {
      return content;
    }
    return content.substring(0, maxLength).trim() + '...';
  }

  /**
   * Highlight search terms in text
   */
  static highlightSearchTerms(text: string, searchTerm?: string): string {
    if (!searchTerm || !searchTerm.trim()) {
      return text;
    }

    const terms = searchTerm.trim().split(/\s+/);
    let highlightedText = text;

    terms.forEach(term => {
      const regex = new RegExp(`(${term})`, 'gi');
      highlightedText = highlightedText.replace(
        regex,
        '<mark style="background-color: #fff3cd; padding: 2px;">$1</mark>'
      );
    });

    return highlightedText;
  }

  /**
   * Format file size
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export default ContextApi;
