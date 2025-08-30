import apiClient from './api';
import { TechnicalDecision, DecisionSearchParams, DecisionStats, DecisionSearchResult } from '../components/decisions/types';

export class DecisionApi {
  /**
   * Record a new technical decision
   */
  static async recordDecision(decision: {
    title: string;
    problem: string;
    decision: string;
    rationale?: string;
    alternatives?: string[];
  }): Promise<TechnicalDecision> {
    const response = await apiClient.post<{ success: boolean; data: TechnicalDecision }>(
      '/decisions',
      decision
    );

    if (!response.success) {
      throw new Error('Failed to record decision');
    }

    return response.data;
  }

  /**
   * Search decisions with filters and pagination
   */
  static async searchDecisions(params: DecisionSearchParams): Promise<DecisionSearchResult> {
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

    const response = await apiClient.get<{ success: boolean; data: DecisionSearchResult }>(
      `/decisions?${queryParams.toString()}`
    );

    if (!response.success) {
      throw new Error('Failed to search decisions');
    }

    return response.data;
  }

  /**
   * Get single decision by ID
   */
  static async getDecision(id: number): Promise<TechnicalDecision> {
    const response = await apiClient.get<{ success: boolean; data: TechnicalDecision }>(
      `/decisions/${id}`
    );

    if (!response.success) {
      throw new Error('Failed to get decision');
    }

    return response.data;
  }

  /**
   * Update decision
   */
  static async updateDecision(
    id: number, 
    updates: {
      outcome?: string;
      lessons?: string;
      status?: string;
    }
  ): Promise<TechnicalDecision> {
    const response = await apiClient.put<{ success: boolean; data: TechnicalDecision }>(
      `/decisions/${id}`,
      updates
    );

    if (!response.success) {
      throw new Error('Failed to update decision');
    }

    return response.data;
  }

  /**
   * Delete single decision
   */
  static async deleteDecision(id: number): Promise<void> {
    const response = await apiClient.delete<{ success: boolean }>(
      `/decisions/${id}`
    );

    if (!response.success) {
      throw new Error('Failed to delete decision');
    }
  }

  /**
   * Get decision statistics
   */
  static async getDecisionStats(project_id?: string): Promise<DecisionStats> {
    const params = project_id ? `?project_id=${project_id}` : '';
    const response = await apiClient.get<{ success: boolean; data: DecisionStats }>(
      `/decisions/stats${params}`
    );

    if (!response.success) {
      throw new Error('Failed to get decision statistics');
    }

    return response.data;
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
   * Get decision status display name
   */
  static getStatusDisplayName(status: string): string {
    const statusMap: Record<string, string> = {
      proposed: 'Proposed',
      accepted: 'Accepted',
      rejected: 'Rejected',
      superseded: 'Superseded',
      deprecated: 'Deprecated'
    };
    return statusMap[status] || status;
  }

  /**
   * Get decision status color
   */
  static getStatusColor(status: string): string {
    const colorMap: Record<string, string> = {
      proposed: '#1890ff',
      accepted: '#52c41a',
      rejected: '#ff4d4f',
      superseded: '#fa8c16',
      deprecated: '#8c8c8c'
    };
    return colorMap[status] || '#8c8c8c';
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
   * Get decision priority level based on status and age
   */
  static getDecisionPriority(decision: TechnicalDecision): 'high' | 'medium' | 'low' {
    const daysSinceCreated = Math.floor(
      (Date.now() - new Date(decision.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (decision.status === 'proposed' && daysSinceCreated > 30) {
      return 'high';
    }
    if (decision.status === 'accepted' && !decision.outcome) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Format alternatives for display
   */
  static formatAlternatives(alternatives?: string[]): string {
    if (!alternatives || alternatives.length === 0) {
      return 'No alternatives documented';
    }
    return alternatives.map((alt, index) => `${index + 1}. ${alt}`).join('\n');
  }
}

export default DecisionApi;
